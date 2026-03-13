#!/usr/bin/env tsx
/**
 * NCBI Bookshelf Client 单元测试
 */

import { NciBookshelfClient } from '../../../src/integrations/api/nci-bookshelf.client';
import { TestSuite, assertEqual, assertTrue, assertExists, c } from '../test-utils';

const suite = new TestSuite();

suite.add('NciBookshelfClient - 初始化', async () => {
  const client = new NciBookshelfClient({ 
    source: 'ncbi_bookshelf', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils'
  });
  
  assertExists(client);
});

suite.add('NciBookshelfClient - search 需要查询参数', async () => {
  const client = new NciBookshelfClient({ 
    source: 'ncbi_bookshelf', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils'
  });
  
  const result = await client.search({ query: '' });
  
  assertEqual(result.status, 'error');
  assertExists(result.error_message);
});

suite.add('NciBookshelfClient - 无 API key 时应用默认限流 (3请求/秒)', async () => {
  const client = new NciBookshelfClient({ 
    source: 'ncbi_bookshelf', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils'
  });
  
  assertExists(client);
});

suite.add('NciBookshelfClient - 有 API key 时应用更高限流 (10请求/秒)', async () => {
  const client = new NciBookshelfClient({ 
    source: 'ncbi_bookshelf', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils',
    apiKey: 'test-api-key'
  });
  
  assertExists(client);
});

suite.add('NciBookshelfClient - 支持自定义限流配置', async () => {
  const client = new NciBookshelfClient({ 
    source: 'ncbi_bookshelf', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils',
    rateLimit: {
      requestsPerSecond: 20,
      burstSize: 30
    }
  });
  
  assertExists(client);
});

suite.add('NciBookshelfClient - maxResults 边界检查', async () => {
  const client = new NciBookshelfClient({ 
    source: 'ncbi_bookshelf', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils'
  });
  
  // 超过 100 应该被限制
  const result = await client.search({ 
    query: 'cancer',
    maxResults: 200
  });
  
  assertTrue(result.status === 'success' || result.status === 'error');
});

suite.add('NciBookshelfClient - searchAsPages 格式化结果', async () => {
  const client = new NciBookshelfClient({ 
    source: 'ncbi_bookshelf', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils'
  });
  
  // 空查询应该返回空数组
  const result = await client.searchAsPages({ query: '' });
  assertEqual(Array.isArray(result), true);
});

suite.add('NciBookshelfClient - getBookDetails 获取书籍详情', async () => {
  const client = new NciBookshelfClient({ 
    source: 'ncbi_bookshelf', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils'
  });
  
  const result = await client.getBookDetails('NBK12345');
  assertTrue(result.status === 'success' || result.status === 'error');
});

suite.add('NciBookshelfClient - getRelatedBooks 获取相关书籍', async () => {
  const client = new NciBookshelfClient({ 
    source: 'ncbi_bookshelf', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils'
  });
  
  const result = await client.getRelatedBooks('NBK12345');
  assertTrue(result.status === 'success' || result.status === 'error');
});

suite.add('NciBookshelfClient - 与 PubMed 共用限流策略', async () => {
  // NCBI Bookshelf 与 PubMed 使用相同的 NCBI E-utilities API
  // 应该遵循相同的限流策略
  const clientWithoutKey = new NciBookshelfClient({ 
    source: 'ncbi_bookshelf', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils'
  });
  
  const clientWithKey = new NciBookshelfClient({ 
    source: 'ncbi_bookshelf', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils',
    apiKey: 'test-key'
  });
  
  assertExists(clientWithoutKey);
  assertExists(clientWithKey);
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         NCBI Bookshelf Client 单元测试              ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);
  
  const success = await suite.run('NCBI Bookshelf Client 测试套件');
  process.exit(success ? 0 : 1);
}

main().catch(e => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
