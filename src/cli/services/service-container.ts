/**
 * CLI Service容器
 * 管理所有Service实例的生命周期
 */

import { HealthAPIService } from '../../integrations/api/health-api.service';
import { HospitalSubscriptionService } from '../../services/hospital-subscription.service';
import { DoctorSubscriptionService } from '../../services/doctor-subscription.service';
import { HospitalNewsService } from '../../services/hospital-news/hospital-news.service';
import { KnowledgeCollectionService } from '../../services/knowledge-collection/knowledge-collection.service';
import { CollectionProgressService, collectionProgressService } from '../../services/knowledge-collection/collection-progress.service';
import { RawSourceManager, rawSourceManager } from '../../services/knowledge-collection/raw-source.manager';
import { WikiManager, wikiManager } from '../../services/wiki/wiki-manager.service';
import { WikiIngestService } from '../../services/wiki/wiki-ingest.service';
import { WikiQueryService } from '../../services/wiki/wiki-query.service';
import { WikiLintService } from '../../services/wiki/wiki-lint.service';
import { createLLMClient } from '../../services/llm-client';
import { AgentStrategyService } from '../../services/knowledge-collection/agent-strategy.service';
import { createLogger } from '../../utils/plugin-logger';

const logger = createLogger('REPSCLAW:CLI');

export interface ServiceContainer {
  healthAPI: HealthAPIService;
  hospitalSubscription: HospitalSubscriptionService;
  doctorSubscription: DoctorSubscriptionService;
  hospitalNews: HospitalNewsService;
  knowledgeCollection: KnowledgeCollectionService;
  progressService: CollectionProgressService;
  rawSourceManager: RawSourceManager;
  wikiManager: WikiManager;
  wikiIngest: WikiIngestService;
  wikiQuery: WikiQueryService;
  wikiLint: WikiLintService;
}

let container: ServiceContainer | null = null;

export function initializeServices(): ServiceContainer {
  if (container) {
    return container;
  }

  logger.info('Initializing CLI services...');

  const healthAPI = new HealthAPIService({
    fda: { apiKey: process.env.FDA_API_KEY },
    pubmed: { apiKey: process.env.PUBMED_API_KEY || process.env.NCBI_API_KEY },
    nciBookshelf: { apiKey: process.env.NCBI_API_KEY },
  });

  const hospitalSubscription = new HospitalSubscriptionService();

  // 创建知识采集服务，注入进度服务
  const knowledgeCollection = new KnowledgeCollectionService(
    rawSourceManager,
    undefined,
    collectionProgressService
  );

  // 创建医生订阅服务，注入采集服务
  const doctorSubscription = new DoctorSubscriptionService(
    hospitalSubscription,
    undefined,
    knowledgeCollection
  );

  const hospitalNews = new HospitalNewsService();

  // Wiki 服务
  const llmClient = createLLMClient();
  const wikiIngest = new WikiIngestService(wikiManager, llmClient);
  const wikiQuery = new WikiQueryService(wikiManager, llmClient);
  const wikiLint = new WikiLintService(wikiManager);

  // 将 WikiIngest 注入到知识采集服务
  knowledgeCollection.setWikiIngestService(wikiIngest);

  // 将 AgentStrategy 注入到知识采集服务
  const agentStrategy = new AgentStrategyService(llmClient);
  knowledgeCollection.setAgentStrategyService(agentStrategy);

  container = {
    healthAPI,
    hospitalSubscription,
    doctorSubscription,
    hospitalNews,
    knowledgeCollection,
    progressService: collectionProgressService,
    rawSourceManager,
    wikiManager,
    wikiIngest,
    wikiQuery,
    wikiLint,
  };

  logger.info('CLI services initialized');
  return container;
}

export function getServices(): ServiceContainer {
  if (!container) {
    return initializeServices();
  }
  return container;
}

export function resetServices(): void {
  container = null;
}
