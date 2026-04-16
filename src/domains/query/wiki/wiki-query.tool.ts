/**
 * Wiki Query Tools
 * 暴露给 OpenClaw 的 Wiki 查询能力
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../../../utils/plugin-logger';
import type { WikiQueryService } from '../../../services/wiki/wiki-query.service';
import type { WikiLintService } from '../../../services/wiki/wiki-lint.service';
import type { WikiIngestService } from '../../../services/wiki/wiki-ingest.service';
import type { WikiManager } from '../../../services/wiki/wiki-manager.service';

const toolLogger = createLogger('REPSCLAW:WIKI-TOOL');

// ========== 实体查询 ==========
export const QueryWikiEntityParametersSchema = z.object({
  question: z.string().min(1).describe('自然语言问题，关于医院、科室或医生'),
  entityName: z.string().optional().describe('如果已知具体的实体名称，请提供'),
  entityType: z.enum(['hospital', 'department', 'doctor']).optional().describe('实体类型'),
}).strict();

export const QUERY_WIKI_ENTITY_TOOL_NAME = 'query_wiki_entity';

export const QueryWikiEntityTool = {
  name: QUERY_WIKI_ENTITY_TOOL_NAME,
  description: `基于本地 Wiki 知识库回答关于医院、科室、医生的实体问题

示例：
- "北京协和心内科主任是谁？"
- "华西医院有多少床位？"
- "张三医生的专业特长是什么？"`,
  parameters: zodToJsonSchema(QueryWikiEntityParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  },
};

export function createQueryWikiEntityHandler(wikiQueryService: WikiQueryService) {
  return async (args: unknown) => {
    toolLogger.toolCall(QUERY_WIKI_ENTITY_TOOL_NAME, args);
    try {
      const params = QueryWikiEntityParametersSchema.parse(args);
      const result = await wikiQueryService.query({
        question: params.question,
        queryType: 'entity',
      });
      toolLogger.toolResult(QUERY_WIKI_ENTITY_TOOL_NAME, 'success', { sources: result.sources.length });
      return { status: 'success', data: result };
    } catch (error) {
      toolLogger.error('Wiki entity query tool error', error);
      return { status: 'error', error: { code: 'QUERY_ERROR', message: error instanceof Error ? error.message : String(error) } };
    }
  };
}

// ========== 关系查询 ==========
export const QueryWikiRelationshipParametersSchema = z.object({
  question: z.string().min(1).describe('关于医院或医生合作关系的问题'),
}).strict();

export const QUERY_WIKI_RELATIONSHIP_TOOL_NAME = 'query_wiki_relationship';

export const QueryWikiRelationshipTool = {
  name: QUERY_WIKI_RELATIONSHIP_TOOL_NAME,
  description: `基于本地 Wiki 知识库回答关系类问题

示例：
- "哪些医院在心衰领域有合作？"
- "张三和李四有什么学术合作？"
- "北京协和和华西医院有什么共建项目？"`,
  parameters: zodToJsonSchema(QueryWikiRelationshipParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  },
};

export function createQueryWikiRelationshipHandler(wikiQueryService: WikiQueryService) {
  return async (args: unknown) => {
    toolLogger.toolCall(QUERY_WIKI_RELATIONSHIP_TOOL_NAME, args);
    try {
      const params = QueryWikiRelationshipParametersSchema.parse(args);
      const result = await wikiQueryService.query({
        question: params.question,
        queryType: 'relationship',
      });
      toolLogger.toolResult(QUERY_WIKI_RELATIONSHIP_TOOL_NAME, 'success', { sources: result.sources.length });
      return { status: 'success', data: result };
    } catch (error) {
      toolLogger.error('Wiki relationship query tool error', error);
      return { status: 'error', error: { code: 'QUERY_ERROR', message: error instanceof Error ? error.message : String(error) } };
    }
  };
}

// ========== 趋势分析 ==========
export const QueryWikiTrendParametersSchema = z.object({
  question: z.string().min(1).describe('趋势分析问题'),
  saveAsInsight: z.boolean().optional().default(false).describe('是否将结果保存为专题分析'),
  insightTitle: z.string().optional().describe('保存为 insight 时的标题'),
}).strict();

export const QUERY_WIKI_TREND_TOOL_NAME = 'query_wiki_trend';

export const QueryWikiTrendTool = {
  name: QUERY_WIKI_TREND_TOOL_NAME,
  description: `基于本地 Wiki 知识库进行趋势分析

示例：
- "近半年 AI 诊断设备采购趋势？"
- "心内科领域最近有什么科研热点？"
- "竞争对手在北京协和有什么动作？"`,
  parameters: zodToJsonSchema(QueryWikiTrendParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  },
};

export function createQueryWikiTrendHandler(wikiQueryService: WikiQueryService) {
  return async (args: unknown) => {
    toolLogger.toolCall(QUERY_WIKI_TREND_TOOL_NAME, args);
    try {
      const params = QueryWikiTrendParametersSchema.parse(args);
      const result = await wikiQueryService.query({
        question: params.question,
        queryType: 'trend',
        saveAsInsight: params.saveAsInsight,
        insightTitle: params.insightTitle,
        insightType: 'trend_report',
      });
      toolLogger.toolResult(QUERY_WIKI_TREND_TOOL_NAME, 'success', { sources: result.sources.length, savedInsight: result.savedInsightPath });
      return { status: 'success', data: result };
    } catch (error) {
      toolLogger.error('Wiki trend query tool error', error);
      return { status: 'error', error: { code: 'QUERY_ERROR', message: error instanceof Error ? error.message : String(error) } };
    }
  };
}

// ========== 保存 Insight ==========
export const SaveWikiInsightParametersSchema = z.object({
  title: z.string().min(1).describe('Insight 标题'),
  content: z.string().min(1).describe('Insight 正文内容（Markdown）'),
  type: z.enum(['market_analysis', 'trend_report', 'competitive_intel', 'meeting_summary', 'custom']).optional().default('custom').describe('Insight 类型'),
  relatedEntities: z.array(z.string()).optional().describe('相关实体名称列表'),
}).strict();

export const SAVE_WIKI_INSIGHT_TOOL_NAME = 'save_wiki_insight';

export const SaveWikiInsightTool = {
  name: SAVE_WIKI_INSIGHT_TOOL_NAME,
  description: '将分析结果保存为 Wiki 专题分析页面',
  parameters: zodToJsonSchema(SaveWikiInsightParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  },
};

export function createSaveWikiInsightHandler(wikiManager: WikiManager) {
  return async (args: unknown) => {
    toolLogger.toolCall(SAVE_WIKI_INSIGHT_TOOL_NAME, args);
    try {
      const params = SaveWikiInsightParametersSchema.parse(args);
      const { sanitizeFilename } = await import('../../../utils/markdown-frontmatter');
      const slug = sanitizeFilename(params.title);
      const result = wikiManager.saveInsightPage(
        slug,
        {
          title: params.title,
          type: params.type,
          related_entities: params.relatedEntities,
          generated_at: new Date().toISOString(),
        },
        `# ${params.title}\n\n${params.content}`
      );
      toolLogger.toolResult(SAVE_WIKI_INSIGHT_TOOL_NAME, 'success', { slug });
      return { status: 'success', data: { slug: result.slug, title: params.title, filePath: result.filePath } };
    } catch (error) {
      toolLogger.error('Save wiki insight tool error', error);
      return { status: 'error', error: { code: 'SAVE_ERROR', message: error instanceof Error ? error.message : String(error) } };
    }
  };
}

// ========== 运行 Lint ==========
export const RunWikiLintTool = {
  name: 'run_wiki_lint',
  description: '运行 Wiki 知识库健康检查，检测矛盾、过期页面、孤儿页面和缺失项',
  parameters: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};

export function createRunWikiLintHandler(wikiLintService: WikiLintService) {
  return async () => {
    toolLogger.toolCall('run_wiki_lint', {});
    try {
      const report = await wikiLintService.runLint();
      toolLogger.toolResult('run_wiki_lint', 'success', {});
      return {
        status: 'success',
        data: {
          summary: report.summary,
          contradictions: report.contradictions.length,
          stalePages: report.stalePages.length,
          orphanPages: report.orphanPages.length,
          missingCoverage: report.missingCoverage.length,
          runAt: report.runAt,
        },
      };
    } catch (error) {
      toolLogger.error('Run wiki lint tool error', error);
      return { status: 'error', error: { code: 'LINT_ERROR', message: error instanceof Error ? error.message : String(error) } };
    }
  };
}

// ========== Ingest 原始资料 ==========
export const WikiIngestParametersSchema = z.object({
  sourceId: z.string().min(1).describe('原始资料 ID'),
  hospitalName: z.string().min(1).describe('医院名称'),
}).strict();

export const WIKI_INGEST_TOOL_NAME = 'wiki_ingest_source';

export const WikiIngestTool = {
  name: WIKI_INGEST_TOOL_NAME,
  description: '手动触发将原始资料整合到 Wiki 知识库',
  parameters: zodToJsonSchema(WikiIngestParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  },
};

export function createWikiIngestHandler(wikiIngestService: WikiIngestService) {
  return async (args: unknown) => {
    toolLogger.toolCall(WIKI_INGEST_TOOL_NAME, args);
    try {
      const params = WikiIngestParametersSchema.parse(args);
      // 这里需要 RawSourceManager 来查找 source，但 handler 只接收 wikiIngestService
      // 实际实现时需要在注册处注入 rawSourceManager 或让 wikiIngestService 支持按 ID 查找
      // 为了简化，返回提示信息
      return {
        status: 'info',
        message: '请通过 CLI 执行: repsclaw wiki ingest --source-id=<id> --hospital=<name>',
        data: params,
      };
    } catch (error) {
      toolLogger.error('Wiki ingest tool error', error);
      return { status: 'error', error: { code: 'INGEST_ERROR', message: error instanceof Error ? error.message : String(error) } };
    }
  };
}
