/**
 * Knowledge Collection Tools
 * 知识采集相关工具 - 暴露给 OpenClaw 使用
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../utils/plugin-logger';
import type { KnowledgeCollectionService } from '../services/knowledge-collection/knowledge-collection.service';
import type { RawSourceManager } from '../services/knowledge-collection/raw-source.manager';
import type { ScheduledTaskService } from '../services/knowledge-collection/scheduled-task.service';
import { CollectionSourceType } from '../types/knowledge-collection.types';

const toolLogger = createLogger('REPSCLAW:TOOL');

// ========== 启动首次全量采集 ==========
export const BootstrapCollectionParametersSchema = z.object({
  hospitalName: z.string().min(1).describe('医院名称 / Hospital name'),
  days: z.number().min(1).max(365).optional().default(90)
    .describe('回溯天数（1-365，默认90）/ Days to look back'),
}).strict();

export type BootstrapCollectionParameters = z.infer<typeof BootstrapCollectionParametersSchema>;
export const BOOTSTRAP_COLLECTION_TOOL_NAME = 'bootstrap_knowledge_collection';

export const BootstrapCollectionTool = {
  name: BOOTSTRAP_COLLECTION_TOOL_NAME,
  description: `启动医院知识的首次全量采集（Bootstrap Collection）

采集范围：
1. 医院官网新闻（深度爬取2-3层）
2. 百度搜索（最近90天）
3. 微信搜索（最近30天）
4. 政府公告
5. 媒体报道

反爬策略：
- 请求间隔3-8秒随机延迟
- 最多2个并发请求
- 指数退避重试机制
- User-Agent轮换

资料将保存到 Layer 1: Raw Sources 目录，以 Markdown 格式存储`,
  parameters: zodToJsonSchema(BootstrapCollectionParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createBootstrapCollectionHandler(
  collectionService: KnowledgeCollectionService
) {
  return async (args: unknown) => {
    toolLogger.toolCall(BOOTSTRAP_COLLECTION_TOOL_NAME, args);

    try {
      const params = BootstrapCollectionParametersSchema.parse(args);

      // 检查是否已有正在运行的任务
      const activeJobs = collectionService.getActiveJobs();
      const existingJob = activeJobs.find(
        j => j.config.hospitalName === params.hospitalName
      );

      if (existingJob) {
        return {
          status: 'info',
          message: `${params.hospitalName} 已有正在进行的采集任务（Job ID: ${existingJob.id}）`,
          data: {
            jobId: existingJob.id,
            status: existingJob.status,
            progress: existingJob.progress,
          },
        };
      }

      // 启动全量采集
      const job = await collectionService.startBootstrapCollection(
        params.hospitalName
      );

      toolLogger.toolResult(BOOTSTRAP_COLLECTION_TOOL_NAME, 'success', {
        hospital: params.hospitalName,
        jobId: job.id,
      });

      return {
        status: 'success',
        message: `已启动 ${params.hospitalName} 的首次全量采集`,
        data: {
          jobId: job.id,
          hospitalName: params.hospitalName,
          status: job.status,
          estimatedTime: '10-30分钟（取决于网络和目标网站响应）',
          sources: [
            '医院官网',
            '百度搜索',
            '微信搜索',
            '政府公告',
            '媒体报道',
          ],
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      toolLogger.error('Bootstrap collection tool error', error);
      return {
        status: 'error',
        error: {
          code: 'COLLECTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

// ========== 启动增量采集 ==========
export const IncrementalCollectionParametersSchema = z.object({
  hospitalName: z.string().optional()
    .describe('医院名称（不传则采集所有医院）/ Hospital name'),
  days: z.number().min(1).max(30).optional().default(7)
    .describe('回溯天数（1-30，默认7）/ Days to look back'),
}).strict();

export type IncrementalCollectionParameters = z.infer<typeof IncrementalCollectionParametersSchema>;
export const INCREMENTAL_COLLECTION_TOOL_NAME = 'incremental_knowledge_collection';

export const IncrementalCollectionTool = {
  name: INCREMENTAL_COLLECTION_TOOL_NAME,
  description: `启动增量知识采集

用于：
- 手动触发每日增量更新
- 订阅医院后定期同步最新资料
- 特定时间段内的信息补充

自动去重：
- URL + 标题哈希双重去重
- 自动跳过已采集的内容`,
  parameters: zodToJsonSchema(IncrementalCollectionParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createIncrementalCollectionHandler(
  collectionService: KnowledgeCollectionService,
  taskService: ScheduledTaskService
) {
  return async (args: unknown) => {
    toolLogger.toolCall(INCREMENTAL_COLLECTION_TOOL_NAME, args);

    try {
      const params = IncrementalCollectionParametersSchema.parse(args);

      if (params.hospitalName) {
        // 单个医院采集
        const job = await collectionService.startIncrementalCollection(
          params.hospitalName,
          params.days
        );

        toolLogger.toolResult(INCREMENTAL_COLLECTION_TOOL_NAME, 'success', {
          hospital: params.hospitalName,
          jobId: job.id,
        });

        return {
          status: 'success',
          message: `已启动 ${params.hospitalName} 的增量采集（最近${params.days}天）`,
          data: {
            jobId: job.id,
            hospitalName: params.hospitalName,
            days: params.days,
            status: job.status,
          },
          meta: { timestamp: new Date().toISOString() },
        };
      } else {
        // 全部医院采集
        await taskService.triggerManualCollection(undefined, params.days);

        return {
          status: 'success',
          message: `已启动所有医院的增量采集（最近${params.days}天）`,
          data: {
            days: params.days,
          },
          meta: { timestamp: new Date().toISOString() },
        };
      }
    } catch (error) {
      toolLogger.error('Incremental collection tool error', error);
      return {
        status: 'error',
        error: {
          code: 'COLLECTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

// ========== 查询采集任务状态 ==========
export const GetCollectionStatusParametersSchema = z.object({
  jobId: z.string().optional()
    .describe('任务ID（不传则返回所有任务）/ Job ID'),
}).strict();

export type GetCollectionStatusParameters = z.infer<typeof GetCollectionStatusParametersSchema>;
export const GET_COLLECTION_STATUS_TOOL_NAME = 'get_collection_status';

export const GetCollectionStatusTool = {
  name: GET_COLLECTION_STATUS_TOOL_NAME,
  description: '查询知识采集任务状态',
  parameters: zodToJsonSchema(GetCollectionStatusParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createGetCollectionStatusHandler(
  collectionService: KnowledgeCollectionService
) {
  return async (args: unknown) => {
    try {
      const params = GetCollectionStatusParametersSchema.parse(args);

      if (params.jobId) {
        // 查询单个任务
        const job = collectionService.getJobStatus(params.jobId);

        if (!job) {
          return {
            status: 'error',
            error: {
              code: 'NOT_FOUND',
              message: `未找到任务 ${params.jobId}`,
            },
          };
        }

        return {
          status: 'success',
          data: {
            job: {
              id: job.id,
              status: job.status,
              hospitalName: job.config.hospitalName,
              isBootstrap: job.config.isBootstrap,
              progress: job.progress,
              results: job.results.length,
              errors: job.errors.length,
              createdAt: job.createdAt,
              startedAt: job.startedAt,
              completedAt: job.completedAt,
            },
          },
        };
      } else {
        // 返回所有任务
        const jobs = collectionService.getAllJobs().slice(0, 10);
        const stats = collectionService.getStats();

        return {
          status: 'success',
          data: {
            recentJobs: jobs.map(j => ({
              id: j.id,
              status: j.status,
              hospitalName: j.config.hospitalName,
              progress: j.progress,
            })),
            stats: {
              totalJobs: stats.totalJobs,
              activeJobs: stats.activeJobs,
              completedJobs: stats.completedJobs,
              failedJobs: stats.failedJobs,
              totalSources: stats.totalSources,
            },
          },
        };
      }
    } catch (error) {
      return {
        status: 'error',
        error: {
          code: 'STATUS_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

// ========== 查询原始资料 ==========
export const QueryRawSourcesParametersSchema = z.object({
  hospitalName: z.string().optional()
    .describe('医院名称 / Hospital name'),
  keyword: z.string().optional()
    .describe('搜索关键词 / Search keyword'),
  sourceType: z.nativeEnum(CollectionSourceType).optional()
    .describe('资料来源类型 / Source type'),
  startDate: z.string().optional()
    .describe('开始日期（YYYY-MM-DD）/ Start date'),
  endDate: z.string().optional()
    .describe('结束日期（YYYY-MM-DD）/ End date'),
  limit: z.number().min(1).max(50).optional().default(10)
    .describe('返回数量限制（1-50，默认10）/ Limit'),
}).strict();

export type QueryRawSourcesParameters = z.infer<typeof QueryRawSourcesParametersSchema>;
export const QUERY_RAW_SOURCES_TOOL_NAME = 'query_raw_sources';

export const QueryRawSourcesTool = {
  name: QUERY_RAW_SOURCES_TOOL_NAME,
  description: `查询已采集的原始资料（Layer 1）

支持按以下条件筛选：
- 医院名称
- 关键词（标题或URL匹配）
- 资料来源类型
- 采集日期范围

返回结果包含资料元数据，可用于进一步分析和整合到 Wiki`,
  parameters: zodToJsonSchema(QueryRawSourcesParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createQueryRawSourcesHandler(
  rawSourceManager: RawSourceManager
) {
  return async (args: unknown) => {
    try {
      const params = QueryRawSourcesParametersSchema.parse(args);

      const results = rawSourceManager.searchSources({
        hospitalName: params.hospitalName,
        sourceType: params.sourceType,
        keyword: params.keyword,
        startDate: params.startDate,
        endDate: params.endDate,
      });

      const limited = results.slice(0, params.limit);

      return {
        status: 'success',
        data: {
          total: results.length,
          returned: limited.length,
          sources: limited.map(s => ({
            id: s.id,
            title: s.title,
            sourceType: s.sourceType,
            hospitalName: s.hospitalName,
            url: s.url,
            collectedAt: s.collectedAt,
            publishedAt: s.publishedAt,
            filePath: s.filePath,
          })),
        },
      };
    } catch (error) {
      return {
        status: 'error',
        error: {
          code: 'QUERY_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

// ========== 获取医院采集统计 ==========
export const GET_COLLECTION_STATS_TOOL_NAME = 'get_collection_stats';

export const GetCollectionStatsTool = {
  name: GET_COLLECTION_STATS_TOOL_NAME,
  description: '获取知识采集系统的全局统计信息',
  parameters: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};

export function createGetCollectionStatsHandler(
  collectionService: KnowledgeCollectionService,
  rawSourceManager: RawSourceManager
) {
  return async () => {
    try {
      const stats = collectionService.getStats();
      const hospitals = rawSourceManager.getAllHospitals();

      const hospitalStats = hospitals.map(h =>
        rawSourceManager.getHospitalStats(h)
      );

      return {
        status: 'success',
        data: {
          global: stats,
          hospitals: hospitalStats.map(h => ({
            name: h.hospitalName,
            totalSources: h.totalSources,
            lastIncrementalAt: h.lastIncrementalAt,
            sourceTypeDistribution: h.sourceTypeDistribution,
          })),
        },
      };
    } catch (error) {
      return {
        status: 'error',
        error: {
          code: 'STATS_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

// ========== 启动医生信息采集 ==========
export const CollectDoctorParametersSchema = z.object({
  hospitalName: z.string().min(1).describe('医院名称 / Hospital name（必须，用于避免医生名称冲突）'),
  doctorName: z.string().min(1).describe('医生姓名 / Doctor name'),
  days: z.number().min(1).max(365).optional().default(90)
    .describe('回溯天数（1-365，默认90）/ Days to look back'),
  isBootstrap: z.boolean().optional().default(false)
    .describe('是否首次全量采集 / Is bootstrap collection'),
}).strict();

export type CollectDoctorParameters = z.infer<typeof CollectDoctorParametersSchema>;
export const COLLECT_DOCTOR_TOOL_NAME = 'collect_doctor_knowledge';

export const CollectDoctorTool = {
  name: COLLECT_DOCTOR_TOOL_NAME,
  description: `启动医生信息采集

采集该医生在医院的相关信息，包括：
1. 百度搜索（学术论文、新闻报道）
2. 微信搜索（公众号文章）
3. 学术会议/论文（PubMed、知网等）

注意：必须提供医院名称以避免同名医生混淆`,
  parameters: zodToJsonSchema(CollectDoctorParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createCollectDoctorHandler(
  collectionService: KnowledgeCollectionService
) {
  return async (args: unknown) => {
    toolLogger.toolCall(COLLECT_DOCTOR_TOOL_NAME, args);

    try {
      const params = CollectDoctorParametersSchema.parse(args);

      // 检查是否已有正在运行的任务
      if (collectionService.hasActiveDoctorCollection(params.hospitalName, params.doctorName)) {
        return {
          status: 'info',
          message: `${params.hospitalName} - ${params.doctorName} 已有正在进行的采集任务`,
        };
      }

      // 启动医生采集
      const job = await collectionService.startDoctorCollection(
        params.hospitalName,
        params.doctorName,
        {
          days: params.days,
          isBootstrap: params.isBootstrap,
        }
      );

      toolLogger.toolResult(COLLECT_DOCTOR_TOOL_NAME, 'success', {
        hospital: params.hospitalName,
        doctor: params.doctorName,
        jobId: job.id,
      });

      return {
        status: 'success',
        message: `已启动 ${params.hospitalName} - ${params.doctorName} 的信息采集`,
        data: {
          jobId: job.id,
          hospitalName: params.hospitalName,
          doctorName: params.doctorName,
          status: job.status,
          estimatedTime: '5-15分钟（取决于网络和目标网站响应）',
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      toolLogger.error('Collect doctor tool error', error);
      return {
        status: 'error',
        error: {
          code: 'COLLECTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

// ========== 启动科室信息采集 ==========
export const CollectDepartmentParametersSchema = z.object({
  hospitalName: z.string().min(1).describe('医院名称 / Hospital name（必须，用于避免科室名称冲突）'),
  departmentName: z.string().min(1).describe('科室名称 / Department name'),
  days: z.number().min(1).max(365).optional().default(90)
    .describe('回溯天数（1-365，默认90）/ Days to look back'),
  isBootstrap: z.boolean().optional().default(false)
    .describe('是否首次全量采集 / Is bootstrap collection'),
}).strict();

export type CollectDepartmentParameters = z.infer<typeof CollectDepartmentParametersSchema>;
export const COLLECT_DEPARTMENT_TOOL_NAME = 'collect_department_knowledge';

export const CollectDepartmentTool = {
  name: COLLECT_DEPARTMENT_TOOL_NAME,
  description: `启动科室信息采集

采集该科室在医院的相关信息，包括：
1. 医院官网科室页面
2. 百度搜索（科室新闻、学术活动）
3. 微信搜索（科室公众号）

注意：必须提供医院名称以避免同名科室混淆（如不同医院的"心内科"）`,
  parameters: zodToJsonSchema(CollectDepartmentParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createCollectDepartmentHandler(
  collectionService: KnowledgeCollectionService
) {
  return async (args: unknown) => {
    toolLogger.toolCall(COLLECT_DEPARTMENT_TOOL_NAME, args);

    try {
      const params = CollectDepartmentParametersSchema.parse(args);

      // 检查是否已有正在运行的任务
      if (collectionService.hasActiveDepartmentCollection(params.hospitalName, params.departmentName)) {
        return {
          status: 'info',
          message: `${params.hospitalName} - ${params.departmentName} 已有正在进行的采集任务`,
        };
      }

      // 启动科室采集
      const job = await collectionService.startDepartmentCollection(
        params.hospitalName,
        params.departmentName,
        {
          days: params.days,
          isBootstrap: params.isBootstrap,
        }
      );

      toolLogger.toolResult(COLLECT_DEPARTMENT_TOOL_NAME, 'success', {
        hospital: params.hospitalName,
        department: params.departmentName,
        jobId: job.id,
      });

      return {
        status: 'success',
        message: `已启动 ${params.hospitalName} - ${params.departmentName} 的信息采集`,
        data: {
          jobId: job.id,
          hospitalName: params.hospitalName,
          departmentName: params.departmentName,
          status: job.status,
          estimatedTime: '5-15分钟（取决于网络和目标网站响应）',
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      toolLogger.error('Collect department tool error', error);
      return {
        status: 'error',
        error: {
          code: 'COLLECTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

// ========== 启动 Agent 智能采集 ==========
export const AgentCollectionParametersSchema = z.object({
  hospitalName: z.string().min(1).describe('医院名称 / Hospital name'),
  departmentName: z.string().optional().describe('科室名称 / Department name'),
  doctorName: z.string().optional().describe('医生姓名 / Doctor name'),
  days: z.number().min(1).max(90).optional().default(7)
    .describe('回溯天数（1-90，默认7）/ Days to look back'),
}).strict();

export type AgentCollectionParameters = z.infer<typeof AgentCollectionParametersSchema>;
export const AGENT_COLLECTION_TOOL_NAME = 'start_agent_collection';

export const AgentCollectionTool = {
  name: AGENT_COLLECTION_TOOL_NAME,
  description: `启动 LLM 驱动的 Agent 智能采集（Subagent 并行采集）

核心能力：
1. LLM 自动生成 8-15 个精准搜索关键词
2. 多个 Subagent 并行采集不同数据源
3. 百度新闻：翻页采集，最高约 100 条结果
4. 微信搜索：多关键词+多页深度采集
5. 医院官网：BFS 深度爬取
6. 实时 SSE 进度流反馈每个 Agent 状态

适合场景：
- 需要大量资讯的全面调研
- 医院/科室/医生的深度信息挖掘
- 定期大批量内容更新`,
  parameters: zodToJsonSchema(AgentCollectionParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createAgentCollectionHandler(
  collectionService: KnowledgeCollectionService
) {
  return async (args: unknown) => {
    toolLogger.toolCall(AGENT_COLLECTION_TOOL_NAME, args);

    try {
      const params = AgentCollectionParametersSchema.parse(args);

      const job = await collectionService.startAgentCollection({
        hospitalName: params.hospitalName,
        departmentName: params.departmentName,
        doctorName: params.doctorName,
        days: params.days,
      });

      toolLogger.toolResult(AGENT_COLLECTION_TOOL_NAME, 'success', {
        hospital: params.hospitalName,
        jobId: job.id,
      });

      return {
        status: 'success',
        message: `已启动 ${params.hospitalName} 的 Agent 智能采集`,
        data: {
          jobId: job.id,
          hospitalName: params.hospitalName,
          departmentName: params.departmentName,
          doctorName: params.doctorName,
          days: params.days,
          status: job.status,
          streamUrl: `/api/repsclaw/collection/${job.id}/stream`,
          estimatedTime: '15-30分钟（取决于目标复杂度和网络状况）',
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      toolLogger.error('Agent collection tool error', error);
      return {
        status: 'error',
        error: {
          code: 'AGENT_COLLECTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}
