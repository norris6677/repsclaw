import { IServiceRegistry } from '../types';

/**
 * 服务注册表实现
 * 用于插件间的服务共享
 */
export class ServiceRegistry implements IServiceRegistry {
  private services: Map<string, unknown> = new Map();

  get<T>(name: string): T | undefined {
    return this.services.get(name) as T | undefined;
  }

  register<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  has(name: string): boolean {
    return this.services.has(name);
  }

  unregister(name: string): boolean {
    return this.services.delete(name);
  }

  getAll(): Record<string, unknown> {
    return Object.fromEntries(this.services);
  }
}
