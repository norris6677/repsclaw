import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../utils/plugin-logger';

const toolLogger = createLogger('REPSCLAW:TOOL');

export const MedRxivParametersSchema = z.object({
  query: z.string().min(1).describe("搜索关键词 / Search query"),
  maxResults: z.number().min(1).max(100).default(10).describe("最大结果数 / Max results"),
  days: z.number().min(1).max(365).optional().describe("最近天数 / Recent days"),
  server: z.enum(['medrxiv', 'biorxiv']).default('medrxiv').describe("服务器 / Server"),
}).strict();

export type MedRxivParameters = z.infer<typeof MedRxivParametersSchema>;
export const MEDRXIV_TOOL_NAME = 'medrxiv_search';

export const MedRxivTool = {
  name: MEDRXIV_TOOL_NAME,
  description: "搜索 medRxiv 医学预印本 / Search medRxiv preprints",
  parameters: zodToJsonSchema(MedRxivParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createMedRxivHandler(healthAPI: any) {
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
