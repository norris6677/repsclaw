import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolRegistry } from '../registry';
import type { ExecutionContext } from '../../types/tool.types';
import { resolveVariables } from './sequence.tool';
import { createLogger } from '../../utils/plugin-logger';

const logger = createLogger('REPSCLAW:PARALLEL');

const ParametersSchema = z.object({
  description: z.string(),
  tasks: z.array(
    z.object({
      tool: z.string(),
      params: z.record(z.any()),
      outputAs: z.string(),
    })
  ),
  maxConcurrent: z.number().default(3),
});

export const ParallelTool = {
  name: '_parallel',
  description: 'Internal: Execute tools in parallel with concurrency limit',
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

class Semaphore {
  private permits: number;
  private waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  release() {
    this.permits++;
    const next = this.waiters.shift();
    if (next) {
      this.permits--;
      next();
    }
  }
}

export function createParallelHandler(registry: ToolRegistry) {
  return async function parallelHandler(
    args: unknown,
    execContext: ExecutionContext
  ): Promise<unknown> {
    const { description, tasks, maxConcurrent } = ParametersSchema.parse(args);

    const effectiveMax = Math.min(
      maxConcurrent,
      execContext.maxConcurrent,
      tasks.length
    );

    logger.debug('Starting parallel execution', {
      description,
      taskCount: tasks.length,
      maxConcurrent: effectiveMax,
    });

    const results: Record<string, unknown> = {};
    const errors: Array<{ task: string; error: string }> = [];
    const semaphore = new Semaphore(effectiveMax);

    await Promise.all(
      tasks.map(async (task) => {
        await semaphore.acquire();
        try {
          const resolvedParams = resolveVariables(task.params, results);
          const result = await registry.execute(
            task.tool,
            resolvedParams,
            execContext
          );
          results[task.outputAs] = result;
          logger.debug(`Task completed`, { tool: task.tool });
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          errors.push({ task: task.tool, error: errorMsg });
          logger.error(`Task failed`, { tool: task.tool, error: errorMsg });
        } finally {
          semaphore.release();
        }
      })
    );

    if (errors.length > 0) {
      return {
        status: 'error',
        errors,
        partialResults: results,
      };
    }

    return {
      status: 'success',
      description,
      results,
    };
  };
}
