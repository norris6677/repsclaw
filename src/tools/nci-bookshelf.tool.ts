import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../utils/plugin-logger';

const toolLogger = createLogger('REPSCLAW:TOOL');

export const NCIBookshelfParametersSchema = z.object({
  query: z.string().min(1).describe("搜索关键词 / Search query"),
  maxResults: z.number().min(1).max(50).default(10).describe("最大结果数 / Max results"),
}).strict();

export type NCIBookshelfParameters = z.infer<typeof NCIBookshelfParametersSchema>;
export const NCI_BOOKSHELF_TOOL_NAME = 'nci_bookshelf_search';

export const NCIBookshelfTool = {
  name: NCI_BOOKSHELF_TOOL_NAME,
  description: "搜索 NCBI Bookshelf 医学书籍 / Search NCBI Bookshelf medical books",
  parameters: zodToJsonSchema(NCIBookshelfParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createNCIBookshelfHandler(healthAPI: any) {
  return async (args: unknown) => {
    toolLogger.toolCall(NCI_BOOKSHELF_TOOL_NAME, args);

    try {
      const params = NCIBookshelfParametersSchema.parse(args);
      const result = await healthAPI.searchNciBookshelf(params);

      toolLogger.toolResult(NCI_BOOKSHELF_TOOL_NAME, 'success', { query: params.query, count: result?.length || 0 });
      return {
        status: 'success',
        data: result,
        meta: { source: 'NCBI Bookshelf', timestamp: new Date().toISOString() },
      };
    } catch (error) {
      toolLogger.error('NCI Bookshelf tool error', error);
      return {
        status: 'error',
        error: {
          code: 'NCI_BOOKSHELF_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}
