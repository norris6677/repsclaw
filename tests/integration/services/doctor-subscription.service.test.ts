#!/usr/bin/env tsx
/**
 * Doctor Subscription Service Mock 集成测试
 * 测试医生订阅服务的完整流程
 */

import { DoctorSubscriptionService, DoctorSubscription } from '../../../src/services/doctor-subscription.service';
import { HospitalSubscriptionService } from '../../../src/services/hospital-subscription.service';
import { TestSuite, assertEqual, assertTrue, assertExists, assertFalse, c } from '../../unit/test-utils';
import * as fs from 'fs';
import * as path from 'path';

const suite = new TestSuite();

// 测试用的临时存储路径
const TEST_STORAGE_DIR = path.join(process.cwd(), 'tmp-test-doctor');
const TEST_HOSPITAL_STORAGE = path.join(TEST_STORAGE_DIR, 'hospital-subscriptions.json');
const TEST_DOCTOR_STORAGE = path.join(TEST_STORAGE_DIR, 'doctor-subscriptions.json');

// 创建测试服务实例
function createTestServices() {
  // 清理之前的测试数据并确保目录存在
  cleanupTestData();
  ensureTestDir();

  // 修改环境变量以使用测试存储路径
  const originalHome = process.env.HOME;
  process.env.HOME = TEST_STORAGE_DIR;

  const hospitalService = new HospitalSubscriptionService();
  const doctorService = new DoctorSubscriptionService(hospitalService);

  // 恢复环境变量
  process.env.HOME = originalHome;

  return { hospitalService, doctorService };
}

// 清理测试数据
function cleanupTestData() {
  // 使用 recursive 删除整个测试目录
  if (fs.existsSync(TEST_STORAGE_DIR)) {
    fs.rmSync(TEST_STORAGE_DIR, { recursive: true, force: true });
  }
}

// 确保测试目录存在
function ensureTestDir() {
  if (!fs.existsSync(TEST_STORAGE_DIR)) {
    fs.mkdirSync(TEST_STORAGE_DIR, { recursive: true });
  }
}

// ===== 初始化测试 =====

suite.add('DoctorSubscriptionService - 初始化', async () => {
  const { doctorService } = createTestServices();
  assertExists(doctorService);
  cleanupTestData();
});

// ===== 医院验证测试 =====

suite.add('DoctorSubscriptionService - 订阅医生前必须订阅医院', async () => {
  const { doctorService } = createTestServices();

  // 尝试订阅医生，但未订阅医院
  const result = doctorService.subscribe('北京协和医院', '张医生');

  assertFalse(result.success);
  assertExists(result.error);
  assertTrue(result.error!.includes('未订阅'));
  cleanupTestData();
});

suite.add('DoctorSubscriptionService - 医院别名解析', async () => {
  const { hospitalService, doctorService } = createTestServices();

  // 先订阅医院（使用完整名称）
  hospitalService.subscribe('北京协和医院');

  // 使用别名订阅医生
  const result = doctorService.subscribe('协和', '张医生');

  assertTrue(result.success);
  assertEqual(result.subscription!.hospital, '北京协和医院');
  cleanupTestData();
});

// ===== 医生订阅测试 =====

suite.add('DoctorSubscriptionService - 订阅医生（医院已订阅）', async () => {
  const { hospitalService, doctorService } = createTestServices();

  // 先订阅医院
  hospitalService.subscribe('北京协和医院');

  // 订阅医生
  const result = doctorService.subscribe('北京协和医院', '张医生');

  assertTrue(result.success);
  assertExists(result.subscription);
  assertEqual(result.subscription!.name, '张医生');
  assertEqual(result.subscription!.hospital, '北京协和医院');
  cleanupTestData();
});

suite.add('DoctorSubscriptionService - 订阅医生带科室', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');

  const result = doctorService.subscribe('北京协和医院', '张医生', '心内科');

  assertTrue(result.success);
  assertEqual(result.subscription!.department, '心内科');
  cleanupTestData();
});

suite.add('DoctorSubscriptionService - 第一个医生自动成为主要医生', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');

  const result = doctorService.subscribe('北京协和医院', '张医生');

  assertTrue(result.success);
  assertTrue(result.subscription!.isPrimary);
  cleanupTestData();
});

suite.add('DoctorSubscriptionService - 重复订阅同一医生', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');

  // 第一次订阅
  const result1 = doctorService.subscribe('北京协和医院', '张医生');
  assertTrue(result1.success);
  assertFalse(result1.isExisting);

  // 第二次订阅同一医生
  const result2 = doctorService.subscribe('北京协和医院', '张医生');
  assertTrue(result2.success);
  assertTrue(result2.isExisting);

  // 验证只保存了一个医生
  const doctors = doctorService.getDoctors();
  assertEqual(doctors.length, 1);
  cleanupTestData();
});

suite.add('DoctorSubscriptionService - 更新已存在医生的科室', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');

  // 首次订阅
  doctorService.subscribe('北京协和医院', '张医生', '内科');

  // 再次订阅，更新科室
  const result = doctorService.subscribe('北京协和医院', '张医生', '心内科');

  assertTrue(result.success);
  assertTrue(result.isExisting);
  assertEqual(result.subscription!.department, '心内科');
  cleanupTestData();
});

// ===== 查询测试 =====

suite.add('DoctorSubscriptionService - 获取所有订阅的医生', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');
  hospitalService.subscribe('复旦大学附属华山医院');

  doctorService.subscribe('北京协和医院', '张医生');
  doctorService.subscribe('北京协和医院', '李医生');
  doctorService.subscribe('复旦大学附属华山医院', '王医生');

  const doctors = doctorService.getDoctors();

  assertEqual(doctors.length, 3);
  cleanupTestData();
});

suite.add('DoctorSubscriptionService - 按医院筛选医生', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');
  hospitalService.subscribe('复旦大学附属华山医院');

  doctorService.subscribe('北京协和医院', '张医生');
  doctorService.subscribe('北京协和医院', '李医生');
  doctorService.subscribe('复旦大学附属华山医院', '王医生');

  const xieheDoctors = doctorService.getDoctorsByHospital('北京协和医院');

  assertEqual(xieheDoctors.length, 2);
  assertTrue(xieheDoctors.every(d => d.hospital === '北京协和医院'));
  cleanupTestData();
});

suite.add('DoctorSubscriptionService - 查找医生', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');
  doctorService.subscribe('北京协和医院', '张医生');

  const found = doctorService.findDoctor('北京协和医院', '张医生');
  const notFound = doctorService.findDoctor('北京协和医院', '李医生');

  assertExists(found);
  assertEqual(found!.name, '张医生');
  assertEqual(notFound, null);
  cleanupTestData();
});

suite.add('DoctorSubscriptionService - 检查是否已订阅', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');
  doctorService.subscribe('北京协和医院', '张医生');

  assertTrue(doctorService.isSubscribed('北京协和医院', '张医生'));
  assertFalse(doctorService.isSubscribed('北京协和医院', '李医生'));
  assertFalse(doctorService.isSubscribed('复旦大学附属华山医院', '张医生'));
  cleanupTestData();
});

// ===== 主要医生测试 =====

suite.add('DoctorSubscriptionService - 获取主要医生', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');

  doctorService.subscribe('北京协和医院', '张医生'); // 自动成为主要
  doctorService.subscribe('北京协和医院', '李医生');

  const primary = doctorService.getPrimaryDoctor();

  assertExists(primary);
  assertEqual(primary!.name, '张医生');
  cleanupTestData();
});

suite.add('DoctorSubscriptionService - 设置主要医生', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');

  doctorService.subscribe('北京协和医院', '张医生');
  doctorService.subscribe('北京协和医院', '李医生');

  const result = doctorService.setPrimary('北京协和医院', '李医生');

  assertTrue(result.success);
  assertEqual(doctorService.getPrimaryDoctor()!.name, '李医生');
  cleanupTestData();
});

suite.add('DoctorSubscriptionService - 设置未订阅的医生为主要', async () => {
  const { doctorService } = createTestServices();

  const result = doctorService.setPrimary('北京协和医院', '张医生');

  assertFalse(result.success);
  assertExists(result.error);
  cleanupTestData();
});

suite.add('DoctorSubscriptionService - 只有一个主要医生', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');

  doctorService.subscribe('北京协和医院', '医生A');
  doctorService.subscribe('北京协和医院', '医生B');
  doctorService.subscribe('北京协和医院', '医生C');

  doctorService.setPrimary('北京协和医院', '医生B');
  doctorService.setPrimary('北京协和医院', '医生C');

  const doctors = doctorService.getDoctors();
  const primaryCount = doctors.filter(d => d.isPrimary).length;

  assertEqual(primaryCount, 1);
  assertEqual(doctorService.getPrimaryDoctor()!.name, '医生C');
  cleanupTestData();
});

// ===== 取消订阅测试 =====

suite.add('DoctorSubscriptionService - 取消订阅医生', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');
  doctorService.subscribe('北京协和医院', '张医生');

  const result = doctorService.unsubscribe('北京协和医院', '张医生');

  assertTrue(result.success);
  assertEqual(doctorService.getDoctors().length, 0);
  cleanupTestData();
});

suite.add('DoctorSubscriptionService - 取消未订阅的医生', async () => {
  const { doctorService } = createTestServices();

  const result = doctorService.unsubscribe('北京协和医院', '张医生');

  assertFalse(result.success);
  assertExists(result.error);
  cleanupTestData();
});

suite.add('DoctorSubscriptionService - 取消主要医生后自动切换', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');

  doctorService.subscribe('北京协和医院', '张医生'); // 主要
  doctorService.subscribe('北京协和医院', '李医生');

  doctorService.unsubscribe('北京协和医院', '张医生');

  assertEqual(doctorService.getDoctors().length, 1);
  assertEqual(doctorService.getPrimaryDoctor()!.name, '李医生');
  cleanupTestData();
});

// ===== 统计测试 =====

suite.add('DoctorSubscriptionService - 获取统计信息', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');
  hospitalService.subscribe('复旦大学附属华山医院');

  doctorService.subscribe('北京协和医院', '张医生');
  doctorService.subscribe('北京协和医院', '李医生');
  doctorService.subscribe('复旦大学附属华山医院', '王医生');

  const stats = doctorService.getStats();

  assertEqual(stats.total, 3);
  assertEqual(stats.byHospital['北京协和医院'], 2);
  assertEqual(stats.byHospital['复旦大学附属华山医院'], 1);
  assertExists(stats.primary);
  cleanupTestData();
});

suite.add('DoctorSubscriptionService - 首次使用检查', async () => {
  const { hospitalService, doctorService } = createTestServices();

  // 初始状态应该是首次使用
  assertTrue(doctorService.isFirstTime());

  // 订阅医院和医生
  hospitalService.subscribe('北京协和医院');
  doctorService.subscribe('北京协和医院', '张医生');

  // 订阅后不再是首次使用
  assertFalse(doctorService.isFirstTime());
  cleanupTestData();
});

// ===== 多医院场景测试 =====

suite.add('DoctorSubscriptionService - 同一医生名在不同医院', async () => {
  const { hospitalService, doctorService } = createTestServices();

  // 订阅两家医院
  hospitalService.subscribe('北京协和医院');
  hospitalService.subscribe('复旦大学附属华山医院');

  // 在同名的两家医院订阅同名医生（应该被视为不同医生）
  const result1 = doctorService.subscribe('北京协和医院', '张医生');
  const result2 = doctorService.subscribe('复旦大学附属华山医院', '张医生');

  assertTrue(result1.success);
  assertTrue(result2.success);
  assertFalse(result2.isExisting); // 不是重复，因为医院不同

  const doctors = doctorService.getDoctors();
  assertEqual(doctors.length, 2);

  // 验证可以区分
  const xieheDoctor = doctors.find(d => d.hospital === '北京协和医院');
  const huashanDoctor = doctors.find(d => d.hospital === '复旦大学附属华山医院');

  assertExists(xieheDoctor);
  assertExists(huashanDoctor);
  assertEqual(xieheDoctor!.name, '张医生');
  assertEqual(huashanDoctor!.name, '张医生');
  cleanupTestData();
});

suite.add('DoctorSubscriptionService - 多医院主要医生切换', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');
  hospitalService.subscribe('复旦大学附属华山医院');

  doctorService.subscribe('北京协和医院', '张医生');
  doctorService.subscribe('复旦大学附属华山医院', '王医生');

  // 当前主要医生应该是第一个订阅的
  assertEqual(doctorService.getPrimaryDoctor()!.hospital, '北京协和医院');

  // 切换到另一个医院的医生为主要
  doctorService.setPrimary('复旦大学附属华山医院', '王医生');

  assertEqual(doctorService.getPrimaryDoctor()!.hospital, '复旦大学附属华山医院');
  assertEqual(doctorService.getPrimaryDoctor()!.name, '王医生');
  cleanupTestData();
});

// ===== 持久化测试 =====

suite.add('DoctorSubscriptionService - 数据持久化', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');
  doctorService.subscribe('北京协和医院', '张医生', '心内科');

  // 创建新实例（模拟重启）
  const originalHome = process.env.HOME;
  process.env.HOME = TEST_STORAGE_DIR;

  const newHospitalService = new HospitalSubscriptionService();
  const newDoctorService = new DoctorSubscriptionService(newHospitalService);

  process.env.HOME = originalHome;

  // 验证数据已持久化
  const doctors = newDoctorService.getDoctors();
  assertEqual(doctors.length, 1);
  assertEqual(doctors[0].name, '张医生');
  assertEqual(doctors[0].hospital, '北京协和医院');
  assertEqual(doctors[0].department, '心内科');
  cleanupTestData();
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         Doctor Subscription Service 集成测试        ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);

  // 确保测试目录存在
  if (!fs.existsSync(TEST_STORAGE_DIR)) {
    fs.mkdirSync(TEST_STORAGE_DIR, { recursive: true });
  }

  const success = await suite.run('Doctor Subscription Service 集成测试');

  // 清理
  cleanupTestData();

  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  cleanupTestData();
  process.exit(1);
});
