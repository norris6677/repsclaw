/**
 * Collection Progress Types
 * 采集进度追踪类型定义 - 支持SSE实时流和断线重连
 */

import type { CollectionSourceType, RawSourceMetadata } from './knowledge-collection.types';

// ===== SSE 事件类型 =====
export type ProgressEventType =
  | 'started'      // 采集开始
  | 'progress'     // 进度更新
  | 'agent_started'   // Agent 开始
  | 'agent_progress'  // Agent 进度更新
  | 'agent_complete'  // Agent 完成
  | 'source_complete'  // 单个数据源完成
  | 'summary'      // 数据源摘要（规则提取）
  | 'completed'    // 全部完成
  | 'error';       // 错误

// ===== 基础事件接口 =====
export interface CollectionProgressEvent {
  type: ProgressEventType;
  jobId: string;
  timestamp: string;
  data: unknown;
}

// ===== 采集开始事件 =====
export interface CollectionStartedEventData {
  hospitalName: string;
  targetType?: string;
  targetName?: string;
  sourceTypes: CollectionSourceType[];
  estimatedDuration: number; // 预计耗时（分钟）
}

// ===== 进度更新事件 =====
export interface CollectionProgressEventData {
  total: number;
  completed: number;
  failed: number;
  duplicates: number;
  currentSource?: CollectionSourceType;
  percent: number;
}

// ===== Agent 开始事件 =====
export interface AgentStartedEventData {
  agentId: string;
  sourceType: CollectionSourceType;
  queryCount: number;
  maxResults: number;
}

// ===== Agent 进度更新事件 =====
export interface AgentProgressEventData {
  agentId: string;
  sourceType: CollectionSourceType;
  completed: number;
  failed: number;
  duplicates: number;
  currentQuery?: string;
}

// ===== Agent 完成事件 =====
export interface AgentCompleteEventData {
  agentId: string;
  sourceType: CollectionSourceType;
  itemCount: number;
  duration: number;
}

// ===== 数据源完成事件 =====
export interface SourceCompleteEventData {
  sourceType: CollectionSourceType;
  itemCount: number;
  duration: number; // 耗时（毫秒）
}

// ===== 数据源摘要事件 =====
export interface DataSourceSummaryEventData {
  sourceType: CollectionSourceType;
  count: number;
  highlights: string[];      // 关键亮点（3-5条）
  categories: {              // 分类统计
    category: string;
    count: number;
    items: string[];         // 该分类下的标题
  }[];
}

// ===== 采集完成事件 =====
export interface CollectionCompletedEventData {
  totalItems: number;
  totalDuration: number;     // 总耗时（毫秒）
  sourceSummaries: DataSourceSummaryEventData[];
}

// ===== 错误事件 =====
export interface CollectionErrorEventData {
  source: string;
  message: string;
  fatal: boolean;            // 是否致命错误
}

// ===== 事件历史记录（用于断线重连） =====
export interface EventHistoryRecord {
  eventId: number;           // 自增事件ID
  timestamp: string;
  event: CollectionProgressEvent;
}

// ===== 任务进度状态 =====
export interface JobProgressState {
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  events: EventHistoryRecord[];
  lastEventId: number;
  summaryGenerated: Set<CollectionSourceType>;
}

// ===== SSE 客户端连接 =====
export interface SSEConnection {
  id: string;
  jobId: string;
  lastEventId: number;       // 客户端最后收到的事件ID
  res: NodeJS.WritableStream;
  connectedAt: string;
}

// ===== 摘要生成配置 =====
export interface SummarizerConfig {
  maxHighlights: number;     // 最大亮点数量
  maxItemsPerCategory: number; // 每个分类最大条目数
  categoryKeywords: Record<string, string[]>; // 分类关键词
}

// ===== 默认摘要配置 =====
export const DEFAULT_SUMMARIZER_CONFIG: SummarizerConfig = {
  maxHighlights: 5,
  maxItemsPerCategory: 3,
  categoryKeywords: {
    '学术成果': ['论文', '研究', '临床', '疗效', '治疗', '学术', '期刊', '发表'],
    '媒体报道': ['新闻', '报道', '采访', '媒体', '报纸', '电视'],
    '荣誉奖项': ['获奖', '荣誉', '称号', '优秀', '杰出', '专家', '领军'],
    '门诊信息': ['门诊', '挂号', '预约', '就诊', '时间', '出诊'],
    '科室动态': ['科室', '团队', '手术', '病例', '疑难', '会诊'],
    '社会公益': ['公益', '义诊', '科普', '讲座', '社区', '志愿'],
  },
};
