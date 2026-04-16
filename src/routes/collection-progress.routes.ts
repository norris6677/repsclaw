/**
 * Collection Progress Routes
 * 采集进度追踪 SSE 路由
 *
 * 提供实时进度流和断线重连支持
 */

import type { Response } from 'express';
import { createLogger } from '../utils/plugin-logger';
import { collectionProgressService } from '../services/knowledge-collection/collection-progress.service';
import type { OpenClawAPI } from '../types/openclaw.types';

const logger = createLogger('REPSCLAW:ROUTES:COLLECTION');

/**
 * 注册采集进度追踪路由
 */
export function registerCollectionProgressRoutes(api: OpenClawAPI): void {
  // SSE 实时进度流
  api.registerHttpRoute({
    path: '/api/repsclaw/collection/:jobId/stream',
    auth: 'gateway',
    handler: (req, res) => {
      const { jobId } = req.params;
      // 从请求头获取 Last-Event-ID（用于断线重连）
      const lastEventId = req.headers['last-event-id']
        ? parseInt(req.headers['last-event-id'] as string, 10)
        : undefined;

      if (!jobId) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Missing jobId parameter' }));
        return true;
      }

      logger.info('SSE connection request', { jobId, lastEventId });

      // 订阅 SSE 流
      collectionProgressService.subscribeSSE(jobId, res as unknown as Response, lastEventId);

      return true;
    },
  });

  // 查询任务进度状态（HTTP API）
  api.registerHttpRoute({
    path: '/api/repsclaw/collection/:jobId/status',
    auth: 'gateway',
    handler: (req, res) => {
      const { jobId } = req.params;

      const jobState = collectionProgressService.getJobState(jobId);

      if (!jobState) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Job not found' }));
        return true;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          jobId: jobState.jobId,
          status: jobState.status,
          startedAt: jobState.startedAt,
          completedAt: jobState.completedAt,
          lastEventId: jobState.lastEventId,
          summaryGenerated: Array.from(jobState.summaryGenerated),
        })
      );

      return true;
    },
  });

  // 获取所有活跃任务
  api.registerHttpRoute({
    path: '/api/repsclaw/collection/active',
    auth: 'gateway',
    handler: (_req, res) => {
      const activeJobs = collectionProgressService.getActiveJobs();

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          count: activeJobs.length,
          jobs: activeJobs.map((job) => ({
            jobId: job.jobId,
            status: job.status,
            startedAt: job.startedAt,
            lastEventId: job.lastEventId,
          })),
        })
      );

      return true;
    },
  });

  logger.info('Collection progress routes registered');
}
