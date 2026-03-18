#!/usr/bin/env tsx
/**
 * 医院订阅功能 - 流式对话模拟测试（方案C）
 * 模拟 OpenClaw 多轮对话交互，验证上下文一致性
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { HospitalSubscriptionService } from '../../src/services/hospital-subscription.service';
import {
  createSubscribeHospitalHandler,
  createListHospitalsHandler,
  createUnsubscribeHospitalHandler,
  createSetPrimaryHospitalHandler,
  createCheckSubscriptionStatusHandler,
} from '../../src/tools/hospital-subscription.tool';
import { HospitalNameResolver } from '../../src/utils/hospital-name-resolver';

// ============ 类型定义 ============

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  timestamp: number;
}

interface ToolCall {
  name: string;
  parameters: Record<string, any>;
  result?: any;
}

interface ConversationSession {
  id: string;
  messages: ConversationMessage[];
  context: SessionContext;
  createdAt: number;
}

interface SessionContext {
  subscribedHospitals: string[];
  primaryHospital: string | null;
  lastAction: string | null;
  userIntent: 'first_time' | 'returning' | 'active_user';
}

interface ConversationTurn {
  userInput: string;
  expectedIntent?: string;
  expectedTool?: string;
  validateResponse?: (response: string, session: ConversationSession, result: any) => boolean | string;
  validateState?: (session: ConversationSession, service: HospitalSubscriptionService) => boolean | string;
}

interface ConversationTestCase {
  name: string;
  description: string;
  category: 'onboarding' | 'daily_use' | 'management' | 'edge_case';
  initialState?: Partial<SessionContext>;
  turns: ConversationTurn[];
}

interface TestResult {
  caseName: string;
  passed: boolean;
  turns: Array<{
    turn: number;
    input: string;
    passed: boolean;
    error?: string;
    duration: number;
  }>;
  totalDuration: number;
}

// ============ 测试数据目录 ============

const testDir = path.join(process.cwd(), 'tmp-test-conversation');
const testStoragePath = path.join(testDir, 'hospital-subscriptions.json');

// ============ 意图识别引擎 ============

class IntentParser {
  parse(input: string, session?: ConversationSession): { intent: string; data: any; confidence: number } {
    const lower = input.toLowerCase();

    // 帮助意图（最高优先级）
    if (/帮助|help|怎么用|什么.*做|能做什么|你能做什么/.test(lower)) {
      return { intent: 'help', data: {}, confidence: 0.95 };
    }

    // 列表意图 - 在订阅之前检查
    if (/列表|查看.*订阅|我的医院|显示.*医院|有哪些医院|给我看看.*医院/.test(lower)) {
      return { intent: 'list', data: {}, confidence: 0.95 };
    }

    // 状态/统计意图
    if (/状态|统计|信息|情况|概况/.test(lower) && !/医院/.test(lower)) {
      return { intent: 'status', data: {}, confidence: 0.8 };
    }

    // 取消订阅意图
    if (/取消订阅|删除|移除|退订.*医院|不再关注|取消关注/.test(lower)) {
      const name = this.extractHospitalName(input, 'unsubscribe');
      return { intent: 'unsubscribe', data: { name }, confidence: 0.9 };
    }

    // 设置主要医院意图 - 传入上下文医院列表以支持别名匹配
    if (/设置.*主要|设为默认|主医院|默认医院|改成.*主要|把.*设成|把.*设为主要|把.*设为/.test(lower)) {
      const name = this.extractHospitalName(input, 'set-primary', session?.context?.subscribedHospitals);
      return { intent: 'set-primary', data: { name }, confidence: 0.85 };
    }

    // 订阅意图
    if (/订阅|添加|关注|加入.*医院|我想关注|我要关注|加上|关注下|添加一下|我想/.test(lower)) {
      const name = HospitalNameResolver.extractFromInput(input, 'subscribe');
      return { intent: 'subscribe', data: { name }, confidence: 0.9 };
    }

    return { intent: 'unknown', data: {}, confidence: 0 };
  }

  private extractHospitalName(input: string, intent: string, contextHospitals?: string[]): string {
    // 特殊处理：医院A/B/C模式（最优先，避免被其他模式干扰）
    const abcMatch = input.match(/医院([A-D])/);
    if (abcMatch) {
      return `医院${abcMatch[1]}`;
    }

    // 使用 HospitalNameResolver 提取名称
    const extracted = HospitalNameResolver.extractFromInput(input, intent);

    // 如果有上下文医院列表，尝试匹配别名
    if (contextHospitals && contextHospitals.length > 0) {
      const match = HospitalNameResolver.findHospital(extracted, contextHospitals);
      if (match && match.score >= 0.7) {
        return match.name;
      }
    }

    return extracted;
  }
}

// ============ 回复生成器 ============

class ResponseGenerator {
  generate(intent: string, userInput: string, result: any, session: ConversationSession): string {
    const context = session.context;

    switch (intent) {
      case 'subscribe': {
        if (result.status !== 'success') {
          return `抱歉，订阅失败：${result.error?.message || '未知错误'}`;
        }

        // 提取医院名称：优先从 subscription 或查找结果中获取
        let hospital = result.data.subscription?.name;
        if (!hospital && result.data.hospitals) {
          // 尝试从 userInput 匹配医院名
          for (const h of result.data.hospitals) {
            if (userInput.includes(h.name)) {
              hospital = h.name;
              break;
            }
          }
          // 如果没有匹配到，取最后添加的
          if (!hospital) {
            hospital = result.data.hospitals[result.data.hospitals.length - 1]?.name;
          }
        }
        hospital = hospital || '该医院';

        const isPrimary = result.data.subscription?.isPrimary || result.data.hospitals?.length === 1;
        const total = result.data.hospitals?.length || 0;

        // 根据用户类型生成不同回复
        if (context.userIntent === 'first_time') {
          return `已成功为您订阅${hospital}！${isPrimary ? '这是您的主要医院。' : ''}您可以使用"查看我的订阅"随时管理医院列表。`;
        }

        if (total > 3) {
          return `已添加${hospital}。您目前订阅了${total}家医院，建议设置一个主要医院方便快速查询。`;
        }

        return `已为您订阅${hospital}！${isPrimary ? '（主要医院）' : ''}目前共订阅${total}家医院。`;
      }

      case 'unsubscribe': {
        if (result.status !== 'success') {
          return `未能找到该医院的订阅记录。您当前订阅的医院有：${context.subscribedHospitals.join('、') || '无'}`;
        }
        const remaining = result.data.hospitals?.length || 0;
        return `已取消订阅。您目前还关注${remaining}家医院。`;
      }

      case 'list': {
        if (context.subscribedHospitals.length === 0) {
          return '您还没有订阅任何医院。请告诉我"订阅XX医院"来添加您关注的医院。';
        }

        let msg = `您当前订阅了${context.subscribedHospitals.length}家医院：\n`;
        context.subscribedHospitals.forEach((h, i) => {
          msg += `${i + 1}. ${h}${h === context.primaryHospital ? ' ⭐主要' : ''}\n`;
        });

        if (!context.primaryHospital && context.subscribedHospitals.length > 1) {
          msg += '\n提示：您可以设置一家主要医院，方便优先获取相关信息。';
        }
        return msg.trim();
      }

      case 'set-primary': {
        if (result.status !== 'success') {
          return `设置失败：${result.error?.message || '请先订阅该医院后再设置为主要医院'}`;
        }
        const hospital = result.data.primary;
        return `已将${hospital}设为您的主要医院。后续的查询和提醒将优先参考这家医院的信息。`;
      }

      case 'status': {
        if (context.userIntent === 'first_time') {
          return '欢迎使用医院订阅功能！我可以帮您：\n1. 订阅关注的医院\n2. 管理订阅列表\n3. 设置主要医院\n\n请直接告诉我"订阅XX医院"开始使用！';
        }
        return `您的订阅概况：\n• 订阅医院：${context.subscribedHospitals.length}家\n• 主要医院：${context.primaryHospital || '未设置'}\n• 状态：${context.subscribedHospitals.length > 0 ? '活跃' : '新用户'}`;
      }

      case 'help': {
        return `我可以帮您管理医院订阅：

📌 常用指令：
• "订阅北京协和医院" - 添加医院
• "查看我的医院" - 显示订阅列表
• "取消订阅XX医院" - 移除医院
• "设置XX医院为主要" - 设置默认医院
• "查看状态" - 查看订阅统计`;
      }

      default:
        return `抱歉，我没有理解您的意思。您可以输入"帮助"查看支持的指令。`;
    }
  }
}

// ============ 对话执行引擎 ============

class ConversationEngine {
  private service: HospitalSubscriptionService;
  private intentParser: IntentParser;
  private responseGenerator: ResponseGenerator;
  private handlers: Record<string, Function>;

  constructor() {
    this.service = this.createTestService();
    this.intentParser = new IntentParser();
    this.responseGenerator = new ResponseGenerator();
    this.handlers = {
      subscribe: createSubscribeHospitalHandler(this.service),
      unsubscribe: createUnsubscribeHospitalHandler(this.service),
      list: createListHospitalsHandler(this.service),
      'set-primary': createSetPrimaryHospitalHandler(this.service),
      status: createCheckSubscriptionStatusHandler(this.service),
      help: async () => ({
        status: 'success',
        message: '帮助信息',
        data: { actions: ['subscribe', 'unsubscribe', 'list', 'set-primary', 'status'] },
      }),
    };
  }

  private createTestService(): HospitalSubscriptionService {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    const service = new HospitalSubscriptionService();
    (service as any)['storagePath'] = testStoragePath;
    (service as any)['data'] = { hospitals: [], lastPromptedDate: null };
    return service;
  }

  async executeTurn(
    turn: ConversationTurn,
    session: ConversationSession
  ): Promise<{ success: boolean; response: string; result: any; error?: string }> {
    const startTime = Date.now();

    try {
      // 1. 解析意图（传入 session 以支持上下文感知）
      const { intent, data } = this.intentParser.parse(turn.userInput, session);

      if (intent === 'unknown') {
        return {
          success: false,
          response: '未能识别意图',
          result: null,
          error: `无法识别用户输入: "${turn.userInput}"`,
        };
      }

      // 验证意图匹配
      if (turn.expectedIntent && turn.expectedIntent !== intent) {
        return {
          success: false,
          response: '',
          result: null,
          error: `意图不匹配: 期望 "${turn.expectedIntent}", 实际 "${intent}"`,
        };
      }

      // 2. 执行工具调用
      const handler = this.handlers[intent];
      if (!handler) {
        return {
          success: false,
          response: '',
          result: null,
          error: `未找到处理器: ${intent}`,
        };
      }

      const result = await handler(data);

      // 验证工具调用 (expectedTool 是内部 intent 名称或工具名称)
      if (turn.expectedTool) {
        const expectedIntents = [turn.expectedTool, turn.expectedTool.replace('_hospital', ''), turn.expectedTool.replace('-', '_')];
        if (!expectedIntents.includes(intent)) {
          return {
            success: false,
            response: '',
            result,
            error: `工具不匹配: 期望 "${turn.expectedTool}", 实际 "${intent}"`,
          };
        }
      }

      // 3. 生成回复（在更新上下文之前，保留原始状态用于回复生成）
      const response = this.responseGenerator.generate(intent, turn.userInput, result, session);

      // 4. 更新会话上下文
      this.updateSessionContext(session, intent, result);

      // 5. 验证回复
      if (turn.validateResponse) {
        const validation = turn.validateResponse(response, session, result);
        if (validation !== true) {
          return {
            success: false,
            response,
            result,
            error: typeof validation === 'string' ? validation : '回复验证失败',
          };
        }
      }

      // 6. 验证状态
      if (turn.validateState) {
        const stateValidation = turn.validateState(session, this.service);
        if (stateValidation !== true) {
          return {
            success: false,
            response,
            result,
            error: typeof stateValidation === 'string' ? stateValidation : '状态验证失败',
          };
        }
      }

      // 7. 记录消息
      session.messages.push({
        role: 'user',
        content: turn.userInput,
        timestamp: Date.now(),
      });
      session.messages.push({
        role: 'assistant',
        content: response,
        toolCalls: [{ name: intent, parameters: data, result }],
        timestamp: Date.now(),
      });

      return { success: true, response, result };
    } catch (error: any) {
      return {
        success: false,
        response: '',
        result: null,
        error: error.message,
      };
    }
  }

  private updateSessionContext(session: ConversationSession, intent: string, result: any): void {
    const hospitals = this.service.getHospitals();
    session.context.subscribedHospitals = hospitals.map(h => h.name);
    session.context.primaryHospital = this.service.getPrimaryHospital()?.name || null;
    session.context.lastAction = intent;

    // 更新用户类型（只有在首次使用时才设为 first_time，一旦离开不再返回）
    if (session.context.userIntent === 'first_time') {
      // 首次使用用户完成第一个操作后，变为 returning
      if (hospitals.length > 0) {
        session.context.userIntent = 'returning';
      }
    } else if (hospitals.length >= 3) {
      session.context.userIntent = 'active_user';
    }
  }

  reset(): void {
    (this.service as any)['data'] = { hospitals: [], lastPromptedDate: null };
  }

  getService(): HospitalSubscriptionService {
    return this.service;
  }
}

// ============ 测试用例定义 ============

const conversationTestCases: ConversationTestCase[] = [
  {
    name: '新用户完整入门流程',
    description: '模拟首次使用用户从了解到订阅的完整对话流程',
    category: 'onboarding',
    turns: [
      {
        userInput: '你能做什么',
        expectedIntent: 'help',
        validateResponse: (response) => response.includes('订阅') && response.includes('医院'),
      },
      {
        userInput: '我想订阅北京协和医院',
        expectedIntent: 'subscribe',
        expectedTool: 'subscribe_hospital',
        validateResponse: (response, session) =>
          response.includes('北京协和医院') && response.includes('成功'),
        validateState: (session, service) =>
          service.isSubscribed('北京协和医院') &&
          service.getPrimaryHospital()?.name === '北京协和医院',
      },
      {
        userInput: '再帮我加上上海华山医院',
        expectedIntent: 'subscribe',
        validateState: (session, service) =>
          service.getHospitals().length === 2 &&
          service.getPrimaryHospital()?.name === '北京协和医院',
      },
      {
        userInput: '查看我订阅的医院',
        expectedIntent: 'list',
        validateResponse: (response) =>
          response.includes('北京协和医院') &&
          response.includes('上海华山医院') &&
          response.includes('主要'),
      },
    ],
  },
  {
    name: '多轮对话管理医院',
    description: '测试连续多轮对话中状态的保持一致性',
    category: 'management',
    turns: [
      {
        userInput: '订阅北京协和医院',
        validateState: (session, service) => service.getHospitals().length === 1,
      },
      {
        userInput: '订阅上海华山医院',
        validateState: (session, service) => service.getHospitals().length === 2,
      },
      {
        userInput: '订阅广州中山医院',
        validateState: (session, service) =>
          service.getHospitals().length === 3 &&
          session.context.subscribedHospitals.length === 3,
      },
      {
        userInput: '把华山医院设成主要的',
        expectedIntent: 'set-primary',
        validateState: (session, service) =>
          service.getPrimaryHospital()?.name === '上海华山医院',
      },
      {
        userInput: '查看我的医院列表',
        validateResponse: (response, session) =>
          response.includes('上海华山医院') &&
          response.includes('⭐'),
      },
      {
        userInput: '取消订阅北京协和医院',
        expectedIntent: 'unsubscribe',
        validateState: (session, service) =>
          service.getHospitals().length === 2 &&
          !service.isSubscribed('北京协和医院'),
      },
    ],
  },
  {
    name: '错误处理和边界情况',
    description: '测试各种错误输入和边界情况的对话恢复',
    category: 'edge_case',
    turns: [
      {
        userInput: '查看我的订阅',
        expectedIntent: 'list',
        validateResponse: (response) => response.includes('还没有订阅'),
      },
      {
        userInput: '取消订阅不存在的医院',
        expectedIntent: 'unsubscribe',
        validateResponse: (response, session, result) => result.status === 'error',
      },
      {
        userInput: '设置协和医院为主要医院',
        expectedIntent: 'set-primary',
        validateResponse: (response, session, result) =>
          result.status === 'error' || response.includes('请先订阅'),
      },
      {
        userInput: '订阅北京协和医院',
        validateState: (session, service) => service.getHospitals().length === 1,
      },
      {
        userInput: '再次订阅北京协和医院',
        expectedIntent: 'subscribe',
        validateState: (session, service) =>
          service.getHospitals().length === 1, // 不应重复添加
      },
    ],
  },
  {
    name: '复杂意图理解',
    description: '测试自然语言变体和复杂表达的意图识别',
    category: 'daily_use',
    turns: [
      {
        userInput: '我要关注北京协和医院',
        expectedIntent: 'subscribe',
        validateState: (session, service) => service.isSubscribed('北京协和医院'),
      },
      {
        userInput: '把北京协和医院设为我的默认医院',
        expectedIntent: 'set-primary',
        validateState: (session, service) =>
          service.getPrimaryHospital()?.name === '北京协和医院',
      },
      {
        userInput: '给我看看我都关注了哪些医院',
        expectedIntent: 'list',
        validateResponse: (response) => response.includes('北京协和医院'),
      },
      {
        userInput: '不再关注北京协和医院了',
        expectedIntent: 'unsubscribe',
        validateState: (session, service) => service.getHospitals().length === 0,
      },
    ],
  },
  {
    name: '长对话上下文保持',
    description: '测试长时间对话中的上下文一致性',
    category: 'management',
    turns: [
      {
        userInput: '订阅医院A',
        validateState: (session, service) => service.getHospitals().length === 1,
      },
      {
        userInput: '订阅医院B',
        validateState: (session, service) => service.getHospitals().length === 2,
      },
      {
        userInput: '查看状态',
        validateResponse: (response, session) =>
          session.context.subscribedHospitals.length === 2,
      },
      {
        userInput: '订阅医院C',
        validateState: (session, service) => service.getHospitals().length === 3,
      },
      {
        userInput: '把医院B设为主要',
        validateState: (session, service) =>
          service.getPrimaryHospital()?.name === '医院B',
      },
      {
        userInput: '查看我的医院',
        validateResponse: (response) =>
          response.includes('医院A') &&
          response.includes('医院B') &&
          response.includes('医院C') &&
          response.includes('⭐'),
      },
      {
        userInput: '取消订阅医院A',
        validateState: (session, service) =>
          service.getHospitals().length === 2 &&
          service.getPrimaryHospital()?.name === '医院B',
      },
      {
        userInput: '查看状态',
        validateResponse: (response, session) =>
          response.includes('2家') &&
          session.context.primaryHospital === '医院B',
      },
    ],
  },
];

// ============ 测试运行器 ============

class ConversationTestRunner {
  private engine: ConversationEngine;
  private results: TestResult[] = [];

  constructor() {
    this.engine = new ConversationEngine();
  }

  async runTestCase(testCase: ConversationTestCase): Promise<TestResult> {
    console.log(chalk.cyan(`\n📋 ${testCase.name}`));
    console.log(chalk.gray(`   ${testCase.description}`));
    console.log();

    // 重置引擎状态
    this.engine.reset();

    // 创建会话
    const session: ConversationSession = {
      id: `test-${Date.now()}`,
      messages: [],
      context: {
        subscribedHospitals: [],
        primaryHospital: null,
        lastAction: null,
        userIntent: 'first_time',
        ...testCase.initialState,
      },
      createdAt: Date.now(),
    };

    const turnResults: TestResult['turns'] = [];
    const caseStartTime = Date.now();

    for (let i = 0; i < testCase.turns.length; i++) {
      const turn = testCase.turns[i];
      const turnStartTime = Date.now();

      process.stdout.write(`  ${i + 1}. "${turn.userInput.substring(0, 30)}${turn.userInput.length > 30 ? '...' : ''}" `);

      const result = await this.engine.executeTurn(turn, session);
      const duration = Date.now() - turnStartTime;

      if (result.success) {
        console.log(chalk.green(`✓ (${duration}ms)`));
        turnResults.push({
          turn: i + 1,
          input: turn.userInput,
          passed: true,
          duration,
        });
      } else {
        console.log(chalk.red(`✗ (${duration}ms)`));
        console.log(chalk.red(`     错误: ${result.error}`));
        turnResults.push({
          turn: i + 1,
          input: turn.userInput,
          passed: false,
          error: result.error,
          duration,
        });
      }
    }

    const allPassed = turnResults.every(r => r.passed);
    const totalDuration = Date.now() - caseStartTime;

    console.log();
    console.log(`  结果: ${allPassed ? chalk.green('通过') : chalk.red('失败')} ` +
      `| ${chalk.green(turnResults.filter(r => r.passed).length + ' 通过')} ` +
      `| ${chalk.red(turnResults.filter(r => !r.passed).length + ' 失败')}`);

    return {
      caseName: testCase.name,
      passed: allPassed,
      turns: turnResults,
      totalDuration,
    };
  }

  async runAll(): Promise<void> {
    console.log(chalk.cyan.bold('╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║') + chalk.white.bold('     🏥 医院订阅 - 流式对话模拟测试                       ') + chalk.cyan.bold('║'));
    console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════╝'));
    console.log();

    for (const testCase of conversationTestCases) {
      const result = await this.runTestCase(testCase);
      this.results.push(result);
    }

    this.printSummary();
  }

  printSummary(): void {
    console.log(chalk.cyan('\n══════════════════════════════════════════════════════════════'));
    console.log(chalk.white.bold('                        测试总结'));
    console.log(chalk.cyan('══════════════════════════════════════════════════════════════\n'));

    let totalTurns = 0;
    let passedTurns = 0;
    let passedCases = 0;

    for (const result of this.results) {
      const status = result.passed ? chalk.green('✓ 通过') : chalk.red('✗ 失败');
      const passCount = result.turns.filter(t => t.passed).length;
      const failCount = result.turns.filter(t => !t.passed).length;

      console.log(`  ${status} ${result.caseName}`);
      console.log(`     轮次: ${passCount} 通过 | ${failCount} 失败 | 耗时 ${result.totalDuration}ms`);

      if (!result.passed) {
        result.turns.filter(t => !t.passed).forEach(t => {
          console.log(chalk.red(`     • 轮次 ${t.turn}: ${t.error}`));
        });
      }
      console.log();

      totalTurns += result.turns.length;
      passedTurns += passCount;
      if (result.passed) passedCases++;
    }

    console.log(chalk.cyan('──────────────────────────────────────────────────────────────'));
    console.log(chalk.white.bold(`  测试用例: ${passedCases}/${this.results.length} 通过`));
    console.log(chalk.white.bold(`  对话轮次: ${passedTurns}/${totalTurns} 通过`));
    console.log(chalk.cyan('══════════════════════════════════════════════════════════════\n'));

    // 清理测试数据
    this.cleanup();

    process.exit(passedCases === this.results.length ? 0 : 1);
  }

  cleanup(): void {
    if (fs.existsSync(testStoragePath)) {
      fs.unlinkSync(testStoragePath);
    }
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
    }
  }
}

// ============ 主入口 ============

if (require.main === module) {
  const runner = new ConversationTestRunner();
  runner.runAll().catch((err) => {
    console.error(chalk.red('测试运行错误:'), err);
    process.exit(1);
  });
}

export { ConversationEngine, ConversationTestRunner, conversationTestCases };
