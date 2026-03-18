import {
  GetHospitalNewsParameters,
  HospitalNewsResult,
  HospitalNewsItem,
  NewsSourceType,
  NewsSourceClient,
  NewsSearchParams,
} from '../../types/hospital-news.types';
import { HospitalSelfNewsClient } from './hospital-self-news.crawlee.client';
import { OfficialNewsClient } from './official-news.crawlee.client';
import { MainstreamNewsClient } from './mainstream-news.client';
import { HospitalNameResolver } from '../../utils/hospital-name-resolver';
import { createLogger } from '../../utils/plugin-logger';

const logger = createLogger('REPSCLAW:NEWS-SERVICE');

interface CacheEntry {
  data: HospitalNewsResult;
  timestamp: number;
}

/**
 * 医院全网消息服务
 * 整合多数据源，提供统一的医院新闻查询接口
 */
export class HospitalNewsService {
  private cache: Map<string, CacheEntry> = new Map();
  private clients: NewsSourceClient[];
  private hospitalResolver: HospitalNameResolver;
  private readonly CACHE_TTL = 2 * 60 * 60 * 1000; // 2小时

  constructor() {
    this.hospitalResolver = new HospitalNameResolver();
    this.clients = [
      new HospitalSelfNewsClient(),    // 优先级1
      new OfficialNewsClient(),         // 优先级2
      new MainstreamNewsClient(),       // 优先级3
    ];
  }

  /**
   * 查询医院全网消息
   */
  async getNews(params: GetHospitalNewsParameters): Promise<HospitalNewsResult> {
    // 1. 解析医院名称
    const resolved = this.hospitalResolver.resolve(params.hospitalName);
    if (!resolved) {
      return this.createErrorResult(params.hospitalName, '未找到该医院，请检查医院名称');
    }

    // 2. 构建缓存key
    const cacheKey = this.buildCacheKey(resolved.name, params);
    const cached = this.getFromCache(cacheKey);

    // 3. 缓存有效直接返回
    if (cached) {
      return {
        ...cached,
        meta: {
          ...cached.meta,
          cached: true,
          cacheAge: Math.floor((Date.now() - this.cache.get(cacheKey)!.timestamp) / 1000),
        },
      };
    }

    // 4. 确定要查询的数据源
    const sourceTypes = params.sources?.length
      ? params.sources
      : [NewsSourceType.HOSPITAL_SELF, NewsSourceType.OFFICIAL, NewsSourceType.MAINSTREAM];

    const activeClients = this.clients.filter(c => sourceTypes.includes(c.sourceType));

    // 5. 并行查询所有数据源
    const searchParams: NewsSearchParams = {
      hospitalName: resolved.name,
      aliases: resolved.aliases,
      days: Math.min(Math.max(params.days || 7, 1), 90),
      maxResults: params.maxResults || 10,
      keywords: params.keywords,
    };

    const results = await Promise.allSettled(
      activeClients.map(client => client.search(searchParams))
    );

    // 6. 聚合结果
    const allNews: HospitalNewsItem[] = [];
    const sourceStats: Record<string, number> = {
      [NewsSourceType.HOSPITAL_SELF]: 0,
      [NewsSourceType.OFFICIAL]: 0,
      [NewsSourceType.MAINSTREAM]: 0,
      [NewsSourceType.AGGREGATOR]: 0,
    };

    results.forEach((result, index) => {
      const client = activeClients[index];
      if (result.status === 'fulfilled') {
        allNews.push(...result.value);
        sourceStats[client.sourceType] = result.value.length;
      } else {
        console.error(`[HospitalNewsService] ${client.sourceType} 查询失败:`, result.reason);
        sourceStats[client.sourceType] = 0;
      }
    });

    // 7. 排序和去重
    const sortedNews = this.sortAndDeduplicate(allNews);

    // 8. 截断结果
    const finalResults = sortedNews.slice(0, params.maxResults || 10);

    // 9. 构建响应
    const response: HospitalNewsResult = {
      status: 'success',
      hospital: {
        input: params.hospitalName,
        resolved: resolved.name,
        aliases: resolved.aliases,
      },
      query: {
        days: searchParams.days,
        sources: sourceTypes,
        keywords: params.keywords,
      },
      totalFound: allNews.length,
      results: finalResults,
      sourceStats,
      meta: {
        cached: false,
        fetchedAt: new Date().toISOString(),
        nextUpdateAt: new Date(Date.now() + this.CACHE_TTL).toISOString(),
      },
    };

    // 10. 写入缓存
    this.setCache(cacheKey, response);

    return response;
  }

  /**
   * 排序和去重
   * 策略：优先级 > 相关性 > 时间
   */
  private sortAndDeduplicate(items: HospitalNewsItem[]): HospitalNewsItem[] {
    // 去重：基于URL和标题相似度
    const seen = new Set<string>();
    const unique: HospitalNewsItem[] = [];

    for (const item of items) {
      // 使用URL去重
      const normalizedUrl = item.originalUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (seen.has(normalizedUrl)) continue;

      // 检查标题相似度（简单版：完全相同或包含关系）
      const isDuplicate = unique.some(u =>
        u.title === item.title ||
        u.title.includes(item.title) ||
        item.title.includes(u.title)
      );
      if (isDuplicate) continue;

      seen.add(normalizedUrl);
      unique.push(item);
    }

    // 排序
    return unique.sort((a, b) => {
      // 首先按优先级（数值越小优先级越高）
      const priorityA = this.getPriority(a.source.type);
      const priorityB = this.getPriority(b.source.type);
      if (priorityA !== priorityB) return priorityA - priorityB;

      // 然后按相关性分数
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }

      // 最后按时间（最新的在前）
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
  }

  private getPriority(sourceType: NewsSourceType): number {
    const priorities: Record<NewsSourceType, number> = {
      [NewsSourceType.HOSPITAL_SELF]: 1,   // 最高
      [NewsSourceType.OFFICIAL]: 2,
      [NewsSourceType.MAINSTREAM]: 3,
      [NewsSourceType.AGGREGATOR]: 4,      // 最低
    };
    return priorities[sourceType] || 5;
  }

  private buildCacheKey(hospitalName: string, params: GetHospitalNewsParameters): string {
    const key = `${hospitalName}:${params.sources?.join(',') || 'all'}:${params.days || 7}:${params.keywords || ''}`;
    return Buffer.from(key).toString('base64');
  }

  private getFromCache(key: string): HospitalNewsResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private setCache(key: string, data: HospitalNewsResult): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });

    // 清理旧缓存（如果超过100条）
    if (this.cache.size > 100) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  private createErrorResult(input: string, error: string): HospitalNewsResult {
    return {
      status: 'error',
      hospital: {
        input,
        resolved: '',
        aliases: [],
      },
      query: {
        days: 0,
        sources: [],
      },
      totalFound: 0,
      results: [],
      sourceStats: {
        [NewsSourceType.HOSPITAL_SELF]: 0,
        [NewsSourceType.OFFICIAL]: 0,
        [NewsSourceType.MAINSTREAM]: 0,
        [NewsSourceType.AGGREGATOR]: 0,
      },
      meta: {
        cached: false,
        fetchedAt: new Date().toISOString(),
        nextUpdateAt: new Date().toISOString(),
      },
    };
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}
