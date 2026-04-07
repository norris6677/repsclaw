import { chromium, Browser, Page } from 'playwright';
import {
  NewsSourceClient,
  NewsSourceType,
  NewsSearchParams,
  HospitalNewsItem,
} from '../../types/hospital-news.types';
import { SubscriptionDatabase } from '../subscription-db.service';
import { createLogger } from '../../utils/plugin-logger';

const logger = createLogger('REPSCLAW:BAIDU-SEARCH');

/**
 * 百度搜索客户端
 * 数据来源：百度搜索引擎（百度新闻）
 * 优先级：4
 * 特点：
 * - 作为补充数据源，提供额外覆盖
 * - 6小时持久化缓存，减少请求频率
 * - 遇到验证码快速失败，优雅降级
 */
export class BaiduSearchClient extends NewsSourceClient {
  sourceType = NewsSourceType.BAIDU_SEARCH;
  priority = 4;

  private db: SubscriptionDatabase;
  private readonly CACHE_TTL = 6 * 60 * 60 * 1000; // 6小时

  constructor(db: SubscriptionDatabase) {
    super();
    this.db = db;
  }

  async search(params: NewsSearchParams): Promise<HospitalNewsItem[]> {
    const { hospitalName, aliases, days, maxResults, keywords, departments, doctors } = params;
    const allNames = [hospitalName, ...aliases];

    // 构建科室后缀（如果有订阅科室）
    const deptSuffix = departments && departments.length > 0
      ? ` ${departments.join(' ')}`
      : '';

    // 构建医生后缀（如果有订阅医生）
    const doctorSuffix = doctors && doctors.length > 0
      ? ` ${doctors.join(' ')}`
      : '';

    // 1. 检查缓存（key包含科室和医生信息）
    const suffixCombined = `${deptSuffix}${doctorSuffix}`;
    const cacheKey = keywords
      ? `${keywords}${suffixCombined}`
      : suffixCombined || 'default';
    const cached = this.getCachedResults(hospitalName, cacheKey);
    if (cached && cached.length > 0) {
      logger.info(`[BaiduSearch] 使用缓存结果: ${hospitalName}`, { count: cached.length });
      return this.filterByDate(cached, days).slice(0, maxResults || 5);
    }

    logger.info(`[BaiduSearch] 开始百度搜索: ${hospitalName}`, { departments });

    // 2. 构建搜索关键词（医院名 + 科室 + 医生 + 关键词）
    let searchQuery = `${hospitalName}${deptSuffix}${doctorSuffix}`;
    if (keywords) {
      searchQuery += ` ${keywords}`;
    }
    searchQuery += ' 医院新闻';

    try {
      const results = await this.performSearch(searchQuery, allNames, days, maxResults);

      // 3. 缓存结果（使用包含科室和医生信息的cacheKey）
      if (results.length > 0) {
        this.cacheResults(hospitalName, cacheKey, results);
      }

      logger.info(`[BaiduSearch] 百度搜索完成: ${hospitalName}`, { found: results.length });
      return results;
    } catch (error) {
      logger.warn(`[BaiduSearch] 百度搜索失败，优雅降级: ${hospitalName}`, error);
      // 快速失败，返回空数组
      return [];
    }
  }

  /**
   * 执行百度搜索
   */
  private async performSearch(
    query: string,
    hospitalNames: string[],
    days: number,
    maxResults: number
  ): Promise<HospitalNewsItem[]> {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const results: HospitalNewsItem[] = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
      });

      const page = await context.newPage();

      // 拦截图片/CSS/字体，加速加载
      await page.route('**/*.{png,jpg,jpeg,gif,css,woff,woff2,ttf}', route => route.abort());

      // 构建百度新闻搜索URL
      const encodedQuery = encodeURIComponent(query);
      const searchUrl = `https://www.baidu.com/s?wd=${encodedQuery}&tn=news`;

      // 访问页面
      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      // 随机延迟 2-5秒，模拟人工
      await page.waitForTimeout(2000 + Math.random() * 3000);

      // 检测是否触发反爬
      if (await this.detectBlocking(page)) {
        throw new Error('BLOCKING_DETECTED');
      }

      // 提取搜索结果
      const searchResults = await page.evaluate(() => {
        const items: Array<{
          title: string;
          url: string;
          summary: string;
          source: string;
          dateText: string;
        }> = [];

        // 百度新闻结果选择器（多种可能）
        const selectors = [
          '.result',
          '[tpl]',
          '.c-container',
        ];

        for (const selector of selectors) {
          document.querySelectorAll(selector).forEach(el => {
            const titleEl = el.querySelector('h3 a, .t a, a[data-click]');
            const summaryEl = el.querySelector('.content-right_8Zs40, .c-color-text, .content-right');
            const sourceEl = el.querySelector('.c-color-gray, .g, .cite');
            const dateEl = el.querySelector('.c-color-gray2, .c-gap-right, .s-p');

            if (titleEl) {
              items.push({
                title: titleEl.textContent?.trim() || '',
                url: (titleEl as HTMLAnchorElement).href || '',
                summary: summaryEl?.textContent?.trim() || '',
                source: sourceEl?.textContent?.trim().split(' ')[0] || '百度',
                dateText: dateEl?.textContent?.trim() || '',
              });
            }
          });

          if (items.length >= 5) break;
        }

        return items;
      });

      // 处理和过滤结果
      for (const item of searchResults.slice(0, 5)) {
        if (!item.title) continue;

        // 检查是否包含医院名称
        const containsHospital = hospitalNames.some(name =>
          item.title.includes(name) || item.title.includes(name.replace('医院', ''))
        );

        // 检查是否为医疗相关
        const isMedicalNews = this.isMedicalNews(item.title, item.summary);

        // 如果既不包含医院名也不是医疗新闻，跳过
        if (!containsHospital && !isMedicalNews) continue;

        // 解析日期
        const publishedAt = this.parseDate(item.dateText);
        if (publishedAt < cutoffDate) continue;

        // 计算相关性分数
        const relevanceScore = containsHospital ? 85 : (isMedicalNews ? 50 : 30);

        results.push({
          id: this.generateId('baidu', item.title),
          title: item.title,
          summary: item.summary || item.title,
          source: {
            name: `${item.source}（百度搜索）`,
            type: NewsSourceType.BAIDU_SEARCH,
            url: 'https://www.baidu.com',
          },
          originalUrl: item.url,
          publishedAt: publishedAt.toISOString(),
          fetchedAt: new Date().toISOString(),
          relevanceScore,
          sentiment: this.analyzeSentiment(item.title, item.summary),
          categories: this.categorize(item.title),
          verificationStatus: 'unverified',
          hospitalMentions: hospitalNames.filter(name => item.title.includes(name)),
        });

        if (results.length >= (maxResults || 5)) break;
      }
    } finally {
      await browser.close();
    }

    return results;
  }

  /**
   * 检测是否触发反爬
   */
  private async detectBlocking(page: Page): Promise<boolean> {
    const content = await page.content();
    const url = page.url();

    // 检测验证码
    if (content.includes('验证码') ||
        content.includes('安全验证') ||
        content.includes('请输入验证码') ||
        url.includes('wappass.baidu.com')) {
      logger.warn('[BaiduSearch] 触发百度验证码');
      return true;
    }

    // 检测访问频率限制
    if (content.includes('访问过于频繁') ||
        content.includes('您的访问次数过多') ||
        content.includes('休息一下')) {
      logger.warn('[BaiduSearch] 百度访问频率限制');
      return true;
    }

    // 检测是否被重定向到验证页面
    if (content.includes('很抱歉，您要访问的页面不存在') ||
        content.includes('页面找不到')) {
      logger.warn('[BaiduSearch] 百度页面异常');
      return true;
    }

    return false;
  }

  /**
   * 检查是否为医疗新闻
   */
  private isMedicalNews(title: string, summary?: string): boolean {
    const medicalKeywords = [
      '医院', '医疗', '医生', '患者', '疾病', '治疗', '手术',
      '药物', '疫苗', '医保', '医药', '临床', '科室',
      '专家', '院士', '主任医师', '医疗器械', '健康',
    ];
    const text = `${title} ${summary || ''}`.toLowerCase();
    return medicalKeywords.some(kw => text.includes(kw));
  }

  /**
   * 解析日期
   */
  private parseDate(dateStr: string): Date {
    // 处理百度常见日期格式
    const patterns = [
      /(\d{4})年(\d{1,2})月(\d{1,2})日/,
      /(\d{4})-(\d{1,2})-(\d{1,2})/,
      /(\d{1,2})-(\d{1,2})/,  // MM-DD，假设当年
      /(\d+)天前/,  // X天前
      /(\d+)小时前/, // X小时前
    ];

    for (const pattern of patterns) {
      const match = dateStr.match(pattern);
      if (match) {
        if (pattern.source.includes('天前')) {
          const days = parseInt(match[1]);
          const date = new Date();
          date.setDate(date.getDate() - days);
          return date;
        } else if (pattern.source.includes('小时前')) {
          const hours = parseInt(match[1]);
          const date = new Date();
          date.setHours(date.getHours() - hours);
          return date;
        } else if (match.length === 4) {
          return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
        } else if (match.length === 3) {
          const year = new Date().getFullYear();
          return new Date(year, parseInt(match[1]) - 1, parseInt(match[2]));
        }
      }
    }

    return new Date();
  }

  /**
   * 分类
   */
  private categorize(title: string): string[] {
    const categories: string[] = [];
    const keywords: Record<string, string[]> = {
      '科研': ['科研', '研究', '论文', '成果', '课题', 'SCI', '学术'],
      '临床': ['手术', '治疗', '患者', '病例', '康复'],
      '管理': ['管理', '改革', '制度', '服务', '质量'],
      '荣誉': ['获奖', '表彰', '荣誉', '先进', '优秀'],
    };

    for (const [cat, words] of Object.entries(keywords)) {
      if (words.some(w => title.includes(w))) {
        categories.push(cat);
      }
    }

    return categories.length > 0 ? categories : ['综合'];
  }

  /**
   * 从数据库获取缓存结果
   */
  private getCachedResults(hospitalName: string, keywords?: string): HospitalNewsItem[] | null {
    try {
      // 使用数据库的新闻缓存功能
      const since = new Date(Date.now() - this.CACHE_TTL);
      const cached = this.db.getCachedNews(hospitalName, since);

      // 过滤出百度搜索的结果
      const baiduResults = cached.filter((item: any) =>
        item.sourceType === NewsSourceType.BAIDU_SEARCH ||
        item.source?.type === NewsSourceType.BAIDU_SEARCH
      );

      if (keywords) {
        // 如果有关键词，检查缓存是否匹配关键词
        const keywordFiltered = baiduResults.filter((item: any) =>
          item.keywords === keywords ||
          item.title.includes(keywords) ||
          item.summary?.includes(keywords)
        );
        return keywordFiltered.length > 0 ? keywordFiltered : null;
      }

      return baiduResults.length > 0 ? baiduResults : null;
    } catch (error) {
      logger.warn('[BaiduSearch] 读取缓存失败', error);
      return null;
    }
  }

  /**
   * 缓存结果到数据库
   */
  private cacheResults(hospitalName: string, keywords: string | undefined, results: HospitalNewsItem[]): void {
    try {
      // 为每个结果添加关键词标记
      const resultsWithKeywords = results.map(r => ({
        ...r,
        hospitalName,
        keywords,
      }));

      this.db.cacheNews(resultsWithKeywords);
      logger.debug('[BaiduSearch] 已缓存搜索结果', { count: results.length });
    } catch (error) {
      logger.warn('[BaiduSearch] 写入缓存失败', error);
    }
  }

  /**
   * 按日期过滤缓存结果
   */
  private filterByDate(items: HospitalNewsItem[], days: number): HospitalNewsItem[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return items.filter(item => {
      const itemDate = new Date(item.publishedAt);
      return itemDate >= cutoffDate;
    });
  }
}
