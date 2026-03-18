#!/usr/bin/env tsx
/**
 * 方案 4: 自动化场景测试
 * 预定义用户交互场景，自动化执行并验证结果
 */

import * as fs from 'fs';
import * as path from 'path';
import { HospitalSubscriptionService } from '../../src/services/hospital-subscription.service';
import {
  createSubscribeHospitalHandler,
  createListHospitalsHandler,
  createUnsubscribeHospitalHandler,
  createSetPrimaryHospitalHandler,
  createCheckSubscriptionStatusHandler,
} from '../../src/tools/hospital-subscription.tool';
import chalk from 'chalk';

// 测试数据目录
const testDir = path.join(process.cwd(), 'tmp-test-scenario');
const testStoragePath = path.join(testDir, 'hospital-subscriptions.json');

interface TestStep {
  action: string;
  params: any;
  expected: {
    status: 'success' | 'error';
    conditions?: ((result: any, service: HospitalSubscriptionService) => boolean | string)[];
  };
  description?: string;
}

interface TestScenario {
  name: string;
  description: string;
  steps: TestStep[];
}

function createTestService(): HospitalSubscriptionService {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  const service = new HospitalSubscriptionService();
  // @ts-ignore
  service['storagePath'] = testStoragePath;
  // @ts-ignore
  service['data'] = { hospitals: [], lastPromptedDate: null };
  return service;
}

// 预定义测试场景
const scenarios: TestScenario[] = [
  {
    name: '新用户首次使用完整流程',
    description: '模拟首次使用用户从订阅到管理的完整流程',
    steps: [
      {
        action: 'checkStatus',
        params: {},
        expected: {
          status: 'success',
          conditions: [
            (result) => result.data.isFirstTime === true,
            (result) => result.data.needsPrompt === true,
          ],
        },
        description: '检查首次使用状态',
      },
      {
        action: 'subscribe',
        params: { name: '北京协和医院' },
        expected: {
          status: 'success',
          conditions: [
            (result) => result.data.subscription.isPrimary === true,
            (result) => result.data.hospitals.length === 1,
          ],
        },
        description: '订阅第一家医院，自动设为默认',
      },
      {
        action: 'subscribe',
        params: { name: '上海华山医院' },
        expected: {
          status: 'success',
          conditions: [
            (result) => result.data.hospitals.length === 2,
            (result) => result.data.subscription.isPrimary === false,
          ],
        },
        description: '订阅第二家医院',
      },
      {
        action: 'list',
        params: {},
        expected: {
          status: 'success',
          conditions: [
            (result) => result.data.hospitals.length === 2,
            (result) => result.data.primary === '北京协和医院',
          ],
        },
        description: '查看订阅列表',
      },
      {
        action: 'setPrimary',
        params: { name: '上海华山医院' },
        expected: {
          status: 'success',
          conditions: [
            (result) => result.data.primary === '上海华山医院',
          ],
        },
        description: '更改主要医院',
      },
    ],
  },
  {
    name: '多医院管理和切换',
    description: '测试多家医院的订阅管理和主要医院切换',
    steps: [
      {
        action: 'subscribe',
        params: { name: '医院A' },
        expected: { status: 'success' },
      },
      {
        action: 'subscribe',
        params: { name: '医院B' },
        expected: { status: 'success' },
      },
      {
        action: 'subscribe',
        params: { name: '医院C' },
        expected: { status: 'success' },
      },
      {
        action: 'subscribe',
        params: { name: '医院D' },
        expected: { status: 'success' },
      },
      {
        action: 'setPrimary',
        params: { name: '医院B' },
        expected: {
          status: 'success',
          conditions: [
            (result, service) => service.getPrimaryHospital()?.name === '医院B',
          ],
        },
      },
      {
        action: 'unsubscribe',
        params: { name: '医院B' },
        expected: {
          status: 'success',
          conditions: [
            (result, service) => service.getPrimaryHospital()?.name !== '医院B',
            (result, service) => service.getHospitals().length === 3,
          ],
        },
      },
      {
        action: 'list',
        params: {},
        expected: {
          status: 'success',
          conditions: [
            (result) => result.data.hospitals.length === 3,
          ],
        },
      },
    ],
  },
  {
    name: '错误处理和边界情况',
    description: '测试各种错误情况和边界条件',
    steps: [
      {
        action: 'subscribe',
        params: { name: '' },
        expected: { status: 'error' },
        description: '空医院名称应该报错',
      },
      {
        action: 'unsubscribe',
        params: { name: '不存在的医院' },
        expected: { status: 'error' },
        description: '取消不存在的订阅应该报错',
      },
      {
        action: 'setPrimary',
        params: { name: '未订阅的医院' },
        expected: { status: 'error' },
        description: '设置未订阅的医院为主要应该报错',
      },
      {
        action: 'subscribe',
        params: { name: '有效医院' },
        expected: { status: 'success' },
      },
      {
        action: 'subscribe',
        params: { name: '有效医院' },
        expected: { status: 'success' },
        description: '重复订阅应该成功（更新）',
      },
    ],
  },
  {
    name: '每日提示逻辑测试',
    description: '测试每日提示功能的触发逻辑',
    steps: [
      {
        action: 'checkStatus',
        params: {},
        expected: {
          status: 'success',
          conditions: [
            (result) => result.data.hasPromptedToday === false,
          ],
        },
      },
      {
        action: 'custom',
        params: { type: 'updatePromptDate' },
        expected: { status: 'success' },
      },
      {
        action: 'checkStatus',
        params: {},
        expected: {
          status: 'success',
          conditions: [
            (result) => result.data.hasPromptedToday === true,
            (result) => result.data.needsPrompt === false,
          ],
        },
      },
    ],
  },
];

class ScenarioRunner {
  private service: HospitalSubscriptionService;
  private handlers: any;
  private results: { scenario: string; passed: number; failed: number; errors: string[] }[] = [];

  constructor() {
    this.service = createTestService();
    this.handlers = {
      subscribe: createSubscribeHospitalHandler(this.service),
      unsubscribe: createUnsubscribeHospitalHandler(this.service),
      list: createListHospitalsHandler(this.service),
      setPrimary: createSetPrimaryHospitalHandler(this.service),
      checkStatus: createCheckSubscriptionStatusHandler(this.service),
      custom: async (params: any) => {
        if (params.type === 'updatePromptDate') {
          this.service.updateLastPromptedDate();
          return { status: 'success' };
        }
        return { status: 'error', error: { message: 'Unknown custom action' } };
      },
    };
  }

  async runStep(step: TestStep, stepIndex: number): Promise<{ passed: boolean; error?: string }> {
    try {
      const handler = this.handlers[step.action];
      if (!handler) {
        return { passed: false, error: `未知的 action: ${step.action}` };
      }

      const result = await handler(step.params);

      // 检查状态
      if (result.status !== step.expected.status) {
        return {
          passed: false,
          error: `状态不匹配: 期望 ${step.expected.status}, 实际 ${result.status}`,
        };
      }

      // 检查额外条件
      if (step.expected.conditions) {
        for (let i = 0; i < step.expected.conditions.length; i++) {
          const condition = step.expected.conditions[i];
          const conditionResult = condition(result, this.service);
          if (conditionResult !== true) {
            return {
              passed: false,
              error: `条件 ${i + 1} 不满足: ${typeof conditionResult === 'string' ? conditionResult : '验证失败'}`,
            };
          }
        }
      }

      return { passed: true };
    } catch (error: any) {
      return { passed: false, error: error.message };
    }
  }

  async runScenario(scenario: TestScenario): Promise<void> {
    console.log(chalk.cyan(`\n📋 场景: ${scenario.name}`));
    console.log(chalk.gray(`   ${scenario.description}`));
    console.log();

    // 重置服务状态
    // @ts-ignore
    this.service['data'] = { hospitals: [], lastPromptedDate: null };

    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      const stepNum = i + 1;

      process.stdout.write(`  步骤 ${stepNum}/${scenario.steps.length}: ${step.description || step.action} ... `);

      const result = await this.runStep(step, i);

      if (result.passed) {
        console.log(chalk.green('✓'));
        passed++;
      } else {
        console.log(chalk.red('✗'));
        console.log(chalk.red(`    错误: ${result.error}`));
        errors.push(`步骤 ${stepNum}: ${result.error}`);
        failed++;
      }
    }

    this.results.push({ scenario: scenario.name, passed, failed, errors });

    console.log();
    console.log(`  结果: ${chalk.green(`${passed} 通过`)} | ${chalk.red(`${failed} 失败`)}`);
  }

  async runAll(): Promise<void> {
    console.log(chalk.cyan.bold('╔════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║') + chalk.white.bold('      🎬 自动化场景测试运行器                           ') + chalk.cyan.bold('║'));
    console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════╝'));
    console.log();

    for (const scenario of scenarios) {
      await this.runScenario(scenario);
    }

    this.printSummary();
  }

  printSummary(): void {
    console.log(chalk.cyan('\n══════════════════════════════════════════════════════════'));
    console.log(chalk.white.bold('                      测试总结'));
    console.log(chalk.cyan('══════════════════════════════════════════════════════════\n'));

    let totalPassed = 0;
    let totalFailed = 0;

    for (const result of this.results) {
      const status = result.failed === 0 ? chalk.green('✓ 通过') : chalk.red('✗ 失败');
      console.log(`  ${status} ${result.scenario}`);
      console.log(`     通过: ${chalk.green(result.passed)} | 失败: ${chalk.red(result.failed)}`);
      if (result.errors.length > 0) {
        result.errors.forEach((err) => console.log(chalk.red(`     • ${err}`)));
      }
      console.log();

      totalPassed += result.passed;
      totalFailed += result.failed;
    }

    console.log(chalk.cyan('──────────────────────────────────────────────────────────'));
    console.log(chalk.white.bold(`  总计: ${chalk.green(totalPassed + ' 通过')} | ${chalk.red(totalFailed + ' 失败')}`));
    console.log(chalk.cyan('══════════════════════════════════════════════════════════\n'));

    // 退出码
    process.exit(totalFailed > 0 ? 1 : 0);
  }
}

// 如果直接运行
if (require.main === module) {
  const runner = new ScenarioRunner();
  runner.runAll().catch((err) => {
    console.error(chalk.red('运行错误:'), err);
    process.exit(1);
  });
}

export { ScenarioRunner, scenarios };
