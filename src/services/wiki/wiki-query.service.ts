/**
 * Wiki Query Service
 * 基于本地 Wiki 知识库的智能查询
 */

import type { LLMClient } from '../llm-client';
import { WikiManager } from './wiki-manager.service';
import { createLogger } from '../../utils/plugin-logger';
import { sanitizeFilename } from '../../utils/markdown-frontmatter';
import type { WikiCategory, WikiPage, WikiQueryResult, InsightType } from './wiki-types';

const logger = createLogger('REPSCLAW:WIKI-QUERY');

export interface WikiQueryInput {
  question: string;
  queryType?: 'entity' | 'relationship' | 'trend' | 'general';
  saveAsInsight?: boolean;
  insightTitle?: string;
  insightType?: InsightType;
}

export class WikiQueryService {
  constructor(
    private wikiManager: WikiManager,
    private llmClient: LLMClient
  ) {}

  async query(input: WikiQueryInput): Promise<WikiQueryResult> {
    logger.info('Starting wiki query', { question: input.question, type: input.queryType });

    try {
      // 1. 从问题中提取可能涉及的实体
      const relevantSlugs = this.findRelevantPages(input.question);

      // 2. 读取相关页面
      const pages = this.loadPages(relevantSlugs);

      if (pages.length === 0) {
        return {
          answer: '知识库中暂未找到与该问题相关的档案。请尝试先订阅相关医院或运行知识采集任务。',
          sources: [],
        };
      }

      // 3. 调用 LLM 合成答案
      const answer = await this.synthesizeAnswer(input, pages);

      // 4. 可选保存为 insight
      let savedInsightPath: string | undefined;
      if (input.saveAsInsight && input.insightTitle) {
        const slug = this.slugify(input.insightTitle);
        this.wikiManager.saveInsightPage(
          slug,
          {
            title: input.insightTitle,
            type: input.insightType || 'custom',
            related_entities: pages.map(p => this.extractEntityName(p)),
            generated_at: new Date().toISOString(),
            source_count: pages.length,
          },
          `# ${input.insightTitle}\n\n## 问题\n\n${input.question}\n\n## 答案\n\n${answer}\n\n## 参考来源\n\n${pages.map(p => `- [[${this.extractEntityName(p)}]]`).join('\n')}\n`
        );
        savedInsightPath = `insights/${slug}.md`;
      }

      const result: WikiQueryResult = {
        answer,
        sources: pages.map(p => ({
          category: p.category,
          slug: p.page.slug,
          relevance: 1.0,
        })),
        savedInsightPath,
      };

      // 记录查询日志
      this.wikiManager.appendLog({
        timestamp: new Date().toISOString(),
        action: 'query',
        description: `查询: ${input.question}`,
        details: {
          queryType: input.queryType,
          sources: pages.map(p => `${p.category}:${p.page.slug}`),
          savedInsight: savedInsightPath,
        },
      });

      return result;
    } catch (error) {
      logger.error('Wiki query failed', { question: input.question, error });
      return {
        answer: `查询失败: ${error instanceof Error ? error.message : String(error)}`,
        sources: [],
      };
    }
  }

  /**
   * 基于关键词匹配定位相关页面
   */
  private findRelevantPages(question: string): Array<{ category: WikiCategory; slug: string }> {
    const lowerQuestion = question.toLowerCase();
    const results: Array<{ category: WikiCategory; slug: string; score: number }> = [];
    const seen = new Set<string>();

    const categories: WikiCategory[] = ['hospitals', 'departments', 'doctors', 'relations', 'insights'];

    for (const category of categories) {
      const pages = this.wikiManager.listPages(category);
      for (const page of pages) {
        const key = `${category}:${page.slug}`;
        if (seen.has(key)) continue;

        let score = 0;
        const titleLower = page.title.toLowerCase();

        // 标题匹配得分最高
        if (lowerQuestion.includes(titleLower)) {
          score += 10;
        }
        // 部分匹配
        if (titleLower.split('_').some(part => part.length > 1 && lowerQuestion.includes(part))) {
          score += 5;
        }

        if (score > 0) {
          results.push({ category, slug: page.slug, score });
          seen.add(key);
        }
      }
    }

    // 如果没有直接匹配，进行全文搜索补充
    if (results.length < 3) {
      const searchResults = this.wikiManager.searchPages(question);
      for (const page of searchResults) {
        // 推断 category 从 filePath
        const category = this.inferCategoryFromPath(page.filePath);
        const key = `${category}:${page.slug}`;
        if (seen.has(key)) continue;
        results.push({ category, slug: page.slug, score: 2 });
        seen.add(key);
      }
    }

    // 按得分排序，取前 10
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(r => ({ category: r.category, slug: r.slug }));
  }

  private loadPages(
    slugs: Array<{ category: WikiCategory; slug: string }>
  ): Array<{ category: WikiCategory; page: WikiPage }> {
    const pages: Array<{ category: WikiCategory; page: WikiPage }> = [];
    for (const { category, slug } of slugs) {
      const page = this.wikiManager.getPage(category, slug);
      if (page) {
        pages.push({ category, page });
      }
    }
    return pages;
  }

  private async synthesizeAnswer(input: WikiQueryInput, pages: Array<{ category: WikiCategory; page: WikiPage }>): Promise<string> {
    const contextParts = pages.map(p => {
      return `## ${p.category.toUpperCase()}: ${this.extractEntityName(p.page)}\n${JSON.stringify(p.page.frontmatter)}\n\n${p.page.body.substring(0, 2000)}`;
    });

    const systemPrompt = `你是一位医疗客户知识管理助手。你的任务是基于提供的 Wiki 页面内容，准确回答用户的问题。

## 规则
1. 只基于提供的 Wiki 页面内容作答，不要编造信息。
2. 如果信息不足，明确说明"知识库中暂无相关信息"。
3. 答案中适当引用来源页面（使用 [[页面名称]] 格式）。
4. 保持简洁、专业。`;

    const userPrompt = `## 用户问题\n${input.question}\n\n## 相关 Wiki 页面\n\n${contextParts.join('\n\n---\n\n')}\n\n请基于以上内容回答问题。`;

    return this.llmClient.call({
      model: this.llmClient.defaultModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    });
  }

  private extractEntityName(page: WikiPage): string {
    const fm = page.frontmatter as any;
    if (fm.name && fm.hospital) {
      return `${fm.hospital}_${fm.name}`;
    }
    return fm.name || fm.title || page.slug;
  }

  private inferCategoryFromPath(filePath: string): WikiCategory {
    if (filePath.includes('/hospitals/')) return 'hospitals';
    if (filePath.includes('/departments/')) return 'departments';
    if (filePath.includes('/doctors/')) return 'doctors';
    if (filePath.includes('/insights/')) return 'insights';
    if (filePath.includes('/relations/')) return 'relations';
    return 'insights';
  }

  private slugify(name: string): string {
    return sanitizeFilename(name);
  }
}
