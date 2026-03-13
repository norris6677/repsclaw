#!/usr/bin/env tsx
/**
 * Clinical Trials Client 真实 HTTP 请求测试
 * 
 * 环境变量:
 * - CLINICAL_TRIALS_BASE_URL: API 基础 URL (可选)
 */

import { ClinicalTrialsClient } from '../../../src/integrations/api/clinical-trials.client';
import { apiConfigs, log, TestResult, assertExists, assertEqual, assertTrue, assertArray, c, formatError, sleep } from './test-config';

const config = apiConfigs.clinicalTrials;

async function runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, ok: true, duration: Date.now() - start };
  } catch (error) {
    return { name, ok: false, err: formatError(error), duration: Date.now() - start };
  }
}

async function testSearchCancerTrials() {
  log('测试: 搜索癌症临床试验', 'i');
  
  const client = new ClinicalTrialsClient({
    source: 'clinical_trials',
    baseUrl: config.baseUrl,
  });
  
  const result = await client.searchTrials({
    condition: 'cancer',
    status: 'recruiting',
    maxResults: 5,
  });
  
  if (result.status === 'error') {
    throw new Error(`搜索失败: ${result.error_message}`);
  }
  
  assertExists(result.data, '应该有数据返回');
  assertEqual(typeof result.data!.total_results, 'number');
  assertArray(result.data!.trials, 'trials 应该是数组');
  
  if (result.data!.trials.length > 0) {
    const trial = result.data!.trials[0];
    assertExists(trial.nct_id, '试验应该有 nct_id');
    assertExists(trial.title, '试验应该有 title');
    assertExists(trial.status, '试验应该有 status');
    assertArray(trial.phase, '应该有 phase 数组');
    assertArray(trial.conditions, '应该有 conditions 数组');
    
    log(`✓ 找到 ${result.data!.total_results} 个试验`, 's');
    log(`✓ 示例: ${trial.title?.substring(0, 60)}...`, 'i');
    log(`✓ 状态: ${trial.status}, 阶段: ${trial.phase?.join(', ') || 'N/A'}`, 'i');
  }
}

async function testSearchDiabetesTrials() {
  log('测试: 搜索糖尿病试验（已完成状态）', 'i');
  
  const client = new ClinicalTrialsClient({
    source: 'clinical_trials',
    baseUrl: config.baseUrl,
  });
  
  const result = await client.searchTrials({
    condition: 'diabetes',
    status: 'completed',
    maxResults: 3,
  });
  
  if (result.status === 'error') {
    throw new Error(`搜索失败: ${result.error_message}`);
  }
  
  assertExists(result.data);
  assertEqual(result.data!.search_status, 'completed');
  
  log(`✓ 找到 ${result.data!.total_results} 个已完成试验`, 's');
}

async function testSearchAllStatus() {
  log('测试: 搜索所有状态的试验', 'i');
  
  const client = new ClinicalTrialsClient({
    source: 'clinical_trials',
    baseUrl: config.baseUrl,
  });
  
  const result = await client.searchTrials({
    condition: 'heart disease',
    status: 'all',
    maxResults: 5,
  });
  
  if (result.status === 'error') {
    throw new Error(`搜索失败: ${result.error_message}`);
  }
  
  assertExists(result.data);
  
  log(`✓ 找到 ${result.data!.total_results} 个试验（所有状态）`, 's');
}

async function testSearchAsPages() {
  log('测试: 搜索并返回标准页面格式', 'i');
  
  const client = new ClinicalTrialsClient({
    source: 'clinical_trials',
    baseUrl: config.baseUrl,
  });
  
  const results = await client.search({
    query: 'COVID-19',
    status: 'completed',
    maxResults: 3,
  });
  
  assertArray(results, '应该返回数组');
  
  if (results.length > 0) {
    const page = results[0];
    assertExists(page.url, '应该有 url');
    assertExists(page.title, '应该有 title');
    assertExists(page.content, '应该有 content');
    assertExists(page.metadata, '应该有 metadata');
    assertEqual(page.metadata.source, 'clinical_trials');
    assertExists(page.metadata.nctId, '应该有 nctId');
    
    log(`✓ 找到 ${results.length} 个试验`, 's');
  }
}

async function testTrialEligibility() {
  log('测试: 验证试验包含资格信息', 'i');
  
  const client = new ClinicalTrialsClient({
    source: 'clinical_trials',
    baseUrl: config.baseUrl,
  });
  
  const result = await client.searchTrials({
    condition: 'hypertension',
    maxResults: 2,
  });
  
  if (result.status === 'error') {
    throw new Error(`搜索失败: ${result.error_message}`);
  }
  
  if (result.data!.trials.length > 0) {
    const trial = result.data!.trials[0];
    assertExists(trial.eligibility, '应该有 eligibility');
    assertExists(trial.eligibility.gender, '应该有 gender');
    assertExists(trial.eligibility.min_age, '应该有 min_age');
    assertExists(trial.eligibility.max_age, '应该有 max_age');
    
    log(`✓ 资格要求: ${trial.eligibility.gender}, 年龄: ${trial.eligibility.min_age} - ${trial.eligibility.max_age}`, 's');
  }
}

async function testRateLimit() {
  log('测试: 限流功能（连续请求）', 'i');
  
  const client = new ClinicalTrialsClient({
    source: 'clinical_trials',
    baseUrl: config.baseUrl,
  });
  
  const conditions = ['cancer', 'diabetes', 'asthma', 'depression'];
  const startTime = Date.now();
  
  for (const condition of conditions) {
    const result = await client.searchTrials({ condition, maxResults: 1 });
    if (result.status === 'error') {
      throw new Error(`查询 ${condition} 失败: ${result.error_message}`);
    }
  }
  
  const duration = Date.now() - startTime;
  log(`✓ 4个请求共耗时 ${duration}ms`, 's');
}

async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}      Clinical Trials Client 真实请求测试            ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}\n`);
  
  const tests = [
    { name: '搜索癌症试验', fn: testSearchCancerTrials },
    { name: '搜索糖尿病试验（已完成）', fn: testSearchDiabetesTrials },
    { name: '搜索所有状态试验', fn: testSearchAllStatus },
    { name: '标准页面格式', fn: testSearchAsPages },
    { name: '试验资格信息', fn: testTrialEligibility },
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
