#!/usr/bin/env tsx
/**
 * PubMed Tool 单元测试
 */

import {
  PubMedTool,
  PubMedParametersSchema,
  createPubMedHandler,
  PUBMED_TOOL_NAME,
} from '../../../src/tools/pubmed.tool';
import { TestSuite, assertEqual, assertTrue, assertExists, c } from '../test-utils';

const suite = new TestSuite();

// 模拟 HealthAPI
function createMockHealthAPI() {
  return {
    searchPubMed: async (params: any) => ({
      status: 'success',
      data: {
        query: params.query,
        total_results: 2,
        articles: [
          {
            id: '12345',
            title: 'Test Article 1',
            authors: ['Smith J', 'Doe A'],
            journal: 'Test Journal',
            publication_date: '2024 Jan',
            abstract_url: 'https://pubmed.ncbi.nlm.nih.gov/12345/',
            doi: '10.1234/test',
          },
        ],
      },
    }),
  };
}

suite.add('PubMedTool - 工具定义完整', async () => {
  assertEqual(PubMedTool.name, 'pubmed_search');
  assertExists(PubMedTool.description);
  assertExists(PubMedTool.parameters);
  assertEqual(PubMedTool.parameters.type, 'object');
});

suite.add('PubMedTool - 参数Schema验证', async () => {
  // 有效参数
  const validParams = {
    query: 'diabetes',
    maxResults: 10,
    sort: 'relevance' as const,
    openAccess: false,
  };
  const result = PubMedParametersSchema.safeParse(validParams);
  assertTrue(result.success, '有效参数应该通过验证');

  // 空查询应该失败
  const invalidParams = {
    query: '',
  };
  const invalidResult = PubMedParametersSchema.safeParse(invalidParams);
  assertTrue(!invalidResult.success, '空查询应该失败');
});

suite.add('PubMedTool - 必需参数检查', async () => {
  // 只提供query
  const minimalParams = { query: 'cancer' };
  const result = PubMedParametersSchema.parse(minimalParams);
  assertEqual(result.query, 'cancer');
  assertEqual(result.maxResults, 10); // 默认值
  assertEqual(result.sort, 'relevance'); // 默认值
  assertEqual(result.openAccess, false); // 默认值
});

suite.add('PubMedTool - maxResults边界检查', async () => {
  // 最小值
  const minParams = { query: 'test', maxResults: 1 };
  const minResult = PubMedParametersSchema.parse(minParams);
  assertEqual(minResult.maxResults, 1);

  // 最大值
  const maxParams = { query: 'test', maxResults: 100 };
  const maxResult = PubMedParametersSchema.parse(maxParams);
  assertEqual(maxResult.maxResults, 100);
});

suite.add('PubMedTool - sort参数枚举验证', async () => {
  const relevanceParams = { query: 'test', sort: 'relevance' as const };
  const relevanceResult = PubMedParametersSchema.parse(relevanceParams);
  assertEqual(relevanceResult.sort, 'relevance');

  const dateParams = { query: 'test', sort: 'date' as const };
  const dateResult = PubMedParametersSchema.parse(dateParams);
  assertEqual(dateResult.sort, 'date');
});

suite.add('PubMedTool - Handler成功调用', async () => {
  const mockAPI = createMockHealthAPI();
  const handler = createPubMedHandler(mockAPI);

  const result = await handler({ query: 'diabetes', maxResults: 5 });

  assertEqual(result.status, 'success');
  assertExists(result.data);
  assertEqual(result.meta.source, 'PubMed');
  assertExists(result.meta.timestamp);
});

suite.add('PubMedTool - Handler参数验证失败', async () => {
  const mockAPI = createMockHealthAPI();
  const handler = createPubMedHandler(mockAPI);

  const result = await handler({ query: '' }); // 空查询

  assertEqual(result.status, 'error');
  assertExists(result.error);
  assertEqual(result.error.code, 'PUBMED_ERROR');
});

suite.add('PubMedTool - Handler API错误处理', async () => {
  const errorAPI = {
    searchPubMed: async () => {
      throw new Error('API connection failed');
    },
  };
  const handler = createPubMedHandler(errorAPI);

  const result = await handler({ query: 'diabetes' });

  assertEqual(result.status, 'error');
  assertExists(result.error);
  assertTrue(result.error.message.includes('API connection failed'));
});

suite.add('PubMedTool - dateRange参数支持', async () => {
  const paramsWithDateRange = {
    query: 'covid',
    dateRange: '2023:2024',
  };
  const result = PubMedParametersSchema.parse(paramsWithDateRange);
  assertEqual(result.dateRange, '2023:2024');
});

suite.add('PubMedTool - openAccess参数', async () => {
  const paramsWithOA = {
    query: 'vaccine',
    openAccess: true,
  };
  const result = PubMedParametersSchema.parse(paramsWithOA);
  assertEqual(result.openAccess, true);
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         PubMed Tool 单元测试                        ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);

  const success = await suite.run('PubMed Tool 测试套件');
  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
