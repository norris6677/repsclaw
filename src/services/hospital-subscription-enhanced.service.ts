/**
 * Enhanced Hospital Subscription Service
 * 增强版医院订阅服务 - 集成知识采集功能
 *
 * 在首次订阅医院时，自动启动知识采集任务
 * 将原始资料存入 Layer 1: Raw Sources
 */

import { HospitalSubscriptionService } from './hospital-subscription.service';
import type { KnowledgeCollectionService } from './knowledge-collection/knowledge-collection.service';
import { createLogger } from '../utils/plugin-logger';

const logger = createLogger('REPSCLAW:SUBSCRIPTION-ENHANCED');

/**
 * 增强版订阅服务
 */
export class EnhancedHospitalSubscriptionService extends HospitalSubscriptionService {
  private collectionService: KnowledgeCollectionService;

  constructor(
    subscriptionDB?: any,
    collectionService: KnowledgeCollectionService
  ) {
    super(subscriptionDB);
    this.collectionService = collectionService;
  }

  /**
   * 订阅医院（增强版 - 自动触发采集）
   */
  subscribe(name: string, isPrimary: boolean = false): ReturnType<HospitalSubscriptionService['subscribe']> {
    const isNewSubscription = !this.isSubscribed(name);

    // 调用父类的订阅方法
    const result = super.subscribe(name, isPrimary);

    // 如果是新订阅，自动启动首次采集
    if (isNewSubscription && this.collectionService) {
      logger.info('New hospital subscription detected, triggering bootstrap collection', {
        hospital: name,
      });

      // 异步启动采集（不阻塞订阅响应）
      this.triggerBootstrapCollection(name).catch((error) => {
        logger.error('Failed to trigger bootstrap collection', {
          hospital: name,
          error,
        });
      });
    }

    return result;
  }

  /**
   * 触发首次全量采集
   */
  private async triggerBootstrapCollection(hospitalName: string): Promise<void> {
    try {
      // 等待一小段时间确保订阅已持久化
      await this.delay(1000);

      // 检查是否已有正在运行的采集任务
      const activeJobs = this.collectionService.getActiveJobs();
      const existingJob = activeJobs.find(
        (j) => j.config.hospitalName === hospitalName && j.config.isBootstrap
      );

      if (existingJob) {
        logger.info('Bootstrap collection already in progress', {
          hospital: hospitalName,
          jobId: existingJob.id,
        });
        return;
      }

      // 启动全量采集
      const job = await this.collectionService.startBootstrapCollection(hospitalName);

      logger.info('Bootstrap collection started for new subscription', {
        hospital: hospitalName,
        jobId: job.id,
      });
    } catch (error) {
      logger.error('Error triggering bootstrap collection', {
        hospital: hospitalName,
        error,
      });
      throw error;
    }
  }

  /**
   * 延迟工具
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 手动触发医院知识采集
   */
  async triggerCollection(
    hospitalName: string,
    options: { isBootstrap?: boolean; days?: number } = {}
  ): Promise<{ jobId: string; status: string }> {
    const { isBootstrap = false, days = 7 } = options;

    // 解析医院名称
    const resolved = this.resolveHospitalName(hospitalName);
    const targetName = resolved?.name || hospitalName;

    // 检查是否已订阅
    if (!this.isSubscribed(targetName)) {
      throw new Error(`Hospital "${targetName}" is not subscribed. Please subscribe first.`);
    }

    let job;
    if (isBootstrap) {
      job = await this.collectionService.startBootstrapCollection(targetName);
    } else {
      job = await this.collectionService.startIncrementalCollection(targetName, days);
    }

    return {
      jobId: job.id,
      status: job.status,
    };
  }

  /**
   * 获取医院的采集状态
   */
  getHospitalCollectionStatus(hospitalName: string) {
    const resolved = this.resolveHospitalName(hospitalName);
    const targetName = resolved?.name || hospitalName;

    if (!this.isSubscribed(targetName)) {
      return null;
    }

    return this.collectionService.getHospitalCollectionStatus(targetName);
  }
}
