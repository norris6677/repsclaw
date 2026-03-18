#!/usr/bin/env tsx
/**
 * Clinical Trials Tool 单元测试
 */

import {
  ClinicalTrialsTool,
  ClinicalTrialsParametersSchema,
  createClinicalTrialsHandler,
  searchClinicalTrials,
  CLINICAL_TRIALS_TOOL_NAME,
} from '../../../src/tools/clinical-trials.tool';
import { TestSuite, assertEqual, assertTrue, assertExists, c } from '../test-utils';

const suite = new TestSuite();

suite.add('ClinicalTrialsTool - 工具定义完整', async () => {
  assertEqual(ClinicalTrialsTool.name, 'clinical_trials_search');
  assertExists(ClinicalTrialsTool.description);
  assertExists(ClinicalTrialsTool.parameters);
  assertEqual(ClinicalTrialsTool.parameters.type, 'object');
});

suite.add('ClinicalTrialsTool - 参数Schema验证', async () => {
  // 有效参数
  const validParams = {
    condition: 'diabetes',
    status: 'recruiting' as const,
    maxResults: 10,
  };
  const result = ClinicalTrialsParametersSchema.safeParse(validParams);
  assertTrue(result.success, '有效参数应该通过验证');

  // 空condition应该失败
  const invalidParams = {
    condition: '',
  };
  const invalidResult = ClinicalTrialsParametersSchema.safeParse(invalidParams);
  assertTrue(!invalidResult.success, '空condition应该失败');
});

suite.add('ClinicalTrialsTool - 必需参数检查', async () => {
  // 只提供condition
  const minimalParams = { condition: 'cancer' };
  const result = ClinicalTrialsParametersSchema.parse(minimalParams);
  assertEqual(result.condition, 'cancer');
  assertEqual(result.status, 'recruiting'); // 默认值
  assertEqual(result.maxResults, 10); // 默认值
});

suite.add('ClinicalTrialsTool - status枚举验证', async () => {
  const statuses = ['recruiting', 'completed', 'active', 'not_recruiting', 'all'] as const;

  for (const status of statuses) {
    const params = { condition: 'test', status };
    const result = ClinicalTrialsParametersSchema.parse(params);
    assertEqual(result.status, status);
  }
});

suite.add('ClinicalTrialsTool - phase数组验证', async () => {
  const paramsWithPhases = {
    condition: 'cancer',
    phase: ['PHASE1', 'PHASE2'] as const,
  };
  const result = ClinicalTrialsParametersSchema.parse(paramsWithPhases);
  assertEqual(result.phase?.length, 2);
  assertTrue(result.phase?.includes('PHASE1'));
  assertTrue(result.phase?.includes('PHASE2'));
});

suite.add('ClinicalTrialsTool - maxResults边界检查', async () => {
  // 最小值
  const minParams = { condition: 'test', maxResults: 1 };
  const minResult = ClinicalTrialsParametersSchema.parse(minParams);
  assertEqual(minResult.maxResults, 1);

  // 最大值
  const maxParams = { condition: 'test', maxResults: 100 };
  const maxResult = ClinicalTrialsParametersSchema.parse(maxParams);
  assertEqual(maxResult.maxResults, 100);
});

suite.add('ClinicalTrialsTool - 可选参数验证', async () => {
  const fullParams = {
    condition: 'covid',
    status: 'recruiting' as const,
    phase: ['PHASE3'] as const,
    location: 'United States',
    maxResults: 50,
    filters: {
      studyType: 'INTERVENTIONAL' as const,
      hasResults: true,
      sponsor: 'NIH',
    },
  };
  const result = ClinicalTrialsParametersSchema.parse(fullParams);
  assertEqual(result.condition, 'covid');
  assertEqual(result.filters?.studyType, 'INTERVENTIONAL');
  assertEqual(result.filters?.hasResults, true);
  assertEqual(result.filters?.sponsor, 'NIH');
});

suite.add('ClinicalTrialsTool - Handler参数验证失败', async () => {
  const handler = createClinicalTrialsHandler();

  // 无效参数 - 缺少condition
  const result = await handler({ condition: '' });

  assertEqual(result.status, 'error');
  assertExists(result.error);
});

suite.add('ClinicalTrialsTool - filters嵌套验证', async () => {
  const paramsWithFilters = {
    condition: 'diabetes',
    filters: {
      studyType: 'OBSERVATIONAL' as const,
      hasResults: false,
    },
  };
  const result = ClinicalTrialsParametersSchema.parse(paramsWithFilters);
  assertEqual(result.filters?.studyType, 'OBSERVATIONAL');
  assertEqual(result.filters?.hasResults, false);
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         Clinical Trials Tool 单元测试               ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);

  const success = await suite.run('Clinical Trials Tool 测试套件');
  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
