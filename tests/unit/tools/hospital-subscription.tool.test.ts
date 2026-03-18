#!/usr/bin/env tsx
/**
 * Hospital Subscription Tool 单元测试
 * 测试医院订阅工具的所有功能
 */

import {
  SubscribeHospitalTool,
  SubscribeHospitalParametersSchema,
  createSubscribeHospitalHandler,
  SUBSCRIBE_HOSPITAL_TOOL_NAME,
  ListHospitalsTool,
  createListHospitalsHandler,
  LIST_HOSPITALS_TOOL_NAME,
  UnsubscribeHospitalTool,
  UnsubscribeHospitalParametersSchema,
  createUnsubscribeHospitalHandler,
  UNSUBSCRIBE_HOSPITAL_TOOL_NAME,
  SetPrimaryHospitalTool,
  SetPrimaryHospitalParametersSchema,
  createSetPrimaryHospitalHandler,
  SET_PRIMARY_HOSPITAL_TOOL_NAME,
  CheckSubscriptionStatusTool,
  createCheckSubscriptionStatusHandler,
  CHECK_SUBSCRIPTION_STATUS_TOOL_NAME,
} from '../../../src/tools/hospital-subscription.tool';
import { HospitalSubscriptionService } from '../../../src/services/hospital-subscription.service';
import { TestSuite, assertEqual, assertTrue, assertExists, c, assertFalse } from '../test-utils';
import * as fs from 'fs';
import * as path from 'path';

const suite = new TestSuite();

// 测试用的内存存储Service
class MockHospitalSubscriptionService {
  private hospitals: any[] = [];
  private lastPromptedDate: string | null = null;

  getHospitals() {
    return [...this.hospitals];
  }

  getPrimaryHospital() {
    return this.hospitals.find((h: any) => h.isPrimary) || this.hospitals[0] || null;
  }

  isSubscribed(name: string): boolean {
    return this.hospitals.some((h: any) => h.name.toLowerCase() === name.toLowerCase());
  }

  resolveHospitalName(input: string): { name: string; isAlias: boolean } | null {
    const exactMatch = this.hospitals.find((h: any) => h.name.toLowerCase() === input.toLowerCase());
    if (exactMatch) {
      return { name: exactMatch.name, isAlias: false };
    }
    return null;
  }

  subscribe(name: string, isPrimary: boolean = false): any {
    const existingIndex = this.hospitals.findIndex((h: any) => h.name.toLowerCase() === name.toLowerCase());

    if (existingIndex >= 0) {
      if (isPrimary) {
        this.hospitals.forEach((h: any) => h.isPrimary = false);
        this.hospitals[existingIndex].isPrimary = true;
      }
      return this.hospitals[existingIndex];
    }

    if (this.hospitals.length === 0) {
      isPrimary = true;
    }

    if (isPrimary) {
      this.hospitals.forEach((h: any) => h.isPrimary = false);
    }

    const subscription = {
      name,
      subscribedAt: new Date().toISOString(),
      isPrimary,
    };

    this.hospitals.push(subscription);
    return subscription;
  }

  unsubscribe(name: string): boolean {
    const index = this.hospitals.findIndex((h: any) => h.name.toLowerCase() === name.toLowerCase());
    if (index >= 0) {
      const wasPrimary = this.hospitals[index].isPrimary;
      this.hospitals.splice(index, 1);
      if (wasPrimary && this.hospitals.length > 0) {
        this.hospitals[0].isPrimary = true;
      }
      return true;
    }
    return false;
  }

  setPrimary(name: string): boolean {
    const hospital = this.hospitals.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
    if (hospital) {
      this.hospitals.forEach((h: any) => h.isPrimary = false);
      hospital.isPrimary = true;
      return true;
    }
    return false;
  }

  isFirstTime(): boolean {
    return this.hospitals.length === 0;
  }

  hasPromptedToday(): boolean {
    return false;
  }

  getStats(): { total: number; primary: string | null } {
    return {
      total: this.hospitals.length,
      primary: this.getPrimaryHospital()?.name || null,
    };
  }

  updateLastPromptedDate(): void {
    this.lastPromptedDate = new Date().toISOString().split('T')[0];
  }
}

// 创建内存中的service实例
function createTempService() {
  return new MockHospitalSubscriptionService();
}

// ===== 工具定义测试 =====

suite.add('SubscribeHospitalTool - 工具定义完整', async () => {
  assertEqual(SubscribeHospitalTool.name, 'subscribe_hospital');
  assertExists(SubscribeHospitalTool.description);
  assertExists(SubscribeHospitalTool.parameters);
});

suite.add('SubscribeHospitalTool - 参数Schema验证', async () => {
  // 有效参数
  const validParams = {
    name: '北京协和医院',
    isPrimary: true,
  };
  const result = SubscribeHospitalParametersSchema.safeParse(validParams);
  assertTrue(result.success, '有效参数应该通过验证');

  // 空名称应该失败
  const invalidParams = {
    name: '',
  };
  const invalidResult = SubscribeHospitalParametersSchema.safeParse(invalidParams);
  assertTrue(!invalidResult.success, '空名称应该失败');
});

suite.add('SubscribeHospitalTool - 默认参数', async () => {
  const minimalParams = { name: '华山医院' };
  const result = SubscribeHospitalParametersSchema.parse(minimalParams);
  assertEqual(result.name, '华山医院');
  assertEqual(result.isPrimary, false); // 默认值
});

// ===== Handler 功能测试 =====

suite.add('SubscribeHospitalTool - Handler订阅医院', async () => {
  const service = createTempService();
  const handler = createSubscribeHospitalHandler(service);

  const result = await handler({ name: '北京协和医院', isPrimary: true });

  assertEqual(result.status, 'success');
  assertExists(result.data);
  assertEqual(result.data.primary, '北京协和医院');
  assertTrue(result.data.hospitals.some((h: any) => h.name === '北京协和医院'));
});

suite.add('SubscribeHospitalTool - Handler重复订阅', async () => {
  const service = createTempService();
  const handler = createSubscribeHospitalHandler(service);

  // 第一次订阅
  await handler({ name: '北京协和医院' });
  // 第二次订阅同一医院
  const result = await handler({ name: '北京协和医院' });

  assertEqual(result.status, 'success');
  assertTrue(result.data.isExisting);
});

suite.add('SubscribeHospitalTool - 第一个订阅自动成为主要医院', async () => {
  const service = createTempService();
  const handler = createSubscribeHospitalHandler(service);

  const result = await handler({ name: '北京协和医院' });

  assertEqual(result.status, 'success');
  assertTrue(result.data.subscription.isPrimary, '第一个订阅应该自动成为主要医院');
});

suite.add('SubscribeHospitalTool - 订阅多个医院', async () => {
  const service = createTempService();
  const handler = createSubscribeHospitalHandler(service);

  await handler({ name: '北京协和医院' });
  await handler({ name: '华山医院' });
  await handler({ name: '瑞金医院' });

  const listHandler = createListHospitalsHandler(service);
  const result = await listHandler({});

  assertEqual(result.data.hospitals.length, 3);
});

suite.add('SubscribeHospitalTool - 更新为主要医院', async () => {
  const service = createTempService();
  const handler = createSubscribeHospitalHandler(service);

  // 先订阅两家医院
  await handler({ name: '北京协和医院' });
  await handler({ name: '华山医院' });

  // 将华山医院更新为主要医院
  const result = await handler({ name: '华山医院', isPrimary: true });

  assertEqual(result.status, 'success');
  assertEqual(result.data.primary, '华山医院');
});

// ===== ListHospitals 测试 =====

suite.add('ListHospitalsTool - 工具定义完整', async () => {
  assertEqual(ListHospitalsTool.name, 'list_subscribed_hospitals');
  assertExists(ListHospitalsTool.description);
});

suite.add('ListHospitalsTool - Handler列出医院', async () => {
  const service = createTempService();
  const subscribeHandler = createSubscribeHospitalHandler(service);
  const listHandler = createListHospitalsHandler(service);

  // 先订阅几家医院
  await subscribeHandler({ name: '北京协和医院' });
  await subscribeHandler({ name: '华山医院' });

  const result = await listHandler({});

  assertEqual(result.status, 'success');
  assertEqual(result.data.hospitals.length, 2);
});

suite.add('ListHospitalsTool - Handler空列表', async () => {
  const service = createTempService();
  const handler = createListHospitalsHandler(service);

  const result = await handler({});

  assertEqual(result.status, 'success');
  assertEqual(result.data.hospitals.length, 0);
  assertExists(result.message); // 应该提示如何添加订阅
});

suite.add('ListHospitalsTool - 显示主要医院标记', async () => {
  const service = createTempService();
  const subscribeHandler = createSubscribeHospitalHandler(service);
  const listHandler = createListHospitalsHandler(service);

  await subscribeHandler({ name: '北京协和医院' });
  await subscribeHandler({ name: '华山医院' });

  const result = await listHandler({});

  assertTrue(result.message.includes('主要'), '应该显示主要医院标记');
});

// ===== Unsubscribe 测试 =====

suite.add('UnsubscribeHospitalTool - 工具定义完整', async () => {
  assertEqual(UnsubscribeHospitalTool.name, 'unsubscribe_hospital');
  assertExists(UnsubscribeHospitalTool.description);
});

suite.add('UnsubscribeHospitalTool - Handler取消订阅', async () => {
  const service = createTempService();
  const subscribeHandler = createSubscribeHospitalHandler(service);
  const unsubscribeHandler = createUnsubscribeHospitalHandler(service);

  // 先订阅
  await subscribeHandler({ name: '北京协和医院' });

  // 再取消订阅
  const result = await unsubscribeHandler({ name: '北京协和医院' });

  assertEqual(result.status, 'success');
  assertEqual(result.data.hospitals.length, 0);
});

suite.add('UnsubscribeHospitalTool - Handler取消未订阅的医院', async () => {
  const service = createTempService();
  const handler = createUnsubscribeHospitalHandler(service);

  const result = await handler({ name: '不存在的医院' });

  assertEqual(result.status, 'error');
  assertEqual(result.error.code, 'NOT_FOUND');
});

suite.add('UnsubscribeHospitalTool - 取消主要医院后自动切换', async () => {
  const service = createTempService();
  const subscribeHandler = createSubscribeHospitalHandler(service);
  const unsubscribeHandler = createUnsubscribeHospitalHandler(service);

  // 订阅两家医院
  await subscribeHandler({ name: '北京协和医院' }); // 自动成为主要
  await subscribeHandler({ name: '华山医院' });

  // 取消主要医院
  await unsubscribeHandler({ name: '北京协和医院' });

  const listHandler = createListHospitalsHandler(service);
  const result = await listHandler({});

  assertEqual(result.data.hospitals.length, 1);
  assertEqual(result.data.primary, '华山医院');
});

// ===== SetPrimary 测试 =====

suite.add('SetPrimaryHospitalTool - 工具定义完整', async () => {
  assertEqual(SetPrimaryHospitalTool.name, 'set_primary_hospital');
  assertExists(SetPrimaryHospitalTool.description);
});

suite.add('SetPrimaryHospitalTool - Handler设置主要医院', async () => {
  const service = createTempService();
  const subscribeHandler = createSubscribeHospitalHandler(service);
  const setPrimaryHandler = createSetPrimaryHospitalHandler(service);

  // 先订阅两家医院
  await subscribeHandler({ name: '北京协和医院' });
  await subscribeHandler({ name: '华山医院' });

  // 设置主要医院
  const result = await setPrimaryHandler({ name: '华山医院' });

  assertEqual(result.status, 'success');
  assertEqual(result.data.primary, '华山医院');
});

suite.add('SetPrimaryHospitalTool - Handler设置未订阅的医院为主要', async () => {
  const service = createTempService();
  const handler = createSetPrimaryHospitalHandler(service);

  const result = await handler({ name: '未订阅的医院' });

  assertEqual(result.status, 'error');
  assertEqual(result.error.code, 'NOT_SUBSCRIBED');
});

suite.add('SetPrimaryHospitalTool - 切换主要医院', async () => {
  const service = createTempService();
  const subscribeHandler = createSubscribeHospitalHandler(service);
  const setPrimaryHandler = createSetPrimaryHospitalHandler(service);

  await subscribeHandler({ name: '医院A' });
  await subscribeHandler({ name: '医院B' });
  await subscribeHandler({ name: '医院C' });

  // 设置 B 为主要
  await setPrimaryHandler({ name: '医院B' });
  // 切换到 C
  const result = await setPrimaryHandler({ name: '医院C' });

  assertEqual(result.data.primary, '医院C');
  assertTrue(result.data.hospitals.filter((h: any) => h.isPrimary).length === 1, '应该只有一个主要医院');
});

// ===== CheckStatus 测试 =====

suite.add('CheckSubscriptionStatusTool - 工具定义完整', async () => {
  assertEqual(CheckSubscriptionStatusTool.name, 'check_hospital_subscription_status');
  assertExists(CheckSubscriptionStatusTool.description);
});

suite.add('CheckSubscriptionStatusTool - Handler检查状态', async () => {
  const service = createTempService();
  const handler = createCheckSubscriptionStatusHandler(service);

  const result = await handler({});

  assertEqual(result.status, 'success');
  assertExists(result.data.isFirstTime);
  assertExists(result.data.totalHospitals);
  assertExists(result.data.needsPrompt);
});

suite.add('CheckSubscriptionStatusTool - Handler首次使用状态', async () => {
  const service = createTempService();
  const handler = createCheckSubscriptionStatusHandler(service);

  const result = await handler({});

  assertEqual(result.data.isFirstTime, true);
  assertEqual(result.data.needsPrompt, true);
  assertEqual(result.data.totalHospitals, 0);
});

suite.add('CheckSubscriptionStatusTool - 非首次使用状态', async () => {
  const service = createTempService();
  const subscribeHandler = createSubscribeHospitalHandler(service);
  const checkHandler = createCheckSubscriptionStatusHandler(service);

  await subscribeHandler({ name: '北京协和医院' });

  const result = await checkHandler({});

  assertEqual(result.data.isFirstTime, false);
  assertEqual(result.data.totalHospitals, 1);
});

// ===== 综合场景测试 =====

suite.add('综合场景 - 完整订阅流程', async () => {
  const service = createTempService();
  const subscribeHandler = createSubscribeHospitalHandler(service);
  const listHandler = createListHospitalsHandler(service);
  const setPrimaryHandler = createSetPrimaryHospitalHandler(service);
  const unsubscribeHandler = createUnsubscribeHospitalHandler(service);
  const checkHandler = createCheckSubscriptionStatusHandler(service);

  // 1. 首次检查状态
  const initialStatus = await checkHandler({});
  assertEqual(initialStatus.data.isFirstTime, true);

  // 2. 订阅第一家医院
  const sub1 = await subscribeHandler({ name: '北京协和医院' });
  assertEqual(sub1.data.subscription.isPrimary, true);

  // 3. 订阅更多医院
  await subscribeHandler({ name: '华山医院' });
  await subscribeHandler({ name: '瑞金医院' });

  // 4. 列出医院
  const list = await listHandler({});
  assertEqual(list.data.hospitals.length, 3);

  // 5. 切换主要医院
  await setPrimaryHandler({ name: '瑞金医院' });

  // 6. 再次检查状态
  const finalStatus = await checkHandler({});
  assertEqual(finalStatus.data.isFirstTime, false);
  assertEqual(finalStatus.data.primaryHospital, '瑞金医院');

  // 7. 取消订阅
  await unsubscribeHandler({ name: '华山医院' });

  // 8. 验证列表
  const finalList = await listHandler({});
  assertEqual(finalList.data.hospitals.length, 2);
});

suite.add('综合场景 - 大小写不敏感匹配', async () => {
  const service = createTempService();
  const subscribeHandler = createSubscribeHospitalHandler(service);
  const unsubscribeHandler = createUnsubscribeHospitalHandler(service);

  // 使用不同大小写订阅
  await subscribeHandler({ name: 'Beijing Xiehe Hospital' });

  // 使用不同大小写取消
  const result = await unsubscribeHandler({ name: 'beijing xiehe hospital' });

  assertEqual(result.status, 'success');
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         Hospital Subscription Tool 单元测试         ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);

  const success = await suite.run('Hospital Subscription Tool 测试套件');
  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
