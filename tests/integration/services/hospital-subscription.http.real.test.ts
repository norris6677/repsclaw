#!/usr/bin/env tsx
/**
 * Hospital Subscription HTTP 真实环境测试
 * 测试 HTTP 路由端点的实际响应
 *
 * 需要 OpenClaw 服务器运行在本地，或者使用模拟的 API 对象
 */

import { log, TestResult, assertExists, assertEqual, assertTrue, assertArray, c, formatError, sleep } from '../api/test-config';
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
  assertEqual(response.data.plugin, 'repsclaw', '插件名称应该是 repsclaw');

  log(`✓ 服务状态: ${response.data.status}`, 's');
  log(`✓ 插件版本: ${response.data.version}`, 'i');
}

// ===== 医院订阅端点测试 =====

async function testGetHospitalsEmpty() {
  log('测试: 获取医院列表（空）', 'i');

  // 先清理测试数据
  await httpRequest('/api/repsclaw/hospitals/unsubscribe?name=TestHospital1');
  await httpRequest('/api/repsclaw/hospitals/unsubscribe?name=TestHospital2');

  const response = await httpRequest('/api/repsclaw/hospitals');

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertEqual(response.data.status, 'success', '状态应该是 success');
  assertArray(response.data.data.hospitals, 'hospitals 应该是数组');

  log(`✓ 当前订阅医院数: ${response.data.data.hospitals.length}`, 's');
}

async function testSubscribeHospital() {
  log('测试: 订阅医院', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: 'TestHospital1',
    isPrimary: 'true',
  });

  assertEqual(response.statusCode, 200, '订阅应该返回 200');
  assertEqual(response.data.status, 'success', '状态应该是 success');
  assertExists(response.data.data, '应该返回订阅数据');
  assertEqual(response.data.data.name, 'TestHospital1', '医院名称应该匹配');

  log(`✓ 成功订阅医院: ${response.data.data.name}`, 's');
}

async function testSubscribeDuplicate() {
  log('测试: 重复订阅同一医院', 'i');

  // 第一次订阅
  await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: 'TestHospital2',
  });

  // 第二次订阅同一医院
  const response = await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: 'TestHospital2',
  });

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertEqual(response.data.status, 'success', '状态应该是 success');

  log(`✓ 重复订阅处理正确`, 's');
}

async function testGetHospitalsWithData() {
  log('测试: 获取医院列表（有数据）', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals');

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertTrue(response.data.data.hospitals.length >= 1, '应该至少有一家医院');
  assertExists(response.data.data.primary, '应该有主要医院字段');

  log(`✓ 当前订阅医院数: ${response.data.data.hospitals.length}`, 's');
  log(`✓ 主要医院: ${response.data.data.primary || '无'}`, 'i');
}

async function testListHospitalsEndpoint() {
  log('测试: 列出医院端点', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/list');

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertEqual(response.data.status, 'success', '状态应该是 success');
  assertArray(response.data.data, '应该返回数组');

  log(`✓ 列出 ${response.data.data.length} 家医院`, 's');
}

async function testUnsubscribeHospital() {
  log('测试: 取消订阅医院', 'i');

  // 先订阅一个医院
  await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: 'HospitalToRemove',
  });

  // 取消订阅
  const response = await httpRequest('/api/repsclaw/hospitals/unsubscribe', 'GET', {
    name: 'HospitalToRemove',
  });

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertEqual(response.data.status, 'success', '状态应该是 success');

  // 验证已取消
  const listResponse = await httpRequest('/api/repsclaw/hospitals');
  const hasHospital = listResponse.data.data.hospitals.some(
    (h: any) => h.name === 'HospitalToRemove'
  );
  assertTrue(!hasHospital, '医院应该已被移除');

  log(`✓ 成功取消订阅`, 's');
}

async function testUnsubscribeNotFound() {
  log('测试: 取消未订阅的医院', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/unsubscribe', 'GET', {
    name: 'NonExistentHospitalXYZ',
  });

  // 根据实现可能返回 success 或 error
  assertEqual(response.statusCode, 200, '应该返回 200');

  log(`✓ 正确处理未订阅的医院`, 's');
}

async function testInvalidHospitalName() {
  log('测试: 无效医院名称', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: '',
  });

  // 应该返回 400 错误
  assertEqual(response.statusCode, 400, '应该返回 400');
  assertEqual(response.data.status, 'error', '状态应该是 error');

  log(`✓ 正确拒绝无效名称`, 's');
}

// ===== 医院新闻端点测试 =====

async function testHospitalNewsEndpoint() {
  log('测试: 医院新闻端点', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '北京协和医院',
    days: '7',
    maxResults: '5',
  });

  // 可能成功也可能失败（取决于数据源）
  assertTrue(response.statusCode === 200 || response.statusCode === 404, '应该返回 200 或 404');

  if (response.statusCode === 200) {
    assertExists(response.data.data, '应该返回数据');
    log(`✓ 新闻端点返回数据`, 's');
  } else {
    log(`⚠ 新闻端点返回 404（可能数据源暂时不可用）`, 'w');
  }
}

// ===== 完整流程测试 =====

async function testCompleteWorkflow() {
  log('测试: 完整订阅流程', 'i');

  const testHospitalName = `WorkflowTest_${Date.now()}`;

  // 1. 初始列表
  const initialList = await httpRequest('/api/repsclaw/hospitals');
  const initialCount = initialList.data.data.hospitals.length;
  log(`  初始医院数: ${initialCount}`, 'i');

  // 2. 订阅医院
  const subscribeResponse = await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: testHospitalName,
    isPrimary: 'true',
  });
  assertEqual(subscribeResponse.statusCode, 200, '订阅应该成功');

  // 3. 验证列表
  const afterSubscribe = await httpRequest('/api/repsclaw/hospitals');
  assertEqual(afterSubscribe.data.data.hospitals.length, initialCount + 1, '医院数应该增加');
  log(`  订阅后医院数: ${afterSubscribe.data.data.hospitals.length}`, 'i');

  // 4. 取消订阅
  const unsubscribeResponse = await httpRequest('/api/repsclaw/hospitals/unsubscribe', 'GET', {
    name: testHospitalName,
  });
  assertEqual(unsubscribeResponse.statusCode, 200, '取消订阅应该成功');

  // 5. 验证已取消
  const finalList = await httpRequest('/api/repsclaw/hospitals');
  assertEqual(finalList.data.data.hospitals.length, initialCount, '医院数应该恢复');
  log(`  取消后医院数: ${finalList.data.data.hospitals.length}`, 'i');

  log(`✓ 完整流程测试通过`, 's');
}

// ===== 性能测试 =====

async function testPerformance() {
  log('测试: 端点性能', 'i');

  const iterations = 10;
  const startTime = Date.now();

  for (let i = 0; i < iterations; i++) {
    await httpRequest('/api/repsclaw/hospitals');
  }

  const duration = Date.now() - startTime;
  const avgDuration = duration / iterations;

  log(`✓ ${iterations} 次请求平均耗时: ${avgDuration.toFixed(2)}ms`, 's');

  if (avgDuration > 1000) {
    log(`⚠ 平均响应时间较长`, 'w');
  }
}

// ===== 主函数 =====

async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}   Hospital Subscription HTTP 真实环境测试          ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}\n`);

  log(`测试目标: ${TEST_CONFIG.baseUrl}`, 'i');
  console.log();

  const tests = [
    { name: '健康检查端点', fn: testHealthEndpoint, critical: true },
    { name: '获取医院列表（空）', fn: testGetHospitalsEmpty },
    { name: '订阅医院', fn: testSubscribeHospital },
    { name: '重复订阅', fn: testSubscribeDuplicate },
    { name: '获取医院列表（有数据）', fn: testGetHospitalsWithData },
    { name: '列出医院端点', fn: testListHospitalsEndpoint },
    { name: '取消订阅医院', fn: testUnsubscribeHospital },
    { name: '取消未订阅医院', fn: testUnsubscribeNotFound },
    { name: '无效医院名称', fn: testInvalidHospitalName },
    { name: '医院新闻端点', fn: testHospitalNewsEndpoint },
    { name: '完整流程测试', fn: testCompleteWorkflow },
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
