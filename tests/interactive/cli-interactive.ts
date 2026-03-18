#!/usr/bin/env tsx
/**
 * 方案 1: CLI 交互式测试
 * 命令行界面模拟用户与医院订阅功能的交互
 */

import * as readline from 'readline';
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
const testDir = path.join(process.cwd(), 'tmp-test-interactive');
const testStoragePath = path.join(testDir, 'hospital-subscriptions.json');

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

const service = createTestService();
const subscribeHandler = createSubscribeHospitalHandler(service);
const listHandler = createListHospitalsHandler(service);
const unsubscribeHandler = createUnsubscribeHospitalHandler(service);
const setPrimaryHandler = createSetPrimaryHospitalHandler(service);
const checkStatusHandler = createCheckSubscriptionStatusHandler(service);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function printBanner() {
  console.clear();
  console.log(chalk.cyan('╔════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.bold.white('     🏥 医院订阅功能 - CLI 交互式测试工具              ') + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.gray('     模拟 OpenClaw 插件交互，无需实际部署              ') + chalk.cyan('║'));
  console.log(chalk.cyan('╚════════════════════════════════════════════════════════╝'));
  console.log();
}

function printMenu() {
  console.log(chalk.yellow('可用命令:'));
  console.log('  ' + chalk.green('1.') + ' 订阅医院        ' + chalk.green('subscribe <医院名称> [--primary]'));
  console.log('  ' + chalk.green('2.') + ' 查看订阅列表    ' + chalk.green('list'));
  console.log('  ' + chalk.green('3.') + ' 取消订阅        ' + chalk.green('unsubscribe <医院名称>'));
  console.log('  ' + chalk.green('4.') + ' 设置主要医院    ' + chalk.green('set-primary <医院名称>'));
  console.log('  ' + chalk.green('5.') + ' 检查状态        ' + chalk.green('status'));
  console.log('  ' + chalk.green('6.') + ' 清空数据        ' + chalk.green('clear'));
  console.log('  ' + chalk.green('7.') + ' 运行场景测试    ' + chalk.green('scenario <1|2|3>'));
  console.log('  ' + chalk.green('0.') + ' 退出            ' + chalk.green('exit'));
  console.log();
}

async function handleCommand(input: string): Promise<boolean> {
  const parts = input.trim().split(' ');
  const command = parts[0].toLowerCase();

  try {
    switch (command) {
      case '1':
      case 'subscribe': {
        const name = parts[1];
        const isPrimary = parts.includes('--primary') || parts.includes('-p');
        if (!name) {
          console.log(chalk.red('❌ 请提供医院名称，例如: subscribe 北京协和医院'));
          return true;
        }
        const result = await subscribeHandler({ name, isPrimary });
        if (result.status === 'success') {
          console.log(chalk.green('✅ ' + result.message));
          console.log(chalk.gray(`   当前订阅: ${result.data.hospitals.length} 家医院`));
          if (result.data.primary) {
            console.log(chalk.gray(`   主要医院: ${result.data.primary}`));
          }
        } else {
          console.log(chalk.red('❌ ' + result.error?.message));
        }
        break;
      }

      case '2':
      case 'list': {
        const result = await listHandler({});
        if (result.status === 'success') {
          console.log(chalk.blue('📋 ' + result.message));
          if (result.data.hospitals.length > 0) {
            console.log(chalk.yellow('\n   医院列表:'));
            result.data.hospitals.forEach((h: any, i: number) => {
              const primary = h.isPrimary ? chalk.yellow(' [★ 主要]') : '';
              console.log(`   ${i + 1}. ${h.name}${primary}`);
              console.log(`      订阅时间: ${new Date(h.subscribedAt).toLocaleString()}`);
            });
          }
        }
        break;
      }

      case '3':
      case 'unsubscribe': {
        const name = parts[1];
        if (!name) {
          console.log(chalk.red('❌ 请提供医院名称'));
          return true;
        }
        const result = await unsubscribeHandler({ name });
        if (result.status === 'success') {
          console.log(chalk.green('✅ ' + result.message));
        } else {
          console.log(chalk.red('❌ ' + result.error?.message));
        }
        break;
      }

      case '4':
      case 'set-primary': {
        const name = parts[1];
        if (!name) {
          console.log(chalk.red('❌ 请提供医院名称'));
          return true;
        }
        const result = await setPrimaryHandler({ name });
        if (result.status === 'success') {
          console.log(chalk.green('✅ ' + result.message));
        } else {
          console.log(chalk.red('❌ ' + result.error?.message));
        }
        break;
      }

      case '5':
      case 'status': {
        const result = await checkStatusHandler({});
        if (result.status === 'success') {
          console.log(chalk.blue('📊 订阅状态:'));
          console.log(`   首次使用: ${result.data.isFirstTime ? '是' : '否'}`);
          console.log(`   今日已提示: ${result.data.hasPromptedToday ? '是' : '否'}`);
          console.log(`   订阅医院数: ${result.data.totalHospitals}`);
          console.log(`   主要医院: ${result.data.primaryHospital || '无'}`);
          console.log(`   需要提示: ${result.data.needsPrompt ? '是' : '否'}`);
        }
        break;
      }

      case '6':
      case 'clear': {
        // @ts-ignore
        service['data'] = { hospitals: [], lastPromptedDate: null };
        // @ts-ignore
        service['saveData']();
        console.log(chalk.green('✅ 已清空所有订阅数据'));
        break;
      }

      case '7':
      case 'scenario': {
        const scenarioNum = parts[1] || '1';
        await runScenario(scenarioNum);
        break;
      }

      case '0':
      case 'exit':
      case 'quit':
        console.log(chalk.yellow('👋 再见!'));
        return false;

      case 'help':
        printMenu();
        break;

      default:
        console.log(chalk.red('❌ 未知命令，输入 help 查看可用命令'));
    }
  } catch (error) {
    console.log(chalk.red('❌ 执行出错:'), error);
  }

  return true;
}

async function runScenario(num: string) {
  console.log(chalk.magenta(`\n🎬 运行场景测试 #${num}\n`));

  switch (num) {
    case '1': {
      console.log(chalk.gray('场景: 新用户首次订阅'));
      await checkStatusHandler({});
      await subscribeHandler({ name: '北京协和医院' });
      await listHandler({});
      break;
    }
    case '2': {
      console.log(chalk.gray('场景: 用户管理多个订阅'));
      await subscribeHandler({ name: '北京协和医院' });
      await subscribeHandler({ name: '上海华山医院' });
      await subscribeHandler({ name: '广州中山医院' });
      await setPrimaryHandler({ name: '上海华山医院' });
      await listHandler({});
      break;
    }
    case '3': {
      console.log(chalk.gray('场景: 用户更换主要医院'));
      await subscribeHandler({ name: '北京协和医院' });
      await subscribeHandler({ name: '上海华山医院' });
      await listHandler({});
      console.log(chalk.gray('\n--> 更换主要医院...\n'));
      await setPrimaryHandler({ name: '上海华山医院' });
      await listHandler({});
      break;
    }
    default:
      console.log(chalk.red('❌ 未知场景编号'));
  }
}

async function main() {
  printBanner();
  printMenu();

  // 检查是否需要提示
  const status = await checkStatusHandler({});
  if (status.data?.needsPrompt) {
    console.log(chalk.yellow('💡 提示: 这是您首次使用医院订阅功能'));
    console.log(chalk.yellow('   请输入医院名称开始订阅，或输入 help 查看帮助\n'));
  }

  const askQuestion = () => {
    rl.question(chalk.cyan('repsclaw > '), async (input) => {
      const continueRunning = await handleCommand(input);
      if (continueRunning) {
        console.log();
        askQuestion();
      } else {
        rl.close();
        process.exit(0);
      }
    });
  };

  askQuestion();
}

main().catch(console.error);
