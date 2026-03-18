#!/usr/bin/env tsx
/**
 * Hospital News HTTP 真实环境测试
 * 测试医院新闻查询 HTTP 端点的实际响应
 *
 * 需要 OpenClaw 服务器运行在本地，或者使用模拟的 API 对象
 */

import { log, TestResult, assertExists, assertEqual, assertTrue, c, formatError, sleep } from '../api/test-config';
import * as http from 'http';
import * as https from 'https';

// 测试配置
const TEST_CONFIG = {
  baseUrl: process.env.REPSCLAW_TEST_URL || 'http://localhost:3000',
  timeout: 30000,
};

interface HttpResponse {
  statusCode: number;
  data: any;
  headers: http.IncomingHttpHeaders;
}

// HTTP 请求工具
async function httpRequest(
  path: string,
  method: string = 'GET',
  query?: Record<string, string>
): Promise<HttpResponse> {
  const url = new URL(path, TEST_CONFIG.baseUrl);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      timeout: TEST_CONFIG.timeout,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode || 0,
            data: data ? JSON.parse(data) : null,
            headers: res.headers,
          });
        } catch {
          resolve({
            statusCode: res.statusCode || 0,
            data: data,
            headers: res.headers,
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, ok: true, duration: Date.now() - start };
  } catch (error) {
    return { name, ok: false, err: formatError(error), duration: Date.now() - start };
  }
}

// ===== 基础健康检查 =====

async function testHealthEndpoint() {
  log('测试: 健康检查端点', 'i');

  const response = await httpRequest('/api/repsclaw/health');

  assertEqual(response.statusCode, 200, '健康检查应该返回 200');
  assertExists(response.data, '应该返回数据');
  assertEqual(response.data.status, 'ok', '状态应该是 ok');

  log(`✓ 服务状态: ${response.data.status}`, 's');
}

// ===== 医院新闻端点测试 =====

async function testHospitalNewsKnownHospital() {
  log('测试: 查询已知医院新闻', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '北京协和医院',
    days: '7',
    maxResults: '5',
  });

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertExists(response.data, '应该返回数据');

  if (response.data.status === 'success') {
    assertEqual(response.data.data.hospital.resolved, '北京协和医院');
    log(`✓ 找到 ${response.data.data.totalFound} 条新闻`, 's');
  } else {
    log(`⚠ 查询返回错误: ${response.data.error?.message || '未知错误'}`, 'w');
  }
}

async function testHospitalNewsWithAlias() {
  log('测试: 使用别名查询医院新闻', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '协和',
    days: '7',
    maxResults: '5',
  });

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertExists(response.data, '应该返回数据');

  if (response.data.status === 'success') {
    assertEqual(response.data.data.hospital.resolved, '北京协和医院');
    log(`✓ 别名解析成功: 协和 -> 北京协和医院`, 's');
  }
}

async function testHospitalNewsUnknownHospital() {
  log('测试: 查询未知医院', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '完全不存在的医院XYZ123',
    days: '7',
    maxResults: '5',
  });

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertEqual(response.data.status, 'error', '应该返回错误状态');
  assertEqual(response.data.error?.code, 'HOSPITAL_NOT_FOUND', '错误码应该是 HOSPITAL_NOT_FOUND');

  log(`✓ 正确处理未知医院`, 's');
}

async function testHospitalNewsWithKeywords() {
  log('测试: 使用关键词过滤', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '北京协和医院',
    days: '30',
    maxResults: '10',
    keywords: '科研',
  });

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertExists(response.data, '应该返回数据');

  log(`✓ 关键词过滤请求成功`, 's');
}

async function testHospitalNewsWithSources() {
  log('测试: 指定数据源类型', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '北京协和医院',
    days: '7',
    maxResults: '5',
    sources: 'hospital_self,official',
  });

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertExists(response.data, '应该返回数据');

  log(`✓ 数据源过滤请求成功`, 's');
}

async function testHospitalNewsInvalidParams() {
  log('测试: 无效参数', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '',
    days: '7',
  });

  assertEqual(response.statusCode, 400, '应该返回 400');
  assertEqual(response.data.status, 'error', '应该返回错误状态');

  log(`✓ 正确处理无效参数`, 's');
}

async function testHospitalNewsResponseStructure() {
  log('测试: 响应结构完整性', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '北京协和医院',
    days: '7',
    maxResults: '5',
  });

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertExists(response.data, '应该返回数据');

  if (response.data.status === 'success') {
    const data = response.data.data;
    assertExists(data.hospital, '应该包含 hospital');
    assertExists(data.hospital.input, '应该包含 hospital.input');
    assertExists(data.hospital.resolved, '应该包含 hospital.resolved');
    assertExists(data.hospital.aliases, '应该包含 hospital.aliases');
    assertExists(data.query, '应该包含 query');
    assertExists(data.totalFound, '应该包含 totalFound');
    assertExists(data.results, '应该包含 results');
    assertExists(data.sourceStats, '应该包含 sourceStats');
    assertExists(data.meta, '应该包含 meta');

    log(`✓ 响应结构完整`, 's');
  }
}

// ===== 多医院查询测试 =====

async function testHospitalNewsMultipleHospitals() {
  log('测试: 查询多个不同医院', 'i');

  const hospitals = ['北京协和医院', '四川大学华西医院', '复旦大学附属华山医院'];

  for (const hospital of hospitals) {
    const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
      hospitalName: hospital,
      days: '7',
      maxResults: '3',
    });

    assertEqual(response.statusCode, 200, `${hospital} 查询应该返回 200`);

    if (response.data.status === 'success') {
      log(`  ✓ ${hospital}: ${response.data.data.totalFound} 条新闻`, 's');
    } else {
      log(`  ⚠ ${hospital}: ${response.data.error?.message || '查询失败'}`, 'w');
    }

    await sleep(500);
  }

  log(`✓ 多医院查询完成`, 's');
}

// ===== 性能测试 =====

async function testPerformance() {
  log('测试: 新闻端点性能', 'i');

  const iterations = 5;
  const startTime = Date.now();

  for (let i = 0; i < iterations; i++) {
    await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
      hospitalName: '北京协和医院',
      days: '7',
      maxResults: '5',
    });
    await sleep(200);
  }

  const duration = Date.now() - startTime;
  const avgDuration = duration / iterations;

  log(`✓ ${iterations} 次请求平均耗时: ${avgDuration.toFixed(2)}ms`, 's');
}

// ===== 主函数 =====

async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}      Hospital News HTTP 真实环境测试               ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}\n`);

  log(`测试目标: ${TEST_CONFIG.baseUrl}`, 'i');
  console.log();

  const tests = [
    { name: '健康检查端点', fn: testHealthEndpoint, critical: true },
    { name: '查询已知医院新闻', fn: testHospitalNewsKnownHospital },
    { name: '使用别名查询', fn: testHospitalNewsWithAlias },
    { name: '查询未知医院', fn: testHospitalNewsUnknownHospital },
    { name: '使用关键词过滤', fn: testHospitalNewsWithKeywords },
    { name: '指定数据源类型', fn: testHospitalNewsWithSources },
    { name: '无效参数处理', fn: testHospitalNewsInvalidParams },
    { name: '响应结构完整性', fn: testHospitalNewsResponseStructure },
    { name: '查询多个不同医院', fn: testHospitalNewsMultipleHospitals },
    { name: '性能测试', fn: testPerformance },
  ];

  const results: TestResult[] = [];
  let criticalFailed = false;

  for (const test of tests) {
    if (criticalFailed && !test.critical) {
      log(`\n━━━ ${test.name} ━━━`, 'b');
      log('跳过（关键测试失败）', 'w');
      results.push({ name: test.name, ok: false, err: 'Skipped due to critical failure' });
      continue;
    }

    log(`\n━━━ ${test.name} ━━━`, 'b');
    const result = await runTest(test.name, test.fn);
    results.push(result);

    if (result.ok) {
      log(`✓ 通过 (${result.duration}ms)`, 's');
    } else {
      log(`✗ 失败: ${result.err}`, 'e');
      if (test.critical) {
        criticalFailed = true;
        log('关键测试失败，后续测试将跳过', 'e');
      }
    }

    await sleep(200);
  }

  // 报告
  console.log(`\n${c.c}${'═'.repeat(56)}${c.reset}`);
  console.log(`${c.b}                    测试汇总报告                        ${c.reset}`);
  console.log(`${c.c}${'═'.repeat(56)}${c.reset}\n`);

  for (const result of results) {
    const icon = result.ok ? c.g + '✔' : c.r + '✗';
    const status = result.ok ? '通过' : '失败';
    console.log(`${icon} ${result.name}: ${status}${c.reset}`);
    if (!result.ok && result.err && !result.err.includes('Skipped')) {
      console.log(`  ${c.r}错误: ${result.err}${c.reset}`);
    }
  }

  const passed = results.filter(r => r.ok).length;
  const total = results.length;

  console.log(`\n${c.c}${'═'.repeat(56)}${c.reset}`);
  console.log(`${c.b}总计: ${total} | ${c.g}通过: ${passed}${c.reset} | ${c.r}失败: ${total - passed}${c.reset}`);
  console.log(`${c.c}${'═'.repeat(56)}${c.reset}`);

  if (passed === total) {
    console.log(`\n${c.g}✨ 所有 HTTP 测试通过！${c.reset}\n`);
  } else if (criticalFailed) {
    console.log(`\n${c.r}⚠ 关键测试失败，请检查服务是否正常运行${c.reset}\n`);
  } else {
    console.log(`\n${c.y}⚠ 部分测试失败${c.reset}\n`);
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch(e => {
  log(`测试运行错误: ${e}`, 'e');
  process.exit(1);
});
