import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../utils/plugin-logger';

const toolLogger = createLogger('REPSCLAW:TOOL');

export const PubMedParametersSchema = z.object({
  query: z.string().min(1).describe("搜索关键词 / Search query"),
  maxResults: z.number().min(1).max(100).default(10).describe("最大结果数 / Max results"),
  sort: z.enum(['relevance', 'date']).default('relevance').describe("排序方式 / Sort order"),
  dateRange: z.string().optional().describe("日期范围 / Date range (e.g., '2023:2024')"),
  openAccess: z.boolean().default(false).describe("仅开放获取 / Open access only"),
}).strict();

export type PubMedParameters = z.infer<typeof PubMedParametersSchema>;
export const PUBMED_TOOL_NAME = 'pubmed_search';

export const PubMedTool = {
  name: PUBMED_TOOL_NAME,
  description: "搜索 PubMed 医学文献数据库 / Search PubMed medical literature",
  parameters: zodToJsonSchema(PubMedParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createPubMedHandler(healthAPI: any) {
  return async (args: unknown) => {
    toolLogger.toolCall(PUBMED_TOOL_NAME, args);

    try {
      const params = PubMedParametersSchema.parse(args);
      const result = await healthAPI.searchPubMed(params);

      toolLogger.toolResult(PUBMED_TOOL_NAME, 'success', { query: params.query, count: result?.length || 0 });
      return {
        status: 'success',
        data: result,
        meta: { source: 'PubMed', timestamp: new Date().toISOString() },
      };
    } catch (error) {
      toolLogger.error('PubMed tool error', error);
      return {
        status: 'error',
        error: {
          code: 'PUBMED_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}
