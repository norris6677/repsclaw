import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ClinicalTrialsClient } from '../../../integrations/api/clinical-trials.client';
import { createLogger } from '../../../utils/plugin-logger';
import type { ToolDefinition } from '../../../types/tool.types';

const toolLogger = createLogger('REPSCLAW:TOOL');

export const ClinicalTrialsParametersSchema = z.object({
  condition: z.string().min(1).describe("疾病或医学状况 / Disease or medical condition"),
  status: z.enum(['recruiting', 'completed', 'active', 'not_recruiting', 'all'])
    .default('recruiting')
    .describe("试验状态 / Trial status"),
  phase: z.array(z.enum(['EARLY_PHASE1', 'PHASE1', 'PHASE2', 'PHASE3', 'PHASE4']))
    .optional()
    .describe("试验阶段 / Trial phases"),
  location: z.string().optional().describe("地点 / Location"),
  maxResults: z.number().min(1).max(100).default(10).describe("最大结果数 / Max results"),
  filters: z.object({
    studyType: z.enum(['INTERVENTIONAL', 'OBSERVATIONAL', 'EXPANDED_ACCESS']).optional(),
    hasResults: z.boolean().optional(),
    sponsor: z.string().optional(),
  }).optional().describe("额外筛选 / Additional filters"),
}).strict();

export type ClinicalTrialsParameters = z.infer<typeof ClinicalTrialsParametersSchema>;
export const CLINICAL_TRIALS_TOOL_NAME = 'clinical_trials_search';

export const ClinicalTrialsToolDefinition = {
  name: CLINICAL_TRIALS_TOOL_NAME,
  description: "搜索 ClinicalTrials.gov 临床试验数据库 / Search ClinicalTrials.gov database\n\n典型场景：\n- 查找特定疾病的临床试验\n- 了解新药研发进展\n- 寻找可参与的临床试验",
  parameters: zodToJsonSchema(ClinicalTrialsParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  },
  metadata: {
    category: 'query' as const,
    domain: 'research',
    triggers: {
      keywords: ['临床试验', 'clinical trial', '试验招募', 'phase', '研究'],
      patterns: ['.*试验.*招募', '.*临床.*试验', '新药.*试验'],
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
          reason: '查找相关疾病的学术文献',
          autoSuggest: false,
        },
      ],
      parallelWith: [],
    },
    resultUsage: {
      fields: {
        'data.trials': '试验列表',
        'data.trials[*].nctId': '试验唯一标识',
        'data.trials[*].title': '试验标题',
      },
    },
  },
};

let client: ClinicalTrialsClient | null = null;

function getClient(): ClinicalTrialsClient {
  if (!client) {
    client = new ClinicalTrialsClient({
      source: 'clinical_trials',
      baseUrl: 'https://clinicaltrials.gov/api/v2',
      rateLimit: {
        requestsPerSecond: 5,
        burstSize: 8,
      },
    });
  }
  return client;
}

export async function searchClinicalTrials(params: ClinicalTrialsParameters): Promise<unknown> {
  toolLogger.toolCall(CLINICAL_TRIALS_TOOL_NAME, { condition: params.condition, status: params.status });

  try {
    const client = getClient();
    const result = await client.searchTrials({
      condition: params.condition,
      status: params.status,
      maxResults: params.maxResults,
    });

    if (result.status === 'error') {
      toolLogger.error('ClinicalTrials API error', { error: result.error_message });
      return {
        status: 'error',
        error: {
          code: 'API_ERROR',
          message: result.error_message || '搜索失败',
        },
      };
    }

    let trials = result.data?.trials || [];
    if (params.phase && params.phase.length > 0) {
      trials = trials.filter((trial: any) => {
        const trialPhases = trial.phase || [];
        return params.phase!.some(p => trialPhases.includes(p));
      });
    }

    if (params.location) {
      const locationLower = params.location.toLowerCase();
      trials = trials.filter((trial: any) => {
        return trial.locations.some((loc: any) =>
          loc.city.toLowerCase().includes(locationLower) ||
          loc.state.toLowerCase().includes(locationLower) ||
          loc.country.toLowerCase().includes(locationLower) ||
          loc.facility.toLowerCase().includes(locationLower)
        );
      });
    }

    toolLogger.toolResult(CLINICAL_TRIALS_TOOL_NAME, 'success', {
      condition: params.condition,
      totalResults: trials.length
    });

    return {
      status: 'success',
      data: {
        condition: params.condition,
        search_status: params.status,
        total_results: trials.length,
        trials: trials.slice(0, params.maxResults),
      },
      meta: {
        source: 'ClinicalTrials.gov',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    toolLogger.error('ClinicalTrials API exception', error);
    return {
      status: 'error',
      error: {
        code: 'API_ERROR',
        message: error instanceof Error ? error.message : '未知错误',
      },
    };
  }
}

export function createClinicalTrialsHandler(): ToolDefinition['handler'] {
  return async (args: unknown) => {
    toolLogger.toolCall(CLINICAL_TRIALS_TOOL_NAME, args);

    try {
      const validated = ClinicalTrialsParametersSchema.parse(args);
      toolLogger.debug('参数验证通过', validated);

      const results = await searchClinicalTrials(validated);

      toolLogger.toolResult(
        CLINICAL_TRIALS_TOOL_NAME,
        results.status === 'success' ? 'success' : 'error',
        { hasData: !!results.data }
      );

      return results;
    } catch (error) {
      toolLogger.error('Tool execution error', error);

      if (error instanceof z.ZodError) {
        toolLogger.warn('参数验证失败', error.errors);
        return {
          status: 'error',
          error: {
            code: 'VALIDATION_ERROR',
            message: '参数验证失败',
            details: error.errors,
          },
        };
      }

      return {
        status: 'error',
        error: {
          code: 'TOOL_EXECUTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

import { z } from 'zod';
