import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { createLLMClient, LLMClient, LLMMessage } from '../llm-client';
import { createLogger } from '../../utils/plugin-logger';

const logger = createLogger('REPSCLAW:SEARCH-DISCOVERY');

interface SearchResult {
  title: string;
  url: string;
  source: string;
}

/**
 * 搜索引擎 URL 发现服务
 * 通过百度搜索引擎 + LLM 判断，动态发现医院官网新闻页面 URL
 */
export class SearchEngineUrlDiscovery {
  private llmClient: LLMClient;
  private cache: Map<string, { url: string | null; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时

  constructor(llmClient?: LLMClient) {
    this.llmClient = llmClient || createLLMClient();
  }

  /**
   * 通过搜索引擎发现医院新闻页面 URL
   * 流程：百度搜索 -> 解析候选结果 -> LLM 判断最佳 URL -> 返回结果
   */
  async discoverHospitalNewsUrl(hospitalName: string): Promise<string | null> {
    // 1. 检查缓存
    const cached = this.cache.get(hospitalName);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.info(`[SearchEngineDiscovery] 使用缓存结果: ${hospitalName}`, { url: cached.url });
      return cached.url;
    }

    logger.info(`[SearchEngineDiscovery] 开始搜索医院新闻 URL: ${hospitalName}`);

    try {
      // 2. 百度搜索获取候选结果
      const candidates = await this.searchBaidu(`${hospitalName} 官网 新闻`);
      if (candidates.length === 0) {
        logger.warn(`[SearchEngineDiscovery] 百度搜索无结果: ${hospitalName}`);
        this.cache.set(hospitalName, { url: null, timestamp: Date.now() });
        return null;
      }

      // 3. 用 LLM 判断最佳 URL
      const bestUrl = await this.selectBestUrlWithLLM(hospitalName, candidates);

      // 4. 缓存结果
      this.cache.set(hospitalName, { url: bestUrl, timestamp: Date.now() });

      if (bestUrl) {
        logger.info(`[SearchEngineDiscovery] LLM 选定 URL: ${hospitalName} -> ${bestUrl}`);
      } else {
        logger.warn(`[SearchEngineDiscovery] LLM 无法确认 URL: ${hospitalName}`);
      }

      return bestUrl;
    } catch (error) {
      logger.error(`[SearchEngineDiscovery] 发现 URL 失败: ${hospitalName}`, error);
      this.cache.set(hospitalName, { url: null, timestamp: Date.now() });
      return null;
    }
  }

  /**
   * 通用百度搜索方法
   * 返回前 N 条搜索结果的标题和 URL
   */
  async searchBaidu(query: string, maxResults: number = 5): Promise<SearchResult[]> {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const results: SearchResult[] = [];

    try {
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
      });

      const page = await context.newPage();

      // 拦截图片/CSS/字体，加速加载
      await page.route('**/*.{png,jpg,jpeg,gif,css,woff,woff2,ttf}', route => route.abort());

      const encodedQuery = encodeURIComponent(query);
      const searchUrl = `https://www.baidu.com/s?wd=${encodedQuery}`;

      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      await page.waitForTimeout(2000 + Math.random() * 2000);

      // 检测反爬
      const content = await page.content();
      if (
        content.includes('验证码') ||
        content.includes('安全验证') ||
        content.includes('请输入验证码') ||
        page.url().includes('wappass.baidu.com')
      ) {
        logger.warn('[SearchEngineDiscovery] 触发百度验证码');
        return [];
      }

      const html = await page.content();
      const $ = cheerio.load(html);

      $('.result, [tpl], .c-container').each((_, el) => {
        const titleEl = $(el).find('h3 a, .t a');
        const title = titleEl.text().trim();
        const url = titleEl.attr('href') || '';
        const sourceEl = $(el).find('.g, .cite, .c-color-gray');
        const source = sourceEl.text().trim().split(' ')[0] || '百度';

        if (title && url) {
          results.push({ title, url, source });
        }
      });

      logger.debug(`[SearchEngineDiscovery] 百度搜索完成`, { query, found: results.length });
    } catch (error) {
      logger.error(`[SearchEngineDiscovery] 百度搜索失败: ${query}`, error);
    } finally {
      await browser.close();
    }

    return results.slice(0, maxResults);
  }

  /**
   * 通过 LLM 从候选结果中选出最可能是医院新闻页面的 URL
   */
  private async selectBestUrlWithLLM(
    hospitalName: string,
    candidates: SearchResult[]
  ): Promise<string | null> {
    const candidateText = candidates
      .map((c, i) => `${i + 1}. 标题: ${c.title}\n   URL: ${c.url}\n   来源: ${c.source}`)
      .join('\n');

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content:
          '你是一个专门识别医院官网新闻页面的助手。用户会提供一家医院名称和百度搜索结果。' +
          '请判断哪条结果最可能是该医院的「新闻动态/医院资讯/媒体报道」页面。' +
          '要求：\n' +
          '1. 优先选择医院官方网站（域名通常包含医院拼音或缩写）\n' +
          '2. URL 路径应包含 news/xw/xwzx/dt/media 等新闻相关关键词\n' +
          '3. 不要选择第三方聚合平台（如 baijiahao.baidu.com、zhihu.com、sohu.com 等）\n' +
          '4. 只返回一个 URL，不要有任何解释。如果无法确定，返回 UNKNOWN',
      },
      {
        role: 'user',
        content: `医院名称: ${hospitalName}\n\n候选结果:\n${candidateText}\n\n请返回最可能的新闻页面 URL 或 UNKNOWN:`,
      },
    ];

    try {
      const response = await this.llmClient.call({
        model: this.llmClient.defaultModel,
        messages,
        temperature: 0.1,
      });

      const cleaned = response.trim();

      if (cleaned === 'UNKNOWN' || cleaned.includes('无法确定') || cleaned.includes('不确定')) {
        return null;
      }

      // 尝试提取 URL
      const urlMatch = cleaned.match(/https?:\/\/[^\s<>"'\]\)]+/);
      if (urlMatch) {
        return urlMatch[0];
      }

      return null;
    } catch (error) {
      logger.error('[SearchEngineDiscovery] LLM 判断失败', error);
      return null;
    }
  }
}
