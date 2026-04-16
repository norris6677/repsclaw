/**
 * Anti-Crawl Utilities
 * 反爬机制工具集
 *
 * 提供以下功能：
 * 1. User-Agent 轮换
 * 2. 请求延迟/速率限制
 * 3. 重试机制（指数退避）
 * 4. 响应码智能处理
 * 5. 请求指纹随机化
 */

import { createLogger } from './plugin-logger';

const logger = createLogger('REPSCLAW:ANTI-CRAWL');

/**
 * User-Agent 列表（定期更新）
 */
export const USER_AGENTS = [
  // Chrome on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.0',
  // Chrome on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.0',
  // Firefox
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0',
  // Safari
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  // Edge
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.0 Edg/124.0.0.0',
];

/**
 * 反爬配置接口
 */
export interface AntiCrawlConfig {
  /** 启用 User-Agent 轮换 */
  rotateUserAgent?: boolean;
  /** 启用请求延迟 */
  enableDelay?: boolean;
  /** 基础延迟时间（毫秒） */
  baseDelayMs?: number;
  /** 延迟随机波动范围（毫秒） */
  delayJitterMs?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 基础重试延迟（毫秒，指数退避） */
  retryBaseDelayMs?: number;
  /** 最大重试延迟（毫秒） */
  retryMaxDelayMs?: number;
  /** 需要重试的 HTTP 状态码 */
  retryStatusCodes?: number[];
  /** 启用请求指纹随机化 */
  randomizeFingerprint?: boolean;
  /** 自定义请求头 */
  customHeaders?: Record<string, string>;
}

/**
 * 默认反爬配置
 */
export const DEFAULT_ANTI_CRAWL_CONFIG: Required<AntiCrawlConfig> = {
  rotateUserAgent: true,
  enableDelay: true,
  baseDelayMs: 1000,
  delayJitterMs: 500,
  maxRetries: 3,
  retryBaseDelayMs: 2000,
  retryMaxDelayMs: 30000,
  retryStatusCodes: [429, 503, 502, 500, 408, 403],
  randomizeFingerprint: true,
  customHeaders: {},
};

/**
 * 获取随机 User-Agent
 */
export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * 生成随机延迟时间
 */
export function calculateDelay(baseMs: number, jitterMs: number): number {
  const jitter = Math.random() * jitterMs;
  return baseMs + jitter;
}

/**
 * 计算指数退避延迟
 */
export function calculateExponentialBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 1000; // 添加随机抖动
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * 休眠指定时间
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 生成随机请求头
 */
export function generateRandomHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const acceptLanguages = [
    'zh-CN,zh;q=0.9,en;q=0.8',
    'en-US,en;q=0.9,zh-CN;q=0.8',
    'zh-CN,zh;q=0.9',
    'en-US,en;q=0.9',
  ];

  const headers: Record<string, string> = {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': acceptLanguages[Math.floor(Math.random() * acceptLanguages.length)],
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    ...customHeaders,
  };

  return headers;
}

/**
 * 检查是否需要重试
 */
export function shouldRetry(
  error: unknown,
  statusCode: number | undefined,
  retryStatusCodes: number[]
): boolean {
  // 网络错误（无状态码）通常可以重试
  if (!statusCode) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const retryableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ENOTFOUND',
      'EAI_AGAIN',
      'socket hang up',
      'timeout',
      'network',
    ];
    return retryableErrors.some(e => errorMessage.toLowerCase().includes(e.toLowerCase()));
  }

  // 检查状态码是否在重试列表中
  return retryStatusCodes.includes(statusCode);
}

/**
 * 重试包装器
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<AntiCrawlConfig> = {}
): Promise<T> {
  const fullConfig = { ...DEFAULT_ANTI_CRAWL_CONFIG, ...config };
  const { maxRetries, retryBaseDelayMs, retryMaxDelayMs, retryStatusCodes } = fullConfig;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (attempt > 0) {
        logger.info(`Request succeeded after ${attempt} retries`);
      }
      return result;
    } catch (error) {
      lastError = error;

      // 检查是否是可重试的错误
      const statusCode = (error as { response?: { status?: number } })?.response?.status;

      if (attempt < maxRetries && shouldRetry(error, statusCode, retryStatusCodes)) {
        const delay = calculateExponentialBackoff(attempt, retryBaseDelayMs, retryMaxDelayMs);
        logger.warn(`Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`, {
          error: error instanceof Error ? error.message : String(error),
          statusCode,
        });
        await sleep(delay);
      } else {
        // 不可重试或已达最大重试次数
        throw error;
      }
    }
  }

  throw lastError;
}

/**
 * 延迟包装器
 */
export async function withDelay<T>(
  fn: () => Promise<T>,
  config: Partial<AntiCrawlConfig> = {}
): Promise<T> {
  const fullConfig = { ...DEFAULT_ANTI_CRAWL_CONFIG, ...config };
  const { enableDelay, baseDelayMs, delayJitterMs } = fullConfig;

  if (enableDelay) {
    const delay = calculateDelay(baseDelayMs, delayJitterMs);
    logger.debug(`Applying delay of ${delay}ms`);
    await sleep(delay);
  }

  return fn();
}

/**
 * 组合包装器：延迟 + 重试
 */
export async function withAntiCrawlProtection<T>(
  fn: () => Promise<T>,
  config: Partial<AntiCrawlConfig> = {}
): Promise<T> {
  return withRetry(
    () => withDelay(fn, config),
    config
  );
}

/**
 * 反爬管理器类
 * 用于管理多个域名/来源的反爬策略
 */
export class AntiCrawlManager {
  private domainLastRequest: Map<string, number> = new Map();
  private config: Required<AntiCrawlConfig>;

  constructor(config: Partial<AntiCrawlConfig> = {}) {
    this.config = { ...DEFAULT_ANTI_CRAWL_CONFIG, ...config };
  }

  /**
   * 获取域名特定的延迟
   */
  async applyDomainDelay(domain: string): Promise<void> {
    if (!this.config.enableDelay) {
      return;
    }

    const lastRequest = this.domainLastRequest.get(domain);
    if (lastRequest) {
      const elapsed = Date.now() - lastRequest;
      const requiredDelay = this.config.baseDelayMs + Math.random() * this.config.delayJitterMs;

      if (elapsed < requiredDelay) {
        const waitTime = requiredDelay - elapsed;
        logger.debug(`Domain ${domain} rate limit: waiting ${waitTime}ms`);
        await sleep(waitTime);
      }
    }

    this.domainLastRequest.set(domain, Date.now());
  }

  /**
   * 执行带反爬保护的请求
   */
  async execute<T>(
    domain: string,
    fn: () => Promise<T>
  ): Promise<T> {
    await this.applyDomainDelay(domain);

    return withRetry(async () => {
      return fn();
    }, this.config);
  }

  /**
   * 获取随机请求头
   */
  getRandomHeaders(): Record<string, string> {
    if (!this.config.rotateUserAgent) {
      return this.config.customHeaders;
    }
    return generateRandomHeaders(this.config.customHeaders);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AntiCrawlConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): Required<AntiCrawlConfig> {
    return { ...this.config };
  }

  /**
   * 重置域名状态
   */
  resetDomain(domain: string): void {
    this.domainLastRequest.delete(domain);
  }

  /**
   * 重置所有域名状态
   */
  resetAll(): void {
    this.domainLastRequest.clear();
  }
}

/**
 * 创建全局反爬管理器实例
 */
let globalAntiCrawlManager: AntiCrawlManager | null = null;

export function getGlobalAntiCrawlManager(config?: Partial<AntiCrawlConfig>): AntiCrawlManager {
  if (!globalAntiCrawlManager) {
    globalAntiCrawlManager = new AntiCrawlManager(config);
  }
  return globalAntiCrawlManager;
}

export function resetGlobalAntiCrawlManager(): void {
  globalAntiCrawlManager = null;
}
