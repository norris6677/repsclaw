#!/usr/bin/env tsx
/**
 * Doctor Subscription HTTP 真实环境测试
 * 测试医生订阅查询 HTTP 端点的实际响应
 *
 * 需要 OpenClaw 服务器运行在本地
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

// ===== 医生订阅端点测试 =====

async function testDoctorSubscribeWithHospital() {
  log('测试: 订阅医生（医院已订阅）', 'i');

  // 先订阅医院
  await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: '北京协和医院',
    isPrimary: 'true',
  });

  // 订阅医生
  const response = await httpRequest('/api/repsclaw/doctors/subscribe', 'GET', {
    hospitalName: '北京协和医院',
    doctorName: '张医生',
    department: '心内科',
  });

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertExists(response.data, '应该返回数据');

  if (response.data.status === 'success') {
    assertEqual(response.data.data.subscription.name, '张医生');
    assertEqual(response.data.data.subscription.hospital, '北京协和医院');
    log(`✓ 医生订阅成功: ${response.data.data.subscription.name}`, 's');
  } else {
    log(`⚠ 医生订阅返回错误: ${response.data.error?.message || '未知错误'}`, 'w');
  }
}

async function testDoctorSubscribeWithoutHospital() {
  log('测试: 订阅医生（医院未订阅）', 'i');

  const response = await httpRequest('/api/repsclaw/doctors/subscribe', 'GET', {
    hospitalName: '未订阅的医院XYZ123',
    doctorName: '李医生',
  });

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertEqual(response.data.status, 'error', '应该返回错误状态');
  assertTrue(response.data.error?.message?.includes('未订阅'), '错误消息应提示医院未订阅');

  log(`✓ 正确处理医院未订阅情况`, 's');
}

async function testDoctorSubscribeWithAlias() {
  log('测试: 使用别名订阅医生', 'i');

  // 确保医院已订阅
  await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: '复旦大学附属华山医院',
  });

  // 使用别名订阅医生
  const response = await httpRequest('/api/repsclaw/doctors/subscribe', 'GET', {
    hospitalName: '华山',  // 别名
    doctorName: '王医生',
  });

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertExists(response.data, '应该返回数据');

  if (response.data.status === 'success') {
    assertEqual(response.data.data.subscription.hospital, '复旦大学附属华山医院');
    log(`✓ 别名解析成功: 华山 -> 复旦大学附属华山医院`, 's');
  }
}

async function testListDoctors() {
  log('测试: 列出已订阅医生', 'i');

  const response = await httpRequest('/api/repsclaw/doctors/list', 'GET', {});

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertExists(response.data, '应该返回数据');

  if (response.data.status === 'success') {
    log(`✓ 已订阅 ${response.data.data.doctors?.length || 0} 位医生`, 's');
  }
}

async function testListDoctorsWithFilter() {
  log('测试: 按医院筛选医生', 'i');

  const response = await httpRequest('/api/repsclaw/doctors/list', 'GET', {
    hospitalName: '协和',
  });

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertExists(response.data, '应该返回数据');

  log(`✓ 筛选请求成功`, 's');
}

async function testUnsubscribeDoctor() {
  log('测试: 取消订阅医生', 'i');

  // 先订阅
  await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: '北京协和医院',
  });

  await httpRequest('/api/repsclaw/doctors/subscribe', 'GET', {
    hospitalName: '北京协和医院',
    doctorName: '测试医生',
  });

  // 取消订阅
  const response = await httpRequest('/api/repsclaw/doctors/unsubscribe', 'GET', {
    hospitalName: '北京协和医院',
    doctorName: '测试医生',
  });

  assertEqual(response.statusCode, 200, '应该返回 200');

  if (response.data.status === 'success') {
    log(`✓ 取消订阅成功`, 's');
  } else {
    log(`⚠ 取消订阅返回: ${response.data.error?.message || '未知错误'}`, 'w');
  }
}

async function testSetPrimaryDoctor() {
  log('测试: 设置主要医生', 'i');

  // 确保医院和医生已订阅
  await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: '北京协和医院',
  });

  await httpRequest('/api/repsclaw/doctors/subscribe', 'GET', {
    hospitalName: '北京协和医院',
    doctorName: '主要医生测试',
  });

  // 设置为主要医生
  const response = await httpRequest('/api/repsclaw/doctors/set-primary', 'GET', {
    hospitalName: '北京协和医院',
    doctorName: '主要医生测试',
  });

  assertEqual(response.statusCode, 200, '应该返回 200');

  if (response.data.status === 'success') {
    log(`✓ 设置主要医生成功`, 's');
  } else {
    log(`⚠ 设置主要医生返回: ${response.data.error?.message || '未知错误'}`, 'w');
  }
}

async function testCheckDoctorSubscriptionStatus() {
  log('测试: 检查医生订阅状态', 'i');

  const response = await httpRequest('/api/repsclaw/doctors/status', 'GET', {});

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertExists(response.data, '应该返回数据');

  if (response.data.status === 'success') {
    assertExists(response.data.data.totalDoctors !== undefined);
    assertExists(response.data.data.byHospital);
    log(`✓ 状态检查成功: ${response.data.data.totalDoctors} 位医生`, 's');
  }
}

async function testDoctorSubscriptionResponseStructure() {
  log('测试: 响应结构完整性', 'i');

  // 确保有数据
  await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: '北京协和医院',
  });

  await httpRequest('/api/repsclaw/doctors/subscribe', 'GET', {
    hospitalName: '北京协和医院',
    doctorName: '结构测试医生',
    department: '测试科',
  });

  const response = await httpRequest('/api/repsclaw/doctors/list', 'GET', {});

  assertEqual(response.statusCode, 200, '应该返回 200');
  assertExists(response.data, '应该返回数据');

  if (response.data.status === 'success') {
    const data = response.data.data;
    assertExists(data.doctors, '应该包含 doctors');
    assertExists(data.primary, '应该包含 primary');
    assertExists(data.totalCount !== undefined, '应该包含 totalCount');

    if (data.doctors.length > 0) {
      const doctor = data.doctors[0];
      assertExists(doctor.name, '医生应该包含 name');
      assertExists(doctor.hospital, '医生应该包含 hospital');
      assertExists(doctor.subscribedAt, '医生应该包含 subscribedAt');
      assertExists(doctor.isPrimary !== undefined, '医生应该包含 isPrimary');
    }

    log(`✓ 响应结构完整`, 's');
  }
}

async function testSubscribeMultipleDoctors() {
  log('测试: 订阅多个医生', 'i');

  // 确保医院已订阅
  await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: '四川大学华西医院',
  });

  const doctors = ['张医生', '李医生', '王医生'];

  for (const doctor of doctors) {
    const response = await httpRequest('/api/repsclaw/doctors/subscribe', 'GET', {
      hospitalName: '四川大学华西医院',
      doctorName: doctor,
    });

    assertEqual(response.statusCode, 200, `${doctor} 订阅应该返回 200`);
    await sleep(100);
  }

  // 验证列表
  const listResponse = await httpRequest('/api/repsclaw/doctors/list', 'GET', {
    hospitalName: '华西',
  });

  if (listResponse.data.status === 'success') {
    log(`✓ 多医生订阅完成，该医院共 ${listResponse.data.data.doctors?.length || 0} 位医生`, 's');
  }
}

// ===== 性能测试 =====

async function testPerformance() {
  log('测试: 医生订阅端点性能', 'i');

  // 确保医院已订阅
  await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: '北京协和医院',
  });

  const iterations = 3;
  const startTime = Date.now();

  for (let i = 0; i < iterations; i++) {
    await httpRequest('/api/repsclaw/doctors/list', 'GET', {});
    await sleep(200);
  }

  const duration = Date.now() - startTime;
  const avgDuration = duration / iterations;

  log(`✓ ${iterations} 次请求平均耗时: ${avgDuration.toFixed(2)}ms`, 's');
}

// ===== 主函数 =====

async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}       Doctor Subscription HTTP 真实环境测试        ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}\n`);

  log(`测试目标: ${TEST_CONFIG.baseUrl}`, 'i');
  console.log();

  const tests = [
    { name: '健康检查端点', fn: testHealthEndpoint, critical: true },
    { name: '订阅医生（医院已订阅）', fn: testDoctorSubscribeWithHospital },
    { name: '订阅医生（医院未订阅）', fn: testDoctorSubscribeWithoutHospital },
    { name: '使用别名订阅医生', fn: testDoctorSubscribeWithAlias },
    { name: '列出已订阅医生', fn: testListDoctors },
    { name: '按医院筛选医生', fn: testListDoctorsWithFilter },
    { name: '取消订阅医生', fn: testUnsubscribeDoctor },
    { name: '设置主要医生', fn: testSetPrimaryDoctor },
    { name: '检查医生订阅状态', fn: testCheckDoctorSubscriptionStatus },
    { name: '响应结构完整性', fn: testDoctorSubscriptionResponseStructure },
    { name: '订阅多个医生', fn: testSubscribeMultipleDoctors },
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
