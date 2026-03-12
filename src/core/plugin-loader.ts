import { FastifyInstance } from 'fastify';
import fs from 'fs/promises';
import path from 'path';
import {
  IOpenClawPlugin,
  IPluginContext,
  IPluginMetadata,
  PluginConstructor,
} from '../types';
import { ServiceRegistry } from '../utils/service-registry';

/**
 * OpenClaw 插件加载器
 * 负责扫描、加载和管理插件
 */
export class PluginLoader {
  private plugins: Map<string, IOpenClawPlugin> = new Map();
  private context: IPluginContext;

  constructor(
    private server: FastifyInstance,
    private config: Record<string, string | undefined>,
    private pluginPath: string = path.join(process.cwd(), 'src', 'plugins')
  ) {
    this.context = {
      server,
      config,
      logger: server.log,
      services: new ServiceRegistry(),
    };
  }

  /**
   * 扫描并加载所有插件
   */
  async loadAll(): Promise<IPluginMetadata[]> {
    this.server.log.info(`Scanning plugins from: ${this.pluginPath}`);

    try {
      const entries = await fs.readdir(this.pluginPath, { withFileTypes: true });
      const pluginFiles = entries
        .filter(
          (entry) =>
            entry.isFile() &&
            (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) &&
            !entry.name.endsWith('.d.ts')
        )
        .map((entry) => entry.name);

      const metadataList: IPluginMetadata[] = [];

      for (const file of pluginFiles) {
        try {
          const metadata = await this.loadPlugin(file);
          if (metadata) {
            metadataList.push(metadata);
          }
        } catch (error) {
          this.server.log.error(
            { error, file },
            'Failed to load plugin'
          );
        }
      }

      this.server.log.info(
        { count: metadataList.length },
        'Plugins loaded successfully'
      );

      return metadataList;
    } catch (error) {
      this.server.log.error({ error }, 'Failed to scan plugins directory');
      return [];
    }
  }

  /**
   * 加载单个插件
   */
  private async loadPlugin(filename: string): Promise<IPluginMetadata | null> {
    const filePath = path.join(this.pluginPath, filename);
    const module = await import(filePath);

    // 查找插件类导出
    const PluginClass = this.findPluginClass(module);
    if (!PluginClass) {
      this.server.log.warn(
        { file: filename },
        'No plugin class found in file'
      );
      return null;
    }

    // 实例化插件
    const plugin = new PluginClass();

    // 验证插件接口
    if (!this.isValidPlugin(plugin)) {
      throw new Error(`Invalid plugin: ${filename} does not implement IOpenClawPlugin`);
    }

    // 检查依赖
    await this.resolveDependencies(plugin.metadata);

    // 注册插件
    await plugin.register(this.context);

    this.plugins.set(plugin.metadata.name, plugin);
    this.server.log.info(
      { name: plugin.metadata.name, version: plugin.metadata.version },
      'Plugin registered'
    );

    return plugin.metadata;
  }

  /**
   * 从模块中查找插件类
   */
  private findPluginClass(module: Record<string, unknown>): PluginConstructor | null {
    // 优先查找默认导出
    if (module.default && this.isPluginConstructor(module.default)) {
      return module.default as PluginConstructor;
    }

    // 查找第一个符合条件的类
    for (const exportName of Object.keys(module)) {
      const exported = module[exportName];
      if (this.isPluginConstructor(exported)) {
        return exported as PluginConstructor;
      }
    }

    return null;
  }

  /**
   * 检查是否为插件构造函数
   */
  private isPluginConstructor(exported: unknown): boolean {
    return (
      typeof exported === 'function' &&
      exported.prototype &&
      typeof (exported.prototype as { register?: unknown }).register === 'function'
    );
  }

  /**
   * 验证插件是否实现接口
   */
  private isValidPlugin(plugin: unknown): plugin is IOpenClawPlugin {
    const p = plugin as IOpenClawPlugin;
    return (
      p &&
      typeof p.metadata === 'object' &&
      typeof p.metadata.name === 'string' &&
      typeof p.metadata.version === 'string' &&
      typeof p.register === 'function'
    );
  }

  /**
   * 解析插件依赖
   */
  private async resolveDependencies(metadata: IPluginMetadata): Promise<void> {
    if (!metadata.dependencies || metadata.dependencies.length === 0) {
      return;
    }

    for (const dep of metadata.dependencies) {
      if (!this.plugins.has(dep)) {
        throw new Error(
          `Plugin "${metadata.name}" depends on "${dep}" which is not loaded`
        );
      }
    }
  }

  /**
   * 卸载所有插件
   */
  async unloadAll(): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      if (plugin.unregister) {
        try {
          await plugin.unregister(this.context);
          this.server.log.info({ name }, 'Plugin unregistered');
        } catch (error) {
          this.server.log.error({ error, name }, 'Failed to unregister plugin');
        }
      }
    }
    this.plugins.clear();
  }

  /**
   * 获取已加载的插件
   */
  getPlugin(name: string): IOpenClawPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * 获取所有已加载的插件
   */
  getAllPlugins(): Map<string, IOpenClawPlugin> {
    return new Map(this.plugins);
  }

  /**
   * 获取服务注册表
   */
  getServiceRegistry(): ServiceRegistry {
    return this.context.services as ServiceRegistry;
  }
}
