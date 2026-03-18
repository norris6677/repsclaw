#!/usr/bin/env tsx
/**
 * MedRxiv Tool 单元测试
 */

import {
  MedRxivTool,
  MedRxivParametersSchema,
  createMedRxivHandler,
  MEDRXIV_TOOL_NAME,
} from '../../../src/tools/medrxiv.tool';
import { TestSuite, assertEqual, assertTrue, assertExists, c } from '../test-utils';

const suite = new TestSuite();

// 模拟 HealthAPI
function createMockHealthAPI() {
  return {
    searchMedRxiv: async (params: any) => ({
      status: 'success',
      data: {
        query: params.query,
        total_results: 2,
        articles: [
          {
            title: 'Test Preprint 1',
            authors: ['Smith J', 'Doe A'],
            doi: '10.1101/test1',
            abstract_url: 'https://www.medrxiv.org/content/10.1101/test1',
            publication_date: '2024-01-15',
            server: params.server || 'medrxiv',
          },
        ],
      },
    }),
  };
}

suite.add('MedRxivTool - 工具定义完整', async () => {
  assertEqual(MedRxivTool.name, 'medrxiv_search');
  assertExists(MedRxivTool.description);
  assertExists(MedRxivTool.parameters);
  assertEqual(MedRxivTool.parameters.type, 'object');
});

suite.add('MedRxivTool - 参数Schema验证', async () => {
  // 有效参数
  const validParams = {
    query: 'covid vaccine',
    maxResults: 10,
    days: 30,
    server: 'medrxiv' as const,
  };
  const result = MedRxivParametersSchema.safeParse(validParams);
  assertTrue(result.success, '有效参数应该通过验证');

  // 空查询应该失败
  const invalidParams = {
    query: '',
  };
  const invalidResult = MedRxivParametersSchema.safeParse(invalidParams);
  assertTrue(!invalidResult.success, '空查询应该失败');
});

suite.add('MedRxivTool - 必需参数检查', async () => {
  // 只提供query
  const minimalParams = { query: 'diabetes' };
  const result = MedRxivParametersSchema.parse(minimalParams);
  assertEqual(result.query, 'diabetes');
  assertEqual(result.maxResults, 10); // 默认值
  assertEqual(result.server, 'medrxiv'); // 默认值
});

suite.add('MedRxivTool - maxResults边界检查', async () => {
  // 最小值
  const minParams = { query: 'test', maxResults: 1 };
  const minResult = MedRxivParametersSchema.parse(minParams);
  assertEqual(minResult.maxResults, 1);

  // 最大值
  const maxParams = { query: 'test', maxResults: 100 };
  const maxResult = MedRxivParametersSchema.parse(maxParams);
  assertEqual(maxResult.maxResults, 100);
});

suite.add('MedRxivTool - server枚举验证', async () => {
  const medrxivParams = { query: 'test', server: 'medrxiv' as const };
  const medrxivResult = MedRxivParametersSchema.parse(medrxivParams);
  assertEqual(medrxivResult.server, 'medrxiv');

  const biorxivParams = { query: 'test', server: 'biorxiv' as const };
  const biorxivResult = MedRxivParametersSchema.parse(biorxivParams);
  assertEqual(biorxivResult.server, 'biorxiv');
});

suite.add('MedRxivTool - days参数范围', async () => {
  // 有效范围
  const validDays = { query: 'test', days: 180 };
  const validResult = MedRxivParametersSchema.parse(validDays);
  assertEqual(validResult.days, 180);

  // 最小值
  const minDays = { query: 'test', days: 1 };
  const minResult = MedRxivParametersSchema.parse(minDays);
  assertEqual(minResult.days, 1);
});

suite.add('MedRxivTool - Handler成功调用', async () => {
  const mockAPI = createMockHealthAPI();
  const handler = createMedRxivHandler(mockAPI);

  const result = await handler({ query: 'covid', maxResults: 5 });

  assertEqual(result.status, 'success');
  assertExists(result.data);
  assertEqual(result.meta.source, 'medRxiv');
  assertExists(result.meta.timestamp);
});

suite.add('MedRxivTool - Handler使用biorxiv', async () => {
  const mockAPI = createMockHealthAPI();
  const handler = createMedRxivHandler(mockAPI);

  const result = await handler({ query: 'genetics', server: 'biorxiv' });

  assertEqual(result.status, 'success');
});

suite.add('MedRxivTool - Handler参数验证失败', async () => {
  const mockAPI = createMockHealthAPI();
  const handler = createMedRxivHandler(mockAPI);

  const result = await handler({ query: '' }); // 空查询

  assertEqual(result.status, 'error');
  assertExists(result.error);
  assertEqual(result.error.code, 'MEDRXIV_ERROR');
});

suite.add('MedRxivTool - Handler API错误处理', async () => {
  const errorAPI = {
    searchMedRxiv: async () => {
      throw new Error('medRxiv API error');
    },
  };
  const handler = createMedRxivHandler(errorAPI);

  const result = await handler({ query: 'diabetes' });

  assertEqual(result.status, 'error');
  assertExists(result.error);
  assertTrue(result.error.message.includes('medRxiv API error'));
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         MedRxiv Tool 单元测试                       ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);

  const success = await suite.run('MedRxiv Tool 测试套件');
  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
