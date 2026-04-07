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
import { OfficialNewsPlaywrightClient } from './official-news.playwright.client';
import { MainstreamNewsClient } from './mainstream-news.client';
import { BaiduSearchClient } from './baidu-search.client';
import { WechatSearchClient } from './wechat-search.client';
import { HospitalNameResolver } from '../../utils/hospital-name-resolver';
import { createLogger } from '../../utils/plugin-logger';
import { subscriptionDB as defaultSubscriptionDB } from '../subscription-db.service';
import type { ISubscriptionDatabase } from '../subscription-db.interface';

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
  private subscriptionDB: ISubscriptionDatabase;

  constructor(subscriptionDB?: ISubscriptionDatabase) {
    this.subscriptionDB = subscriptionDB || defaultSubscriptionDB;
    this.hospitalResolver = new HospitalNameResolver();
    this.clients = [
      new HospitalSelfNewsClient(),           // 优先级1: 医院官网
      new OfficialNewsPlaywrightClient(),     // 优先级2: 政府网站（使用Playwright应对JS挑战）
      new MainstreamNewsClient(),             // 优先级3: 主流媒体
      new BaiduSearchClient(this.subscriptionDB),  // 优先级4: 百度搜索（补充覆盖）
      new WechatSearchClient(this.subscriptionDB), // 优先级5: 搜狗微信（公众号内容）
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

    // 2. 获取订阅信息（用于科室过滤、医生过滤和增量更新）
    const subscription = this.subscriptionDB.getByName(resolved.name);
    const departments = subscription?.departments;
    const doctors = this.subscriptionDB.getDoctors(resolved.name).map(d => d.name);
    const lastQueryAt = subscription?.lastQueryAt;

    // 3. 构建缓存key
    const cacheKey = this.buildCacheKey(resolved.name, params);
    const cached = this.getFromCache(cacheKey);

    // 4. 缓存有效直接返回（增量模式下跳过缓存）
    if (cached && !params.incremental) {
      return {
        ...cached,
        meta: {
          ...cached.meta,
          cached: true,
          cacheAge: Math.floor((Date.now() - this.cache.get(cacheKey)!.timestamp) / 1000),
        },
      };
    }

    // 5. 确定要查询的数据源
    const sourceTypes = params.sources?.length
      ? params.sources
      : [NewsSourceType.HOSPITAL_SELF, NewsSourceType.OFFICIAL, NewsSourceType.MAINSTREAM];

    const activeClients = this.clients.filter(c => sourceTypes.includes(c.sourceType));

    // 6. 并行查询所有数据源（带熔断保护）
    const searchParams: NewsSearchParams = {
      hospitalName: resolved.name,
      aliases: resolved.aliases,
      days: Math.min(Math.max(params.days || 7, 1), 90),
      maxResults: params.maxResults || 10,
      keywords: params.keywords,
      departments, // 传入科室过滤
      doctors, // 传入医生过滤
      incremental: params.incremental,
      lastQueryAt: params.incremental ? lastQueryAt || undefined : undefined,
    };

    // 使用熔断保护的查询
    const results = await Promise.allSettled(
      activeClients.map(client => client.searchWithBreaker(searchParams))
    );

    // 7. 聚合结果
    const allNews: HospitalNewsItem[] = [];
    const sourceStats: Record<string, number> = {
      [NewsSourceType.HOSPITAL_SELF]: 0,
      [NewsSourceType.OFFICIAL]: 0,
      [NewsSourceType.MAINSTREAM]: 0,
      [NewsSourceType.BAIDU_SEARCH]: 0,
      [NewsSourceType.WECHAT_SEARCH]: 0,
      [NewsSourceType.AGGREGATOR]: 0,
    };

    results.forEach((result, index) => {
      const client = activeClients[index];
      if (result.status === 'fulfilled') {
        allNews.push(...result.value);
        sourceStats[client.sourceType] = result.value.length;
      } else {
        logger.error(`[HospitalNewsService] ${client.sourceType} 查询失败:`, result.reason);
        sourceStats[client.sourceType] = 0;
      }
    });

    // 8. 增量更新过滤
    let filteredNews = allNews;
    if (params.incremental && lastQueryAt) {
      const lastIds = this.subscriptionDB.getCachedNews(resolved.name, new Date(lastQueryAt))
        .map(n => n.id);
      filteredNews = this.filterIncremental(allNews, lastIds);
    }

    // 9. 排序和去重
    const sortedNews = this.sortAndDeduplicate(filteredNews);

    // 10. 截断结果
    const finalResults = sortedNews.slice(0, params.maxResults || 10);

    // 11. 更新查询时间和缓存结果（用于下次增量）
    this.subscriptionDB.updateLastQueryTime(resolved.name);
    this.subscriptionDB.cacheNews(finalResults);

    // 12. 构建响应
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
        incremental: params.incremental || false,
        newItems: params.incremental ? finalResults.length : undefined,
        fetchedAt: new Date().toISOString(),
        nextUpdateAt: new Date(Date.now() + this.CACHE_TTL).toISOString(),
      },
    };

    // 13. 写入缓存
    this.setCache(cacheKey, response);

    return response;
  }

  /**
   * 增量过滤 - 排除已存在的新闻
   */
  private filterIncremental(items: HospitalNewsItem[], lastIds: string[]): HospitalNewsItem[] {
    const seen = new Set(lastIds);
    return items.filter(item => !seen.has(item.id));
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
      [NewsSourceType.BAIDU_SEARCH]: 4,    // 百度搜索补充
      [NewsSourceType.WECHAT_SEARCH]: 5,   // 微信搜索（验证码多，优先级最低）
      [NewsSourceType.AGGREGATOR]: 6,      // 最低
    };
    return priorities[sourceType] || 7;
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
        [NewsSourceType.BAIDU_SEARCH]: 0,
        [NewsSourceType.WECHAT_SEARCH]: 0,
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
