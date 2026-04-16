/**
 * Session Manager
 * 纯本地高可用会话管理器
 *
 * 特性：
 * - 内存存储活跃会话
 * - 异步文件持久化（Checkpoint机制）
 * - 启动时自动恢复
 * - TTL自动清理
 * - 优雅关闭持久化
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import type {
  SessionContext,
  SessionState,
  SaveTarget,
  MessageHistoryItem,
  UserEntityLibrary,
} from './types';
import { createLogger } from '../../utils/plugin-logger';
import { BASE_DATA_DIR } from '../../config/data-paths.config';

const logger = createLogger('REPSCLAW:SESSION');

interface SessionManagerOptions {
  sessionTTL?: number;        // 会话过期时间（毫秒），默认5分钟
  checkpointInterval?: number; // 持久化间隔（毫秒），默认30秒
  maxSessions?: number;        // 最大会话数，默认1000
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, SessionContext> = new Map();
  private sessionsDir: string;
  private checkpointTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private options: Required<SessionManagerOptions>;
  private isShuttingDown = false;

  constructor(options: SessionManagerOptions = {}) {
    super();
    this.options = {
      sessionTTL: options.sessionTTL ?? 5 * 60 * 1000,      // 5分钟
      checkpointInterval: options.checkpointInterval ?? 30000, // 30秒
      maxSessions: options.maxSessions ?? 1000,
    };

    this.sessionsDir = path.join(BASE_DATA_DIR, 'sessions', 'active');
    this.ensureDirectories();
    this.loadSessionsFromDisk();
    this.startCheckpointTimer();
    this.startCleanupTimer();

    // 优雅关闭处理
    this.setupGracefulShutdown();

    logger.info('SessionManager initialized', this.options);
  }

  /**
   * 获取或创建会话
   */
  getOrCreateSession(
    sessionId: string,
    userInfo: { userId: string; userName?: string; channelId: string; channelType: 'private' | 'group' }
  ): SessionContext {
    let session = this.sessions.get(sessionId);

    if (session) {
      // 更新活动时间
      session.lastActivityAt = Date.now();
      return session;
    }

    // 检查是否达到最大会话数
    if (this.sessions.size >= this.options.maxSessions) {
      this.evictOldestSession();
    }

    // 创建新会话
    session = this.createNewSession(sessionId, userInfo);
    this.sessions.set(sessionId, session);

    logger.info('Created new session', { sessionId, userId: userInfo.userId });
    this.emit('session:created', session);

    return session;
  }

  /**
   * 获取会话（不存在则返回null）
   */
  getSession(sessionId: string): SessionContext | null {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = Date.now();
      return session;
    }
    return null;
  }

  /**
   * 更新会话状态
   */
  updateSessionState(sessionId: string, state: SessionState, extra?: Partial<SessionContext>): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.state = state;
    session.lastActivityAt = Date.now();

    if (extra) {
      Object.assign(session, extra);
    }

    // 立即持久化重要状态变更
    if (state === 'processing' || state === 'idle') {
      this.persistSession(session);
    }

    this.emit('session:updated', session);
    return true;
  }

  /**
   * 添加消息到历史
   */
  addMessage(sessionId: string, message: MessageHistoryItem): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.messageHistory.push(message);
    session.lastActivityAt = Date.now();

    // 只保留最近10条消息
    if (session.messageHistory.length > 10) {
      session.messageHistory = session.messageHistory.slice(-10);
    }

    // 更新用户实体库
    if (message.extractedEntities) {
      this.updateUserEntityLibrary(session, message.extractedEntities);
    }

    return true;
  }

  /**
   * 记录最近使用的目标
   */
  recordTargetUsage(sessionId: string, target: SaveTarget): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const recentTarget = {
      type: target.type,
      name: target.departmentName || target.doctorName || target.hospitalName,
      hospitalName: target.hospitalName,
      usedAt: new Date().toISOString(),
    };

    // 去重并放到最前面
    session.recentTargets = session.recentTargets.filter(
      rt => !(rt.type === recentTarget.type && rt.name === recentTarget.name && rt.hospitalName === recentTarget.hospitalName)
    );
    session.recentTargets.unshift(recentTarget);

    // 只保留最近5个
    if (session.recentTargets.length > 5) {
      session.recentTargets = session.recentTargets.slice(0, 5);
    }

    session.lastActivityAt = Date.now();
    return true;
  }

  /**
   * 获取所有活跃会话
   */
  getAllSessions(): SessionContext[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 获取会话统计
   */
  getStats(): { total: number; byState: Record<string, number> } {
    const byState: Record<string, number> = {};
    for (const session of this.sessions.values()) {
      byState[session.state] = (byState[session.state] || 0) + 1;
    }
    return { total: this.sessions.size, byState };
  }

  /**
   * 关闭会话管理器
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('SessionManager shutting down...');

    // 停止定时器
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // 强制持久化所有会话
    await this.checkpointAll();

    this.sessions.clear();
    logger.info('SessionManager shutdown complete');
  }

  // ==================== 私有方法 ====================

  private createNewSession(
    sessionId: string,
    userInfo: { userId: string; userName?: string; channelId: string; channelType: 'private' | 'group' }
  ): SessionContext {
    return {
      sessionId,
      state: 'idle',
      userId: userInfo.userId,
      userName: userInfo.userName,
      channelId: userInfo.channelId,
      channelType: userInfo.channelType,
      messageHistory: [],
      userEntityLibrary: {
        hospitals: [],
        departments: [],
        doctors: [],
        customers: [],
        lastUpdated: Date.now(),
      },
      recentTargets: [],
      urlQueue: [],
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
  }

  private updateUserEntityLibrary(session: SessionContext, entities: { hospitals?: string[]; departments?: string[]; doctors?: string[] }): void {
    const lib = session.userEntityLibrary;

    if (entities.hospitals) {
      lib.hospitals = [...new Set([...lib.hospitals, ...entities.hospitals])].slice(0, 20);
    }
    if (entities.departments) {
      lib.departments = [...new Set([...lib.departments, ...entities.departments])].slice(0, 20);
    }
    if (entities.doctors) {
      lib.doctors = [...new Set([...lib.doctors, ...entities.doctors])].slice(0, 20);
    }

    lib.lastUpdated = Date.now();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  private loadSessionsFromDisk(): void {
    try {
      if (!fs.existsSync(this.sessionsDir)) return;

      const files = fs.readdirSync(this.sessionsDir).filter(f => f.endsWith('.json'));
      let loadedCount = 0;

      for (const file of files) {
        try {
          const filePath = path.join(this.sessionsDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const session: SessionContext = JSON.parse(content);

          // 检查是否过期
          const age = Date.now() - session.lastActivityAt;
          if (age < this.options.sessionTTL) {
            this.sessions.set(session.sessionId, session);
            loadedCount++;
          } else {
            // 删除过期文件
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          logger.warn('Failed to load session file', { file, error: e });
        }
      }

      logger.info('Loaded sessions from disk', { count: loadedCount });
    } catch (e) {
      logger.error('Failed to load sessions from disk', e);
    }
  }

  private persistSession(session: SessionContext): void {
    try {
      const filePath = path.join(this.sessionsDir, `${session.sessionId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
    } catch (e) {
      logger.error('Failed to persist session', { sessionId: session.sessionId, error: e });
    }
  }

  private async checkpointAll(): Promise<void> {
    logger.info('Checkpointing all sessions...', { count: this.sessions.size });

    for (const session of this.sessions.values()) {
      this.persistSession(session);
    }
  }

  private startCheckpointTimer(): void {
    this.checkpointTimer = setInterval(() => {
      this.checkpointAll().catch(e => logger.error('Checkpoint error', e));
    }, this.options.checkpointInterval);
  }

  private startCleanupTimer(): void {
    // 每分钟清理一次过期会话
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000);
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivityAt > this.options.sessionTTL) {
        // 归档并删除
        this.archiveSession(session);
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up expired sessions', { count: cleanedCount });
    }
  }

  private archiveSession(session: SessionContext): void {
    try {
      const archiveDir = path.join(BASE_DATA_DIR, 'sessions', 'archive', new Date().toISOString().split('T')[0]);
      if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
      }

      const filePath = path.join(archiveDir, `${session.sessionId}_${Date.now()}.json`);
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');

      // 删除活跃会话文件
      const activePath = path.join(this.sessionsDir, `${session.sessionId}.json`);
      if (fs.existsSync(activePath)) {
        fs.unlinkSync(activePath);
      }
    } catch (e) {
      logger.error('Failed to archive session', { sessionId: session.sessionId, error: e });
    }
  }

  private evictOldestSession(): void {
    let oldestSession: SessionContext | null = null;
    let oldestTime = Infinity;

    for (const session of this.sessions.values()) {
      if (session.lastActivityAt < oldestTime) {
        oldestTime = session.lastActivityAt;
        oldestSession = session;
      }
    }

    if (oldestSession) {
      this.archiveSession(oldestSession);
      this.sessions.delete(oldestSession.sessionId);
      logger.info('Evicted oldest session', { sessionId: oldestSession.sessionId });
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}
