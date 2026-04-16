/**
 * Article Ingestion Module
 * 文章采集模块 - 统一导出
 */

export { ArticleIngestionService } from './article-ingestion.service';
export { SessionManager } from './session-manager';
export { IntentEngine } from './intent-engine';
export { FeishuAdapter } from './feishu-adapter';
export {
  ConfigAdapter,
  createConfigAdapter,
  validateConfig,
  type ArticleIngestionConfig,
} from './config-adapter';

export * from './types';

// 模块初始化辅助函数
import type { LLMClient } from '../llm-client';
import type { RawSourceManager } from '../knowledge-collection/raw-source.manager';
import { ArticleIngestionService } from './article-ingestion.service';
import type { ArticleIngestionConfig } from './config-adapter';
import type { WikiIngestService } from '../wiki/wiki-ingest.service';
import type { HospitalSubscriptionService } from '../hospital-subscription.service';
import type { DoctorSubscriptionService } from '../doctor-subscription.service';

export async function createArticleIngestionModule(
  llmClient: LLMClient,
  rawSourceManager: RawSourceManager,
  config: ArticleIngestionConfig,
  wikiIngestService?: WikiIngestService,
  hospitalSubscription?: HospitalSubscriptionService,
  doctorSubscription?: DoctorSubscriptionService
): Promise<ArticleIngestionService> {
  const service = new ArticleIngestionService(
    llmClient,
    rawSourceManager,
    config,
    wikiIngestService,
    hospitalSubscription,
    doctorSubscription
  );
  return service;
}
