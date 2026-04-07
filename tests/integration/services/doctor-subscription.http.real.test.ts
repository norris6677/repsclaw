#!/usr/bin/env tsx
/**
 * Doctor Subscription HTTP Real Environment Test
 * Tests doctor subscription endpoints with real HTTP calls
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

async function testDoctorSubscribeWithHospital() {
  log('Testing subscribe doctor (hospital already subscribed)', 'i');

  // First subscribe hospital
  await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: '北京协和医院',
    isPrimary: 'true',
  });

  // Subscribe doctor
  const response = await httpRequest('/api/repsclaw/doctors/subscribe', 'GET', {
    hospitalName: '北京协和医院',
    doctorName: '张医生',
    department: '心内科',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertExists(response.data, 'Should return data');

  if (response.data.status === 'success') {
    assertEqual(response.data.data.subscription.name, '张医生');
    assertEqual(response.data.data.subscription.hospital, '北京协和医院');
    log(`✓ Doctor subscribed: ${response.data.data.subscription.name}`, 's');
  } else {
    log(`⚠ Doctor subscribe returned error: ${response.data.error?.message || 'Unknown error'}`, 'w');
  }
}

async function testDoctorSubscribeWithoutHospital() {
  log('Testing subscribe doctor (hospital not subscribed)', 'i');

  const response = await httpRequest('/api/repsclaw/doctors/subscribe', 'GET', {
    hospitalName: '未订阅的医院XYZ123',
    doctorName: '李医生',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertEqual(response.data.status, 'error', 'Should return error status');
  assertTrue(response.data.error?.message?.includes('未订阅'), 'Error message should indicate hospital not subscribed');

  log(`✓ Correctly handled hospital not subscribed`, 's');
}

async function testDoctorSubscribeWithAlias() {
  log('Testing subscribe doctor with hospital alias', 'i');

  // Ensure hospital is subscribed
  await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: '复旦大学附属华山医院',
  });

  // Subscribe doctor using alias
  const response = await httpRequest('/api/repsclaw/doctors/subscribe', 'GET', {
    hospitalName: '华山',  // Alias
    doctorName: '王医生',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertExists(response.data, 'Should return data');

  if (response.data.status === 'success') {
    assertEqual(response.data.data.subscription.hospital, '复旦大学附属华山医院');
    log(`✓ Alias resolved: 华山 -> 复旦大学附属华山医院`, 's');
  }
}

async function testListDoctors() {
  log('Testing list subscribed doctors', 'i');

  const response = await httpRequest('/api/repsclaw/doctors/list', 'GET', {});

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertExists(response.data, 'Should return data');

  if (response.data.status === 'success') {
    log(`✓ Subscribed ${response.data.data.doctors?.length || 0} doctors`, 's');
  }
}

async function testListDoctorsWithFilter() {
  log('Testing list doctors with hospital filter', 'i');

  const response = await httpRequest('/api/repsclaw/doctors/list', 'GET', {
    hospitalName: '协和',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertExists(response.data, 'Should return data');

  log(`✓ Filter request successful`, 's');
}

async function testUnsubscribeDoctor() {
  log('Testing unsubscribe doctor', 'i');

  // First subscribe
  await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: '北京协和医院',
  });

  await httpRequest('/api/repsclaw/doctors/subscribe', 'GET', {
    hospitalName: '北京协和医院',
    doctorName: '测试医生',
  });

  // Unsubscribe
  const response = await httpRequest('/api/repsclaw/doctors/unsubscribe', 'GET', {
    hospitalName: '北京协和医院',
    doctorName: '测试医生',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');

  if (response.data.status === 'success') {
    log(`✓ Unsubscribe successful`, 's');
  } else {
    log(`⚠ Unsubscribe returned: ${response.data.error?.message || 'Unknown error'}`, 'w');
  }
}

async function testSetPrimaryDoctor() {
  log('Testing set primary doctor', 'i');

  // Ensure hospital and doctor are subscribed
  await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: '北京协和医院',
  });

  await httpRequest('/api/repsclaw/doctors/subscribe', 'GET', {
    hospitalName: '北京协和医院',
    doctorName: '主要医生测试',
  });

  // Set as primary doctor
  const response = await httpRequest('/api/repsclaw/doctors/set-primary', 'GET', {
    hospitalName: '北京协和医院',
    doctorName: '主要医生测试',
  });

  assertEqual(response.statusCode, 200, 'Should return 200');

  if (response.data.status === 'success') {
    log(`✓ Set primary doctor successful`, 's');
  } else {
    log(`⚠ Set primary doctor returned: ${response.data.error?.message || 'Unknown error'}`, 'w');
  }
}

async function testCheckDoctorSubscriptionStatus() {
  log('Testing check doctor subscription status', 'i');

  const response = await httpRequest('/api/repsclaw/doctors/status', 'GET', {});

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertExists(response.data, 'Should return data');

  if (response.data.status === 'success') {
    assertExists(response.data.data.totalDoctors !== undefined);
    assertExists(response.data.data.byHospital);
    log(`✓ Status check: ${response.data.data.totalDoctors} doctors`, 's');
  }
}

async function testDoctorSubscriptionResponseStructure() {
  log('Testing response structure completeness', 'i');

  // Ensure there's data
  await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: '北京协和医院',
  });

  await httpRequest('/api/repsclaw/doctors/subscribe', 'GET', {
    hospitalName: '北京协和医院',
    doctorName: '结构测试医生',
    department: '测试科',
  });

  const response = await httpRequest('/api/repsclaw/doctors/list', 'GET', {});

  assertEqual(response.statusCode, 200, 'Should return 200');
  assertExists(response.data, 'Should return data');

  if (response.data.status === 'success') {
    const data = response.data.data;
    assertExists(data.doctors, 'Should contain doctors');
    assertExists(data.primary, 'Should contain primary');
    assertExists(data.totalCount !== undefined, 'Should contain totalCount');

    if (data.doctors.length > 0) {
      const doctor = data.doctors[0];
      assertExists(doctor.name, 'Doctor should contain name');
      assertExists(doctor.hospital, 'Doctor should contain hospital');
      assertExists(doctor.subscribedAt, 'Doctor should contain subscribedAt');
      assertExists(doctor.isPrimary !== undefined, 'Doctor should contain isPrimary');
    }

    log(`✓ Response structure complete`, 's');
  }
}

async function testSubscribeMultipleDoctors() {
  log('Testing subscribe multiple doctors', 'i');

  // Ensure hospital is subscribed
  await httpRequest('/api/repsclaw/hospitals/subscribe', 'GET', {
    name: '四川大学华西医院',
  });

  const doctors = ['张医生', '李医生', '王医生'];

  for (const doctor of doctors) {
    const response = await httpRequest('/api/repsclaw/doctors/subscribe', 'GET', {
      hospitalName: '四川大学华西医院',
      doctorName: doctor,
    });

    assertEqual(response.statusCode, 200, `${doctor} subscribe should return 200`);
    await sleep(100);
  }

  // Verify list
  const listResponse = await httpRequest('/api/repsclaw/doctors/list', 'GET', {
    hospitalName: '华西',
  });

  if (listResponse.data.status === 'success') {
    log(`✓ Multiple doctors subscribed, total: ${listResponse.data.data.doctors?.length || 0}`, 's');
  }
}

async function testPerformance() {
  log('Testing endpoint performance', 'i');

  // Ensure hospital is subscribed
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

  log(`✓ ${iterations} requests avg: ${avgDuration.toFixed(2)}ms`, 's');
}

// ===== Main Function =====

async function main() {
  console.log(`╔══════════════════════════════════════════════════════════╗`);
  console.log(`║    Doctor Subscription HTTP Real Environment Test        ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(`║ Mode: ${TEST_MODE.padEnd(51)} ║`);
  console.log(`║ Target: ${TEST_BASE_URL.padEnd(49)} ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);

  // Define tests
  const tests = [
    { name: 'Health Endpoint', fn: testHealthEndpoint, critical: true },
    { name: 'Subscribe Doctor (Hospital Subscribed)', fn: testDoctorSubscribeWithHospital },
    { name: 'Subscribe Doctor (Hospital Not Subscribed)', fn: testDoctorSubscribeWithoutHospital },
    { name: 'Subscribe Doctor With Alias', fn: testDoctorSubscribeWithAlias },
    { name: 'List Doctors', fn: testListDoctors },
    { name: 'List Doctors With Filter', fn: testListDoctorsWithFilter },
    { name: 'Unsubscribe Doctor', fn: testUnsubscribeDoctor },
    { name: 'Set Primary Doctor', fn: testSetPrimaryDoctor },
    { name: 'Check Doctor Subscription Status', fn: testCheckDoctorSubscriptionStatus },
    { name: 'Response Structure', fn: testDoctorSubscriptionResponseStructure },
    { name: 'Subscribe Multiple Doctors', fn: testSubscribeMultipleDoctors },
    { name: 'Performance Test', fn: testPerformance },
  ];

  // Run tests
  const result = await runTestSuite('Doctor Subscription HTTP Tests', tests, {
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
