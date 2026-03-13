#!/usr/bin/env node
/**
 * Axios Mock 工具
 * 用于模拟 HTTP 请求
 */

export interface MockResponse {
  data: unknown;
  status?: number;
  headers?: Record<string, string>;
}

export interface MockRequest {
  url: string;
  method: string;
  params?: Record<string, unknown>;
  data?: unknown;
}

type MockHandler = (config: { url?: string; method?: string; params?: Record<string, unknown>; data?: unknown }) => Promise<MockResponse>;

class MockAxiosInstance {
  private handlers: Map<string, MockHandler> = new Map();
  private defaultBaseURL = '';
  private requestHistory: MockRequest[] = [];

  setBaseURL(url: string) {
    this.defaultBaseURL = url;
  }

  // 注册 mock 处理器
  onGet(urlPattern: string | RegExp, handler: MockHandler) {
    const key = `GET:${urlPattern.toString()}`;
    this.handlers.set(key, handler);
  }

  onPost(urlPattern: string | RegExp, handler: MockHandler) {
    const key = `POST:${urlPattern.toString()}`;
    this.handlers.set(key, handler);
  }

  // 匹配请求并返回 mock 响应
  async request(config: { url?: string; method?: string; params?: Record<string, unknown>; data?: unknown }): Promise<MockResponse> {
    const url = config.url || '';
    const method = (config.method || 'GET').toUpperCase();
    
    // 记录请求历史
    this.requestHistory.push({
      url,
      method,
      params: config.params,
      data: config.data,
    });

    // 查找匹配的处理器
    for (const [key, handler] of this.handlers) {
      const [handlerMethod, pattern] = key.split(':');
      if (handlerMethod !== method) continue;

      const regex = new RegExp(pattern.slice(1, -1)); // 去掉 /pattern/ 前后的 /
      const fullURL = this.defaultBaseURL ? `${this.defaultBaseURL}${url}` : url;
      
      if (regex.test(fullURL) || regex.test(url)) {
        return handler(config);
      }
    }

    // 默认返回 404
    return {
      data: { error: 'Not Found' },
      status: 404,
    };
  }

  async get(url: string, config?: { params?: Record<string, unknown> }): Promise<MockResponse> {
    return this.request({ url, method: 'GET', params: config?.params });
  }

  async post(url: string, data?: unknown, config?: { params?: Record<string, unknown> }): Promise<MockResponse> {
    return this.request({ url, method: 'POST', data, params: config?.params });
  }

  // 获取请求历史
  getRequestHistory(): MockRequest[] {
    return [...this.requestHistory];
  }

  clearHistory() {
    this.requestHistory = [];
  }

  reset() {
    this.handlers.clear();
    this.requestHistory = [];
  }
}

// 全局 mock 实例
export const mockAxios = new MockAxiosInstance();

// 创建模拟的 axios 模块
export function createMockAxios() {
  const instance = new MockAxiosInstance();
  
  const axiosMock = Object.assign(
    jest.fn().mockImplementation((config) => instance.request(config)),
    {
      get: jest.fn((url, config) => instance.get(url, config)),
      post: jest.fn((url, data, config) => instance.post(url, data, config)),
      create: jest.fn(() => instance),
      defaults: { headers: { common: {} } },
      interceptors: {
        request: { use: jest.fn(), eject: jest.fn() },
        response: { use: jest.fn(), eject: jest.fn() },
      },
    }
  );

  return { axiosMock, instance };
}

// 简单的 mock 创建器（用于非 jest 环境）
export function createSimpleMockAxios() {
  const mockInstance = new MockAxiosInstance();
  
  return {
    instance: mockInstance,
    create: () => mockInstance,
  };
}
