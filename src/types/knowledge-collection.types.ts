/**
 * Knowledge Collection Types
 * 医院、科室、客户知识采集系统的类型定义
 */

// ===== 采集源类型 =====
export enum CollectionSourceType {
  HOSPITAL_OFFICIAL = 'hospital_official',    // 医院官网
  BAIDU_SEARCH = 'baidu_search',              // 百度搜索
  WECHAT_SEARCH = 'wechat_search',            // 微信搜索
  PUBMED = 'pubmed',                          // PubMed 学术
  CNKI = 'cnki',                              // 中国知网
  GOV_OFFICIAL = 'gov_official',              // 政府官网
  NEWS_MEDIA = 'news_media',                  // 新闻媒体
  ACADEMIC = 'academic',                      // 学术会议/论文
  USER_SUBMITTED = 'user_submitted',          // 用户主动提交（IM/手动）
}

// ===== 采集任务状态 =====
export enum CollectionJobStatus {
  PENDING = 'pending',           // 等待执行
  RUNNING = 'running',           // 执行中
  PAUSED = 'paused',             // 暂停
  COMPLETED = 'completed',       // 完成
  FAILED = 'failed',             // 失败
  CANCELLED = 'cancelled',       // 取消
}

// ===== 原始资料元数据 =====
export interface RawSourceMetadata {
  id: string;                          // 唯一标识（URL + 标题哈希）
  sourceType: CollectionSourceType;    // 源类型
  url: string;                         // 原始链接
  title: string;                       // 标题
  hospitalName: string;                // 所属医院
  departments?: string[];              // 相关科室
  doctors?: string[];                  // 相关医生
  collectedAt: string;                 // 采集时间（ISO）
  publishedAt?: string;                // 发布时间（ISO）
  filePath: string;                    // 存储路径
  contentHash: string;                 // 内容哈希（SHA-256）
  urlHash: string;                     // URL 哈希
  titleHash: string;                   // 标题哈希
  tags?: string[];                     // 标签
  jobId?: string;                      // 所属采集任务
  batchId?: string;                    // 批次ID
}

// ===== 采集目标类型 =====
export enum CollectionTargetType {
  HOSPITAL = 'hospital',       // 医院级别采集
  DEPARTMENT = 'department',   // 科室级别采集
  DOCTOR = 'doctor',           // 医生级别采集
}

// ===== 采集任务配置 =====
export interface CollectionJobConfig {
  hospitalName: string;                // 目标医院（必须，用于避免名称冲突）
  targetType?: CollectionTargetType;   // 采集目标类型
  targetName?: string;                 // 目标名称（科室名或医生名）
  departments?: string[];              // 目标科室列表（批量采集用）
  doctors?: string[];                  // 目标医生列表（批量采集用）
  sourceTypes?: CollectionSourceType[];// 指定采集源
  days?: number;                       // 回溯天数（默认90）
  maxResults?: number;                 // 最大结果数
  depth?: number;                      // 官网爬取深度
  priority?: number;                   // 任务优先级
  isBootstrap?: boolean;               // 是否首次全量采集
  customQueries?: string[];            // LLM 生成的自定义搜索关键词
  strategyOverrides?: Partial<CollectionStrategy>; // 反爬策略覆盖
}

// ===== 采集任务 =====
export interface CollectionJob {
  id: string;                          // 任务ID
  config: CollectionJobConfig;         // 任务配置
  status: CollectionJobStatus;         // 状态
  createdAt: string;                   // 创建时间
  startedAt?: string;                  // 开始时间
  completedAt?: string;                // 完成时间
  progress: {
    total: number;                     // 预计总数
    completed: number;                 // 已完成
    failed: number;                    // 失败数
    duplicates: number;                // 重复数
  };
  results: RawSourceMetadata[];        // 采集结果
  errors: CollectionError[];           // 错误记录
}

// ===== 采集错误 =====
export interface CollectionError {
  source: string;                      // 错误来源（URL或描述）
  message: string;                     // 错误信息
  code?: string;                       // 错误代码
  retryCount: number;                  // 已重试次数
  timestamp: string;                   // 时间
}

// ===== 采集策略（反爬配置）=====
export interface CollectionStrategy {
  // 请求间隔（毫秒）
  minDelay: number;
  maxDelay: number;

  // 并发控制
  maxConcurrency: number;

  // 重试策略
  maxRetries: number;
  baseRetryDelay: number;              // 基础退避时间（毫秒）
  maxRetryDelay: number;               // 最大退避时间（毫秒）

  // 用户代理轮换
  userAgents: string[];

  // 请求超时
  timeout: number;

  // 每日请求上限（防被封）
  dailyRequestLimit?: number;
}

// ===== 默认采集策略（保守策略，优先考虑反爬）=====
export const DEFAULT_COLLECTION_STRATEGY: CollectionStrategy = {
  minDelay: 3000,                      // 最小3秒间隔
  maxDelay: 8000,                      // 最大8秒间隔
  maxConcurrency: 2,                   // 最多2个并发
  maxRetries: 3,                       // 最多重试3次
  baseRetryDelay: 5000,                // 基础退避5秒
  maxRetryDelay: 300000,               // 最大退避5分钟
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  ],
  timeout: 30000,                      // 30秒超时
  dailyRequestLimit: 500,              // 每日最多500请求
};

// ===== 去重检查结果 =====
export interface DuplicateCheckResult {
  isDuplicate: boolean;                // 是否重复
  duplicateType?: 'url' | 'title' | 'content'; // 重复类型
  existingSource?: RawSourceMetadata;  // 已存在的源
  similarityScore?: number;            // 相似度分数
}

// ===== 采集 Agent 配置 =====
export interface CollectionAgentConfig {
  agentId: string;
  sourceType: CollectionSourceType;
  queries: string[];
  maxResults: number;
  strategyOverrides?: Partial<CollectionStrategy>;
}

// ===== 采集 Agent 结果 =====
export interface CollectionAgentResult {
  agentId: string;
  sourceType: CollectionSourceType;
  items: RawSourceMetadata[];
  duration: number;
  errors: CollectionError[];
}

// ===== 采集 worker 消息 =====
export interface CollectionWorkerMessage {
  type: 'progress' | 'result' | 'error' | 'complete' | 'agent_started' | 'agent_progress' | 'agent_complete';
  jobId: string;
  data?: unknown;
}

// ===== 采集 worker 任务 =====
export interface CollectionWorkerTask {
  jobId: string;
  config: CollectionJobConfig;
  strategy: CollectionStrategy;
  storagePath: string;                 // 存储根目录
}

// ===== 采集统计 =====
export interface CollectionStats {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalSources: number;
  duplicatesFiltered: number;
  storageSize: number;                 // 存储大小（字节）
}

// ===== 医院采集状态 =====
export interface HospitalCollectionStatus {
  hospitalName: string;
  lastBootstrapAt?: string;            // 上次全量采集
  lastIncrementalAt?: string;          // 上次增量采集
  nextScheduledAt?: string;            // 下次计划采集
  totalSources: number;                // 总资料数
  sourceTypeDistribution: Record<CollectionSourceType, number>;
  isCollecting: boolean;               // 是否正在采集中
  activeJobId?: string;                // 当前任务ID
}

// ===== 增量更新配置 =====
export interface IncrementalConfig {
  enabled: boolean;
  schedule: string;                    // cron 表达式
  days: number;                        // 回溯天数
  sourceTypes: CollectionSourceType[];
}

// ===== 默认增量配置 =====
export const DEFAULT_INCREMENTAL_CONFIG: IncrementalConfig = {
  enabled: true,
  schedule: '0 2 * * *',               // 每天凌晨2点
  days: 7,                             // 回溯7天
  sourceTypes: [
    CollectionSourceType.HOSPITAL_OFFICIAL,
    CollectionSourceType.BAIDU_SEARCH,
    CollectionSourceType.WECHAT_SEARCH,
  ],
};
