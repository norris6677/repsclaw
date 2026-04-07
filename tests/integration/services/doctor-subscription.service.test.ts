#!/usr/bin/env tsx
/**
 * Doctor Subscription Service Mock 集成测试
 * 测试医生订阅服务的完整流程，使用内存数据库进行测试
 */

import { DoctorSubscriptionService, DoctorSubscription } from '../../../src/services/doctor-subscription.service';
import { HospitalSubscriptionService } from '../../../src/services/hospital-subscription.service';
import { MemorySubscriptionDatabase } from '../../../src/services/subscription-db.memory';
import type { ISubscriptionDatabase } from '../../../src/services/subscription-db.interface';
import { TestSuite, assertEqual, assertTrue, assertExists, assertFalse, c } from '../../unit/test-utils';

const suite = new TestSuite();

// 创建测试服务实例（使用内存数据库）
function createTestServices() {
  // 创建独立的内存数据库实例
  const testDB: ISubscriptionDatabase = new MemorySubscriptionDatabase();

  // 注入内存数据库到两个服务
  const hospitalService = new HospitalSubscriptionService(testDB);
  const doctorService = new DoctorSubscriptionService(hospitalService, testDB);

  return { hospitalService, doctorService };
}

// ===== 初始化测试 =====

suite.add('DoctorSubscriptionService - 初始化', async () => {
  const { doctorService } = createTestServices();
  assertExists(doctorService);
});

// ===== 医院验证测试 =====

suite.add('DoctorSubscriptionService - 订阅医生前必须订阅医院', async () => {
  const { doctorService } = createTestServices();

  // 尝试订阅医生，但未订阅医院
  const result = doctorService.subscribe('北京协和医院', '张医生');

  assertFalse(result.success);
  assertExists(result.error);
  assertTrue(result.error!.includes('未订阅'));
});

suite.add('DoctorSubscriptionService - 医院别名解析', async () => {
  const { hospitalService, doctorService } = createTestServices();

  // 先订阅医院（使用完整名称）
  hospitalService.subscribe('北京协和医院');

  // 使用别名订阅医生
  const result = doctorService.subscribe('协和', '张医生');

  assertTrue(result.success);
  assertEqual(result.subscription!.hospital, '北京协和医院');
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
});

suite.add('DoctorSubscriptionService - 订阅医生带科室', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');

  const result = doctorService.subscribe('北京协和医院', '张医生', '心内科');

  assertTrue(result.success);
  assertEqual(result.subscription!.department, '心内科');
});

suite.add('DoctorSubscriptionService - 第一个医生自动成为主要医生', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');

  const result = doctorService.subscribe('北京协和医院', '张医生');

  assertTrue(result.success);
  assertTrue(result.subscription!.isPrimary);
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
});

suite.add('DoctorSubscriptionService - 检查是否已订阅', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');
  doctorService.subscribe('北京协和医院', '张医生');

  assertTrue(doctorService.isSubscribed('北京协和医院', '张医生'));
  assertFalse(doctorService.isSubscribed('北京协和医院', '李医生'));
  assertFalse(doctorService.isSubscribed('复旦大学附属华山医院', '张医生'));
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
});

suite.add('DoctorSubscriptionService - 设置主要医生', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');

  doctorService.subscribe('北京协和医院', '张医生');
  doctorService.subscribe('北京协和医院', '李医生');

  const result = doctorService.setPrimary('北京协和医院', '李医生');

  assertTrue(result.success);
  assertEqual(doctorService.getPrimaryDoctor()!.name, '李医生');
});

suite.add('DoctorSubscriptionService - 设置未订阅的医生为主要', async () => {
  const { doctorService } = createTestServices();

  const result = doctorService.setPrimary('北京协和医院', '张医生');

  assertFalse(result.success);
  assertExists(result.error);
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
});

// ===== 取消订阅测试 =====

suite.add('DoctorSubscriptionService - 取消订阅医生', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');
  doctorService.subscribe('北京协和医院', '张医生');

  const result = doctorService.unsubscribe('北京协和医院', '张医生');

  assertTrue(result.success);
  assertEqual(doctorService.getDoctors().length, 0);
});

suite.add('DoctorSubscriptionService - 取消未订阅的医生', async () => {
  const { doctorService } = createTestServices();

  const result = doctorService.unsubscribe('北京协和医院', '张医生');

  assertFalse(result.success);
  assertExists(result.error);
});

suite.add('DoctorSubscriptionService - 取消主要医生后自动切换', async () => {
  const { hospitalService, doctorService } = createTestServices();

  hospitalService.subscribe('北京协和医院');

  doctorService.subscribe('北京协和医院', '张医生'); // 主要
  doctorService.subscribe('北京协和医院', '李医生');

  doctorService.unsubscribe('北京协和医院', '张医生');

  assertEqual(doctorService.getDoctors().length, 1);
  assertEqual(doctorService.getPrimaryDoctor()!.name, '李医生');
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
});

// ===== 持久化测试（使用内存数据库验证数据共享）=====

suite.add('DoctorSubscriptionService - 数据持久化（模拟重启）', async () => {
  // 创建共享的内存数据库实例
  const sharedDB: ISubscriptionDatabase = new MemorySubscriptionDatabase();

  // 第一个服务实例
  const hospitalService1 = new HospitalSubscriptionService(sharedDB);
  const doctorService1 = new DoctorSubscriptionService(hospitalService1, sharedDB);

  hospitalService1.subscribe('北京协和医院');
  doctorService1.subscribe('北京协和医院', '张医生', '心内科');

  // 创建新实例（模拟重启），使用相同的数据库实例
  const hospitalService2 = new HospitalSubscriptionService(sharedDB);
  const doctorService2 = new DoctorSubscriptionService(hospitalService2, sharedDB);

  // 验证数据已持久化（在内存中）
  const doctors = doctorService2.getDoctors();
  assertEqual(doctors.length, 1);
  assertEqual(doctors[0].name, '张医生');
  assertEqual(doctors[0].hospital, '北京协和医院');
  assertEqual(doctors[0].department, '心内科');
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         Doctor Subscription Service 集成测试        ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);

  const success = await suite.run('Doctor Subscription Service 集成测试');

  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
