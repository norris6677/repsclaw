/**
 * 速率限制器 (Rate Limiter)
 * 基于令牌桶算法实现
 */

export interface IRateLimitConfig {
  /** 每秒请求数 */
  requestsPerSecond: number;
  /** 突发请求数 */
  burstSize: number;
}

/**
 * 令牌桶限流器
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefillTime: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(config: IRateLimitConfig) {
    this.maxTokens = config.burstSize;
    this.tokens = config.burstSize;
    this.refillRate = config.requestsPerSecond;
    this.lastRefillTime = Date.now();
  }

  /**
   * 尝试获取一个令牌
   * @returns {boolean} 是否获取成功
   */
  tryAcquire(): boolean {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    
    return false;
  }

  /**
   * 获取令牌，如果失败则等待
   * @returns {Promise<void>}
   */
  async acquire(): Promise<void> {
    while (!this.tryAcquire()) {
      // 计算需要等待的时间
      const waitTime = Math.ceil(1000 / this.refillRate);
      await this.sleep(waitTime);
    }
  }

  /**
   * 补充令牌
   */
  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefillTime;
    
    // 计算需要补充的令牌数
    const tokensToAdd = (elapsedMs / 1000) * this.refillRate;
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefillTime = now;
    }
  }

  /**
   * 休眠指定毫秒
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取当前令牌数（用于调试）
   */
  getCurrentTokens(): number {
    this.refill();
    return this.tokens;
  }
}

/**
 * 简单的请求队列限流器
 * 用于控制并发请求数
 */
export class RequestThrottler {
  private queue: Array<() => void> = [];
  private runningCount = 0;
  private readonly maxConcurrent: number;

  constructor(maxConcurrent: number = 5) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * 执行异步任务，自动排队
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // 等待直到有空位
    await this.waitForSlot();
    
    this.runningCount++;
    
    try {
      return await fn();
    } finally {
      this.runningCount--;
      this.processQueue();
    }
  }

  /**
   * 等待执行空位
   */
  private waitForSlot(): Promise<void> {
    if (this.runningCount < this.maxConcurrent) {
      return Promise.resolve();
    }

    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  /**
   * 处理队列
   */
  private processQueue(): void {
    if (this.queue.length > 0 && this.runningCount < this.maxConcurrent) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}

/**
 * 组合限流器：同时支持速率限制和并发限制
 */
export class CombinedRateLimiter {
  private rateLimiter?: TokenBucketRateLimiter;
  private throttler?: RequestThrottler;

  constructor(
    rateLimitConfig?: { requestsPerSecond: number; burstSize: number },
    maxConcurrent?: number
  ) {
    if (rateLimitConfig) {
      this.rateLimiter = new TokenBucketRateLimiter(rateLimitConfig);
    }
    if (maxConcurrent && maxConcurrent > 0) {
      this.throttler = new RequestThrottler(maxConcurrent);
    }
  }

  /**
   * 执行请求，自动应用限流
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const executeWithRateLimit = async (): Promise<T> => {
      // 等待速率限制
      if (this.rateLimiter) {
        await this.rateLimiter.acquire();
      }
      
      return fn();
    };

    // 应用并发限制
    if (this.throttler) {
      return this.throttler.execute(executeWithRateLimit);
    }
    
    return executeWithRateLimit();
  }

  /**
   * 尝试获取许可，不等待
   */
  tryAcquire(): boolean {
    if (this.rateLimiter) {
      return this.rateLimiter.tryAcquire();
    }
    return true;
  }
}
