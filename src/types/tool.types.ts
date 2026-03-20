/**
 * Tool metadata types for Repsclaw plugin
 */

export interface ToolMetadata {
  category: 'query' | 'subscription' | 'scheduled' | 'analytics' | 'integration' | 'meta' | 'workflow';
  isInternal?: boolean;
  isWorkflow?: boolean;
  domain?: string;

  triggers?: {
    keywords?: string[];
    patterns?: string[];
    intent?: string[];
  };

  composition?: {
    before?: string[];
    after?: Array<{
      tool: string;
      reason: string;
      autoSuggest?: boolean;
      condition?: string;
    }>;
    parallelWith?: string[];
  };

  characteristics?: {
    isReadOnly: boolean;
    hasSideEffect: boolean;
    isLongRunning?: boolean;
    requiresAuth?: boolean;
  };

  resultUsage?: {
    fields?: Record<string, string>;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: unknown;
  handler: (args: unknown, context?: ExecutionContext) => Promise<unknown>;
  metadata: ToolMetadata;
}

export interface ExecutionContext {
  executionId: string;
  callStack: string[];
  maxConcurrent: number;
  currentConcurrent: number;
}

export interface StepDefinition {
  tool: string;
  params: Record<string, unknown>;
  outputAs?: string;
  condition?: string;
  onError?: 'abort' | 'continue';
}

export interface SequenceResult {
  status: 'success' | 'error';
  description?: string;
  stepCount?: number;
  executionLog?: ExecutionLogEntry[];
  summary?: string;
  finalContext?: Record<string, unknown>;
  failedAtStep?: number;
  error?: string;
}

export interface ExecutionLogEntry {
  step: number;
  tool: string;
  duration: number;
  status: 'success' | 'error' | 'skipped';
  result?: unknown;
  error?: string;
}
