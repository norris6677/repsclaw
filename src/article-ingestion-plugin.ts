/**
 * Article Ingestion Plugin Registration
 * 文章采集插件注册
 *
 * 将文章采集能力集成到 OpenClaw 插件系统
 *
 * 配置来源（自动读取，无需手动传入）：
 * 1. OpenClaw settings.json: repsclaw.articleIngestion.*
 * 2. 环境变量: FEISHU_APP_ID, FEISHU_APP_SECRET
 * 3. OpenClaw 全局配置: feishu.appId, feishu.appSecret
 */

import type { OpenClawAPI } from './types/openclaw.types';
import type { IOpenClawPlugin, IPluginContext } from './types/plugin';
import { createArticleIngestionModule } from './services/article-ingestion';
import { rawSourceManager } from './services/knowledge-collection/raw-source.manager';
import { wikiManager } from './services/wiki/wiki-manager.service';
import { WikiIngestService } from './services/wiki/wiki-ingest.service';
import { createLLMClient } from './services/llm-client';
import { HospitalSubscriptionService } from './services/hospital-subscription.service';
import { DoctorSubscriptionService } from './services/doctor-subscription.service';
import { createConfigAdapter, validateConfig } from './services/article-ingestion/config-adapter';
import {
  QuickSaveArticleTool,
  createQuickSaveArticleHandler,
  AnalyzeUrlTool,
  createAnalyzeUrlHandler,
  SaveToTargetTool,
  createSaveToTargetHandler,
  GetSaveSuggestionsTool,
  BatchSaveTool,
} from './tools/article-ingestion.tool';
import { createLogger } from './utils/plugin-logger';

const logger = createLogger('REPSCLAW:INGESTION-PLUGIN');

/**
 * 注册文章采集功能到 OpenClaw
 *
 * 配置自动从以下位置读取（按优先级）：
 * 1. OpenClaw settings.json: repsclaw.articleIngestion.feishu.appId
 * 2. 环境变量: FEISHU_APP_ID, FEISHU_APP_SECRET
 * 3. OpenClaw 全局配置: feishu.appId
 *
 * 示例 settings.json:
 * {
 *   "repsclaw": {
 *     "articleIngestion": {
 *       "feishu": {
 *         "appId": "cli_xxxxxx",
 *         "appSecret": "xxxxxx"
 *       }
 *     }
 *   }
 * }
 *
 * @param openclaw OpenClaw API 实例
 * @param context 插件上下文（用于读取配置）
 */
export async function registerArticleIngestion(
  openclaw: OpenClawAPI,
  context?: IPluginContext
): Promise<void> {
  logger.info('Registering article ingestion module...');

  // 1. 自动读取配置
  const configAdapter = createConfigAdapter(context?.config || {});
  const validation = validateConfig(configAdapter);

  if (!validation.valid) {
    logger.warn('Article ingestion configuration incomplete, module disabled');
    logger.warn(validation.message);

    // 注册一个提示工具，告知用户如何配置
    if (openclaw.tools) {
      openclaw.tools.register({
        name: 'article_ingestion_status',
        description: '查看文章采集模块配置状态',
        parameters: { type: 'object', properties: {} },
        handler: async () => ({
          status: 'disabled',
          reason: 'Configuration incomplete',
          missing: validation.missing,
          setup: {
            method1: '在 settings.json 中添加 repsclaw.articleIngestion.feishu.appId/appSecret',
            method2: '设置环境变量 FEISHU_APP_ID 和 FEISHU_APP_SECRET',
            docs: 'https://github.com/your-repo/repsclaw/blob/main/ARTICLE_INGESTION_GUIDE.md',
          },
        }),
      });
    }

    return;
  }

  const config = configAdapter.getConfig();
  logger.info('Article ingestion configuration loaded successfully');

  // 2. 创建 Wiki 和订阅服务
  const llmClient = createLLMClient(openclaw);
  const wikiIngest = new WikiIngestService(wikiManager, llmClient);
  const hospitalSubscription = new HospitalSubscriptionService();
  const doctorSubscription = new DoctorSubscriptionService(hospitalSubscription);

  // 3. 创建文章采集服务
  const ingestionService = await createArticleIngestionModule(
    llmClient,
    rawSourceManager,
    config,
    wikiIngest,
    hospitalSubscription,
    doctorSubscription
  );

  // 2. 启动飞书连接
  await ingestionService.start();

  // 3. 注册 OpenClaw 工具
  if (openclaw.tools) {
    // Tool 1: 智能保存
    openclaw.tools.register({
      ...QuickSaveArticleTool,
      handler: createQuickSaveArticleHandler(ingestionService),
    });

    // Tool 2: 分析 URL
    openclaw.tools.register({
      ...AnalyzeUrlTool,
      handler: createAnalyzeUrlHandler(),
    });

    // Tool 3: 指定目标保存
    openclaw.tools.register({
      ...SaveToTargetTool,
      handler: createSaveToTargetHandler(rawSourceManager),
    });

    // Tool 4: 获取保存建议（骨架实现）
    openclaw.tools.register({
      ...GetSaveSuggestionsTool,
      handler: async () => ({
        status: 'success',
        message: '建议功能开发中',
      }),
    });

    // Tool 5: 批量保存（骨架实现）
    openclaw.tools.register({
      ...BatchSaveTool,
      handler: async () => ({
        status: 'success',
        message: '批量保存功能开发中',
      }),
    });

    logger.info('Article ingestion tools registered');
  }

  // 4. 注册 HTTP 路由（状态查询）
  openclaw.registerHttpRoute({
    path: '/article-ingestion/status',
    auth: 'none',
    handler: async (req, res) => {
      const status = ingestionService.getStatus();
      res.statusCode = 200;
      res.end(JSON.stringify(status));
      return true;
    },
  });

  // 5. 监听事件
  ingestionService.on('article:saved', (data) => {
    logger.info('Article saved', {
      userId: data.userId,
      title: data.metadata.title,
      hospital: data.target.hospitalName,
    });
  });

  ingestionService.on('feishu:connected', () => {
    logger.info('Feishu WebSocket connected');
  });

  ingestionService.on('feishu:disconnected', () => {
    logger.warn('Feishu WebSocket disconnected');
  });

  logger.info('Article ingestion module registered successfully');
}

/**
 * 文章采集插件类
 * 独立的插件实现，可直接注册到 OpenClaw
 */
export class ArticleIngestionPlugin implements IOpenClawPlugin {
  readonly metadata = {
    name: 'article-ingestion',
    version: '1.0.0',
    description: '智能文章采集与保存 - 支持飞书等多平台IM接入',
    author: 'Repsclaw Team',
    dependencies: ['repsclaw'], // 依赖主插件
  };

  private ingestionService?: Awaited<ReturnType<typeof createArticleIngestionModule>>;

  async register(context: IPluginContext): Promise<void> {
    // 自动从 context.config 读取配置
    // 支持以下配置路径：
    // - repsclaw.articleIngestion.feishu.appId
    // - repsclaw.feishu.appId
    // - feishu.appId
    // - 环境变量 FEISHU_APP_ID
    await registerArticleIngestion(context as unknown as OpenClawAPI, context);
  }

  async unregister(): Promise<void> {
    if (this.ingestionService) {
      await this.ingestionService.stop();
    }
  }
}

export default ArticleIngestionPlugin;
