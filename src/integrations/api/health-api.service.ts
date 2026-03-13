import { IExternalAPIConfig, ICrawledPage } from '../../types';
import { FDAClient } from './fda.client';
import { PubMedClient } from './pubmed.client';
import { ClinicalTrialsClient } from './clinical-trials.client';
import { MedicalTerminologyClient } from './medical-terminology.client';
import { MedRxivClient } from './medrxiv.client';
import { NciBookshelfClient } from './nci-bookshelf.client';

/**
 * 健康 API 服务
 * 统一管理和访问所有医疗相关的 API 客户端
 * 
 * 支持为每个 API 配置限流参数 (rateLimit)
 * 例如：
 *   rateLimit: { requestsPerSecond: 3, burstSize: 5 }
 */
export class HealthAPIService {
  private fdaClient: FDAClient;
  private pubmedClient: PubMedClient;
  private clinicalTrialsClient: ClinicalTrialsClient;
  private medicalTerminologyClient: MedicalTerminologyClient;
  private medrxivClient: MedRxivClient;
  private nciBookshelfClient: NciBookshelfClient;

  constructor(config?: {
    fda?: Partial<IExternalAPIConfig>;
    pubmed?: Partial<IExternalAPIConfig>;
    clinicalTrials?: Partial<IExternalAPIConfig>;
    medicalTerminology?: Partial<IExternalAPIConfig>;
    medrxiv?: Partial<IExternalAPIConfig>;
    nciBookshelf?: Partial<IExternalAPIConfig>;
  }) {
    this.fdaClient = new FDAClient({
      source: 'fda',
      baseUrl: 'https://api.fda.gov/drug',
      apiKey: config?.fda?.apiKey,
      rateLimit: config?.fda?.rateLimit,
    });

    this.pubmedClient = new PubMedClient({
      source: 'pubmed',
      baseUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',
      apiKey: config?.pubmed?.apiKey,
      rateLimit: config?.pubmed?.rateLimit,
    });

    this.clinicalTrialsClient = new ClinicalTrialsClient({
      source: 'clinical_trials',
      baseUrl: 'https://clinicaltrials.gov/api/v2',
      rateLimit: config?.clinicalTrials?.rateLimit,
    });

    this.medicalTerminologyClient = new MedicalTerminologyClient({
      source: 'medical_terminology',
      baseUrl: 'https://clinicaltables.nlm.nih.gov/api/icd10cm/v3',
      rateLimit: config?.medicalTerminology?.rateLimit,
    });

    this.medrxivClient = new MedRxivClient({
      source: 'medrxiv',
      baseUrl: 'https://api.medrxiv.org',
      rateLimit: config?.medrxiv?.rateLimit,
    });

    this.nciBookshelfClient = new NciBookshelfClient({
      source: 'ncbi_bookshelf',
      baseUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',
      apiKey: config?.nciBookshelf?.apiKey,
      rateLimit: config?.nciBookshelf?.rateLimit,
    });
  }

  // ==================== FDA Drug Information ====================

  /**
   * 查找药品信息
   */
  async lookupDrug(params: {
    drugName: string;
    searchType?: 'general' | 'label' | 'adverse_events';
  }) {
    return this.fdaClient.lookupDrug(params);
  }

  /**
   * 搜索药品
   */
  async searchDrugs(params: { query: string; limit?: number }): Promise<ICrawledPage[]> {
    return this.fdaClient.searchDrugs(params);
  }

  // ==================== PubMed Research ====================

  /**
   * 搜索 PubMed 文献
   */
  async searchPubMed(params: {
    query: string;
    maxResults?: number;
    sort?: 'relevance' | 'date';
    dateRange?: string;
    openAccess?: boolean;
  }) {
    return this.pubmedClient.search(params);
  }

  /**
   * 搜索 PubMed 并返回标准格式
   */
  async searchPubMedAsPages(params: {
    query: string;
    maxResults?: number;
    sort?: 'relevance' | 'date';
    dateRange?: string;
    openAccess?: boolean;
  }): Promise<ICrawledPage[]> {
    return this.pubmedClient.searchAsPages(params);
  }

  // ==================== Clinical Trials ====================

  /**
   * 搜索临床试验
   */
  async searchClinicalTrials(params: {
    condition: string;
    status?: 'recruiting' | 'completed' | 'active' | 'not_recruiting' | 'all';
    maxResults?: number;
  }) {
    return this.clinicalTrialsClient.searchTrials(params);
  }

  /**
   * 搜索临床试验并返回标准格式
   */
  async searchClinicalTrialsAsPages(params: {
    query: string;
    status?: 'recruiting' | 'completed' | 'active' | 'not_recruiting' | 'all';
    maxResults?: number;
  }): Promise<ICrawledPage[]> {
    return this.clinicalTrialsClient.search({
      query: params.query,
      status: params.status,
      maxResults: params.maxResults,
    });
  }

  // ==================== Medical Terminology ====================

  /**
   * 查找 ICD-10 代码
   */
  async lookupICDCode(params: {
    code?: string;
    description?: string;
    maxResults?: number;
  }) {
    return this.medicalTerminologyClient.lookupICDCode(params);
  }

  /**
   * 搜索医学术语
   */
  async searchMedicalTerminology(params: {
    query: string;
    maxResults?: number;
  }): Promise<ICrawledPage[]> {
    return this.medicalTerminologyClient.search(params);
  }

  /**
   * 验证 ICD-10 代码
   */
  async validateICDCode(code: string): Promise<boolean> {
    return this.medicalTerminologyClient.validateCode(code);
  }

  // ==================== medRxiv Search ====================

  /**
   * 搜索 medRxiv 预印本
   */
  async searchMedRxiv(params: {
    query: string;
    maxResults?: number;
    days?: number;
    server?: 'medrxiv' | 'biorxiv';
  }) {
    return this.medrxivClient.search(params);
  }

  /**
   * 搜索 medRxiv 并返回标准格式
   */
  async searchMedRxivAsPages(params: {
    query: string;
    maxResults?: number;
    days?: number;
    server?: 'medrxiv' | 'biorxiv';
  }): Promise<ICrawledPage[]> {
    return this.medrxivClient.searchAsPages(params);
  }

  /**
   * 获取最新预印本
   */
  async getRecentMedRxivPapers(params: {
    maxResults?: number;
    days?: number;
    server?: 'medrxiv' | 'biorxiv';
  } = {}) {
    return this.medrxivClient.getRecentPapers(params);
  }

  // ==================== NCBI Bookshelf ====================

  /**
   * 搜索 NCBI Bookshelf
   */
  async searchNciBookshelf(params: {
    query: string;
    maxResults?: number;
  }) {
    return this.nciBookshelfClient.search(params);
  }

  /**
   * 搜索 NCBI Bookshelf 并返回标准格式
   */
  async searchNciBookshelfAsPages(params: {
    query: string;
    maxResults?: number;
  }): Promise<ICrawledPage[]> {
    return this.nciBookshelfClient.searchAsPages(params);
  }

  /**
   * 获取书籍详情
   */
  async getNciBookDetails(bookId: string) {
    return this.nciBookshelfClient.getBookDetails(bookId);
  }

  // ==================== 通用搜索方法 ====================

  /**
   * 在所有健康数据源中搜索
   */
  async searchAll(params: {
    query: string;
    sources?: Array<'fda' | 'pubmed' | 'clinical_trials' | 
                     'medical_terminology' | 'medrxiv' | 'ncbi_bookshelf'>;
    maxResults?: number;
  }): Promise<Record<string, ICrawledPage[]>> {
    const { query, sources, maxResults = 10 } = params;
    
    const allSources = [
      'fda', 'pubmed', 'clinical_trials', 
      'medical_terminology', 'medrxiv', 'ncbi_bookshelf'
    ] as const;
    
    const targetSources = sources || allSources;
    const results: Record<string, ICrawledPage[]> = {};

    const searchPromises: Promise<void>[] = [];

    if (targetSources.includes('fda')) {
      searchPromises.push(
        this.searchDrugs({ query, limit: maxResults })
          .then(pages => { results.fda = pages; })
          .catch(() => { results.fda = []; })
      );
    }

    if (targetSources.includes('pubmed')) {
      searchPromises.push(
        this.searchPubMedAsPages({ query, maxResults })
          .then(pages => { results.pubmed = pages; })
          .catch(() => { results.pubmed = []; })
      );
    }

    if (targetSources.includes('clinical_trials')) {
      searchPromises.push(
        this.searchClinicalTrialsAsPages({ query, maxResults })
          .then(pages => { results.clinical_trials = pages; })
          .catch(() => { results.clinical_trials = []; })
      );
    }

    if (targetSources.includes('medical_terminology')) {
      searchPromises.push(
        this.searchMedicalTerminology({ query, maxResults })
          .then(pages => { results.medical_terminology = pages; })
          .catch(() => { results.medical_terminology = []; })
      );
    }

    if (targetSources.includes('medrxiv')) {
      searchPromises.push(
        this.searchMedRxivAsPages({ query, maxResults })
          .then(pages => { results.medrxiv = pages; })
          .catch(() => { results.medrxiv = []; })
      );
    }

    if (targetSources.includes('ncbi_bookshelf')) {
      searchPromises.push(
        this.searchNciBookshelfAsPages({ query, maxResults })
          .then(pages => { results.ncbi_bookshelf = pages; })
          .catch(() => { results.ncbi_bookshelf = []; })
      );
    }

    await Promise.all(searchPromises);

    return results;
  }

  // ==================== Getters ====================

  get fda() { return this.fdaClient; }
  get pubmed() { return this.pubmedClient; }
  get clinicalTrials() { return this.clinicalTrialsClient; }
  get medicalTerminology() { return this.medicalTerminologyClient; }
  get medrxiv() { return this.medrxivClient; }
  get nciBookshelf() { return this.nciBookshelfClient; }
}
