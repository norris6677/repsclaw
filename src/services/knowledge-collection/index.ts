/**
 * Knowledge Collection Module
 * 知识采集模块 - 导出所有组件
 */

// 核心服务
export {
  KnowledgeCollectionService,
} from './knowledge-collection.service';

// 原始资料管理
export {
  RawSourceManager,
  rawSourceManager,
} from './raw-source.manager';

// 定时任务
export {
  ScheduledTaskService,
} from './scheduled-task.service';

// 进度追踪
export {
  CollectionProgressService,
  collectionProgressService,
} from './collection-progress.service';

// 数据源摘要
export {
  DataSourceSummarizer,
  dataSourceSummarizer,
} from './datasource-summarizer.service';

// 类型
export type {
  CollectionJob,
  CollectionJobConfig,
  CollectionJobStatus,
  CollectionSourceType,
  CollectionStats,
  CollectionStrategy,
  RawSourceMetadata,
  HospitalCollectionStatus,
  IncrementalConfig,
  CollectionTargetType,
} from '../../types/knowledge-collection.types';

export {
  CollectionJobStatus,
  CollectionSourceType,
  CollectionTargetType,
  DEFAULT_COLLECTION_STRATEGY,
  DEFAULT_INCREMENTAL_CONFIG,
} from '../../types/knowledge-collection.types';
