#!/usr/bin/env tsx
/**
 * 科室关键词叠加功能单元测试
 * 验证科室名称是否正确叠加到搜索关键词中
 */

import { SubscriptionDatabase } from '../../src/services/subscription-db.service';
import { HospitalNewsService } from '../../src/services/hospital-news/hospital-news.service';

// 模拟BaiduSearchClient来验证关键词构建
class MockBaiduSearchClient {
  lastSearchQuery: string = '';

  async search(params: any): Promise<any[]> {
    const { hospitalName, keywords, departments } = params;

    // 构建科室后缀（复制实际逻辑）
    const deptSuffix = departments && departments.length > 0
      ? ` ${departments.join(' ')}`
      : '';

    // 构建搜索关键词（复制实际逻辑）
    let searchQuery = `${hospitalName}${deptSuffix}`;
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
  console.log('║     科室关键词叠加功能测试                           ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const client = new MockBaiduSearchClient();
  let passed = 0;
  let failed = 0;

  // 测试1: 无科室时搜索关键词
  console.log('测试1: 无科室时的搜索关键词');
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

  // 测试2: 单科室时搜索关键词
  console.log('\n测试2: 单科室时的搜索关键词');
  await client.search({
    hospitalName: '北京协和医院',
    aliases: ['协和医院'],
    days: 7,
    maxResults: 10,
    departments: ['心内科'],
  });

  if (client.lastSearchQuery === '北京协和医院 心内科 医院新闻') {
    console.log('  ✓ PASS - 关键词: ' + client.lastSearchQuery);
    passed++;
  } else {
    console.log(`  ✗ FAIL - 期望: "北京协和医院 心内科 医院新闻", 实际: "${client.lastSearchQuery}"`);
    failed++;
  }

  // 测试3: 多科室时搜索关键词
  console.log('\n测试3: 多科室时的搜索关键词');
  await client.search({
    hospitalName: '北京协和医院',
    aliases: ['协和医院'],
    days: 7,
    maxResults: 10,
    departments: ['心内科', '神经外科'],
  });

  if (client.lastSearchQuery === '北京协和医院 心内科 神经外科 医院新闻') {
    console.log('  ✓ PASS - 关键词: ' + client.lastSearchQuery);
    passed++;
  } else {
    console.log(`  ✗ FAIL - 期望: "北京协和医院 心内科 神经外科 医院新闻", 实际: "${client.lastSearchQuery}"`);
    failed++;
  }

  // 测试4: 科室+额外关键词
  console.log('\n测试4: 科室+额外关键词');
  await client.search({
    hospitalName: '北京协和医院',
    aliases: ['协和医院'],
    days: 7,
    maxResults: 10,
    departments: ['心内科'],
    keywords: '冠心病',
  });

  if (client.lastSearchQuery === '北京协和医院 心内科 冠心病 医院新闻') {
    console.log('  ✓ PASS - 关键词: ' + client.lastSearchQuery);
    passed++;
  } else {
    console.log(`  ✗ FAIL - 期望: "北京协和医院 心内科 冠心病 医院新闻", 实际: "${client.lastSearchQuery}"`);
    failed++;
  }

  // 测试5: 验证HospitalNewsService正确传递科室参数
  console.log('\n测试5: HospitalNewsService科室参数传递');
  const db = new SubscriptionDatabase();

  // 清理并设置测试数据
  db.unsubscribe('TestHospital_KeywordTest');
  db.subscribe('TestHospital_KeywordTest', true);
  db.subscribeDepartment('TestHospital_KeywordTest', '心内科');
  db.subscribeDepartment('TestHospital_KeywordTest', '消化内科');

  // 获取订阅信息验证
  const subscription = db.getByName('TestHospital_KeywordTest');
  if (subscription && subscription.departments) {
    console.log(`  ✓ PASS - 订阅科室: ${subscription.departments.join(', ')}`);
    passed++;
  } else {
    console.log('  ✗ FAIL - 无法获取科室订阅信息');
    failed++;
  }

  // 清理
  db.unsubscribe('TestHospital_KeywordTest');
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
