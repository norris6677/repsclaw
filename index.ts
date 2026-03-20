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
import { registerHospitalNewsDigestWorkflow } from './src/orchestration/workflows/hospital-news-digest';
import { HealthAPIService } from './src/integrations/api/health-api.service';
import { HospitalSubscriptionService } from './src/services/hospital-subscription.service';
import { HospitalNewsService } from './src/services/hospital-news/hospital-news.service';
import { DoctorSubscriptionService } from './src/services/doctor-subscription.service';
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

  register(api: OpenClawAPI) {
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

    this.healthAPI = new HealthAPIService({
      fda: { apiKey: process.env.FDA_API_KEY },
      pubmed: { apiKey: process.env.PUBMED_API_KEY || process.env.NCBI_API_KEY },
      nciBookshelf: { apiKey: process.env.NCBI_API_KEY },
    });

    this.subscriptionService = new HospitalSubscriptionService();
    this.hospitalNewsService = new HospitalNewsService();
    this.doctorSubscriptionService = new DoctorSubscriptionService(
      this.subscriptionService
    );

    api.logger.info('🩺 Repsclaw plugin initializing...');

    this.registerMetaTools();
    this.registerDomainTools();
    this.registerWorkflows();
    this.registerToOpenClaw(api);
    this.registerRoutes(api);

    pluginLogger.lifecycle('registered');
    api.logger.info('✅ Repsclaw plugin registered successfully');
  },

  registerMetaTools() {
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

  registerDomainTools() {
    if (!this.healthAPI || !this.subscriptionService) {
      throw new Error('Services not initialized');
    }

    registerFDATools({ healthAPI: this.healthAPI });
    registerClinicalTrialsTools();
    registerPubMedTools({ healthAPI: this.healthAPI });
    registerICD10Tools({ healthAPI: this.healthAPI });
    registerMedRxivTools({ healthAPI: this.healthAPI });
    registerNCIBookshelfTools({ healthAPI: this.healthAPI });
    registerHospitalNewsTools({ hospitalNewsService: this.hospitalNewsService! });
    registerAllSubscriptionTools({
      subscriptionService: this.subscriptionService,
      doctorSubscriptionService: this.doctorSubscriptionService!,
    });

    pluginLogger.info('Domain tools registered');
  },

  registerWorkflows() {
    if (!this.subscriptionService || !this.doctorSubscriptionService) return;

    registerHospitalNewsDigestWorkflow(
      this.subscriptionService,
      this.doctorSubscriptionService
    );

    pluginLogger.info('Workflows registered');
  },

  registerToOpenClaw(api: OpenClawAPI) {
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

  registerRoutes(api: OpenClawAPI) {
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

    pluginLogger.info('HTTP routes registered');
  },
};

function buildEnhancedDescription(tool: {
  description: string;
  metadata?: {
    composition?: { after?: Array<{ tool: string; reason: string }> };
    triggers?: { keywords?: string[] };
  };
}): string {
  let desc = tool.description;

  if (tool.metadata?.composition?.after?.length) {
    desc += `\n\n常用后续操作：${tool.metadata.composition.after
      .map((a) => `${a.tool}（${a.reason}）`)
      .join('；')}`;
  }

  if (tool.metadata?.triggers?.keywords?.length) {
    desc += `\n触发词：${tool.metadata.triggers.keywords.join('、')}`;
  }

  return desc;
}

pluginLogger.info('Plugin object created', {
  id: plugin.id,
  version: plugin.version,
});

export default plugin;
