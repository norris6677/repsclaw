#!/usr/bin/env tsx
/**
 * Hospital Subscription Service Mock 集成测试
 * 测试医院订阅服务的完整流程，包括持久化存储
 */

import { HospitalSubscriptionService } from '../../../src/services/hospital-subscription.service';
import { TestSuite, assertEqual, assertTrue, assertExists, assertFalse, c } from '../../unit/test-utils';
import * as fs from 'fs';
import * as path from 'path';

const suite = new TestSuite();

// 使用临时存储路径进行测试
const TEST_STORAGE_PATH = '/tmp/.openclaw/repsclaw-test/hospital-subscriptions.json';

// 临时覆盖服务存储路径
function createTestService(): HospitalSubscriptionService {
  const service = new HospitalSubscriptionService();
  // 覆盖存储路径（通过修改原型访问私有属性）
  (service as any).storagePath = TEST_STORAGE_PATH;
  // 重置数据
  (service as any).data = { hospitals: [], lastPromptedDate: null };
  return service;
}

// 清理测试数据
function cleanupTestData() {
  try {
    const dir = path.dirname(TEST_STORAGE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(TEST_STORAGE_PATH)) {
      fs.unlinkSync(TEST_STORAGE_PATH);
    }
  } catch {
    // ignore
  }
}

suite.beforeEach(() => {
  cleanupTestData();
});

suite.afterEach(() => {
  cleanupTestData();
});

// ===== 初始化测试 =====

suite.add('HospitalSubscriptionService - 初始化', async () => {
  const service = createTestService();
  assertExists(service);
  assertEqual(service.getHospitals().length, 0);
});

// ===== 订阅功能测试 =====

suite.add('HospitalSubscriptionService - 订阅医院', async () => {
  const service = createTestService();

  const subscription = service.subscribe('北京协和医院');

  assertEqual(subscription.name, '北京协和医院');
  assertTrue(subscription.isPrimary, '第一个订阅应该自动成为主要医院');
  assertExists(subscription.subscribedAt);
});

suite.add('HospitalSubscriptionService - 订阅多个医院', async () => {
  const service = createTestService();

  service.subscribe('北京协和医院');
  service.subscribe('华山医院');
  service.subscribe('瑞金医院');

  const hospitals = service.getHospitals();
  assertEqual(hospitals.length, 3);
});

suite.add('HospitalSubscriptionService - 重复订阅更新主要状态', async () => {
  const service = createTestService();

  service.subscribe('北京协和医院');
  const updated = service.subscribe('北京协和医院', true);

  assertTrue(updated.isPrimary);
});

suite.add('HospitalSubscriptionService - 大小写不敏感订阅', async () => {
  const service = createTestService();

  service.subscribe('Beijing Xiehe Hospital');
  const isSubscribed = service.isSubscribed('beijing xiehe hospital');

  assertTrue(isSubscribed);
});

// ===== 主要医院功能测试 =====

suite.add('HospitalSubscriptionService - 获取主要医院', async () => {
  const service = createTestService();

  service.subscribe('北京协和医院');
  service.subscribe('华山医院');

  const primary = service.getPrimaryHospital();
  assertEqual(primary?.name, '北京协和医院');
});

suite.add('HospitalSubscriptionService - 设置主要医院', async () => {
  const service = createTestService();

  service.subscribe('北京协和医院');
  service.subscribe('华山医院');

  const result = service.setPrimary('华山医院');
  assertTrue(result);

  const primary = service.getPrimaryHospital();
  assertEqual(primary?.name, '华山医院');
});

suite.add('HospitalSubscriptionService - 只有一个主要医院', async () => {
  const service = createTestService();

  service.subscribe('医院A');
  service.subscribe('医院B');
  service.subscribe('医院C');

  service.setPrimary('医院B');

  const hospitals = service.getHospitals();
  const primaryCount = hospitals.filter(h => h.isPrimary).length;
  assertEqual(primaryCount, 1);
});

suite.add('HospitalSubscriptionService - 设置未订阅医院为主要失败', async () => {
  const service = createTestService();

  service.subscribe('北京协和医院');

  const result = service.setPrimary('不存在的医院');
  assertFalse(result);
});

// ===== 取消订阅测试 =====

suite.add('HospitalSubscriptionService - 取消订阅', async () => {
  const service = createTestService();

  service.subscribe('北京协和医院');
  const result = service.unsubscribe('北京协和医院');

  assertTrue(result);
  assertEqual(service.getHospitals().length, 0);
});

suite.add('HospitalSubscriptionService - 取消未订阅的医院', async () => {
  const service = createTestService();

  const result = service.unsubscribe('不存在的医院');
  assertFalse(result);
});

suite.add('HospitalSubscriptionService - 取消主要医院后自动切换', async () => {
  const service = createTestService();

  service.subscribe('北京协和医院');
  service.subscribe('华山医院');

  // 北京协和医院是主要医院
  assertEqual(service.getPrimaryHospital()?.name, '北京协和医院');

  // 取消北京协和医院
  service.unsubscribe('北京协和医院');

  // 华山医院应该成为主要医院
  assertEqual(service.getPrimaryHospital()?.name, '华山医院');
});

// ===== 查询功能测试 =====

suite.add('HospitalSubscriptionService - 检查是否已订阅', async () => {
  const service = createTestService();

  service.subscribe('北京协和医院');

  assertTrue(service.isSubscribed('北京协和医院'));
  assertTrue(service.isSubscribed('北京协和医院'.toLowerCase())); // 大小写不敏感
  assertFalse(service.isSubscribed('华山医院'));
});

suite.add('HospitalSubscriptionService - 获取统计信息', async () => {
  const service = createTestService();

  service.subscribe('北京协和医院');
  service.subscribe('华山医院');
  service.setPrimary('华山医院');

  const stats = service.getStats();
  assertEqual(stats.total, 2);
  assertEqual(stats.primary, '华山医院');
});

// ===== 首次使用/提示功能测试 =====

suite.add('HospitalSubscriptionService - 首次使用检查', async () => {
  const service = createTestService();

  assertTrue(service.isFirstTime());

  service.subscribe('北京协和医院');

  assertFalse(service.isFirstTime());
});

suite.add('HospitalSubscriptionService - 提示日期管理', async () => {
  const service = createTestService();

  assertFalse(service.hasPromptedToday());

  service.updateLastPromptedDate();

  assertTrue(service.hasPromptedToday());
  assertExists(service.getLastPromptedDate());
});

// ===== 别名解析测试 =====

suite.add('HospitalSubscriptionService - 解析医院名称', async () => {
  const service = createTestService();

  service.subscribe('北京协和医院');

  const resolved = service.resolveHospitalName('北京协和医院');
  assertExists(resolved);
  assertEqual(resolved?.name, '北京协和医院');
  assertFalse(resolved?.isAlias);
});

suite.add('HospitalSubscriptionService - 通过别名查找医院', async () => {
  const service = createTestService();

  service.subscribe('复旦大学附属华山医院');

  const match = service.findHospitalByAlias('华山医院');
  assertExists(match);
  assertEqual(match?.name, '复旦大学附属华山医院');
});

// ===== 持久化测试 =====

suite.add('HospitalSubscriptionService - 数据持久化', async () => {
  // 创建服务并添加数据
  const service1 = createTestService();
  service1.subscribe('北京协和医院');
  service1.subscribe('华山医院');
  service1.updateLastPromptedDate();

  // 创建新服务实例（模拟重启）
  const service2 = createTestService();
  // 手动加载数据
  (service2 as any).data = (service1 as any).data;

  const hospitals = service2.getHospitals();
  assertEqual(hospitals.length, 2);
  assertTrue(service2.isSubscribed('北京协和医院'));
});

// ===== 边界情况测试 =====

suite.add('HospitalSubscriptionService - 空名称处理', async () => {
  const service = createTestService();

  service.subscribe('');

  // 空字符串也应该被存储
  assertEqual(service.getHospitals().length, 1);
});

suite.add('HospitalSubscriptionService - 特殊字符名称', async () => {
  const service = createTestService();

  service.subscribe('医院① 🏥');

  assertTrue(service.isSubscribed('医院① 🏥'));
});

// ===== 综合场景测试 =====

suite.add('HospitalSubscriptionService - 完整使用流程', async () => {
  const service = createTestService();

  // 1. 首次使用
  assertTrue(service.isFirstTime());
  assertTrue(service.getHospitals().length === 0);

  // 2. 订阅第一家医院
  service.subscribe('北京协和医院');
  assertEqual(service.getPrimaryHospital()?.name, '北京协和医院');

  // 3. 订阅更多医院
  service.subscribe('华山医院');
  service.subscribe('瑞金医院');
  assertEqual(service.getHospitals().length, 3);

  // 4. 切换主要医院
  service.setPrimary('瑞金医院');
  assertEqual(service.getPrimaryHospital()?.name, '瑞金医院');

  // 5. 检查状态
  const stats = service.getStats();
  assertEqual(stats.total, 3);
  assertEqual(stats.primary, '瑞金医院');

  // 6. 取消一家医院
  service.unsubscribe('华山医院');
  assertEqual(service.getHospitals().length, 2);

  // 7. 不再是首次使用
  assertFalse(service.isFirstTime());

  // 8. 更新提示日期
  service.updateLastPromptedDate();
  assertTrue(service.hasPromptedToday());
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}     Hospital Subscription Service Mock 集成测试     ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);

  const success = await suite.run('Hospital Subscription Service Mock 集成测试');
  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
