#!/usr/bin/env tsx
/**
 * 限流器单元测试
 */

import { 
  TokenBucketRateLimiter, 
  RequestThrottler, 
  CombinedRateLimiter 
} from '../../src/utils/rate-limiter';
import { TestSuite, assertEqual, assertTrue, assertFalse, log, c } from './test-utils';

const suite = new TestSuite();

// TokenBucketRateLimiter 测试
suite.add('TokenBucketRateLimiter - 初始化时令牌数为突发大小', async () => {
  const limiter = new TokenBucketRateLimiter({ requestsPerSecond: 10, burstSize: 5 });
  assertEqual(limiter.getCurrentTokens(), 5);
});

suite.add('TokenBucketRateLimiter - tryAcquire 消耗令牌', async () => {
  const limiter = new TokenBucketRateLimiter({ requestsPerSecond: 10, burstSize: 5 });
  
  // 获取 5 个令牌应该成功
  assertTrue(limiter.tryAcquire(), '第一次获取应该成功');
  assertTrue(limiter.tryAcquire(), '第二次获取应该成功');
  assertTrue(limiter.tryAcquire(), '第三次获取应该成功');
  assertTrue(limiter.tryAcquire(), '第四次获取应该成功');
  assertTrue(limiter.tryAcquire(), '第五次获取应该成功');
  
  // 第六次应该失败（令牌耗尽）
  assertFalse(limiter.tryAcquire(), '第六次获取应该失败');
});

suite.add('TokenBucketRateLimiter - 令牌随时间补充', async () => {
  const limiter = new TokenBucketRateLimiter({ requestsPerSecond: 100, burstSize: 5 });
  
  // 消耗所有令牌
  while (limiter.tryAcquire()) {
    // 继续获取
  }
  
  // 注意：由于 refilled 在 tryAcquire 中被调用，可能还有小数令牌
  // 我们检查是否能再次获取（应该失败）
  assertFalse(limiter.tryAcquire(), '令牌应该已耗尽');
  
  // 等待 50ms，应该补充一些令牌 (100/1000 * 50 = 5个)
  await new Promise(resolve => setTimeout(resolve, 50));
  
  const tokens = limiter.getCurrentTokens();
  assertTrue(tokens >= 4, `应该有令牌被补充，但当前令牌数为 ${tokens}`);
});

suite.add('TokenBucketRateLimiter - acquire 会等待令牌', async () => {
  const limiter = new TokenBucketRateLimiter({ requestsPerSecond: 100, burstSize: 1 });
  
  // 获取唯一的令牌
  limiter.tryAcquire();
  
  // 再次获取应该等待
  const startTime = Date.now();
  await limiter.acquire();
  const elapsed = Date.now() - startTime;
  
  assertTrue(elapsed >= 5, `应该至少等待 5ms，但实际只等待了 ${elapsed}ms`);
});

// RequestThrottler 测试
suite.add('RequestThrottler - 串行执行任务', async () => {
  const throttler = new RequestThrottler(1); // 单并发
  const results: number[] = [];
  
  // 串行执行多个任务
  await throttler.execute(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    results.push(1);
  });
  
  await throttler.execute(async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    results.push(2);
  });
  
  await throttler.execute(async () => {
    results.push(3);
  });
  
  assertEqual(results.length, 3);
  assertEqual(results[0], 1);
  assertEqual(results[1], 2);
  assertEqual(results[2], 3);
});

suite.add('RequestThrottler - 任务按顺序完成', async () => {
  const throttler = new RequestThrottler(1); // 单并发
  const results: number[] = [];
  
  const tasks = Array(3).fill(null).map((_, i) => 
    throttler.execute(async () => {
      results.push(i);
      await new Promise(resolve => setTimeout(resolve, 5));
      return i;
    })
  );
  
  await Promise.all(tasks);
  
  assertEqual(results.length, 3);
  assertEqual(results[0], 0);
  assertEqual(results[1], 1);
  assertEqual(results[2], 2);
});

// CombinedRateLimiter 测试
suite.add('CombinedRateLimiter - 执行返回结果', async () => {
  const limiter = new CombinedRateLimiter(
    { requestsPerSecond: 100, burstSize: 5 },
    2
  );
  
  const result = await limiter.execute(async () => {
    return 'test-result';
  });
  
  assertEqual(result, 'test-result');
});

suite.add('CombinedRateLimiter - 仅速率限制', async () => {
  const limiter = new CombinedRateLimiter(
    { requestsPerSecond: 100, burstSize: 3 }
  );
  
  let count = 0;
  
  // 应该立即执行 3 个
  await Promise.all([
    limiter.execute(async () => { count++; }),
    limiter.execute(async () => { count++; }),
    limiter.execute(async () => { count++; }),
  ]);
  
  assertEqual(count, 3);
});

suite.add('CombinedRateLimiter - 配置仅并发限制', async () => {
  const limiter = new CombinedRateLimiter(undefined, 2);
  
  // 验证限流器可以创建并执行
  const result = await limiter.execute(async () => {
    return 'success';
  });
  
  assertEqual(result, 'success');
  assertTrue(limiter.tryAcquire(), '无速率限制时应该总是返回 true');
});

suite.add('CombinedRateLimiter - tryAcquire 检查', async () => {
  const limiter = new CombinedRateLimiter({ requestsPerSecond: 10, burstSize: 2 });
  
  assertTrue(limiter.tryAcquire(), '第一次应该成功');
  assertTrue(limiter.tryAcquire(), '第二次应该成功');
  assertFalse(limiter.tryAcquire(), '第三次应该失败');
});

suite.add('CombinedRateLimiter - 无限制时总是成功', async () => {
  const limiter = new CombinedRateLimiter();
  
  assertTrue(limiter.tryAcquire(), '无限制时应该总是成功');
  
  const result = await limiter.execute(async () => 'success');
  assertEqual(result, 'success');
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         Rate Limiter 单元测试                       ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);
  
  const success = await suite.run('限流器测试套件');
  process.exit(success ? 0 : 1);
}

main().catch(e => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
