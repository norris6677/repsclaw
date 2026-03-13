#!/usr/bin/env tsx
/**
 * Medical Terminology Client 真实 HTTP 请求测试
 * 
 * 环境变量:
 * - MEDICAL_TERMINOLOGY_BASE_URL: API 基础 URL (可选)
 */

import { MedicalTerminologyClient } from '../../../src/integrations/api/medical-terminology.client';
import { apiConfigs, log, TestResult, assertExists, assertEqual, assertTrue, assertArray, c, formatError, sleep } from './test-config';

const config = apiConfigs.medicalTerminology;

async function runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, ok: true, duration: Date.now() - start };
  } catch (error) {
    return { name, ok: false, err: formatError(error), duration: Date.now() - start };
  }
}

async function testLookupICDCodeByCode() {
  log('测试: 通过代码查询 ICD-10', 'i');
  
  const client = new MedicalTerminologyClient({
    source: 'medical_terminology',
    baseUrl: config.baseUrl,
  });
  
  const result = await client.lookupICDCode({
    code: 'E11',
    maxResults: 5,
  });
  
  if (result.status === 'error') {
    throw new Error(`查询失败: ${result.error_message}`);
  }
  
  assertExists(result.data, '应该有数据返回');
  assertEqual(result.data!.search_type, 'code');
  assertEqual(result.data!.search_term, 'E11');
  assertEqual(typeof result.data!.total_results, 'number');
  assertArray(result.data!.codes, 'codes 应该是数组');
  
  if (result.data!.codes.length > 0) {
    const code = result.data!.codes[0];
    assertExists(code.code, '应该有 code');
    assertExists(code.description, '应该有 description');
    
    log(`✓ 找到 ${result.data!.total_results} 个代码`, 's');
    log(`✓ 示例: ${code.code} - ${code.description}`, 'i');
  }
}

async function testLookupICDCodeByDescription() {
  log('测试: 通过描述查询 ICD-10', 'i');
  
  const client = new MedicalTerminologyClient({
    source: 'medical_terminology',
    baseUrl: config.baseUrl,
  });
  
  const result = await client.lookupICDCode({
    description: 'diabetes',
    maxResults: 5,
  });
  
  if (result.status === 'error') {
    throw new Error(`查询失败: ${result.error_message}`);
  }
  
  assertExists(result.data);
  assertEqual(result.data!.search_type, 'description');
  assertEqual(result.data!.search_term, 'diabetes');
  
  log(`✓ 找到 ${result.data!.total_results} 个相关代码`, 's');
}

async function testValidateCode() {
  log('测试: 验证 ICD-10 代码有效性', 'i');
  
  const client = new MedicalTerminologyClient({
    source: 'medical_terminology',
    baseUrl: config.baseUrl,
  });
  
  // 有效代码
  const validResult = await client.validateCode('E11.9');
  assertEqual(typeof validResult, 'boolean');
  log(`✓ E11.9 验证结果: ${validResult ? '有效' : '无效'}`, 's');
  
  // 另一个有效代码
  const validResult2 = await client.validateCode('A00');
  log(`✓ A00 验证结果: ${validResult2 ? '有效' : '无效'}`, 's');
}

async function testGetCodeDetails() {
  log('测试: 获取代码详情', 'i');
  
  const client = new MedicalTerminologyClient({
    source: 'medical_terminology',
    baseUrl: config.baseUrl,
  });
  
  const result = await client.getCodeDetails('E11');
  
  if (result.status === 'error') {
    log(`⚠ 获取详情失败（可能代码不存在）: ${result.error_message}`, 'w');
    return;
  }
  
  assertExists(result.data);
  assertExists(result.data!.code);
  assertExists(result.data!.description);
  assertExists(result.data!.url);
  
  log(`✓ 代码: ${result.data!.code}`, 's');
  log(`✓ 描述: ${result.data!.description}`, 'i');
}

async function testSearchAsPages() {
  log('测试: 搜索并返回标准页面格式', 'i');
  
  const client = new MedicalTerminologyClient({
    source: 'medical_terminology',
    baseUrl: config.baseUrl,
  });
  
  const results = await client.search({
    query: 'hypertension',
    maxResults: 5,
  });
  
  assertArray(results, '应该返回数组');
  
  if (results.length > 0) {
    const page = results[0];
    assertExists(page.url, '应该有 url');
    assertExists(page.title, '应该有 title');
    assertExists(page.content, '应该有 content');
    assertExists(page.metadata, '应该有 metadata');
    assertEqual(page.metadata.source, 'icd10');
    assertExists(page.metadata.icdCode, '应该有 icdCode');
    
    log(`✓ 找到 ${results.length} 个代码`, 's');
    log(`✓ 示例: ${page.title}`, 'i');
  }
}

async function testCodeFormatDetection() {
  log('测试: 代码格式自动检测', 'i');
  
  const client = new MedicalTerminologyClient({
    source: 'medical_terminology',
    baseUrl: config.baseUrl,
  });
  
  // 代码格式（如 A00）
  const codeResult = await client.search({ query: 'A00' });
  assertArray(codeResult);
  log(`✓ A00 作为代码查询，找到 ${codeResult.length} 个结果`, 's');
  
  // 描述格式
  const descResult = await client.search({ query: 'malaria' });
  assertArray(descResult);
  log(`✓ malaria 作为描述查询，找到 ${descResult.length} 个结果`, 's');
}

async function testRateLimit() {
  log('测试: 限流功能（连续请求）', 'i');
  
  const client = new MedicalTerminologyClient({
    source: 'medical_terminology',
    baseUrl: config.baseUrl,
  });
  
  const codes = ['E11', 'A00', 'I10', 'J45'];
  const startTime = Date.now();
  
  for (const code of codes) {
    const result = await client.lookupICDCode({ code, maxResults: 1 });
    if (result.status === 'error') {
      throw new Error(`查询 ${code} 失败: ${result.error_message}`);
    }
  }
  
  const duration = Date.now() - startTime;
  log(`✓ 4个请求共耗时 ${duration}ms`, 's');
}

async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}      Medical Terminology Client 真实请求测试        ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}\n`);
  
  const tests = [
    { name: '通过代码查询 ICD-10', fn: testLookupICDCodeByCode },
    { name: '通过描述查询 ICD-10', fn: testLookupICDCodeByDescription },
    { name: '验证代码有效性', fn: testValidateCode },
    { name: '获取代码详情', fn: testGetCodeDetails },
    { name: '标准页面格式', fn: testSearchAsPages },
    { name: '代码格式自动检测', fn: testCodeFormatDetection },
    { name: '限流功能测试', fn: testRateLimit },
  ];
  
  const results: TestResult[] = [];
  
  for (const test of tests) {
    log(`\n━━━ ${test.name} ━━━`, 'b');
    const result = await runTest(test.name, test.fn);
    results.push(result);
    
    if (result.ok) {
      log(`✓ 通过 (${result.duration}ms)`, 's');
    } else {
      log(`✗ 失败: ${result.err}`, 'e');
    }
    
    await sleep(500);
  }
  
  // 报告
  console.log(`\n${c.c}${'═'.repeat(56)}${c.reset}`);
  console.log(`${c.b}                    测试汇总报告                        ${c.reset}`);
  console.log(`${c.c}${'═'.repeat(56)}${c.reset}\n`);
  
  for (const result of results) {
    const icon = result.ok ? c.g + '✔' : c.r + '✗';
    const status = result.ok ? '通过' : '失败';
    console.log(`${icon} ${result.name}: ${status}${c.reset}`);
    if (!result.ok && result.err) {
      console.log(`  ${c.r}错误: ${result.err}${c.reset}`);
    }
  }
  
  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  
  console.log(`\n${c.c}${'═'.repeat(56)}${c.reset}`);
  console.log(`${c.b}总计: ${total} | ${c.g}通过: ${passed}${c.reset} | ${c.r}失败: ${total - passed}${c.reset}`);
  console.log(`${c.c}${'═'.repeat(56)}${c.reset}`);
  
  if (passed === total) {
    console.log(`\n${c.g}✨ 所有真实请求测试通过！${c.reset}\n`);
  } else {
    console.log(`\n${c.r}⚠ 部分测试失败${c.reset}\n`);
  }
  
  process.exit(passed === total ? 0 : 1);
}

main().catch(e => {
  log(`测试运行错误: ${e}`, 'e');
  process.exit(1);
});
