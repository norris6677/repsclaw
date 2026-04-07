import { chromium, Browser, Page } from 'playwright';
import {
  NewsSourceClient,
  NewsSourceType,
  NewsSearchParams,
  HospitalNewsItem,
} from '../../types/hospital-news.types';
import { createLogger } from '../../utils/plugin-logger';

const logger = createLogger('REPSCLAW:OFFICIAL-NEWS-PW');

/**
 * 官方政务新闻客户端 (Playwright 版本)
 * 用于应对有JS挑战的政府网站（如国家卫健委、药监局）
 * 优先级：2
 * 特点：
 * - 使用 Playwright 渲染页面，绕过JS挑战
 * - 模拟真实浏览器行为
 * - 更长的超时时间
 */
export class OfficialNewsPlaywrightClient extends NewsSourceClient {
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

    logger.info('[OfficialNewsPlaywright] 开始查询官方数据源', { hospital: hospitalName });

    let browser: Browser | null = null;

    try {
      // 启动浏览器
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
        ],
      });

      // 顺序查询官方源（避免并发触发反爬）
      for (const source of this.officialSources) {
        try {
          const items = await this.crawlWithPlaywright(
            browser,
            source,
            allNames,
            cutoffDate,
            maxResults,
            keywords
          );
          results.push(...items);

          // 添加延迟避免触发反爬
          await this.delay(3000 + Math.random() * 2000);
        } catch (error) {
          logger.error(`[OfficialNewsPlaywright] ${source.name} 查询失败`, error);
        }
      }
    } catch (error) {
      logger.error('[OfficialNewsPlaywright] 浏览器启动失败', error);
    } finally {
      if (browser) {
        await browser.close();
      }
    }

    logger.info('[OfficialNewsPlaywright] 官方数据源查询完成', {
      hospital: hospitalName,
      found: results.length,
    });

    return results.slice(0, maxResults);
  }

  private async crawlWithPlaywright(
    browser: Browser,
    source: typeof this.officialSources[0],
    hospitalNames: string[],
    cutoffDate: Date,
    maxResults: number,
    keywords?: string
  ): Promise<HospitalNewsItem[]> {
    const items: HospitalNewsItem[] = [];

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });

    const page = await context.newPage();

    try {
      // 设置更长的超时时间，等待JS挑战完成
      await page.goto(source.newsUrl, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });

      // 额外等待，确保JS渲染完成
      await page.waitForTimeout(3000);

      // 检查是否有挑战页面
      const content = await page.content();
      if (content.includes('正在加载') || content.includes('验证中')) {
        logger.warn(`[OfficialNewsPlaywright] ${source.name} 检测到验证页面，等待中...`);
        await page.waitForTimeout(5000);
      }

      // 等待列表元素出现
      await page.waitForSelector(source.listSelector, { timeout: 10000 });

      // 提取数据
      const newsItems = await page.evaluate(
        (selector, titleSel, dateSel) => {
          const elements = document.querySelectorAll(selector);
          return Array.from(elements).map(el => {
            const titleEl = el.querySelector(titleSel);
            const dateEl = el.querySelector(dateSel);
            return {
              title: titleEl?.textContent?.trim() || '',
              link: (titleEl as HTMLAnchorElement)?.href || '',
              dateText: dateEl?.textContent?.trim() || '',
            };
          });
        },
        source.listSelector,
        source.titleSelector,
        source.dateSelector
      );

      for (const news of newsItems) {
        if (!news.title) continue;

        // 过滤：检查是否包含医院名称
        const containsHospital = hospitalNames.some(name =>
          news.title.includes(name) || news.title.includes(name.replace('医院', ''))
        );

        // 过滤：检查关键词
        if (keywords && !news.title.includes(keywords)) {
          continue;
        }

        // 即使不包含完整医院名，如果是医疗政策相关也保留
        const isMedicalPolicy = this.isMedicalPolicy(news.title);
        if (!containsHospital && !isMedicalPolicy) {
          continue;
        }

        const publishedAt = this.parseOfficialDate(news.dateText);
        if (publishedAt < cutoffDate) continue;

        const relevanceScore = containsHospital ? 95 : (isMedicalPolicy ? 50 : 30);

        items.push({
          id: this.generateId('official', news.title),
          title: news.title,
          summary: `[${source.name}] ${news.title}`,
          source: {
            name: source.name,
            type: NewsSourceType.OFFICIAL,
            url: source.baseUrl,
          },
          originalUrl: this.resolveUrl(news.link, source.baseUrl),
          publishedAt: publishedAt.toISOString(),
          fetchedAt: new Date().toISOString(),
          relevanceScore,
          sentiment: this.analyzeSentiment(news.title),
          categories: this.categorizeOfficialNews(news.title),
          verificationStatus: 'verified',
          hospitalMentions: hospitalNames.filter(name => news.title.includes(name)),
        });

        if (items.length >= maxResults) break;
      }
    } catch (error) {
      logger.error(`[OfficialNewsPlaywright] ${source.name} 爬取失败`, error);
    } finally {
      await context.close();
    }

    return items;
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
