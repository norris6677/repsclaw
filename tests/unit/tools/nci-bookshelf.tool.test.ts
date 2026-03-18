#!/usr/bin/env tsx
/**
 * NCBI Bookshelf Tool 单元测试
 */

import {
  NCIBookshelfTool,
  NCIBookshelfParametersSchema,
  createNCIBookshelfHandler,
  NCI_BOOKSHELF_TOOL_NAME,
} from '../../../src/tools/nci-bookshelf.tool';
import { TestSuite, assertEqual, assertTrue, assertExists, c } from '../test-utils';

const suite = new TestSuite();

// 模拟 HealthAPI
function createMockHealthAPI() {
  return {
    searchNciBookshelf: async (params: any) => ({
      status: 'success',
      data: {
        query: params.query,
        total_results: 2,
        books: [
          {
            id: 'NBK12345',
            title: 'Test Medical Book',
            authors: ['Dr. Smith', 'Dr. Doe'],
            publication_date: '2023',
            url: 'https://www.ncbi.nlm.nih.gov/books/NBK12345/',
          },
        ],
      },
    }),
  };
}

suite.add('NCIBookshelfTool - 工具定义完整', async () => {
  assertEqual(NCIBookshelfTool.name, 'nci_bookshelf_search');
  assertExists(NCIBookshelfTool.description);
  assertExists(NCIBookshelfTool.parameters);
  assertEqual(NCIBookshelfTool.parameters.type, 'object');
});

suite.add('NCIBookshelfTool - 参数Schema验证', async () => {
  // 有效参数
  const validParams = {
    query: 'diabetes treatment',
    maxResults: 10,
  };
  const result = NCIBookshelfParametersSchema.safeParse(validParams);
  assertTrue(result.success, '有效参数应该通过验证');

  // 空查询应该失败
  const invalidParams = {
    query: '',
  };
  const invalidResult = NCIBookshelfParametersSchema.safeParse(invalidParams);
  assertTrue(!invalidResult.success, '空查询应该失败');
});

suite.add('NCIBookshelfTool - 必需参数检查', async () => {
  // 只提供query
  const minimalParams = { query: 'cancer' };
  const result = NCIBookshelfParametersSchema.parse(minimalParams);
  assertEqual(result.query, 'cancer');
  assertEqual(result.maxResults, 10); // 默认值
});

suite.add('NCIBookshelfTool - maxResults边界检查', async () => {
  // 默认值
  const defaultParams = { query: 'test' };
  const defaultResult = NCIBookshelfParametersSchema.parse(defaultParams);
  assertEqual(defaultResult.maxResults, 10);

  // 最小值
  const minParams = { query: 'test', maxResults: 1 };
  const minResult = NCIBookshelfParametersSchema.parse(minParams);
  assertEqual(minResult.maxResults, 1);

  // 最大值
  const maxParams = { query: 'test', maxResults: 50 };
  const maxResult = NCIBookshelfParametersSchema.parse(maxParams);
  assertEqual(maxResult.maxResults, 50);
});

suite.add('NCIBookshelfTool - Handler成功调用', async () => {
  const mockAPI = createMockHealthAPI();
  const handler = createNCIBookshelfHandler(mockAPI);

  const result = await handler({ query: 'diabetes', maxResults: 5 });

  assertEqual(result.status, 'success');
  assertExists(result.data);
  assertEqual(result.meta.source, 'NCBI Bookshelf');
  assertExists(result.meta.timestamp);
});

suite.add('NCIBookshelfTool - Handler参数验证失败', async () => {
  const mockAPI = createMockHealthAPI();
  const handler = createNCIBookshelfHandler(mockAPI);

  const result = await handler({ query: '' }); // 空查询

  assertEqual(result.status, 'error');
  assertExists(result.error);
  assertEqual(result.error.code, 'NCI_BOOKSHELF_ERROR');
});

suite.add('NCIBookshelfTool - Handler API错误处理', async () => {
  const errorAPI = {
    searchNciBookshelf: async () => {
      throw new Error('NCBI API error');
    },
  };
  const handler = createNCIBookshelfHandler(errorAPI);

  const result = await handler({ query: 'cancer' });

  assertEqual(result.status, 'error');
  assertExists(result.error);
  assertTrue(result.error.message.includes('NCBI API error'));
});

suite.add('NCIBookshelfTool - 复杂查询', async () => {
  const mockAPI = createMockHealthAPI();
  const handler = createNCIBookshelfHandler(mockAPI);

  const result = await handler({ query: 'genetics and molecular biology', maxResults: 20 });

  assertEqual(result.status, 'success');
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         NCBI Bookshelf Tool 单元测试                ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);

  const success = await suite.run('NCBI Bookshelf Tool 测试套件');
  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
