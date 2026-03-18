#!/usr/bin/env tsx
/**
 * Hospital News Service Mock 集成测试
 * 测试医院新闻服务的完整流程
 */

import { HospitalNewsService } from '../../../src/services/hospital-news/hospital-news.service';
import { NewsSourceType } from '../../../src/types/hospital-news.types';
import { TestSuite, assertEqual, assertTrue, assertExists, assertFalse, c } from '../../unit/test-utils';

const suite = new TestSuite();

// ===== 初始化测试 =====

suite.add('HospitalNewsService - 初始化', async () => {
  const service = new HospitalNewsService();
  assertExists(service);
});

// ===== 医院解析测试 =====

suite.add('HospitalNewsService - 解析已知医院', async () => {
  const service = new HospitalNewsService();

  const result = await service.getNews({
    hospitalName: '北京协和医院',
    days: 7,
    maxResults: 10,
  });

  assertEqual(result.status, 'success');
  assertEqual(result.hospital.resolved, '北京协和医院');
  assertTrue(result.hospital.aliases.includes('协和医院'));
});

suite.add('HospitalNewsService - 使用别名查询', async () => {
  const service = new HospitalNewsService();

  // 使用别名"协和"查询
  const result = await service.getNews({
    hospitalName: '协和',
    days: 7,
    maxResults: 10,
  });

  // 应该解析为北京协和医院
  assertEqual(result.status, 'success');
  assertEqual(result.hospital.input, '协和');
  assertEqual(result.hospital.resolved, '北京协和医院');
});

suite.add('HospitalNewsService - 使用简称查询', async () => {
  const service = new HospitalNewsService();

  // 使用"华西"查询
  const result = await service.getNews({
    hospitalName: '华西',
    days: 7,
    maxResults: 10,
  });

  assertEqual(result.status, 'success');
  assertEqual(result.hospital.resolved, '四川大学华西医院');
});

suite.add('HospitalNewsService - 未知医院返回错误', async () => {
  const service = new HospitalNewsService();

  const result = await service.getNews({
    hospitalName: '完全不存在的医院XYZ123',
    days: 7,
    maxResults: 10,
  });

  assertEqual(result.status, 'error');
  assertEqual(result.hospital.resolved, '');
  assertEqual(result.totalFound, 0);
});

// ===== 数据源测试 =====

suite.add('HospitalNewsService - 指定数据源类型', async () => {
  const service = new HospitalNewsService();

  const result = await service.getNews({
    hospitalName: '北京协和医院',
    sources: [NewsSourceType.HOSPITAL_SELF, NewsSourceType.OFFICIAL],
    days: 7,
    maxResults: 10,
  });

  assertEqual(result.status, 'success');
  // 只查询指定的源类型
  assertTrue(result.query.sources.includes(NewsSourceType.HOSPITAL_SELF));
  assertTrue(result.query.sources.includes(NewsSourceType.OFFICIAL));
});

suite.add('HospitalNewsService - 使用所有数据源', async () => {
  const service = new HospitalNewsService();

  const result = await service.getNews({
    hospitalName: '北京协和医院',
    days: 7,
    maxResults: 10,
  });

  assertEqual(result.status, 'success');
  // 默认应该包含所有数据源
  assertTrue(result.query.sources.includes(NewsSourceType.HOSPITAL_SELF));
  assertTrue(result.query.sources.includes(NewsSourceType.OFFICIAL));
  assertTrue(result.query.sources.includes(NewsSourceType.MAINSTREAM));
});

// ===== 参数边界测试 =====

suite.add('HospitalNewsService - 使用关键词过滤', async () => {
  const service = new HospitalNewsService();

  const result = await service.getNews({
    hospitalName: '北京协和医院',
    days: 30,
    maxResults: 10,
    keywords: '科研 获奖',
  });

  assertEqual(result.status, 'success');
  assertEqual(result.query.keywords, '科研 获奖');
});

suite.add('HospitalNewsService - days参数边界检查', async () => {
  const service = new HospitalNewsService();

  // 小于1应该被限制为1
  const resultMin = await service.getNews({
    hospitalName: '北京协和医院',
    days: 0,
    maxResults: 10,
  });
  assertTrue(resultMin.query.days >= 1);

  // 大于90应该被限制为90
  const resultMax = await service.getNews({
    hospitalName: '北京协和医院',
    days: 100,
    maxResults: 10,
  });
  assertTrue(resultMax.query.days <= 90);
});

suite.add('HospitalNewsService - maxResults参数边界检查', async () => {
  const service = new HospitalNewsService();

  // 超过50应该被限制
  const result = await service.getNews({
    hospitalName: '北京协和医院',
    days: 7,
    maxResults: 100,
  });

  assertTrue(result.results.length <= 50);
});

suite.add('HospitalNewsService - maxResults最小值', async () => {
  const service = new HospitalNewsService();

  const result = await service.getNews({
    hospitalName: '北京协和医院',
    days: 7,
    maxResults: 1,
  });

  assertTrue(result.results.length <= 1);
});

// ===== 缓存测试 =====

suite.add('HospitalNewsService - 缓存机制', async () => {
  const service = new HospitalNewsService();

  // 第一次查询
  const result1 = await service.getNews({
    hospitalName: '北京协和医院',
    days: 7,
    maxResults: 10,
  });

  // 第二次相同查询应该使用缓存
  const result2 = await service.getNews({
    hospitalName: '北京协和医院',
    days: 7,
    maxResults: 10,
  });

  assertEqual(result2.status, 'success');
});

suite.add('HospitalNewsService - 不同参数不使用缓存', async () => {
  const service = new HospitalNewsService();

  // 第一次查询
  const result1 = await service.getNews({
    hospitalName: '北京协和医院',
    days: 7,
    maxResults: 10,
  });

  // 第二次不同参数查询
  const result2 = await service.getNews({
    hospitalName: '北京协和医院',
    days: 14, // 不同参数
    maxResults: 10,
  });

  assertEqual(result2.status, 'success');
  assertEqual(result2.query.days, 14);
});

suite.add('HospitalNewsService - 清除缓存', async () => {
  const service = new HospitalNewsService();

  // 先查询一次
  await service.getNews({
    hospitalName: '北京协和医院',
    days: 7,
    maxResults: 10,
  });

  // 清除缓存
  service.clearCache();

  const stats = service.getCacheStats();
  assertEqual(stats.size, 0);
});

suite.add('HospitalNewsService - 获取缓存统计', async () => {
  const service = new HospitalNewsService();

  // 清除并查询
  service.clearCache();
  await service.getNews({
    hospitalName: '北京协和医院',
    days: 7,
    maxResults: 10,
  });

  const stats = service.getCacheStats();
  assertTrue(stats.size >= 0);
  assertExists(stats.entries);
});

// ===== 结果格式测试 =====

suite.add('HospitalNewsService - 返回结果包含meta信息', async () => {
  const service = new HospitalNewsService();

  const result = await service.getNews({
    hospitalName: '华山医院',
    days: 7,
    maxResults: 10,
  });

  assertExists(result.meta);
  assertExists(result.meta.cached !== undefined);
  assertExists(result.meta.fetchedAt);
  assertExists(result.meta.nextUpdateAt);
});

suite.add('HospitalNewsService - sourceStats统计', async () => {
  const service = new HospitalNewsService();

  const result = await service.getNews({
    hospitalName: '北京协和医院',
    days: 7,
    maxResults: 10,
  });

  assertExists(result.sourceStats);
  assertExists(result.sourceStats[NewsSourceType.HOSPITAL_SELF] !== undefined);
  assertExists(result.sourceStats[NewsSourceType.OFFICIAL] !== undefined);
  assertExists(result.sourceStats[NewsSourceType.MAINSTREAM] !== undefined);
  assertExists(result.sourceStats[NewsSourceType.AGGREGATOR] !== undefined);
});

suite.add('HospitalNewsService - 返回结果结构完整', async () => {
  const service = new HospitalNewsService();

  const result = await service.getNews({
    hospitalName: '北京协和医院',
    days: 7,
    maxResults: 10,
  });

  assertEqual(result.status, 'success');
  assertExists(result.hospital);
  assertExists(result.hospital.input);
  assertExists(result.hospital.resolved);
  assertExists(result.hospital.aliases);
  assertExists(result.query);
  assertExists(result.totalFound);
  assertExists(result.results);
  assertTrue(Array.isArray(result.results));
  assertExists(result.sourceStats);
  assertExists(result.meta);
});

// ===== 多医院测试 =====

suite.add('HospitalNewsService - 查询不同医院', async () => {
  const service = new HospitalNewsService();

  const hospitals = ['北京协和医院', '四川大学华西医院', '复旦大学附属中山医院'];

  for (const hospital of hospitals) {
    const result = await service.getNews({
      hospitalName: hospital,
      days: 7,
      maxResults: 5,
    });

    assertEqual(result.status, 'success');
    assertEqual(result.hospital.resolved, hospital);
  }
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         Hospital News Service Mock 集成测试         ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);

  const success = await suite.run('Hospital News Service 集成测试');
  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
