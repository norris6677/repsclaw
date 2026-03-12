import { FastifyInstance } from 'fastify';

/**
 * OpenClaw 插件元数据接口
 */
export interface IPluginMetadata {
  /** 插件唯一标识 */
  name: string;
  /** 插件版本 */
  version: string;
  /** 插件描述 */
  description?: string;
  /** 插件作者 */
  author?: string;
  /** 依赖的其他插件 */
  dependencies?: string[];
  /** 配置Schema */
  configSchema?: Record<string, unknown>;
}

/**
 * OpenClaw 插件上下文
 * 提供插件运行时的依赖和资源
 */
export interface IPluginContext {
  /** Fastify 实例 */
  server: FastifyInstance;
  /** 配置 */
  config: Record<string, string | undefined>;
  /** 日志记录器 */
  logger: FastifyInstance['log'];
  /** 服务注册表 */
  services: IServiceRegistry;
}

/**
 * 服务注册表接口
 */
export interface IServiceRegistry {
  get<T>(name: string): T | undefined;
  register<T>(name: string, service: T): void;
  has(name: string): boolean;
}

/**
 * OpenClaw 插件接口
 * 所有插件必须实现此接口
 */
export interface IOpenClawPlugin {
  /** 插件元数据 */
  readonly metadata: IPluginMetadata;
  
  /**
   * 注册插件
   * @param context 插件上下文
   */
  register(context: IPluginContext): Promise<void> | void;
  
  /**
   * 卸载插件（可选）
   * @param context 插件上下文
   */
  unregister?(context: IPluginContext): Promise<void> | void;
}

/**
 * 插件构造函数类型
 */
export type PluginConstructor = new () => IOpenClawPlugin;
