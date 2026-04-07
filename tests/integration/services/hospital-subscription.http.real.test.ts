#!/usr/bin/env tsx
/**
 * Hospital Subscription HTTP Real Environment Test
 * Tests hospital subscription endpoints with real HTTP calls
 *
 * Supports two modes via REPSCLAW_TEST_MODE env variable:
 * - local:   Requires local OpenClaw + Markdown storage environment
 * - virtual: Uses standalone test server with in-memory storage (default)
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
  assertArray,
  log,
} from '../http-test-infra';

// ===== Test Cases =====

async function testHealthEndpoint() {
  log('Testing health endpoint', 'i');

  const response = await httpRequest('/api/repsclaw/health');

  assertEqual(response.statusCode, 200, 'Health check should return 200');
  assertExists(response.data, 'Should return data');
  assertEqual(response.data.status, 'ok', 'Status should be ok');
  assertEqual(response.data.plugin, 'repsclaw', 'Plugin should be repsclaw');

  log(`✓ Server status: ${response.data.status}`, 's');
  log(`✓ Plugin version: ${response.data.version}`, 'i');
}

async function testGetHospitalsEmpty() {
  log('Testing get hospitals (empty)', 'i');

  // Clean up test data
  await httpRequest('/api/repsclaw/hospitals/unsubscribe?name=TestHospital1');
  await httpRequest('/api/repsclaw/hospitals/unsubscribe?name=TestHospital2');

  const response = await httpRequest('/api/repsclaw/hospitals');

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertEqual(response.data.status, 'success', 'Status should be success');
  assertArray(response.data.data.hospitals, 'hospitals should be array');

  log(`✓ Current subscribed hospitals: ${response.data.data.hospitals.length}`, 's');
}

async function testSubscribeHospital() {
  log('Testing subscribe hospital', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: 'TestHospital1',
    isPrimary: 'true',
  });

  assertEqual(response.statusCode, 200, 'Subscribe should return 200');
  assertEqual(response.data.status, 'success', 'Status should be success');
  assertExists(response.data.data, 'Should return subscription data');
  assertEqual(response.data.data.subscription.name, 'TestHospital1', 'Hospital name should match');

  log(`✓ Successfully subscribed: ${response.data.data.subscription.name}`, 's');
}

async function testSubscribeDuplicate() {
  log('Testing duplicate subscribe', 'i');

  // First subscribe
  await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: 'TestHospital2',
  });

  // Second subscribe same hospital
  const response = await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: 'TestHospital2',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertEqual(response.data.status, 'success', 'Status should be success');

  log(`✓ Duplicate subscribe handled correctly`, 's');
}

async function testGetHospitalsWithData() {
  log('Testing get hospitals (with data)', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals');

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertTrue(response.data.data.hospitals.length >= 1, 'Should have at least 1 hospital');
  assertExists(response.data.data.primary, 'Should have primary field');

  log(`✓ Current subscribed hospitals: ${response.data.data.hospitals.length}`, 's');
  log(`✓ Primary hospital: ${response.data.data.primary || 'None'}`, 'i');
}

async function testListHospitalsEndpoint() {
  log('Testing list hospitals endpoint', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/list');

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertEqual(response.data.status, 'success', 'Status should be success');
  assertArray(response.data.data, 'Should return array');

  log(`✓ Listed ${response.data.data.length} hospitals`, 's');
}

async function testUnsubscribeHospital() {
  log('Testing unsubscribe hospital', 'i');

  // First subscribe a hospital
  await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: 'HospitalToRemove',
  });

  // Unsubscribe
  const response = await httpRequest('/api/repsclaw/hospitals/unsubscribe', 'GET', {
    name: 'HospitalToRemove',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertEqual(response.data.status, 'success', 'Status should be success');

  // Verify unsubscribed
  const listResponse = await httpRequest('/api/repsclaw/hospitals');
  const hasHospital = listResponse.data.data.hospitals.some(
    (h: any) => h.name === 'HospitalToRemove'
  );
  assertTrue(!hasHospital, 'Hospital should be removed');

  log(`✓ Successfully unsubscribed`, 's');
}

async function testUnsubscribeNotFound() {
  log('Testing unsubscribe not found hospital', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/unsubscribe', 'GET', {
    name: 'NonExistentHospitalXYZ',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');

  log(`✓ Correctly handled non-subscribed hospital`, 's');
}

async function testInvalidHospitalName() {
  log('Testing invalid hospital name', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: '',
  });

  assertEqual(response.statusCode, 400, 'Should return 400');
  assertEqual(response.data.status, 'error', 'Status should be error');

  log(`✓ Correctly rejected invalid name`, 's');
}

async function testHospitalNewsEndpoint() {
  log('Testing hospital news endpoint', 'i');

  const response = await httpRequest('/api/repsclaw/hospitals/news', 'GET', {
    hospitalName: '北京协和医院',
    days: '7',
    maxResults: '5',
  });

  assertTrue(response.statusCode === 200 || response.statusCode === 404, 'Should return 200 or 404');

  if (response.statusCode === 200) {
    assertExists(response.data.data, 'Should return data');
    log(`✓ News endpoint returned data`, 's');
  } else {
    log(`⚠ News endpoint returned 404 (data source may be temporarily unavailable)`, 'w');
  }
}

async function testCompleteWorkflow() {
  log('Testing complete subscription workflow', 'i');

  const testHospitalName = `WorkflowTest_${Date.now()}`;

  // 1. Initial list
  const initialList = await httpRequest('/api/repsclaw/hospitals');
  const initialCount = initialList.data.data.hospitals.length;
  log(`  Initial hospitals: ${initialCount}`, 'i');

  // 2. Subscribe hospital
  const subscribeResponse = await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: testHospitalName,
    isPrimary: 'true',
  });
  assertEqual(subscribeResponse.statusCode, 200, 'Subscribe should succeed');

  // 3. Verify list
  const afterSubscribe = await httpRequest('/api/repsclaw/hospitals');
  assertEqual(afterSubscribe.data.data.hospitals.length, initialCount + 1, 'Hospital count should increase');
  log(`  After subscribe: ${afterSubscribe.data.data.hospitals.length}`, 'i');

  // 4. Unsubscribe
  const unsubscribeResponse = await httpRequest('/api/repsclaw/hospitals/unsubscribe', 'GET', {
    name: testHospitalName,
  });
  assertEqual(unsubscribeResponse.statusCode, 200, 'Unsubscribe should succeed');

  // 5. Verify unsubscribed
  const finalList = await httpRequest('/api/repsclaw/hospitals');
  assertEqual(finalList.data.data.hospitals.length, initialCount, 'Hospital count should restore');
  log(`  After unsubscribe: ${finalList.data.data.hospitals.length}`, 'i');

  log(`✓ Complete workflow test passed`, 's');
}

async function testPerformance() {
  log('Testing endpoint performance', 'i');

  const iterations = 10;
  const startTime = Date.now();

  for (let i = 0; i < iterations; i++) {
    await httpRequest('/api/repsclaw/hospitals');
  }

  const duration = Date.now() - startTime;
  const avgDuration = duration / iterations;

  log(`✓ ${iterations} requests avg: ${avgDuration.toFixed(2)}ms`, 's');

  if (avgDuration > 1000) {
    log(`⚠ Average response time is high`, 'w');
  }
}

// ===== Main Function =====

async function main() {
  console.log(`╔══════════════════════════════════════════════════════════╗`);
  console.log(`║   Hospital Subscription HTTP Real Environment Test       ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(`║ Mode: ${TEST_MODE.padEnd(51)} ║`);
  console.log(`║ Target: ${TEST_BASE_URL.padEnd(49)} ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);

  // Define tests
  const tests = [
    { name: 'Health Endpoint', fn: testHealthEndpoint, critical: true },
    { name: 'Get Hospitals (Empty)', fn: testGetHospitalsEmpty },
    { name: 'Subscribe Hospital', fn: testSubscribeHospital },
    { name: 'Duplicate Subscribe', fn: testSubscribeDuplicate },
    { name: 'Get Hospitals (With Data)', fn: testGetHospitalsWithData },
    { name: 'List Hospitals Endpoint', fn: testListHospitalsEndpoint },
    { name: 'Unsubscribe Hospital', fn: testUnsubscribeHospital },
    { name: 'Unsubscribe Not Found', fn: testUnsubscribeNotFound },
    { name: 'Invalid Hospital Name', fn: testInvalidHospitalName },
    { name: 'Hospital News Endpoint', fn: testHospitalNewsEndpoint },
    { name: 'Complete Workflow', fn: testCompleteWorkflow },
    { name: 'Performance Test', fn: testPerformance },
  ];

  // Run tests
  const result = await runTestSuite('Hospital Subscription HTTP Tests', tests, {
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
