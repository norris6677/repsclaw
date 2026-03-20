import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../utils/plugin-logger';

const toolLogger = createLogger('REPSCLAW:TOOL');

export const FDAParametersSchema = z.object({
  drugName: z.string().min(1).describe("药品名称 / Drug name"),
  searchType: z.enum(['general', 'label', 'adverse_events'])
    .default('general')
    .describe("搜索类型 / Search type"),
}).strict();

export type FDAParameters = z.infer<typeof FDAParametersSchema>;
export const FDA_TOOL_NAME = 'fda_drug_search';

export const FDATool = {
  name: FDA_TOOL_NAME,
  description: "搜索 FDA 药品信息数据库 / Search FDA drug database",
  parameters: zodToJsonSchema(FDAParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createFDAHandler(healthAPI: any) {
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
