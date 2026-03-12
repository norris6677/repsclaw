import { IOpenClawPlugin, IPluginContext, IPluginMetadata } from '../types';

/**
 * Health Check 插件
 * 提供系统健康检查端点
 */
export default class HealthPlugin implements IOpenClawPlugin {
  readonly metadata: IPluginMetadata = {
    name: 'health',
    version: '1.0.0',
    description: 'Health check endpoints for system monitoring',
    author: 'OpenClaw Team',
  };

  async register(context: IPluginContext): Promise<void> {
    const { server } = context;

    // 注册健康检查路由
    server.get('/health', async () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      };
    });

    server.get('/health/ready', async () => {
      return { ready: true };
    });

    server.get('/health/live', async () => {
      return { alive: true };
    });
  }
}
