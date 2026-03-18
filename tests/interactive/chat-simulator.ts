#!/usr/bin/env tsx
/**
 * 方案 3: 聊天模拟器
 * 模拟 OpenClaw 聊天界面，更真实地测试交互体验
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

// 模拟的 AI 助手角色
const AI_NAME = '🤖 OpenClaw';
const USER_NAME = '👤 User';

// 测试数据目录
const testDir = path.join(process.cwd(), 'tmp-test-chat');
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

// 模拟打字效果
async function typewrite(text: string, delay: number = 30) {
  for (const char of text) {
    process.stdout.write(char);
    await new Promise(r => setTimeout(r, delay));
  }
  console.log();
}

function printAIMessage(message: string) {
  console.log();
  console.log(chalk.blue(`${AI_NAME}:`));
  console.log(chalk.white(`  ${message}`));
  console.log();
}

function printUserMessage(message: string) {
  console.log();
  console.log(chalk.green(`${USER_NAME}:`));
  console.log(chalk.white(`  ${message}`));
  console.log();
}

function printDivider() {
  console.log(chalk.gray('─'.repeat(60)));
}

// AI 意图识别（简单版）
function parseIntent(input: string): { intent: string; data: any } {
  const lower = input.toLowerCase();

  // 订阅意图
  if (/订阅|添加|关注|加入.*医院/.test(lower)) {
    const match = input.match(/["']?([^"']+(?:医院|诊所|医疗中心))["']?/);
    const name = match ? match[1] : input.replace(/订阅|添加|关注|加入/, '').trim();
    return { intent: 'subscribe', data: { name } };
  }

  // 取消订阅意图
  if (/取消订阅|删除|移除|退订.*医院/.test(lower)) {
    const match = input.match(/["']?([^"']+(?:医院|诊所|医疗中心))["']?/);
    const name = match ? match[1] : input.replace(/取消订阅|删除|移除|退订/, '').trim();
    return { intent: 'unsubscribe', data: { name } };
  }

  // 列表意图
  if (/列表|查看.*订阅|我的医院|显示.*医院/.test(lower)) {
    return { intent: 'list', data: {} };
  }

  // 设置主要医院意图
  if (/设置.*主要|设为默认|主医院/.test(lower)) {
    const match = input.match(/["']?([^"']+(?:医院|诊所|医疗中心))["']?/);
    const name = match ? match[1] : input.replace(/设置.*主要|设为默认|主医院/, '').trim();
    return { intent: 'set-primary', data: { name } };
  }

  // 状态意图
  if (/状态|统计|信息|情况/.test(lower)) {
    return { intent: 'status', data: {} };
  }

  // 帮助意图
  if (/帮助|help|怎么用|什么.*做/.test(lower)) {
    return { intent: 'help', data: {} };
  }

  return { intent: 'unknown', data: {} };
}

// 智能回复生成
async function generateAIResponse(intent: string, data: any, result: any): Promise<string> {
  switch (intent) {
    case 'subscribe': {
      if (result.status === 'success') {
        const responses = [
          `已为您订阅 ${data.name}！${result.data.subscription.isPrimary ? '这是您的主要医院。' : ''}目前您共订阅了 ${result.data.hospitals.length} 家医院。`,
          `成功添加 ${data.name} 到您的订阅列表。${result.data.primary ? `您的主要医院是 ${result.data.primary}。` : ''}`,
          `好的，已订阅 ${data.name}。需要我帮您查看完整的订阅列表吗？`,
        ];
        return responses[Math.floor(Math.random() * responses.length)];
      } else {
        return `抱歉，订阅失败：${result.error?.message}`;
      }
    }

    case 'unsubscribe': {
      if (result.status === 'success') {
        return `已为您取消对 ${data.name} 的订阅。如需重新订阅，随时告诉我！`;
      } else {
        return `抱歉，未能找到 ${data.name} 的订阅记录。您可以输入"查看订阅列表"来确认当前订阅的医院。`;
      }
    }

    case 'list': {
      if (result.status === 'success') {
        if (result.data.hospitals.length === 0) {
          return '您目前还没有订阅任何医院。您可以直接告诉我"订阅北京协和医院"来添加。';
        } else {
          let msg = `您当前订阅了 ${result.data.hospitals.length} 家医院：`;
          result.data.hospitals.forEach((h: any, i: number) => {
            msg += `\n${i + 1}. ${h.name}${h.isPrimary ? ' (主要医院)' : ''}`;
          });
          msg += `\n\n${result.data.primary ? `主要医院: ${result.data.primary}` : '尚未设置主要医院'}`;
          return msg;
        }
      }
      break;
    }

    case 'set-primary': {
      if (result.status === 'success') {
        return `已将 ${data.name} 设为您的主要医院。之后的查询和提醒将优先参考这家医院。`;
      } else {
        return `抱歉，无法设置 ${data.name} 为主要医院。请确认您已经订阅了这家医院。`;
      }
    }

    case 'status': {
      if (result.status === 'success') {
        if (result.data.isFirstTime) {
          return '您好！欢迎使用医院订阅功能。我可以帮您：\n1. 订阅关注的医院\n2. 管理订阅列表\n3. 设置主要医院\n\n请直接告诉我"订阅XX医院"开始使用！';
        }
        return `订阅状态：\n- 订阅医院数：${result.data.totalHospitals}\n- 主要医院：${result.data.primaryHospital || '未设置'}\n- 今日已提示：${result.data.hasPromptedToday ? '是' : '否'}`;
      }
      break;
    }

    case 'help': {
      return `我可以帮您管理医院订阅：

📌 常用指令：
• "订阅北京协和医院" - 添加医院订阅
• "查看我的订阅" - 显示所有订阅的医院
• "取消订阅XX医院" - 移除某家医院
• "设置XX医院为主要" - 设定默认医院
• "查看状态" - 查看订阅统计

您也可以直接用自然语言与我交流，比如"我想关注上海华山医院"。`;
    }

    default: {
      return `抱歉，我没有理解您的意思。您可以输入"帮助"查看支持的指令，或者直接说"订阅XX医院"。`;
    }
  }
  return '处理完成。';
}

async function processUserInput(input: string): Promise<boolean> {
  if (!input.trim()) return true;

  // 退出指令
  if (/^exit|quit|退出|再见|拜拜$/i.test(input.trim())) {
    printAIMessage('感谢使用，再见！👋');
    return false;
  }

  printUserMessage(input);

  // 解析意图
  const { intent, data } = parseIntent(input);

  // 执行操作
  let result: any;
  try {
    switch (intent) {
      case 'subscribe':
        result = await subscribeHandler(data);
        break;
      case 'unsubscribe':
        result = await unsubscribeHandler(data);
        break;
      case 'list':
        result = await listHandler(data);
        break;
      case 'set-primary':
        result = await setPrimaryHandler(data);
        break;
      case 'status':
        result = await checkStatusHandler(data);
        break;
      case 'help':
        result = { status: 'success' };
        break;
      default:
        result = { status: 'unknown' };
    }

    // 生成 AI 回复
    const response = await generateAIResponse(intent, data, result);
    printAIMessage(response);

  } catch (error: any) {
    printAIMessage(`抱歉，处理您的请求时出错了：${error.message}`);
  }

  printDivider();
  return true;
}

async function welcome() {
  console.clear();
  printDivider();
  console.log(chalk.cyan.bold('  🏥 OpenClaw 医院订阅功能 - 聊天模拟器'));
  console.log(chalk.gray('  模拟真实聊天交互体验，无需部署到 OpenClaw'));
  printDivider();

  // 首次使用检查
  const status = await checkStatusHandler({});
  if (status.data?.isFirstTime) {
    printAIMessage('您好！我是您的医疗助手。我可以帮您订阅和管理关注的医院。\n\n您可以直接输入：\n• "订阅北京协和医院"\n• "查看我的订阅"\n• "帮助"\n\n请问有什么可以帮您的？');
  } else {
    printAIMessage('欢迎回来！有什么我可以帮您的吗？');
  }
}

async function main() {
  await welcome();

  const ask = () => {
    rl.question(chalk.green(`${USER_NAME.replace('👤 ', '')}: `), async (input) => {
      const continueRunning = await processUserInput(input);
      if (continueRunning) {
        ask();
      } else {
        rl.close();
        process.exit(0);
      }
    });
  };

  ask();
}

main().catch(console.error);
