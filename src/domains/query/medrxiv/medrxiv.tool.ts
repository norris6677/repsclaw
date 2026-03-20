import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../../../utils/plugin-logger';
import type { ToolDefinition } from '../../../types/tool.types';

const toolLogger = createLogger('REPSCLAW:TOOL');

export const MedRxivParametersSchema = z.object({
  query: z.string().min(1).describe("搜索关键词 / Search query"),
  maxResults: z.number().min(1).max(100).default(10).describe("最大结果数 / Max results"),
  days: z.number().min(1).max(365).optional().describe("最近天数 / Recent days"),
  server: z.enum(['medrxiv', 'biorxiv']).default('medrxiv').describe("服务器 / Server"),
}).strict();

export type MedRxivParameters = z.infer<typeof MedRxivParametersSchema>;
export const MEDRXIV_TOOL_NAME = 'medrxiv_search';

export const MedRxivToolDefinition = {
  name: MEDRXIV_TOOL_NAME,
  description: "搜索 medRxiv 医学预印本 / Search medRxiv preprints\n\n典型场景：\n- 获取最新医学研究（比正式发表快6-12个月）\n- 查找正在进行的研究\n- 了解研究前沿动态\n\n注意：预印本未经同行评审，结果需谨慎解读",
  parameters: zodToJsonSchema(MedRxivParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
  metadata: {
    category: 'query' as const,
    domain: 'literature',
    triggers: {
      keywords: ['medRxiv', '预印本', 'preprint', '最新研究'],
      patterns: ['.*预印本.*', 'medRxiv.*'],
    },
    characteristics: {
      isReadOnly: true,
      hasSideEffect: false,
    },
    composition: {
      before: [],
      after: [
        {
          tool: 'pubmed_search',
          reason: '查找该主题的正式发表文献',
          autoSuggest: false,
        },
      ],
      parallelWith: ['pubmed_search', 'fda_drug_search'],
    },
    resultUsage: {
      fields: {
        'data[*].title': '预印本标题',
        'data[*].doi': 'DOI标识',
        'data[*].date': '发布日期',
      },
    },
  },
};

export function createMedRxivHandler(healthAPI: any): ToolDefinition['handler'] {
  return async (args: unknown) => {
    toolLogger.toolCall(MEDRXIV_TOOL_NAME, args);

    try {
      const params = MedRxivParametersSchema.parse(args);
      const result = await healthAPI.searchMedRxiv(params);

      toolLogger.toolResult(MEDRXIV_TOOL_NAME, 'success', { query: params.query, count: result?.length || 0 });
      return {
        status: 'success',
        data: result,
        meta: { source: 'medRxiv', timestamp: new Date().toISOString() },
      };
    } catch (error) {
      toolLogger.error('medRxiv tool error', error);
      return {
        status: 'error',
        error: {
          code: 'MEDRXIV_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}
