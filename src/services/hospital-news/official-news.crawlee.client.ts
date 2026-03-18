import {
  CheerioCrawler,
  RequestQueue,
  CheerioCrawlingContext,
} from 'crawlee';
import {
  NewsSourceClient,
  NewsSourceType,
  NewsSearchParams,
  HospitalNewsItem,
} from '../../types/hospital-news.types';
import { createLogger } from '../../utils/plugin-logger';

const logger = createLogger('REPSCLAW:OFFICIAL-NEWS');

/**
 * 官方政务新闻客户端 (Crawlee 版本)
 * 数据来源：卫健委、药监局等官方渠道
 * 优先级：2
 * 特点：
 * - 更强的反爬策略（延迟、请求头轮换）
 * - 模拟真实浏览器行为
 */
export class OfficialNewsClient extends NewsSourceClient {
  sourceType = NewsSourceType.OFFICIAL;
  priority = 2;

  // 官方数据源配置
  private officialSources = [
    {
      name: '国家卫健委',
      baseUrl: 'https://www.nhc.gov.cn',
      newsUrl: 'https://www.nhc.gov.cn/xcs/s3582new/',
      listSelector: '.zxxx_list li, .list-container li, ul li',
      titleSelector: 'a',
      dateSelector: 'span.date, .time, em',
    },
    {
      name: '国家药监局',
      baseUrl: 'https://www.nmpa.gov.cn',
      newsUrl: 'https://www.nmpa.gov.cn/xxgk/zcwj/zcjd/',
      listSelector: '.list li, .news-list li',
      titleSelector: 'a',
      dateSelector: '.date, span.time',
    },
    {
      name: '国家医保局',
      baseUrl: 'https://www.nhsa.gov.cn',
      newsUrl: 'https://www.nhsa.gov.cn/art/2024/',
      listSelector: '.list li, .news-item',
      titleSelector: 'a',
      dateSelector: '.date',
    },
  ];

  async search(params: NewsSearchParams): Promise<HospitalNewsItem[]> {
    const { hospitalName, aliases, days, maxResults, keywords } = params;
    const allNames = [hospitalName, ...aliases];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const results: HospitalNewsItem[] = [];

    logger.info('[OfficialNewsClient] 开始查询官方数据源', { hospital: hospitalName });

    // 顺序查询官方源（避免并发触发反爬）
    for (const source of this.officialSources) {
      try {
        const items = await this.crawlOfficialSource(
          source,
          allNames,
          cutoffDate,
          maxResults,
          keywords
        );
        results.push(...items);

        // 添加延迟避免触发反爬
        await this.delay(2000);
      } catch (error) {
        logger.error(`[OfficialNewsClient] ${source.name} 查询失败`, error);
      }
    }

    logger.info('[OfficialNewsClient] 官方数据源查询完成', {
      hospital: hospitalName,
      found: results.length,
    });

    return results.slice(0, maxResults);
  }

  /**
   * 爬取单个官方数据源
   */
  private async crawlOfficialSource(
    source: typeof this.officialSources[0],
    hospitalNames: string[],
    cutoffDate: Date,
    maxResults: number,
    keywords?: string
  ): Promise<HospitalNewsItem[]> {
    const items: HospitalNewsItem[] = [];

    // 创建请求队列
    const requestQueue = await RequestQueue.open(`official-${Date.now()}`);
    await requestQueue.addRequest({
      url: source.newsUrl,
      userData: { source },
    });

    // 配置 Crawlee 爬虫（更强的反爬策略）
    const crawler = new CheerioCrawler({
      requestQueue,

      // 限制
      maxRequestsPerCrawl: 1,

      // 会话配置
      useSessionPool: true,
      sessionPoolOptions: {
        maxPoolSize: 3,
        sessionOptions: {
          maxUsageCount: 5,
          maxErrorScore: 2,
        },
      },

      // 浏览器指纹伪装（模拟真实用户）
      headerGeneratorOptions: {
        browsers: ['chrome'],
        devices: ['desktop'],
        locales: ['zh-CN'],
        operatingSystems: ['windows'],
      },

      // 错误处理
      maxRequestRetries: 2,
      retryOnBlocked: true,

      // 延迟配置
      minConcurrency: 1,
      maxConcurrency: 1,

      // 预处理请求
      preNavigationHooks: [
        async ({ request }) => {
          // 添加额外的反爬请求头
          request.headers ??= {};
          request.headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
          request.headers['Accept-Language'] = 'zh-CN,zh;q=0.9,en;q=0.8';
          request.headers['Accept-Encoding'] = 'gzip, deflate, br';
          request.headers['DNT'] = '1';
          request.headers['Connection'] = 'keep-alive';
          request.headers['Upgrade-Insecure-Requests'] = '1';
          request.headers['Sec-Fetch-Dest'] = 'document';
          request.headers['Sec-Fetch-Mode'] = 'navigate';
          request.headers['Sec-Fetch-Site'] = 'none';
          request.headers['Sec-Fetch-User'] = '?1';
          request.headers['Cache-Control'] = 'max-age=0';
        },
      ],

      // 请求处理器
      requestHandler: async ({ request, $, response }: CheerioCrawlingContext) => {
        const sourceConfig = request.userData.source as typeof this.officialSources[0];
        logger.debug(`[Crawlee] 处理官方数据源: ${sourceConfig.name}`);

        if (response.statusCode !== 200) {
          logger.warn(`[Crawlee] 官方数据源返回非 200: ${request.url} = ${response.statusCode}`);
          return;
        }

        $(sourceConfig.listSelector).each((_, element) => {
          const titleEl = $(element).find(sourceConfig.titleSelector);
          const title = titleEl.text().trim();
          const link = titleEl.attr('href');
          const dateText = $(element).find(sourceConfig.dateSelector).text().trim();

          if (!title) return;

          // 过滤：检查是否包含医院名称
          const containsHospital = hospitalNames.some(name =>
            title.includes(name) || title.includes(name.replace('医院', ''))
          );

          // 过滤：检查关键词
          if (keywords && !title.includes(keywords)) {
            return;
          }

          // 即使不包含完整医院名，如果是医疗政策相关也保留
          const isMedicalPolicy = this.isMedicalPolicy(title);
          if (!containsHospital && !isMedicalPolicy) {
            return;
          }

          const publishedAt = this.parseOfficialDate(dateText);
          if (publishedAt < cutoffDate) return;

          const relevanceScore = containsHospital ? 95 : (isMedicalPolicy ? 50 : 30);

          items.push({
            id: this.generateId('official', title),
            title,
            summary: `[${sourceConfig.name}] ${title}`,
            source: {
              name: sourceConfig.name,
              type: NewsSourceType.OFFICIAL,
              url: sourceConfig.baseUrl,
            },
            originalUrl: this.resolveUrl(link, sourceConfig.baseUrl),
            publishedAt: publishedAt.toISOString(),
            fetchedAt: new Date().toISOString(),
            relevanceScore,
            sentiment: this.analyzeSentiment(title),
            categories: this.categorizeOfficialNews(title),
            verificationStatus: 'verified',
            hospitalMentions: hospitalNames.filter(name => title.includes(name)),
          });
        });
      },

      // 失败处理器
      failedRequestHandler({ request }, error: Error) {
        logger.error(`[Crawlee] 官方数据源请求失败: ${request.url}`, error);
      },
    }, this.config);

    // 运行爬虫
    await crawler.run();

    // 清理队列
    await requestQueue.drop();

    return items.slice(0, maxResults);
  }

  private isMedicalPolicy(title: string): boolean {
    const policyKeywords = [
      '医疗机构', '医院管理', '医疗质量', '医疗安全', '医疗服务',
      '分级诊疗', '医联体', '医共体', '公立医院', '民营医院',
      '临床', '医务人员', '医疗改革', '医保', '医药',
    ];
    return policyKeywords.some(kw => title.includes(kw));
  }

  private parseOfficialDate(dateStr: string): Date {
    // 官方网站的日期格式：[2024-03-15] 或 2024-03-15 或 2024年03月15日
    const match = dateStr.match(/(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})/);
    if (match) {
      return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    }
    return new Date();
  }

  private resolveUrl(url: string | undefined, baseUrl: string): string {
    if (!url) return baseUrl;
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) {
      const base = new URL(baseUrl);
      return `${base.protocol}//${base.host}${url}`;
    }
    return `${baseUrl.replace(/\/$/, '')}/${url}`;
  }

  private categorizeOfficialNews(title: string): string[] {
    const categories: string[] = [];

    const mapping: Record<string, string[]> = {
      '政策': ['政策', '通知', '公告', '办法', '规定', '意见', '方案'],
      '监管': ['监管', '检查', '处罚', '通报', '整改', '飞行检查'],
      '医保': ['医保', '医保局', '报销', '集采', '价格', '支付'],
      '药品': ['药品', '药物', '疫苗', '器械', '注册', '审批'],
      '疫情': ['疫情', '传染病', '防控', '公卫', '疾控'],
    };

    for (const [cat, keywords] of Object.entries(mapping)) {
      if (keywords.some(kw => title.includes(kw))) {
        categories.push(cat);
      }
    }

    return categories.length > 0 ? categories : ['政务'];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
