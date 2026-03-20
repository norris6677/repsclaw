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
}
