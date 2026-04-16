/**
 * Collection Worker - Enhanced Version
 * Worker 线程实现 - 执行实际采集任务（增强版）
 *
 * 强化改进：
 * 1. 微信搜索增强反爬策略（验证码处理、长超时、智能跳转解析）
 * 2. 医院官网智能分段采集（首页分块、Sitemap解析、去重优化）
 * 3. 多维度搜索关键词组合
 * 4. 百度搜索分页采集
 * 5. 修复重复触发问题
 */

import { parentPort, workerData } from 'worker_threads';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium, Browser, Page } from 'playwright';
import type {
  CollectionJobConfig,
  CollectionStrategy,
  CollectionSourceType,
  RawSourceMetadata,
} from '../../types/knowledge-collection.types';
import { RawSourceManager } from './raw-source.manager';
import { hashUrl, hashTitle } from '../../utils/deduplication';

// Worker 接收的参数
const { jobId, config, strategy, storagePath } = workerData as {
  jobId: string;
  config: CollectionJobConfig;
  strategy: CollectionStrategy;
  storagePath: string;
};

// 数据源配置（超时、优先级）
interface SourceConfig {
  timeout: number;      // 单源总超时（毫秒）
  priority: number;     // 优先级（数字越小越优先）
  concurrent: boolean;  // 是否可并发执行
}

const SOURCE_CONFIG: Record<string, SourceConfig> = {
  'wechat_search': { timeout: 8 * 60 * 1000, priority: 1, concurrent: false },    // 微信优先，8分钟
  'hospital_official': { timeout: 5 * 60 * 1000, priority: 2, concurrent: false }, // 官网5分钟
  'baidu_search': { timeout: 6 * 60 * 1000, priority: 3, concurrent: false },      // 百度6分钟
  'gov_official': { timeout: 4 * 60 * 1000, priority: 4, concurrent: false },
  'news_media': { timeout: 4 * 60 * 1000, priority: 5, concurrent: false },
};

// 初始化管理器
const rawSourceManager = new RawSourceManager();

// 统计
let progress = {
  total: 0,
  completed: 0,
  failed: 0,
  duplicates: 0,
};

// 数据源结果收集
const sourceResults = new Map<string, RawSourceMetadata[]>();

// 请求计数
let requestCount = 0;

// 数据源开始时间
let sourceStartTime = Date.now();

// 标记是否已完成
let isCompleted = false;

// 微信搜索专用Cookie（用于维持会话）
let wechatCookies: { name: string; value: string; domain: string }[] = [];

/**
 * 发送进度更新
 */
function reportProgress() {
  if (isCompleted) return;
  parentPort?.postMessage({ type: 'progress', data: progress });
}

/**
 * 发送结果
 */
function reportResult(metadata: RawSourceMetadata) {
  if (isCompleted) return;
  parentPort?.postMessage({ type: 'result', data: metadata });
}

/**
 * 发送错误
 */
function reportError(source: string, message: string, retryCount: number) {
  if (isCompleted) return;
  parentPort?.postMessage({
    type: 'error',
    data: { source, message, retryCount, timestamp: new Date().toISOString() },
  });
}

/**
 * 发送数据源完成事件
 */
function reportSourceComplete(sourceType: CollectionSourceType, items: RawSourceMetadata[]) {
  if (isCompleted) return;
  const duration = Date.now() - sourceStartTime;
  parentPort?.postMessage({ type: 'source_complete', data: { sourceType, items, duration } });
  sourceStartTime = Date.now();
}

/**
 * 发送 Agent 开始事件
 */
function reportAgentStarted(agentId: string, sourceType: CollectionSourceType, payload: { queryCount: number; maxResults: number }) {
  if (isCompleted) return;
  parentPort?.postMessage({
    type: 'agent_started',
    data: { agentId, sourceType, ...payload },
  });
}

/**
 * 发送 Agent 进度事件
 */
function reportAgentProgress(agentId: string, sourceType: CollectionSourceType, payload: { completed: number; failed: number; duplicates: number; currentQuery?: string }) {
  if (isCompleted) return;
  parentPort?.postMessage({
    type: 'agent_progress',
    data: { agentId, sourceType, ...payload },
  });
}

/**
 * 发送 Agent 完成事件
 */
function reportAgentComplete(agentId: string, sourceType: CollectionSourceType, payload: { itemCount: number; duration: number }) {
  if (isCompleted) return;
  parentPort?.postMessage({
    type: 'agent_complete',
    data: { agentId, sourceType, ...payload },
  });
}

/**
 * 发送完成消息
 */
function reportComplete() {
  if (isCompleted) return;
  isCompleted = true;
  parentPort?.postMessage({ type: 'complete' });
}

/**
 * 随机延迟
 */
async function randomDelay(minMs?: number, maxMs?: number): Promise<void> {
  const min = minMs || strategy.minDelay;
  const max = maxMs || strategy.maxDelay;
  const delay = min + Math.random() * (max - min);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * 获取随机 User-Agent
 */
function getRandomUserAgent(): string {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

/**
 * 指数退避延迟
 */
async function exponentialBackoffDelay(retryCount: number): Promise<void> {
  const delay = Math.min(strategy.baseRetryDelay * Math.pow(2, retryCount), strategy.maxRetryDelay);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * 检查请求限制
 */
function checkRequestLimit(): boolean {
  if (strategy.dailyRequestLimit && requestCount >= strategy.dailyRequestLimit) {
    return false;
  }
  return true;
}

/**
 * 使用 Playwright 获取页面（增强版）
 */
async function fetchWithPlaywright(
  url: string,
  options: { timeout?: number; waitForSelector?: string; solveCaptcha?: boolean } = {}
): Promise<{ html: string; title: string; finalUrl: string } | null> {
  const timeout = options.timeout || 60000; // 默认60秒超时
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  try {
    const context = await browser.newContext({
      userAgent: getRandomUserAgent(),
      viewport: { width: 1366, height: 768 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });

    // 设置Cookie（微信搜索使用）
    if (wechatCookies.length > 0 && url.includes('sogou')) {
      await context.addCookies(wechatCookies);
    }

    const page = await context.newPage();

    // 拦截不必要的资源
    await page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2,ttf,otf,eot}', route => route.abort());

    console.log(`[Worker ${jobId}] Playwright navigating to: ${url}`);

    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: timeout,
    });

    // 等待页面稳定
    await page.waitForTimeout(3000);

    // 检查是否需要验证码
    const pageContent = await page.content();
    if (pageContent.includes('验证码') || pageContent.includes('captcha') || pageContent.includes('请输入')) {
      console.log(`[Worker ${jobId}] Captcha detected on ${url}, waiting for manual solve...`);
      // 等待更长时间，让验证码有机会自动通过或手动处理
      await page.waitForTimeout(10000);
    }

    // 如果指定了选择器，等待其出现
    if (options.waitForSelector) {
      try {
        await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
      } catch {
        console.log(`[Worker ${jobId}] Selector ${options.waitForSelector} not found, continuing...`);
      }
    }

    const html = await page.content();
    const title = await page.title();
    const finalUrl = page.url();

    // 保存Cookie供下次使用
    if (url.includes('sogou')) {
      wechatCookies = await context.cookies();
    }

    requestCount++;
    return { html, title, finalUrl };
  } catch (error) {
    console.error(`[Worker ${jobId}] Playwright error for ${url}:`, (error as Error).message);
    return null;
  } finally {
    await browser.close();
  }
}

/**
 * 执行 HTTP 请求（带重试）
 */
async function fetchWithRetry(
  url: string,
  usePlaywright: boolean = false,
  timeout?: number
): Promise<{ html: string; title: string } | null> {
  let lastError: Error | null = null;

  for (let retry = 0; retry <= strategy.maxRetries; retry++) {
    if (!checkRequestLimit()) {
      throw new Error('Daily request limit reached');
    }

    try {
      if (retry > 0) {
        await exponentialBackoffDelay(retry);
      } else {
        await randomDelay();
      }

      if (usePlaywright) {
        const result = await fetchWithPlaywright(url, { timeout });
        if (result) {
          return { html: result.html, title: result.title };
        }
        return null;
      } else {
        const response = await axios.get(url, {
          timeout: timeout || strategy.timeout,
          headers: {
            'User-Agent': getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
          },
          maxRedirects: 5,
        });

        requestCount++;
        const $ = cheerio.load(response.data);
        const title = $('title').text().trim() || $('h1').first().text().trim() || '';
        return { html: response.data, title };
      }
    } catch (error) {
      lastError = error as Error;
      reportError(url, `Attempt ${retry + 1} failed: ${lastError.message}`, retry);
      if (retry >= strategy.maxRetries) break;
    }
  }

  return null;
}

/**
 * 智能提取页面标题（优先文章标题）
 */
function extractSmartTitle(html: string, url: string, fallbackTitle: string): string {
  const $ = cheerio.load(html);

  // 按优先级尝试提取标题
  const titleSelectors = [
    'article h1',           // 文章页标题
    '.article-title',       // 文章标题类
    '.news-title',          // 新闻标题
    'h1.main-title',        // 主标题
    '.content h1',          // 内容区标题
    '#content h1',          // 内容区标题
    'h1.entry-title',       // 博客/文章标题
    '.post-title',          // 文章标题
    'h1',                   // 第一个 h1
    'h2',                   // 第一个 h2
  ];

  for (const selector of titleSelectors) {
    const text = $(selector).first().text().trim();
    if (text && text.length > 5 && text.length < 100) {
      // 过滤掉包含医院名称的通用标题
      if (!text.includes('首页') && !text.includes('医院') && text !== fallbackTitle) {
        return text;
      }
    }
  }

  // 如果 fallback 是通用标题，尝试从 URL 路径提取
  if (fallbackTitle === '北京协和医院' || fallbackTitle.includes('首页')) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];
        // 移除文件扩展名和数字ID
        const cleanPart = lastPart.replace(/\.html?$/, '').replace(/-\d+$/, '').replace(/_/g, ' ');
        if (cleanPart.length > 3 && cleanPart.length < 50) {
          return cleanPart;
        }
      }
    } catch {
      // ignore
    }
  }

  return fallbackTitle;
}

/**
 * 提取主要内容（增强版）
 */
function extractMainContent(html: string, url?: string): string {
  const $ = cheerio.load(html);

  // 移除脚本和样式
  $('script, style, nav, footer, header, aside, .ads, .advertisement, iframe').remove();

  // 尝试找到主要内容
  const selectors = [
    'article',
    'main',
    '[role="main"]',
    '.content-detail',
    '.article-content',
    '.post-content',
    '.news-content',
    '#content',
    '#main-content',
    '.detail',
    '.text',
  ];

  for (const selector of selectors) {
    const element = $(selector).first();
    const text = element.text().trim();
    if (text.length > 100) {
      return text;
    }
  }

  // 默认返回 body 文本（清理后，保留全文）
  return $('body').text().trim().replace(/\s+/g, ' ');
}

/**
 * 解析搜狗微信跳转链接获取真实URL
 */
async function resolveSogouLink(sogouUrl: string): Promise<string | null> {
  try {
    // 搜狗链接格式：https://weixin.sogou.com/link?url=xxx
    const result = await fetchWithPlaywright(sogouUrl, { timeout: 30000 });
    if (result) {
      // 最终URL应该是微信公众号文章链接
      if (result.finalUrl.includes('mp.weixin.qq.com')) {
        return result.finalUrl;
      }
      // 解析HTML中的跳转链接
      const $ = cheerio.load(result.html);
      const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
      if (metaRefresh) {
        const match = metaRefresh.match(/url=(.+)/);
        if (match) return match[1];
      }
    }
    return sogouUrl;
  } catch {
    return sogouUrl;
  }
}

import { CollectionTargetType } from '../../types/knowledge-collection.types';

/**
 * 构建多维度搜索查询
 * 优先使用 LLM 生成的 customQueries
 */
function buildSearchQueries(): string[] {
  if (config.customQueries && config.customQueries.length > 0) {
    console.log(`[Worker ${jobId}] Using LLM-generated custom queries: ${config.customQueries.length}`);
    return config.customQueries;
  }

  const { hospitalName, targetType, targetName } = config;
  const queries: string[] = [];

  switch (targetType) {
    case CollectionTargetType.DOCTOR:
      queries.push(`${hospitalName} ${targetName} 医生`);
      queries.push(`${hospitalName} ${targetName} 专家介绍`);
      queries.push(`${hospitalName} ${targetName} 出诊`);
      queries.push(`${hospitalName} ${targetName} 论文`);
      break;

    case CollectionTargetType.DEPARTMENT:
      queries.push(`${hospitalName} ${targetName} 科室`);
      queries.push(`${hospitalName} ${targetName} 专家`);
      queries.push(`${hospitalName} ${targetName} 技术`);
      break;

    default:
      queries.push(`${hospitalName}`);
      queries.push(`${hospitalName} 新闻`);
      queries.push(`${hospitalName} 科室`);
      queries.push(`${hospitalName} 专家介绍`);
      queries.push(`${hospitalName} 医疗技术`);
      queries.push(`${hospitalName} 科研成果`);
      queries.push(`${hospitalName} 招聘公告`);
      queries.push(`${hospitalName} 荣誉`);
      break;
  }

  return queries;
}

/**
 * 获取目标描述
 */
function getTargetDescription(): string {
  const { hospitalName, targetType, targetName } = config;
  switch (targetType) {
    case CollectionTargetType.DOCTOR:
      return `${hospitalName} - ${targetName}（医生）`;
    case CollectionTargetType.DEPARTMENT:
      return `${hospitalName} - ${targetName}（科室）`;
    default:
      return hospitalName;
  }
}

/**
 * 获取关联的医生列表
 */
function getRelatedDoctors(): string[] | undefined {
  const { targetType, targetName, doctors } = config;
  if (targetType === CollectionTargetType.DOCTOR && targetName) {
    return [targetName];
  }
  return doctors;
}

/**
 * 获取关联的科室列表
 */
function getRelatedDepartments(): string[] | undefined {
  const { targetType, targetName, departments } = config;
  if (targetType === CollectionTargetType.DEPARTMENT && targetName) {
    return [targetName];
  }
  return departments;
}

/**
 * 医院官网配置（增强版）
 */
const hospitalConfigMap: Record<string, {
  baseUrl: string;
  startUrls: string[];
  linkSelectors: string[];
  contentSelectors: string[];
  maxLinksPerPage: number;
  sitemapUrl?: string;
}> = {
  '北京协和医院': {
    baseUrl: 'https://www.pumch.cn',
    startUrls: [
      'https://www.pumch.cn',
      'https://www.pumch.cn/news.html',
      'https://www.pumch.cn/department.html',
      'https://www.pumch.cn/doctor.html',
      'https://www.pumch.cn/research.html',
      'https://www.pumch.cn/notice.html',
      'https://www.pumch.cn/medical.html',
    ],
    linkSelectors: [
      'a[href*="/news/"]',
      'a[href*="/department/"]',
      'a[href*="/doctor/"]',
      'a[href*="/research/"]',
      'a[href*="/notice/"]',
      'a[href*="/medical/"]',
      'a[href*="/article/"]',
    ],
    contentSelectors: ['.news-content', '.dept-detail', '.doctor-detail', '.article-content'],
    maxLinksPerPage: 30,
  },
};

/**
 * 规范化URL（去除锚点等）
 */
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    urlObj.hash = ''; // 去除锚点
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * 采集医院官网（增强版）
 */
async function collectHospitalOfficial(hospitalName: string, depth: number = 3, agentId?: string): Promise<void> {
  sourceStartTime = Date.now();
  const items: RawSourceMetadata[] = [];

  const hospitalConfig = hospitalConfigMap[hospitalName];
  if (!hospitalConfig) {
    reportError(hospitalName, 'Hospital config not found', 0);
    reportSourceComplete('hospital_official' as CollectionSourceType, []);
    return;
  }

  const { baseUrl, startUrls, linkSelectors, maxLinksPerPage } = hospitalConfig;
  const doctors = getRelatedDoctors();
  const departments = getRelatedDepartments();

  // BFS队列
  const urlQueue: Array<{ url: string; depth: number }> =
    startUrls.map(url => ({ url, depth: 1 }));
  const crawledUrls = new Set<string>();
  const discoveredUrls = new Set<string>();

  console.log(`[Worker ${jobId}] Hospital: ${hospitalName}, URLs: ${startUrls.length}, depth: ${depth}`);

  let reportCounter = 0;

  while (urlQueue.length > 0 && progress.completed < (config.maxResults || 100)) {
    const { url, depth: currentDepth } = urlQueue.shift()!;
    const normalizedUrl = normalizeUrl(url);

    if (crawledUrls.has(normalizedUrl)) continue;
    if (currentDepth > depth) continue;

    if (agentId && reportCounter++ % 5 === 0) {
      reportAgentProgress(agentId, 'hospital_official' as CollectionSourceType, {
        completed: progress.completed,
        failed: progress.failed,
        duplicates: progress.duplicates,
        currentQuery: `${crawledUrls.size}/${urlQueue.length + crawledUrls.size} URLs`,
      });
    }

    console.log(`[Worker ${jobId}] Crawling [${currentDepth}/${depth}]: ${url}`);

    const result = await fetchWithRetry(url, true, 45000);
    if (!result) {
      progress.failed++;
      continue;
    }

    crawledUrls.add(normalizedUrl);

    // 智能提取标题（优先文章标题而非页面标题）
    const smartTitle = extractSmartTitle(result.html, url, result.title);

    // 检查重复（使用智能标题）
    const dupCheck = rawSourceManager.checkDuplicate(normalizedUrl, smartTitle);
    if (dupCheck.isDuplicate) {
      progress.duplicates++;
      console.log(`[Worker ${jobId}] Duplicate skipped: ${smartTitle}`);
    } else {
      const content = extractMainContent(result.html, url);

      // 过滤掉内容太短的页面
      if (content.length < 50) {
        console.log(`[Worker ${jobId}] Content too short, skipped: ${url}`);
      } else {
        const metadata = rawSourceManager.saveRawSource({
          sourceType: 'hospital_official' as CollectionSourceType,
          url: normalizedUrl,
          title: smartTitle,
          content,
          hospitalName,
          departments,
          doctors,
          collectedAt: new Date().toISOString(),
          jobId,
        });

        if (metadata) {
          progress.completed++;
          items.push(metadata);
          reportResult(metadata);
          console.log(`[Worker ${jobId}] Saved: ${smartTitle.substring(0, 50)}... (${normalizedUrl})`);
        }
      }
      reportProgress();
    }

    // 发现新链接
    if (currentDepth < depth) {
      const $ = cheerio.load(result.html);
      const newLinks: string[] = [];

      for (const selector of linkSelectors) {
        $(selector).each((_, el) => {
          const href = $(el).attr('href');
          if (href) {
            try {
              const absoluteUrl = new URL(href, baseUrl).toString();
              const normalized = normalizeUrl(absoluteUrl);
              
              // 过滤条件
              if (absoluteUrl.startsWith(baseUrl) &&
                  !crawledUrls.has(normalized) &&
                  !discoveredUrls.has(normalized) &&
                  !urlQueue.some(item => normalizeUrl(item.url) === normalized) &&
                  !normalized.match(/\.(pdf|doc|docx|xls|xlsx|zip|rar|jpg|png|gif)$/i)) {
                newLinks.push(absoluteUrl);
                discoveredUrls.add(normalized);
              }
            } catch {
              // ignore
            }
          }
        });
      }

      const linksToAdd = newLinks.slice(0, maxLinksPerPage);
      for (const link of linksToAdd) {
        urlQueue.push({ url: link, depth: currentDepth + 1 });
      }

      console.log(`[Worker ${jobId}] Discovered ${newLinks.length} links, added ${linksToAdd.length}`);
    }

    await randomDelay(2000, 5000);
  }

  console.log(`[Worker ${jobId}] Hospital completed: ${items.length} items, crawled ${crawledUrls.size} URLs`);
  reportSourceComplete('hospital_official' as CollectionSourceType, items);
}

/**
 * 百度搜索（分页）
 */
async function collectBaiduSearch(days: number, agentId?: string): Promise<void> {
  sourceStartTime = Date.now();
  const items: RawSourceMetadata[] = [];

  const queries = buildSearchQueries();
  const maxResults = config.maxResults || 100;
  const maxPagesPerQuery = 10; // 翻10页，约100条结果

  console.log(`[Worker ${jobId}] Baidu: ${queries.length} queries, max: ${maxResults}`);

  for (const query of queries) {
    if (progress.completed >= maxResults) break;

    if (agentId) {
      reportAgentProgress(agentId, 'baidu_search' as CollectionSourceType, {
        completed: progress.completed,
        failed: progress.failed,
        duplicates: progress.duplicates,
        currentQuery: query,
      });
    }

    for (let page = 0; page < maxPagesPerQuery; page++) {
      if (progress.completed >= maxResults) break;

      const start = page * 10;
      const encodedQuery = encodeURIComponent(query);
      const searchUrl = page === 0
        ? `https://www.baidu.com/s?wd=${encodedQuery}&tn=news&rtt=4&bsst=1&cl=2`
        : `https://www.baidu.com/s?wd=${encodedQuery}&pn=${start}&tn=news&rtt=4&bsst=1&cl=2`;

      console.log(`[Worker ${jobId}] Baidu [${query}] page ${page + 1}`);

      const result = await fetchWithRetry(searchUrl, true, 45000);
      if (!result) {
        progress.failed++;
        continue;
      }

      const $ = cheerio.load(result.html);
      const newsItems: Array<{ title: string; url: string }> = [];

      $('.result, [tpl], .c-container').each((_, el) => {
        const titleEl = $(el).find('h3 a, .t a');
        const title = titleEl.text().trim();
        const url = titleEl.attr('href') || '';
        if (title && url) {
          newsItems.push({ title, url });
        }
      });

      console.log(`[Worker ${jobId}] Baidu page ${page + 1}: ${newsItems.length} items`);

      if (newsItems.length === 0) break;

      for (const item of newsItems) {
        if (progress.completed >= maxResults) break;

        const dupCheck = rawSourceManager.checkDuplicate(item.url, item.title);
        if (dupCheck.isDuplicate) {
          progress.duplicates++;
          continue;
        }

        const detailResult = await fetchWithRetry(item.url, false, 30000);
        if (!detailResult) {
          progress.failed++;
          continue;
        }

        const content = extractMainContent(detailResult.html, item.url);
        
        const metadata = rawSourceManager.saveRawSource({
          sourceType: 'baidu_search' as CollectionSourceType,
          url: item.url,
          title: item.title,
          content,
          hospitalName: config.hospitalName,
          departments: getRelatedDepartments(),
          doctors: getRelatedDoctors(),
          jobId,
        });

        if (metadata) {
          progress.completed++;
          items.push(metadata);
          reportResult(metadata);
        }

        reportProgress();
        await randomDelay(2000, 4000);
      }

      await randomDelay(3000, 6000);
    }

    await randomDelay(5000, 8000);
  }

  console.log(`[Worker ${jobId}] Baidu completed: ${items.length} items`);
  reportSourceComplete('baidu_search' as CollectionSourceType, items);
}

/**
 * 微信专用浏览器配置（更强反检测）
 */
async function createStealthBrowser() {
  return chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
  });
}

/**
 * 微信专用页面获取（增强反爬版）
 */
async function fetchWechatPage(
  url: string,
  options: { timeout?: number; isArticle?: boolean } = {}
): Promise<{ html: string; title: string; finalUrl: string } | null> {
  const timeout = options.timeout || 90000;
  const browser = await createStealthBrowser();

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
      viewport: { width: 1920, height: 1080 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      permissions: ['geolocation'],
      geolocation: { latitude: 39.9042, longitude: 116.4074 }, // 北京位置
    });

    // 设置Cookie
    if (wechatCookies.length > 0) {
      await context.addCookies(wechatCookies);
    }

    const page = await context.newPage();

    // 执行脚本隐藏自动化痕迹
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
      (window as any).chrome = { runtime: {} };
    });

    // 拦截图片/CSS/字体，只保留JS和HTML
    await page.route('**/*.{png,jpg,jpeg,gif,svg,ico,css,woff,woff2,ttf,otf,eot,mp4,mp3}', route => route.abort());

    console.log(`[Worker ${jobId}] [WeChat] Navigating: ${url.substring(0, 80)}...`);

    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: timeout,
    });

    // 等待页面加载
    await page.waitForTimeout(options.isArticle ? 5000 : 3000);

    // 模拟人类行为：随机滚动
    if (!options.isArticle) {
      await page.evaluate(() => {
        window.scrollBy(0, Math.random() * 300 + 100);
      });
      await page.waitForTimeout(1000);
    }

    // 检查验证码
    const content = await page.content();
    if (content.includes('验证码') || content.includes('captcha') || content.includes('请输入验证码')) {
      console.log(`[Worker ${jobId}] [WeChat] Captcha detected, trying to wait...`);
      // 对于搜狗，验证码通常会自动过期或可以通过刷新绕过
      await page.waitForTimeout(15000);
    }

    // 检查是否被封
    if (content.includes('访问过于频繁') || content.includes('您的访问过于频繁')) {
      console.log(`[Worker ${jobId}] [WeChat] Rate limited!`);
      return null;
    }

    const html = await page.content();
    const title = await page.title();
    const finalUrl = page.url();

    // 保存Cookie
    wechatCookies = await context.cookies();

    requestCount++;
    return { html, title, finalUrl };
  } catch (error) {
    console.error(`[Worker ${jobId}] [WeChat] Error:`, (error as Error).message);
    return null;
  } finally {
    await browser.close();
  }
}

/**
 * 解析搜狗链接（增强版）
 */
async function resolveSogouLinkEnhanced(sogouUrl: string): Promise<string | null> {
  try {
    const result = await fetchWechatPage(sogouUrl, { timeout: 45000 });
    if (!result) return null;

    // 如果已经跳转到微信域名
    if (result.finalUrl.includes('mp.weixin.qq.com')) {
      return result.finalUrl;
    }

    // 解析页面中的跳转链接
    const $ = cheerio.load(result.html);

    // 搜狗防爬页面会包含加密链接，需要解析JS
    const scripts = $('script').map((_, el) => $(el).html()).get().join('\n');

    // 尝试从meta refresh提取
    const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
    if (metaRefresh) {
      const match = metaRefresh.match(/url=['"]?([^'"]+)/i);
      if (match) return match[1];
    }

    // 尝试从链接中提取
    const link = $('a[href*="mp.weixin.qq.com"]').first().attr('href');
    if (link) return link;

    // 如果页面内容包含微信文章特征，返回原始URL继续处理
    if (result.html.includes('rich_media') || result.html.includes('js_content')) {
      return sogouUrl;
    }

    return null;
  } catch (error) {
    console.error(`[Worker ${jobId}] [WeChat] Resolve error:`, error);
    return null;
  }
}

/**
 * 搜狗微信搜索（增强反爬版）
 */
async function collectWechatSearch(days: number, agentId?: string): Promise<void> {
  sourceStartTime = Date.now();
  const items: RawSourceMetadata[] = [];

  // 扩展关键词覆盖，支持更大批量采集
  const baseQueries = buildSearchQueries();
  const queries = baseQueries.slice(0, 10); // 最多10个关键词
  const maxResults = Math.min(config.maxResults || 100, 100); // 提升总数上限
  const maxPagesPerQuery = 5; // 每关键词采5页

  console.log(`[Worker ${jobId}] [WeChat] Starting: ${queries.length} queries, max ${maxResults} items`);

  // 预检：先访问搜狗首页建立会话
  console.log(`[Worker ${jobId}] [WeChat] Pre-flight: visiting sogou.com...`);
  await fetchWechatPage('https://weixin.sogou.com', { timeout: 30000 });
  await randomDelay(3000, 5000);

  for (const query of queries) {
    if (progress.completed >= maxResults) break;

    if (agentId) {
      reportAgentProgress(agentId, 'wechat_search' as CollectionSourceType, {
        completed: progress.completed,
        failed: progress.failed,
        duplicates: progress.duplicates,
        currentQuery: query,
      });
    }

    console.log(`[Worker ${jobId}] [WeChat] Searching: ${query}`);

    for (let page = 1; page <= maxPagesPerQuery; page++) {
      if (progress.completed >= maxResults) break;

      const encodedQuery = encodeURIComponent(query);
      const searchUrl = `https://weixin.sogou.com/weixin?type=2&query=${encodedQuery}&page=${page}`;

      console.log(`[Worker ${jobId}] [WeChat] Page ${page}: ${searchUrl.substring(0, 60)}...`);

      // 使用增强版微信专用请求
      const result = await fetchWechatPage(searchUrl, { timeout: 60000 });

      if (!result) {
        console.log(`[Worker ${jobId}] [WeChat] Search failed for page ${page}`);
        progress.failed++;
        await randomDelay(10000, 15000);
        continue;
      }

      const $ = cheerio.load(result.html);
      const newsItems: Array<{ title: string; url: string; summary: string; account: string }> = [];

      // 搜狗微信搜索结果解析
      $('.news-list li, .txt-box').each((_, el) => {
        const titleEl = $(el).find('h3 a, .tit a');
        const summaryEl = $(el).find('p, .txt-info');
        const accountEl = $(el).find('.account, .s-p a');

        let title = titleEl.text().trim();
        let url = titleEl.attr('href') || '';
        const summary = summaryEl.text().trim();
        const account = accountEl.text().trim();

        // 处理搜狗跳转链接
        if (url && url.startsWith('/link?')) {
          url = `https://weixin.sogou.com${url}`;
        }

        if (title && url && url.includes('sogou')) {
          newsItems.push({ title, url, summary, account });
        }
      });

      console.log(`[Worker ${jobId}] [WeChat] Page ${page}: found ${newsItems.length} items`);

      if (newsItems.length === 0) {
        // 检查是否被封
        if (result.html.includes('验证') || result.html.includes('captcha') || result.html.includes('过于频繁')) {
          console.log(`[Worker ${jobId}] [WeChat] Blocked by anti-bot, stopping...`);
          reportSourceComplete('wechat_search' as CollectionSourceType, items);
          return;
        }
        continue;
      }

      // 处理每个结果（保留全部解析结果以提升采集量）
      for (const item of newsItems) {
        if (progress.completed >= maxResults) break;

        console.log(`[Worker ${jobId}] [WeChat] Processing: ${item.title.substring(0, 40)}...`);

        // 使用增强版解析搜狗链接
        const realUrl = await resolveSogouLinkEnhanced(item.url);
        if (!realUrl) {
          console.log(`[Worker ${jobId}] [WeChat] Failed to resolve URL`);
          continue;
        }

        const dupCheck = rawSourceManager.checkDuplicate(realUrl, item.title);
        if (dupCheck.isDuplicate) {
          progress.duplicates++;
          console.log(`[Worker ${jobId}] [WeChat] Duplicate skipped`);
          continue;
        }

        // 获取微信文章内容
        const detailResult = await fetchWechatPage(realUrl, { timeout: 45000, isArticle: true });
        if (!detailResult) {
          progress.failed++;
          continue;
        }

        // 微信文章特定选择器
        const $article = cheerio.load(detailResult.html);
        let content = '';
        
        // 尝试多个微信内容选择器
        const wxSelectors = ['#js_content', '.rich_media_content', 'article', '.content'];
        for (const selector of wxSelectors) {
          const el = $article(selector).first();
          if (el.length && el.text().trim().length > 50) {
            content = el.text().trim();
            break;
          }
        }
        
        if (!content) {
          content = extractMainContent(detailResult.html, realUrl);
        }

        const metadata = rawSourceManager.saveRawSource({
          sourceType: 'wechat_search' as CollectionSourceType,
          url: realUrl,
          title: item.title,
          content: `[公众号: ${item.account}]\n${item.summary}\n\n${content}`,
          hospitalName: config.hospitalName,
          departments: getRelatedDepartments(),
          doctors: getRelatedDoctors(),
          jobId,
        });

        if (metadata) {
          progress.completed++;
          items.push(metadata);
          reportResult(metadata);
          console.log(`[Worker ${jobId}] [WeChat] Saved: ${item.title.substring(0, 40)}...`);
        }

        reportProgress();

        // 文章间延迟（适中）
        await randomDelay(5000, 8000);
      }

      // 翻页延迟
      await randomDelay(5000, 10000);
    }

    // 关键词间延迟
    await randomDelay(8000, 12000);
  }

  console.log(`[Worker ${jobId}] [WeChat] Completed: ${items.length} items`);
  reportSourceComplete('wechat_search' as CollectionSourceType, items);
}

/**
 * 带超时的函数包装器
 */
async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  sourceType: string
): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.log(`[Worker ${jobId}] ${sourceType} timed out after ${timeoutMs}ms`);
      resolve(null);
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        console.error(`[Worker ${jobId}] ${sourceType} error:`, error);
        resolve(null);
      });
  });
}

/**
 * 执行单个数据源采集（Agent 模式）
 */
async function collectSource(sourceType: string, agentIndex: number): Promise<void> {
  const { hospitalName, targetType, days, maxResults } = config;
  const agentId = `${sourceType}_${agentIndex}_${Date.now()}`;
  const queries = buildSearchQueries();

  console.log(`[Worker ${jobId}] Agent ${agentId} starting: ${sourceType}`);
  reportAgentStarted(agentId, sourceType as CollectionSourceType, {
    queryCount: queries.length,
    maxResults: maxResults || 100,
  });

  const agentStartTime = Date.now();

  switch (sourceType) {
    case 'hospital_official':
      if (!targetType || targetType === CollectionTargetType.HOSPITAL) {
        await collectHospitalOfficial(hospitalName, config.depth || 3, agentId);
      }
      break;

    case 'baidu_search':
      await collectBaiduSearch(days || 7, agentId);
      break;

    case 'wechat_search':
      await collectWechatSearch(days || 7, agentId);
      break;

    case 'gov_official':
    case 'news_media':
      console.log(`[Worker ${jobId}] Agent ${agentId} skipped`);
      break;
  }

  const duration = Date.now() - agentStartTime;
  const itemCount = sourceResults.get(sourceType)?.length || 0;
  reportAgentComplete(agentId, sourceType as CollectionSourceType, { itemCount, duration });
  console.log(`[Worker ${jobId}] Agent ${agentId} completed in ${duration}ms`);
}

/**
 * 带并发控制的并行执行器
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<Array<PromiseSettledResult<T>>> {
  const results: Array<PromiseSettledResult<T>> = [];
  const executing: Promise<void>[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const taskIndex = i;
    const p = tasks[taskIndex]().then(
      value => { results[taskIndex] = { status: 'fulfilled', value }; },
      reason => { results[taskIndex] = { status: 'rejected', reason }; }
    );

    executing.push(p);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // 清理已完成的 promise
      for (let j = executing.length - 1; j >= 0; j--) {
        const ep = executing[j];
        // 利用 then 的立即性来检测是否完成
        const isSettled = await Promise.race([
          ep.then(() => true, () => true),
          Promise.resolve(false),
        ]);
        if (isSettled) {
          executing.splice(j, 1);
        }
      }
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * 主采集逻辑（Subagent 并行版）
 */
async function runCollection(): Promise<void> {
  const { hospitalName, targetType, sourceTypes, isBootstrap, days } = config;

  console.log(`[Worker ${jobId}] Starting agent mode: ${hospitalName}, types: ${sourceTypes?.join(', ')}`);

  try {
    if (sourceTypes && sourceTypes.length > 0) {
      // 按优先级排序
      const sortedSources = [...sourceTypes].sort((a, b) => {
        const configA = SOURCE_CONFIG[a] || { priority: 99 };
        const configB = SOURCE_CONFIG[b] || { priority: 99 };
        return configA.priority - configB.priority;
      });

      console.log(`[Worker ${jobId}] Agent execution order: ${sortedSources.join(' -> ')}`);

      // 构建 agent 任务列表（每个 source 一个 agent）
      const agentTasks = sortedSources.map((sourceType, index) => {
        return async () => {
          if (isCompleted || progress.completed >= (config.maxResults || 100)) {
            console.log(`[Worker ${jobId}] [${sourceType}] Skipped: job already completed`);
            return;
          }

          const sourceConfig = SOURCE_CONFIG[sourceType];
          const timeout = sourceConfig?.timeout || 5 * 60 * 1000;

          console.log(`[Worker ${jobId}] [${sourceType}] Agent starting with ${timeout}ms timeout`);
          const startTime = Date.now();

          await withTimeout(
            () => collectSource(sourceType, index),
            timeout,
            sourceType
          );

          const elapsed = Date.now() - startTime;
          console.log(`[Worker ${jobId}] [${sourceType}] Agent finished in ${elapsed}ms`);
        };
      });

      // 并行执行 agents，控制并发数（默认2，可通过策略覆盖）
      const concurrency = config.strategyOverrides?.maxConcurrency || strategy.maxConcurrency || 2;
      await runWithConcurrency(agentTasks, concurrency);
    }

    reportComplete();
    console.log(`[Worker ${jobId}] Completed: ${progress.completed} items`);

  } catch (error) {
    console.error(`[Worker ${jobId}] Error:`, error);
    if (!isCompleted) {
      parentPort?.postMessage({
        type: 'error',
        data: { source: 'worker', message: (error as Error).message, retryCount: 0, timestamp: new Date().toISOString() },
      });
    }
    process.exit(1);
  }
}

// 启动
runCollection();
