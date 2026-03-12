import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';
import {
  ICrawlConfig,
  ICrawledPage,
  ICrawlResult,
  ICrawlError,
} from '../types';
import { EventEmitter } from 'events';

/**
 * 网页爬虫服务
 * 支持递归爬取、内容提取和状态管理
 */
export class CrawlerService extends EventEmitter {
  private axiosInstance: AxiosInstance;
  private activeJobs: Map<string, ICrawlResult> = new Map();
  private jobCounter = 0;

  constructor() {
    super();
    this.axiosInstance = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
  }

  /**
   * 启动爬取任务
   */
  async crawl(config: ICrawlConfig): Promise<ICrawlResult> {
    const jobId = this.generateJobId();
    const result: ICrawlResult = {
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

    try {
      const visitedUrls = new Set<string>();
      const urlsToCrawl: { url: string; depth: number }[] = [
        { url: config.url, depth: 0 },
      ];

      const maxDepth = config.depth ?? 2;
      const maxPages = config.maxPages ?? 100;
      const delay = config.delay ?? 1000;

      while (urlsToCrawl.length > 0 && result.pages.length < maxPages) {
        const { url, depth } = urlsToCrawl.shift()!;

        if (visitedUrls.has(url) || depth > maxDepth) {
          continue;
        }
        visitedUrls.add(url);

        try {
          const page = await this.fetchPage(url, config);
          result.pages.push(page);
          result.stats.successCount++;
          this.emit('page:crawled', { jobId, url, page });

          // 提取新链接
          if (depth < maxDepth) {
            const newUrls = this.extractLinks(page, config.url);
            for (const newUrl of newUrls) {
              if (!visitedUrls.has(newUrl)) {
                urlsToCrawl.push({ url: newUrl, depth: depth + 1 });
              }
            }
          }

          // 延迟
          if (delay > 0) {
            await this.sleep(delay);
          }
        } catch (error) {
          const crawlError: ICrawlError = {
            url,
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date(),
          };
          result.errors.push(crawlError);
          result.stats.errorCount++;
          this.emit('page:error', { jobId, url, error: crawlError });
        }

        result.stats.totalPages++;
      }

      result.status = 'completed';
      result.stats.endTime = new Date();
      this.emit('job:completed', { jobId, result });
    } catch (error) {
      result.status = 'failed';
      result.stats.endTime = new Date();
      this.emit('job:failed', { jobId, error });
    }

    return result;
  }

  /**
   * 获取单个页面
   */
  async fetchPage(url: string, config: ICrawlConfig): Promise<ICrawledPage> {
    const axiosConfig: AxiosRequestConfig = {
      url,
      method: 'GET',
      headers: config.headers,
      timeout: config.timeout,
    };

    if (config.proxy) {
      axiosConfig.proxy = config.proxy;
    }

    const response = await this.axiosInstance.request(axiosConfig);
    const html = response.data;
    const $ = cheerio.load(html);

    // 移除脚本和样式
    $('script, style, nav, footer, header').remove();

    const title = $('title').text().trim() || '';
    const content = $('body').text().trim().replace(/\s+/g, ' ');

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

    return {
      url,
      title,
      content,
      html: config.depth === 0 ? html : undefined, // 只在第一层保留HTML
      metadata: {
        crawledAt: new Date(),
        statusCode: response.status,
        contentType: response.headers['content-type'] || 'unknown',
        links,
      },
    };
  }

  /**
   * 获取任务状态
   */
  getJobStatus(jobId: string): ICrawlResult | undefined {
    return this.activeJobs.get(jobId);
  }

  /**
   * 获取所有活跃任务
   */
  getActiveJobs(): ICrawlResult[] {
    return Array.from(this.activeJobs.values());
  }

  /**
   * 提取页面中的链接
   */
  private extractLinks(page: ICrawledPage, baseUrl: string): string[] {
    const baseDomain = new URL(baseUrl).hostname;
    return page.metadata.links.filter((url) => {
      try {
        const urlObj = new URL(url);
        // 只保留同域名链接
        return urlObj.hostname === baseDomain;
      } catch {
        return false;
      }
    });
  }

  /**
   * 生成任务ID
   */
  private generateJobId(): string {
    return `crawl_${Date.now()}_${++this.jobCounter}`;
  }

  /**
   * 延迟
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
