export { RAGService, IVectorStore } from './rag.service';
export { ComplianceService } from './compliance.service';
export { CrawlerService } from './crawler.service';
export { CrawleeCrawlerService, crawleeCrawler } from './crawlee-crawler.service';
export {
  convertWebToMarkdown,
  type WebToMarkdownOptions,
  type WebToMarkdownResult,
} from './web-to-markdown.service';

// Knowledge Collection Services
export {
  KnowledgeCollectionService,
  RawSourceManager,
  rawSourceManager,
  ScheduledTaskService,
} from './knowledge-collection';

export {
  EnhancedHospitalSubscriptionService,
} from './hospital-subscription-enhanced.service';

// Article Ingestion Services
export {
  ArticleIngestionService,
  SessionManager,
  IntentEngine,
  FeishuAdapter,
  ConfigAdapter,
  createConfigAdapter,
  validateConfig,
  type ArticleIngestionConfig,
} from './article-ingestion';

// Deduplication Utilities
export {
  hashUrl,
  hashTitle,
  hashContent,
  normalizeUrl,
  normalizeTitle,
  calculateSimilarity,
  DeduplicationChecker,
} from '../utils/deduplication';
