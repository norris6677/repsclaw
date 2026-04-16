/**
 * Scheduled Task Service
 * 定时任务调度服务 - 使用 node-cron 实现每日增量更新
 */

import * as cron from 'node-cron';
import type {
  IncrementalConfig,
  DEFAULT_INCREMENTAL_CONFIG,
} from '../../types/knowledge-collection.types';
import { KnowledgeCollectionService } from './knowledge-collection.service';
import { RawSourceManager } from './raw-source.manager';
import { createLogger } from '../../utils/plugin-logger';

const logger = createLogger('REPSCLAW:SCHEDULER');

/**
 * 定时任务服务
 */
export class ScheduledTaskService {
  private collectionService: KnowledgeCollectionService;
  private rawSourceManager: RawSourceManager;
  private config: IncrementalConfig;
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private isRunning: boolean = false;

  constructor(
    collectionService: KnowledgeCollectionService,
    rawSourceManager: RawSourceManager,
    config: IncrementalConfig = DEFAULT_INCREMENTAL_CONFIG
  ) {
    this.collectionService = collectionService;
    this.rawSourceManager = rawSourceManager;
    this.config = config;
  }

  /**
   * 启动定时任务服务
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('ScheduledTaskService is already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('ScheduledTaskService is disabled');
      return;
    }

    // 验证 cron 表达式
    if (!cron.validate(this.config.schedule)) {
      logger.error('Invalid cron schedule expression', {
        schedule: this.config.schedule,
      });
      return;
    }

    // 创建每日增量采集任务
    const dailyTask = cron.schedule(
      this.config.schedule,
      () => this.runDailyIncrementalCollection(),
      {
        scheduled: true,
        timezone: 'Asia/Shanghai',
      }
    );

    this.tasks.set('daily-incremental', dailyTask);
    this.isRunning = true;

    logger.info('ScheduledTaskService started', {
      schedule: this.config.schedule,
      days: this.config.days,
      sourceTypes: this.config.sourceTypes,
    });
  }

  /**
   * 停止定时任务服务
   */
  stop(): void {
    for (const [name, task] of this.tasks) {
      task.stop();
      logger.info(`Stopped scheduled task: ${name}`);
    }

    this.tasks.clear();
    this.isRunning = false;

    logger.info('ScheduledTaskService stopped');
  }

  /**
   * 执行每日增量采集
   */
  private async runDailyIncrementalCollection(): Promise<void> {
    const startTime = new Date();
    logger.info('Starting daily incremental collection', {
      startTime: startTime.toISOString(),
    });

    try {
      // 获取所有已订阅的医院
      const hospitals = this.rawSourceManager.getAllHospitals();

      if (hospitals.length === 0) {
        logger.info('No hospitals subscribed, skipping daily collection');
        return;
      }

      logger.info(`Found ${hospitals.length} hospitals to collect`, {
        hospitals,
      });

      // 依次执行增量采集（避免并发过高）
      const results = [];
      for (const hospitalName of hospitals) {
        try {
          const job = await this.collectionService.startIncrementalCollection(
            hospitalName,
            this.config.days
          );

          results.push({
            hospital: hospitalName,
            jobId: job.id,
            status: job.status,
          });

          logger.info(`Started incremental collection for ${hospitalName}`, {
            jobId: job.id,
          });

          // 添加延迟避免同时启动过多任务
          await this.delay(5000);
        } catch (error) {
          logger.error(
            `Failed to start collection for ${hospitalName}`,
            error
          );
        }
      }

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      logger.info('Daily incremental collection initiated', {
        hospitalCount: hospitals.length,
        jobCount: results.length,
        duration: `${duration}ms`,
        results,
      });
    } catch (error) {
      logger.error('Daily incremental collection failed', error);
    }
  }

  /**
   * 手动触发采集（用于测试或即时需求）
   */
  async triggerManualCollection(
    hospitalName?: string,
    days?: number
  ): Promise<void> {
    if (hospitalName) {
      // 单个医院采集
      const job = await this.collectionService.startIncrementalCollection(
        hospitalName,
        days || this.config.days
      );
      logger.info(`Manual collection triggered for ${hospitalName}`, {
        jobId: job.id,
      });
    } else {
      // 全部医院采集
      await this.runDailyIncrementalCollection();
    }
  }

  /**
   * 获取调度器状态
   */
  getStatus(): {
    isRunning: boolean;
    taskCount: number;
    config: IncrementalConfig;
    nextRuns: Record<string, string | null>;
  } {
    const nextRuns: Record<string, string | null> = {};

    for (const [name, task] of this.tasks) {
      // node-cron 不直接提供下次运行时间，这里简化处理
      nextRuns[name] = null;
    }

    return {
      isRunning: this.isRunning,
      taskCount: this.tasks.size,
      config: this.config,
      nextRuns,
    };
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<IncrementalConfig>): void {
    const wasRunning = this.isRunning;

    // 停止现有任务
    if (wasRunning) {
      this.stop();
    }

    // 更新配置
    this.config = {
      ...this.config,
      ...newConfig,
    };

    // 重新启动
    if (wasRunning && this.config.enabled) {
      this.start();
    }

    logger.info('ScheduledTaskService config updated', { config: this.config });
  }

  /**
   * 延迟工具
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取活跃任务统计
   */
  getActiveJobStats(): {
    totalJobs: number;
    runningJobs: number;
    completedJobs: number;
    failedJobs: number;
  } {
    const allJobs = this.collectionService.getAllJobs();

    return {
      totalJobs: allJobs.length,
      runningJobs: allJobs.filter((j) => j.status === 'running').length,
      completedJobs: allJobs.filter((j) => j.status === 'completed').length,
      failedJobs: allJobs.filter((j) => j.status === 'failed').length,
    };
  }
}
