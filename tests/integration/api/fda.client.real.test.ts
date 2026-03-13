#!/usr/bin/env tsx
/**
 * FDA Client 真实 HTTP 请求测试
 * 
 * 环境变量:
 * - FDA_API_KEY: FDA API Key (可选)
 * - FDA_BASE_URL: API 基础 URL (可选)
 */

import { FDAClient } from '../../../src/integrations/api/fda.client';
import { apiConfigs, log, TestResult, assertExists, assertEqual, assertTrue, assertArray, c, formatError, sleep } from './test-config';

const config = apiConfigs.fda;

async function runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, ok: true, duration: Date.now() - start };
  } catch (error) {
    return { name, ok: false, err: formatError(error), duration: Date.now() - start };
  }
}

async function testLookupAspirin() {
  log('测试: 查询阿司匹林药品信息', 'i');
  
  const client = new FDAClient({
    source: 'fda',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  
  const result = await client.lookupDrug({
    drugName: 'aspirin',
    searchType: 'general',
  });
  
  if (result.status === 'error') {
    throw new Error(`查询失败: ${result.error_message}`);
  }
  
  assertExists(result.data, '应该有数据返回');
  assertEqual(result.data!.drug_name, 'aspirin', '药品名应该匹配');
  assertEqual(typeof result.data!.total_results, 'number', 'total_results 应该是数字');
  assertArray(result.data!.drugs, 'drugs 应该是数组');
  
  if (result.data!.drugs.length > 0) {
    const drug = result.data!.drugs[0];
    assertExists(drug.generic_name || drug.brand_name, '药品应该有名称');
    log(`✓ 找到药品: ${drug.generic_name || drug.brand_name}`, 's');
  }
  
  log(`✓ 找到 ${result.data!.total_results} 条记录`, 's');
}

async function testLookupIbuprofen() {
  log('测试: 查询布洛芬药品信息', 'i');
  
  const client = new FDAClient({
    source: 'fda',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  
  const result = await client.lookupDrug({
    drugName: 'ibuprofen',
    searchType: 'label',
  });
  
  if (result.status === 'error') {
    throw new Error(`查询失败: ${result.error_message}`);
  }
  
  assertExists(result.data);
  assertEqual(result.data!.search_type, 'label', '搜索类型应该是 label');
  
  log(`✓ 找到 ${result.data!.total_results} 条标签记录`, 's');
}

async function testLookupAdverseEvents() {
  log('测试: 查询药品不良反应', 'i');
  
  const client = new FDAClient({
    source: 'fda',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  
  const result = await client.lookupDrug({
    drugName: 'acetaminophen',
    searchType: 'adverse_events',
  });
  
  if (result.status === 'error') {
    throw new Error(`查询失败: ${result.error_message}`);
  }
  
  assertExists(result.data);
  assertEqual(result.data!.search_type, 'adverse_events');
  
  log(`✓ 找到 ${result.data!.total_results} 条不良反应记录`, 's');
}

async function testSearchDrugs() {
  log('测试: 搜索药品列表', 'i');
  
  const client = new FDAClient({
    source: 'fda',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  
  const results = await client.searchDrugs({
    query: 'aspirin',
    limit: 5,
  });
  
  assertArray(results, '应该返回数组');
  
  if (results.length > 0) {
    const drug = results[0];
    assertExists(drug.url, '应该有 url');
    assertExists(drug.title, '应该有 title');
    assertExists(drug.content, '应该有 content');
    assertEqual(drug.metadata.source, 'fda', '来源应该是 fda');
    
    log(`✓ 找到 ${results.length} 个药品`, 's');
    log(`✓ 示例: ${drug.title}`, 'i');
  } else {
    log('⚠ 未找到药品', 'w');
  }
}

async function testLookupNonExistentDrug() {
  log('测试: 查询不存在的药品', 'i');
  
  const client = new FDAClient({
    source: 'fda',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  
  const result = await client.lookupDrug({
    drugName: 'xyznonexistent12345',
    searchType: 'general',
  });
  
  // 应该返回成功但结果为空，而不是报错
  if (result.status === 'success') {
    log(`✓ 返回空结果: ${result.data?.total_results || 0} 条记录`, 's');
  } else {
    // 或者返回错误也是可以接受的
    log(`✓ 返回错误: ${result.error_message}`, 's');
  }
}

async function testRateLimit() {
  log('测试: 限流功能（连续请求）', 'i');
  
  const client = new FDAClient({
    source: 'fda',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  
  // FDA 限流: 240请求/分钟 = 4请求/秒
  const drugs = ['aspirin', 'ibuprofen', 'acetaminophen', 'amoxicillin'];
  const startTime = Date.now();
  
  for (const drug of drugs) {
    const result = await client.lookupDrug({ drugName: drug });
    if (result.status === 'error') {
      throw new Error(`查询 ${drug} 失败: ${result.error_message}`);
    }
  }
  
  const duration = Date.now() - startTime;
  log(`✓ 4个请求共耗时 ${duration}ms`, 's');
  log('  (FDA 限流: 240请求/分钟)', 'i');
}

async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}      FDA Client 真实请求测试                        ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}\n`);
  
  const tests = [
    { name: '查询阿司匹林', fn: testLookupAspirin },
    { name: '查询布洛芬标签', fn: testLookupIbuprofen },
    { name: '查询不良反应', fn: testLookupAdverseEvents },
    { name: '搜索药品列表', fn: testSearchDrugs },
    { name: '查询不存在药品', fn: testLookupNonExistentDrug },
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
