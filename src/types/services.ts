/**
 * RAG (Retrieval-Augmented Generation) 相关类型
 */

export interface IEmbeddingConfig {
  model: string;
  dimensions: number;
  apiKey?: string;
  baseUrl?: string;
}

export interface IVectorDocument {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding?: number[];
}

export interface ISearchResult {
  document: IVectorDocument;
  score: number;
}

export interface IRAGQuery {
  query: string;
  topK?: number;
  filters?: Record<string, unknown>;
  minScore?: number;
}

export interface IRAGResponse {
  results: ISearchResult[];
  context: string;
  sources: string[];
}

/**
 * Compliance (合规检查) 相关类型
 */

export interface IComplianceRule {
  id: string;
  name: string;
  description: string;
  category: ComplianceCategory;
  severity: SeverityLevel;
  checkFunction: (content: string) => Promise<IComplianceCheckResult>;
}

export type ComplianceCategory = 
  | 'medical'
  | 'legal'
  | 'financial'
  | 'privacy'
  | 'copyright'
  | 'custom';

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface IComplianceCheckResult {
  passed: boolean;
  ruleId: string;
  violations: IViolation[];
  suggestions?: string[];
}

export interface IViolation {
  message: string;
  location?: { start: number; end: number };
  severity: SeverityLevel;
}

export interface IComplianceReport {
  documentId: string;
  timestamp: Date;
  overallStatus: 'passed' | 'failed';
  results: IComplianceCheckResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    violationsBySeverity: Record<SeverityLevel, number>;
  };
}

/**
 * Crawler (爬虫) 相关类型
 */

export interface ICrawlConfig {
  /** 目标URL */
  url: string;
  /** 爬取深度 */
  depth?: number;
  /** 最大页面数 */
  maxPages?: number;
  /** 请求间隔(ms) */
  delay?: number;
  /** 用户代理 */
  userAgent?: string;
  /** 请求超时(ms) */
  timeout?: number;
  /** 请求头 */
  headers?: Record<string, string>;
  /** 代理配置 */
  proxy?: {
    host: string;
    port: number;
    auth?: { username: string; password: string };
  };
}

export interface ICrawledPage {
  url: string;
  title: string;
  content: string;
  html?: string;
  metadata: {
    crawledAt: Date;
    statusCode: number;
    contentType: string;
    links: string[];
  };
}

export interface ICrawlResult {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  pages: ICrawledPage[];
  errors: ICrawlError[];
  stats: {
    totalPages: number;
    successCount: number;
    errorCount: number;
    startTime: Date;
    endTime?: Date;
  };
}

export interface ICrawlError {
  url: string;
  message: string;
  timestamp: Date;
}

/**
 * 数据源类型
 */
export type DataSource = 
  | 'pubmed' 
  | 'cnki' 
  | 'arxiv' 
  | 'fda'
  | 'health_topics'
  | 'clinical_trials'
  | 'medical_terminology'
  | 'medrxiv'
  | 'ncbi_bookshelf'
  | 'custom';

export interface IExternalAPIConfig {
  source: DataSource;
  apiKey?: string;
  baseUrl: string;
  rateLimit?: {
    requestsPerSecond: number;
    burstSize: number;
  };
}
