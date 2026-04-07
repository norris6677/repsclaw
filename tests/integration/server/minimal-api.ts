/**
 * Minimal OpenClaw API Implementation
 * Provides just enough API surface for plugin registration without full OpenClaw framework
 */

import { createLogger } from '../../../src/utils/plugin-logger';
import type { MinimalOpenClawAPI, RouteConfig, ToolConfig, HttpHandler } from './test-server.types';
import type { IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import { TextDecoder } from 'util';

const logger = createLogger('REPSCLAW:TEST-SERVER');

export class MinimalOpenClawAPIImpl implements MinimalOpenClawAPI {
  public routes: Map<string, RouteConfig> = new Map();
  public tools: Map<string, ToolConfig> = new Map();

  logger = {
    info: (msg: string, meta?: Record<string, unknown>) => {
      logger.info(msg, meta);
    },
    error: (msg: string, meta?: Record<string, unknown>) => {
      logger.error(msg, meta);
    },
    warn: (msg: string, meta?: Record<string, unknown>) => {
      logger.warn(msg, meta);
    },
    debug: (msg: string, meta?: Record<string, unknown>) => {
      logger.debug(msg, meta);
    },
  };

  registerHttpRoute(config: RouteConfig): void {
    this.routes.set(config.path, config);
    logger.info(`Registered HTTP route: ${config.path}`);
  }

  registerTool(config: ToolConfig): void {
    this.tools.set(config.name, config);
    logger.info(`Registered tool: ${config.name}`);
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const parsedUrl = parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '';

    // Find matching route
    const route = this.routes.get(pathname);
    if (!route) {
      return false;
    }

    try {
      const handled = await route.handler(req, res);
      return handled !== false;
    } catch (error) {
      logger.error(`Error handling request to ${pathname}:`, error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
      return true;
    }
  }

  async executeTool(name: string, args: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool.handler(args);
  }
}

// Singleton instance
let apiInstance: MinimalOpenClawAPIImpl | null = null;

export function getMinimalAPI(): MinimalOpenClawAPIImpl {
  if (!apiInstance) {
    apiInstance = new MinimalOpenClawAPIImpl();
  }
  return apiInstance;
}

export function resetMinimalAPI(): void {
  apiInstance = null;
}
