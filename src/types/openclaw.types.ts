/**
 * OpenClaw API 类型定义
 */

export interface OpenClawAPI {
  logger: {
    info: (msg: string) => void;
    debug: (msg: string) => void;
    error: (msg: string) => void;
  };
  registerHttpRoute: (route: {
    path: string;
    auth: string;
    handler: (
      req: unknown,
      res: { statusCode: number; end: (data: string) => void }
    ) => boolean | Promise<boolean>;
  }) => void;
  registerTool?: (toolConfig: {
    name: string;
    description: string;
    parameters: unknown;
    handler: (args: unknown) => Promise<unknown>;
    strict?: boolean;
  }) => void;
  tools?: {
    register: (toolConfig: {
      name: string;
      description: string;
      parameters: unknown;
      handler: (args: unknown) => Promise<unknown>;
      strict?: boolean;
    }) => void;
  };
  on?: (event: string, handler: (...args: any[]) => void) => void;
  sendMessage?: (message: string) => void;

  // LLM 调用能力
  callLLM?: (options: {
    model?: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    temperature?: number;
    tools?: unknown[];
    tool_choice?: string | { type: string; function?: { name: string } };
  }) => Promise<{ content: string | object; [key: string]: unknown }>;
}
