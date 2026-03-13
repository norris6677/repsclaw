#!/usr/bin/env tsx
/**
 * PubMed Client 真实 HTTP 请求测试
 * 
 * 环境变量:
 * - PUBMED_API_KEY: NCBI API Key (可选，但建议设置以提高限流)
 * - PUBMED_BASE_URL: API 基础 URL (可选)
 */

import { PubMedClient } from '../../../src/integrations/api/pubmed.client';
import { apiConfigs, log, TestResult, assertExists, assertEqual, assertTrue, assertArray, assertObject, c, formatError, sleep } from './test-config';

const config = apiConfigs.pubmed;

async function runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, ok: true, duration: Date.now() - start };
  } catch (error) {
    return { name, ok: false, err: formatError(error), duration: Date.now() - start };
  }
}

async function testSearchDiabetes() {
  log('测试: 搜索糖尿病相关文献', 'i');
  
  const client = new PubMedClient({
    source: 'pubmed',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  
  const result = await client.search({
    query: 'diabetes',
    maxResults: 5,
    sort: 'relevance',
  });
  
  if (result.status === 'error') {
    throw new Error(`搜索失败: ${result.error_message}`);
  }
  
  assertExists(result.data, '应该有数据返回');
  assertEqual(typeof result.data!.total_results, 'number', 'total_results 应该是数字');
  assertArray(result.data!.articles, 'articles 应该是数组');
  assertTrue(result.data!.articles.length > 0, '应该返回至少一篇文章');
  
  // 验证文章结构
  const article = result.data!.articles[0];
  assertExists(article.id, '文章应该有 id');
  assertExists(article.title, '文章应该有 title');
  assertArray(article.authors, '文章应该有 authors 数组');
  assertExists(article.abstract_url, '文章应该有 abstract_url');
  
  log(`✓ 找到 ${result.data!.total_results} 篇相关文献`, 's');
  log(`✓ 示例文章: ${article.title?.substring(0, 60)}...`, 'i');
}

async function testSearchWithDateRange() {
  log('测试: 搜索带日期范围的文献', 'i');
  
  const client = new PubMedClient({
    source: 'pubmed',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  
  const result = await client.search({
    query: 'COVID-19',
    maxResults: 3,
    dateRange: '2', // 最近2年
    openAccess: true,
  });
  
  if (result.status === 'error') {
    throw new Error(`搜索失败: ${result.error_message}`);
  }
  
  assertExists(result.data);
  assertEqual(result.data!.open_access, true, '应该标记为开放获取');
  assertExists(result.data!.date_range, '应该有日期范围');
  
  log(`✓ 找到 ${result.data!.total_results} 篇开放获取文献`, 's');
}

async function testFetchDetails() {
  log('测试: 获取文献详情', 'i');
  
  const client = new PubMedClient({
    source: 'pubmed',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  
  // 先搜索获取一些 ID
  const searchResult = await client.search({
    query: 'aspirin',
    maxResults: 2,
  });
  
  if (searchResult.status === 'error' || !searchResult.data) {
    throw new Error('搜索失败，无法获取详情');
  }
  
  const ids = searchResult.data.articles.map(a => a.id);
  if (ids.length === 0) {
    log('⚠ 没有找到文章，跳过详情测试', 'w');
    return;
  }
  
  const details = await client.fetchDetails(ids);
  
  assertArray(details, '应该返回数组');
  assertEqual(details.length, ids.length, '返回数量应该与请求数量一致');
  
  const detail = details[0];
  assertExists(detail.url, '详情应该有 url');
  assertExists(detail.title, '详情应该有 title');
  assertExists(detail.content, '详情应该有 content');
  assertExists(detail.metadata, '详情应该有 metadata');
  assertEqual(detail.metadata.source, 'pubmed', '来源应该是 pubmed');
  
  log(`✓ 成功获取 ${details.length} 篇文献详情`, 's');
}

async function testFetchAbstracts() {
  log('测试: 获取文献摘要', 'i');
  
  const client = new PubMedClient({
    source: 'pubmed',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  
  // 先搜索获取一个 ID
  const searchResult = await client.search({
    query: 'hypertension',
    maxResults: 1,
  });
  
  if (searchResult.status === 'error' || !searchResult.data) {
    throw new Error('搜索失败');
  }
  
  const ids = searchResult.data.articles.map(a => a.id);
  if (ids.length === 0) {
    log('⚠ 没有找到文章，跳过摘要测试', 'w');
    return;
  }
  
  const abstracts = await client.fetchAbstracts(ids);
  
  assertObject(abstracts, '应该返回对象');
  
  log(`✓ 成功获取摘要`, 's');
}

async function testRateLimit() {
  log('测试: 限流功能（连续请求）', 'i');
  
  const client = new PubMedClient({
    source: 'pubmed',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  
  // 连续发起 5 个请求，测试限流
  const queries = ['cancer', 'heart', 'brain', 'liver', 'kidney'];
  const startTime = Date.now();
  
  for (const query of queries) {
    const result = await client.search({ query, maxResults: 1 });
    if (result.status === 'error') {
      throw new Error(`查询 ${query} 失败: ${result.error_message}`);
    }
  }
  
  const duration = Date.now() - startTime;
  log(`✓ 5个请求共耗时 ${duration}ms`, 's');
  
  // 有 API key 时应该更快，但没有时不应该失败
  if (!config.apiKey) {
    log('  (未设置 API Key，使用 3请求/秒 限流)', 'i');
  }
}

async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}      PubMed Client 真实请求测试                     ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}\n`);
  
  if (!config.apiKey) {
    log('⚠ 未设置 PUBMED_API_KEY，将使用 3请求/秒 限流', 'w');
    log('  建议设置 API Key 以获得更高的限流阈值 (10请求/秒)', 'i');
    console.log();
  }
  
  const tests = [
    { name: '搜索糖尿病文献', fn: testSearchDiabetes },
    { name: '搜索带日期范围', fn: testSearchWithDateRange },
    { name: '获取文献详情', fn: testFetchDetails },
    { name: '获取文献摘要', fn: testFetchAbstracts },
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
    
    // 请求间添加延迟，避免触发限流
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
