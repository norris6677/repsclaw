import { chromium, Browser, Page } from 'playwright';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import {
  NewsSourceClient,
  NewsSourceType,
  NewsSearchParams,
  HospitalNewsItem,
} from '../../types/hospital-news.types';
import type { ISubscriptionDatabase } from '../subscription-db.interface';
import { createLogger } from '../../utils/plugin-logger';
import {
  WECHAT_RATE_LIMIT_FILE,
  SOGOU_COOKIE_FILE,
  CONTENT_CACHE_DIR,
  ensureDataDirectories,
} from '../../config/data-paths.config';

// 用于提取微信公众号文章正文的HTTP请求
interface WechatArticleContent {
  content: string;
  fetchedAt: string;
  success: boolean;
  error?: string;
}

const logger = createLogger('REPSCLAW:WECHAT-SEARCH');

// HTTP请求超时设置（用于内容提取）
const REQUEST_TIMEOUT = 15000;

/**
 * 搜狗微信搜索客户端
 * 数据来源：搜狗微信搜索（微信公众号文章）
 * 优先级：5（最低，因为验证码出现频繁）
 * 特点：
 * - 抓取微信公众号文章
 * - 严格的频率限制（每小时最多尝试1次）
 * - 最多返回3条结果
 * - 遇到验证码立即放弃
 * - 支持提取微信公众号文章正文内容
 */
export class WechatSearchClient extends NewsSourceClient {
  sourceType = NewsSourceType.WECHAT_SEARCH;
  priority = 5;

  private db: ISubscriptionDatabase;
  private readonly CACHE_TTL = 6 * 60 * 60 * 1000; // 6小时
  private readonly CONTENT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时内容缓存
  private readonly RATE_LIMIT_INTERVAL = 60 * 60 * 1000; // 1小时
  private rateLimitFile: string = WECHAT_RATE_LIMIT_FILE;

  constructor(db: ISubscriptionDatabase) {
    super();
    this.db = db;

    // 确保数据目录存在
    ensureDataDirectories();

    logger.info('[WechatSearch] Initialized with data directory', { rateLimitFile: this.rateLimitFile });
  }

  // Cookie 配置（可动态更新）
  private sogouCookie: string | null = null;
  private cookieLastUpdated: number = 0;
  private readonly COOKIE_REFRESH_INTERVAL = 30 * 60 * 1000; // 30分钟刷新一次

  // 增强反爬：Playwright Cookie 对象缓存（维持搜狗会话）
  private wechatCookies: { name: string; value: string; domain: string }[] = [];
  private preflightDone: boolean = false;

  /**
   * 获取有效的搜狗 Cookie
   * 支持多种更新方式（按优先级）：
   * 1. 环境变量 SOGOU_COOKIE
   * 2. Cookie 文件 (~/.openclaw/repsclaw/sogou-cookie.txt)
   * 3. 自动通过 Playwright 获取（备用方案）
   */
  private async getSogouCookie(): Promise<string | null> {
    // 检查缓存的 Cookie 是否仍有效
    if (this.sogouCookie && Date.now() - this.cookieLastUpdated < this.COOKIE_REFRESH_INTERVAL) {
      return this.sogouCookie;
    }

    // 1. 尝试从环境变量获取
    const envCookie = process.env.SOGOU_COOKIE;
    if (envCookie) {
      logger.debug('[WechatSearch] 从环境变量获取 Cookie');
      this.sogouCookie = envCookie;
      this.cookieLastUpdated = Date.now();
      return this.sogouCookie;
    }

    // 2. 尝试从文件读取
    const cookieFile = SOGOU_COOKIE_FILE;
    try {
      if (fs.existsSync(cookieFile)) {
        const fileCookie = fs.readFileSync(cookieFile, 'utf-8').trim();
        if (fileCookie) {
          logger.debug('[WechatSearch] 从文件获取 Cookie');
          this.sogouCookie = fileCookie;
          this.cookieLastUpdated = Date.now();
          return this.sogouCookie;
        }
      }
    } catch (error) {
      logger.warn('[WechatSearch] 读取 Cookie 文件失败', error);
    }

    // 3. 使用默认 Cookie（可能已过期，仅作后备）
    logger.warn('[WechatSearch] 未配置 SOGOU_COOKIE，使用默认 Cookie（可能已过期）');
    logger.warn('[WechatSearch] 请通过以下方式之一配置 Cookie：');
    logger.warn('  1. 设置环境变量 SOGOU_COOKIE');
    logger.warn('  2. 创建文件 ~/.openclaw/repsclaw/sogou-cookie.txt');
    logger.warn('  3. 使用自动获取模式（调用 refreshCookieViaPlaywright）');

    // 返回默认 Cookie（从Python项目复制）
    return 'ABTEST=7|1750756616|v1; SUID=0A5BF4788E52A20B00000000685A6D08; IPLOC=CN1100; SUID=605BF4783954A20B00000000685A6D08; SUV=006817F578F45BFE685A6D0B913DA642; SNUID=B3E34CC0B8BF80F5737E3561B9B78454; ariaDefaultTheme=undefined';
  }

  /**
   * 通过 Playwright 访问搜狗页面自动获取 Cookie
   * 这是最可靠的 Cookie 获取方式，但需要浏览器支持
   */
  async refreshCookieViaPlaywright(): Promise<string | null> {
    logger.info('[WechatSearch] 尝试通过 Playwright 自动获取 Cookie');

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'zh-CN',
      });

      const page = await context.newPage();

      // 访问搜狗微信搜索首页
      await page.goto('https://weixin.sogou.com/', { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);

      // 获取所有 Cookie
      const cookies = await context.cookies();
      const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      if (cookieString && cookieString.includes('SNUID')) {
        // SNUID 是搜狗的关键 Cookie
        logger.info('[WechatSearch] 成功通过 Playwright 获取 Cookie');
        this.sogouCookie = cookieString;
        this.cookieLastUpdated = Date.now();

        // 保存到文件供后续使用
        this.saveCookieToFile(cookieString);

        return cookieString;
      }

      logger.warn('[WechatSearch] 通过 Playwright 获取的 Cookie 不完整');
      return null;
    } catch (error) {
      logger.error('[WechatSearch] Playwright 获取 Cookie 失败', error);
      return null;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * 手动设置 Cookie
   */
  setCookie(cookie: string): void {
    this.sogouCookie = cookie;
    this.cookieLastUpdated = Date.now();
    this.saveCookieToFile(cookie);
    logger.info('[WechatSearch] Cookie 已手动更新');
  }

  /**
   * 保存 Cookie 到文件
   */
  private saveCookieToFile(cookie: string): void {
    try {
      fs.writeFileSync(SOGOU_COOKIE_FILE, cookie);
      logger.debug('[WechatSearch] Cookie 已保存到文件', { path: SOGOU_COOKIE_FILE });
    } catch (error) {
      logger.warn('[WechatSearch] 保存 Cookie 到文件失败', error);
    }
  }

  async search(params: NewsSearchParams): Promise<HospitalNewsItem[]> {
    const { hospitalName, aliases, days, maxResults, keywords, departments, doctors, includeContent = false } = params;
    const allNames = [hospitalName, ...aliases];

    // 构建科室后缀（如果有订阅科室）
    const deptSuffix = departments && departments.length > 0
      ? ` ${departments.join(' ')}`
      : '';

    // 构建医生后缀（如果有订阅医生）
    const doctorSuffix = doctors && doctors.length > 0
      ? ` ${doctors.join(' ')}`
      : '';

    // 构建缓存key（包含科室和医生信息）
    const suffixCombined = `${deptSuffix}${doctorSuffix}`;
    const cacheKey = keywords
      ? `${keywords}${suffixCombined}`
      : suffixCombined || 'default';

    // 1. 检查频率限制
    if (this.isRateLimited()) {
      logger.info('[WechatSearch] 搜狗微信搜索频率限制中，跳过');
      // 尝试使用缓存
      const cached = this.getCachedResults(hospitalName, cacheKey);
      if (cached) {
        let results = this.filterByDate(cached, days).slice(0, Math.min(maxResults || 3, 3));
        // 如果缓存中有内容但请求要求包含内容，检查是否需要补充
        if (includeContent) {
          results = await this.supplementContent(results);
        }
        return results;
      }
      return [];
    }

    // 2. 检查缓存
    const cached = this.getCachedResults(hospitalName, cacheKey);
    if (cached && cached.length > 0) {
      logger.info(`[WechatSearch] 使用缓存结果: ${hospitalName}`, { count: cached.length });
      let results = this.filterByDate(cached, days).slice(0, Math.min(maxResults || 3, 3));
      // 如果需要包含正文内容，补充提取
      if (includeContent) {
        results = await this.supplementContent(results);
      }
      return results;
    }

    logger.info(`[WechatSearch] 开始搜狗微信搜索: ${hospitalName}`, { includeContent: !!includeContent, departments, doctors });

    // 3. 构建搜索关键词（医院名 + 科室 + 医生 + 关键词）
    let searchQuery = `${hospitalName}${deptSuffix}${doctorSuffix}`;
    if (keywords) {
      searchQuery += ` ${keywords}`;
    }

    // 4. 预检：先访问搜狗首页建立会话（增强反爬）
    if (!this.preflightDone) {
      logger.info('[WechatSearch] 预检：访问搜狗首页建立会话');
      await this.fetchWechatPage('https://weixin.sogou.com', { timeout: 30000 });
      this.preflightDone = true;
      await this.delay(3000, 5000);
    }

    try {
      let results = await this.performSearch(searchQuery, allNames, days, maxResults, departments, doctors, keywords);

      // 4. 如果需要包含正文内容，提取文章内容
      if (includeContent && results.length > 0) {
        logger.info(`[WechatSearch] 开始提取文章正文，共 ${results.length} 篇`);
        results = await this.fetchArticlesContent(results, 2); // 最多2个并发
      }

      // 5. 缓存结果（使用包含科室和医生信息的cacheKey）
      if (results.length > 0) {
        this.cacheResults(hospitalName, cacheKey, results);
      }

      // 6. 更新频率限制记录
      this.updateRateLimit();

      logger.info(`[WechatSearch] 搜狗微信搜索完成: ${hospitalName}`, { found: results.length });
      return results;
    } catch (error) {
      // 记录失败时间，限制后续请求
      this.updateRateLimit(true);
      logger.warn(`[WechatSearch] 搜狗微信搜索失败，优雅降级: ${hospitalName}`, error);
      return [];
    }
  }

  /**
   * 为缓存的结果补充正文内容（如果缺失）
   */
  private async supplementContent(items: HospitalNewsItem[]): Promise<HospitalNewsItem[]> {
    const needContent = items.filter(item => !item.content);
    if (needContent.length === 0) {
      return items;
    }

    logger.info(`[WechatSearch] 为 ${needContent.length} 篇缓存文章补充内容`);
    const withContent = await this.fetchArticlesContent(needContent, 2);

    // 合并结果
    const contentMap = new Map(withContent.map(item => [item.id, item.content]));
    return items.map(item => ({
      ...item,
      content: item.content || contentMap.get(item.id),
    }));
  }

  /**
   * 创建反检测浏览器（增强版）
   */
  private async createStealthBrowser() {
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
  private async fetchWechatPage(
    url: string,
    options: { timeout?: number; isArticle?: boolean } = {}
  ): Promise<{ html: string; title: string; finalUrl: string } | null> {
    const timeout = options.timeout || 90000;
    const browser = await this.createStealthBrowser();

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
      if (this.wechatCookies.length > 0) {
        await context.addCookies(this.wechatCookies);
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

      logger.info(`[WechatSearch] Navigating: ${url.substring(0, 80)}...`);

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
        logger.warn(`[WechatSearch] Captcha detected, trying to wait...`);
        await page.waitForTimeout(15000);
      }

      // 检查是否被封
      if (content.includes('访问过于频繁') || content.includes('您的访问过于频繁')) {
        logger.warn(`[WechatSearch] Rate limited!`);
        return null;
      }

      const html = await page.content();
      const title = await page.title();
      const finalUrl = page.url();

      // 保存Cookie
      this.wechatCookies = await context.cookies();

      return { html, title, finalUrl };
    } catch (error) {
      logger.error(`[WechatSearch] Error fetching page:`, error);
      return null;
    } finally {
      await browser.close();
    }
  }

  /**
   * 解析搜狗链接（增强版）
   */
  private async resolveSogouLinkEnhanced(sogouUrl: string): Promise<string | null> {
    try {
      const result = await this.fetchWechatPage(sogouUrl, { timeout: 45000 });
      if (!result) return null;

      // 如果已经跳转到微信域名
      if (result.finalUrl.includes('mp.weixin.qq.com')) {
        return result.finalUrl;
      }

      // 解析页面中的跳转链接
      const $ = cheerio.load(result.html);

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
      logger.error(`[WechatSearch] Resolve error:`, error);
      return null;
    }
  }

  /**
   * 执行搜狗微信搜索
   */
  private async performSearch(
    query: string,
    hospitalNames: string[],
    days: number,
    maxResults: number,
    departments?: string[],
    doctors?: string[],
    keywords?: string
  ): Promise<HospitalNewsItem[]> {
    const results: HospitalNewsItem[] = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const encodedQuery = encodeURIComponent(query);
    const maxPages = 3;
    const targetResults = maxResults || 20;

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      if (results.length >= targetResults) break;

      const searchUrl = `https://weixin.sogou.com/weixin?type=2&query=${encodedQuery}&page=${pageNum}`;

      // 使用增强版获取搜索页面
      const result = await this.fetchWechatPage(searchUrl, { timeout: 60000 });
      if (!result) {
        logger.warn('[WechatSearch] 搜狗微信搜索页面获取失败');
        continue;
      }

      // 检测是否被封
      if (result.html.includes('验证') || result.html.includes('captcha') || result.html.includes('过于频繁')) {
        logger.warn('[WechatSearch] 触发搜狗反爬，停止搜索');
        break;
      }

      const $ = cheerio.load(result.html);
      const searchItems: Array<{
        title: string;
        url: string;
        summary: string;
        source: string;
        dateText: string;
      }> = [];

      // 搜狗微信搜索结果解析
      $('.news-list li, .txt-box').each((_, el) => {
        const titleEl = $(el).find('h3 a, .tit a');
        const summaryEl = $(el).find('p, .txt-info');
        const sourceEl = $(el).find('.account, .s-p a');
        const dateEl = $(el).find('.s2, .time');

        let title = titleEl.text().trim();
        let url = titleEl.attr('href') || '';
        const summary = summaryEl.text().trim();
        const account = sourceEl.text().trim();
        const dateText = dateEl.text().trim();

        // 处理搜狗跳转链接
        if (url && url.startsWith('/link?')) {
          url = `https://weixin.sogou.com${url}`;
        }

        if (title && url && url.includes('sogou')) {
          searchItems.push({ title, url, summary, source: account, dateText });
        }
      });

      logger.info(`[WechatSearch] 搜索页解析完成`, { page: pageNum, found: searchItems.length });

      // 处理和过滤结果
      for (const item of searchItems) {
        if (!item.title) continue;

        // 检查是否包含医院名称
        const containsHospital = hospitalNames.some(name =>
          item.title.includes(name) || item.title.includes(name.replace('医院', ''))
        );

        // 检查是否为医疗相关
        const isMedicalNews = this.isMedicalNews(item.title, item.summary);

        // 检查是否匹配搜索关键词（科室/医生/关键词）
        const matchesTerms = this.matchesSearchTerms(item.title, item.summary, departments, doctors, keywords);

        // 微信内容通常质量较高，如果包含医院名、医疗关键词或匹配搜索词就保留
        if (!containsHospital && !isMedicalNews && !matchesTerms) continue;

        // 解析日期
        const publishedAt = this.parseDate(item.dateText);
        if (publishedAt < cutoffDate) continue;

        // 计算相关性分数（微信文章通常更聚焦）
        let relevanceScore = 25;
        if (containsHospital) relevanceScore = 80;
        else if (matchesTerms) relevanceScore = 60;
        else if (isMedicalNews) relevanceScore = 45;

        // 使用增强版解析搜狗链接
        const originalUrl = await this.resolveSogouLinkEnhanced(item.url);
        if (!originalUrl) {
          logger.warn(`[WechatSearch] 无法解析搜狗链接: ${item.url}`);
          continue;
        }

        results.push({
          id: this.generateId('wechat', item.title),
          title: item.title,
          summary: item.summary || item.title,
          source: {
            name: `${item.source}（微信）`,
            type: NewsSourceType.WECHAT_SEARCH,
            url: 'https://weixin.sogou.com',
          },
          originalUrl,
          publishedAt: publishedAt.toISOString(),
          fetchedAt: new Date().toISOString(),
          relevanceScore,
          sentiment: this.analyzeSentiment(item.title, item.summary),
          categories: this.categorize(item.title),
          verificationStatus: 'unverified',
          hospitalMentions: hospitalNames.filter(name => item.title.includes(name)),
        });

        if (results.length >= targetResults) break;
      }

      if (pageNum < maxPages) {
        await new Promise(r => setTimeout(r, 5000 + Math.random() * 3000));
      }
    }

    return results;
  }

  /**
   * 处理搜狗微信的链接跳转
   */
  private resolveWechatUrl(sogouUrl: string): string {
    // 搜狗微信链接通常会跳转到微信文章
    // 这里保持原始链接，用户点击时会经过跳转
    if (sogouUrl.startsWith('http')) {
      return sogouUrl;
    }
    if (sogouUrl.startsWith('/')) {
      return `https://weixin.sogou.com${sogouUrl}`;
    }
    return sogouUrl;
  }

  /**
   * 检测是否触发反爬
   */
  private async detectBlocking(page: Page): Promise<boolean> {
    const content = await page.content();
    const url = page.url();

    // 搜狗验证码检测（非常频繁）
    if (content.includes('验证码') ||
        content.includes('请点击') ||
        content.includes('验证') ||
        url.includes('antispider')) {
      logger.warn('[WechatSearch] 触发搜狗验证码');
      return true;
    }

    // IP限制
    if (content.includes('访问过于频繁') ||
        content.includes('您的访问受到限制') ||
        content.includes('请稍后重试')) {
      logger.warn('[WechatSearch] 搜狗访问频率限制');
      return true;
    }

    // 无结果或被拦截
    if (content.includes('没有找到') ||
        content.includes('抱歉') ||
        content.includes('页面暂时无法访问')) {
      logger.warn('[WechatSearch] 搜狗搜索无结果或被拦截');
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
      '门诊', '住院', '护理', '诊断', '医学', '病症',
      '血液', '肿瘤', '心脏', '神经', '骨科', '儿科',
      '妇产', '眼科', '耳鼻喉', '口腔', '皮肤', '精神',
      '康复', '急诊', '传染', '结核', '肝炎', '癌症',
      '移植', '透析', '放疗', '化疗', '靶向', '免疫',
    ];
    const text = `${title} ${summary || ''}`.toLowerCase();
    return medicalKeywords.some(kw => text.includes(kw));
  }

  /**
   * 检查是否匹配搜索关键词（科室、医生、用户关键词）
   */
  private matchesSearchTerms(
    title: string,
    summary: string | undefined,
    departments?: string[],
    doctors?: string[],
    keywords?: string
  ): boolean {
    const text = (title + ' ' + (summary || '')).toLowerCase();
    const terms = [
      ...(departments || []),
      ...(doctors || []),
      ...(keywords ? [keywords] : []),
    ];
    if (terms.length === 0) return false;
    return terms.some(term => text.includes(term.toLowerCase()));
  }

  /**
   * 解析日期
   */
  private parseDate(dateStr: string): Date {
    // 搜狗微信常见日期格式
    const patterns = [
      // document.write(timeConvert('1589608476'))2020-5-16 - 提取 Unix 时间戳
      /timeConvert\(['"](\d+)['"]\).*?(\d{4})-(\d{1,2})-(\d{1,2})/,
      /(\d{4})-(\d{1,2})-(\d{1,2})/,
      /(\d{1,2})月(\d{1,2})日/,  // MM月DD日，假设当年
      /(\d+)天前/,
      /(\d+)小时前/,
      /(\d+)分钟前/,
    ];

    for (const pattern of patterns) {
      const match = dateStr.match(pattern);
      if (match) {
        // Unix 时间戳格式 (timeConvert)
        if (pattern.source.includes('timeConvert')) {
          const timestamp = parseInt(match[1]) * 1000; // 秒转毫秒
          return new Date(timestamp);
        }
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
        } else if (pattern.source.includes('分钟前')) {
          const minutes = parseInt(match[1]);
          const date = new Date();
          date.setMinutes(date.getMinutes() - minutes);
          return date;
        } else if (pattern.source.includes('月')) {
          const year = new Date().getFullYear();
          return new Date(year, parseInt(match[1]) - 1, parseInt(match[2]));
        } else if (match.length === 4) {
          return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
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
      '科普': ['科普', '知识', '健康', '预防', '保健'],
      '临床': ['病例', '手术', '治疗', '康复', '疗效'],
      '科研': ['研究', '论文', '成果', '创新'],
      '管理': ['服务', '流程', '管理', '改革'],
    };

    for (const [cat, words] of Object.entries(keywords)) {
      if (words.some(w => title.includes(w))) {
        categories.push(cat);
      }
    }

    return categories.length > 0 ? categories : ['综合'];
  }

  /**
   * 检查是否处于频率限制期
   */
  private isRateLimited(): boolean {
    try {
      if (!fs.existsSync(this.rateLimitFile)) {
        return false;
      }

      const data = JSON.parse(fs.readFileSync(this.rateLimitFile, 'utf-8'));
      const lastAttempt = data.lastAttempt || 0;
      const failed = data.failed || false;

      // 如果上次失败了，限制时间更长（1小时）
      const interval = failed ? this.RATE_LIMIT_INTERVAL : this.RATE_LIMIT_INTERVAL / 2;

      return Date.now() - lastAttempt < interval;
    } catch (error) {
      return false;
    }
  }

  /**
   * 更新频率限制记录
   */
  private updateRateLimit(failed: boolean = false): void {
    try {
      const dir = path.dirname(this.rateLimitFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.rateLimitFile, JSON.stringify({
        lastAttempt: Date.now(),
        failed,
      }));
    } catch (error) {
      logger.warn('[WechatSearch] 无法写入频率限制文件', error);
    }
  }

  /**
   * 从数据库获取缓存结果
   */
  private getCachedResults(hospitalName: string, keywords?: string): HospitalNewsItem[] | null {
    try {
      const since = new Date(Date.now() - this.CACHE_TTL);
      const cached = this.db.getCachedNews(hospitalName, since);

      // 过滤出微信搜索的结果
      const wechatResults = cached.filter((item: any) =>
        item.sourceType === NewsSourceType.WECHAT_SEARCH ||
        item.source?.type === NewsSourceType.WECHAT_SEARCH
      );

      if (keywords) {
        const keywordFiltered = wechatResults.filter((item: any) =>
          item.keywords === keywords ||
          item.title.includes(keywords) ||
          item.summary?.includes(keywords)
        );
        return keywordFiltered.length > 0 ? keywordFiltered : null;
      }

      return wechatResults.length > 0 ? wechatResults : null;
    } catch (error) {
      logger.warn('[WechatSearch] 读取缓存失败', error);
      return null;
    }
  }

  /**
   * 缓存结果到数据库
   */
  private cacheResults(hospitalName: string, keywords: string | undefined, results: HospitalNewsItem[]): void {
    try {
      const resultsWithKeywords = results.map(r => ({
        ...r,
        hospitalName,
        keywords,
      }));

      this.db.cacheNews(resultsWithKeywords);
      logger.debug('[WechatSearch] 已缓存搜索结果', { count: results.length });
    } catch (error) {
      logger.warn('[WechatSearch] 写入缓存失败', error);
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

  // ========== 微信公众号文章正文提取功能 ==========

  /**
   * 从搜狗微信链接获取真实的微信公众号文章链接
   * 参考: weixin_search_mcp 项目的 get_real_url_from_sogou 实现
   */
  async resolveRealWechatUrl(sogouUrl: string): Promise<string | null> {
    // 动态获取 Cookie
    const cookie = await this.getSogouCookie();

    const headers: Record<string, string> = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Pragma': 'no-cache',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36 Edg/137.0.0.0',
    };

    if (cookie) {
      headers['Cookie'] = cookie;
    }

    try {
      logger.debug('[WechatSearch] 解析真实URL', { sogouUrl });

      const response = await axios.get(sogouUrl, {
        headers,
        timeout: REQUEST_TIMEOUT,
        maxRedirects: 5,
        responseType: 'text',
        // 禁止自动处理重定向，以便获取中间响应
        validateStatus: (status) => status >= 200 && status < 400,
      });

      // 获取最终URL
      const finalUrl = response.request?.res?.responseUrl || response.config.url || sogouUrl;
      logger.debug('[WechatSearch] 请求完成', { finalUrl, status: response.status });

      if (finalUrl && finalUrl.includes('mp.weixin.qq.com')) {
        return finalUrl;
      }

      // 如果重定向没有直接到微信域名，解析响应内容中的URL
      const html = response.data;

      // 检测反爬
      if (this.isAntiSpiderResponse(html, finalUrl)) {
        logger.warn('[WechatSearch] 解析URL时触发反爬', {
          url: finalUrl,
          htmlSnippet: html.substring(0, 200),
        });
        return null;
      }

      // 从JavaScript代码中提取URL片段
      const urlParts: string[] = [];
      const regex = /url\s*\+=\s*['"]([^'"]*)['"]/g;
      let match;

      while ((match = regex.exec(html)) !== null) {
        urlParts.push(match[1]);
      }

      logger.debug('[WechatSearch] URL片段提取', { count: urlParts.length });

      if (urlParts.length === 0) {
        // 尝试其他模式 - 直接查找url变量
        const linkMatch = html.match(/var\s+url\s*=\s*['"]([^'"]*)['"]/);
        if (linkMatch) {
          return linkMatch[1].replace(/@/g, '');
        }
        // 尝试查找包含mp.weixin.qq.com的链接
        const mpLinkMatch = html.match(/https?:\/\/mp\.weixin\.qq\.com\/[^'"\s<>]+/);
        if (mpLinkMatch) {
          return mpLinkMatch[0];
        }
        logger.warn('[WechatSearch] 无法从HTML中提取URL', { htmlSnippet: html.substring(0, 500) });
        return null;
      }

      const fullUrl = urlParts.join('').replace(/@/g, '');
      if (!fullUrl) {
        return null;
      }

      // 构建完整URL
      if (fullUrl.startsWith('http')) {
        return fullUrl;
      }
      return `https://mp.${fullUrl}`;
    } catch (error) {
      logger.warn('[WechatSearch] 解析真实URL失败', { sogouUrl, error });
      return null;
    }
  }

  /**
   * 检测是否为反爬虫响应
   */
  private isAntiSpiderResponse(html: string, url: string): boolean {
    const lowerHtml = html.toLowerCase();
    const lowerUrl = url.toLowerCase();
    return (
      lowerUrl.includes('antispider') ||
      lowerHtml.includes('seccoderight') ||
      lowerHtml.includes('anti.min.css') ||
      lowerHtml.includes('验证码') ||
      lowerHtml.includes('请点击')
    );
  }

  /**
   * 获取微信公众号文章正文内容
   * 参考: weixin_search_mcp 项目的 get_article_content 实现
   */
  async fetchArticleContent(realUrl: string, referer?: string): Promise<WechatArticleContent> {
    // 1. 检查缓存
    const cached = this.getCachedContent(realUrl);
    if (cached) {
      logger.debug('[WechatSearch] 使用缓存的文章内容', { url: realUrl });
      return cached;
    }

    const headers: Record<string, string> = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Pragma': 'no-cache',
      'Priority': 'u=0, i',
      'Sec-Ch-Ua': '"Microsoft Edge";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'cross-site',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36 Edg/137.0.0.0',
    };

    if (referer) {
      headers['Referer'] = referer;
    }

    try {
      // 验证URL有效性
      if (!realUrl || !realUrl.includes('mp.weixin.qq.com')) {
        return {
          content: '',
          fetchedAt: new Date().toISOString(),
          success: false,
          error: '无效的微信公众号文章链接',
        };
      }

      const response = await axios.get(realUrl, {
        headers,
        timeout: REQUEST_TIMEOUT,
        responseType: 'text',
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = response.data;
      const finalUrl = response.request?.res?.responseUrl || realUrl;

      // 检测反爬
      if (this.isAntiSpiderResponse(html, finalUrl)) {
        return {
          content: '',
          fetchedAt: new Date().toISOString(),
          success: false,
          error: '触发反爬验证，无法获取内容',
        };
      }

      // 使用正则提取正文内容（避免引入额外的HTML解析库）
      // 微信公众号正文通常在 #js_content 中
      const contentMatch = html.match(/<div[^>]*id=["']js_content["'][^>]*>([\s\S]*?)<\/div>/i);

      if (!contentMatch) {
        return {
          content: '',
          fetchedAt: new Date().toISOString(),
          success: false,
          error: '无法找到文章内容',
        };
      }

      // 清理HTML标签，提取纯文本
      let content = contentMatch[1]
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();

      const result: WechatArticleContent = {
        content,
        fetchedAt: new Date().toISOString(),
        success: true,
      };

      // 缓存结果
      this.cacheContent(realUrl, result);

      return result;
    } catch (error) {
      logger.warn('[WechatSearch] 获取文章内容失败', { url: realUrl, error });
      return {
        content: '',
        fetchedAt: new Date().toISOString(),
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 从缓存获取文章内容
   */
  private getCachedContent(url: string): WechatArticleContent | null {
    try {
      const cacheKey = this.getContentCacheKey(url);
      const cacheFile = path.join(CONTENT_CACHE_DIR, `${cacheKey}.json`);

      if (!fs.existsSync(cacheFile)) {
        return null;
      }

      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      const age = Date.now() - new Date(data.fetchedAt).getTime();

      // 检查是否过期（24小时）
      if (age > this.CONTENT_CACHE_TTL) {
        fs.unlinkSync(cacheFile);
        return null;
      }

      return data;
    } catch (error) {
      logger.warn('[WechatSearch] 读取内容缓存失败', { url, error });
      return null;
    }
  }

  /**
   * 缓存文章内容
   */
  private cacheContent(url: string, content: WechatArticleContent): void {
    try {
      const cacheKey = this.getContentCacheKey(url);
      fs.writeFileSync(path.join(CONTENT_CACHE_DIR, `${cacheKey}.json`), JSON.stringify(content));
    } catch (error) {
      logger.warn('[WechatSearch] 写入内容缓存失败', { url, error });
    }
  }

  /**
   * 生成内容缓存键
   */
  private getContentCacheKey(url: string): string {
    // 使用URL的hash作为缓存键
    return Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
  }

  /**
   * 批量获取文章内容（用于搜索结果）
   * @param items 搜索结果列表
   * @param maxConcurrent 最大并发数
   */
  async fetchArticlesContent(
    items: HospitalNewsItem[],
    maxConcurrent: number = 2
  ): Promise<HospitalNewsItem[]> {
    const results: HospitalNewsItem[] = [];

    for (let i = 0; i < items.length; i += maxConcurrent) {
      const batch = items.slice(i, i + maxConcurrent);

      const batchPromises = batch.map(async (item) => {
        // 获取真实URL
        const realUrl = await this.resolveSogouLinkEnhanced(item.originalUrl);
        if (!realUrl) {
          return { ...item, content: undefined };
        }

        // 获取内容
        const contentResult = await this.fetchArticleContent(realUrl, item.originalUrl);

        return {
          ...item,
          content: contentResult.success ? contentResult.content : undefined,
          originalUrl: realUrl, // 更新为真实URL
        };
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // 批次间延迟，避免请求过快
      if (i + maxConcurrent < items.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  private delay(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}
