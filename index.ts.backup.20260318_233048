import { pluginLogger } from './src/utils/plugin-logger';
import {
  // Clinical Trials
  ClinicalTrialsTool,
  createClinicalTrialsHandler,
  CLINICAL_TRIALS_TOOL_NAME,
  // FDA
  FDATool,
  createFDAHandler,
  FDA_TOOL_NAME,
  // PubMed
  PubMedTool,
  createPubMedHandler,
  PUBMED_TOOL_NAME,
  // ICD-10
  ICD10Tool,
  createICD10Handler,
  ICD10_TOOL_NAME,
  // medRxiv
  MedRxivTool,
  createMedRxivHandler,
  MEDRXIV_TOOL_NAME,
  // NCBI Bookshelf
  NCIBookshelfTool,
  createNCIBookshelfHandler,
  NCI_BOOKSHELF_TOOL_NAME,
  // Hospital Subscription
  SubscribeHospitalTool,
  createSubscribeHospitalHandler,
  SUBSCRIBE_HOSPITAL_TOOL_NAME,
  ListHospitalsTool,
  createListHospitalsHandler,
  LIST_HOSPITALS_TOOL_NAME,
  UnsubscribeHospitalTool,
  createUnsubscribeHospitalHandler,
  UNSUBSCRIBE_HOSPITAL_TOOL_NAME,
  SetPrimaryHospitalTool,
  createSetPrimaryHospitalHandler,
  SET_PRIMARY_HOSPITAL_TOOL_NAME,
  CheckSubscriptionStatusTool,
  createCheckSubscriptionStatusHandler,
  CHECK_SUBSCRIPTION_STATUS_TOOL_NAME,
  // Hospital News
  GetHospitalNewsTool,
  createGetHospitalNewsHandler,
  GET_HOSPITAL_NEWS_TOOL_NAME,
  // Doctor Subscription
  SubscribeDoctorTool,
  createSubscribeDoctorHandler,
  SUBSCRIBE_DOCTOR_TOOL_NAME,
  ListDoctorsTool,
  createListDoctorsHandler,
  LIST_DOCTORS_TOOL_NAME,
  UnsubscribeDoctorTool,
  createUnsubscribeDoctorHandler,
  UNSUBSCRIBE_DOCTOR_TOOL_NAME,
  SetPrimaryDoctorTool,
  createSetPrimaryDoctorHandler,
  SET_PRIMARY_DOCTOR_TOOL_NAME,
  CheckDoctorSubscriptionStatusTool,
  createCheckDoctorSubscriptionStatusHandler,
  CHECK_DOCTOR_SUBSCRIPTION_STATUS_TOOL_NAME,
  // Unified Subscription Query
  GetSubscriptionsTool,
  createGetSubscriptionsHandler,
  createListHospitalsCompatHandler,
  createListDoctorsCompatHandler,
  GET_SUBSCRIPTIONS_TOOL_NAME,
} from './src/tools';
import { HealthAPIService } from './src/integrations/api/health-api.service';
import { HospitalSubscriptionService } from './src/services/hospital-subscription.service';
import { HospitalNewsService } from './src/services/hospital-news/hospital-news.service';
import { DoctorSubscriptionService } from './src/services/doctor-subscription.service';

// ========== 插件加载开始 ==========
pluginLogger.lifecycle('loading', {
  cwd: process.cwd(),
  dirname: __dirname,
  filename: __filename,
  nodeEnv: process.env.NODE_ENV,
  logLevel: process.env.REPSCLAW_LOG_LEVEL || 'INFO',
});

/**
 * OpenClaw API 类型定义
 */
interface OpenClawAPI {
  logger: {
    info: (msg: string) => void;
    debug: (msg: string) => void;
    error: (msg: string) => void;
  };
  registerHttpRoute: (route: {
    path: string;
    auth: string;
    handler: (req: unknown, res: { statusCode: number; end: (data: string) => void }) => boolean | Promise<boolean>;
  }) => void;
  registerTool?: (toolConfig: {
    name: string;
    description: string;
    parameters: unknown;
    handler: (args: unknown) => Promise<unknown>;
    strict?: boolean;
  }) => void;
  tools?: {
    register: (toolConfig: {
      name: string;
      description: string;
      parameters: unknown;
      handler: (args: unknown) => Promise<unknown>;
      strict?: boolean;
    }) => void;
  };
  on?: (event: string, handler: (...args: any[]) => void) => void;
  sendMessage?: (message: string) => void;
}

/**
 * Repsclaw - OpenClaw Healthcare Plugin
 * 支持工具注册（Function Calling）和 HTTP API
 */
const plugin = {
  id: "repsclaw",
  name: "Repsclaw Healthcare Plugin",
  version: "1.0.0",
  description: "Healthcare data integration with FDA, PubMed, Clinical Trials, ICD-10, medRxiv, NCBI Bookshelf APIs, and Hospital Subscription",

  healthAPI: null as HealthAPIService | null,
  subscriptionService: null as HospitalSubscriptionService | null,
  hospitalNewsService: null as HospitalNewsService | null,
  doctorSubscriptionService: null as DoctorSubscriptionService | null,

  capabilities: [
    {
      name: 'clinical_trials_search',
      description: '搜索 ClinicalTrials.gov 临床试验数据库',
      triggers: ['临床试验', 'clinical trial', '试验招募', 'phase trial'],
      tools: [CLINICAL_TRIALS_TOOL_NAME],
      category: 'healthcare',
    },
    {
      name: 'fda_drug_search',
      description: '搜索 FDA 药品信息',
      triggers: ['FDA', '药品', '药物', 'drug', 'medicine'],
      tools: [FDA_TOOL_NAME],
      category: 'healthcare',
    },
    {
      name: 'pubmed_search',
      description: '搜索 PubMed 医学文献',
      triggers: ['PubMed', '文献', '论文', 'paper', 'article'],
      tools: [PUBMED_TOOL_NAME],
      category: 'healthcare',
    },
    {
      name: 'icd10_lookup',
      description: '查询 ICD-10 医学编码',
      triggers: ['ICD', '编码', 'code', '疾病编码'],
      tools: [ICD10_TOOL_NAME],
      category: 'healthcare',
    },
    {
      name: 'medrxiv_search',
      description: '搜索 medRxiv 医学预印本',
      triggers: ['medRxiv', '预印本', 'preprint'],
      tools: [MEDRXIV_TOOL_NAME],
      category: 'healthcare',
    },
    {
      name: 'nci_bookshelf_search',
      description: '搜索 NCBI Bookshelf 医学书籍',
      triggers: ['Bookshelf', '书籍', 'book', '医学书籍'],
      tools: [NCI_BOOKSHELF_TOOL_NAME],
      category: 'healthcare',
    },
    {
      name: 'hospital_subscription',
      description: '医院订阅管理 - 订阅您关注的医院和科室以获取个性化医疗服务',
      triggers: ['医院', '订阅', '关注', 'hospital', 'subscribe', '科室', 'department'],
      tools: [SUBSCRIBE_HOSPITAL_TOOL_NAME, LIST_HOSPITALS_TOOL_NAME, GET_SUBSCRIPTIONS_TOOL_NAME],
      category: 'healthcare',
    },
    {
      name: 'hospital_news',
      description: '查询医院全网最新消息 - 聚合官方政务、主流媒体、医院自媒体等多源信息',
      triggers: ['医院新闻', '最新消息', '医院动态', 'news', 'hospital news'],
      tools: [GET_HOSPITAL_NEWS_TOOL_NAME],
      category: 'healthcare',
    },
    {
      name: 'doctor_subscription',
      description: '医生订阅管理 - 订阅您关注的医生（必须先订阅其所在医院）',
      triggers: ['医生', '大夫', '主任', 'doctor', 'physician'],
      tools: [SUBSCRIBE_DOCTOR_TOOL_NAME, LIST_DOCTORS_TOOL_NAME],
      category: 'healthcare',
    },
  ],

  register(api: OpenClawAPI) {
    pluginLogger.lifecycle('registering');

    // 检测 API 能力
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

    // 初始化 Health API 服务
    plugin.healthAPI = new HealthAPIService({
      fda: { apiKey: process.env.FDA_API_KEY },
      pubmed: { apiKey: process.env.PUBMED_API_KEY || process.env.NCBI_API_KEY },
      nciBookshelf: { apiKey: process.env.NCBI_API_KEY },
    });

    // 初始化医院订阅服务
    plugin.subscriptionService = new HospitalSubscriptionService();

    // 初始化医院新闻服务
    plugin.hospitalNewsService = new HospitalNewsService();

    // 初始化医生订阅服务（依赖医院订阅服务）
    plugin.doctorSubscriptionService = new DoctorSubscriptionService(plugin.subscriptionService);

    api.logger.info("🩺 Repsclaw plugin initializing...");

    // 检查订阅状态并提示用户
    plugin.checkAndPromptSubscription(api);

    // 1. 注册 HTTP 路由
    try {
      plugin.registerHealthRoutes(api);
      plugin.registerAllAPIRoutes(api);
      plugin.registerHospitalSubscriptionRoutes(api);
      pluginLogger.info('HTTP 路由注册成功');
    } catch (error) {
      pluginLogger.error('HTTP 路由注册失败', error);
      throw error;
    }

    // 2. 注册工具（Function Calling）
    try {
      plugin.registerTools(api);
      plugin.registerHospitalSubscriptionTools(api);
      plugin.registerHospitalNewsTools(api);
      plugin.registerDoctorSubscriptionTools(api);
      pluginLogger.info('工具注册成功');
    } catch (error) {
      pluginLogger.error('工具注册失败', error);
      // 工具注册失败不应阻止插件加载
    }

    pluginLogger.lifecycle('registered');
    api.logger.info("✅ Repsclaw plugin registered successfully");
  },

  /**
   * 检查订阅状态并提示用户
   */
  checkAndPromptSubscription(api: OpenClawAPI) {
    if (!plugin.subscriptionService) return;

    const service = plugin.subscriptionService;
    const isFirstTime = service.isFirstTime();
    const hasPromptedToday = service.hasPromptedToday();

    if (isFirstTime) {
      pluginLogger.info('首次使用，将在会话开始时显示欢迎消息');
      // 使用 hook 在会话开始时显示欢迎消息
      this.registerWelcomeHook(api);
    } else if (!hasPromptedToday) {
      // 每日第一次且已有订阅 - 静默更新日期，不提示
      const stats = service.getStats();
      if (stats.total > 0) {
        service.updateLastPromptedDate();
        pluginLogger.info('用户已有医院订阅，今日已记录', {
          hospitals: stats.total,
          primary: stats.primary,
        });
      }
    }
  },

  /**
   * 注册欢迎消息 Hook
   * 在首次对话时向用户显示欢迎消息
   */
  registerWelcomeHook(api: OpenClawAPI) {
    if (!api.on) {
      pluginLogger.warn('API 不支持 hook 注册，跳过欢迎消息');
      return;
    }

    const service = plugin.subscriptionService!;
    let welcomeShown = false;

    // 注册 session_start hook（新会话开始时触发）
    api.on('session_start', (event: { sessionId: string; sessionKey?: string }) => {
      pluginLogger.debug('session_start hook 触发', { sessionId: event.sessionId, welcomeShown });

      if (welcomeShown) return;
      if (!service.isFirstTime()) return;

      welcomeShown = true;
      service.updateLastPromptedDate();

      const welcomeMessage = `🏥 欢迎使用 Repsclaw 医疗插件！

为了给您提供更个性化的医疗服务，请先订阅您关注的医院。

您可以这样告诉我：
• "我想订阅北京协和医院"
• "帮我关注华山医院"
• "添加医院：复旦大学附属中山医院"

我会帮您管理这些订阅，并在相关医疗信息中优先展示您关注的医院。`;

      // 如果有 sendMessage 方法，使用它发送欢迎消息
      if (api.sendMessage) {
        pluginLogger.info('发送欢迎消息给用户');
        try {
          api.sendMessage(welcomeMessage);
        } catch (err) {
          pluginLogger.error('发送欢迎消息失败', err);
        }
      } else {
        pluginLogger.info('sendMessage 不可用，依赖系统提示词注入');
      }
    });

    pluginLogger.info('session_start hook 已注册');

    // 注册 before_agent_start hook，在系统提示词中注入引导
    api.on('before_agent_start', (event: { prompt: string; messages?: unknown[] }) => {
      pluginLogger.debug('before_agent_start hook 触发', { isFirstTime: service.isFirstTime() });

      if (!service.isFirstTime()) return;

      const guidance = `【系统提示 - Repsclaw 医疗插件】
用户尚未订阅任何医院。如果对话涉及医疗相关内容，请主动建议用户先订阅关注的医院。
可用的医院订阅工具：subscribe_hospital`;

      return {
        prependSystemContext: guidance,
      };
    });

    pluginLogger.info('before_agent_start hook 已注册');
  },

  /**
   * 注册健康检查 HTTP 路由
   */
  registerHealthRoutes(api: OpenClawAPI) {
    pluginLogger.info('开始注册 HTTP 路由');

    // 插件信息端点
    api.registerHttpRoute({
      path: "/api/repsclaw",
      auth: "gateway",
      handler: (_req, res) => {
        res.statusCode = 200;
        res.end(JSON.stringify({
          name: "repsclaw",
          version: "1.0.0",
          description: "Healthcare data integration plugin with hospital subscription",
          endpoints: [
            '/api/repsclaw/health',
            '/api/repsclaw/health/fda',
            '/api/repsclaw/health/pubmed',
            '/api/repsclaw/health/trials',
            '/api/repsclaw/health/icd10',
            '/api/repsclaw/health/medrxiv',
            '/api/repsclaw/health/bookshelf',
            '/api/repsclaw/hospitals',
            '/api/repsclaw/hospitals/subscribe',
            '/api/repsclaw/hospitals/list',
            '/api/repsclaw/hospitals/unsubscribe',
          ],
          tools: [
            'clinical_trials_search',
            'fda_drug_search',
            'pubmed_search',
            'icd10_lookup',
            'medrxiv_search',
            'nci_bookshelf_search',
            'subscribe_hospital',
            'list_subscribed_hospitals',
            'unsubscribe_hospital',
            'set_primary_hospital',
            'subscribe_doctor',
            'list_subscribed_doctors',
            'unsubscribe_doctor',
            'set_primary_doctor',
          ],
        }));
        return true;
      },
    });

    // 健康检查端点
    api.registerHttpRoute({
      path: "/api/repsclaw/health",
      auth: "gateway",
      handler: (_req, res) => {
        pluginLogger.debug('Health endpoint called');
        res.statusCode = 200;
        res.end(JSON.stringify({
          status: "ok",
          plugin: "repsclaw",
          version: "1.0.0",
          capabilities: plugin.capabilities.map(c => c.name),
          timestamp: new Date().toISOString(),
        }));
        return true;
      },
    });

    pluginLogger.info('Health route registered: /api/repsclaw/health');
  },

  /**
   * 注册所有 API 路由
   */
  registerAllAPIRoutes(api: OpenClawAPI) {
    if (!plugin.healthAPI) {
      pluginLogger.error('HealthAPI 未初始化');
      return;
    }

    const healthAPI = plugin.healthAPI;

    // FDA 药品查询
    api.registerHttpRoute({
      path: "/api/repsclaw/health/fda",
      auth: "gateway",
      handler: async (req: any, res) => {
        pluginLogger.apiCall('/api/repsclaw/health/fda', req.query);
        try {
          const { drugName, searchType = 'general' } = req.query || {};
          if (!drugName) {
            res.statusCode = 400;
            res.end(JSON.stringify({ status: 'error', error: 'drugName is required' }));
            return true;
          }
          const result = await healthAPI.lookupDrug({ drugName, searchType });
          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'success', data: result }));
          return true;
        } catch (error) {
          pluginLogger.error('FDA API error', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ status: 'error', error: String(error) }));
          return true;
        }
      },
    });
    pluginLogger.info('FDA route registered: /api/repsclaw/health/fda');

    // PubMed 文献搜索
    api.registerHttpRoute({
      path: "/api/repsclaw/health/pubmed",
      auth: "gateway",
      handler: async (req: any, res) => {
        pluginLogger.apiCall('/api/repsclaw/health/pubmed', req.query);
        try {
          const { q, limit = 10, sort = 'relevance', dateRange, openAccess } = req.query || {};
          if (!q) {
            res.statusCode = 400;
            res.end(JSON.stringify({ status: 'error', error: 'q (query) is required' }));
            return true;
          }
          const result = await healthAPI.searchPubMed({
            query: q,
            maxResults: parseInt(limit),
            sort,
            dateRange,
            openAccess: openAccess === 'true'
          });
          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'success', data: result }));
          return true;
        } catch (error) {
          pluginLogger.error('PubMed API error', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ status: 'error', error: String(error) }));
          return true;
        }
      },
    });
    pluginLogger.info('PubMed route registered: /api/repsclaw/health/pubmed');

    // 临床试验搜索
    api.registerHttpRoute({
      path: "/api/repsclaw/health/trials",
      auth: "gateway",
      handler: async (req: any, res) => {
        pluginLogger.apiCall('/api/repsclaw/health/trials', req.query);
        try {
          const { condition, status = 'recruiting', limit = 10 } = req.query || {};
          if (!condition) {
            res.statusCode = 400;
            res.end(JSON.stringify({ status: 'error', error: 'condition is required' }));
            return true;
          }
          const result = await healthAPI.searchClinicalTrials({
            condition,
            status,
            maxResults: parseInt(limit)
          });
          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'success', data: result }));
          return true;
        } catch (error) {
          pluginLogger.error('Clinical Trials API error', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ status: 'error', error: String(error) }));
          return true;
        }
      },
    });
    pluginLogger.info('Trials route registered: /api/repsclaw/health/trials');

    // ICD-10 查询
    api.registerHttpRoute({
      path: "/api/repsclaw/health/icd10",
      auth: "gateway",
      handler: async (req: any, res) => {
        pluginLogger.apiCall('/api/repsclaw/health/icd10', req.query);
        try {
          const { code, desc, limit = 10 } = req.query || {};
          if (!code && !desc) {
            res.statusCode = 400;
            res.end(JSON.stringify({ status: 'error', error: 'code or desc is required' }));
            return true;
          }
          const result = await healthAPI.lookupICDCode({
            code,
            description: desc,
            maxResults: parseInt(limit)
          });
          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'success', data: result }));
          return true;
        } catch (error) {
          pluginLogger.error('ICD-10 API error', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ status: 'error', error: String(error) }));
          return true;
        }
      },
    });
    pluginLogger.info('ICD-10 route registered: /api/repsclaw/health/icd10');

    // medRxiv 预印本搜索
    api.registerHttpRoute({
      path: "/api/repsclaw/health/medrxiv",
      auth: "gateway",
      handler: async (req: any, res) => {
        pluginLogger.apiCall('/api/repsclaw/health/medrxiv', req.query);
        try {
          const { q, limit = 10, days, server = 'medrxiv' } = req.query || {};
          if (!q) {
            res.statusCode = 400;
            res.end(JSON.stringify({ status: 'error', error: 'q (query) is required' }));
            return true;
          }
          const result = await healthAPI.searchMedRxiv({
            query: q,
            maxResults: parseInt(limit),
            days: days ? parseInt(days) : undefined,
            server
          });
          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'success', data: result }));
          return true;
        } catch (error) {
          pluginLogger.error('medRxiv API error', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ status: 'error', error: String(error) }));
          return true;
        }
      },
    });
    pluginLogger.info('medRxiv route registered: /api/repsclaw/health/medrxiv');

    // NCBI Bookshelf 搜索
    api.registerHttpRoute({
      path: "/api/repsclaw/health/bookshelf",
      auth: "gateway",
      handler: async (req: any, res) => {
        pluginLogger.apiCall('/api/repsclaw/health/bookshelf', req.query);
        try {
          const { q, limit = 10 } = req.query || {};
          if (!q) {
            res.statusCode = 400;
            res.end(JSON.stringify({ status: 'error', error: 'q (query) is required' }));
            return true;
          }
          const result = await healthAPI.searchNciBookshelf({
            query: q,
            maxResults: parseInt(limit)
          });
          res.statusCode = 200;
          res.end(JSON.stringify({ status: 'success', data: result }));
          return true;
        } catch (error) {
          pluginLogger.error('NCI Bookshelf API error', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ status: 'error', error: String(error) }));
          return true;
        }
      },
    });
    pluginLogger.info('Bookshelf route registered: /api/repsclaw/health/bookshelf');
  },

  /**
   * 注册医院订阅相关路由
   */
  registerHospitalSubscriptionRoutes(api: OpenClawAPI) {
    if (!plugin.subscriptionService) {
      pluginLogger.error('SubscriptionService 未初始化');
      return;
    }

    const service = plugin.subscriptionService;

    // 获取订阅状态
    api.registerHttpRoute({
      path: "/api/repsclaw/hospitals",
      auth: "gateway",
      handler: (_req, res) => {
        const hospitals = service.getHospitals();
        const primary = service.getPrimaryHospital();
        res.statusCode = 200;
        res.end(JSON.stringify({
          status: 'success',
          data: {
            hospitals,
            primary: primary?.name || null,
            total: hospitals.length,
          },
        }));
        return true;
      },
    });

    // 订阅医院
    api.registerHttpRoute({
      path: "/api/repsclaw/hospitals/subscribe",
      auth: "gateway",
      handler: async (req: any, res) => {
        try {
          const { name, isPrimary = false } = req.query || {};
          if (!name) {
            res.statusCode = 400;
            res.end(JSON.stringify({ status: 'error', error: 'name is required' }));
            return true;
          }
          const subscription = service.subscribe(name, isPrimary === 'true' || isPrimary === true);
          res.statusCode = 200;
          res.end(JSON.stringify({
            status: 'success',
            message: `已订阅 ${name}`,
            data: subscription,
          }));
          return true;
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ status: 'error', error: String(error) }));
          return true;
        }
      },
    });

    // 列出已订阅医院
    api.registerHttpRoute({
      path: "/api/repsclaw/hospitals/list",
      auth: "gateway",
      handler: (_req, res) => {
        const hospitals = service.getHospitals();
        res.statusCode = 200;
        res.end(JSON.stringify({
          status: 'success',
          data: hospitals,
        }));
        return true;
      },
    });

    // 取消订阅
    api.registerHttpRoute({
      path: "/api/repsclaw/hospitals/unsubscribe",
      auth: "gateway",
      handler: async (req: any, res) => {
        try {
          const { name } = req.query || {};
          if (!name) {
            res.statusCode = 400;
            res.end(JSON.stringify({ status: 'error', error: 'name is required' }));
            return true;
          }
          const success = service.unsubscribe(name);
          res.statusCode = 200;
          res.end(JSON.stringify({
            status: success ? 'success' : 'error',
            message: success ? `已取消订阅 ${name}` : `未找到 ${name} 的订阅`,
          }));
          return true;
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ status: 'error', error: String(error) }));
          return true;
        }
      },
    });

    pluginLogger.info('Hospital subscription routes registered');
  },

  /**
   * 注册所有工具（Function Calling）
   */
  registerTools(api: OpenClawAPI) {
    if (!plugin.healthAPI) {
      pluginLogger.warn('HealthAPI 未初始化，跳过工具注册');
      return;
    }

    const healthAPI = plugin.healthAPI;
    pluginLogger.info('开始注册工具');

    // 构建符合 OpenClaw 格式的工具对象
    const tools = [
      {
        name: FDA_TOOL_NAME,
        description: FDATool.description,
        parameters: FDATool.parameters,
        handler: createFDAHandler(healthAPI),
      },
      {
        name: PUBMED_TOOL_NAME,
        description: PubMedTool.description,
        parameters: PubMedTool.parameters,
        handler: createPubMedHandler(healthAPI),
      },
      {
        name: CLINICAL_TRIALS_TOOL_NAME,
        description: ClinicalTrialsTool.description,
        parameters: ClinicalTrialsTool.parameters,
        handler: createClinicalTrialsHandler(),
      },
      {
        name: ICD10_TOOL_NAME,
        description: ICD10Tool.description,
        parameters: ICD10Tool.parameters,
        handler: createICD10Handler(healthAPI),
      },
      {
        name: MEDRXIV_TOOL_NAME,
        description: MedRxivTool.description,
        parameters: MedRxivTool.parameters,
        handler: createMedRxivHandler(healthAPI),
      },
      {
        name: NCI_BOOKSHELF_TOOL_NAME,
        description: NCIBookshelfTool.description,
        parameters: NCIBookshelfTool.parameters,
        handler: createNCIBookshelfHandler(healthAPI),
      },
    ];

    for (const tool of tools) {
      try {
        const toolConfig = {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          handler: tool.handler,
        };

        if (api.registerTool) {
          api.registerTool(toolConfig);
          pluginLogger.info(`工具已注册: ${tool.name}`);
        } else if (api.tools?.register) {
          api.tools.register(toolConfig);
          pluginLogger.info(`工具已注册: ${tool.name} (via api.tools.register)`);
        } else {
          pluginLogger.warn(`未找到工具注册接口，跳过: ${tool.name}`);
        }
      } catch (error) {
        pluginLogger.error(`工具注册失败: ${tool.name}`, error);
      }
    }

    pluginLogger.info(`工具注册完成，共 ${tools.length} 个`);
  },

  /**
   * 注册医院订阅相关工具
   */
  registerHospitalSubscriptionTools(api: OpenClawAPI) {
    if (!plugin.subscriptionService) {
      pluginLogger.warn('SubscriptionService 未初始化，跳过订阅工具注册');
      return;
    }

    const service = plugin.subscriptionService;
    const doctorService = plugin.doctorSubscriptionService;
    pluginLogger.info('开始注册医院订阅工具');

    // 构建符合 OpenClaw 格式的工具对象
    const tools = [
      {
        name: SUBSCRIBE_HOSPITAL_TOOL_NAME,
        description: SubscribeHospitalTool.description,
        parameters: SubscribeHospitalTool.parameters,
        handler: createSubscribeHospitalHandler(service),
      },
      {
        name: LIST_HOSPITALS_TOOL_NAME,
        description: ListHospitalsTool.description,
        parameters: ListHospitalsTool.parameters,
        handler: doctorService
          ? createListHospitalsCompatHandler(service, doctorService)
          : createListHospitalsHandler(service),
      },
      {
        name: UNSUBSCRIBE_HOSPITAL_TOOL_NAME,
        description: UnsubscribeHospitalTool.description,
        parameters: UnsubscribeHospitalTool.parameters,
        handler: createUnsubscribeHospitalHandler(service),
      },
      {
        name: SET_PRIMARY_HOSPITAL_TOOL_NAME,
        description: SetPrimaryHospitalTool.description,
        parameters: SetPrimaryHospitalTool.parameters,
        handler: createSetPrimaryHospitalHandler(service),
      },
      {
        name: CHECK_SUBSCRIPTION_STATUS_TOOL_NAME,
        description: CheckSubscriptionStatusTool.description,
        parameters: CheckSubscriptionStatusTool.parameters,
        handler: createCheckSubscriptionStatusHandler(service),
      },
    ];

    // 注册统一查询工具（如果医生服务已初始化）
    if (doctorService) {
      tools.push({
        name: GET_SUBSCRIPTIONS_TOOL_NAME,
        description: GetSubscriptionsTool.description,
        parameters: GetSubscriptionsTool.parameters,
        handler: createGetSubscriptionsHandler(service, doctorService),
      });
    }

    for (const tool of tools) {
      try {
        const toolConfig = {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          handler: tool.handler,
        };

        if (api.registerTool) {
          api.registerTool(toolConfig);
          pluginLogger.info(`订阅工具已注册: ${tool.name}`);
        } else if (api.tools?.register) {
          api.tools.register(toolConfig);
          pluginLogger.info(`订阅工具已注册: ${tool.name} (via api.tools.register)`);
        } else {
          pluginLogger.warn(`未找到工具注册接口，跳过: ${tool.name}`);
        }
      } catch (error) {
        pluginLogger.error(`订阅工具注册失败: ${tool.name}`, error);
      }
    }

    pluginLogger.info(`医院订阅工具注册完成，共 ${tools.length} 个`);
  },

  /**
   * 注册医院新闻相关工具
   */
  registerHospitalNewsTools(api: OpenClawAPI) {
    if (!plugin.hospitalNewsService) {
      pluginLogger.warn('HospitalNewsService 未初始化，跳过新闻工具注册');
      return;
    }

    const service = plugin.hospitalNewsService;
    pluginLogger.info('开始注册医院新闻工具');

    const toolConfig = {
      name: GET_HOSPITAL_NEWS_TOOL_NAME,
      description: GetHospitalNewsTool.description,
      parameters: GetHospitalNewsTool.parameters,
      handler: createGetHospitalNewsHandler(service),
    };

    try {
      if (api.registerTool) {
        api.registerTool(toolConfig);
        pluginLogger.info(`医院新闻工具已注册: ${toolConfig.name}`);
      } else if (api.tools?.register) {
        api.tools.register(toolConfig);
        pluginLogger.info(`医院新闻工具已注册: ${toolConfig.name} (via api.tools.register)`);
      } else {
        pluginLogger.warn(`未找到工具注册接口，跳过: ${toolConfig.name}`);
      }
    } catch (error) {
      pluginLogger.error(`医院新闻工具注册失败: ${toolConfig.name}`, error);
    }

    pluginLogger.info('医院新闻工具注册完成');
  },

  /**
   * 注册医生订阅相关工具
   */
  registerDoctorSubscriptionTools(api: OpenClawAPI) {
    if (!plugin.doctorSubscriptionService) {
      pluginLogger.warn('DoctorSubscriptionService 未初始化，跳过医生订阅工具注册');
      return;
    }

    const service = plugin.doctorSubscriptionService;
    const hospitalService = plugin.subscriptionService;
    pluginLogger.info('开始注册医生订阅工具');

    // 构建符合 OpenClaw 格式的工具对象
    const tools = [
      {
        name: SUBSCRIBE_DOCTOR_TOOL_NAME,
        description: SubscribeDoctorTool.description,
        parameters: SubscribeDoctorTool.parameters,
        handler: createSubscribeDoctorHandler(service),
      },
      {
        name: LIST_DOCTORS_TOOL_NAME,
        description: ListDoctorsTool.description,
        parameters: ListDoctorsTool.parameters,
        handler: hospitalService
          ? createListDoctorsCompatHandler(hospitalService, service)
          : createListDoctorsHandler(service),
      },
      {
        name: UNSUBSCRIBE_DOCTOR_TOOL_NAME,
        description: UnsubscribeDoctorTool.description,
        parameters: UnsubscribeDoctorTool.parameters,
        handler: createUnsubscribeDoctorHandler(service),
      },
      {
        name: SET_PRIMARY_DOCTOR_TOOL_NAME,
        description: SetPrimaryDoctorTool.description,
        parameters: SetPrimaryDoctorTool.parameters,
        handler: createSetPrimaryDoctorHandler(service),
      },
      {
        name: CHECK_DOCTOR_SUBSCRIPTION_STATUS_TOOL_NAME,
        description: CheckDoctorSubscriptionStatusTool.description,
        parameters: CheckDoctorSubscriptionStatusTool.parameters,
        handler: createCheckDoctorSubscriptionStatusHandler(service),
      },
    ];

    for (const tool of tools) {
      try {
        const toolConfig = {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          handler: tool.handler,
        };

        if (api.registerTool) {
          api.registerTool(toolConfig);
          pluginLogger.info(`医生订阅工具已注册: ${tool.name}`);
        } else if (api.tools?.register) {
          api.tools.register(toolConfig);
          pluginLogger.info(`医生订阅工具已注册: ${tool.name} (via api.tools.register)`);
        } else {
          pluginLogger.warn(`未找到工具注册接口，跳过: ${tool.name}`);
        }
      } catch (error) {
        pluginLogger.error(`医生订阅工具注册失败: ${tool.name}`, error);
      }
    }

    pluginLogger.info(`医生订阅工具注册完成，共 ${tools.length} 个`);
  },
};

pluginLogger.info('Plugin object created', {
  id: plugin.id,
  capabilities: plugin.capabilities.map(c => c.name)
});

export default plugin;
