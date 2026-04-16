/**
 * Collection Progress Service
 * 采集进度追踪服务 - 支持SSE实时推送和断线重连
 *
 * 核心功能：
 * 1. 管理任务进度状态和事件历史
 * 2. 支持SSE客户端订阅和广播
 * 3. 断线重连时回放历史事件
 * 4. 事件持久化（内存中保留最近任务）
 */

import { EventEmitter } from 'events';
import type { Response } from 'express';
import { createLogger } from '../../utils/plugin-logger';
import type {
  CollectionProgressEvent,
  EventHistoryRecord,
  JobProgressState,
  SSEConnection,
  DataSourceSummaryEventData,
  CollectionSourceType,
  RawSourceMetadata,
} from '../../types/collection-progress.types';

const logger = createLogger('REPSCLAW:COLLECTION:PROGRESS');

/**
 * 采集进度服务
 */
export class CollectionProgressService extends EventEmitter {
  // 任务状态映射
  private jobs: Map<string, JobProgressState> = new Map();

  // SSE连接映射
  private connections: Map<string, SSEConnection> = new Map();

  // 全局事件计数器（用于生成唯一eventId）
  private globalEventCounter = 0;

  // 配置
  private maxHistoryPerJob = 1000; // 每个任务最多保留1000条事件
  private maxActiveJobs = 50; // 最多保留50个活跃任务

  constructor() {
    super();
    logger.info('CollectionProgressService initialized');
  }

  /**
   * 初始化新任务的进度追踪
   */
  initializeJob(
    jobId: string,
    hospitalName: string,
    sourceTypes: CollectionSourceType[],
    targetType?: string,
    targetName?: string
  ): void {
    const now = new Date().toISOString();

    // 清理旧任务（如果超过限制）
    this.cleanupOldJobs();

    const jobState: JobProgressState = {
      jobId,
      status: 'running',
      startedAt: now,
      events: [],
      lastEventId: 0,
      summaryGenerated: new Set(),
    };

    this.jobs.set(jobId, jobState);

    // 发送开始事件
    this.publishEvent(jobId, {
      type: 'started',
      jobId,
      timestamp: now,
      data: {
        hospitalName,
        targetType,
        targetName,
        sourceTypes,
        estimatedDuration: this.estimateDuration(sourceTypes),
      },
    });

    logger.info('Job progress tracking initialized', {
      jobId,
      hospitalName,
      targetType,
      targetName,
    });
  }

  /**
   * 发布进度事件
   */
  publishProgress(
    jobId: string,
    total: number,
    completed: number,
    failed: number,
    duplicates: number,
    currentSource?: CollectionSourceType
  ): void {
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    this.publishEvent(jobId, {
      type: 'progress',
      jobId,
      timestamp: new Date().toISOString(),
      data: {
        total,
        completed,
        failed,
        duplicates,
        currentSource,
        percent,
      },
    });
  }

  /**
   * 发布数据源完成事件
   */
  publishSourceComplete(
    jobId: string,
    sourceType: CollectionSourceType,
    itemCount: number,
    duration: number
  ): void {
    this.publishEvent(jobId, {
      type: 'source_complete',
      jobId,
      timestamp: new Date().toISOString(),
      data: {
        sourceType,
        itemCount,
        duration,
      },
    });

    logger.debug('Source completed', {
      jobId,
      sourceType,
      itemCount,
      duration,
    });
  }

  /**
   * 发布数据源摘要事件
   */
  publishSummary(jobId: string, summary: DataSourceSummaryEventData): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.summaryGenerated.add(summary.sourceType);
    }

    this.publishEvent(jobId, {
      type: 'summary',
      jobId,
      timestamp: new Date().toISOString(),
      data: summary,
    });

    logger.debug('Summary published', {
      jobId,
      sourceType: summary.sourceType,
      count: summary.count,
    });
  }

  /**
   * 发布任务完成事件
   */
  publishCompleted(jobId: string, totalItems: number, totalDuration: number): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
    }

    // 收集所有已生成的摘要
    const sourceSummaries: DataSourceSummaryEventData[] = [];
    if (job) {
      for (const event of job.events) {
        if (event.event.type === 'summary') {
          sourceSummaries.push(event.event.data as DataSourceSummaryEventData);
        }
      }
    }

    this.publishEvent(jobId, {
      type: 'completed',
      jobId,
      timestamp: new Date().toISOString(),
      data: {
        totalItems,
        totalDuration,
        sourceSummaries,
      },
    });

    logger.info('Job completed', {
      jobId,
      totalItems,
      totalDuration,
    });
  }

  /**
   * 发布 Agent 开始事件
   */
  publishAgentStarted(
    jobId: string,
    agentId: string,
    sourceType: CollectionSourceType,
    payload: { queryCount: number; maxResults: number }
  ): void {
    this.publishEvent(jobId, {
      type: 'agent_started',
      jobId,
      timestamp: new Date().toISOString(),
      data: { agentId, sourceType, ...payload },
    });
  }

  /**
   * 发布 Agent 进度事件
   */
  publishAgentProgress(
    jobId: string,
    agentId: string,
    sourceType: CollectionSourceType,
    payload: { completed: number; failed: number; duplicates: number; currentQuery?: string }
  ): void {
    this.publishEvent(jobId, {
      type: 'agent_progress',
      jobId,
      timestamp: new Date().toISOString(),
      data: { agentId, sourceType, ...payload },
    });
  }

  /**
   * 发布 Agent 完成事件
   */
  publishAgentComplete(
    jobId: string,
    agentId: string,
    sourceType: CollectionSourceType,
    itemCount: number,
    duration: number
  ): void {
    this.publishEvent(jobId, {
      type: 'agent_complete',
      jobId,
      timestamp: new Date().toISOString(),
      data: { agentId, sourceType, itemCount, duration },
    });
  }

  /**
   * 发布错误事件
   */
  publishError(jobId: string, source: string, message: string, fatal: boolean = false): void {
    this.publishEvent(jobId, {
      type: 'error',
      jobId,
      timestamp: new Date().toISOString(),
      data: {
        source,
        message,
        fatal,
      },
    });

    if (fatal) {
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.completedAt = new Date().toISOString();
      }
    }

    logger.error('Job error', {
      jobId,
      source,
      message,
      fatal,
    });
  }

  /**
   * 订阅SSE流（支持断线重连）
   * @param jobId 任务ID
   * @param res Express Response对象
   * @param lastEventId 客户端最后收到的事件ID（用于断线重连）
   */
  subscribeSSE(jobId: string, res: Response, lastEventId?: number): void {
    const connectionId = `${jobId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 设置SSE响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // 禁用Nginx缓冲
    });

    // 发送初始连接确认
    res.write(`: connected\n\n`);

    const connection: SSEConnection = {
      id: connectionId,
      jobId,
      lastEventId: lastEventId || 0,
      res: res as unknown as NodeJS.WritableStream,
      connectedAt: new Date().toISOString(),
    };

    this.connections.set(connectionId, connection);

    // 如果有lastEventId，发送历史事件
    if (lastEventId && lastEventId > 0) {
      this.replayHistory(jobId, res, lastEventId);
    }

    // 清理断开连接
    res.on('close', () => {
      this.connections.delete(connectionId);
      logger.debug('SSE connection closed', { connectionId, jobId });
    });

    res.on('error', (err) => {
      this.connections.delete(connectionId);
      logger.error('SSE connection error', { connectionId, jobId, error: err });
    });

    logger.info('SSE subscription started', {
      connectionId,
      jobId,
      lastEventId,
    });
  }

  /**
   * 获取任务当前状态
   */
  getJobState(jobId: string): JobProgressState | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * 获取所有活跃任务
   */
  getActiveJobs(): JobProgressState[] {
    return Array.from(this.jobs.values())
      .filter((job) => job.status === 'running')
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  /**
   * 发布事件到历史记录和所有订阅者
   */
  private publishEvent(jobId: string, event: CollectionProgressEvent): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      logger.warn('Attempted to publish event for unknown job', { jobId });
      return;
    }

    // 生成事件ID
    this.globalEventCounter++;
    const eventId = this.globalEventCounter;
    job.lastEventId = eventId;

    // 记录到历史
    const record: EventHistoryRecord = {
      eventId,
      timestamp: event.timestamp,
      event,
    };
    job.events.push(record);

    // 限制历史大小
    if (job.events.length > this.maxHistoryPerJob) {
      job.events = job.events.slice(-this.maxHistoryPerJob);
    }

    // 广播到所有订阅者
    this.broadcastToSubscribers(jobId, eventId, event);

    // 触发全局事件
    this.emit('progress', event);
  }

  /**
   * 广播事件到所有订阅者
   */
  private broadcastToSubscribers(jobId: string, eventId: number, event: CollectionProgressEvent): void {
    const message = this.formatSSEMessage(eventId, event);

    for (const connection of this.connections.values()) {
      if (connection.jobId === jobId) {
        try {
          connection.res.write(message);
          connection.lastEventId = eventId;
        } catch (err) {
          logger.error('Failed to send SSE message', {
            connectionId: connection.id,
            jobId,
            error: err,
          });
        }
      }
    }
  }

  /**
   * 格式化SSE消息
   */
  private formatSSEMessage(eventId: number, event: CollectionProgressEvent): string {
    const lines: string[] = [];

    // 事件ID（用于断线重连）
    lines.push(`id: ${eventId}`);

    // 事件类型
    lines.push(`event: ${event.type}`);

    // 数据（JSON格式，多行用\n分隔）
    const data = JSON.stringify(event.data);
    for (const line of data.split('\n')) {
      lines.push(`data: ${line}`);
    }

    // 空行表示消息结束
    lines.push('');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 回放历史事件
   */
  private replayHistory(jobId: string, res: Response, lastEventId: number): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    // 找到需要回放的事件
    const eventsToReplay = job.events.filter((record) => record.eventId > lastEventId);

    if (eventsToReplay.length === 0) {
      return;
    }

    logger.info('Replaying history events', {
      jobId,
      count: eventsToReplay.length,
      fromEventId: lastEventId,
    });

    // 发送回放标记
    res.write(`: replaying ${eventsToReplay.length} events\n\n`);

    // 回放事件
    for (const record of eventsToReplay) {
      const message = this.formatSSEMessage(record.eventId, record.event);
      res.write(message);
    }

    // 发送回放完成标记
    res.write(`: replay completed\n\n`);
  }

  /**
   * 清理旧任务
   */
  private cleanupOldJobs(): void {
    if (this.jobs.size < this.maxActiveJobs) {
      return;
    }

    // 获取已完成的任务
    const completedJobs = Array.from(this.jobs.values())
      .filter((job) => job.status === 'completed' || job.status === 'failed')
      .sort((a, b) => new Date(a.completedAt || a.startedAt).getTime() - new Date(b.completedAt || b.startedAt).getTime());

    // 删除最旧的已完成任务
    const toDelete = completedJobs.slice(0, this.jobs.size - this.maxActiveJobs + 1);
    for (const job of toDelete) {
      this.jobs.delete(job.jobId);
      logger.debug('Cleaned up old job', { jobId: job.jobId });
    }
  }

  /**
   * 估算采集耗时
   */
  private estimateDuration(sourceTypes: CollectionSourceType[]): number {
    // 每个数据源约3-5分钟
    const minutesPerSource = 4;
    return sourceTypes.length * minutesPerSource;
  }
}

// 导出单例
export const collectionProgressService = new CollectionProgressService();
