/**
 * Web to Markdown Service
 * 将网页内容转换为 Markdown 格式并持久化存储
 *
 * 反爬机制：
 * 1. User-Agent 轮换
 * 2. 请求延迟控制
 * 3. 指数退避重试
 * 4. 熔断器保护
 * 5. 域名级速率限制
 */

import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import { chromium, Browser, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { WEB_PAGES_DIR } from '../config/data-paths.config';
import { createLogger } from '../utils/plugin-logger';
import {
  AntiCrawlConfig,
  DEFAULT_ANTI_CRAWL_CONFIG,
  withRetry,
  withDelay,
  generateRandomHeaders,
  getRandomUserAgent,
  AntiCrawlManager,
  sleep,
} from '../utils/anti-crawl';
import { CircuitBreaker, CircuitBreakerOptions } from '../utils/circuit-breaker';

const logger = createLogger('REPSCLAW:WEB_TO_MD');

export interface WebToMarkdownOptions {
  url: string;
  outputMode?: 'file' | 'content' | 'both';
  filename?: string;
  usePlaywright?: boolean;
  timeout?: number;
  selectors?: {
    title?: string;
    content?: string;
  };
  /** 反爬配置 */
  antiCrawlConfig?: Partial<AntiCrawlConfig>;
  /** 熔断器配置 */
  circuitBreakerOptions?: CircuitBreakerOptions;
}

export interface WebToMarkdownResult {
  success: boolean;
  url: string;
  title: string;
  markdown: string;
  filepath?: string;
  fileUrl?: string;
  metadata: {
    source: string;
    crawledAt: string;
    wordCount: number;
    method: 'static' | 'playwright';
    retries?: number;
    antiCrawlEnabled: boolean;
  };
  error?: string;
}

/**
 * URL 编码为合法的文件名
 */
export function encodeUrlToFilename(url: string): string {
  try {
    const urlObj = new URL(url);
    let filename = urlObj.hostname.replace(/^www\./, '') + urlObj.pathname;
    filename = filename.replace(/[^a-zA-Z0-9]/g, '-');
    filename = filename.replace(/-+/g, '-');
    filename = filename.replace(/^-|-$/g, '');
    if (filename.length > 100) {
      filename = filename.substring(0, 100);
    }
    const timestamp = new Date().toISOString().split('T')[0];
    return `${filename}-${timestamp}.md`;
  } catch {
    const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 12);
    return `webpage-${hash}.md`;
  }
}

/**
 * 智能提取主要内容
 */
export function extractMainContent($: cheerio.CheerioAPI): string {
  const selectors = [
    'main',
    'article',
    '[role="main"]',
    '.content',
    '.post-content',
    '.article-content',
    '.entry-content',
    '#content',
    '#main-content',
    '.main',
  ];

  for (const selector of selectors) {
    const element = $(selector).first();
    if (element.length && element.text().trim().length > 100) {
      return element.html() || '';
    }
  }

  const body = $('body').clone();
  body.find('script, style, nav, header, footer, aside, .ads, .advertisement, .sidebar, .comments, .social-share').remove();
  return body.html() || '';
}

/**
 * 域名级反爬管理器
 */
const domainAntiCrawlManagers = new Map<string, AntiCrawlManager>();
const domainCircuitBreakers = new Map<string, CircuitBreaker>();

function getDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

function getAntiCrawlManager(domain: string, config?: Partial<AntiCrawlConfig>): AntiCrawlManager {
  if (!domainAntiCrawlManagers.has(domain)) {
    domainAntiCrawlManagers.set(domain, new AntiCrawlManager(config));
  }
  return domainAntiCrawlManagers.get(domain)!;
}

function getCircuitBreaker(domain: string, options?: CircuitBreakerOptions): CircuitBreaker {
  if (!domainCircuitBreakers.has(domain)) {
    domainCircuitBreakers.set(domain, new CircuitBreaker({
      name: `web-to-md-${domain}`,
      failureThreshold: 3,
      timeout: 60000,
      ...options,
    }));
  }
  return domainCircuitBreakers.get(domain)!;
}

/**
 * 使用静态请求获取页面（带反爬保护）
 */
async function fetchStatic(
  url: string,
  timeout: number,
  antiCrawlConfig: Partial<AntiCrawlConfig>
): Promise<{ html: string; method: 'static' | 'playwright'; retries: number }> {
  const domain = getDomainFromUrl(url);
  const antiCrawlManager = getAntiCrawlManager(domain, antiCrawlConfig);
  const circuitBreaker = getCircuitBreaker(domain);

  logger.info('Fetching page with static request (anti-crawl protected)', { url, domain });

  return circuitBreaker.execute(async () => {
    return antiCrawlManager.execute(domain, async () => {
      const headers = antiCrawlManager.getRandomHeaders();

      try {
        const response = await axios.get(url, {
          timeout,
          headers,
          maxRedirects: 5,
          responseType: 'text',
          // 解压 gzip/deflate/br
          decompress: true,
        });

        return {
          html: response.data,
          method: 'static' as const,
          retries: 0,
        };
      } catch (error) {
        const axiosError = error as AxiosError;

        // 如果是 403，可能是被反爬拦截，尝试添加更多请求头
        if (axiosError.response?.status === 403) {
          logger.warn('Received 403, trying with enhanced headers', { url });

          const enhancedHeaders = {
            ...headers,
            'Referer': new URL(url).origin,
            'Origin': new URL(url).origin,
          };

          const response = await axios.get(url, {
            timeout,
            headers: enhancedHeaders,
            maxRedirects: 5,
            responseType: 'text',
            decompress: true,
          });

          return {
            html: response.data,
            method: 'static' as const,
            retries: 1,
          };
        }

        throw error;
      }
    });
  });
}

/**
 * 使用 Playwright 获取页面（带反爬保护）
 */
async function fetchWithPlaywright(
  url: string,
  timeout: number,
  antiCrawlConfig: Partial<AntiCrawlConfig>
): Promise<{ html: string; method: 'static' | 'playwright'; retries: number }> {
  const domain = getDomainFromUrl(url);
  const antiCrawlManager = getAntiCrawlManager(domain, antiCrawlConfig);
  const circuitBreaker = getCircuitBreaker(domain);

  logger.info('Fetching page with Playwright (anti-crawl protected)', { url, domain });

  // 应用请求延迟
  if (antiCrawlConfig.enableDelay !== false) {
    const baseDelay = antiCrawlConfig.baseDelayMs || DEFAULT_ANTI_CRAWL_CONFIG.baseDelayMs;
    const jitter = antiCrawlConfig.delayJitterMs || DEFAULT_ANTI_CRAWL_CONFIG.delayJitterMs;
    const delay = baseDelay + Math.random() * jitter;
    await sleep(delay);
  }

  return circuitBreaker.execute(async () => {
    let browser: Browser | null = null;

    try {
      browser = await chromium.launch({
        headless: true,
      });

      const context = await browser.newContext({
        userAgent: getRandomUserAgent(),
        viewport: { width: 1920, height: 1080 },
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
      });

      // 设置额外 HTTP 头
      await context.setExtraHTTPHeaders({
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      });

      const page = await context.newPage();

      // 拦截并修改请求头（模拟真实浏览器行为）
      await page.route('**/*', async (route, request) => {
        const headers = request.headers();
        headers['sec-ch-ua'] = '"Chromium";v="124", "Google Chrome";v="124"';
        headers['sec-ch-ua-mobile'] = '?0';
        headers['sec-ch-ua-platform'] = '"Windows"';
        await route.continue({ headers });
      });

      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout,
      });

      // 随机等待，模拟人类阅读时间
      await page.waitForTimeout(2000 + Math.random() * 1000);

      const html = await page.content();

      return {
        html,
        method: 'playwright' as const,
        retries: 0,
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  });
}

/**
 * 智能选择获取方式（带反爬重试）
 */
async function fetchPage(
  url: string,
  timeout: number,
  antiCrawlConfig: Partial<AntiCrawlConfig>,
  forcePlaywright?: boolean
): Promise<{ html: string; method: 'static' | 'playwright'; retries: number }> {
  const config: Partial<AntiCrawlConfig> = {
    ...DEFAULT_ANTI_CRAWL_CONFIG,
    ...antiCrawlConfig,
    // 对 Playwright 启用更短的延迟，因为 Playwright 本身开销大
    baseDelayMs: forcePlaywright ? 500 : antiCrawlConfig.baseDelayMs,
  };

  if (forcePlaywright) {
    return withRetry(
      () => fetchWithPlaywright(url, timeout, config),
      config
    );
  }

  // 首先尝试静态获取
  try {
    const result = await withRetry(
      () => fetchStatic(url, timeout, config),
      config
    );
    return result;
  } catch (error) {
    const statusCode = (error as AxiosError)?.response?.status;

    // 如果是反爬相关的错误，尝试 Playwright
    if (statusCode === 403 || statusCode === 429 || statusCode === 503) {
      logger.warn('Static fetch blocked, falling back to Playwright', { url, statusCode });
      return withRetry(
        () => fetchWithPlaywright(url, timeout, config),
        { ...config, baseDelayMs: 500 } // Playwright 使用更短的延迟
      );
    }

    throw error;
  }
}

/**
 * HTML 转 Markdown
 */
export function htmlToMarkdown(html: string): string {
  let md = html;

  md = md.replace(/<!--[\s\S]*?-->/g, '');

  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

  md = md.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi, '**$2**');
  md = md.replace(/<(em|i)[^>]*>([\s\S]*?)<\/(em|i)>/gi, '*$2*');

  md = md.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  md = md.replace(/<img[^>]+src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
  md = md.replace(/<img[^>]+alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, '![$1]($2)');
  md = md.replace(/<img[^>]+src="([^"]*)"[^>]*\/?>/gi, '![]($1)');

  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, '\n$1\n');
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, '\n$1\n');
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');

  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');

  md = md.replace(/<br\s*\/?>/gi, '\n');

  md = md.replace(/<hr\s*\/?>/gi, '\n---\n');

  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, '\n[Table content]\n');

  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (match, content) => {
    const cleaned = content.replace(/^\s+|\s+$/g, '');
    const lines = cleaned.split('\n').filter((line: string) => line.trim());
    if (lines.length === 0) return '\n';
    return '\n> ' + lines.join('\n> ') + '\n';
  });

  md = md.replace(/<[^>]+>/g, '');

  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");

  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  return md;
}

/**
 * 保存 Markdown 到文件
 */
function saveToFile(markdown: string, url: string, filename?: string): string {
  if (!fs.existsSync(WEB_PAGES_DIR)) {
    fs.mkdirSync(WEB_PAGES_DIR, { recursive: true });
  }

  const actualFilename = filename || encodeUrlToFilename(url);
  const filepath = path.join(WEB_PAGES_DIR, actualFilename);

  const content = `---
source: "${url}"
created_at: "${new Date().toISOString()}"
word_count: ${markdown.split(/\s+/).length}
---

${markdown}
`;

  fs.writeFileSync(filepath, content, 'utf-8');
  logger.info('Markdown saved to file', { filepath });

  return filepath;
}

/**
 * 主转换函数（带完整反爬保护）
 */
export async function convertWebToMarkdown(options: WebToMarkdownOptions): Promise<WebToMarkdownResult> {
  const {
    url,
    outputMode = 'both',
    filename,
    usePlaywright,
    timeout = 30000,
    antiCrawlConfig = {},
  } = options;

  const antiCrawlEnabled = antiCrawlConfig.enableDelay !== false;

  logger.info('Converting web to markdown', {
    url,
    outputMode,
    antiCrawlEnabled,
  });

  try {
    const { html, method, retries } = await fetchPage(url, timeout, antiCrawlConfig, usePlaywright);

    const $ = cheerio.load(html);

    let title = $('title').text().trim() ||
                $('h1').first().text().trim() ||
                $('article h1').first().text().trim() ||
                'Untitled';

    title = title.replace(/\n/g, ' ').trim();

    const mainHtml = extractMainContent($);

    let markdown = htmlToMarkdown(mainHtml);

    if (title && !markdown.startsWith('#')) {
      markdown = `# ${title}\n\n${markdown}`;
    }

    let filepath: string | undefined;
    let fileUrl: string | undefined;

    if (outputMode === 'file' || outputMode === 'both') {
      filepath = saveToFile(markdown, url, filename);
      fileUrl = `file://${filepath}`;
    }

    const wordCount = markdown.split(/\s+/).length;

    logger.info('Web to markdown conversion completed', {
      url,
      title,
      method,
      wordCount,
      retries,
      antiCrawlEnabled,
    });

    return {
      success: true,
      url,
      title,
      markdown: outputMode === 'file' ? '' : markdown,
      filepath,
      fileUrl,
      metadata: {
        source: url,
        crawledAt: new Date().toISOString(),
        wordCount,
        method,
        retries,
        antiCrawlEnabled,
      },
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Web to markdown conversion failed', { url, error: errorMessage });

    return {
      success: false,
      url,
      title: '',
      markdown: '',
      metadata: {
        source: url,
        crawledAt: new Date().toISOString(),
        wordCount: 0,
        method: 'static',
        antiCrawlEnabled,
      },
      error: errorMessage,
    };
  }
}

/**
 * 批量转换（带域名级速率限制）
 */
export async function batchConvertWebToMarkdown(
  urls: string[],
  options: Omit<WebToMarkdownOptions, 'url'>
): Promise<WebToMarkdownResult[]> {
  const results: WebToMarkdownResult[] = [];

  for (const url of urls) {
    const result = await convertWebToMarkdown({ ...options, url });
    results.push(result);

    // 批量处理时添加额外延迟
    if (options.antiCrawlConfig?.enableDelay !== false) {
      const delay = (options.antiCrawlConfig?.baseDelayMs || 1000) +
                    Math.random() * (options.antiCrawlConfig?.delayJitterMs || 500);
      await sleep(delay);
    }
  }

  return results;
}

/**
 * 重置指定域名的状态
 */
export function resetDomainStatus(domain: string): void {
  domainAntiCrawlManagers.delete(domain);
  domainCircuitBreakers.delete(domain);
  logger.info('Domain status reset', { domain });
}

/**
 * 重置所有域名状态
 */
export function resetAllDomains(): void {
  domainAntiCrawlManagers.clear();
  domainCircuitBreakers.clear();
  logger.info('All domain statuses reset');
}

/**
 * 获取域名状态
 */
export function getDomainStatus(domain: string): {
  antiCrawl: ReturnType<AntiCrawlManager['getConfig']> | null;
  circuitBreaker: ReturnType<CircuitBreaker['getStats']> | null;
} {
  return {
    antiCrawl: domainAntiCrawlManagers.get(domain)?.getConfig() || null,
    circuitBreaker: domainCircuitBreakers.get(domain)?.getStats() || null,
  };
}
