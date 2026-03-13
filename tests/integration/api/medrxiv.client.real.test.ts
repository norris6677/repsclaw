#!/usr/bin/env tsx
/**
 * MedRxiv Client 真实 HTTP 请求测试
 * 
 * 环境变量:
 * - MEDRXIV_BASE_URL: API 基础 URL (可选)
 */

import { MedRxivClient } from '../../../src/integrations/api/medrxiv.client';
import { apiConfigs, log, TestResult, assertExists, assertEqual, assertTrue, assertArray, c, formatError, sleep } from './test-config';

const config = apiConfigs.medrxiv;

async function runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, ok: true, duration: Date.now() - start };
  } catch (error) {
    return { name, ok: false, err: formatError(error), duration: Date.now() - start };
  }
}

async function testSearchCOVIDPapers() {
  log('测试: 搜索 COVID-19 预印本', 'i');
  
  const client = new MedRxivClient({
    source: 'medrxiv',
    baseUrl: config.baseUrl,
  });
  
  const result = await client.search({
    query: 'COVID-19',
    maxResults: 5,
    server: 'medrxiv',
  });
  
  if (result.status === 'error') {
    throw new Error(`搜索失败: ${result.error_message}`);
  }
  
  assertExists(result.data, '应该有数据返回');
  assertEqual(result.data!.query, 'COVID-19');
  assertEqual(typeof result.data!.total_results, 'number');
  assertArray(result.data!.articles, 'articles 应该是数组');
  
  if (result.data!.articles.length > 0) {
    const article = result.data!.articles[0];
    assertExists(article.title, '应该有 title');
    assertExists(article.doi, '应该有 doi');
    assertArray(article.authors, '应该有 authors 数组');
    assertExists(article.abstract_url, '应该有 abstract_url');
    assertExists(article.publication_date, '应该有 publication_date');
    assertEqual(article.server, 'medrxiv');
    
    log(`✓ 找到 ${result.data!.total_results} 篇文章`, 's');
    log(`✓ 示例: ${article.title?.substring(0, 60)}...`, 'i');
    log(`✓ DOI: ${article.doi}`, 'i');
  }
}

async function testSearchBioRxiv() {
  log('测试: 搜索 bioRxiv 预印本', 'i');
  
  const client = new MedRxivClient({
    source: 'medrxiv',
    baseUrl: config.baseUrl,
  });
  
  const result = await client.search({
    query: 'genomics',
    maxResults: 3,
    server: 'biorxiv',
  });
  
  if (result.status === 'error') {
    throw new Error(`搜索失败: ${result.error_message}`);
  }
  
  assertExists(result.data);
  
  if (result.data!.articles.length > 0) {
    assertEqual(result.data!.articles[0].server, 'biorxiv');
  }
  
  log(`✓ 找到 ${result.data!.total_results} 篇 bioRxiv 文章`, 's');
}

async function testSearchAsPages() {
  log('测试: 搜索并返回标准页面格式', 'i');
  
  const client = new MedRxivClient({
    source: 'medrxiv',
    baseUrl: config.baseUrl,
  });
  
  const results = await client.searchAsPages({
    query: 'vaccine',
    maxResults: 3,
  });
  
  assertArray(results, '应该返回数组');
  
  if (results.length > 0) {
    const page = results[0];
    assertExists(page.url, '应该有 url');
    assertExists(page.title, '应该有 title');
    assertExists(page.content, '应该有 content');
    assertExists(page.metadata, '应该有 metadata');
    assertEqual(page.metadata.source, 'medrxiv');
    assertExists(page.metadata.doi, '应该有 doi');
    
    log(`✓ 找到 ${results.length} 篇文章`, 's');
  }
}

async function testGetRecentPapers() {
  log('测试: 获取最新预印本', 'i');
  
  const client = new MedRxivClient({
    source: 'medrxiv',
    baseUrl: config.baseUrl,
  });
  
  const result = await client.getRecentPapers({
    maxResults: 5,
    days: 30,
    server: 'medrxiv',
  });
  
  if (result.status === 'error') {
    throw new Error(`获取失败: ${result.error_message}`);
  }
  
  assertExists(result.data);
  assertArray(result.data!.articles, '应该有 articles 数组');
  
  log(`✓ 找到 ${result.data!.total_results} 篇最近文章`, 's');
}

async function testWithDateRange() {
  log('测试: 指定日期范围搜索', 'i');
  
  const client = new MedRxivClient({
    source: 'medrxiv',
    baseUrl: config.baseUrl,
  });
  
  const result = await client.search({
    query: 'cancer',
    maxResults: 3,
    days: 365, // 最近一年
  });
  
  if (result.status === 'error') {
    throw new Error(`搜索失败: ${result.error_message}`);
  }
  
  assertExists(result.data);
  
  log(`✓ 找到 ${result.data!.total_results} 篇文章（最近一年）`, 's');
}

async function testRateLimit() {
  log('测试: 限流功能（连续请求）', 'i');
  
  const client = new MedRxivClient({
    source: 'medrxiv',
    baseUrl: config.baseUrl,
  });
  
  const queries = ['COVID', 'diabetes', 'cancer', 'heart'];
  const startTime = Date.now();
  
  for (const query of queries) {
    const result = await client.search({ query, maxResults: 1 });
    if (result.status === 'error') {
      throw new Error(`查询 ${query} 失败: ${result.error_message}`);
    }
  }
  
  const duration = Date.now() - startTime;
  log(`✓ 4个请求共耗时 ${duration}ms`, 's');
}

async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}      MedRxiv Client 真实请求测试                    ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}\n`);
  
  const tests = [
    { name: '搜索 COVID-19 预印本', fn: testSearchCOVIDPapers },
    { name: '搜索 bioRxiv 预印本', fn: testSearchBioRxiv },
    { name: '标准页面格式', fn: testSearchAsPages },
    { name: '获取最新预印本', fn: testGetRecentPapers },
    { name: '指定日期范围搜索', fn: testWithDateRange },
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
    
    await sleep(1000); // medRxiv 限流较严格，增加延迟
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
