/**
 * Test Server Types
 * Type definitions for the virtual test server
 */

import type { IncomingMessage, ServerResponse } from 'http';

export interface HttpRequest {
  url: string;
  method: string;
  headers: Record<string, string | string[]>;
  query: Record<string, string>;
  body?: unknown;
}

export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: unknown;
}

export type HttpHandler = (req: IncomingMessage, res: ServerResponse) => boolean | void | Promise<boolean | void>;

export interface RouteConfig {
  path: string;
  auth?: 'none' | 'gateway' | 'user';
  handler: HttpHandler;
}

export interface ToolConfig {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: unknown) => Promise<unknown>;
}

export interface MinimalOpenClawAPI {
  logger: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    debug: (msg: string, meta?: Record<string, unknown>) => void;
  };
  registerHttpRoute: (config: RouteConfig) => void;
  registerTool: (config: ToolConfig) => void;
  tools?: {
    register: (config: ToolConfig) => void;
  };
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
}

export interface TestServerConfig {
  port: number;
  host: string;
  mode: 'local' | 'virtual';
}
