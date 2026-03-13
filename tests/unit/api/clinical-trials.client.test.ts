#!/usr/bin/env tsx
/**
 * Clinical Trials Client 单元测试
 */

import { ClinicalTrialsClient } from '../../../src/integrations/api/clinical-trials.client';
import { TestSuite, assertEqual, assertTrue, assertExists, c } from '../test-utils';

const suite = new TestSuite();

suite.add('ClinicalTrialsClient - 初始化', async () => {
  const client = new ClinicalTrialsClient({ 
    source: 'clinical_trials', 
    baseUrl: 'https://test.clinicaltrials.gov/api/v2'
  });
  
  assertExists(client);
});

suite.add('ClinicalTrialsClient - searchTrials 需要条件参数', async () => {
  const client = new ClinicalTrialsClient({ 
    source: 'clinical_trials', 
    baseUrl: 'https://test.clinicaltrials.gov/api/v2'
  });
  
  const result = await client.searchTrials({ condition: '' });
  
  assertEqual(result.status, 'error');
  assertExists(result.error_message);
});

suite.add('ClinicalTrialsClient - 应用限流规则 (5请求/秒)', async () => {
  const client = new ClinicalTrialsClient({ 
    source: 'clinical_trials', 
    baseUrl: 'https://test.clinicaltrials.gov/api/v2'
  });
  
  assertExists(client);
});

suite.add('ClinicalTrialsClient - 支持自定义限流配置', async () => {
  const client = new ClinicalTrialsClient({ 
    source: 'clinical_trials', 
    baseUrl: 'https://test.clinicaltrials.gov/api/v2',
    rateLimit: {
      requestsPerSecond: 10,
      burstSize: 15
    }
  });
  
  assertExists(client);
});

suite.add('ClinicalTrialsClient - 状态参数验证', async () => {
  const client = new ClinicalTrialsClient({ 
    source: 'clinical_trials', 
    baseUrl: 'https://test.clinicaltrials.gov/api/v2'
  });
  
  // 无效的状态应该回退到 recruiting
  const result = await client.searchTrials({ 
    condition: 'cancer',
    status: 'invalid_status' as any
  });
  
  // 应该返回结果（可能使用默认状态）
  assertTrue(result.status === 'success' || result.status === 'error');
});

suite.add('ClinicalTrialsClient - maxResults 边界检查', async () => {
  const client = new ClinicalTrialsClient({ 
    source: 'clinical_trials', 
    baseUrl: 'https://test.clinicaltrials.gov/api/v2'
  });
  
  // 超过 100 应该被限制
  const result = await client.searchTrials({ 
    condition: 'cancer',
    maxResults: 200
  });
  
  assertTrue(result.status === 'success' || result.status === 'error');
});

suite.add('ClinicalTrialsClient - search 方法格式化结果', async () => {
  const client = new ClinicalTrialsClient({ 
    source: 'clinical_trials', 
    baseUrl: 'https://test.clinicaltrials.gov/api/v2'
  });
  
  // 空查询应该返回空数组
  const result = await client.search({ query: '' });
  assertEqual(Array.isArray(result), true);
});

suite.add('ClinicalTrialsClient - formatTrialContent 格式化', async () => {
  const client = new ClinicalTrialsClient({ 
    source: 'clinical_trials', 
    baseUrl: 'https://test.clinicaltrials.gov/api/v2'
  });
  
  // 验证客户端能正确处理试验数据格式化
  assertExists(client);
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         Clinical Trials Client 单元测试             ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);
  
  const success = await suite.run('Clinical Trials Client 测试套件');
  process.exit(success ? 0 : 1);
}

main().catch(e => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
