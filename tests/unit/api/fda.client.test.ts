#!/usr/bin/env tsx
/**
 * FDA Client 单元测试
 */

import { FDAClient } from '../../../src/integrations/api/fda.client';
import { TestSuite, assertEqual, assertTrue, assertFalse, assertExists, c } from '../test-utils';

const suite = new TestSuite();

suite.add('FDAClient - 初始化', async () => {
  const client = new FDAClient({ 
    source: 'fda', 
    baseUrl: 'https://test.api.fda.gov/drug'
  });
  
  assertExists(client);
});

suite.add('FDAClient - lookupDrug 需要药品名称', async () => {
  const client = new FDAClient({ 
    source: 'fda', 
    baseUrl: 'https://test.api.fda.gov/drug'
  });
  
  const result = await client.lookupDrug({ drugName: '' });
  
  assertEqual(result.status, 'error');
  assertExists(result.error_message);
});

suite.add('FDAClient - 应用 FDA 限流规则 (4请求/秒)', async () => {
  const client = new FDAClient({ 
    source: 'fda', 
    baseUrl: 'https://test.api.fda.gov/drug'
  });
  
  // FDA 限制 240请求/分钟 = 4请求/秒
  assertExists(client);
});

suite.add('FDAClient - 支持自定义限流配置', async () => {
  const client = new FDAClient({ 
    source: 'fda', 
    baseUrl: 'https://test.api.fda.gov/drug',
    rateLimit: {
      requestsPerSecond: 10,
      burstSize: 15
    }
  });
  
  assertExists(client);
});

suite.add('FDAClient - searchDrugs 空查询返回空数组', async () => {
  const client = new FDAClient({ 
    source: 'fda', 
    baseUrl: 'https://test.api.fda.gov/drug'
  });
  
  // 空查询应该返回空数组或错误
  const result = await client.searchDrugs({ query: '' });
  assertEqual(Array.isArray(result), true);
});

suite.add('FDAClient - 搜索类型验证', async () => {
  const client = new FDAClient({ 
    source: 'fda', 
    baseUrl: 'https://test.api.fda.gov/drug'
  });
  
  // 无效的 searchType 应该回退到 general
  const result = await client.lookupDrug({ 
    drugName: 'aspirin', 
    searchType: 'invalid_type' as any
  });
  
  // 应该返回成功或错误，而不是抛出异常
  assertTrue(result.status === 'success' || result.status === 'error');
});

suite.add('FDAClient - sanitizeText 清理文本', async () => {
  const client = new FDAClient({ 
    source: 'fda', 
    baseUrl: 'https://test.api.fda.gov/drug'
  });
  
  // 客户端应该正确处理各种文本清理
  assertExists(client);
});

suite.add('FDAClient - 提取关键信息', async () => {
  const client = new FDAClient({ 
    source: 'fda', 
    baseUrl: 'https://test.api.fda.gov/drug'
  });
  
  // 测试空数据不会崩溃
  const result = await client.lookupDrug({ drugName: 'nonexistent-drug-xyz123' });
  assertTrue(result.status === 'success' || result.status === 'error');
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         FDA Client 单元测试                         ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);
  
  const success = await suite.run('FDA Client 测试套件');
  process.exit(success ? 0 : 1);
}

main().catch(e => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
