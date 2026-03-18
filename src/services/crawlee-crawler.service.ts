import {
  CheerioCrawler,
  CheerioCrawlingContext,
  RequestQueue,
  RequestList,
  Configuration,
} from 'crawlee';
import { EventEmitter } from 'events';
import { createLogger } from '../utils/plugin-logger';

const logger = createLogger('REPSCLAW:CRAWLEE');

export interface CrawleeCrawlConfig {
  url: string;
  depth?: number;
  maxPages?: number;
  timeout?: number;
  delay?: number;
  headers?: Record<string, string>;
  proxy?: string;
  waitFor?: string;
  useBrowser?: boolean; // 是否使用 Playwright 浏览器
  selectors?: {
    title?: string;
    content?: string;
    date?: string;
    items?: string;
  };
}

export interface CrawleeCrawledPage {
  url: string;
  title: string;
  content: string;
  html?: string;
  metadata: {
    crawledAt: Date;
    statusCode: number;
    contentType: string;
    depth: number;
    links: string[];
  };
}

export interface CrawleeCrawlResult {
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  pages: CrawleeCrawledPage[];
  errors: Array<{ url: string; message: string; timestamp: Date }>;
  stats: {
    totalPages: number;
    successCount: number;
    errorCount: number;
    startTime: Date;
    endTime?: Date;
  };
}

/**
 * 基于 Crawlee 的增强爬虫服务
 * 特点：
 * 1. 自动会话轮换（避免被封）
 * 2. 智能重试机制
 * 3. 浏览器指纹伪装
 * 4. 支持 Playwright 渲染（用于 JS 网站）
 */
export class CrawleeCrawlerService extends EventEmitter {
  private activeJobs: Map<string, CrawleeCrawlResult> = new Map();
  private jobCounter = 0;
  private config: Configuration;

  constructor() {
    super();
    // 配置 Crawlee
    this.config = new Configuration({
      persistStorage: false,
      defaultRequestQueueId: 'repsclaw-queue',
    });
  }

  /**
   * 执行单页面爬取（用于快速获取新闻列表）
   */
  async crawlSingle(config: CrawleeCrawlConfig): Promise<CrawleeCrawledPage | null> {
    const result = await this.crawl({
      ...config,
      depth: 0,
      maxPages: 1,
    });

    return result.pages[0] || null;
  }

  /**
   * 启动爬取任务
   */
  async crawl(config: CrawleeCrawlConfig): Promise<CrawleeCrawlResult> {
    const jobId = this.generateJobId();
    const result: CrawleeCrawlResult = {
      jobId,
      status: 'running',
      pages: [],
      errors: [],
      stats: {
        totalPages: 0,
        successCount: 0,
        errorCount: 0,
        startTime: new Date(),
      },
    };

    this.activeJobs.set(jobId, result);
    this.emit('job:started', { jobId, url: config.url });
    logger.info(`[Crawlee] 开始爬取任务: ${jobId}`, { url: config.url });

    try {
      const pages = await this.runCrawler(config, result);
      result.pages = pages;
      result.status = 'completed';
      result.stats.endTime = new Date();
      result.stats.successCount = pages.length;
      result.stats.totalPages = pages.length + result.stats.errorCount;

      logger.info(`[Crawlee] 任务完成: ${jobId}`, {
        success: result.stats.successCount,
        errors: result.stats.errorCount,
      });

      this.emit('job:completed', { jobId, result });
    } catch (error) {
      result.status = 'failed';
      result.stats.endTime = new Date();
      result.errors.push({
        url: config.url,
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      });

      logger.error(`[Crawlee] 任务失败: ${jobId}`, error);
      this.emit('job:failed', { jobId, error });
    }

    return result;
  }

  /**
   * 运行 Crawlee 爬虫
   */
  private async runCrawler(
    config: CrawleeCrawlConfig,
    result: CrawleeCrawlResult
  ): Promise<CrawleeCrawledPage[]> {
    const pages: CrawleeCrawledPage[] = [];
    const maxDepth = config.depth ?? 2;
    const maxPages = config.maxPages ?? 100;

    // 创建请求队列
    const requestQueue = await RequestQueue.open(`queue-${result.jobId}`);
    await requestQueue.addRequest({
      url: config.url,
      userData: { depth: 0 },
    });

    // 配置 Crawlee 爬虫
    const crawler = new CheerioCrawler({
      requestQueue,
      configuration: this.config,

      // 请求配置
      requestHandlerTimeoutSecs: (config.timeout || 30000) / 1000,

      // 会话和代理配置
      useSessionPool: true,
      sessionPoolOptions: {
        maxPoolSize: 10,
        sessionOptions: {
          maxUsageCount: 20,
          maxErrorScore: 3,
        },
      },

      // 浏览器指纹伪装
      headerGeneratorOptions: {
        browsers: ['chrome', 'firefox', 'safari'],
        devices: ['desktop'],
        locales: ['zh-CN', 'zh-TW', 'en-US'],
        operatingSystems: ['windows', 'macos', 'linux'],
      },

      // 错误处理
      maxRequestRetries: 3,
      retryOnBlocked: true,

      // 请求间隔（避免被封）
      minConcurrency: 1,
      maxConcurrency: 2,

      // 请求处理器
      async requestHandler({ request, $, response }: CheerioCrawlingContext) {
        const depth = request.userData.depth || 0;
        const url = request.url;

        logger.debug(`[Crawlee] 处理页面: ${url}`, { depth });

        try {
          // 移除脚本和样式
          $('script, style, nav, footer, header, iframe').remove();

          // 提取标题
          const title = $(config.selectors?.title || 'title').first().text().trim()
            || $('h1').first().text().trim()
            || $('h2').first().text().trim()
            || '无标题';

          // 提取内容
          const contentSelectors = config.selectors?.content
            ? [config.selectors.content]
            : ['article', 'main', '.content', '.article', '#content', 'body'];

          let content = '';
          for (const selector of contentSelectors) {
            const text = $(selector).text().trim();
            if (text.length > content.length) {
              content = text;
            }
          }

          // 清理内容
          content = content.replace(/\s+/g, ' ').slice(0, 10000);

          // 提取链接
          const links: string[] = [];
          $('a[href]').each((_, elem) => {
            const href = $(elem).attr('href');
            if (href) {
              try {
                const absoluteUrl = new URL(href, url).toString();
                links.push(absoluteUrl);
              } catch {
                // 忽略无效URL
              }
            }
          });

          const page: CrawleeCrawledPage = {
            url,
            title,
            content,
            html: depth === 0 ? $.html() : undefined,
            metadata: {
              crawledAt: new Date(),
              statusCode: response.statusCode || 200,
              contentType: response.headers['content-type'] || 'text/html',
              depth,
              links,
            },
          };

          pages.push(page);

          // 如果未达到最大深度，添加新链接到队列
          if (depth < maxDepth && pages.length < maxPages) {
            const baseDomain = new URL(config.url).hostname;

            for (const link of links) {
              try {
                const linkDomain = new URL(link).hostname;
                // 只添加同域名链接
                if (linkDomain === baseDomain) {
                  await requestQueue.addRequest({
                    url: link,
                    userData: { depth: depth + 1 },
                  });
                }
              } catch {
                // 忽略无效URL
              }
            }
          }
        } catch (error) {
          logger.error(`[Crawlee] 页面处理失败: ${url}`, error);
          result.errors.push({
            url,
            message: error instanceof Error ? error.message : String(error),
            timestamp: new Date(),
          });
          result.stats.errorCount++;
        }
      },

      // 失败处理器
      failedRequestHandler({ request }, error: Error) {
        logger.error(`[Crawlee] 请求失败: ${request.url}`, error);
        result.errors.push({
          url: request.url,
          message: error.message,
          timestamp: new Date(),
        });
        result.stats.errorCount++;
      },
    }, this.config);

    // 运行爬虫
    await crawler.run();

    // 清理队列
    await requestQueue.drop();

    return pages.slice(0, maxPages);
  }

  /**
   * 使用 Playwright 渲染页面（用于 JS 动态内容）
   */
  async crawlWithBrowser(config: CrawleeCrawlConfig): Promise<CrawleeCrawlResult> {
    // 动态导入 Playwright 爬虫
    const { PlaywrightCrawler } = await import('crawlee');

    const jobId = this.generateJobId();
    const result: CrawleeCrawlResult = {
      jobId,
      status: 'running',
      pages: [],
      errors: [],
      stats: {
        totalPages: 0,
        successCount: 0,
        errorCount: 0,
        startTime: new Date(),
      },
    };

    this.activeJobs.set(jobId, result);
    logger.info(`[Crawlee/Playwright] 开始浏览器渲染爬取: ${jobId}`, { url: config.url });

    try {
      const pages: CrawleeCrawledPage[] = [];

      const crawler = new PlaywrightCrawler({
        configuration: this.config,
        maxRequestRetries: 3,
        retryOnBlocked: true,
        useSessionPool: true,

        async requestHandler({ request, page, response }) {
          logger.debug(`[Crawlee/Playwright] 处理页面: ${request.url}`);

          // 等待指定选择器
          if (config.waitFor) {
            await page.waitForSelector(config.waitFor, { timeout: 10000 });
          }

          // 等待页面稳定
          await page.waitForLoadState('networkidle', { timeout: 10000 });

          const title = await page.title();
          const content = await page.evaluate(() => {
            // 移除脚本和样式
            document.querySelectorAll('script, style, nav, footer, header, iframe').forEach(el => el.remove());
            return document.body?.innerText || '';
          });

          const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href]'))
              .map(a => (a as HTMLAnchorElement).href)
              .filter(href => href.startsWith('http'));
          });

          pages.push({
            url: request.url,
            title,
            content: content.replace(/\s+/g, ' ').slice(0, 10000),
            metadata: {
              crawledAt: new Date(),
              statusCode: response?.status() || 200,
              contentType: 'text/html',
              depth: 0,
              links,
            },
          });
        },

        failedRequestHandler({ request }, error: Error) {
          logger.error(`[Crawlee/Playwright] 请求失败: ${request.url}`, error);
          result.errors.push({
            url: request.url,
            message: error.message,
            timestamp: new Date(),
          });
        },
      });

      await crawler.run([config.url]);

      result.pages = pages;
      result.status = 'completed';
      result.stats.endTime = new Date();
      result.stats.successCount = pages.length;

      logger.info(`[Crawlee/Playwright] 任务完成: ${jobId}`);
    } catch (error) {
      result.status = 'failed';
      result.stats.endTime = new Date();
      logger.error(`[Crawlee/Playwright] 任务失败: ${jobId}`, error);
    }

    return result;
  }

  /**
   * 提取列表项（用于新闻列表页）
   */
  async extractListItems(
    config: CrawleeCrawlConfig
  ): Promise<Array<{ title: string; url: string; date?: string; summary?: string }>> {
    const result = await this.crawlSingle(config);
    if (!result) return [];

    // 使用 cheerio 解析列表
    const cheerio = await import('cheerio');
    const $ = cheerio.load(result.html || result.content);

    const items: Array<{ title: string; url: string; date?: string; summary?: string }> = [];
    const listSelectors = [
      config.selectors?.items,
      'ul.news-list li',
      '.news-item',
      '.list-item',
      'article',
      '.media',
      '.news-list .item',
      '.content-list li',
      '[class*="news"] li',
      'ul li',
    ].filter(Boolean);

    for (const selector of listSelectors) {
      $(selector!).each((_, element) => {
        const titleEl = $(element).find('a, h1, h2, h3, h4, .title').first();
        const title = titleEl.text().trim();
        const link = titleEl.attr('href') || $(element).find('a').attr('href');
        const dateText = $(element).find('.date, .time, [class*="date"], [class*="time"]').first().text().trim();
        const summary = $(element).find('.summary, .desc, p').first().text().trim();

        if (title && link) {
          const absoluteUrl = link.startsWith('http')
            ? link
            : new URL(link, config.url).toString();

          items.push({
            title,
            url: absoluteUrl,
            date: dateText,
            summary: summary.slice(0, 200),
          });
        }
      });
    }

    return items;
  }

  /**
   * 获取任务状态
   */
  getJobStatus(jobId: string): CrawleeCrawlResult | undefined {
    return this.activeJobs.get(jobId);
  }

  /**
   * 获取所有活跃任务
   */
  getActiveJobs(): CrawleeCrawlResult[] {
    return Array.from(this.activeJobs.values());
  }

  private generateJobId(): string {
    return `crawlee_${Date.now()}_${++this.jobCounter}`;
  }
}

// 导出单例
export const crawleeCrawler = new CrawleeCrawlerService();
