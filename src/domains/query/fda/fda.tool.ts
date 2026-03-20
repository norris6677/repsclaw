import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../../../utils/plugin-logger';
import type { ToolDefinition } from '../../../types/tool.types';

const toolLogger = createLogger('REPSCLAW:TOOL');

export const FDAParametersSchema = z.object({
  drugName: z.string().min(1).describe("药品名称 / Drug name"),
  searchType: z.enum(['general', 'label', 'adverse_events'])
    .default('general')
    .describe("搜索类型 / Search type"),
}).strict();

export type FDAParameters = z.infer<typeof FDAParametersSchema>;
export const FDA_TOOL_NAME = 'fda_drug_search';

export const FDAToolDefinition = {
  name: FDA_TOOL_NAME,
  description: "搜索 FDA 药品信息数据库 / Search FDA drug database\n\n典型场景：\n- 查询药品基本信息、副作用、用药指导\n- 药物相互作用检查\n\n常用后续操作：\n- pubmed_search：查找该药品的临床研究文献",
  parameters: zodToJsonSchema(FDAParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
  metadata: {
    category: 'query' as const,
    domain: 'drug',
    triggers: {
      keywords: ['FDA', '药品', '药物', 'drug', 'medicine', '副作用'],
      patterns: ['查询.*药', '.*药.*信息', 'FDA.*查询'],
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
          reason: '查找该药品的临床研究文献',
          autoSuggest: false,
        },
        {
          tool: 'medrxiv_search',
          reason: '查找该药品的最新研究进展',
          autoSuggest: false,
        },
      ],
      parallelWith: ['pubmed_search'], // 可同时查询文献
    },
    resultUsage: {
      fields: {
        'data.brand_name': '药品商品名',
        'data.generic_name': '药品通用名',
        'data.manufacturer_name': '生产厂家',
      },
    },
  },
};

export function createFDAHandler(healthAPI: any): ToolDefinition['handler'] {
  return async (args: unknown) => {
    toolLogger.toolCall(FDA_TOOL_NAME, args);

    try {
      const params = FDAParametersSchema.parse(args);
      const result = await healthAPI.lookupDrug(params);

      toolLogger.toolResult(FDA_TOOL_NAME, 'success', { drugName: params.drugName });
      return {
        status: 'success',
        data: result,
        meta: { source: 'FDA', timestamp: new Date().toISOString() },
      };
    } catch (error) {
      toolLogger.error('FDA tool error', error);
      return {
        status: 'error',
        error: {
          code: 'FDA_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}
