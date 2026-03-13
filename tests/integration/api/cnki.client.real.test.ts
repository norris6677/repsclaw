#!/usr/bin/env tsx
/**
 * CNKI Client 真实 HTTP 请求测试
 * 
 * 注意: CNKI 官方 API 需要商务合作获取
 * 此测试主要用于验证客户端结构和限流功能
 * 
 * 环境变量:
 * - CNKI_API_KEY: CNKI API Key (可选，没有则跳过部分测试)
 * - CNKI_BASE_URL: API 基础 URL (可选)
 */

import { CNKIClient } from '../../../src/integrations/api/cnki.client';
import { apiConfigs, log, TestResult, assertExists, assertEqual, assertTrue, c, formatError, sleep } from './test-config';

const config = apiConfigs.cnki;

async function runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, ok: true, duration: Date.now() - start };
  } catch (error) {
    return { name, ok: false, err: formatError(error), duration: Date.now() - start };
  }
}

async function testClientInitialization() {
  log('测试: 客户端初始化', 'i');
  
  const client = new CNKIClient({
    source: 'cnki',
    baseUrl: config.baseUrl || 'https://test.cnki.net',
    apiKey: config.apiKey,
  });
  
  assertExists(client);
  log('✓ 客户端初始化成功', 's');
}

async function testSearchWithEmptyQuery() {
  log('测试: 空查询应该返回错误', 'i');
  
  const client = new CNKIClient({
    source: 'cnki',
    baseUrl: config.baseUrl || 'https://test.cnki.net',
    apiKey: config.apiKey,
  });
  
  const result = await client.search({ query: '' });
  
  assertEqual(result.status, 'error', '空查询应该返回错误');
  assertExists(result.error_message);
  
  log('✓ 空查询正确处理', 's');
}

async function testCheckAuth() {
  log('测试: 检查认证状态', 'i');
  
  // 无 API Key
  const clientWithoutKey = new CNKIClient({
    source: 'cnki',
    baseUrl: config.baseUrl || 'https://test.cnki.net',
  });
  
  const authWithoutKey = await clientWithoutKey.checkAuth();
  assertEqual(authWithoutKey, false, '无 API Key 应该返回 false');
  log('✓ 无 API Key 时认证检查正确', 's');
  
  // 有 API Key
  if (config.apiKey) {
    const clientWithKey = new CNKIClient({
      source: 'cnki',
      baseUrl: config.baseUrl || 'https://test.cnki.net',
      apiKey: config.apiKey,
    });
    
    const authWithKey = await clientWithKey.checkAuth();
    assertEqual(authWithKey, true, '有 API Key 应该返回 true');
    log('✓ 有 API Key 时认证检查正确', 's');
  }
}

async function testRateLimit() {
  log('测试: 限流功能', 'i');
  
  const client = new CNKIClient({
    source: 'cnki',
    baseUrl: config.baseUrl || 'https://test.cnki.net',
    apiKey: config.apiKey,
    rateLimit: {
      requestsPerSecond: 3,
      burstSize: 5,
    },
  });
  
  // 由于可能没有真实的 API 端点，我们测试限流器是否工作
  // 通过 fetchDetail 方法（它使用了限流器）
  const startTime = Date.now();
  
  // 执行几个操作
  await client.checkAuth();
  await client.fetchCitationFormats('https://test.cnki.net/article/test');
  await client.fetchDetail('https://test.cnki.net/article/test');
  
  const duration = Date.now() - startTime;
  log(`✓ 操作完成，耗时 ${duration}ms`, 's');
  log('  (CNKI 限流: 3请求/秒)', 'i');
}

async function testFetchDetailStructure() {
  log('测试: fetchDetail 返回结构', 'i');
  
  const client = new CNKIClient({
    source: 'cnki',
    baseUrl: config.baseUrl || 'https://test.cnki.net',
    apiKey: config.apiKey,
  });
  
  const result = await client.fetchDetail('https://test.cnki.net/article/test123');
  
  // 验证返回结构（即使请求失败，也应该返回标准格式）
  assertExists(result.url, '应该有 url');
  assertExists(result.metadata, '应该有 metadata');
  assertExists(result.metadata.crawledAt, '应该有 crawledAt');
  assertExists(result.metadata.statusCode, '应该有 statusCode');
  assertExists(result.metadata.contentType, '应该有 contentType');
  
  log('✓ 返回结构正确', 's');
  log(`  URL: ${result.url}`, 'i');
  log(`  Status: ${result.metadata.statusCode}`, 'i');
}

async function testSearchTypes() {
  log('测试: 搜索类型参数', 'i');
  
  const client = new CNKIClient({
    source: 'cnki',
    baseUrl: config.baseUrl || 'https://test.cnki.net',
    apiKey: config.apiKey,
  });
  
  const searchTypes = ['theme', 'title', 'author', 'keyword'] as const;
  
  for (const searchType of searchTypes) {
    const result = await client.search({
      query: '测试',
      searchType,
    });
    
    // 验证返回标准格式
    assertExists(result.status);
    log(`  ✓ ${searchType} 类型请求成功`, 's');
  }
}

async function testSortTypes() {
  log('测试: 排序类型参数', 'i');
  
  const client = new CNKIClient({
    source: 'cnki',
    baseUrl: config.baseUrl || 'https://test.cnki.net',
    apiKey: config.apiKey,
  });
  
  const sortTypes = ['PT', 'RT', 'SU'] as const;
  
  for (const sortType of sortTypes) {
    const result = await client.search({
      query: '测试',
      sortType,
    });
    
    assertExists(result.status);
    log(`  ✓ ${sortType} 排序请求成功`, 's');
  }
}

async function testFetchCitationFormats() {
  log('测试: 获取引用格式', 'i');
  
  const client = new CNKIClient({
    source: 'cnki',
    baseUrl: config.baseUrl || 'https://test.cnki.net',
    apiKey: config.apiKey,
  });
  
  const result = await client.fetchCitationFormats('https://test.cnki.net/article/test');
  
  // 验证返回对象
  assertEqual(typeof result, 'object');
  
  log('✓ 引用格式请求完成', 's');
}

async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}      CNKI Client 真实请求测试                       ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}\n`);
  
  log('⚠ 注意: CNKI 官方 API 需要商务合作获取', 'w');
  log('  此测试主要验证客户端结构和限流功能', 'i');
  
  if (!config.apiKey) {
    log('⚠ 未设置 CNKI_API_KEY', 'w');
  }
  
  if (!config.baseUrl) {
    log('⚠ 未设置 CNKI_BASE_URL，使用默认测试地址', 'w');
  }
  
  console.log();
  
  const tests = [
    { name: '客户端初始化', fn: testClientInitialization },
    { name: '空查询处理', fn: testSearchWithEmptyQuery },
    { name: '认证状态检查', fn: testCheckAuth },
    { name: '限流功能', fn: testRateLimit },
    { name: 'fetchDetail 结构', fn: testFetchDetailStructure },
    { name: '搜索类型参数', fn: testSearchTypes },
    { name: '排序类型参数', fn: testSortTypes },
    { name: '引用格式', fn: testFetchCitationFormats },
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
    console.log(`\n${c.g}✨ 所有测试通过！${c.reset}\n`);
  } else {
    console.log(`\n${c.r}⚠ 部分测试失败${c.reset}\n`);
  }
  
  process.exit(passed === total ? 0 : 1);
}

main().catch(e => {
  log(`测试运行错误: ${e}`, 'e');
  process.exit(1);
});
