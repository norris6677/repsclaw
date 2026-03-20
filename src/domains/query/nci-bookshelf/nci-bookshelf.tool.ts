import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../../../utils/plugin-logger';
import type { ToolDefinition } from '../../../types/tool.types';

const toolLogger = createLogger('REPSCLAW:TOOL');

export const NCIBookshelfParametersSchema = z.object({
  query: z.string().min(1).describe("搜索关键词 / Search query"),
  maxResults: z.number().min(1).max(50).default(10).describe("最大结果数 / Max results"),
}).strict();

export type NCIBookshelfParameters = z.infer<typeof NCIBookshelfParametersSchema>;
export const NCI_BOOKSHELF_TOOL_NAME = 'nci_bookshelf_search';

export const NCIBookshelfToolDefinition = {
  name: NCI_BOOKSHELF_TOOL_NAME,
  description: "搜索 NCBI Bookshelf 医学书籍 / Search NCBI Bookshelf medical books\n\n典型场景：\n- 查找权威医学教科书内容\n- 获取疾病综述信息\n- 学习基础医学知识\n\n特点：内容由NIH精选，质量高，适合系统学习",
  parameters: zodToJsonSchema(NCIBookshelfParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
  metadata: {
    category: 'query' as const,
    domain: 'literature',
    triggers: {
      keywords: ['Bookshelf', '书籍', 'book', '医学书籍', '教科书'],
      patterns: ['.*书籍.*', 'Bookshelf.*', 'NCBI.*书'],
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
          reason: '查找该主题的最新研究文献',
          autoSuggest: false,
        },
      ],
      parallelWith: [],
    },
    resultUsage: {
      fields: {
        'data[*].title': '书籍/章节标题',
        'data[*].authors': '作者',
        'data[*].book': '所属书籍',
      },
    },
  },
};

export function createNCIBookshelfHandler(healthAPI: any): ToolDefinition['handler'] {
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
