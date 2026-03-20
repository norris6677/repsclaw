import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { registry, ToolRegistry } from '../registry';
import type {
  ExecutionContext,
  ExecutionLogEntry,
  SequenceResult,
  StepDefinition,
} from '../../types/tool.types';
import { createLogger } from '../../utils/plugin-logger';

const logger = createLogger('REPSCLAW:SEQUENCE');

const StepSchema = z.object({
  tool: z.string(),
  params: z.record(z.any()),
  outputAs: z.string().optional(),
  condition: z.string().optional(),
  onError: z.enum(['abort', 'continue']).default('abort'),
});

const ParametersSchema = z.object({
  description: z.string(),
  steps: z.array(StepSchema).min(1),
});

export const SequenceTool = {
  name: '_sequence',
  description: 'Internal: Execute tools in sequence with context passing',
  parameters: zodToJsonSchema(ParametersSchema),
  metadata: {
    category: 'meta' as const,
    isInternal: true,
    characteristics: {
      isReadOnly: false,
      hasSideEffect: true,
    },
  },
};

export function resolveVariables(
  params: unknown,
  context: Record<string, unknown>
): unknown {
  if (typeof params === 'string' && params.startsWith('$')) {
    const path = params.slice(1);
    return getValueByPath(context, path);
  }
  if (Array.isArray(params)) {
    return params.map((p) => resolveVariables(p, context));
  }
  if (typeof params === 'object' && params !== null) {
    return Object.fromEntries(
      Object.entries(params as Record<string, unknown>).map(([k, v]) => [
        k,
        resolveVariables(v, context),
      ])
    );
  }
  return params;
}

function getValueByPath(obj: unknown, path: string): unknown {
  const parts = path.split(/[.[\]]/).filter(Boolean);
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    if (Array.isArray(current) && !isNaN(Number(part))) {
      current = current[Number(part)];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export function evaluateCondition(
  condition: string,
  context: Record<string, unknown>
): boolean {
  const match = condition.match(
    /\$(\w+(?:\.\w+)*)\s*(===|!==|>|>=|<|<=)\s*(.+)/
  );
  if (!match) return true;

  const [, path, operator, rightStr] = match;
  const left = getValueByPath(context, path);
  const right =
    rightStr.startsWith("'") || rightStr.startsWith('"')
      ? rightStr.slice(1, -1)
      : rightStr === 'true'
      ? true
      : rightStr === 'false'
      ? false
      : Number(rightStr);

  switch (operator) {
    case '===':
      return left === right;
    case '!==':
      return left !== right;
    case '>':
      return Number(left) > Number(right);
    case '>=':
      return Number(left) >= Number(right);
    case '<':
      return Number(left) < Number(right);
    case '<=':
      return Number(left) <= Number(right);
    default:
      return true;
  }
}

export function createSequenceHandler(registry: ToolRegistry) {
  return async function sequenceHandler(
    args: unknown,
    execContext: ExecutionContext
  ): Promise<SequenceResult> {
    const { description, steps } = ParametersSchema.parse(args);
    const context: Record<string, unknown> = {};
    const executionLog: ExecutionLogEntry[] = [];

    logger.debug('Starting sequence', { description, stepCount: steps.length });

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const startTime = Date.now();

      if (step.condition && !evaluateCondition(step.condition, context)) {
        executionLog.push({
          step: i,
          tool: step.tool,
          duration: 0,
          status: 'skipped',
        });
        continue;
      }

      const resolvedParams = resolveVariables(step.params, context);

      try {
        const result = await registry.execute(
          step.tool,
          resolvedParams,
          execContext
        );

        const duration = Date.now() - startTime;
        executionLog.push({
          step: i,
          tool: step.tool,
          duration,
          status: 'success',
          result,
        });

        if (step.outputAs) {
          context[step.outputAs] = result;
        }

        logger.debug(`Step ${i} completed`, { tool: step.tool, duration });
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMsg = error instanceof Error ? error.message : String(error);

        executionLog.push({
          step: i,
          tool: step.tool,
          duration,
          status: 'error',
          error: errorMsg,
        });

        logger.error(`Step ${i} failed`, { tool: step.tool, error: errorMsg });

        if (step.onError === 'abort') {
          return {
            status: 'error',
            failedAtStep: i,
            error: errorMsg,
            executionLog,
            summary: buildSummary(executionLog),
          };
        }
      }
    }

    return {
      status: 'success',
      description,
      stepCount: steps.length,
      executionLog,
      summary: buildSummary(executionLog),
      finalContext: context,
    };
  };
}

function buildSummary(
  log: Array<{ step: number; status: string; duration: number }>
): string {
  const successCount = log.filter((l) => l.status === 'success').length;
  const totalDuration = log.reduce((sum, l) => sum + l.duration, 0);
  return `${successCount}/${log.length} steps succeeded in ${totalDuration}ms`;
}
