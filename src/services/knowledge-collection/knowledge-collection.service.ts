/**
 * Knowledge Collection Service
 * 知识采集服务 - 核心采集逻辑与反爬策略
 */

import { Worker } from 'worker_threads';
import * as path from 'path';
import {
  CollectionJobStatus,
  CollectionSourceType,
  CollectionTargetType,
  DEFAULT_COLLECTION_STRATEGY,
} from '../../types/knowledge-collection.types';
import type {
  CollectionJob,
  CollectionJobConfig,
  CollectionStats,
  CollectionStrategy,
  RawSourceMetadata,
  HospitalCollectionStatus,
} from '../../types/knowledge-collection.types';
import { RawSourceManager } from './raw-source.manager';
import { SOURCES_DIR } from '../../config/data-paths.config';
import { createLogger } from '../../utils/plugin-logger';
import { v4 as uuidv4 } from 'uuid';
import type { CollectionProgressService } from './collection-progress.service';
import { dataSourceSummarizer } from './datasource-summarizer.service';
import type { WikiIngestService } from '../wiki/wiki-ingest.service';
import { AgentStrategyService } from './agent-strategy.service';

const logger = createLogger('REPSCLAW:COLLECTION');

/**
 * 知识采集服务
 */
export class KnowledgeCollectionService {
  private jobs: Map<string, CollectionJob> = new Map();
  private rawSourceManager: RawSourceManager;
  private activeWorkers: Map<string, Worker> = new Map();
  private strategy: CollectionStrategy;
  private progressService?: CollectionProgressService;
  private wikiIngestService?: WikiIngestService;
  private agentStrategyService?: AgentStrategyService;

  // 临时存储数据源结果（用于生成摘要）
  private sourceResults: Map<string, Map<CollectionSourceType, RawSourceMetadata[]>> = new Map();

  constructor(
    rawSourceManager: RawSourceManager,
    strategy: CollectionStrategy = DEFAULT_COLLECTION_STRATEGY,
    progressService?: CollectionProgressService
  ) {
    this.rawSourceManager = rawSourceManager;
    this.strategy = strategy;
    this.progressService = progressService;
    logger.info('KnowledgeCollectionService initialized', {
      progressTrackingEnabled: !!progressService,
    });
  }

  /**
   * 设置进度服务（用于延迟注入）
   */
  setProgressService(service: CollectionProgressService): void {
    this.progressService = service;
    logger.info('Progress service injected into KnowledgeCollectionService');
  }

  /**
   * 设置 Wiki Ingest 服务（用于延迟注入）
   */
  setWikiIngestService(service: WikiIngestService): void {
    this.wikiIngestService = service;
    logger.info('Wiki ingest service injected into KnowledgeCollectionService');
  }

  /**
   * 设置 Agent 策略服务（用于延迟注入）
   */
  setAgentStrategyService(service: AgentStrategyService): void {
    this.agentStrategyService = service;
    logger.info('Agent strategy service injected into KnowledgeCollectionService');
  }

  /**
   * 启动 LLM 驱动的 Agent 采集
   */
  async startAgentCollection(params: {
    hospitalName: string;
    departmentName?: string;
    doctorName?: string;
    days?: number;
  }): Promise<CollectionJob> {
    const { hospitalName, departmentName, doctorName, days = 7 } = params;

    // 1. 生成 LLM 搜索策略
    let customQueries: string[] | undefined;
    let strategyOverrides: Partial<CollectionStrategy> | undefined;

    if (this.agentStrategyService) {
      try {
        const strategy = await this.agentStrategyService.generateSearchStrategy({
          hospitalName,
          departmentName,
          doctorName,
          days,
        });
        customQueries = strategy.queries;
        strategyOverrides = this.agentStrategyService.strategyFromAdvice(strategy.antiCrawlAdvice);
        logger.info('Agent strategy generated', {
          hospitalName,
          queryCount: customQueries.length,
        });
      } catch (error) {
        logger.error('Failed to generate agent strategy, falling back', { error });
      }
    }

    // 2. 创建 Job
    const targetType = doctorName
      ? CollectionTargetType.DOCTOR
      : departmentName
        ? CollectionTargetType.DEPARTMENT
        : CollectionTargetType.HOSPITAL;

    const job = this.createJob({
      hospitalName,
      targetType,
      targetName: doctorName || departmentName,
      isBootstrap: false,
      days,
      maxResults: 200,
      sourceTypes: [
        CollectionSourceType.HOSPITAL_OFFICIAL,
        CollectionSourceType.BAIDU_SEARCH,
        CollectionSourceType.WECHAT_SEARCH,
      ],
      customQueries,
      strategyOverrides,
    });

    // 3. 启动 Worker
    this.runCollectionWorker(job);

    logger.info('Started agent collection', {
      jobId: job.id,
      hospital: hospitalName,
      department: departmentName,
      doctor: doctorName,
    });

    return job;
  }

  /**
   * 创建采集任务
   */
  createJob(config: CollectionJobConfig): CollectionJob {
    const jobId = uuidv4();
    const job: CollectionJob = {
      id: jobId,
      config,
      status: CollectionJobStatus.PENDING,
      createdAt: new Date().toISOString(),
      progress: {
        total: 0,
        completed: 0,
        failed: 0,
        duplicates: 0,
      },
      results: [],
      errors: [],
    };

    this.jobs.set(jobId, job);

    // 初始化数据源结果存储
    this.sourceResults.set(jobId, new Map());

    logger.info('Created collection job', { jobId, hospital: config.hospitalName });

    return job;
  }

  /**
   * 启动首次全量采集（Bootstrap）
   */
  async startBootstrapCollection(hospitalName: string): Promise<CollectionJob> {
    const job = this.createJob({
      hospitalName,
      isBootstrap: true,
      days: 90,
      depth: 2,
      maxResults: 300,
      sourceTypes: [
        CollectionSourceType.HOSPITAL_OFFICIAL,
        CollectionSourceType.BAIDU_SEARCH,
        CollectionSourceType.WECHAT_SEARCH,
        CollectionSourceType.GOV_OFFICIAL,
        CollectionSourceType.NEWS_MEDIA,
      ],
    });

    // 在后台启动 Worker 执行
    this.runCollectionWorker(job);

    return job;
  }

  /**
   * 启动增量采集
   */
  async startIncrementalCollection(
    hospitalName: string,
    days: number = 7
  ): Promise<CollectionJob> {
    const job = this.createJob({
      hospitalName,
      isBootstrap: false,
      days,
      maxResults: 150,
      sourceTypes: [
        CollectionSourceType.HOSPITAL_OFFICIAL,
        CollectionSourceType.BAIDU_SEARCH,
        CollectionSourceType.WECHAT_SEARCH,
      ],
    });

    this.runCollectionWorker(job);

    return job;
  }

  /**
   * 启动医生信息采集
   * @param hospitalName 医院名称（必须，用于避免医生名称冲突）
   * @param doctorName 医生姓名
   * @param options 可选配置
   */
  async startDoctorCollection(
    hospitalName: string,
    doctorName: string,
    options: { days?: number; isBootstrap?: boolean } = {}
  ): Promise<CollectionJob> {
    const { days = 30, isBootstrap = false } = options;

    const job = this.createJob({
      hospitalName,
      targetType: CollectionTargetType.DOCTOR,
      targetName: doctorName,
      isBootstrap,
      days,
      maxResults: isBootstrap ? 150 : 80,
      sourceTypes: [
        CollectionSourceType.BAIDU_SEARCH,
        CollectionSourceType.WECHAT_SEARCH,
        CollectionSourceType.ACADEMIC,
      ],
    });

    this.runCollectionWorker(job);

    logger.info('Started doctor collection', {
      jobId: job.id,
      hospital: hospitalName,
      doctor: doctorName,
    });

    return job;
  }

  /**
   * 启动科室信息采集
   * @param hospitalName 医院名称（必须，用于避免科室名称冲突）
   * @param departmentName 科室名称
   * @param options 可选配置
   */
  async startDepartmentCollection(
    hospitalName: string,
    departmentName: string,
    options: { days?: number; isBootstrap?: boolean } = {}
  ): Promise<CollectionJob> {
    const { days = 30, isBootstrap = false } = options;

    const job = this.createJob({
      hospitalName,
      targetType: CollectionTargetType.DEPARTMENT,
      targetName: departmentName,
      isBootstrap,
      days,
      maxResults: isBootstrap ? 150 : 80,
      sourceTypes: [
        CollectionSourceType.HOSPITAL_OFFICIAL,
        CollectionSourceType.BAIDU_SEARCH,
        CollectionSourceType.WECHAT_SEARCH,
      ],
    });

    this.runCollectionWorker(job);

    logger.info('Started department collection', {
      jobId: job.id,
      hospital: hospitalName,
      department: departmentName,
    });

    return job;
  }

  /**
   * 检查医生采集任务是否正在进行
   */
  hasActiveDoctorCollection(hospitalName: string, doctorName: string): boolean {
    const activeJobs = this.getActiveJobs();
    return activeJobs.some(
      (job) =>
        job.config.hospitalName === hospitalName &&
        job.config.targetType === CollectionTargetType.DOCTOR &&
        job.config.targetName === doctorName
    );
  }

  /**
   * 检查科室采集任务是否正在进行
   */
  hasActiveDepartmentCollection(hospitalName: string, departmentName: string): boolean {
    const activeJobs = this.getActiveJobs();
    return activeJobs.some(
      (job) =>
        job.config.hospitalName === hospitalName &&
        job.config.targetType === CollectionTargetType.DEPARTMENT &&
        job.config.targetName === departmentName
    );
  }

  /**
   * 启动后台 Worker 执行采集
   */
  private runCollectionWorker(job: CollectionJob): void {
    // 根据运行环境选择正确的 worker 路径
    // tsx 运行时: 使用 dist 目录下的编译后文件
    // node 运行时: 使用当前目录下的编译后文件
    const isTsx = process.env._?.includes('tsx') || (require as unknown as { extensions?: Record<string, unknown> }).extensions?.['.ts'];
    const workerPath = isTsx
      ? path.join(process.cwd(), 'dist', 'services', 'knowledge-collection', 'collection.worker.js')
      : path.join(__dirname, 'collection.worker.js');

    job.status = CollectionJobStatus.RUNNING;
    job.startedAt = new Date().toISOString();

    // 初始化进度追踪
    if (this.progressService) {
      this.progressService.initializeJob(
        job.id,
        job.config.hospitalName,
        job.config.sourceTypes || [],
        job.config.targetType,
        job.config.targetName
      );
    }

    const workerData = {
      jobId: job.id,
      config: job.config,
      strategy: {
        ...this.strategy,
        ...(job.config.strategyOverrides || {}),
      },
      storagePath: this.getStorageBasePath(),
    };

    const worker = new Worker(workerPath, { workerData });
    this.activeWorkers.set(job.id, worker);

    // 监听 Worker 消息
    worker.on('message', (message) => {
      this.handleWorkerMessage(job.id, message);
    });

    worker.on('error', (error) => {
      logger.error('Collection worker error', { jobId: job.id, error });
      this.handleWorkerError(job.id, error);
    });

    worker.on('exit', (code) => {
      this.activeWorkers.delete(job.id);

      if (code !== 0) {
        logger.error('Collection worker exited with error', { jobId: job.id, code });
        this.finalizeJob(job.id, CollectionJobStatus.FAILED);
      } else {
        this.finalizeJob(job.id, CollectionJobStatus.COMPLETED);
      }
    });

    logger.info('Started collection worker', { jobId: job.id, hospital: job.config.hospitalName });
  }

  /**
   * 处理 Worker 消息
   */
  private handleWorkerMessage(
    jobId: string,
    message: { type: string; data: unknown }
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    switch (message.type) {
      case 'progress': {
        const progress = message.data as CollectionJob['progress'];
        job.progress = progress;

        // 转发到进度服务
        if (this.progressService) {
          this.progressService.publishProgress(
            jobId,
            progress.total,
            progress.completed,
            progress.failed,
            progress.duplicates
          );
        }
        break;
      }

      case 'result': {
        const result = message.data as RawSourceMetadata;
        job.results.push(result);
        break;
      }

      case 'source_complete': {
        const { sourceType, items, duration } = message.data as {
          sourceType: CollectionSourceType;
          items: RawSourceMetadata[];
          duration: number;
        };

        // 存储数据源结果
        const jobSources = this.sourceResults.get(jobId);
        if (jobSources) {
          jobSources.set(sourceType, items);
        }

        // 发布数据源完成事件
        if (this.progressService) {
          this.progressService.publishSourceComplete(jobId, sourceType, items.length, duration);

          // 生成并发布摘要
          const summary = dataSourceSummarizer.summarize(sourceType, items);
          this.progressService.publishSummary(jobId, summary);
        }

        logger.info('Data source completed', {
          jobId,
          sourceType,
          itemCount: items.length,
          duration,
        });
        break;
      }

      case 'error': {
        const error = message.data as CollectionJob['errors'][0];
        job.errors.push(error);

        // 转发到进度服务
        if (this.progressService) {
          this.progressService.publishError(jobId, error.source, error.message, false);
        }
        break;
      }

      case 'agent_started': {
        const { agentId, sourceType, queryCount, maxResults } = message.data as {
          agentId: string;
          sourceType: CollectionSourceType;
          queryCount: number;
          maxResults: number;
        };
        if (this.progressService) {
          this.progressService.publishAgentStarted(jobId, agentId, sourceType, {
            queryCount,
            maxResults,
          });
        }
        break;
      }

      case 'agent_progress': {
        const { agentId, sourceType, completed, failed, duplicates, currentQuery } = message.data as {
          agentId: string;
          sourceType: CollectionSourceType;
          completed: number;
          failed: number;
          duplicates: number;
          currentQuery?: string;
        };
        if (this.progressService) {
          this.progressService.publishAgentProgress(jobId, agentId, sourceType, {
            completed,
            failed,
            duplicates,
            currentQuery,
          });
        }
        break;
      }

      case 'agent_complete': {
        const { agentId, sourceType, itemCount, duration } = message.data as {
          agentId: string;
          sourceType: CollectionSourceType;
          itemCount: number;
          duration: number;
        };
        if (this.progressService) {
          this.progressService.publishAgentComplete(jobId, agentId, sourceType, itemCount, duration);
        }
        logger.info('Agent completed', { jobId, agentId, sourceType, itemCount, duration });
        break;
      }

      case 'complete':
        this.finalizeJob(jobId, CollectionJobStatus.COMPLETED);
        break;
    }
  }

  /**
   * 处理 Worker 错误
   */
  private handleWorkerError(jobId: string, error: Error): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.errors.push({
      source: 'worker',
      message: error.message,
      retryCount: 0,
      timestamp: new Date().toISOString(),
    });

    this.finalizeJob(jobId, CollectionJobStatus.FAILED);
  }

  /**
   * 完成任务
   */
  private finalizeJob(jobId: string, status: CollectionJobStatus): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = status;
    job.completedAt = new Date().toISOString();

    // 计算总耗时
    const totalDuration = job.startedAt
      ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
      : 0;

    // 发布完成或错误事件
    if (this.progressService) {
      if (status === CollectionJobStatus.COMPLETED) {
        this.progressService.publishCompleted(jobId, job.results.length, totalDuration);
      } else if (status === CollectionJobStatus.FAILED) {
        const lastError = job.errors[job.errors.length - 1];
        this.progressService.publishError(jobId, lastError?.source || 'unknown', lastError?.message || 'Unknown error', true);
      }
    }

    // 触发 Wiki Ingest（仅成功完成的任务）
    if (status === CollectionJobStatus.COMPLETED && this.wikiIngestService) {
      for (const result of job.results) {
        this.wikiIngestService.ingestFromRawSource(result).catch((err) => {
          logger.error('Wiki ingest failed for collection result', {
            jobId,
            sourceId: result.id,
            error: err,
          });
        });
      }
    }

    // 终止 Worker（如果还在运行）
    const worker = this.activeWorkers.get(jobId);
    if (worker) {
      worker.terminate();
      this.activeWorkers.delete(jobId);
    }

    // 清理数据源结果存储（保留一段时间用于查询）
    setTimeout(() => {
      this.sourceResults.delete(jobId);
    }, 3600000); // 1小时后清理

    logger.info('Collection job finalized', {
      jobId,
      status,
      hospital: job.config.hospitalName,
      results: job.results.length,
      errors: job.errors.length,
    });
  }

  /**
   * 取消任务
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== CollectionJobStatus.RUNNING) {
      return false;
    }

    this.finalizeJob(jobId, CollectionJobStatus.CANCELLED);
    return true;
  }

  /**
   * 获取任务状态
   */
  getJobStatus(jobId: string): CollectionJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * 获取所有任务
   */
  getAllJobs(): CollectionJob[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * 获取运行中的任务
   */
  getActiveJobs(): CollectionJob[] {
    return this.getAllJobs().filter(
      (job) => job.status === CollectionJobStatus.RUNNING
    );
  }

  /**
   * 获取医院的采集状态
   */
  getHospitalCollectionStatus(hospitalName: string): HospitalCollectionStatus {
    return this.rawSourceManager.getHospitalStats(hospitalName);
  }

  /**
   * 获取全局统计
   */
  getStats(): CollectionStats {
    const allJobs = this.getAllJobs();
    const managerStats = this.rawSourceManager.getGlobalStats();

    return {
      totalJobs: allJobs.length,
      activeJobs: allJobs.filter((j) => j.status === CollectionJobStatus.RUNNING).length,
      completedJobs: allJobs.filter((j) => j.status === CollectionJobStatus.COMPLETED).length,
      failedJobs: allJobs.filter((j) => j.status === CollectionJobStatus.FAILED).length,
      totalSources: managerStats.totalSources,
      duplicatesFiltered: allJobs.reduce((sum, j) => sum + j.progress.duplicates, 0),
      storageSize: managerStats.storageSize,
    };
  }

  /**
   * 获取存储基础路径
   */
  private getStorageBasePath(): string {
    // 返回数据存储根目录
    return SOURCES_DIR;
  }

  /**
   * 批量启动增量采集
   */
  async runIncrementalForAll(days: number = 7): Promise<CollectionJob[]> {
    const hospitals = this.rawSourceManager.getAllHospitals();
    const jobs: CollectionJob[] = [];

    for (const hospital of hospitals) {
      const job = await this.startIncrementalCollection(hospital, days);
      jobs.push(job);

      // 添加延迟避免同时启动过多任务
      await this.delay(1000);
    }

    return jobs;
  }

  /**
   * 延迟工具
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
