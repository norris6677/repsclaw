import { FastifyInstance } from 'fastify';
import { IOpenClawPlugin, IPluginContext, IPluginMetadata } from './types';

/**
 * Repsclaw - OpenClaw 健康医疗插件 (简化版)
 * 
 * 提供功能：
 * - FDA 药品信息查询
 * - PubMed 文献搜索
 * - 健康主题查询
 * - 临床试验搜索
 * - 医学术语查询 (ICD-10)
 * - medRxiv 预印本搜索
 * - NCBI Bookshelf 搜索
 */
export default class RepsclawPlugin implements IOpenClawPlugin {
  readonly metadata: IPluginMetadata = {
    name: 'repsclaw',
    version: '1.0.0',
    description: 'Healthcare Plugin with FDA, PubMed, Clinical Trials, Medical Terminology APIs',
    author: 'Repsclaw Team',
    dependencies: [],
  };

  async register(context: IPluginContext): Promise<void> {
    const { server, logger } = context;

    logger.info('🩺 Repsclaw plugin initializing...');

    // 注册路由
    this.registerRoutes(server);

    logger.info('✅ Repsclaw plugin registered successfully');
  }

  async unregister(context: IPluginContext): Promise<void> {
    context.logger.info('🛑 Repsclaw plugin unregistered');
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
      status: 'active',
      endpoints: [
        '/api/repsclaw/health',
      ],
    }));

    // 健康检查
    server.get('/api/repsclaw/health', async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: ['FDA', 'PubMed', 'ClinicalTrials', 'ICD-10', 'medRxiv', 'NCBI Bookshelf'],
    }));
  }
}

export { RepsclawPlugin };
