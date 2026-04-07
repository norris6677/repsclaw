import { createLogger } from './plugin-logger';

const logger = createLogger('REPSCLAW:CIRCUIT-BREAKER');

/**
 * 熔断器状态
 */
type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * 熔断器开启错误
 */
export class CircuitOpenError extends Error {
  constructor(message: string = '服务暂时不可用') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

/**
 * 熔断器配置
 */
export interface CircuitBreakerOptions {
  /** 失败阈值，超过此值开启熔断 */
  failureThreshold?: number;
  /** 熔断持续时间（毫秒） */
  timeout?: number;
  /** 半开状态允许的测试请求数 */
  halfOpenMaxCalls?: number;
  /** 成功响应后重置失败计数 */
  successThreshold?: number;
  /** 数据源名称（用于日志） */
  name?: string;
}

/**
 * 熔断器
 * 防止数据源持续失败导致级联故障
 *
 * 状态流转：
 * closed (正常) -> 失败次数达到阈值 -> open (熔断)
 * open -> 超时后 -> half-open (半开)
 * half-open -> 测试成功 -> closed
 * half-open -> 测试失败 -> open
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private nextAttempt = 0;
  private halfOpenCalls = 0;

  private readonly failureThreshold: number;
  private readonly timeout: number;
  private readonly halfOpenMaxCalls: number;
  private readonly successThreshold: number;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.timeout = options.timeout ?? 60000; // 默认60秒
    this.halfOpenMaxCalls = options.halfOpenMaxCalls ?? 1;
    this.successThreshold = options.successThreshold ?? 2;
    this.name = options.name ?? 'unnamed';
  }

  /**
   * 执行函数，带熔断保护
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // 检查熔断状态
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        logger.debug(`[${this.name}] Circuit is open, rejecting request`, {
          nextAttempt: new Date(this.nextAttempt).toISOString(),
        });
        throw new CircuitOpenError(`[${this.name}] 服务暂时不可用，请稍后重试`);
      }

      // 超时后进入半开状态
      logger.info(`[${this.name}] Circuit entering half-open state`);
      this.state = 'half-open';
      this.halfOpenCalls = 0;
    }

    if (this.state === 'half-open') {
      if (this.halfOpenCalls >= this.halfOpenMaxCalls) {
        logger.debug(`[${this.name}] Half-open limit reached, rejecting request`);
        throw new CircuitOpenError(`[${this.name}] 服务恢复测试中，请稍后重试`);
      }
      this.halfOpenCalls++;
    }

    try {
      // 执行实际函数
      const result = await fn();

      // 成功处理
      this.onSuccess();
      return result;
    } catch (error) {
      // 失败处理
      this.onFailure();
      throw error;
    }
  }

  /**
   * 成功回调
   */
  private onSuccess(): void {
    this.failures = 0;

    if (this.state === 'half-open') {
      this.successes++;

      if (this.successes >= this.successThreshold) {
        // 恢复关闭状态
        logger.info(`[${this.name}] Circuit closed (recovered)`);
        this.state = 'closed';
        this.successes = 0;
        this.halfOpenCalls = 0;
      }
    }
  }

  /**
   * 失败回调
   */
  private onFailure(): void {
    this.failures++;
    this.successes = 0;

    if (this.state === 'half-open') {
      // 半开状态失败，立即重新熔断
      logger.warn(`[${this.name}] Circuit re-opened (half-open test failed)`);
      this.openCircuit();
    } else if (this.state === 'closed' && this.failures >= this.failureThreshold) {
      // 达到失败阈值，开启熔断
      logger.warn(`[${this.name}] Circuit opened after ${this.failures} failures`);
      this.openCircuit();
    }
  }

  /**
   * 开启熔断
   */
  private openCircuit(): void {
    this.state = 'open';
    this.nextAttempt = Date.now() + this.timeout;
    this.halfOpenCalls = 0;

    logger.info(`[${this.name}] Circuit will retry at ${new Date(this.nextAttempt).toISOString()}`);
  }

  /**
   * 获取当前状态
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    state: CircuitState;
    failures: number;
    successes: number;
    nextAttempt: number | null;
  } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      nextAttempt: this.state === 'open' ? this.nextAttempt : null,
    };
  }

  /**
   * 强制重置（用于手动恢复）
   */
  reset(): void {
    logger.info(`[${this.name}] Circuit manually reset`);
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = 0;
    this.halfOpenCalls = 0;
  }
}

/**
 * 带熔断的函数包装器
 */
export function withCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: CircuitBreakerOptions = {}
): T {
  const breaker = new CircuitBreaker(options);

  return (async (...args: any[]) => {
    return breaker.execute(() => fn(...args));
  }) as T;
}
