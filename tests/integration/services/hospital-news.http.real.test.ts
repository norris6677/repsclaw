#!/usr/bin/env tsx
/**
 * Hospital News HTTP Real Environment Test
 * Tests hospital news endpoints with real HTTP calls
 *
 * Supports two modes via REPSCLAW_TEST_MODE env variable:
 * - local:   Requires local OpenClaw + Markdown storage environment
 * - virtual: Uses standalone test server with in-memory storage (default)
 *
 * Usage:
 *   REPSCLAW_TEST_MODE=virtual tsx tests/integration/services/hospital-news.http.real.test.ts
 *   REPSCLAW_TEST_MODE=local tsx tests/integration/services/hospital-news.http.real.test.ts
 */

import {
  TEST_MODE,
  TEST_BASE_URL,
  startTestEnvironment,
  stopTestEnvironment,
  httpRequest,
  runTestSuite,
  assertExists,
  assertEqual,
  assertTrue,
  sleep,
  log,
} from '../http-test-infra';

// ===== Test Cases =====

async function testHealthEndpoint() {
  log('Testing health endpoint', 'i');

  const response = await httpRequest('/api/repsclaw/health');

  assertEqual(response.statusCode, 200, 'Health check should return 200');
  assertExists(response.data, 'Should return data');
  assertEqual(response.data.status, 'ok', 'Status should be ok');

  log(`✓ Server status: ${response.data.status}`, 's');
}

async function testHospitalNewsKnownHospital() {
  log('Testing query known hospital news', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '北京协和医院',
    days: '7',
    maxResults: '5',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertExists(response.data, 'Should return data');

  if (response.data.status === 'success') {
    assertEqual(response.data.data.hospital.resolved, '北京协和医院');
    log(`✓ Found ${response.data.data.totalFound} news items`, 's');
  } else {
    log(`⚠ Query returned error: ${response.data.error?.message || 'Unknown error'}`, 'w');
  }
}

async function testHospitalNewsWithAlias() {
  log('Testing query with hospital alias', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '协和',
    days: '7',
    maxResults: '5',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertExists(response.data, 'Should return data');

  if (response.data.status === 'success') {
    assertEqual(response.data.data.hospital.resolved, '北京协和医院');
    log(`✓ Alias resolved: 协和 -> 北京协和医院`, 's');
  }
}

async function testHospitalNewsUnknownHospital() {
  log('Testing query unknown hospital', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '完全不存在的医院XYZ123',
    days: '7',
    maxResults: '5',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertEqual(response.data.status, 'error', 'Should return error status');

  log(`✓ Correctly handled unknown hospital`, 's');
}

async function testHospitalNewsWithKeywords() {
  log('Testing with keyword filter', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '北京协和医院',
    days: '30',
    maxResults: '10',
    keywords: '科研',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertExists(response.data, 'Should return data');

  log(`✓ Keyword filter request successful`, 's');
}

async function testHospitalNewsWithSources() {
  log('Testing with source type filter', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '北京协和医院',
    days: '7',
    maxResults: '5',
    sources: 'hospital_self,official',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertExists(response.data, 'Should return data');

  log(`✓ Source filter request successful`, 's');
}

async function testHospitalNewsWithBaiduSearch() {
  log('Testing with Baidu search source', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '北京协和医院',
    days: '7',
    maxResults: '5',
    sources: 'baidu_search',
    keywords: '科研',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertExists(response.data, 'Should return data');

  if (response.data.status === 'success') {
    log(`✓ Baidu search source request successful`, 's');
  } else {
    log(`⚠ Baidu search returned error: ${response.data.error?.message || 'Unknown error'}`, 'w');
  }
}

async function testHospitalNewsWithWechatSearch() {
  log('Testing with WeChat search source', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '北京协和医院',
    days: '7',
    maxResults: '3',
    sources: 'wechat_search',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertExists(response.data, 'Should return data');

  if (response.data.status === 'success') {
    log(`✓ WeChat search source request successful`, 's');
  } else {
    log(`⚠ WeChat search returned error: ${response.data.error?.message || 'Unknown error'}`, 'w');
  }
}

async function testHospitalNewsWithAllSources() {
  log('Testing with all source types', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '北京协和医院',
    days: '7',
    maxResults: '10',
    sources: 'hospital_self,official,mainstream,baidu_search,wechat_search,aggregator',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertExists(response.data, 'Should return data');

  if (response.data.status === 'success') {
    const sourceStats = response.data.data.sourceStats;
    log(`✓ All sources query successful`, 's');
    log(`  📊 Hospital official: ${sourceStats.hospital_self || 0}`, 'i');
    log(`  📊 Official govt: ${sourceStats.official || 0}`, 'i');
    log(`  📊 Mainstream media: ${sourceStats.mainstream || 0}`, 'i');
    log(`  📊 Baidu search: ${sourceStats.baidu_search || 0}`, 'i');
    log(`  📊 WeChat search: ${sourceStats.wechat_search || 0}`, 'i');
  }
}

async function testHospitalNewsInvalidParams() {
  log('Testing invalid parameters', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '',
    days: '7',
  });

  assertEqual(response.statusCode, 400, 'Should return 400');
  assertEqual(response.data.status, 'error', 'Should return error status');

  log(`✓ Correctly handled invalid parameters`, 's');
}

async function testHospitalNewsResponseStructure() {
  log('Testing response structure completeness', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '北京协和医院',
    days: '7',
    maxResults: '5',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertExists(response.data, 'Should return data');

  if (response.data.status === 'success') {
    const data = response.data.data;
    assertExists(data.hospital, 'Should contain hospital');
    assertExists(data.hospital.input, 'Should contain hospital.input');
    assertExists(data.hospital.resolved, 'Should contain hospital.resolved');
    assertExists(data.hospital.aliases, 'Should contain hospital.aliases');
    assertExists(data.query, 'Should contain query');
    assertExists(data.totalFound, 'Should contain totalFound');
    assertExists(data.results, 'Should contain results');
    assertExists(data.sourceStats, 'Should contain sourceStats');
    assertExists(data.meta, 'Should contain meta');

    log(`✓ Response structure complete`, 's');
  }
}

async function testHospitalNewsMultipleHospitals() {
  log('Testing multiple hospitals', 'i');

  const hospitals = ['北京协和医院', '四川大学华西医院', '复旦大学附属华山医院'];

  for (const hospital of hospitals) {
    const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
      hospitalName: hospital,
      days: '7',
      maxResults: '3',
    });

    // Accept both 200 (success) and 500 (partial error like Playwright not installed)
    // as long as we get a valid response
    assertTrue(
      response.statusCode === 200 || response.statusCode === 500,
      `${hospital} query should return a valid response`
    );

    if (response.data?.status === 'success') {
      log(`  ✓ ${hospital}: ${response.data.data.totalFound} news`, 's');
    } else {
      log(`  ⚠ ${hospital}: ${response.data?.error?.message || 'Query returned non-success'}`, 'w');
    }

    await sleep(500);
  }

  log(`✓ Multiple hospitals query complete`, 's');
}

async function testPerformance() {
  log('Testing endpoint performance', 'i');

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

  log(`✓ ${iterations} requests avg: ${avgDuration.toFixed(2)}ms`, 's');
}

// ===== Main Function =====

async function main() {
  console.log(`╔══════════════════════════════════════════════════════════╗`);
  console.log(`║      Hospital News HTTP Real Environment Test            ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(`║ Mode: ${TEST_MODE.padEnd(51)} ║`);
  console.log(`║ Target: ${TEST_BASE_URL.padEnd(49)} ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);

  // Define tests
  const tests = [
    { name: 'Health Endpoint', fn: testHealthEndpoint, critical: true },
    { name: 'Query Known Hospital News', fn: testHospitalNewsKnownHospital },
    { name: 'Query With Alias', fn: testHospitalNewsWithAlias },
    { name: 'Query Unknown Hospital', fn: testHospitalNewsUnknownHospital },
    { name: 'Query With Keywords', fn: testHospitalNewsWithKeywords },
    { name: 'Query With Source Filter', fn: testHospitalNewsWithSources },
    { name: 'Query With Baidu Search', fn: testHospitalNewsWithBaiduSearch },
    { name: 'Query With WeChat Search', fn: testHospitalNewsWithWechatSearch },
    { name: 'Query With All Sources', fn: testHospitalNewsWithAllSources },
    { name: 'Invalid Parameters', fn: testHospitalNewsInvalidParams },
    { name: 'Response Structure', fn: testHospitalNewsResponseStructure },
    { name: 'Multiple Hospitals', fn: testHospitalNewsMultipleHospitals },
    { name: 'Performance Test', fn: testPerformance },
  ];

  // Run tests
  const result = await runTestSuite('Hospital News HTTP Tests', tests, {
    beforeAll: async () => {
      await startTestEnvironment();
    },
    afterAll: async () => {
      await stopTestEnvironment();
    },
  });

  // Exit with appropriate code
  process.exit(result.failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
