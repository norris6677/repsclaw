
/**
 * Article Ingestion Service
 * 文章采集服务 - 核心编排逻辑
 *
 * 职责：
 * 1. 协调飞书消息接收
 * 2. 管理会话状态
 * 3. 理解用户意图
 * 4. 执行文章保存
 */

import { EventEmitter } from 'events';
import type { RawSourceManager } from '../knowledge-collection/raw-source.manager';
import type { KnowledgeCollectionService } from '../knowledge-collection/knowledge-collection.service';
import { SessionManager } from './session-manager';
import { IntentEngine } from './intent-engine';
import { FeishuAdapter } from './feishu-adapter';
import type {
  FeishuMessage,
  ActionDecision,
  ArticleSaveResult,
  BatchSaveResult,
} from './types';
import { SessionState } from './types';
import type { ArticleIngestionConfig } from './config-adapter';
import { createLogger } from '../../utils/plugin-logger';
import { convertWebToMarkdown } from '../web-to-markdown.service';
import { CollectionSourceType } from '../../types/knowledge-collection.types';
import type { WikiIngestService } from '../wiki/wiki-ingest.service';
import type { HospitalSubscriptionService } from '../hospital-subscription.service';
import type { DoctorSubscriptionService } from '../doctor-subscription.service';
import type { LLMClient } from '../llm-client';

const logger = createLogger('REPSCLAW:INGESTION');

export class ArticleIngestionService extends EventEmitter {
  private sessionManager: SessionManager;
  private intentEngine: IntentEngine;
  private feishuAdapter: FeishuAdapter;
  private rawSourceManager: RawSourceManager;
  private wikiIngestService?: WikiIngestService;
  private hospitalSubscription?: HospitalSubscriptionService;
  private doctorSubscription?: DoctorSubscriptionService;
  private llmClient: LLMClient;

  constructor(
    llmClient: LLMClient,
    rawSourceManager: RawSourceManager,
    config: ArticleIngestionConfig,
    wikiIngestService?: WikiIngestService,
    hospitalSubscription?: HospitalSubscriptionService,
    doctorSubscription?: DoctorSubscriptionService
  ) {
    super();
    this.llmClient = llmClient;
    this.rawSourceManager = rawSourceManager;
    this.wikiIngestService = wikiIngestService;
    this.hospitalSubscription = hospitalSubscription;
    this.doctorSubscription = doctorSubscription;

    // 初始化会话管理器（使用配置值）
    this.sessionManager = new SessionManager({
      sessionTTL: config.session.ttl,
      checkpointInterval: config.session.checkpointInterval,
    });

    // 初始化意图引擎（使用配置值）
    this.intentEngine = new IntentEngine(llmClient, {
      autoSaveThreshold: config.intent.autoSaveThreshold,
      suggestThreshold: config.intent.suggestThreshold,
      llmModel: config.intent.llmModel,
    });

    // 初始化飞书适配器
    this.feishuAdapter = new FeishuAdapter({
      appId: config.feishu.appId,
      appSecret: config.feishu.appSecret,
      encryptKey: config.feishu.encryptKey,
      verificationToken: config.feishu.verificationToken,
    });

    // 绑定事件处理
    this.setupEventHandlers();
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    await this.feishuAdapter.start();
    logger.info('Article ingestion service started');
    this.emit('started');
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    await this.feishuAdapter.stop();
    await this.sessionManager.shutdown();
    logger.info('Article ingestion service stopped');
    this.emit('stopped');
  }

  /**
   * 获取服务状态
   */
  getStatus(): {
    feishuConnected: boolean;
    activeSessions: number;
    sessionStats: { total: number; byState: Record<string, number> };
  } {
    return {
      feishuConnected: this.feishuAdapter.listenerCount('connected') > 0,
      activeSessions: this.sessionManager.getAllSessions().length,
      sessionStats: this.sessionManager.getStats(),
    };
  }

  // ==================== 私有方法 ====================

  private setupEventHandlers(): void {
    // 飞书消息事件
    this.feishuAdapter.on('message', async (message: FeishuMessage) => {
      await this.handleMessage(message);
    });

    // 飞书连接状态
    this.feishuAdapter.on('connected', () => {
      this.emit('feishu:connected');
    });

    this.feishuAdapter.on('disconnected', () => {
      this.emit('feishu:disconnected');
    });

    // 会话事件
    this.sessionManager.on('session:created', (session) => {
      logger.debug('Session created', { sessionId: session.sessionId });
    });
  }

  private async handleMessage(message: FeishuMessage): Promise<void> {
    const sessionId = message.chatType === 'p2p' ? message.sender.senderId : message.chatId;

    try {
      // 获取或创建会话
      const session = this.sessionManager.getOrCreateSession(sessionId, {
        userId: message.sender.senderId,
        channelId: message.chatId,
        channelType: message.chatType === 'p2p' ? 'private' : 'group',
      });

      // 获取用户订阅信息
      const userSubscriptions = await this.getUserSubscriptions(session.userId);

      // 理解意图
      const decision = await this.intentEngine.understandIntent(
        message,
        session,
        userSubscriptions
      );

      // 记录消息历史
      const textContent = this.extractTextFromMessage(message);
      this.sessionManager.addMessage(sessionId, {
        role: 'user',
        content: textContent,
        timestamp: Date.now(),
      });

      // 执行决策
      await this.executeDecision(decision, session, message);
    } catch (error) {
      logger.error('Failed to handle message', { messageId: message.messageId, error });
      await this.sendErrorReply(message.chatId, error);
    }
  }

  private async executeDecision(
    decision: ActionDecision,
    session: ReturnType<typeof this.sessionManager.getSession>,
    message: FeishuMessage
  ): Promise<void> {
    if (!session) return;

    const sessionId = session.sessionId;

    switch (decision.action) {
      case 'SAVE_ARTICLE':
        if (decision.url && decision.target) {
          await this.saveArticle(decision.url, decision.target, session, message);
        }
        break;

      case 'BATCH_SAVE':
        if (decision.urls && decision.target) {
          await this.batchSaveArticles(decision.urls, decision.target, session, message);
        }
        break;

      case 'REQUEST_URL':
        await this.feishuAdapter.sendTextMessage(message.chatId, decision.message || '请发送文章链接');
        break;

      case 'REQUEST_TARGET':
        await this.sendTargetSelectionCard(message.chatId, decision.url!, decision.suggestedTargets || []);
        break;

      case 'REQUEST_CONFIRMATION':
        await this.sendConfirmationCard(message.chatId, decision.url!, decision.target!, decision.message);
        break;

      case 'CLARIFY_INTENT':
        await this.feishuAdapter.sendTextMessage(
          message.chatId,
          decision.message || '请说明要保存的文章链接和目标位置'
        );
        break;

      case 'IGNORE':
        // 不处理，可能是闲聊
        break;
    }
  }

  /**
   * 公共方法：供 OpenClaw 工具快速保存文章
   * 无需 FeishuMessage，自动推断保存目标
   */
  async quickSave(
    url: string,
    context?: string,
    userId?: string
  ): Promise<{
    success: boolean;
    metadata?: RawSourceMetadata;
    error?: string;
    target?: { hospitalName: string; departmentName?: string; doctorName?: string };
  }> {
    try {
      // 1. 检查是否重复
      const dupCheck = this.rawSourceManager.checkDuplicate(url, '');
      if (dupCheck.isDuplicate) {
        return {
          success: false,
          error: '文章已存在',
          metadata: dupCheck.existingSource,
        };
      }

      // 2. 抓取文章内容
      const webContent = await convertWebToMarkdown({
        url,
        outputMode: 'content',
        usePlaywright: true,
        timeout: 60000,
      });

      if (!webContent.success) {
        return {
          success: false,
          error: `文章抓取失败：${webContent.error || '未知错误'}`,
        };
      }

      // 3. 再次检查去重（使用标题）
      const dupWithTitle = this.rawSourceManager.checkDuplicate(url, webContent.title);
      if (dupWithTitle.isDuplicate) {
        return {
          success: false,
          error: '文章已存在',
          metadata: dupWithTitle.existingSource,
        };
      }

      // 4. 推断保存目标
      const target = await this.inferTargetForTool(context, userId);
      if (!target) {
        return {
          success: false,
          error: '无法自动推断保存目标，请使用 save_article_to_target 工具并明确指定医院名称',
        };
      }

      // 5. 保存到知识库
      const metadata = this.rawSourceManager.saveRawSource({
        sourceType: CollectionSourceType.USER_SUBMITTED,
        url,
        title: webContent.title,
        content: webContent.markdown,
        hospitalName: target.hospitalName,
        departments: target.departmentName ? [target.departmentName] : undefined,
        doctors: target.doctorName ? [target.doctorName] : undefined,
        tags: ['user-submitted', 'tool', `user:${userId || 'anonymous'}`],
      });

      if (!metadata) {
        return { success: false, error: '保存失败（可能已存在）' };
      }

      // Fire-and-forget: 触发 Wiki Ingest
      if (this.wikiIngestService) {
        this.wikiIngestService
          .ingest({
            rawSourceId: metadata.id,
            title: webContent.title,
            content: webContent.markdown,
            url,
            sourceType: CollectionSourceType.USER_SUBMITTED,
            hospitalName: target.hospitalName,
            departments: target.departmentName ? [target.departmentName] : undefined,
            doctors: target.doctorName ? [target.doctorName] : undefined,
            collectedAt: metadata.collectedAt,
          })
          .catch((err) => logger.error('Wiki ingest failed', { url, error: err }));
      }

      // 触发事件
      this.emit('article:saved', {
        sessionId: `tool:${userId || 'anonymous'}`,
        userId: userId || 'anonymous',
        metadata,
        target,
      });

      return { success: true, metadata, target };
    } catch (error) {
      logger.error('Failed to quick save article', { url, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  private async inferTargetForTool(
    context?: string,
    userId?: string
  ): Promise<{ hospitalName: string; departmentName?: string; doctorName?: string } | null> {
    // 1. 从 context 中尝试提取医院名和科室名
    if (context) {
      const hospitalMatch = context.match(/([^，,。\s]{3,20}(?:医院|中心))/);
      const deptMatch = context.match(/(?:医院)?\s*([^，,。\s]{2,10}科)/);
      if (hospitalMatch) {
        return {
          hospitalName: hospitalMatch[1].trim(),
          departmentName: deptMatch ? deptMatch[1].trim() : undefined,
        };
      }
    }

    // 2. 基于用户订阅推断
    if (this.hospitalSubscription) {
      const primary = this.hospitalSubscription.getPrimaryHospital();
      if (primary) {
        return {
          hospitalName: primary.name,
          departmentName: primary.departments?.[0],
        };
      }

      const all = this.hospitalSubscription.getHospitals();
      if (all.length === 1) {
        return {
          hospitalName: all[0].name,
          departmentName: all[0].departments?.[0],
        };
      }
    }

    // 3. 基于已有资料的医院列表推断
    const hospitals = this.rawSourceManager.getAllHospitals();
    if (hospitals.length === 1) {
      return { hospitalName: hospitals[0] };
    }

    return null;
  }

  private async saveArticle(
    url: string,
    target: any,
    session: NonNullable<ReturnType<typeof this.sessionManager.getSession>>,
    message: FeishuMessage
  ): Promise<void> {
    const sessionId = session.sessionId;

    // 更新状态
    this.sessionManager.updateSessionState(sessionId, SessionState.PROCESSING);

    try {
      // 1. 检查是否重复
      const dupCheck = this.rawSourceManager.checkDuplicate(url, '');
      if (dupCheck.isDuplicate) {
        await this.sendDuplicateReply(message.chatId, dupCheck.existingSource);
        this.sessionManager.updateSessionState(sessionId, SessionState.IDLE);
        return;
      }

      // 2. 抓取文章内容
      const webContent = await convertWebToMarkdown({
        url,
        outputMode: 'content',
        usePlaywright: true,
        timeout: 60000,
      });

      if (!webContent.success) {
        await this.feishuAdapter.sendTextMessage(
          message.chatId,
          `❌ 文章抓取失败：${webContent.error || '未知错误'}\n请检查链接是否有效`
        );
        this.sessionManager.updateSessionState(sessionId, SessionState.IDLE);
        return;
      }

      // 3. 再次检查去重（使用标题）
      const dupWithTitle = this.rawSourceManager.checkDuplicate(url, webContent.title);
      if (dupWithTitle.isDuplicate) {
        await this.sendDuplicateReply(message.chatId, dupWithTitle.existingSource);
        this.sessionManager.updateSessionState(sessionId, SessionState.IDLE);
        return;
      }

      // 4. 保存到知识库
      const metadata = this.rawSourceManager.saveRawSource({
        sourceType: CollectionSourceType.USER_SUBMITTED,
        url,
        title: webContent.title,
        content: webContent.markdown,
        hospitalName: target.hospitalName,
        departments: target.departmentName ? [target.departmentName] : undefined,
        doctors: target.doctorName ? [target.doctorName] : undefined,
        tags: ['user-submitted', 'feishu', `user:${session.userId}`],
      });

      if (metadata) {
        // 记录目标使用
        this.sessionManager.recordTargetUsage(sessionId, target);

        // Fire-and-forget: 触发 Wiki Ingest
        if (this.wikiIngestService) {
          this.wikiIngestService
            .ingest({
              rawSourceId: metadata.id,
              title: webContent.title,
              content: webContent.markdown,
              url,
              sourceType: CollectionSourceType.USER_SUBMITTED,
              hospitalName: target.hospitalName,
              departments: target.departmentName ? [target.departmentName] : undefined,
              doctors: target.doctorName ? [target.doctorName] : undefined,
              collectedAt: metadata.collectedAt,
            })
            .catch((err) => logger.error('Wiki ingest failed', { url, error: err }));
        }

        // 发送成功回复
        await this.sendSuccessReply(message.chatId, {
          title: webContent.title,
          target,
          filePath: metadata.filePath,
        });

        // 更新会话状态
        this.sessionManager.updateSessionState(sessionId, SessionState.IDLE, {
          pendingUrl: undefined,
          pendingTarget: undefined,
        });

        // 触发事件
        this.emit('article:saved', {
          sessionId,
          userId: session.userId,
          metadata,
          target,
        });
      } else {
        await this.feishuAdapter.sendTextMessage(message.chatId, '❌ 保存失败，请稍后重试');
        this.sessionManager.updateSessionState(sessionId, SessionState.IDLE);
      }
    } catch (error) {
      logger.error('Failed to save article', { url, error });
      await this.feishuAdapter.sendTextMessage(
        message.chatId,
        `❌ 保存失败：${error instanceof Error ? error.message : '未知错误'}`
      );
      this.sessionManager.updateSessionState(sessionId, SessionState.IDLE);
    }
  }

  private async batchSaveArticles(
    urls: string[],
    target: any,
    session: NonNullable<ReturnType<typeof this.sessionManager.getSession>>,
    message: FeishuMessage
  ): Promise<void> {
    const sessionId = session.sessionId;

    await this.feishuAdapter.sendTextMessage(
      message.chatId,
      `📦 开始批量保存 ${urls.length} 篇文章到 ${target.hospitalName}...`
    );

    let success = 0;
    let failed = 0;
    let duplicates = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

      try {
        // 检查重复
        const dupCheck = this.rawSourceManager.checkDuplicate(url, '');
        if (dupCheck.isDuplicate) {
          duplicates++;
          continue;
        }

        // 抓取内容
        const webContent = await convertWebToMarkdown({
          url,
          outputMode: 'content',
          usePlaywright: true,
          timeout: 60000,
        });

        if (!webContent.success) {
          failed++;
          continue;
        }

        // 保存
        const metadata = this.rawSourceManager.saveRawSource({
          sourceType: CollectionSourceType.USER_SUBMITTED,
          url,
          title: webContent.title,
          content: webContent.markdown,
          hospitalName: target.hospitalName,
          departments: target.departmentName ? [target.departmentName] : undefined,
          doctors: target.doctorName ? [target.doctorName] : undefined,
          tags: ['user-submitted', 'feishu', `user:${session.userId}`, 'batch'],
        });

        if (metadata) {
          success++;
        } else {
          failed++;
        }

        // 延迟避免过快
        if (i < urls.length - 1) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch {
        failed++;
      }
    }

    // 发送结果
    await this.feishuAdapter.sendTextMessage(
      message.chatId,
      `✅ 批量保存完成\n成功: ${success}  重复: ${duplicates}  失败: ${failed}`
    );

    this.sessionManager.recordTargetUsage(sessionId, target);
    this.sessionManager.updateSessionState(sessionId, SessionState.IDLE);
  }

  private async getUserSubscriptions(userId: string): Promise<{
    hospitals: string[];
    departments: string[];
    doctors: string[];
  }> {
    const hospitals = this.hospitalSubscription
      ? this.hospitalSubscription.getAll().map(h => h.name)
      : this.rawSourceManager.getAllHospitals().slice(0, 10);

    const doctors = this.doctorSubscription
      ? this.doctorSubscription.getDoctors().map(d => `${d.hospital}_${d.name}`)
      : [];

    const departments: string[] = [];
    if (this.hospitalSubscription) {
      for (const hospital of this.hospitalSubscription.getAll()) {
        for (const dept of hospital.departments || []) {
          departments.push(`${hospital.name}_${dept}`);
        }
      }
    }

    return { hospitals, departments, doctors };
  }

  private extractTextFromMessage(message: FeishuMessage): string {
    try {
      const content = JSON.parse(message.content);
      return content.text || '';
    } catch {
      return message.content || '';
    }
  }

  private async sendSuccessReply(
    chatId: string,
    data: { title: string; target: any; filePath: string }
  ): Promise<void> {
    const text = `✅ 文章已保存\n📰 ${data.title}\n🏥 ${data.target.hospitalName}${
      data.target.departmentName ? ' · ' + data.target.departmentName : ''
    }`;

    await this.feishuAdapter.sendTextMessage(chatId, text);
  }

  private async sendDuplicateReply(chatId: string, existingSource: any): Promise<void> {
    const text = `⚠️ 这篇文章已经保存过了\n📰 ${existingSource.title}\n💾 ${new Date(
      existingSource.collectedAt
    ).toLocaleString('zh-CN')}`;

    await this.feishuAdapter.sendTextMessage(chatId, text);
  }

  private async sendErrorReply(chatId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : '处理失败';
    await this.feishuAdapter.sendTextMessage(chatId, `❌ ${message}`);
  }

  private async sendTargetSelectionCard(
    chatId: string,
    url: string,
    suggestedTargets: any[]
  ): Promise<void> {
    const options = suggestedTargets
      .map(
        (t, i) =>
          `**${i + 1}.** ${t.hospitalName}${t.departmentName ? ' · ' + t.departmentName : ''}`
      )
      .join('\n');

    const card = {
      header: {
        title: {
          tag: 'plain_text',
          content: '📄 选择保存位置',
        },
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `检测到文章链接，请选择一个保存位置：\n\n${options}\n\n回复数字（1-${suggestedTargets.length}）或发送具体名称`,
          },
        },
      ],
    };

    await this.feishuAdapter.sendCardMessage(chatId, card);
  }

  private async sendConfirmationCard(
    chatId: string,
    url: string,
    target: any,
    message?: string
  ): Promise<void> {
    const card = {
      header: {
        title: {
          tag: 'plain_text',
          content: '💡 请确认',
        },
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content:
              message ||
              `推断您想保存到「${target.hospitalName}${
                target.departmentName ? ' · ' + target.departmentName : ''
              }」\n\n回复"是"确认，或告诉我正确的目标`,
          },
        },
      ],
    };

    await this.feishuAdapter.sendCardMessage(chatId, card);
  }
}
