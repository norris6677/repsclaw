#!/usr/bin/env tsx
/**
 * Doctor Subscription Tool 单元测试
 * 测试医生订阅工具的所有功能
 */

import {
  SubscribeDoctorTool,
  SubscribeDoctorParametersSchema,
  createSubscribeDoctorHandler,
  SUBSCRIBE_DOCTOR_TOOL_NAME,
  ListDoctorsTool,
  ListDoctorsParametersSchema,
  createListDoctorsHandler,
  LIST_DOCTORS_TOOL_NAME,
  UnsubscribeDoctorTool,
  UnsubscribeDoctorParametersSchema,
  createUnsubscribeDoctorHandler,
  UNSUBSCRIBE_DOCTOR_TOOL_NAME,
  SetPrimaryDoctorTool,
  SetPrimaryDoctorParametersSchema,
  createSetPrimaryDoctorHandler,
  SET_PRIMARY_DOCTOR_TOOL_NAME,
  CheckDoctorSubscriptionStatusTool,
  createCheckDoctorSubscriptionStatusHandler,
  CHECK_DOCTOR_SUBSCRIPTION_STATUS_TOOL_NAME,
} from '../../../src/tools/doctor-subscription.tool';
import { TestSuite, assertEqual, assertTrue, assertExists, c, assertFalse } from '../test-utils';

const suite = new TestSuite();

// 模拟的医院订阅服务（医生订阅依赖此服务）
class MockHospitalSubscriptionService {
  private hospitals: any[] = [];

  getHospitals() {
    return [...this.hospitals];
  }

  isSubscribed(name: string): boolean {
    return this.hospitals.some((h: any) => h.name.toLowerCase() === name.toLowerCase());
  }

  resolveHospitalName(input: string): { name: string; isAlias: boolean } | null {
    // 支持别名解析："协和" -> "北京协和医院"
    const aliasMap: Record<string, string> = {
      '协和': '北京协和医院',
      '华山': '复旦大学附属华山医院',
      '华西': '四川大学华西医院',
    };

    const exactMatch = this.hospitals.find((h: any) => h.name.toLowerCase() === input.toLowerCase());
    if (exactMatch) {
      return { name: exactMatch.name, isAlias: false };
    }

    // 检查别名
    for (const [alias, fullName] of Object.entries(aliasMap)) {
      if (input.includes(alias)) {
        // 确保医院已订阅
        const subscribed = this.hospitals.find((h: any) => h.name === fullName);
        if (subscribed) {
          return { name: fullName, isAlias: true };
        }
      }
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
}

// 模拟的医生订阅服务
class MockDoctorSubscriptionService {
  private doctors: any[] = [];
  private hospitalService: MockHospitalSubscriptionService;

  constructor(hospitalService: MockHospitalSubscriptionService) {
    this.hospitalService = hospitalService;
  }

  getDoctors() {
    return [...this.doctors];
  }

  getDoctorsByHospital(hospital: string) {
    return this.doctors.filter((d: any) => d.hospital.toLowerCase() === hospital.toLowerCase());
  }

  getPrimaryDoctor() {
    return this.doctors.find((d: any) => d.isPrimary) || this.doctors[0] || null;
  }

  isSubscribed(hospital: string, name: string): boolean {
    return this.doctors.some(
      (d: any) => d.hospital.toLowerCase() === hospital.toLowerCase() &&
                  d.name.toLowerCase() === name.toLowerCase()
    );
  }

  findDoctor(hospital: string, name: string): any | null {
    return this.doctors.find(
      (d: any) => d.hospital.toLowerCase() === hospital.toLowerCase() &&
                  d.name.toLowerCase() === name.toLowerCase()
    ) || null;
  }

  subscribe(hospital: string, name: string, department?: string, isPrimary: boolean = false) {
    // 验证医院是否已订阅
    const resolved = this.hospitalService.resolveHospitalName(hospital);
    if (!resolved || !this.hospitalService.isSubscribed(resolved.name)) {
      return {
        success: false,
        error: `医院 "${hospital}" 未订阅。请先使用 subscribe_hospital 订阅该医院。`,
      };
    }

    const resolvedHospital = resolved.name;

    // 检查是否已存在
    const existingIndex = this.doctors.findIndex(
      (d: any) => d.hospital.toLowerCase() === resolvedHospital.toLowerCase() &&
                  d.name.toLowerCase() === name.toLowerCase()
    );

    if (existingIndex >= 0) {
      const existing = this.doctors[existingIndex];
      if (department) {
        existing.department = department;
      }
      if (isPrimary) {
        this.doctors.forEach((d: any) => d.isPrimary = false);
        existing.isPrimary = true;
      }
      return { success: true, subscription: existing, isExisting: true };
    }

    if (this.doctors.length === 0) {
      isPrimary = true;
    }

    if (isPrimary) {
      this.doctors.forEach((d: any) => d.isPrimary = false);
    }

    const subscription = {
      name: name.trim(),
      hospital: resolvedHospital,
      department: department?.trim(),
      subscribedAt: new Date().toISOString(),
      isPrimary,
    };

    this.doctors.push(subscription);
    return { success: true, subscription, isExisting: false };
  }

  unsubscribe(hospital: string, name: string) {
    const index = this.doctors.findIndex(
      (d: any) => d.hospital.toLowerCase() === hospital.toLowerCase() &&
                  d.name.toLowerCase() === name.toLowerCase()
    );

    if (index >= 0) {
      const wasPrimary = this.doctors[index].isPrimary;
      this.doctors.splice(index, 1);
      if (wasPrimary && this.doctors.length > 0) {
        this.doctors[0].isPrimary = true;
      }
      return { success: true };
    }

    return { success: false, error: `未找到医生 "${name}"（${hospital}）的订阅` };
  }

  setPrimary(hospital: string, name: string) {
    const doctor = this.doctors.find(
      (d: any) => d.hospital.toLowerCase() === hospital.toLowerCase() &&
                  d.name.toLowerCase() === name.toLowerCase()
    );

    if (doctor) {
      this.doctors.forEach((d: any) => d.isPrimary = false);
      doctor.isPrimary = true;
      return { success: true };
    }

    return { success: false, error: `未找到医生 "${name}"（${hospital}）的订阅` };
  }

  isFirstTime(): boolean {
    return this.doctors.length === 0;
  }

  getStats() {
    const primary = this.getPrimaryDoctor();
    const byHospital: Record<string, number> = {};

    for (const doctor of this.doctors) {
      byHospital[doctor.hospital] = (byHospital[doctor.hospital] || 0) + 1;
    }

    return {
      total: this.doctors.length,
      primary: primary ? { name: primary.name, hospital: primary.hospital } : null,
      byHospital,
    };
  }

  clearAll(): void {
    this.doctors = [];
  }
}

// 创建内存中的service实例
function createTempServices() {
  const hospitalService = new MockHospitalSubscriptionService();
  const doctorService = new MockDoctorSubscriptionService(hospitalService);
  return { hospitalService, doctorService };
}

// ===== 工具定义测试 =====

suite.add('SubscribeDoctorTool - 工具定义完整', async () => {
  assertEqual(SubscribeDoctorTool.name, 'subscribe_doctor');
  assertExists(SubscribeDoctorTool.description);
  assertExists(SubscribeDoctorTool.parameters);
});

suite.add('SubscribeDoctorTool - 参数Schema验证', async () => {
  // 有效参数
  const validParams = {
    hospitalName: '北京协和医院',
    doctorName: '张医生',
    department: '心内科',
    isPrimary: true,
  };
  const result = SubscribeDoctorParametersSchema.safeParse(validParams);
  assertTrue(result.success, '有效参数应该通过验证');

  // 空医院名应该失败
  const invalidParams = {
    hospitalName: '',
    doctorName: '张医生',
  };
  const invalidResult = SubscribeDoctorParametersSchema.safeParse(invalidParams);
  assertTrue(!invalidResult.success, '空医院名应该失败');

  // 空医生名应该失败
  const invalidParams2 = {
    hospitalName: '北京协和医院',
    doctorName: '',
  };
  const invalidResult2 = SubscribeDoctorParametersSchema.safeParse(invalidParams2);
  assertTrue(!invalidResult2.success, '空医生名应该失败');
});

suite.add('SubscribeDoctorTool - 默认参数', async () => {
  const minimalParams = { hospitalName: '北京协和医院', doctorName: '张医生' };
  const result = SubscribeDoctorParametersSchema.parse(minimalParams);
  assertEqual(result.hospitalName, '北京协和医院');
  assertEqual(result.doctorName, '张医生');
  assertEqual(result.isPrimary, false); // 默认值
  assertEqual(result.department, undefined); // 可选字段
});

// ===== Handler 功能测试 =====

suite.add('SubscribeDoctorTool - Handler订阅医生（医院未订阅）', async () => {
  const { doctorService } = createTempServices();
  const handler = createSubscribeDoctorHandler(doctorService);

  // 直接订阅医生，但医院未订阅
  const result = await handler({ hospitalName: '北京协和医院', doctorName: '张医生' });

  assertEqual(result.status, 'error');
  assertEqual(result.error.code, 'SUBSCRIBE_ERROR');
  assertTrue(result.error.message.includes('未订阅'));
});

suite.add('SubscribeDoctorTool - Handler订阅医生（医院已订阅）', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const handler = createSubscribeDoctorHandler(doctorService);

  // 先订阅医院
  hospitalService.subscribe('北京协和医院');

  // 再订阅医生
  const result = await handler({ hospitalName: '北京协和医院', doctorName: '张医生', isPrimary: true });

  assertEqual(result.status, 'success');
  assertExists(result.data);
  assertEqual(result.data.subscription.hospital, '北京协和医院');
  assertEqual(result.data.subscription.name, '张医生');
});

suite.add('SubscribeDoctorTool - Handler使用别名订阅医生', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const handler = createSubscribeDoctorHandler(doctorService);

  // 先订阅医院（使用完整名称）
  hospitalService.subscribe('北京协和医院');

  // 使用别名订阅医生
  const result = await handler({ hospitalName: '协和', doctorName: '张医生' });

  assertEqual(result.status, 'success');
  assertEqual(result.data.subscription.hospital, '北京协和医院');
});

suite.add('SubscribeDoctorTool - Handler重复订阅', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const handler = createSubscribeDoctorHandler(doctorService);

  // 先订阅医院
  hospitalService.subscribe('北京协和医院');

  // 第一次订阅医生
  await handler({ hospitalName: '北京协和医院', doctorName: '张医生' });
  // 第二次订阅同一医生
  const result = await handler({ hospitalName: '北京协和医院', doctorName: '张医生' });

  assertEqual(result.status, 'success');
  assertTrue(result.data.isExisting);
});

suite.add('SubscribeDoctorTool - 第一个订阅自动成为主要医生', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const handler = createSubscribeDoctorHandler(doctorService);

  // 先订阅医院
  hospitalService.subscribe('北京协和医院');

  // 订阅第一个医生
  const result = await handler({ hospitalName: '北京协和医院', doctorName: '张医生' });

  assertEqual(result.status, 'success');
  assertTrue(result.data.subscription.isPrimary, '第一个订阅应该自动成为主要医生');
});

suite.add('SubscribeDoctorTool - 订阅多个医生', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const subscribeHandler = createSubscribeDoctorHandler(doctorService);
  const listHandler = createListDoctorsHandler(doctorService);

  // 先订阅医院
  hospitalService.subscribe('北京协和医院');

  // 订阅多个医生
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '张医生' });
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '李医生' });
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '王医生' });

  const result = await listHandler({});

  assertEqual(result.data.doctors.length, 3);
});

suite.add('SubscribeDoctorTool - 更新为主要医生', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const handler = createSubscribeDoctorHandler(doctorService);

  // 先订阅医院
  hospitalService.subscribe('北京协和医院');

  // 先订阅两家医生
  await handler({ hospitalName: '北京协和医院', doctorName: '张医生' });
  await handler({ hospitalName: '北京协和医院', doctorName: '李医生' });

  // 将李医生更新为主要医生
  const result = await handler({ hospitalName: '北京协和医院', doctorName: '李医生', isPrimary: true });

  assertEqual(result.status, 'success');
  assertEqual(result.data.primary?.name, '李医生');
});

suite.add('SubscribeDoctorTool - 带科室信息订阅', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const handler = createSubscribeDoctorHandler(doctorService);

  // 先订阅医院
  hospitalService.subscribe('北京协和医院');

  // 订阅带科室信息的医生
  const result = await handler({
    hospitalName: '北京协和医院',
    doctorName: '张医生',
    department: '心内科',
  });

  assertEqual(result.status, 'success');
  assertEqual(result.data.subscription.department, '心内科');
});

// ===== ListDoctors 测试 =====

suite.add('ListDoctorsTool - 工具定义完整', async () => {
  assertEqual(ListDoctorsTool.name, 'list_subscribed_doctors');
  assertExists(ListDoctorsTool.description);
});

suite.add('ListDoctorsTool - Handler列出所有医生', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const subscribeHandler = createSubscribeDoctorHandler(doctorService);
  const listHandler = createListDoctorsHandler(doctorService);

  // 先订阅医院
  hospitalService.subscribe('北京协和医院');

  // 订阅几位医生
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '张医生' });
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '李医生' });

  const result = await listHandler({});

  assertEqual(result.status, 'success');
  assertEqual(result.data.doctors.length, 2);
});

suite.add('ListDoctorsTool - Handler按医院筛选', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const subscribeHandler = createSubscribeDoctorHandler(doctorService);
  const listHandler = createListDoctorsHandler(doctorService);

  // 订阅两家医院
  hospitalService.subscribe('北京协和医院');
  hospitalService.subscribe('复旦大学附属华山医院');

  // 订阅医生
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '张医生' });
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '李医生' });
  await subscribeHandler({ hospitalName: '复旦大学附属华山医院', doctorName: '王医生' });

  // 按医院筛选
  const result = await listHandler({ hospitalName: '协和' });

  assertEqual(result.status, 'success');
  assertEqual(result.data.doctors.length, 2);
  assertEqual(result.data.filteredBy, '协和');
});

suite.add('ListDoctorsTool - Handler空列表', async () => {
  const { doctorService } = createTempServices();
  const handler = createListDoctorsHandler(doctorService);

  const result = await handler({});

  assertEqual(result.status, 'success');
  assertEqual(result.data.doctors.length, 0);
  assertExists(result.message); // 应该提示如何添加订阅
});

suite.add('ListDoctorsTool - 显示主要医生标记', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const subscribeHandler = createSubscribeDoctorHandler(doctorService);
  const listHandler = createListDoctorsHandler(doctorService);

  // 先订阅医院
  hospitalService.subscribe('北京协和医院');

  // 订阅两位医生
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '张医生' });
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '李医生' });

  const result = await listHandler({});

  assertTrue(result.message.includes('⭐') || result.message.includes('主要'), '应该显示主要医生标记');
});

suite.add('ListDoctorsTool - 显示科室信息', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const subscribeHandler = createSubscribeDoctorHandler(doctorService);
  const listHandler = createListDoctorsHandler(doctorService);

  // 先订阅医院
  hospitalService.subscribe('北京协和医院');

  // 订阅带科室的医生
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '张医生', department: '心内科' });

  const result = await listHandler({});

  assertTrue(result.message.includes('心内科'), '应该显示科室信息');
});

// ===== Unsubscribe 测试 =====

suite.add('UnsubscribeDoctorTool - 工具定义完整', async () => {
  assertEqual(UnsubscribeDoctorTool.name, 'unsubscribe_doctor');
  assertExists(UnsubscribeDoctorTool.description);
});

suite.add('UnsubscribeDoctorTool - Handler取消订阅', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const subscribeHandler = createSubscribeDoctorHandler(doctorService);
  const unsubscribeHandler = createUnsubscribeDoctorHandler(doctorService);

  // 先订阅医院和医生
  hospitalService.subscribe('北京协和医院');
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '张医生' });

  // 取消订阅
  const result = await unsubscribeHandler({ hospitalName: '北京协和医院', doctorName: '张医生' });

  assertEqual(result.status, 'success');
  assertEqual(result.data.doctors.length, 0);
});

suite.add('UnsubscribeDoctorTool - Handler取消未订阅的医生', async () => {
  const { doctorService } = createTempServices();
  const handler = createUnsubscribeDoctorHandler(doctorService);

  const result = await handler({ hospitalName: '北京协和医院', doctorName: '不存在的医生' });

  assertEqual(result.status, 'error');
  assertEqual(result.error.code, 'NOT_FOUND');
});

suite.add('UnsubscribeDoctorTool - 取消主要医生后自动切换', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const subscribeHandler = createSubscribeDoctorHandler(doctorService);
  const unsubscribeHandler = createUnsubscribeDoctorHandler(doctorService);

  // 先订阅医院
  hospitalService.subscribe('北京协和医院');

  // 订阅两位医生
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '张医生' }); // 自动成为主要
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '李医生' });

  // 取消主要医生
  await unsubscribeHandler({ hospitalName: '北京协和医院', doctorName: '张医生' });

  const listHandler = createListDoctorsHandler(doctorService);
  const result = await listHandler({});

  assertEqual(result.data.doctors.length, 1);
  assertEqual(result.data.primary?.name, '李医生');
});

// ===== SetPrimary 测试 =====

suite.add('SetPrimaryDoctorTool - 工具定义完整', async () => {
  assertEqual(SetPrimaryDoctorTool.name, 'set_primary_doctor');
  assertExists(SetPrimaryDoctorTool.description);
});

suite.add('SetPrimaryDoctorTool - Handler设置主要医生', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const subscribeHandler = createSubscribeDoctorHandler(doctorService);
  const setPrimaryHandler = createSetPrimaryDoctorHandler(doctorService);

  // 先订阅医院
  hospitalService.subscribe('北京协和医院');

  // 订阅两位医生
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '张医生' });
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '李医生' });

  // 设置主要医生
  const result = await setPrimaryHandler({ hospitalName: '北京协和医院', doctorName: '李医生' });

  assertEqual(result.status, 'success');
  assertEqual(result.data.primary?.name, '李医生');
});

suite.add('SetPrimaryDoctorTool - Handler设置未订阅的医生为主要', async () => {
  const { doctorService } = createTempServices();
  const handler = createSetPrimaryDoctorHandler(doctorService);

  const result = await handler({ hospitalName: '北京协和医院', doctorName: '未订阅的医生' });

  assertEqual(result.status, 'error');
  assertEqual(result.error.code, 'NOT_SUBSCRIBED');
});

suite.add('SetPrimaryDoctorTool - 切换主要医生', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const subscribeHandler = createSubscribeDoctorHandler(doctorService);
  const setPrimaryHandler = createSetPrimaryDoctorHandler(doctorService);

  // 先订阅医院
  hospitalService.subscribe('北京协和医院');

  // 订阅三位医生
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '医生A' });
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '医生B' });
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '医生C' });

  // 设置 B 为主要
  await setPrimaryHandler({ hospitalName: '北京协和医院', doctorName: '医生B' });
  // 切换到 C
  const result = await setPrimaryHandler({ hospitalName: '北京协和医院', doctorName: '医生C' });

  assertEqual(result.data.primary?.name, '医生C');
  assertTrue(result.data.doctors.filter((d: any) => d.isPrimary).length === 1, '应该只有一个主要医生');
});

// ===== CheckStatus 测试 =====

suite.add('CheckDoctorSubscriptionStatusTool - 工具定义完整', async () => {
  assertEqual(CheckDoctorSubscriptionStatusTool.name, 'check_doctor_subscription_status');
  assertExists(CheckDoctorSubscriptionStatusTool.description);
});

suite.add('CheckDoctorSubscriptionStatusTool - Handler检查状态', async () => {
  const { doctorService } = createTempServices();
  const handler = createCheckDoctorSubscriptionStatusHandler(doctorService);

  const result = await handler({});

  assertEqual(result.status, 'success');
  assertExists(result.data.isFirstTime);
  assertExists(result.data.totalDoctors);
  assertExists(result.data.byHospital);
});

suite.add('CheckDoctorSubscriptionStatusTool - Handler首次使用状态', async () => {
  const { doctorService } = createTempServices();
  const handler = createCheckDoctorSubscriptionStatusHandler(doctorService);

  const result = await handler({});

  assertEqual(result.data.isFirstTime, true);
  assertEqual(result.data.totalDoctors, 0);
  assertEqual(result.data.primaryDoctor, null);
});

suite.add('CheckDoctorSubscriptionStatusTool - 非首次使用状态', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const subscribeHandler = createSubscribeDoctorHandler(doctorService);
  const checkHandler = createCheckDoctorSubscriptionStatusHandler(doctorService);

  // 先订阅医院和医生
  hospitalService.subscribe('北京协和医院');
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '张医生' });

  const result = await checkHandler({});

  assertEqual(result.data.isFirstTime, false);
  assertEqual(result.data.totalDoctors, 1);
});

suite.add('CheckDoctorSubscriptionStatusTool - 按医院统计', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const subscribeHandler = createSubscribeDoctorHandler(doctorService);
  const checkHandler = createCheckDoctorSubscriptionStatusHandler(doctorService);

  // 订阅两家医院
  hospitalService.subscribe('北京协和医院');
  hospitalService.subscribe('复旦大学附属华山医院');

  // 订阅医生
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '张医生' });
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '李医生' });
  await subscribeHandler({ hospitalName: '复旦大学附属华山医院', doctorName: '王医生' });

  const result = await checkHandler({});

  assertEqual(result.data.totalDoctors, 3);
  assertEqual(result.data.byHospital['北京协和医院'], 2);
  assertEqual(result.data.byHospital['复旦大学附属华山医院'], 1);
});

// ===== 综合场景测试 =====

suite.add('综合场景 - 完整订阅流程', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const subscribeHandler = createSubscribeDoctorHandler(doctorService);
  const listHandler = createListDoctorsHandler(doctorService);
  const setPrimaryHandler = createSetPrimaryDoctorHandler(doctorService);
  const unsubscribeHandler = createUnsubscribeDoctorHandler(doctorService);
  const checkHandler = createCheckDoctorSubscriptionStatusHandler(doctorService);

  // 1. 首次检查状态
  const initialStatus = await checkHandler({});
  assertEqual(initialStatus.data.isFirstTime, true);

  // 2. 先订阅医院
  hospitalService.subscribe('北京协和医院');

  // 3. 订阅第一位医生
  const sub1 = await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '张医生', department: '心内科' });
  assertEqual(sub1.data.subscription.isPrimary, true);

  // 4. 订阅更多医生
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '李医生', department: '神经内科' });
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '王医生', department: '骨科' });

  // 5. 列出医生
  const list = await listHandler({});
  assertEqual(list.data.doctors.length, 3);

  // 6. 切换主要医生
  await setPrimaryHandler({ hospitalName: '北京协和医院', doctorName: '李医生' });

  // 7. 再次检查状态
  const finalStatus = await checkHandler({});
  assertEqual(finalStatus.data.isFirstTime, false);
  assertEqual(finalStatus.data.primaryDoctor?.name, '李医生');

  // 8. 取消订阅
  await unsubscribeHandler({ hospitalName: '北京协和医院', doctorName: '王医生' });

  // 9. 验证列表
  const finalList = await listHandler({});
  assertEqual(finalList.data.doctors.length, 2);
});

suite.add('综合场景 - 多医院医生订阅', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const subscribeHandler = createSubscribeDoctorHandler(doctorService);
  const listHandler = createListDoctorsHandler(doctorService);

  // 订阅两家医院
  hospitalService.subscribe('北京协和医院');
  hospitalService.subscribe('复旦大学附属华山医院');

  // 在不同医院订阅医生
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '张医生' });
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: '李医生' });
  await subscribeHandler({ hospitalName: '复旦大学附属华山医院', doctorName: '王医生' });
  await subscribeHandler({ hospitalName: '复旦大学附属华山医院', doctorName: '赵医生' });

  // 列出所有医生
  const allDoctors = await listHandler({});
  assertEqual(allDoctors.data.doctors.length, 4);

  // 按医院筛选
  const xieheDoctors = await listHandler({ hospitalName: '协和' });
  assertEqual(xieheDoctors.data.doctors.length, 2);

  const huashanDoctors = await listHandler({ hospitalName: '华山' });
  assertEqual(huashanDoctors.data.doctors.length, 2);
});

suite.add('综合场景 - 大小写不敏感匹配', async () => {
  const { hospitalService, doctorService } = createTempServices();
  const subscribeHandler = createSubscribeDoctorHandler(doctorService);
  const unsubscribeHandler = createUnsubscribeDoctorHandler(doctorService);

  // 先订阅医院
  hospitalService.subscribe('北京协和医院');

  // 使用不同大小写订阅医生
  await subscribeHandler({ hospitalName: '北京协和医院', doctorName: 'ZHANG Doctor' });

  // 使用不同大小写取消（医院名和医生名都使用不同大小写）
  const result = await unsubscribeHandler({ hospitalName: 'beijing xiehe hospital', doctorName: 'zhang doctor' });

  // 注意：mock service 不支持拼音匹配，只支持大小写不敏感匹配
  // 实际测试应该使用相同的中文名称，只是大小写不同
  // 这里我们期望失败，因为 hospitalName 使用了拼音而不是中文
  // 但为了测试大小写不敏感，我们使用正确的中文名再测试一次
  const result2 = await unsubscribeHandler({ hospitalName: '北京协和医院', doctorName: 'zhang doctor' });
  assertEqual(result2.status, 'success');
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}          Doctor Subscription Tool 单元测试          ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);

  const success = await suite.run('Doctor Subscription Tool 测试套件');
  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
