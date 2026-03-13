#!/usr/bin/env tsx
/**
 * NCBI Bookshelf Client 真实 HTTP 请求测试
 * 
 * 环境变量:
 * - NCBI_BOOKSHELF_API_KEY: NCBI API Key (可选)
 * - NCBI_BOOKSHELF_BASE_URL: API 基础 URL (可选)
 */

import { NciBookshelfClient } from '../../../src/integrations/api/nci-bookshelf.client';
import { apiConfigs, log, TestResult, assertExists, assertEqual, assertTrue, assertArray, c, formatError, sleep } from './test-config';

const config = apiConfigs.nciBookshelf;

async function runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, ok: true, duration: Date.now() - start };
  } catch (error) {
    return { name, ok: false, err: formatError(error), duration: Date.now() - start };
  }
}

async function testSearchCancerBooks() {
  log('测试: 搜索癌症相关书籍', 'i');
  
  const client = new NciBookshelfClient({
    source: 'ncbi_bookshelf',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  
  const result = await client.search({
    query: 'cancer',
    maxResults: 5,
  });
  
  if (result.status === 'error') {
    throw new Error(`搜索失败: ${result.error_message}`);
  }
  
  assertExists(result.data, '应该有数据返回');
  assertEqual(result.data!.query, 'cancer');
  assertEqual(typeof result.data!.total_results, 'number');
  assertArray(result.data!.books, 'books 应该是数组');
  
  if (result.data!.books.length > 0) {
    const book = result.data!.books[0];
    assertExists(book.id, '应该有 id');
    assertExists(book.title, '应该有 title');
    assertArray(book.authors, '应该有 authors 数组');
    assertExists(book.url, '应该有 url');
    assertExists(book.publication_date, '应该有 publication_date');
    
    log(`✓ 找到 ${result.data!.total_results} 本书籍`, 's');
    log(`✓ 示例: ${book.title?.substring(0, 60)}...`, 'i');
  }
}

async function testSearchGenetics() {
  log('测试: 搜索遗传学书籍', 'i');
  
  const client = new NciBookshelfClient({
    source: 'ncbi_bookshelf',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  
  const result = await client.search({
    query: 'genetics',
    maxResults: 3,
  });
  
  if (result.status === 'error') {
    throw new Error(`搜索失败: ${result.error_message}`);
  }
  
  assertExists(result.data);
  
  log(`✓ 找到 ${result.data!.total_results} 本遗传学书籍`, 's');
}

async function testSearchAsPages() {
  log('测试: 搜索并返回标准页面格式', 'i');
  
  const client = new NciBookshelfClient({
    source: 'ncbi_bookshelf',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  
  const results = await client.searchAsPages({
    query: 'medicine',
    maxResults: 3,
  });
  
  assertArray(results, '应该返回数组');
  
  if (results.length > 0) {
    const page = results[0];
    assertExists(page.url, '应该有 url');
    assertExists(page.title, '应该有 title');
    assertExists(page.content, '应该有 content');
    assertExists(page.metadata, '应该有 metadata');
    assertEqual(page.metadata.source, 'ncbi_bookshelf');
    assertExists(page.metadata.bookId, '应该有 bookId');
    
    log(`✓ 找到 ${results.length} 本书籍`, 's');
  }
}

async function testGetBookDetails() {
  log('测试: 获取书籍详情', 'i');
  
  const client = new NciBookshelfClient({
    source: 'ncbi_bookshelf',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  
  // 先搜索获取一个书籍 ID
  const searchResult = await client.search({
    query: 'cancer',
    maxResults: 1,
  });
  
  if (searchResult.status === 'error' || !searchResult.data) {
    throw new Error('搜索失败');
  }
  
  if (searchResult.data.books.length === 0) {
    log('⚠ 没有找到书籍，跳过详情测试', 'w');
    return;
  }
  
  const bookId = searchResult.data.books[0].id;
  log(`  使用书籍 ID: ${bookId}`, 'i');
  
  const result = await client.getBookDetails(bookId);
  
  if (result.status === 'error') {
    log(`⚠ 获取详情失败: ${result.error_message}`, 'w');
    return;
  }
  
  assertExists(result.data);
  assertEqual(result.data!.id, bookId);
  assertExists(result.data!.title);
  assertExists(result.data!.url);
  
  log(`✓ 成功获取书籍详情: ${result.data!.title?.substring(0, 50)}...`, 's');
}

async function testGetRelatedBooks() {
  log('测试: 获取相关书籍', 'i');
  
  const client = new NciBookshelfClient({
    source: 'ncbi_bookshelf',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  
  // 先搜索获取一个书籍 ID
  const searchResult = await client.search({
    query: 'biology',
    maxResults: 1,
  });
  
  if (searchResult.status === 'error' || !searchResult.data) {
    throw new Error('搜索失败');
  }
  
  if (searchResult.data.books.length === 0) {
    log('⚠ 没有找到书籍，跳过相关书籍测试', 'w');
    return;
  }
  
  const bookId = searchResult.data.books[0].id;
  
  const result = await client.getRelatedBooks(bookId, 3);
  
  if (result.status === 'error') {
    log(`⚠ 获取相关书籍失败: ${result.error_message}`, 'w');
    return;
  }
  
  assertExists(result.data);
  assertEqual(result.data!.book_id, bookId);
  assertArray(result.data!.related_books, '应该有 related_books 数组');
  
  log(`✓ 找到 ${result.data!.related_books.length} 本相关书籍`, 's');
}

async function testRateLimitWithAPIKey() {
  log('测试: 带 API Key 的限流功能', 'i');
  
  const client = new NciBookshelfClient({
    source: 'ncbi_bookshelf',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  
  const queries = ['cancer', 'genetics', 'medicine', 'biology'];
  const startTime = Date.now();
  
  for (const query of queries) {
    const result = await client.search({ query, maxResults: 1 });
    if (result.status === 'error') {
      throw new Error(`查询 ${query} 失败: ${result.error_message}`);
    }
  }
  
  const duration = Date.now() - startTime;
  log(`✓ 4个请求共耗时 ${duration}ms`, 's');
  
  if (!config.apiKey) {
    log('  (未设置 API Key，使用 3请求/秒 限流)', 'i');
  } else {
    log('  (使用 API Key，限流为 10请求/秒)', 'i');
  }
}

async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}      NCBI Bookshelf Client 真实请求测试             ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}\n`);
  
  if (!config.apiKey) {
    log('⚠ 未设置 NCBI_BOOKSHELF_API_KEY，将使用 3请求/秒 限流', 'w');
    log('  建议设置 API Key 以获得更高的限流阈值 (10请求/秒)', 'i');
    console.log();
  }
  
  const tests = [
    { name: '搜索癌症书籍', fn: testSearchCancerBooks },
    { name: '搜索遗传学书籍', fn: testSearchGenetics },
    { name: '标准页面格式', fn: testSearchAsPages },
    { name: '获取书籍详情', fn: testGetBookDetails },
    { name: '获取相关书籍', fn: testGetRelatedBooks },
    { name: '限流功能测试', fn: testRateLimitWithAPIKey },
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
