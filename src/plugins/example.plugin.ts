import { IOpenClawPlugin, IPluginContext, IPluginMetadata } from '../types';

/**
 * 示例插件
 * 展示如何创建 OpenClaw 插件
 */
export default class ExamplePlugin implements IOpenClawPlugin {
  readonly metadata: IPluginMetadata = {
    name: 'example',
    version: '1.0.0',
    description: 'Example plugin demonstrating OpenClaw plugin structure',
    author: 'OpenClaw Team',
    dependencies: ['health'], // 声明依赖
  };

  async register(context: IPluginContext): Promise<void> {
    const { server, logger, services } = context;

    logger.info('Example plugin is being registered...');

    // 注册示例服务
    const exampleService = {
      getMessage: () => 'Hello from Example Plugin!',
      getTimestamp: () => new Date().toISOString(),
    };
    services.register('example', exampleService);

    // 注册路由
    server.get('/api/example', async () => {
      return {
        message: exampleService.getMessage(),
        timestamp: exampleService.getTimestamp(),
      };
    });

    server.get('/api/example/:name', async (request) => {
      const { name } = request.params as { name: string };
      return {
        greeting: `Hello, ${name}!`,
        from: this.metadata.name,
        version: this.metadata.version,
      };
    });

    logger.info('Example plugin registered successfully');
  }

  async unregister(context: IPluginContext): Promise<void> {
    const { logger } = context;
    logger.info('Example plugin is being unregistered...');
    // 清理工作可以在这里进行
  }
}
