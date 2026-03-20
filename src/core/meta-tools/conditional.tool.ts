import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolRegistry } from '../registry';
import type { ExecutionContext } from '../../types/tool.types';
import { evaluateCondition, resolveVariables } from './sequence.tool';
import { createLogger } from '../../utils/plugin-logger';

const logger = createLogger('REPSCLAW:CONDITIONAL');

const ParametersSchema = z.object({
  description: z.string(),
  condition: z.string(),
  ifTrue: z.object({
    tool: z.string(),
    params: z.record(z.any()),
  }),
  ifFalse: z
    .object({
      tool: z.string(),
      params: z.record(z.any()),
    })
    .optional(),
});

export const ConditionalTool = {
  name: '_conditional',
  description: 'Internal: Branch execution based on condition',
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

export function createConditionalHandler(registry: ToolRegistry) {
  return async function conditionalHandler(
    args: unknown,
    execContext: ExecutionContext
  ): Promise<unknown> {
    const { description, condition, ifTrue, ifFalse } =
      ParametersSchema.parse(args);

    logger.debug('Evaluating condition', { description, condition });

    const context: Record<string, unknown> = {};
    const conditionMet = evaluateCondition(condition, context);

    logger.debug('Condition result', { condition, met: conditionMet });

    if (conditionMet) {
      const resolvedParams = resolveVariables(ifTrue.params, context);
      return registry.execute(ifTrue.tool, resolvedParams, execContext);
    } else if (ifFalse) {
      const resolvedParams = resolveVariables(ifFalse.params, context);
      return registry.execute(ifFalse.tool, resolvedParams, execContext);
    }

    return {
      status: 'skipped',
      reason: 'condition not met and no else branch',
    };
  };
}
