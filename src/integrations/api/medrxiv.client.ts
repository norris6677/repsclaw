import axios, { AxiosInstance } from 'axios';
import { IExternalAPIConfig, ICrawledPage } from '../../types';
import { CombinedRateLimiter } from '../../utils/rate-limiter';

/**
 * medRxiv API 客户端
 * 用于搜索预印本医学文献
 * 
 * 默认限流：3请求/秒，突发5请求
 */
export class MedRxivClient {
  private client: AxiosInstance;
  private rateLimiter: CombinedRateLimiter;

  constructor(config: IExternalAPIConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://api.medrxiv.org',
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
      },
    });

    // 初始化限流器
    this.rateLimiter = new CombinedRateLimiter(
      { 
        requestsPerSecond: config.rateLimit?.requestsPerSecond ?? 3,
        burstSize: config.rateLimit?.burstSize ?? 5 
      },
      3 // 最大并发数
    );
  }

  /**
   * 执行带限流的 HTTP 请求
   */
  private async executeWithRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    return this.rateLimiter.execute(fn);
  }

  /**
   * 搜索预印本文章
   */
  async search(params: {
    query: string;
    maxResults?: number;
    days?: number;
    server?: 'medrxiv' | 'biorxiv';
  }): Promise<{
    status: 'success' | 'error';
    data?: {
      query: string;
      total_results: number;
      articles: Array<{
        title: string;
        authors: string[];
        doi: string;
        abstract_url: string;
        publication_date: string;
        server: string;
      }>;
    };
    error_message?: string;
  }> {
    const { query, maxResults = 10, days = 180, server = 'medrxiv' } = params;

    if (!query) {
      return { status: 'error', error_message: 'Search query is required' };
    }

    const validMaxResults = Math.min(Math.max(maxResults, 1), 100);

    try {
      // medRxiv API 使用 URL 路径传递参数
      const endpoint = `/details/${server}/${query}/0/${days}/json`;
      
      const response = await this.executeWithRateLimit(() =>
        this.client.get(endpoint)
      );
      
      const data = response.data;

      const articles = (data.collection || [])
        .slice(0, validMaxResults)
        .map((article: Record<string, unknown>) => ({
          title: (article.rel_title as string) || '',
          authors: (article.rel_authors as string[]) || [],
          doi: (article.rel_doi as string) || '',
          abstract_url: article.rel_doi 
            ? `https://www.medrxiv.org/content/${article.rel_doi}` 
            : '',
          publication_date: (article.rel_date as string) || '',
          server: server,
        }));

      return {
        status: 'success',
        data: {
          query,
          total_results: data.collection?.length || 0,
          articles,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'error', error_message: `Error searching medRxiv: ${message}` };
    }
  }

  /**
   * 搜索并返回标准格式
   */
  async searchAsPages(params: {
    query: string;
    maxResults?: number;
    days?: number;
    server?: 'medrxiv' | 'biorxiv';
  }): Promise<ICrawledPage[]> {
    const { query, maxResults = 10, days = 180, server = 'medrxiv' } = params;

    const result = await this.search({ query, maxResults, days, server });

    if (result.status === 'error' || !result.data) {
      return [];
    }

    return result.data.articles.map(article => ({
      url: article.abstract_url,
      title: article.title,
      content: [
        `Authors: ${article.authors.join(', ')}`,
        `DOI: ${article.doi}`,
        `Publication Date: ${article.publication_date}`,
        `Server: ${article.server}`,
      ].join('\n'),
      metadata: {
        crawledAt: new Date(),
        statusCode: 200,
        contentType: 'application/json',
        links: [],
        source: 'medrxiv',
        doi: article.doi,
        publicationDate: article.publication_date,
        server: article.server,
      },
    }));
  }

  /**
   * 获取最新发布的文章
   */
  async getRecentPapers(params: {
    maxResults?: number;
    days?: number;
    server?: 'medrxiv' | 'biorxiv';
  } = {}): Promise<{
    status: 'success' | 'error';
    data?: {
      total_results: number;
      articles: Array<{
        title: string;
        authors: string[];
        doi: string;
        abstract_url: string;
        publication_date: string;
        server: string;
      }>;
    };
    error_message?: string;
  }> {
    const { maxResults = 10, days = 7, server = 'medrxiv' } = params;

    try {
      // 使用通配符获取最新文章
      const endpoint = `/details/${server}/0/${days}/json`;
      
      const response = await this.executeWithRateLimit(() =>
        this.client.get(endpoint)
      );
      
      const data = response.data;

      const articles = (data.collection || [])
        .slice(0, maxResults)
        .map((article: Record<string, unknown>) => ({
          title: (article.rel_title as string) || '',
          authors: (article.rel_authors as string[]) || [],
          doi: (article.rel_doi as string) || '',
          abstract_url: article.rel_doi 
            ? `https://www.medrxiv.org/content/${article.rel_doi}` 
            : '',
          publication_date: (article.rel_date as string) || '',
          server: server,
        }));

      return {
        status: 'success',
        data: {
          total_results: data.collection?.length || 0,
          articles,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'error', error_message: `Error fetching recent papers: ${message}` };
    }
  }
}
