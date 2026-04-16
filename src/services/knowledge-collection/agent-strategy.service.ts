/**
 * Agent Strategy Service
 * 使用 LLM 为 Collection Subagent 生成搜索策略
 */

import type { LLMClient } from '../llm-client';
import type { CollectionStrategy } from '../../types/knowledge-collection.types';
import { createLogger } from '../../utils/plugin-logger';

const logger = createLogger('REPSCLAW:AGENT-STRATEGY');

export interface SearchStrategy {
  queries: string[];
  maxResultsPerSource: number;
  estimatedDurationMinutes: number;
  antiCrawlAdvice: {
    minDelayMs: number;
    maxDelayMs: number;
    maxConcurrency: number;
    recommendedPagesPerQuery: number;
  };
}

export class AgentStrategyService {
  private llmClient: LLMClient;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  /**
   * 生成搜索策略
   */
  async generateSearchStrategy(params: {
    hospitalName: string;
    departmentName?: string;
    doctorName?: string;
    days?: number;
  }): Promise<SearchStrategy> {
    const { hospitalName, departmentName, doctorName, days = 7 } = params;

    const target = doctorName
      ? `${hospitalName} ${departmentName || ''} ${doctorName}`
      : departmentName
        ? `${hospitalName} ${departmentName}`
        : hospitalName;

    const prompt = `你是一位医疗信息采集团队的策略分析师。请为以下目标生成中文搜索关键词和采集策略。

采集目标：${target}
时间范围：最近 ${days} 天

请返回严格的 JSON 格式（不要包含 markdown 代码块标记）：
{
  "queries": ["关键词1", "关键词2", ...],
  "maxResultsPerSource": 50,
  "estimatedDurationMinutes": 15,
  "antiCrawlAdvice": {
    "minDelayMs": 3000,
    "maxDelayMs": 8000,
    "maxConcurrency": 2,
    "recommendedPagesPerQuery": 3
  }
}

要求：
1. queries 数量在 8-15 个之间，覆盖医院新闻、科室动态、学术会议、设备采购、人事变动、科研进展等维度
2. 关键词应针对中文搜索引擎（百度新闻、搜狗微信）优化
3. antiCrawlAdvice 应根据目标医院的知名度和反爬强度给出合理建议（知名三甲医院建议更保守的延迟）
4. 只返回 JSON，不要有其他说明文字`;

    try {
      const response = await this.llmClient.call({
        messages: [
          { role: 'system', content: '你是一个专业的医疗信息采集策略生成器，只输出严格格式的 JSON。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      const strategy = JSON.parse(jsonStr) as SearchStrategy;

      // 校验和清理
      strategy.queries = strategy.queries
        .map(q => q.trim())
        .filter(q => q.length > 0)
        .slice(0, 15);

      if (strategy.queries.length < 3) {
        // Fallback：使用默认 queries
        strategy.queries = this.buildFallbackQueries(hospitalName, departmentName, doctorName);
      }

      logger.info('Generated search strategy via LLM', {
        target,
        queryCount: strategy.queries.length,
      });

      return strategy;
    } catch (error) {
      logger.error('Failed to generate search strategy via LLM', { error });
      return {
        queries: this.buildFallbackQueries(hospitalName, departmentName, doctorName),
        maxResultsPerSource: 50,
        estimatedDurationMinutes: 15,
        antiCrawlAdvice: {
          minDelayMs: 3000,
          maxDelayMs: 8000,
          maxConcurrency: 2,
          recommendedPagesPerQuery: 3,
        },
      };
    }
  }

  /**
   * 将 LLM 建议转换为 CollectionStrategy 覆盖项
   */
  strategyFromAdvice(advice: SearchStrategy['antiCrawlAdvice']): Partial<CollectionStrategy> {
    return {
      minDelay: advice.minDelayMs,
      maxDelay: advice.maxDelayMs,
      maxConcurrency: advice.maxConcurrency,
    };
  }

  private buildFallbackQueries(
    hospitalName: string,
    departmentName?: string,
    doctorName?: string
  ): string[] {
    const base = doctorName
      ? `${hospitalName} ${doctorName}`
      : departmentName
        ? `${hospitalName} ${departmentName}`
        : hospitalName;

    return [
      `${base}`,
      `${base} 新闻`,
      `${base} 学术`,
      `${base} 会议`,
      `${base} 科研`,
      `${base} 设备`,
      `${base} 招聘`,
      `${base} 义诊`,
      `${base} 获奖`,
    ];
  }
}
