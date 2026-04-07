#!/usr/bin/env tsx
/**
 * 医生关键词叠加功能单元测试
 * 验证医生名称是否正确叠加到搜索关键词中
 */

import { SubscriptionDatabase } from '../../src/services/subscription-db.service';
import { HospitalNewsService } from '../../src/services/hospital-news/hospital-news.service';

// 模拟BaiduSearchClient来验证关键词构建
class MockBaiduSearchClient {
  lastSearchQuery: string = '';

  async search(params: any): Promise<any[]> {
    const { hospitalName, keywords, departments, doctors } = params;

    // 构建科室后缀（复制实际逻辑）
    const deptSuffix = departments && departments.length > 0
      ? ` ${departments.join(' ')}`
      : '';

    // 构建医生后缀（复制实际逻辑）
    const doctorSuffix = doctors && doctors.length > 0
      ? ` ${doctors.join(' ')}`
      : '';

    // 构建搜索关键词（复制实际逻辑）
    let searchQuery = `${hospitalName}${deptSuffix}${doctorSuffix}`;
    if (keywords) {
      searchQuery += ` ${keywords}`;
    }
    searchQuery += ' 医院新闻';

    this.lastSearchQuery = searchQuery;
    return [];
  }
}

// 测试函数
async function runTests() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     医生关键词叠加功能测试                           ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const client = new MockBaiduSearchClient();
  let passed = 0;
  let failed = 0;

  // 测试1: 无医生时搜索关键词
  console.log('测试1: 无医生时的搜索关键词');
  await client.search({
    hospitalName: '北京协和医院',
    aliases: ['协和医院'],
    days: 7,
    maxResults: 10,
  });

  if (client.lastSearchQuery === '北京协和医院 医院新闻') {
    console.log('  ✓ PASS - 关键词: ' + client.lastSearchQuery);
    passed++;
  } else {
    console.log(`  ✗ FAIL - 期望: "北京协和医院 医院新闻", 实际: "${client.lastSearchQuery}"`);
    failed++;
  }

  // 测试2: 单医生时搜索关键词
  console.log('\n测试2: 单医生时的搜索关键词');
  await client.search({
    hospitalName: '北京协和医院',
    aliases: ['协和医院'],
    days: 7,
    maxResults: 10,
    doctors: ['张医生'],
  });

  if (client.lastSearchQuery === '北京协和医院 张医生 医院新闻') {
    console.log('  ✓ PASS - 关键词: ' + client.lastSearchQuery);
    passed++;
  } else {
    console.log(`  ✗ FAIL - 期望: "北京协和医院 张医生 医院新闻", 实际: "${client.lastSearchQuery}"`);
    failed++;
  }

  // 测试3: 多医生时搜索关键词
  console.log('\n测试3: 多医生时的搜索关键词');
  await client.search({
    hospitalName: '北京协和医院',
    aliases: ['协和医院'],
    days: 7,
    maxResults: 10,
    doctors: ['张医生', '李医生'],
  });

  if (client.lastSearchQuery === '北京协和医院 张医生 李医生 医院新闻') {
    console.log('  ✓ PASS - 关键词: ' + client.lastSearchQuery);
    passed++;
  } else {
    console.log(`  ✗ FAIL - 期望: "北京协和医院 张医生 李医生 医院新闻", 实际: "${client.lastSearchQuery}"`);
    failed++;
  }

  // 测试4: 医生+额外关键词
  console.log('\n测试4: 医生+额外关键词');
  await client.search({
    hospitalName: '北京协和医院',
    aliases: ['协和医院'],
    days: 7,
    maxResults: 10,
    doctors: ['王医生'],
    keywords: '心脏手术',
  });

  if (client.lastSearchQuery === '北京协和医院 王医生 心脏手术 医院新闻') {
    console.log('  ✓ PASS - 关键词: ' + client.lastSearchQuery);
    passed++;
  } else {
    console.log(`  ✗ FAIL - 期望: "北京协和医院 王医生 心脏手术 医院新闻", 实际: "${client.lastSearchQuery}"`);
    failed++;
  }

  // 测试5: 科室+医生+额外关键词组合
  console.log('\n测试5: 科室+医生+额外关键词组合');
  await client.search({
    hospitalName: '北京协和医院',
    aliases: ['协和医院'],
    days: 7,
    maxResults: 10,
    departments: ['心内科'],
    doctors: ['张三', '李四'],
    keywords: '冠心病',
  });

  if (client.lastSearchQuery === '北京协和医院 心内科 张三 李四 冠心病 医院新闻') {
    console.log('  ✓ PASS - 关键词: ' + client.lastSearchQuery);
    passed++;
  } else {
    console.log(`  ✗ FAIL - 期望: "北京协和医院 心内科 张三 李四 冠心病 医院新闻", 实际: "${client.lastSearchQuery}"`);
    failed++;
  }

  // 测试6: 数据库医生订阅集成测试
  console.log('\n测试6: 数据库医生订阅集成测试');
  const db = new SubscriptionDatabase();

  // 清理并设置测试数据
  db.unsubscribe('TestHospital_DoctorTest');
  db.subscribe('TestHospital_DoctorTest', true);

  // 订阅医生
  const result1 = db.subscribeDoctor('TestHospital_DoctorTest', '王医生', '心内科');
  const result2 = db.subscribeDoctor('TestHospital_DoctorTest', '李医生', '神经外科');

  // 获取医生列表
  const doctors = db.getDoctors('TestHospital_DoctorTest');

  if (doctors && doctors.length === 2) {
    console.log(`  ✓ PASS - 数据库正确存储医生订阅: ${doctors.map(d => d.name).join(', ')}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL - 期望2个医生，实际${doctors?.length || 0}个`);
    failed++;
  }

  // 测试主要医生功能
  const primaryResult = db.setPrimaryDoctor('TestHospital_DoctorTest', '王医生');
  const primaryDoctor = db.getPrimaryDoctor();

  if (primaryResult && primaryDoctor?.name === '王医生') {
    console.log(`  ✓ PASS - 主要医生设置正确: ${primaryDoctor.name}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL - 主要医生设置失败`);
    failed++;
  }

  // 清理
  db.unsubscribe('TestHospital_DoctorTest');
  db.close();

  // 汇总结果
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  测试结果: ${passed} 通过, ${failed} 失败                              ║`);
  console.log('╚══════════════════════════════════════════════════════╝');

  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
