/**
 * Article Ingestion Config Adapter
 * 配置适配器 - 自动从 OpenClaw 配置系统读取
 *
 * 配置优先级（从高到低）：
 * 1. OpenClaw settings.json (repsclaw.articleIngestion.*)
 * 2. 环境变量 (FEISHU_APP_ID, FEISHU_APP_SECRET)
 * 3. OpenClaw 全局配置 (feishu.appId, feishu.appSecret)
 * 4. 默认值
 */

import { createLogger } from '../../utils/plugin-logger';

const logger = createLogger('REPSCLAW:CONFIG');

/**
 * 文章采集配置接口
 */
export interface ArticleIngestionConfig {
  feishu: {
    appId: string;
    appSecret: string;
    encryptKey?: string;
    verificationToken?: string;
  };
  session: {
    ttl: number;           // 会话过期时间（毫秒）
    checkpointInterval: number;  // 持久化间隔
    maxSessions: number;   // 最大会话数
  };
  intent: {
    autoSaveThreshold: number;   // 自动保存置信度阈值
    suggestThreshold: number;    // 建议阈值
    llmModel: string;            // LLM模型
  };
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Partial<ArticleIngestionConfig> = {
  session: {
    ttl: 5 * 60 * 1000,      // 5分钟
    checkpointInterval: 30000, // 30秒
    maxSessions: 1000,
  },
  intent: {
    autoSaveThreshold: 0.8,
    suggestThreshold: 0.5,
    llmModel: 'claude-sonnet-4-6',
  },
};

/**
 * 配置键映射
 * 支持多种配置路径，兼容不同用户习惯
 */
const CONFIG_KEY_MAPPINGS: Record<string, string[]> = {
  'feishu.appId': [
    'repsclaw.articleIngestion.feishu.appId',
    'repsclaw.feishu.appId',
    'articleIngestion.feishu.appId',
    'feishu.appId',
    'FEISHU_APP_ID',
  ],
  'feishu.appSecret': [
    'repsclaw.articleIngestion.feishu.appSecret',
    'repsclaw.feishu.appSecret',
    'articleIngestion.feishu.appSecret',
    'feishu.appSecret',
    'FEISHU_APP_SECRET',
  ],
  'feishu.encryptKey': [
    'repsclaw.articleIngestion.feishu.encryptKey',
    'repsclaw.feishu.encryptKey',
    'articleIngestion.feishu.encryptKey',
    'feishu.encryptKey',
    'FEISHU_ENCRYPT_KEY',
  ],
  'feishu.verificationToken': [
    'repsclaw.articleIngestion.feishu.verificationToken',
    'repsclaw.feishu.verificationToken',
    'articleIngestion.feishu.verificationToken',
    'feishu.verificationToken',
    'FEISHU_VERIFICATION_TOKEN',
  ],
  'session.ttl': [
    'repsclaw.articleIngestion.session.ttl',
    'ARTICLE_SESSION_TTL',
  ],
  'session.checkpointInterval': [
    'repsclaw.articleIngestion.session.checkpointInterval',
    'ARTICLE_CHECKPOINT_INTERVAL',
  ],
  'session.maxSessions': [
    'repsclaw.articleIngestion.session.maxSessions',
    'ARTICLE_MAX_SESSIONS',
  ],
  'intent.autoSaveThreshold': [
    'repsclaw.articleIngestion.intent.autoSaveThreshold',
    'ARTICLE_AUTO_SAVE_THRESHOLD',
  ],
  'intent.suggestThreshold': [
    'repsclaw.articleIngestion.intent.suggestThreshold',
    'ARTICLE_SUGGEST_THRESHOLD',
  ],
  'intent.llmModel': [
    'repsclaw.articleIngestion.intent.llmModel',
    'ARTICLE_LLM_MODEL',
  ],
};

/**
 * 配置适配器类
 */
export class ConfigAdapter {
  private config: Record<string, string | undefined>;
  private cachedConfig?: ArticleIngestionConfig;

  constructor(openclawConfig: Record<string, string | undefined>) {
    this.config = openclawConfig;
  }

  /**
   * 获取完整配置
   */
  getConfig(): ArticleIngestionConfig {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    const config: ArticleIngestionConfig = {
      feishu: {
        appId: this.getRequiredValue('feishu.appId'),
        appSecret: this.getRequiredValue('feishu.appSecret'),
        encryptKey: this.getValue('feishu.encryptKey'),
        verificationToken: this.getValue('feishu.verificationToken'),
      },
      session: {
        ttl: this.getNumberValue('session.ttl', DEFAULT_CONFIG.session!.ttl),
        checkpointInterval: this.getNumberValue('session.checkpointInterval', DEFAULT_CONFIG.session!.checkpointInterval),
        maxSessions: this.getNumberValue('session.maxSessions', DEFAULT_CONFIG.session!.maxSessions),
      },
      intent: {
        autoSaveThreshold: this.getNumberValue('intent.autoSaveThreshold', DEFAULT_CONFIG.intent!.autoSaveThreshold),
        suggestThreshold: this.getNumberValue('intent.suggestThreshold', DEFAULT_CONFIG.intent!.suggestThreshold),
        llmModel: this.getValue('intent.llmModel') || DEFAULT_CONFIG.intent!.llmModel!,
      },
    };

    this.cachedConfig = config;
    this.logConfigLoaded(config);

    return config;
  }

  /**
   * 检查配置是否有效
   */
  isValid(): boolean {
    try {
      const config = this.getConfig();
      return !!config.feishu.appId && !!config.feishu.appSecret;
    } catch {
      return false;
    }
  }

  /**
   * 获取配置缺失项
   */
  getMissingConfigs(): string[] {
    const missing: string[] = [];

    try {
      this.getRequiredValue('feishu.appId');
    } catch {
      missing.push('feishu.appId (配置路径: repsclaw.articleIngestion.feishu.appId 或环境变量 FEISHU_APP_ID)');
    }

    try {
      this.getRequiredValue('feishu.appSecret');
    } catch {
      missing.push('feishu.appSecret (配置路径: repsclaw.articleIngestion.feishu.appSecret 或环境变量 FEISHU_APP_SECRET)');
    }

    return missing;
  }

  /**
   * 清除缓存（配置变更后调用）
   */
  clearCache(): void {
    this.cachedConfig = undefined;
  }

  // ==================== 私有方法 ====================

  /**
   * 获取配置值（按优先级顺序查找）
   */
  private getValue(key: string): string | undefined {
    const keys = CONFIG_KEY_MAPPINGS[key];
    if (!keys) {
      return undefined;
    }

    for (const k of keys) {
      const value = this.getConfigByPath(k);
      if (value !== undefined && value !== '') {
        return value;
      }
    }

    return undefined;
  }

  /**
   * 获取必需配置值
   */
  private getRequiredValue(key: string): string {
    const value = this.getValue(key);
    if (!value) {
      throw new Error(`Missing required config: ${key}`);
    }
    return value;
  }

  /**
   * 获取数字配置值
   */
  private getNumberValue(key: string, defaultValue: number): number {
    const value = this.getValue(key);
    if (!value) {
      return defaultValue;
    }
    const num = parseFloat(value);
    return isNaN(num) ? defaultValue : num;
  }

  /**
   * 根据路径获取配置值
   * 支持点号分隔的嵌套路径和环境变量
   */
  private getConfigByPath(path: string): string | undefined {
    // 环境变量直接返回
    if (path === path.toUpperCase() && path.includes('_')) {
      return this.config[path] || process.env[path];
    }

    // 首先尝试直接匹配扁平键（如 'repsclaw.articleIngestion.feishu.appId'）
    if (this.config[path] !== undefined) {
      return this.config[path];
    }

    // 然后尝试按点号分隔解析嵌套路径
    const parts = path.split('.');
    let value: unknown = this.config;

    for (const part of parts) {
      if (value === null || typeof value !== 'object') {
        return undefined;
      }
      value = (value as Record<string, unknown>)[part];
    }

    return value !== undefined ? String(value) : undefined;
  }

  /**
   * 记录配置加载信息
   */
  private logConfigLoaded(config: ArticleIngestionConfig): void {
    logger.info('Article ingestion configuration loaded', {
      feishuAppId: this.maskString(config.feishu.appId),
      feishuAppSecret: this.maskString(config.feishu.appSecret),
      sessionTTL: config.session.ttl,
      checkpointInterval: config.session.checkpointInterval,
      autoSaveThreshold: config.intent.autoSaveThreshold,
      llmModel: config.intent.llmModel,
    });
  }

  /**
   * 脱敏字符串
   */
  private maskString(str: string): string {
    if (str.length <= 8) {
      return '***';
    }
    return str.substring(0, 4) + '****' + str.substring(str.length - 4);
  }
}

/**
 * 创建配置适配器工厂函数
 */
export function createConfigAdapter(
  openclawConfig: Record<string, string | undefined>
): ConfigAdapter {
  return new ConfigAdapter(openclawConfig);
}

/**
 * 配置验证帮助函数
 */
export function validateConfig(adapter: ConfigAdapter): {
  valid: boolean;
  missing: string[];
  message: string;
} {
  const valid = adapter.isValid();
  const missing = adapter.getMissingConfigs();

  if (valid) {
    return {
      valid: true,
      missing: [],
      message: 'Configuration is valid',
    };
  }

  return {
    valid: false,
    missing,
    message: `Missing required configuration:\n${missing.map(m => `  - ${m}`).join('\n')}`,
  };
}
