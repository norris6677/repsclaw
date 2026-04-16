/**
 * Intent Understanding Engine
 * 意图理解引擎 - 三层决策模型
 *
 * Layer 1: 快速规则匹配（Fast Path）
 * Layer 2: LLM 语义理解（通过 OpenClaw API）
 * Layer 3: 个性化决策（基于用户订阅）
 */

import type {
  SessionContext,
  IntentUnderstanding,
  ActionDecision,
  ExtractedEntities,
  SaveTarget,
  FeishuMessage,
} from './types';
import { SessionState } from './types';
import { createLogger } from '../../utils/plugin-logger';
import type { LLMClient } from '../llm-client';

const logger = createLogger('REPSCLAW:INTENT');

// 快速规则模式
const SAVE_KEYWORDS = ['保存', '存到', '存进', '归档', '收藏', '存一下', '记一下', '放到'];
const URL_REGEX = /(https?:\/\/[^\s<>")\]\}]+)/gi;
const HOSPITAL_SUFFIXES = ['医院', '中心', '诊所', '卫生院', '医科大学', '医学院'];
const DEPT_SUFFIXES = ['科', '室', '中心', '部'];

interface IntentEngineOptions {
  llmModel?: string;
  autoSaveThreshold?: number;
  suggestThreshold?: number;
}

export class IntentEngine {
  private llmClient: LLMClient;
  private options: Required<IntentEngineOptions>;

  constructor(llmClient: LLMClient, options: IntentEngineOptions = {}) {
    this.llmClient = llmClient;
    this.options = {
      llmModel: options.llmModel ?? llmClient.defaultModel ?? 'claude-sonnet-4-6',
      autoSaveThreshold: options.autoSaveThreshold ?? 0.8,
      suggestThreshold: options.suggestThreshold ?? 0.5,
    };
  }

  /**
   * 主入口：理解用户意图并决策
   */
  async understandIntent(
    message: FeishuMessage,
    session: SessionContext,
    userSubscriptions: { hospitals: string[]; departments: string[]; doctors: string[] }
  ): Promise<ActionDecision> {
    const rawText = this.extractTextContent(message);
    logger.info('Understanding intent', { userId: session.userId, messageType: message.messageType });

    // ==================== Layer 1: 快速规则匹配 ====================
    const ruleResult = this.fastPathAnalysis(rawText, session);
    if (ruleResult.confidence === 1.0) {
      logger.info('Fast path matched', { reason: ruleResult.reason });
      return this.convertToAction(ruleResult, session, userSubscriptions);
    }

    // ==================== Layer 2: LLM 语义理解 ====================
    const llmUnderstanding = await this.llmUnderstanding(
      rawText,
      session,
      userSubscriptions,
      message.messageType === 'post' || message.messageType === 'interactive'
    );

    // ==================== Layer 3: 个性化决策 ====================
    const finalDecision = await this.personalizeDecision(
      llmUnderstanding,
      session,
      userSubscriptions
    );

    return finalDecision;
  }

  /**
   * Layer 1: 快速规则匹配
   * 对于明确的指令，直接处理而不调用 LLM（节省 token + 延迟）
   */
  private fastPathAnalysis(
    text: string,
    session: SessionContext
  ): { confidence: number; reason: string; understanding?: Partial<IntentUnderstanding> } {
    // 检查是否是纯 URL（可能是用户单独发的链接）
    const urls = this.extractUrls(text);
    const hasSaveKeyword = SAVE_KEYWORDS.some(kw => text.includes(kw));

    // 情况1: 有保存关键词 + 有 URL + 会话在等待 URL → 100% 确定
    if (hasSaveKeyword && urls.length > 0 && session.state === SessionState.WAITING_URL && session.pendingTarget) {
      return {
        confidence: 1.0,
        reason: 'Session waiting for URL, received save command with URL',
        understanding: {
          hasSaveIntent: true,
          urls,
          target: session.pendingTarget,
          confidence: 1.0,
          missingInfo: [],
          reasoning: '用户明确提供了之前请求保存的目标和URL',
        },
      };
    }

    // 情况2: 有 URL + 会话在等待目标 → 可能是用户提供的 URL
    if (urls.length > 0 && session.state === SessionState.WAITING_TARGET) {
      return {
        confidence: 1.0,
        reason: 'Session waiting for target, received URL',
        understanding: {
          hasSaveIntent: true,
          urls,
          target: session.pendingTarget,
          confidence: 1.0,
          missingInfo: [],
          reasoning: '用户提供了之前请求的目标对应的URL',
        },
      };
    }

    // 情况3: 明确的 "保存URL到医院" 格式
    if (hasSaveKeyword && urls.length === 1) {
      const target = this.extractExplicitTarget(text);
      if (target && target.confidence > 0.9) {
        return {
          confidence: 1.0,
          reason: 'Explicit save command with clear target',
          understanding: {
            hasSaveIntent: true,
            urls,
            target,
            confidence: 1.0,
            missingInfo: [],
            reasoning: '明确的保存指令，包含URL和目标',
          },
        };
      }
    }

    // 情况4: 有保存关键词但没有 URL，且没有等待状态 → 可能是闲聊
    if (hasSaveKeyword && urls.length === 0 && session.state === SessionState.IDLE) {
      // 不触发保存，让 LLM 判断是否是其他意图
      return { confidence: 0, reason: 'Save keyword without URL in idle state' };
    }

    // 情况5: 纯 URL，没有保存关键词 → 需要 LLM 判断是否转发消息
    if (urls.length > 0 && !hasSaveKeyword) {
      return { confidence: 0, reason: 'URL without save keyword, need LLM analysis' };
    }

    return { confidence: 0, reason: 'No fast path match' };
  }

  /**
   * Layer 2: LLM 语义理解
   */
  private async llmUnderstanding(
    text: string,
    session: SessionContext,
    userSubscriptions: { hospitals: string[]; departments: string[]; doctors: string[] },
    isForwardMessage: boolean
  ): Promise<IntentUnderstanding> {
    const systemPrompt = this.buildSystemPrompt(session, userSubscriptions);

    try {
      // 调用统一的 LLM 客户端
      const response = await this.callLLM(systemPrompt, text, isForwardMessage);

      return {
        hasSaveIntent: response.hasSaveIntent ?? false,
        urls: response.urls ?? [],
        target: response.target,
        confidence: response.confidence ?? 0,
        missingInfo: response.missingInfo ?? [],
        reasoning: response.reasoning ?? '',
        suggestedTargets: response.suggestedTargets,
      };
    } catch (error) {
      logger.error('LLM understanding failed', error);
      // 降级处理：使用简单的 URL 提取
      const urls = this.extractUrls(text);
      return {
        hasSaveIntent: urls.length > 0,
        urls,
        confidence: 0.3,
        missingInfo: ['target'],
        reasoning: 'LLM 调用失败，使用降级策略',
      };
    }
  }

  /**
   * Layer 3: 个性化决策
   */
  private async personalizeDecision(
    understanding: IntentUnderstanding,
    session: SessionContext,
    userSubscriptions: { hospitals: string[]; departments: string[]; doctors: string[] }
  ): Promise<ActionDecision> {
    // 如果没有保存意图
    if (!understanding.hasSaveIntent) {
      return { action: 'IGNORE', message: undefined };
    }

    const { urls, target, confidence, missingInfo } = understanding;

    // 缺少 URL
    if (missingInfo.includes('url') || urls.length === 0) {
      // 检查是否已有待处理的 URL
      if (session.pendingUrl) {
        // 用户可能是在提供目标
        const newTarget = target || this.inferTargetFromText('', session);
        if (newTarget) {
          return {
            action: 'SAVE_ARTICLE',
            url: session.pendingUrl,
            target: newTarget,
          };
        }
      }

      // 保存目标等待 URL 的状态
      if (target) {
        this.updateSessionPendingTarget(session, target);
        return {
          action: 'REQUEST_URL',
          target,
          message: `好的，保存到 ${target.hospitalName}${target.departmentName ? ' · ' + target.departmentName : ''}。\n⏳ 请发送文章链接（5分钟内有效）`,
        };
      }

      return {
        action: 'CLARIFY_INTENT',
        message: '请发送要保存的文章链接',
      };
    }

    // 有 URL 但缺少目标
    if (missingInfo.includes('hospital') || !target) {
      const inferredTarget = this.inferTargetFromContext(session, userSubscriptions, understanding);

      if (inferredTarget && inferredTarget.confidence >= this.options.autoSaveThreshold) {
        // 高置信度，自动保存
        return {
          action: urls.length > 1 ? 'BATCH_SAVE' : 'SAVE_ARTICLE',
          url: urls[0],
          urls: urls.length > 1 ? urls : undefined,
          target: inferredTarget,
        };
      }

      if (inferredTarget && inferredTarget.confidence >= this.options.suggestThreshold) {
        // 中置信度，请求确认
        this.updateSessionPendingUrl(session, urls[0]);
        return {
          action: 'REQUEST_CONFIRMATION',
          url: urls[0],
          target: inferredTarget,
          suggestedTargets: understanding.suggestedTargets || [inferredTarget],
          message: this.buildConfirmationMessage(urls[0], inferredTarget, understanding.urlPreview),
        };
      }

      // 低置信度，请求明确指定
      this.updateSessionPendingUrl(session, urls[0]);
      return {
        action: 'REQUEST_TARGET',
        url: urls[0],
        suggestedTargets: this.generateSuggestedTargets(session, userSubscriptions),
      };
    }

    // 需要确认
    if (missingInfo.includes('confirmation')) {
      return {
        action: 'REQUEST_CONFIRMATION',
        url: urls[0],
        target: target!,
        message: `💡 推断您想保存到「${target!.hospitalName}${target!.departmentName ? ' · ' + target!.departmentName : ''}」，确认吗？\n回复"是"确认，或告诉我正确的目标`,
      };
    }

    // 信息完整，执行保存
    return {
      action: urls.length > 1 ? 'BATCH_SAVE' : 'SAVE_ARTICLE',
      url: urls[0],
      urls: urls.length > 1 ? urls : undefined,
      target: target!,
    };
  }

  // ==================== 私有工具方法 ====================

  private extractTextContent(message: FeishuMessage): string {
    try {
      const content = JSON.parse(message.content);

      if (message.messageType === 'text') {
        return content.text || '';
      }

      if (message.messageType === 'post' && content.post) {
        // 提取富文本内容
        const texts: string[] = [];
        for (const block of content.post.content || []) {
          for (const element of block) {
            if (element.tag === 'text') {
              texts.push(element.text);
            } else if (element.tag === 'a') {
              texts.push(element.text || element.href);
            }
          }
        }
        return [content.post.title, ...texts].filter(Boolean).join('\n');
      }

      if (message.messageType === 'interactive' && content.card) {
        // 提取卡片内容
        const header = content.card.header?.title?.content || '';
        const elements = content.card.elements || [];
        const elementTexts = elements
          .map((e: any) => e.text?.content || e.content || '')
          .filter(Boolean);
        return [header, ...elementTexts].join('\n');
      }

      return '';
    } catch {
      return message.content || '';
    }
  }

  private extractUrls(text: string): string[] {
    const matches = text.match(URL_REGEX);
    return matches ? [...new Set(matches)] : [];
  }

  private extractExplicitTarget(text: string): SaveTarget | null {
    // 简单规则：查找 "保存...到...医院"
    const hospitalMatch = text.match(/(?:到|去|进|入)\s*([^，,。\s]{3,20}(?:医院|中心))/);
    const deptMatch = text.match(/(?:医院)?\s*([^，,。\s]{2,10}科)/);

    if (hospitalMatch) {
      return {
        type: deptMatch ? 'department' : 'hospital',
        hospitalName: hospitalMatch[1].trim(),
        departmentName: deptMatch ? deptMatch[1].trim() : undefined,
        confidence: 0.95,
        reasoning: '明确的"保存到XX医院"格式',
      };
    }

    return null;
  }

  private inferTargetFromContext(
    session: SessionContext,
    userSubscriptions: { hospitals: string[]; departments: string[]; doctors: string[] },
    understanding?: IntentUnderstanding
  ): SaveTarget | null {
    // 1. 最近操作的目标
    if (session.recentTargets.length > 0) {
      const recent = session.recentTargets[0];
      return {
        type: recent.type as any,
        hospitalName: recent.hospitalName || recent.name,
        departmentName: recent.type === 'department' ? recent.name : undefined,
        confidence: 0.7,
        reasoning: `最近操作的目标：${recent.name}`,
      };
    }

    // 2. 用户只有一个订阅的医院
    if (userSubscriptions.hospitals.length === 1) {
      return {
        type: 'hospital',
        hospitalName: userSubscriptions.hospitals[0],
        confidence: 0.8,
        reasoning: '用户只订阅了一个医院，作为默认目标',
      };
    }

    // 3. 会话中最近提到的医院
    if (session.userEntityLibrary.hospitals.length > 0) {
      return {
        type: 'hospital',
        hospitalName: session.userEntityLibrary.hospitals[0],
        confidence: 0.6,
        reasoning: '会话中最近提到的医院',
      };
    }

    return null;
  }

  private inferTargetFromText(text: string, session: SessionContext): SaveTarget | null {
    // 检查是否是科室名（如"心内科"）
    const deptMatch = text.match(/([^，,。\s]{2,10}科)/);
    if (deptMatch && session.recentTargets.length > 0) {
      const recentHospital = session.recentTargets.find(t => t.type === 'hospital');
      if (recentHospital) {
        return {
          type: 'department',
          hospitalName: recentHospital.name,
          departmentName: deptMatch[1],
          confidence: 0.8,
          reasoning: `基于最近医院 ${recentHospital.name} 和提到的科室`,
        };
      }
    }

    return this.extractExplicitTarget(text);
  }

  private generateSuggestedTargets(
    session: SessionContext,
    userSubscriptions: { hospitals: string[]; departments: string[]; doctors: string[] }
  ): SaveTarget[] {
    const suggestions: SaveTarget[] = [];

    // 添加最近使用的
    for (const recent of session.recentTargets.slice(0, 3)) {
      suggestions.push({
        type: recent.type as any,
        hospitalName: recent.hospitalName || recent.name,
        departmentName: recent.type === 'department' ? recent.name : undefined,
        confidence: 0.9,
        reasoning: '最近使用',
      });
    }

    // 添加订阅的医院
    for (const hospital of userSubscriptions.hospitals.slice(0, 3)) {
      if (!suggestions.find(s => s.hospitalName === hospital)) {
        suggestions.push({
          type: 'hospital',
          hospitalName: hospital,
          confidence: 0.7,
          reasoning: '已订阅',
        });
      }
    }

    return suggestions;
  }

  private buildSystemPrompt(
    session: SessionContext,
    userSubscriptions: { hospitals: string[]; departments: string[]; doctors: string[] }
  ): string {
    return `你是医疗销售智能助手，帮助用户保存文章到知识库。

## 用户的订阅信息（优先考虑这些实体）
- 已订阅医院：${userSubscriptions.hospitals.join(', ') || '无'}
- 已订阅科室：${userSubscriptions.departments.join(', ') || '无'}
- 已订阅医生：${userSubscriptions.doctors.join(', ') || '无'}

## 会话上下文
- 当前状态：${session.state}
- 最近对话：${session.messageHistory.slice(-3).map(m => `${m.role}: ${m.content.substring(0, 50)}...`).join('\n')}
- 最近操作：${session.recentTargets.slice(0, 3).map(t => `${t.type}-${t.name}`).join(', ') || '无'}

## 任务
1. 判断用户是否有保存文章的意图（即使没说"保存"，转发文章也算）
2. 提取所有 URL（包括转发消息中的链接）
3. 识别保存目标（医院/科室/医生），支持指代消解：
   - "这个/那个" → 参考最近对话中的实体
   - "刚才的" → 使用 recentTargets[0]
   - "同样的地方" → 复制最近的目标
4. 如果目标不明确，基于用户订阅信息推断

## 输出格式
返回 JSON 对象：
{
  "hasSaveIntent": boolean,
  "urls": string[],
  "target": { "type": "hospital|department|doctor", "hospitalName": string, "departmentName?": string, "doctorName?": string },
  "confidence": number (0-1),
  "missingInfo": ["url"|"hospital"|"department"|"confirmation"],
  "reasoning": string,
  "suggestedTargets": SaveTarget[]
}`;
  }

  private async callLLM(
    systemPrompt: string,
    userMessage: string,
    isForwardMessage: boolean
  ): Promise<any> {
    // 构建消息
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
    ];

    if (isForwardMessage) {
      messages.push({
        role: 'user',
        content: `用户转发了一条消息，内容如下：\n\n${userMessage}\n\n请分析这是否是文章分享，并提取保存意图。`,
      });
    } else {
      messages.push({ role: 'user', content: userMessage });
    }

    // 调用统一的 LLM 客户端
    const response = await this.llmClient.call({
      model: this.options.llmModel,
      messages,
      temperature: 0.3,
    });

    // 解析 JSON 响应
    try {
      return typeof response === 'string' ? JSON.parse(response) : response;
    } catch {
      return { hasSaveIntent: false, confidence: 0 };
    }
  }

  private convertToAction(
    ruleResult: { understanding?: Partial<IntentUnderstanding> },
    session: SessionContext,
    userSubscriptions: { hospitals: string[]; departments: string[]; doctors: string[] }
  ): ActionDecision {
    const understanding = ruleResult.understanding!;

    const urls = understanding.urls || [];
    const target = understanding.target!;

    return {
      action: urls.length > 1 ? 'BATCH_SAVE' : 'SAVE_ARTICLE',
      url: urls[0],
      urls: urls.length > 1 ? urls : undefined,
      target,
    };
  }

  private updateSessionPendingTarget(session: SessionContext, target: SaveTarget): void {
    session.pendingTarget = target;
    session.state = SessionState.WAITING_URL;
    session.lastActivityAt = Date.now();
  }

  private updateSessionPendingUrl(session: SessionContext, url: string): void {
    session.pendingUrl = url;
    session.state = SessionState.WAITING_TARGET;
    session.lastActivityAt = Date.now();
  }

  private buildConfirmationMessage(url: string, target: SaveTarget, preview?: { title?: string }): string {
    return `📄 检测到文章${preview?.title ? `《${preview.title}》` : ''}

🤔 推断您想保存到：
「${target.hospitalName}${target.departmentName ? ' · ' + target.departmentName : ''}」

回复"是"确认保存，或告诉我正确的目标`;
  }
}
