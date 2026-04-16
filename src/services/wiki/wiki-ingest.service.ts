/**
 * Wiki Ingest Service
 * 从原始资料提取知识并更新 Wiki（Layer 1 → Layer 2）
 */

import type { LLMClient } from '../llm-client';
import { WikiManager } from './wiki-manager.service';
import { createLogger } from '../../utils/plugin-logger';
import { sanitizeFilename } from '../../utils/markdown-frontmatter';
import type { CollectionSourceType } from '../../types/knowledge-collection.types';
import type {
  IngestResult,
  HospitalWikiFrontmatter,
  DepartmentWikiFrontmatter,
  DoctorWikiFrontmatter,
  RelationWikiFrontmatter,
} from './wiki-types';

const logger = createLogger('REPSCLAW:WIKI-INGEST');

export interface IngestInput {
  rawSourceId: string;
  title: string;
  content: string;
  url: string;
  sourceType: CollectionSourceType;
  hospitalName: string;
  departments?: string[];
  doctors?: string[];
  collectedAt: string;
}

interface LLMExtractedUpdates {
  hospitalUpdates?: {
    name: string;
    fieldsToUpdate: Partial<HospitalWikiFrontmatter>;
    reasoning: string;
  };
  departmentUpdates: Array<{
    hospital: string;
    name: string;
    fieldsToUpdate: Partial<DepartmentWikiFrontmatter>;
    reasoning: string;
  }>;
  doctorUpdates: Array<{
    hospital: string;
    name: string;
    fieldsToUpdate: Partial<DoctorWikiFrontmatter>;
    reasoning: string;
  }>;
  newRelations: Array<{
    title: string;
    relation_type: 'collaboration' | 'competition' | 'affiliation' | 'mentorship' | 'other';
    entities: string[];
    description: string;
  }>;
  contradictions: Array<{
    entity: string;
    field: string;
    existingValue: string;
    proposedValue: string;
    confidence: 'high' | 'medium' | 'low';
  }>;
  insightSummary?: string;
}

export class WikiIngestService {
  constructor(
    private wikiManager: WikiManager,
    private llmClient: LLMClient
  ) {}

  async ingest(input: IngestInput): Promise<IngestResult> {
    logger.info('Starting wiki ingest', {
      rawSourceId: input.rawSourceId,
      title: input.title,
      hospital: input.hospitalName,
    });

    try {
      // 1. 读取现有 Wiki 页面作为上下文
      const context = this.buildContext(input);

      // 2. 调用 LLM 提取更新
      const updates = await this.callLLMForExtraction(input, context);

      // 3. 应用更新
      const result = await this.applyUpdates(updates, input);

      // 4. 更新索引和日志
      this.wikiManager.updateIndex({ lastIngestAt: input.collectedAt });
      this.wikiManager.appendLog({
        timestamp: input.collectedAt,
        action: 'ingest',
        description: `录入: ${input.title}`,
        details: {
          rawSourceId: input.rawSourceId,
          url: input.url,
          updatedPages: result.updatedPages.length,
          newPages: result.newPages.length,
          contradictions: result.contradictions.length,
        },
      });

      logger.info('Wiki ingest completed', {
        rawSourceId: input.rawSourceId,
        updated: result.updatedPages.length,
        new: result.newPages.length,
        contradictions: result.contradictions.length,
      });

      return result;
    } catch (error) {
      logger.error('Wiki ingest failed', { rawSourceId: input.rawSourceId, error });
      return {
        success: false,
        updatedPages: [],
        newPages: [],
        contradictions: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 直接从 RawSourceMetadata 触发 ingest 的便捷方法
   */
  async ingestFromRawSource(metadata: {
    id: string;
    title: string;
    url: string;
    sourceType: CollectionSourceType;
    hospitalName: string;
    departments?: string[];
    doctors?: string[];
    collectedAt: string;
    filePath: string;
  }): Promise<IngestResult> {
    // 读取原始内容
    const fs = await import('fs');
    let content = '';
    try {
      const fullContent = fs.readFileSync(metadata.filePath, 'utf-8');
      const { parseFrontmatter } = await import('../../utils/markdown-frontmatter');
      const parsed = parseFrontmatter(fullContent);
      content = parsed.body;
    } catch (err) {
      logger.warn('Failed to read raw source content for ingest', { sourceId: metadata.id, error: err });
      content = '';
    }

    return this.ingest({
      rawSourceId: metadata.id,
      title: metadata.title,
      content,
      url: metadata.url,
      sourceType: metadata.sourceType,
      hospitalName: metadata.hospitalName,
      departments: metadata.departments,
      doctors: metadata.doctors,
      collectedAt: metadata.collectedAt,
    });
  }

  private buildContext(input: IngestInput): string {
    const parts: string[] = [];

    // 医院上下文
    const hospitalPage = this.wikiManager.getHospitalPage(input.hospitalName);
    if (hospitalPage) {
      parts.push(`## 现有医院档案: ${input.hospitalName}\n${JSON.stringify(hospitalPage.frontmatter)}`);
    }

    // 科室上下文
    for (const dept of input.departments || []) {
      const deptPage = this.wikiManager.getDepartmentPage(input.hospitalName, dept);
      if (deptPage) {
        parts.push(`## 现有科室档案: ${input.hospitalName}_${dept}\n${JSON.stringify(deptPage.frontmatter)}`);
      }
    }

    // 医生上下文
    for (const doctor of input.doctors || []) {
      const doctorPage = this.wikiManager.getDoctorPage(input.hospitalName, doctor);
      if (doctorPage) {
        parts.push(`## 现有医生档案: ${input.hospitalName}_${doctor}\n${JSON.stringify(doctorPage.frontmatter)}`);
      }
    }

    return parts.join('\n\n---\n\n');
  }

  private async callLLMForExtraction(
    input: IngestInput,
    context: string
  ): Promise<LLMExtractedUpdates> {
    const systemPrompt = `你是一位医疗知识提取专家。你的任务是从一篇原始资料中提取关键信息，并生成对医院Wiki系统的更新指令。

## 输入格式
- 资料标题、内容、URL
- 已有的相关Wiki页面上下文（如果有）

## 输出要求
你必须返回一个严格有效的 JSON 对象，格式如下：
{
  "hospitalUpdates": {
    "name": "医院全称",
    "fieldsToUpdate": { "type": "三甲医院", "status": "重点客户", ... },
    "reasoning": "更新理由"
  },
  "departmentUpdates": [
    { "hospital": "医院名", "name": "科室名", "fieldsToUpdate": { "dept_head": "张三", ... }, "reasoning": "..." }
  ],
  "doctorUpdates": [
    { "hospital": "医院名", "name": "医生名", "fieldsToUpdate": { "title": "主任医师", ... }, "reasoning": "..." }
  ],
  "newRelations": [
    { "title": "医院合作关系", "relation_type": "collaboration", "entities": ["医院A", "医院B"], "description": "..." }
  ],
  "contradictions": [
    { "entity": "北京协和医院_心内科", "field": "dept_head", "existingValue": "张三", "proposedValue": "李四", "confidence": "high" }
  ],
  "insightSummary": "可选的简短摘要"
}

## 字段说明
- fieldsToUpdate 中的字段应与 frontmatter 结构对应
- hospital: { name, aliases, type, location, rank, status, primary_contact, bed_count, annual_patients, specialties }
- department: { hospital, name, aliases, dept_head, bed_count, staff_count, annual_patients, focus_areas }
- doctor: { name, hospital, department, title, role, specialties, education, contact }
- relation_type 可选: collaboration, competition, affiliation, mentorship, other
- 如果没有某个类型的更新，返回空数组或省略该字段
- 当新信息与现有上下文矛盾时，请在 contradictions 中列出，并用 confidence 标注确信度
- 不要返回任何 JSON 之外的解释文字`;

    const userPrompt = `## 原始资料

**标题**: ${input.title}
**来源类型**: ${input.sourceType}
**URL**: ${input.url}
**关联医院**: ${input.hospitalName}
**关联科室**: ${input.departments?.join(', ') || '无'}
**关联医生**: ${input.doctors?.join(', ') || '无'}

**内容**:
${input.content.substring(0, 8000)}

---

## 现有Wiki上下文

${context || '（无现有档案）'}

请提取更新并返回 JSON。`;

    const response = await this.llmClient.call({
      model: this.llmClient.defaultModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    });

    return this.parseLLMResponse(response);
  }

  private parseLLMResponse(response: string): LLMExtractedUpdates {
    try {
      // 尝试提取 JSON 代码块
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response;

      // 清理可能的额外文本
      const startIdx = jsonStr.indexOf('{');
      const endIdx = jsonStr.lastIndexOf('}');
      if (startIdx === -1 || endIdx === -1) {
        throw new Error('No JSON object found in LLM response');
      }

      const parsed = JSON.parse(jsonStr.substring(startIdx, endIdx + 1));

      return {
        hospitalUpdates: parsed.hospitalUpdates,
        departmentUpdates: parsed.departmentUpdates || [],
        doctorUpdates: parsed.doctorUpdates || [],
        newRelations: parsed.newRelations || [],
        contradictions: parsed.contradictions || [],
        insightSummary: parsed.insightSummary,
      };
    } catch (error) {
      logger.error('Failed to parse LLM extraction response', { response, error });
      // 返回空更新，避免阻塞
      return {
        departmentUpdates: [],
        doctorUpdates: [],
        newRelations: [],
        contradictions: [],
      };
    }
  }

  private async applyUpdates(
    updates: LLMExtractedUpdates,
    input: IngestInput
  ): Promise<IngestResult> {
    const result: IngestResult = {
      success: true,
      updatedPages: [],
      newPages: [],
      contradictions: [],
    };

    // 处理矛盾
    for (const c of updates.contradictions) {
      result.contradictions.push({
        field: `${c.entity}.${c.field}`,
        existing: c.existingValue,
        proposed: c.proposedValue,
        resolution: c.confidence === 'high' ? 'flagged' : 'overridden',
      });
    }

    // 更新医院
    if (updates.hospitalUpdates) {
      const { name, fieldsToUpdate, reasoning } = updates.hospitalUpdates;
      const existing = this.wikiManager.getHospitalPage(name);

      if (!existing) {
        this.wikiManager.saveHospitalPage(name, fieldsToUpdate, `## 基本信息\n\n- **名称**: ${name}\n\n## 来源记录\n- [${input.collectedAt}] ${input.title} ([链接](${input.url}))`);
        result.newPages.push({ category: 'hospitals', slug: this.slugify(name) });
      } else {
        const newBody = this.appendUpdateSection(existing.body, input, reasoning);
        this.wikiManager.saveHospitalPage(name, fieldsToUpdate, newBody);
        result.updatedPages.push({
          category: 'hospitals',
          slug: this.slugify(name),
          changes: Object.keys(fieldsToUpdate),
        });
      }
    }

    // 更新科室
    for (const dept of updates.departmentUpdates) {
      const existing = this.wikiManager.getDepartmentPage(dept.hospital, dept.name);
      if (!existing) {
        this.wikiManager.saveDepartmentPage(
          dept.hospital,
          dept.name,
          dept.fieldsToUpdate,
          `## 科室概况\n\n- **所属医院**: ${dept.hospital}\n- **科室名称**: ${dept.name}\n\n## 来源记录\n- [${input.collectedAt}] ${input.title}`
        );
        result.newPages.push({ category: 'departments', slug: this.slugify(`${dept.hospital}_${dept.name}`) });
      } else {
        this.wikiManager.saveDepartmentPage(dept.hospital, dept.name, dept.fieldsToUpdate, this.appendUpdateSection(existing.body, input, dept.reasoning));
        result.updatedPages.push({
          category: 'departments',
          slug: this.slugify(`${dept.hospital}_${dept.name}`),
          changes: Object.keys(dept.fieldsToUpdate),
        });
      }
    }

    // 更新医生
    for (const doc of updates.doctorUpdates) {
      const existing = this.wikiManager.getDoctorPage(doc.hospital, doc.name);
      if (!existing) {
        this.wikiManager.saveDoctorPage(
          doc.hospital,
          doc.name,
          doc.fieldsToUpdate,
          `## 基本信息\n\n- **姓名**: ${doc.name}\n- **所属医院**: ${doc.hospital}\n\n## 来源记录\n- [${input.collectedAt}] ${input.title}`
        );
        result.newPages.push({ category: 'doctors', slug: this.slugify(`${doc.hospital}_${doc.name}`) });
      } else {
        this.wikiManager.saveDoctorPage(doc.hospital, doc.name, doc.fieldsToUpdate, this.appendUpdateSection(existing.body, input, doc.reasoning));
        result.updatedPages.push({
          category: 'doctors',
          slug: this.slugify(`${doc.hospital}_${doc.name}`),
          changes: Object.keys(doc.fieldsToUpdate),
        });
      }
    }

    // 新建关系
    for (const rel of updates.newRelations) {
      const existing = this.wikiManager.getRelationPage(rel.title);
      if (!existing) {
        this.wikiManager.saveRelationPage(
          rel.title,
          {
            relation_type: rel.relation_type,
            entities: rel.entities,
            description: rel.description,
          },
          `## 关系描述\n\n${rel.description}\n\n## 涉及实体\n\n${rel.entities.map(e => `- ${e}`).join('\n')}\n\n## 来源记录\n- [${input.collectedAt}] ${input.title}`
        );
        result.newPages.push({ category: 'relations', slug: this.slugify(rel.title) });
      } else {
        // 合并 entities 并追加描述
        const mergedEntities = Array.from(new Set([...(existing.frontmatter.entities || []), ...rel.entities]));
        const newBody = this.appendUpdateSection(existing.body, input, `更新关系: ${rel.description}`);
        this.wikiManager.saveRelationPage(rel.title, { entities: mergedEntities, description: rel.description }, newBody);
        result.updatedPages.push({ category: 'relations', slug: this.slugify(rel.title), changes: ['entities', 'description'] });
      }
    }

    // 如果有洞察摘要，尝试创建或更新一个 insight
    if (updates.insightSummary) {
      const insightTitle = `${input.hospitalName} 近期动态`;
      const existingInsight = this.wikiManager.getInsightPage(this.slugify(insightTitle));
      if (!existingInsight) {
        this.wikiManager.saveInsightPage(
          this.slugify(insightTitle),
          { title: insightTitle, type: 'custom', related_entities: [input.hospitalName] },
          `## 动态摘要\n\n- [${input.collectedAt}] ${updates.insightSummary} ([来源](${input.url}))`
        );
        result.newPages.push({ category: 'insights', slug: this.slugify(insightTitle) });
      } else {
        const newBody = this.appendUpdateSection(existingInsight.body, input, updates.insightSummary);
        this.wikiManager.saveInsightPage(this.slugify(insightTitle), {}, newBody);
        result.updatedPages.push({ category: 'insights', slug: this.slugify(insightTitle), changes: ['body'] });
      }
    }

    return result;
  }

  private appendUpdateSection(body: string, input: IngestInput, reasoning: string): string {
    const updateSection = `\n\n## 更新记录\n\n- **[${input.collectedAt.split('T')[0]}]** ${reasoning}\n  - 来源: [${input.title}](${input.url})\n`;
    return body.trim() + updateSection;
  }

  private slugify(name: string): string {
    return sanitizeFilename(name);
  }
}
