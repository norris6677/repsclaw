import { pluginLogger } from './src/utils/plugin-logger';
import { registry } from './src/core/registry';
import {
  SequenceTool,
  createSequenceHandler,
} from './src/core/meta-tools/sequence.tool';
import {
  ParallelTool,
  createParallelHandler,
} from './src/core/meta-tools/parallel.tool';
import {
  ConditionalTool,
  createConditionalHandler,
} from './src/core/meta-tools/conditional.tool';
import { registerFDATools } from './src/domains/query/fda';
import { registerClinicalTrialsTools } from './src/domains/query/clinical-trials';
import { registerPubMedTools } from './src/domains/query/pubmed';
import { registerICD10Tools } from './src/domains/query/icd10';
import { registerMedRxivTools } from './src/domains/query/medrxiv';
import { registerNCIBookshelfTools } from './src/domains/query/nci-bookshelf';
import { registerHospitalNewsTools } from './src/domains/query/hospital-news';
import { registerAllSubscriptionTools } from './src/domains/subscription';
import { registerKnowledgeCollectionTools } from './src/domains/query/knowledge-collection';
import { registerHospitalNewsDigestWorkflow } from './src/orchestration/workflows/hospital-news-digest';
import { HealthAPIService } from './src/integrations/api/health-api.service';
import { HospitalSubscriptionService } from './src/services/hospital-subscription.service';
import { HospitalNewsService } from './src/services/hospital-news/hospital-news.service';
import { DoctorSubscriptionService } from './src/services/doctor-subscription.service';
import { KnowledgeCollectionService } from './src/services/knowledge-collection/knowledge-collection.service';
import { RawSourceManager, rawSourceManager } from './src/services/knowledge-collection/raw-source.manager';
import { CollectionProgressService, collectionProgressService } from './src/services/knowledge-collection/collection-progress.service';
import { AgentStrategyService } from './src/services/knowledge-collection/agent-strategy.service';
import { createLLMClient } from './src/services/llm-client';
import type { OpenClawAPI } from './src/types/openclaw.types';

pluginLogger.lifecycle('loading', {
  cwd: process.cwd(),
  dirname: __dirname,
  filename: __filename,
  nodeEnv: process.env.NODE_ENV,
  logLevel: process.env.REPSCLAW_LOG_LEVEL || 'INFO',
});

const plugin = {
  id: 'repsclaw',
  name: 'Repsclaw Healthcare Plugin',
  version: '2.0.0',
  description:
    'Healthcare data integration with FDA, PubMed, Clinical Trials, ICD-10, medRxiv, NCBI Bookshelf APIs, and Hospital Subscription',

  healthAPI: null as HealthAPIService | null,
  subscriptionService: null as HospitalSubscriptionService | null,
  hospitalNewsService: null as HospitalNewsService | null,
  doctorSubscriptionService: null as DoctorSubscriptionService | null,
  knowledgeCollectionService: null as KnowledgeCollectionService | null,

  register: (api: OpenClawAPI) => {
    pluginLogger.lifecycle('registering');

    const apiCapabilities = {
      hasLogger: !!api.logger,
      hasRegisterHttpRoute: !!api.registerHttpRoute,
      hasRegisterTool: !!api.registerTool,
      hasToolsRegister: !!api.tools?.register,
      hasOn: !!api.on,
      apiKeys: Object.keys(api),
    };

    pluginLogger.info('API 能力检测', apiCapabilities);

    if (!api.logger) {
      pluginLogger.error('API 缺少 logger');
      throw new Error('Repsclaw: API logger is required');
    }

    plugin.healthAPI = new HealthAPIService({
      fda: { apiKey: process.env.FDA_API_KEY },
      pubmed: { apiKey: process.env.PUBMED_API_KEY || process.env.NCBI_API_KEY },
      nciBookshelf: { apiKey: process.env.NCBI_API_KEY },
    });

    plugin.subscriptionService = new HospitalSubscriptionService();
    plugin.hospitalNewsService = new HospitalNewsService(undefined, createLLMClient(api));
    plugin.doctorSubscriptionService = new DoctorSubscriptionService(
      plugin.subscriptionService
    );

    // 初始化知识采集服务
    plugin.knowledgeCollectionService = new KnowledgeCollectionService(
      rawSourceManager,
      undefined,
      collectionProgressService
    );
    const llmClient = createLLMClient(api);
    plugin.knowledgeCollectionService.setAgentStrategyService(new AgentStrategyService(llmClient));

    api.logger.info('🩺 Repsclaw plugin initializing...');

    plugin.registerMetaTools();
    plugin.registerDomainTools();
    plugin.registerWorkflows();
    plugin.registerToOpenClaw(api);
    plugin.registerRoutes(api);

    pluginLogger.lifecycle('registered');
    api.logger.info('✅ Repsclaw plugin registered successfully');
  },

  registerMetaTools: () => {
    const execContext = registry.createContext();

    registry.register(
      {
        ...SequenceTool,
        handler: (args, ctx) =>
          createSequenceHandler(registry)(args, ctx || execContext),
      },
      true
    );

    registry.register(
      {
        ...ParallelTool,
        handler: (args, ctx) =>
          createParallelHandler(registry)(args, ctx || execContext),
      },
      true
    );

    registry.register(
      {
        ...ConditionalTool,
        handler: (args, ctx) =>
          createConditionalHandler(registry)(args, ctx || execContext),
      },
      true
    );

    pluginLogger.info('Meta tools registered');
  },

  registerDomainTools: () => {
    if (!plugin.healthAPI || !plugin.subscriptionService) {
      throw new Error('Services not initialized');
    }

    registerFDATools({ healthAPI: plugin.healthAPI });
    registerClinicalTrialsTools();
    registerPubMedTools({ healthAPI: plugin.healthAPI });
    registerICD10Tools({ healthAPI: plugin.healthAPI });
    registerMedRxivTools({ healthAPI: plugin.healthAPI });
    registerNCIBookshelfTools({ healthAPI: plugin.healthAPI });
    registerHospitalNewsTools({ hospitalNewsService: plugin.hospitalNewsService! });
    registerAllSubscriptionTools({
      subscriptionService: plugin.subscriptionService,
      doctorSubscriptionService: plugin.doctorSubscriptionService!,
    });

    registerKnowledgeCollectionTools({
      collectionService: plugin.knowledgeCollectionService!,
      rawSourceManager,
    });

    pluginLogger.info('Domain tools registered');
  },

  registerWorkflows: () => {
    if (!plugin.subscriptionService || !plugin.doctorSubscriptionService) return;

    registerHospitalNewsDigestWorkflow(
      plugin.subscriptionService,
      plugin.doctorSubscriptionService
    );

    pluginLogger.info('Workflows registered');
  },

  registerToOpenClaw: (api: OpenClawAPI) => {
    const allTools = registry.getAllTools();

    for (const tool of allTools) {
      try {
        const toolConfig = {
          name: tool.name,
          description: buildEnhancedDescription(tool),
          parameters: tool.parameters,
          handler: async (args: unknown) => {
            const context = registry.createContext();
            return tool.handler(args, context);
          },
        };

        if (api.registerTool) {
          api.registerTool(toolConfig);
        } else if (api.tools?.register) {
          api.tools.register(toolConfig);
        }

        pluginLogger.info(`Tool registered: ${tool.name}`);
      } catch (error) {
        pluginLogger.error(`Failed to register tool: ${tool.name}`, error);
      }
    }

    pluginLogger.info(`Total tools registered: ${allTools.length}`);
  },

  registerRoutes: (api: OpenClawAPI) => {
    // Health check routes
    api.registerHttpRoute({
      path: '/api/repsclaw',
      auth: 'gateway',
      handler: (_req, res) => {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            name: 'repsclaw',
            version: '2.0.0',
            description: 'Healthcare data integration plugin',
            endpoints: [
              '/api/repsclaw/health',
              '/api/repsclaw/health/fda',
              '/api/repsclaw/health/pubmed',
              '/api/repsclaw/health/trials',
              '/api/repsclaw/health/icd10',
              '/api/repsclaw/health/medrxiv',
              '/api/repsclaw/health/bookshelf',
              '/api/repsclaw/hospitals',
            ],
            tools: registry.getAllTools().map((t) => t.name),
          })
        );
        return true;
      },
    });

    api.registerHttpRoute({
      path: '/api/repsclaw/health',
      auth: 'gateway',
      handler: (_req, res) => {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            status: 'ok',
            plugin: 'repsclaw',
            version: '2.0.0',
            tools: registry.getAllTools().length,
            timestamp: new Date().toISOString(),
          })
        );
        return true;
      },
    });

    // 注册采集进度 SSE 路由
    try {
      const { registerCollectionProgressRoutes } = require('./src/routes/collection-progress.routes');
      registerCollectionProgressRoutes(api);
    } catch (error) {
      pluginLogger.warn('Collection progress routes registration failed', { error });
    }

    pluginLogger.info('HTTP routes registered');
  },
};

function buildEnhancedDescription(tool: {
  description: string;
  metadata?: {
    composition?: { after?: Array<{ tool: string; reason: string }> };
    triggers?: { keywords?: string[]; patterns?: string[]; intent?: string[] };
  };
}): string {
  let desc = tool.description;

  // 添加触发词和模式（最重要，放在前面）
  const triggers = tool.metadata?.triggers;
  if (triggers && (triggers.keywords?.length || triggers.patterns?.length || triggers.intent?.length)) {
    desc += '\n\n【使用时机】当用户表达以下意图时，必须使用此工具：';

    if (triggers.keywords?.length) {
      desc += `\n- 包含关键词：${triggers.keywords.join('、')}`;
    }

    if (triggers.patterns?.length) {
      desc += `\n- 匹配表达模式：${triggers.patterns.join('、')}`;
    }

    if (triggers.intent?.length) {
      desc += `\n- 用户意图：${triggers.intent.join('、')}`;
    }

    desc += '\n不要询问用户确认，直接调用此工具执行操作。';
  }

  if (tool.metadata?.composition?.after?.length) {
    desc += `\n\n常用后续操作：${tool.metadata.composition.after
      .map((a) => `${a.tool}（${a.reason}）`)
      .join('；')}`;
  }

  return desc;
}

pluginLogger.info('Plugin object created', {
  id: plugin.id,
  version: plugin.version,
});

export default plugin;
