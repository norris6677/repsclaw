#!/usr/bin/env tsx
/**
 * ICD-10 Tool 单元测试
 */

import {
  ICD10Tool,
  ICD10ParametersSchema,
  createICD10Handler,
  ICD10_TOOL_NAME,
} from '../../../src/tools/icd10.tool';
import { TestSuite, assertEqual, assertTrue, assertExists, c } from '../test-utils';

const suite = new TestSuite();

// 模拟 HealthAPI
function createMockHealthAPI() {
  return {
    lookupICDCode: async (params: any) => ({
      status: 'success',
      data: {
        search_type: params.code ? 'code' : 'description',
        search_term: params.code || params.description,
        total_results: 2,
        codes: [
          { code: 'E11', description: 'Type 2 diabetes mellitus', category: 'Endocrine' },
          { code: 'E11.9', description: 'Type 2 diabetes without complications', category: 'Endocrine' },
        ],
      },
    }),
  };
}

suite.add('ICD10Tool - 工具定义完整', async () => {
  assertEqual(ICD10Tool.name, 'icd10_lookup');
  assertExists(ICD10Tool.description);
  assertExists(ICD10Tool.parameters);
  assertEqual(ICD10Tool.parameters.type, 'object');
});

suite.add('ICD10Tool - 参数Schema验证', async () => {
  // 通过code查询
  const codeParams = {
    code: 'E11',
    maxResults: 10,
  };
  const codeResult = ICD10ParametersSchema.safeParse(codeParams);
  assertTrue(codeResult.success, '通过code查询应该通过验证');

  // 通过description查询
  const descParams = {
    description: 'diabetes',
    maxResults: 10,
  };
  const descResult = ICD10ParametersSchema.safeParse(descParams);
  assertTrue(descResult.success, '通过description查询应该通过验证');
});

suite.add('ICD10Tool - 必需参数验证', async () => {
  // 既没有code也没有description应该失败
  const invalidParams = {};
  const invalidResult = ICD10ParametersSchema.safeParse(invalidParams);
  assertTrue(!invalidResult.success, '缺少code和description应该失败');

  // 有code就可以
  const codeOnly = { code: 'A00' };
  const codeResult = ICD10ParametersSchema.safeParse(codeOnly);
  assertTrue(codeResult.success, '只有code应该通过');

  // 有description就可以
  const descOnly = { description: 'cholera' };
  const descResult = ICD10ParametersSchema.safeParse(descOnly);
  assertTrue(descResult.success, '只有description应该通过');
});

suite.add('ICD10Tool - maxResults边界检查', async () => {
  // 默认值
  const defaultParams = { code: 'E11' };
  const defaultResult = ICD10ParametersSchema.parse(defaultParams);
  assertEqual(defaultResult.maxResults, 10);

  // 最小值
  const minParams = { code: 'E11', maxResults: 1 };
  const minResult = ICD10ParametersSchema.parse(minParams);
  assertEqual(minResult.maxResults, 1);

  // 最大值
  const maxParams = { code: 'E11', maxResults: 50 };
  const maxResult = ICD10ParametersSchema.parse(maxParams);
  assertEqual(maxResult.maxResults, 50);
});

suite.add('ICD10Tool - Handler通过code查询', async () => {
  const mockAPI = createMockHealthAPI();
  const handler = createICD10Handler(mockAPI);

  const result = await handler({ code: 'E11', maxResults: 5 });

  assertEqual(result.status, 'success');
  assertExists(result.data);
  assertEqual(result.meta.source, 'ICD-10');
});

suite.add('ICD10Tool - Handler通过description查询', async () => {
  const mockAPI = createMockHealthAPI();
  const handler = createICD10Handler(mockAPI);

  const result = await handler({ description: 'diabetes', maxResults: 5 });

  assertEqual(result.status, 'success');
  assertExists(result.data);
});

suite.add('ICD10Tool - Handler参数验证失败', async () => {
  const mockAPI = createMockHealthAPI();
  const handler = createICD10Handler(mockAPI);

  const result = await handler({}); // 缺少code和description

  assertEqual(result.status, 'error');
  assertExists(result.error);
  assertEqual(result.error.code, 'ICD10_ERROR');
});

suite.add('ICD10Tool - Handler API错误处理', async () => {
  const errorAPI = {
    lookupICDCode: async () => {
      throw new Error('ICD API error');
    },
  };
  const handler = createICD10Handler(errorAPI);

  const result = await handler({ code: 'E11' });

  assertEqual(result.status, 'error');
  assertExists(result.error);
  assertTrue(result.error.message.includes('ICD API error'));
});

suite.add('ICD10Tool - 同时提供code和description', async () => {
  const bothParams = {
    code: 'E11',
    description: 'diabetes',
    maxResults: 10,
  };
  const result = ICD10ParametersSchema.parse(bothParams);
  assertEqual(result.code, 'E11');
  assertEqual(result.description, 'diabetes');
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         ICD-10 Tool 单元测试                        ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);

  const success = await suite.run('ICD-10 Tool 测试套件');
  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
