import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../../../utils/plugin-logger';
import type { ToolDefinition } from '../../../types/tool.types';

const toolLogger = createLogger('REPSCLAW:TOOL');

export const ICD10ParametersSchema = z.object({
  code: z.string().optional().describe("ICD-10 代码 / ICD-10 code (e.g., 'E11')"),
  description: z.string().optional().describe("疾病描述 / Disease description"),
  maxResults: z.number().min(1).max(50).default(10).describe("最大结果数 / Max results"),
}).strict().refine(data => data.code || data.description, {
  message: "必须提供 code 或 description 之一",
});

export type ICD10Parameters = z.infer<typeof ICD10ParametersSchema>;
export const ICD10_TOOL_NAME = 'icd10_lookup';

export const ICD10ToolDefinition = {
  name: ICD10_TOOL_NAME,
  description: "查询 ICD-10 医学编码 / Lookup ICD-10 medical codes\n\n典型场景：\n- 查询疾病对应的 ICD-10 编码\n- 根据编码查询疾病名称\n- 医保、病案管理相关查询",
  parameters: zodToJsonSchema(ICD10ParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
  metadata: {
    category: 'query' as const,
    domain: 'coding',
    triggers: {
      keywords: ['ICD', '编码', 'code', '疾病编码', 'ICD-10'],
      patterns: ['ICD.*编码', '.*编码.*查询'],
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
          reason: '查找该疾病的文献',
          autoSuggest: false,
        },
      ],
      parallelWith: [],
    },
    resultUsage: {
      fields: {
        'data[*].code': 'ICD-10 编码',
        'data[*].description': '疾病描述',
      },
    },
  },
};

export function createICD10Handler(healthAPI: any): ToolDefinition['handler'] {
  return async (args: unknown) => {
    toolLogger.toolCall(ICD10_TOOL_NAME, args);

    try {
      const params = ICD10ParametersSchema.parse(args);
      const result = await healthAPI.lookupICDCode(params);

      toolLogger.toolResult(ICD10_TOOL_NAME, 'success', { code: params.code, description: params.description });
      return {
        status: 'success',
        data: result,
        meta: { source: 'ICD-10', timestamp: new Date().toISOString() },
      };
    } catch (error) {
      toolLogger.error('ICD-10 tool error', error);
      return {
        status: 'error',
        error: {
          code: 'ICD10_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}
