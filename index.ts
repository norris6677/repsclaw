import { FastifyInstance } from 'fastify';
import { pluginLogger } from './src/utils/plugin-logger';
import {
  ClinicalTrialsTool,
  createClinicalTrialsHandler,
  CLINICAL_TRIALS_TOOL_NAME,
} from './src/tools';

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
  registerTool?: (name: string, definition: unknown, handler: (args: unknown) => Promise<unknown>) => void;
  tools?: {
    register: (name: string, definition: unknown, handler: (args: unknown) => Promise<unknown>) => void;
  };
}

/**
 * Repsclaw - OpenClaw Healthcare Plugin
 * 支持工具注册（Function Calling）和 HTTP API
 */
const plugin = {
  id: "repsclaw",
  name: "Repsclaw Healthcare Plugin",
  version: "1.0.0",
  description: "Healthcare data integration with FDA, PubMed, Clinical Trials, and Medical Terminology APIs",
  
  capabilities: [
    {
      name: 'clinical_trials_search',
      description: '搜索 ClinicalTrials.gov 临床试验数据库',
      triggers: ['临床试验', 'clinical trial', '试验招募', 'phase trial'],
      tools: [CLINICAL_TRIALS_TOOL_NAME],
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
      apiKeys: Object.keys(api),
    };
    
    pluginLogger.info('API 能力检测', apiCapabilities);
    
    if (!api.logger) {
      pluginLogger.error('API 缺少 logger');
      throw new Error('Repsclaw: API logger is required');
    }
    
    api.logger.info("🩺 Repsclaw plugin initializing...");
    
    // 1. 注册 HTTP 路由（健康检查）
    try {
      this.registerHealthRoutes(api);
      pluginLogger.info('HTTP 路由注册成功');
    } catch (error) {
      pluginLogger.error('HTTP 路由注册失败', error);
      throw error;
    }
    
    // 2. 注册工具（Function Calling）
    try {
      this.registerTools(api);
      pluginLogger.info('工具注册成功');
    } catch (error) {
      pluginLogger.error('工具注册失败', error);
      // 工具注册失败不应阻止插件加载
    }
    
    pluginLogger.lifecycle('registered');
    api.logger.info("✅ Repsclaw plugin registered successfully");
  },
  
  /**
   * 注册健康检查 HTTP 路由
   */
  registerHealthRoutes(api: OpenClawAPI) {
    pluginLogger.info('开始注册 HTTP 路由');
    
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
          capabilities: ['clinical_trials_search'],
          timestamp: new Date().toISOString(),
        }));
        return true;
      },
    });
    
    pluginLogger.info('Health route registered: /api/repsclaw/health');
    
    // API: 临床试验搜索
    api.registerHttpRoute({
      path: "/api/repsclaw/health/trials",
      auth: "gateway",
      handler: async (req: any, res) => {
        pluginLogger.apiCall('/api/repsclaw/health/trials', req.query);
        
        try {
          const handler = createClinicalTrialsHandler();
          const result = await handler(req.query);
          
          pluginLogger.toolResult(CLINICAL_TRIALS_TOOL_NAME, 
            result.status === 'success' ? 'success' : 'error', 
            { query: req.query }
          );
          
          res.statusCode = result.status === 'success' ? 200 : 500;
          res.end(JSON.stringify(result));
          return true;
        } catch (error) {
          pluginLogger.error('Trials API error', error);
          res.statusCode = 500;
          res.end(JSON.stringify({
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          }));
          return true;
        }
      },
    });
    
    pluginLogger.info('Trials route registered: /api/repsclaw/health/trials');
  },
  
  /**
   * 注册工具（Function Calling）
   */
  registerTools(api: OpenClawAPI) {
    pluginLogger.info('开始注册工具');
    
    const handler = createClinicalTrialsHandler();
    
    // 检测工具注册接口
    if (api.registerTool) {
      pluginLogger.info('使用 api.registerTool() 接口');
      try {
        api.registerTool(
          CLINICAL_TRIALS_TOOL_NAME,
          ClinicalTrialsTool,
          handler
        );
        pluginLogger.info(`工具已注册: ${CLINICAL_TRIALS_TOOL_NAME}`);
      } catch (error) {
        pluginLogger.error(`工具注册失败: ${CLINICAL_TRIALS_TOOL_NAME}`, error);
        throw error;
      }
    } else if (api.tools?.register) {
      pluginLogger.info('使用 api.tools.register() 接口');
      try {
        api.tools.register(
          CLINICAL_TRIALS_TOOL_NAME,
          ClinicalTrialsTool,
          handler
        );
        pluginLogger.info(`工具已注册: ${CLINICAL_TRIALS_TOOL_NAME}`);
      } catch (error) {
        pluginLogger.error(`工具注册失败: ${CLINICAL_TRIALS_TOOL_NAME}`, error);
        throw error;
      }
    } else {
      pluginLogger.warn('未找到工具注册接口，跳过工具注册');
      pluginLogger.debug('API 对象结构', { keys: Object.keys(api) });
    }
  },
};

pluginLogger.info('Plugin object created', { 
  id: plugin.id, 
  capabilities: plugin.capabilities.map(c => c.name) 
});

export default plugin;
