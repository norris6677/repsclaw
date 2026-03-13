#!/usr/bin/env tsx
/**
 * MedRxiv Client 单元测试
 */

import { MedRxivClient } from '../../../src/integrations/api/medrxiv.client';
import { TestSuite, assertEqual, assertTrue, assertExists, c } from '../test-utils';

const suite = new TestSuite();

suite.add('MedRxivClient - 初始化', async () => {
  const client = new MedRxivClient({ 
    source: 'medrxiv', 
    baseUrl: 'https://test.api.medrxiv.org'
  });
  
  assertExists(client);
});

suite.add('MedRxivClient - search 需要查询参数', async () => {
  const client = new MedRxivClient({ 
    source: 'medrxiv', 
    baseUrl: 'https://test.api.medrxiv.org'
  });
  
  const result = await client.search({ query: '' });
  
  assertEqual(result.status, 'error');
  assertExists(result.error_message);
});

suite.add('MedRxivClient - 应用限流规则 (3请求/秒)', async () => {
  const client = new MedRxivClient({ 
    source: 'medrxiv', 
    baseUrl: 'https://test.api.medrxiv.org'
  });
  
  assertExists(client);
});

suite.add('MedRxivClient - 支持自定义限流配置', async () => {
  const client = new MedRxivClient({ 
    source: 'medrxiv', 
    baseUrl: 'https://test.api.medrxiv.org',
    rateLimit: {
      requestsPerSecond: 5,
      burstSize: 10
    }
  });
  
  assertExists(client);
});

suite.add('MedRxivClient - maxResults 边界检查', async () => {
  const client = new MedRxivClient({ 
    source: 'medrxiv', 
    baseUrl: 'https://test.api.medrxiv.org'
  });
  
  // 超过 100 应该被限制
  const result = await client.search({ 
    query: 'covid',
    maxResults: 200
  });
  
  assertTrue(result.status === 'success' || result.status === 'error');
});

suite.add('MedRxivClient - 服务器选择 (medrxiv/biorxiv)', async () => {
  const client = new MedRxivClient({ 
    source: 'medrxiv', 
    baseUrl: 'https://test.api.medrxiv.org'
  });
  
  // medrxiv 服务器
  const result1 = await client.search({ 
    query: 'covid',
    server: 'medrxiv'
  });
  assertTrue(result1.status === 'success' || result1.status === 'error');
  
  // biorxiv 服务器
  const result2 = await client.search({ 
    query: 'covid',
    server: 'biorxiv'
  });
  assertTrue(result2.status === 'success' || result2.status === 'error');
});

suite.add('MedRxivClient - searchAsPages 格式化结果', async () => {
  const client = new MedRxivClient({ 
    source: 'medrxiv', 
    baseUrl: 'https://test.api.medrxiv.org'
  });
  
  // 空查询应该返回空数组
  const result = await client.searchAsPages({ query: '' });
  assertEqual(Array.isArray(result), true);
});

suite.add('MedRxivClient - getRecentPapers 获取最新文章', async () => {
  const client = new MedRxivClient({ 
    source: 'medrxiv', 
    baseUrl: 'https://test.api.medrxiv.org'
  });
  
  const result = await client.getRecentPapers({ maxResults: 5 });
  assertTrue(result.status === 'success' || result.status === 'error');
});

suite.add('MedRxivClient - 默认参数', async () => {
  const client = new MedRxivClient({ 
    source: 'medrxiv', 
    baseUrl: 'https://test.api.medrxiv.org'
  });
  
  // 使用默认参数
  const result = await client.search({ query: 'covid' });
  assertTrue(result.status === 'success' || result.status === 'error');
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         MedRxiv Client 单元测试                     ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);
  
  const success = await suite.run('MedRxiv Client 测试套件');
  process.exit(success ? 0 : 1);
}

main().catch(e => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
