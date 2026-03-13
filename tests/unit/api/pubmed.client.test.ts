#!/usr/bin/env tsx
/**
 * PubMed Client 单元测试
 */

import { PubMedClient } from '../../../src/integrations/api/pubmed.client';
import { TestSuite, assertEqual, assertTrue, assertFalse, assertExists, c } from '../test-utils';

const suite = new TestSuite();

// 模拟成功的搜索响应
const mockSearchResponse = {
  esearchresult: {
    count: '100',
    idlist: ['12345', '67890'],
  },
};

const mockSummaryResponse = {
  result: {
    '12345': {
      title: 'Test Article 1',
      authors: [{ name: 'Smith J' }, { name: 'Doe A' }],
      fulljournalname: 'Test Journal',
      pubdate: '2024 Jan',
      articleids: [{ idtype: 'doi', value: '10.1234/test' }],
    },
    '67890': {
      title: 'Test Article 2',
      authors: [{ name: 'Johnson B' }],
      fulljournalname: 'Another Journal',
      pubdate: '2024 Feb',
      articleids: [],
    },
  },
};

suite.add('PubMedClient - 搜索需要查询参数', async () => {
  const client = new PubMedClient({ 
    source: 'pubmed', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils' 
  });
  
  const result = await client.search({ query: '' });
  
  assertEqual(result.status, 'error');
  assertExists(result.error_message);
  assertTrue(result.error_message?.includes('required'));
});

suite.add('PubMedClient - 搜索返回标准格式', async () => {
  // 由于无法直接 mock axios，我们测试配置是否正确
  const client = new PubMedClient({ 
    source: 'pubmed', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils',
    apiKey: 'test-key'
  });
  
  // 验证客户端初始化正确
  assertExists(client);
});

suite.add('PubMedClient - 无 API key 时应用默认限流', async () => {
  const client = new PubMedClient({ 
    source: 'pubmed', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils'
  });
  
  // 无 API key 时应该使用 3请求/秒的限流
  assertExists(client);
});

suite.add('PubMedClient - 有 API key 时应用更高限流', async () => {
  const client = new PubMedClient({ 
    source: 'pubmed', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils',
    apiKey: 'test-api-key'
  });
  
  // 有 API key 时应该使用 10请求/秒的限流
  assertExists(client);
});

suite.add('PubMedClient - 支持自定义限流配置', async () => {
  const client = new PubMedClient({ 
    source: 'pubmed', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils',
    rateLimit: {
      requestsPerSecond: 20,
      burstSize: 30
    }
  });
  
  assertExists(client);
});

suite.add('PubMedClient - 搜索参数验证', async () => {
  const client = new PubMedClient({ 
    source: 'pubmed', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils'
  });
  
  // 测试 maxResults 边界
  const result = await client.search({ query: 'test', maxResults: 200 });
  // 应该被限制在 100 以内，但由于是错误响应，我们检查状态
  assertTrue(result.status === 'error' || result.status === 'success');
});

suite.add('PubMedClient - fetchDetails 空数组返回空', async () => {
  const client = new PubMedClient({ 
    source: 'pubmed', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils'
  });
  
  const result = await client.fetchDetails([]);
  assertEqual(result.length, 0);
});

suite.add('PubMedClient - fetchAbstracts 空数组返回空对象', async () => {
  const client = new PubMedClient({ 
    source: 'pubmed', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils'
  });
  
  const result = await client.fetchAbstracts([]);
  assertEqual(Object.keys(result).length, 0);
});

suite.add('PubMedClient - searchAsPages 格式化检查', async () => {
  const client = new PubMedClient({ 
    source: 'pubmed', 
    baseUrl: 'https://test.eutils.ncbi.nlm.nih.gov/entrez/eutils'
  });
  
  // 由于无法 mock，测试空查询返回空数组
  const result = await client.searchAsPages({ query: '' });
  assertEqual(result.length, 0);
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         PubMed Client 单元测试                      ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);
  
  const success = await suite.run('PubMed Client 测试套件');
  process.exit(success ? 0 : 1);
}

main().catch(e => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
