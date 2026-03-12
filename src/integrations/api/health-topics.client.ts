import axios, { AxiosInstance } from 'axios';
import { IExternalAPIConfig, ICrawledPage } from '../../types';
import { CombinedRateLimiter } from '../../utils/rate-limiter';

/**
 * Health Topics API 客户端 (Health.gov)
 * 用于检索健康主题和循证健康信息
 * 
 * 默认限流：5请求/秒，突发8请求
 */
export class HealthTopicsClient {
  private client: AxiosInstance;
  private rateLimiter: CombinedRateLimiter;

  constructor(config: IExternalAPIConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://odphp.health.gov/myhealthfinder/api/v4',
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
   * 获取健康主题信息
   */
  async getHealthTopics(params: {
    topic: string;
    language?: 'en' | 'es';
  }): Promise<{
    status: 'success' | 'error';
    data?: {
      search_term: string;
      language: string;
      total_results: number;
      health_topics: Array<{
        title: string;
        url: string;
        last_updated: string;
        section: string;
        description: string;
        content: string[];
      }>;
    };
    error_message?: string;
  }> {
    const { topic, language = 'en' } = params;

    if (!topic) {
      return { status: 'error', error_message: 'Topic is required' };
    }

    const validLanguage = ['en', 'es'].includes(language.toLowerCase()) ? language.toLowerCase() : 'en';

    try {
      const response = await this.executeWithRateLimit(() =>
        this.client.get('/topicsearch.json', {
          params: {
            keyword: topic,
            lang: validLanguage,
          },
        })
      );

      const data = response.data;
      let topics: Array<{
        title: string;
        url: string;
        last_updated: string;
        section: string;
        description: string;
        content: string[];
      }> = [];
      let totalResults = 0;

      if (data?.Result?.Resources) {
        const rawTopics = data.Result.Resources.Resource || [];
        totalResults = rawTopics.length;

        topics = rawTopics.map((rawTopic: Record<string, unknown>) => {
          const processedTopic: {
            title: string;
            url: string;
            last_updated: string;
            section: string;
            description: string;
            content: string[];
          } = {
            title: (rawTopic.Title as string) || '',
            url: (rawTopic.AccessibleVersion as string) || (rawTopic.LastUpdate as string) || '',
            last_updated: (rawTopic.LastUpdate as string) || '',
            section: ((rawTopic.Sections as Record<string, unknown>)?.Section as Array<Record<string, string>>)?.[0]?.Title || '',
            description: ((rawTopic.Sections as Record<string, unknown>)?.Section as Array<Record<string, string>>)?.[0]?.Description || '',
            content: [],
          };

          const rawSections = (rawTopic.Sections as Record<string, unknown>)?.Section;
          if (rawSections) {
            const sections = Array.isArray(rawSections) 
              ? rawSections 
              : [rawSections];
            
            for (const section of sections) {
              if (section.Content) {
                let content = section.Content;
                if (typeof content === 'string') {
                  content = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                  if (content.length > 500) {
                    content = content.substring(0, 497) + '...';
                  }
                  if (content) {
                    processedTopic.content.push(content);
                  }
                }
              }
            }
          }

          return processedTopic;
        });
      }

      return {
        status: 'success',
        data: {
          search_term: topic,
          language: validLanguage,
          total_results: totalResults,
          health_topics: topics,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'error', error_message: `Error searching health topics: ${message}` };
    }
  }

  /**
   * 搜索健康主题并返回标准格式
   */
  async search(params: {
    query: string;
    language?: 'en' | 'es';
  }): Promise<ICrawledPage[]> {
    const { query, language = 'en' } = params;

    const result = await this.getHealthTopics({ topic: query, language });

    if (result.status === 'error' || !result.data) {
      return [];
    }

    return result.data.health_topics.map(topic => ({
      url: topic.url || `https://health.gov/search?query=${encodeURIComponent(query)}`,
      title: topic.title,
      content: [
        topic.description,
        ...topic.content,
      ].join('\n\n'),
      metadata: {
        crawledAt: new Date(),
        statusCode: 200,
        contentType: 'application/json',
        links: [],
        source: 'health_topics',
        lastUpdated: topic.last_updated,
        language,
      },
    }));
  }
}
