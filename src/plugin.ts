import { FastifyInstance } from 'fastify';
import { IOpenClawPlugin, IPluginContext, IPluginMetadata } from './types';
import { HealthAPIService } from './integrations';
import { RAGService, ComplianceService, CrawlerService } from './services';

/**
 * Repsclaw - OpenClaw 健康医疗插件
 * 
 * 提供功能：
 * - FDA 药品信息查询
 * - PubMed 文献搜索
 * - 健康主题查询
 * - 临床试验搜索
 * - 医学术语查询 (ICD-10)
 * - medRxiv 预印本搜索
 * - NCBI Bookshelf 搜索
 * - RAG (检索增强生成)
 * - 合规性检查
 * - 网络爬虫服务
 */
export default class RepsclawPlugin implements IOpenClawPlugin {
  readonly metadata: IPluginMetadata = {
    name: 'repsclaw',
    version: '1.0.0',
    description: 'Healthcare Plugin with FDA, PubMed, Clinical Trials, Medical Terminology APIs',
    author: 'Repsclaw Team',
    dependencies: [],
  };

  private healthAPI?: HealthAPIService;
  private services: Map<string, unknown> = new Map();

  async register(context: IPluginContext): Promise<void> {
    const { server, config, logger } = context;

    logger.info('🩺 Repsclaw plugin initializing...');

    // 初始化健康 API 服务
    this.healthAPI = new HealthAPIService({
      fda: { apiKey: config.FDA_API_KEY },
      pubmed: { apiKey: config.PUBMED_API_KEY || config.NCBI_API_KEY },
      nciBookshelf: { apiKey: config.NCBI_API_KEY },
    });

    this.services.set('healthAPI', this.healthAPI);

    // 注册服务到 OpenClaw 服务注册表
    this.registerServices(context);

    // 注册路由
    this.registerRoutes(server);

    logger.info('✅ Repsclaw plugin registered successfully');
  }

  async unregister(context: IPluginContext): Promise<void> {
    context.logger.info('🛑 Repsclaw plugin unregistered');
  }

  /**
   * 注册服务到 OpenClaw 服务注册表
   */
  private registerServices(context: IPluginContext): void {
    const { services, logger } = context;

    // 注册健康 API 服务
    if (this.healthAPI) {
      services.register('repsclaw:health', this.healthAPI);
      logger.debug('Health API service registered');
    }

    // 可以在这里注册其他内部服务
  }

  /**
   * 注册 API 路由
   */
  private registerRoutes(server: FastifyInstance): void {
    // 插件信息
    server.get('/api/repsclaw', async () => ({
      name: 'repsclaw',
      version: '1.0.0',
      description: 'Healthcare data integration plugin',
      endpoints: [
        '/api/repsclaw/health/fda',
        '/api/repsclaw/health/pubmed',
        '/api/repsclaw/health/topics',
        '/api/repsclaw/health/trials',
        '/api/repsclaw/health/icd10',
        '/api/repsclaw/health/medrxiv',
        '/api/repsclaw/health/bookshelf',
      ],
    }));

    // FDA 药品查询
    server.get('/api/repsclaw/health/fda', async (request) => {
      const { query, type = 'general' } = request.query as { query: string; type?: string };
      if (!this.healthAPI) throw new Error('Health API not initialized');
      return this.healthAPI.lookupDrug({ drugName: query, searchType: type as any });
    });

    // PubMed 文献搜索
    server.get('/api/repsclaw/health/pubmed', async (request) => {
      const { q, limit = 10 } = request.query as { q: string; limit?: number };
      if (!this.healthAPI) throw new Error('Health API not initialized');
      return this.healthAPI.searchPubMed({ query: q, maxResults: limit });
    });

    // 健康主题查询
    server.get('/api/repsclaw/health/topics', async (request) => {
      const { topic, lang = 'en' } = request.query as { topic: string; lang?: 'en' | 'es' };
      if (!this.healthAPI) throw new Error('Health API not initialized');
      return this.healthAPI.getHealthTopics({ topic, language: lang });
    });

    // 临床试验搜索
    server.get('/api/repsclaw/health/trials', async (request) => {
      const { condition, status = 'recruiting', limit = 10 } = request.query as { 
        condition: string; 
        status?: any; 
        limit?: number 
      };
      if (!this.healthAPI) throw new Error('Health API not initialized');
      return this.healthAPI.searchClinicalTrials({ condition, status, maxResults: limit });
    });

    // ICD-10 医学术语查询
    server.get('/api/repsclaw/health/icd10', async (request) => {
      const { code, desc, limit = 10 } = request.query as { code?: string; desc?: string; limit?: number };
      if (!this.healthAPI) throw new Error('Health API not initialized');
      return this.healthAPI.lookupICDCode({ code, description: desc, maxResults: limit });
    });

    // medRxiv 预印本搜索
    server.get('/api/repsclaw/health/medrxiv', async (request) => {
      const { q, limit = 10 } = request.query as { q: string; limit?: number };
      if (!this.healthAPI) throw new Error('Health API not initialized');
      return this.healthAPI.searchMedRxiv({ query: q, maxResults: limit });
    });

    // NCBI Bookshelf 搜索
    server.get('/api/repsclaw/health/bookshelf', async (request) => {
      const { q, limit = 10 } = request.query as { q: string; limit?: number };
      if (!this.healthAPI) throw new Error('Health API not initialized');
      return this.healthAPI.searchNciBookshelf({ query: q, maxResults: limit });
    });
  }
}

// 导出插件类
export { RepsclawPlugin };
