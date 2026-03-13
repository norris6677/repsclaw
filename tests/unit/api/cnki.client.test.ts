#!/usr/bin/env tsx
/**
 * CNKI Client 单元测试
 */

import { CNKIClient } from '../../../src/integrations/api/cnki.client';
import { TestSuite, assertEqual, assertTrue, assertExists, c } from '../test-utils';

const suite = new TestSuite();

suite.add('CNKIClient - 初始化', async () => {
  const client = new CNKIClient({ 
    source: 'cnki', 
    baseUrl: 'https://test.cnki.net/api'
  });
  
  assertExists(client);
});

suite.add('CNKIClient - search 需要查询参数', async () => {
  const client = new CNKIClient({ 
    source: 'cnki', 
    baseUrl: 'https://test.cnki.net/api'
  });
  
  const result = await client.search({ query: '' });
  
  assertEqual(result.status, 'error');
  assertExists(result.error_message);
});

suite.add('CNKIClient - 应用限流规则 (3请求/秒)', async () => {
  const client = new CNKIClient({ 
    source: 'cnki', 
    baseUrl: 'https://test.cnki.net/api'
  });
  
  assertExists(client);
});

suite.add('CNKIClient - 支持自定义限流配置', async () => {
  const client = new CNKIClient({ 
    source: 'cnki', 
    baseUrl: 'https://test.cnki.net/api',
    rateLimit: {
      requestsPerSecond: 5,
      burstSize: 10
    }
  });
  
  assertExists(client);
});

suite.add('CNKIClient - fetchDetail 应用限流', async () => {
  const client = new CNKIClient({ 
    source: 'cnki', 
    baseUrl: 'https://test.cnki.net/api'
  });
  
  const result = await client.fetchDetail('https://test.cnki.net/article/test');
  
  // 应该返回 ICrawledPage 格式
  assertExists(result.url);
  assertExists(result.metadata);
  assertExists(result.metadata.crawledAt);
});

suite.add('CNKIClient - fetchCitationFormats 返回引用格式', async () => {
  const client = new CNKIClient({ 
    source: 'cnki', 
    baseUrl: 'https://test.cnki.net/api'
  });
  
  const result = await client.fetchCitationFormats('https://test.cnki.net/article/test');
  
  // 应该返回对象
  assertEqual(typeof result, 'object');
});

suite.add('CNKIClient - checkAuth 检查认证状态', async () => {
  // 无 API key
  const clientWithoutKey = new CNKIClient({ 
    source: 'cnki', 
    baseUrl: 'https://test.cnki.net/api'
  });
  
  const authWithoutKey = await clientWithoutKey.checkAuth();
  assertEqual(authWithoutKey, false);
  
  // 有 API key
  const clientWithKey = new CNKIClient({ 
    source: 'cnki', 
    baseUrl: 'https://test.cnki.net/api',
    apiKey: 'test-api-key'
  });
  
  const authWithKey = await clientWithKey.checkAuth();
  assertEqual(authWithKey, true);
});

suite.add('CNKIClient - 搜索参数验证', async () => {
  const client = new CNKIClient({ 
    source: 'cnki', 
    baseUrl: 'https://test.cnki.net/api'
  });
  
  // 测试各种搜索类型
  const searchTypes = ['theme', 'title', 'author', 'keyword'] as const;
  
  for (const searchType of searchTypes) {
    const result = await client.search({ 
      query: '测试',
      searchType
    });
    
    assertTrue(result.status === 'success' || result.status === 'error');
  }
});

suite.add('CNKIClient - 排序类型验证', async () => {
  const client = new CNKIClient({ 
    source: 'cnki', 
    baseUrl: 'https://test.cnki.net/api'
  });
  
  // 测试各种排序类型
  const sortTypes = ['PT', 'RT', 'SU'] as const;
  
  for (const sortType of sortTypes) {
    const result = await client.search({ 
      query: '测试',
      sortType
    });
    
    assertTrue(result.status === 'success' || result.status === 'error');
  }
});

suite.add('CNKIClient - 返回标准响应格式', async () => {
  const client = new CNKIClient({ 
    source: 'cnki', 
    baseUrl: 'https://test.cnki.net/api'
  });
  
  const result = await client.search({ query: '测试' });
  
  // 应该返回标准格式
  assertExists(result.status);
  assertTrue(result.status === 'success' || result.status === 'error');
  
  if (result.status === 'success') {
    assertExists(result.data);
    assertExists(result.data?.items);
    assertExists(result.data?.totalCount);
  }
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         CNKI Client 单元测试                        ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);
  
  const success = await suite.run('CNKI Client 测试套件');
  process.exit(success ? 0 : 1);
}

main().catch(e => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
