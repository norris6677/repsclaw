/**
 * Repsclaw 插件日志系统
 * 提供结构化的日志记录，便于调试和故障排查
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: unknown;
}

/**
 * 日志级别优先级
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * 获取当前日志级别
 * 可通过环境变量 REPSCLAW_LOG_LEVEL 控制
 */
function getCurrentLogLevel(): LogLevel {
  const envLevel = process.env.REPSCLAW_LOG_LEVEL as LogLevel;
  if (envLevel && LOG_LEVEL_PRIORITY[envLevel] !== undefined) {
    return envLevel;
  }
  // 默认 INFO 级别
  return 'INFO';
}

/**
 * 检查是否应该记录该级别的日志
 */
function shouldLog(level: LogLevel): boolean {
  const currentLevel = getCurrentLogLevel();
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
}

/**
 * 格式化日志条目
 */
function formatLog(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.level}] [${entry.component}]`;
  if (entry.data !== undefined) {
    return `${prefix} ${entry.message} ${JSON.stringify(entry.data)}`;
  }
  return `${prefix} ${entry.message}`;
}

/**
 * 输出日志
 */
function outputLog(entry: LogEntry): void {
  const formatted = formatLog(entry);
  
  switch (entry.level) {
    case 'ERROR':
      console.error(formatted);
      break;
    case 'WARN':
      console.warn(formatted);
      break;
    case 'DEBUG':
      console.debug(formatted);
      break;
    default:
      console.log(formatted);
  }
}

/**
 * 创建日志记录器
 */
export function createLogger(component: string) {
  return {
    debug(message: string, data?: unknown): void {
      if (shouldLog('DEBUG')) {
        outputLog({
          timestamp: new Date().toISOString(),
          level: 'DEBUG',
          component,
          message,
          data,
        });
      }
    },

    info(message: string, data?: unknown): void {
      if (shouldLog('INFO')) {
        outputLog({
          timestamp: new Date().toISOString(),
          level: 'INFO',
          component,
          message,
          data,
        });
      }
    },

    warn(message: string, data?: unknown): void {
      if (shouldLog('WARN')) {
        outputLog({
          timestamp: new Date().toISOString(),
          level: 'WARN',
          component,
          message,
          data,
        });
      }
    },

    error(message: string, error?: unknown): void {
      if (shouldLog('ERROR')) {
        const data = error instanceof Error 
          ? { message: error.message, stack: error.stack }
          : error;
        
        outputLog({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          component,
          message,
          data,
        });
      }
    },

    /**
     * 记录插件生命周期事件
     */
    lifecycle(event: 'loading' | 'registering' | 'registered' | 'error', details?: unknown): void {
      this.info(`Lifecycle: ${event}`, details);
    },

    /**
     * 记录 API 调用
     */
    apiCall(method: string, params?: unknown): void {
      this.debug(`API Call: ${method}`, params);
    },

    /**
     * 记录工具调用
     */
    toolCall(toolName: string, params?: unknown): void {
      this.info(`Tool Call: ${toolName}`, params);
    },

    /**
     * 记录工具执行结果
     */
    toolResult(toolName: string, result: 'success' | 'error', details?: unknown): void {
      if (result === 'success') {
        this.info(`Tool Result: ${toolName} - SUCCESS`, details);
      } else {
        this.error(`Tool Result: ${toolName} - ERROR`, details);
      }
    },
  };
}

/**
 * 全局插件日志记录器
 */
export const pluginLogger = createLogger('REPSCLAW');

/**
 * 便捷导出
 */
export default {
  createLogger,
  pluginLogger,
};
