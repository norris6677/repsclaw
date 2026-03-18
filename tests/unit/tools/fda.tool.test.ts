#!/usr/bin/env tsx
/**
 * FDA Tool 单元测试
 */

import {
  FDATool,
  FDAParametersSchema,
  createFDAHandler,
  FDA_TOOL_NAME,
} from '../../../src/tools/fda.tool';
import { TestSuite, assertEqual, assertTrue, assertExists, c } from '../test-utils';

const suite = new TestSuite();

// 模拟 HealthAPI
function createMockHealthAPI() {
  return {
    lookupDrug: async (params: any) => ({
      status: 'success',
      data: {
        drug_name: params.drugName,
        search_type: params.searchType || 'general',
        drugs: [
          {
            generic_name: params.drugName,
            brand_name: 'Brand ' + params.drugName,
            manufacturer: 'Test Pharma',
          },
        ],
        total_results: 1,
      },
    }),
  };
}

suite.add('FDATool - 工具定义完整', async () => {
  assertEqual(FDATool.name, 'fda_drug_search');
  assertExists(FDATool.description);
  assertExists(FDATool.parameters);
  assertEqual(FDATool.parameters.type, 'object');
});

suite.add('FDATool - 参数Schema验证', async () => {
  // 有效参数
  const validParams = {
    drugName: 'aspirin',
    searchType: 'general' as const,
  };
  const result = FDAParametersSchema.safeParse(validParams);
  assertTrue(result.success, '有效参数应该通过验证');

  // 空药品名应该失败
  const invalidParams = {
    drugName: '',
  };
  const invalidResult = FDAParametersSchema.safeParse(invalidParams);
  assertTrue(!invalidResult.success, '空药品名应该失败');
});

suite.add('FDATool - 必需参数检查', async () => {
  // 只提供drugName
  const minimalParams = { drugName: 'ibuprofen' };
  const result = FDAParametersSchema.parse(minimalParams);
  assertEqual(result.drugName, 'ibuprofen');
  assertEqual(result.searchType, 'general'); // 默认值
});

suite.add('FDATool - searchType枚举验证', async () => {
  const generalParams = { drugName: 'test', searchType: 'general' as const };
  const generalResult = FDAParametersSchema.parse(generalParams);
  assertEqual(generalResult.searchType, 'general');

  const labelParams = { drugName: 'test', searchType: 'label' as const };
  const labelResult = FDAParametersSchema.parse(labelParams);
  assertEqual(labelResult.searchType, 'label');

  const adverseParams = { drugName: 'test', searchType: 'adverse_events' as const };
  const adverseResult = FDAParametersSchema.parse(adverseParams);
  assertEqual(adverseResult.searchType, 'adverse_events');
});

suite.add('FDATool - Handler成功调用', async () => {
  const mockAPI = createMockHealthAPI();
  const handler = createFDAHandler(mockAPI);

  const result = await handler({ drugName: 'aspirin', searchType: 'general' });

  assertEqual(result.status, 'success');
  assertExists(result.data);
  assertEqual(result.meta.source, 'FDA');
  assertExists(result.meta.timestamp);
});

suite.add('FDATool - Handler参数验证失败', async () => {
  const mockAPI = createMockHealthAPI();
  const handler = createFDAHandler(mockAPI);

  const result = await handler({ drugName: '' }); // 空药品名

  assertEqual(result.status, 'error');
  assertExists(result.error);
  assertEqual(result.error.code, 'FDA_ERROR');
});

suite.add('FDATool - Handler API错误处理', async () => {
  const errorAPI = {
    lookupDrug: async () => {
      throw new Error('FDA API unavailable');
    },
  };
  const handler = createFDAHandler(errorAPI);

  const result = await handler({ drugName: 'aspirin' });

  assertEqual(result.status, 'error');
  assertExists(result.error);
  assertTrue(result.error.message.includes('FDA API unavailable'));
});

suite.add('FDATool - 不同searchType调用', async () => {
  const mockAPI = createMockHealthAPI();
  const handler = createFDAHandler(mockAPI);

  // general
  const generalResult = await handler({ drugName: 'aspirin', searchType: 'general' });
  assertEqual(generalResult.status, 'success');

  // label
  const labelResult = await handler({ drugName: 'aspirin', searchType: 'label' });
  assertEqual(labelResult.status, 'success');

  // adverse_events
  const adverseResult = await handler({ drugName: 'aspirin', searchType: 'adverse_events' });
  assertEqual(adverseResult.status, 'success');
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         FDA Tool 单元测试                           ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);

  const success = await suite.run('FDA Tool 测试套件');
  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
