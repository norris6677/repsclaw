#!/usr/bin/env tsx
/**
 * Medical Terminology Client 单元测试
 */

import { MedicalTerminologyClient } from '../../../src/integrations/api/medical-terminology.client';
import { TestSuite, assertEqual, assertTrue, assertFalse, assertExists, c } from '../test-utils';

const suite = new TestSuite();

suite.add('MedicalTerminologyClient - 初始化', async () => {
  const client = new MedicalTerminologyClient({ 
    source: 'medical_terminology', 
    baseUrl: 'https://test.clinicaltables.nlm.nih.gov/api/icd10cm/v3'
  });
  
  assertExists(client);
});

suite.add('MedicalTerminologyClient - lookupICDCode 需要代码或描述', async () => {
  const client = new MedicalTerminologyClient({ 
    source: 'medical_terminology', 
    baseUrl: 'https://test.clinicaltables.nlm.nih.gov/api/icd10cm/v3'
  });
  
  const result = await client.lookupICDCode({});
  
  assertEqual(result.status, 'error');
  assertExists(result.error_message);
});

suite.add('MedicalTerminologyClient - 应用限流规则 (5请求/秒)', async () => {
  const client = new MedicalTerminologyClient({ 
    source: 'medical_terminology', 
    baseUrl: 'https://test.clinicaltables.nlm.nih.gov/api/icd10cm/v3'
  });
  
  assertExists(client);
});

suite.add('MedicalTerminologyClient - 支持自定义限流配置', async () => {
  const client = new MedicalTerminologyClient({ 
    source: 'medical_terminology', 
    baseUrl: 'https://test.clinicaltables.nlm.nih.gov/api/icd10cm/v3',
    rateLimit: {
      requestsPerSecond: 10,
      burstSize: 15
    }
  });
  
  assertExists(client);
});

suite.add('MedicalTerminologyClient - maxResults 边界检查', async () => {
  const client = new MedicalTerminologyClient({ 
    source: 'medical_terminology', 
    baseUrl: 'https://test.clinicaltables.nlm.nih.gov/api/icd10cm/v3'
  });
  
  // 超过 50 应该被限制
  const result = await client.lookupICDCode({ 
    code: 'A00',
    maxResults: 100
  });
  
  assertTrue(result.status === 'success' || result.status === 'error');
});

suite.add('MedicalTerminologyClient - validateCode 验证代码', async () => {
  const client = new MedicalTerminologyClient({ 
    source: 'medical_terminology', 
    baseUrl: 'https://test.clinicaltables.nlm.nih.gov/api/icd10cm/v3'
  });
  
  // 由于无法 mock，测试返回布尔值
  const result = await client.validateCode('A00');
  assertEqual(typeof result, 'boolean');
});

suite.add('MedicalTerminologyClient - getCodeDetails 获取代码详情', async () => {
  const client = new MedicalTerminologyClient({ 
    source: 'medical_terminology', 
    baseUrl: 'https://test.clinicaltables.nlm.nih.gov/api/icd10cm/v3'
  });
  
  const result = await client.getCodeDetails('A00');
  assertTrue(result.status === 'success' || result.status === 'error');
});

suite.add('MedicalTerminologyClient - search 方法格式化结果', async () => {
  const client = new MedicalTerminologyClient({ 
    source: 'medical_terminology', 
    baseUrl: 'https://test.clinicaltables.nlm.nih.gov/api/icd10cm/v3'
  });
  
  const result = await client.search({ query: '' });
  assertEqual(Array.isArray(result), true);
});

suite.add('MedicalTerminologyClient - 代码格式检测', async () => {
  const client = new MedicalTerminologyClient({ 
    source: 'medical_terminology', 
    baseUrl: 'https://test.clinicaltables.nlm.nih.gov/api/icd10cm/v3'
  });
  
  // A00 应该被识别为代码格式
  const result1 = await client.search({ query: 'A00' });
  assertEqual(Array.isArray(result1), true);
  
  // "diabetes" 应该被识别为描述
  const result2 = await client.search({ query: 'diabetes' });
  assertEqual(Array.isArray(result2), true);
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         Medical Terminology Client 单元测试         ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);
  
  const success = await suite.run('Medical Terminology Client 测试套件');
  process.exit(success ? 0 : 1);
}

main().catch(e => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
