import type {
  ToolDefinition,
  ExecutionContext,
  SequenceResult,
} from '../types/tool.types';

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private metaTools = new Map<string, ToolDefinition>();
  private maxCallDepth = 5;
  private defaultMaxConcurrent = 3;

  register(tool: ToolDefinition, isMeta = false): void {
    if (isMeta) {
      this.metaTools.set(tool.name, tool);
    } else {
      this.tools.set(tool.name, tool);
    }
  }

  getTool(name: string, isMeta = false): ToolDefinition | undefined {
    return isMeta ? this.metaTools.get(name) : this.tools.get(name);
  }

  getAllTools(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  getMetaTools(): ToolDefinition[] {
    return [...this.metaTools.values()];
  }

  getByCategory(category: string): ToolDefinition[] {
    return this.getAllTools().filter((t) => t.metadata.category === category);
  }

  getSuggestedNextTools(
    toolName: string
  ): Array<{ tool: string; reason: string }> {
    const tool = this.getTool(toolName);
    return (
      tool?.metadata.composition?.after?.map((a) => ({
        tool: a.tool,
        reason: a.reason,
      })) || []
    );
  }

  async execute(
    name: string,
    args: unknown,
    context: ExecutionContext,
    isMeta = false
  ): Promise<unknown> {
    const tool = this.getTool(name, isMeta);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }

    // Circular dependency check
    if (context.callStack.includes(name)) {
      throw new Error(
        `Circular dependency detected: ${[...context.callStack, name].join(
          ' -> '
        )}`
      );
    }

    if (context.callStack.length >= this.maxCallDepth) {
      throw new Error(
        `Max call depth exceeded: ${context.callStack.join(' -> ')} > ${name}`
      );
    }

    if (context.currentConcurrent >= context.maxConcurrent) {
      throw new Error(`Max concurrent calls reached: ${context.maxConcurrent}`);
    }

    const newContext: ExecutionContext = {
      ...context,
      callStack: [...context.callStack, name],
      currentConcurrent: context.currentConcurrent + 1,
    };

    try {
      return await tool.handler(args, newContext);
    } finally {
      newContext.currentConcurrent--;
    }
  }

  createContext(): ExecutionContext {
    return {
      executionId: Math.random().toString(36).substring(2, 15),
      callStack: [],
      maxConcurrent: this.defaultMaxConcurrent,
      currentConcurrent: 0,
    };
  }

  generateManifest(): {
    total: number;
    byCategory: Record<string, ToolDefinition[]>;
    commonChains: string[][];
  } {
    const allTools = this.getAllTools();
    const byCategory: Record<string, ToolDefinition[]> = {};

    for (const tool of allTools) {
      const cat = tool.metadata.category;
      if (!byCategory[cat]) {
        byCategory[cat] = [];
      }
      byCategory[cat].push(tool);
    }

    const chains: string[][] = [];
    for (const tool of allTools) {
      const after = tool.metadata.composition?.after;
      if (after) {
        for (const next of after) {
          chains.push([tool.name, next.tool]);
        }
      }
    }

    return {
      total: allTools.length,
      byCategory,
      commonChains: chains,
    };
  }
}

export const registry = new ToolRegistry();
