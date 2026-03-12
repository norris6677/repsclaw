import axios, { AxiosInstance } from 'axios';
import { IExternalAPIConfig, ICrawledPage } from '../../types';
import { CombinedRateLimiter } from '../../utils/rate-limiter';

/**
 * Medical Terminology API 客户端
 * 用于查询 ICD-10 代码和医学术语
 * 
 * 默认限流：5请求/秒，突发8请求
 */
export class MedicalTerminologyClient {
  private client: AxiosInstance;
  private rateLimiter: CombinedRateLimiter;

  constructor(config: IExternalAPIConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://clinicaltables.nlm.nih.gov/api/icd10cm/v3',
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
      },
    });

    // 初始化限流器
    this.rateLimiter = new CombinedRateLimiter(
      { 
        requestsPerSecond: config.rateLimit?.requestsPerSecond ?? 5,
        burstSize: config.rateLimit?.burstSize ?? 8 
      },
      5 // 最大并发数
    );
  }

  /**
   * 执行带限流的 HTTP 请求
   */
  private async executeWithRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    return this.rateLimiter.execute(fn);
  }

  /**
   * 查找 ICD-10 代码
   */
  async lookupICDCode(params: {
    code?: string;
    description?: string;
    maxResults?: number;
  }): Promise<{
    status: 'success' | 'error';
    data?: {
      search_type: string;
      search_term: string;
      total_results: number;
      codes: Array<{
        code: string;
        description: string;
        category: string;
      }>;
    };
    error_message?: string;
  }> {
    const { code = '', description = '', maxResults = 10 } = params;

    if (!code && !description) {
      return { status: 'error', error_message: 'Either code or description is required' };
    }

    const validMaxResults = Math.min(Math.max(maxResults, 1), 50);

    try {
      const response = await this.executeWithRateLimit(() =>
        this.client.get('/search', {
          params: {
            sf: 'code,name',
            terms: code || description,
            maxList: validMaxResults,
          },
        })
      );

      const data = response.data;
      let codes: Array<{ code: string; description: string; category: string }> = [];
      let totalResults = 0;

      if (data && Array.isArray(data[3])) {
        codes = data[3].map((item: string[]) => ({
          code: item[0] || '',
          description: item[1] || '',
          category: item[2] || '',
        }));
        totalResults = codes.length;
      }

      return {
        status: 'success',
        data: {
          search_type: code ? 'code' : 'description',
          search_term: code || description,
          total_results: totalResults,
          codes,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'error', error_message: `Error looking up ICD-10 code: ${message}` };
    }
  }

  /**
   * 搜索医学术语并返回标准格式
   */
  async search(params: {
    query: string;
    maxResults?: number;
  }): Promise<ICrawledPage[]> {
    const { query, maxResults = 10 } = params;

    const result = await this.lookupICDCode({
      code: /^[A-Z]\d+/.test(query) ? query : undefined,
      description: /^[A-Z]\d+/.test(query) ? undefined : query,
      maxResults,
    });

    if (result.status === 'error' || !result.data) {
      return [];
    }

    return result.data.codes.map(item => ({
      url: `https://www.icd10data.com/search?s=${encodeURIComponent(item.code)}`,
      title: `${item.code} - ${item.description}`,
      content: [
        `ICD-10 Code: ${item.code}`,
        `Description: ${item.description}`,
        item.category ? `Category: ${item.category}` : '',
      ].filter(Boolean).join('\n'),
      metadata: {
        crawledAt: new Date(),
        statusCode: 200,
        contentType: 'application/json',
        links: [],
        source: 'icd10',
        icdCode: item.code,
        category: item.category,
      },
    }));
  }

  /**
   * 验证 ICD-10 代码是否有效
   */
  async validateCode(code: string): Promise<boolean> {
    const result = await this.lookupICDCode({ code, maxResults: 1 });
    
    if (result.status === 'success' && result.data) {
      return result.data.codes.some(c => 
        c.code.toUpperCase() === code.toUpperCase()
      );
    }
    
    return false;
  }

  /**
   * 获取代码的详细信息
   */
  async getCodeDetails(code: string): Promise<{
    status: 'success' | 'error';
    data?: {
      code: string;
      description: string;
      category: string;
      url: string;
    };
    error_message?: string;
  }> {
    const result = await this.lookupICDCode({ code, maxResults: 1 });

    if (result.status === 'error') {
      return { status: 'error', error_message: result.error_message };
    }

    const found = result.data?.codes.find(c => 
      c.code.toUpperCase() === code.toUpperCase()
    );

    if (!found) {
      return { status: 'error', error_message: `Code ${code} not found` };
    }

    return {
      status: 'success',
      data: {
        ...found,
        url: `https://www.icd10data.com/${found.code}`,
      },
    };
  }
}
