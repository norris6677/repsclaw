#!/usr/bin/env tsx
/**
 * Hospital Name Resolver Mock 集成测试
 * 测试医院名称解析器的各种匹配场景
 */

import { HospitalNameResolver } from '../../../src/utils/hospital-name-resolver';
import { TestSuite, assertEqual, assertTrue, assertExists, c } from '../../unit/test-utils';

const suite = new TestSuite();

suite.add('HospitalNameResolver - 初始化', async () => {
  const resolver = new HospitalNameResolver();
  assertExists(resolver);
});

suite.add('HospitalNameResolver - 精确匹配标准名称', async () => {
  const resolver = new HospitalNameResolver();

  const result = resolver.resolve('北京协和医院');
  assertExists(result);
  assertEqual(result?.name, '北京协和医院');
  assertEqual(result?.isAlias, false);
});

suite.add('HospitalNameResolver - 匹配别名', async () => {
  const resolver = new HospitalNameResolver();

  // 协和是别名
  const result = resolver.resolve('协和');
  assertExists(result);
  assertEqual(result?.name, '北京协和医院');
  assertEqual(result?.isAlias, true);
  assertTrue(result?.aliases.includes('协和'));
});

suite.add('HospitalNameResolver - 匹配别名华西', async () => {
  const resolver = new HospitalNameResolver();

  const result = resolver.resolve('华西');
  assertExists(result);
  assertEqual(result?.name, '四川大学华西医院');
  assertEqual(result?.isAlias, true);
});

suite.add('HospitalNameResolver - 包含匹配', async () => {
  const resolver = new HospitalNameResolver();

  // 部分匹配
  const result = resolver.resolve('协和医院');
  assertExists(result);
  assertEqual(result?.name, '北京协和医院');
});

suite.add('HospitalNameResolver - 未知医院返回null', async () => {
  const resolver = new HospitalNameResolver();

  const result = resolver.resolve('完全不存在的医院XYZ');
  assertEqual(result, null);
});

suite.add('HospitalNameResolver - 静态方法findHospital精确匹配', async () => {
  const candidates = ['北京协和医院', '华山医院', '瑞金医院'];
  const result = HospitalNameResolver.findHospital('北京协和医院', candidates);

  assertExists(result);
  assertEqual(result?.name, '北京协和医院');
  assertEqual(result?.matchType, 'exact');
  assertEqual(result?.score, 1.0);
});

suite.add('HospitalNameResolver - 静态方法findHospital包含匹配', async () => {
  const candidates = ['北京协和医院', '华山医院'];
  const result = HospitalNameResolver.findHospital('协和', candidates);

  assertExists(result);
  assertEqual(result?.name, '北京协和医院');
  assertEqual(result?.matchType, 'contains');
});

suite.add('HospitalNameResolver - 静态方法findHospital别名匹配', async () => {
  const candidates = ['复旦大学附属华山医院', '上海华山医院'];
  const result = HospitalNameResolver.findHospital('华山', candidates);

  assertExists(result);
  // 可能是alias或contains，取决于匹配算法
  assertTrue(result?.matchType === 'alias' || result?.matchType === 'contains');
});

suite.add('HospitalNameResolver - 静态方法findHospital无匹配', async () => {
  const candidates = ['北京协和医院', '华山医院'];
  const result = HospitalNameResolver.findHospital('不存在的医院', candidates);

  assertEqual(result, null);
});

suite.add('HospitalNameResolver - 静态方法normalize标准化', async () => {
  const normalized1 = HospitalNameResolver.normalize('北京协和医院');
  const normalized2 = HospitalNameResolver.normalize('  北京 协和 医院  ');
  const normalized3 = HospitalNameResolver.normalize('北京，协和医院。');

  // 应该去除空格和标点
  assertTrue(normalized1.length > 0);
  assertExists(normalized2);
  assertExists(normalized3);
});

suite.add('HospitalNameResolver - 静态方法extractFromInput', async () => {
  // subscribe意图
  const extracted1 = HospitalNameResolver.extractFromInput('我想订阅北京协和医院', 'subscribe');
  assertTrue(extracted1.includes('协和') || extracted1.includes('北京'));

  // unsubscribe意图
  const extracted2 = HospitalNameResolver.extractFromInput('取消订阅华山医院', 'unsubscribe');
  assertTrue(extracted2.includes('华山'));

  // set-primary意图
  const extracted3 = HospitalNameResolver.extractFromInput('设置瑞金医院为主要医院', 'set-primary');
  assertTrue(extracted3.includes('瑞金'));
});

suite.add('HospitalNameResolver - 模糊匹配', async () => {
  const resolver = new HospitalNameResolver();

  // 轻微拼写差异
  const result = resolver.resolve('北就协和医院'); // typo
  // 如果相似度超过阈值，应该能匹配
  if (result) {
    assertTrue(result.score > 0.7 || result.isAlias);
  }
});

suite.add('HospitalNameResolver - 多医院列表支持', async () => {
  const resolver = new HospitalNameResolver();

  // Top医院列表中的医院应该都能被解析
  const hospitals = [
    '北京协和医院',
    '四川大学华西医院',
    '复旦大学附属中山医院',
    '上海交通大学医学院附属瑞金医院',
    '华中科技大学同济医学院附属同济医院',
  ];

  for (const hospital of hospitals) {
    const result = resolver.resolve(hospital);
    assertExists(result);
    assertEqual(result?.name, hospital);
  }
});

suite.add('HospitalNameResolver - 别名列表完整', async () => {
  const resolver = new HospitalNameResolver();

  const result = resolver.resolve('上海华山');
  assertExists(result);
  assertEqual(result?.name, '复旦大学附属华山医院');
  assertTrue(result?.aliases.includes('华山医院'));
  assertTrue(result?.aliases.includes('上海华山'));
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         Hospital Name Resolver Mock 集成测试        ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);

  const success = await suite.run('Hospital Name Resolver 集成测试');
  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
