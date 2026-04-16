import { chromium, Browser } from 'playwright';
import * as cheerio from 'cheerio';
import {
  NewsSourceClient,
  NewsSourceType,
  NewsSearchParams,
  HospitalNewsItem,
} from '../../types/hospital-news.types';
import { createLogger } from '../../utils/plugin-logger';
import { SearchEngineUrlDiscovery } from './search-engine-discovery';
import { createLLMClient, LLMClient, LLMMessage } from '../llm-client';

const logger = createLogger('REPSCLAW:OFFICIAL-NEWS-PW');

interface OfficialSource {
  name: string;
  domain: string;
  baseUrl: string;
}

/**
 * 官方政务新闻客户端 (Playwright + 百度搜索驱动版本)
 * 优先级：2
 * 特点：
 * - 不再爬取固定列表页，改为通过百度搜索 site: 语法定位官方网站上的具体新闻
 * - 用 LLM 过滤搜索结果，确保结果真正来自官方源且与医院相关
 * - 顺序执行避免并发触发百度反爬
 */
export class OfficialNewsPlaywrightClient extends NewsSourceClient {
  sourceType = NewsSourceType.OFFICIAL;
  priority = 2;

  private officialSources: OfficialSource[] = [
    { name: '国家卫健委', domain: 'nhc.gov.cn', baseUrl: 'https://www.nhc.gov.cn' },
    { name: '国家药监局', domain: 'nmpa.gov.cn', baseUrl: 'https://www.nmpa.gov.cn' },
    { name: '国家医保局', domain: 'nhsa.gov.cn', baseUrl: 'https://www.nhsa.gov.cn' },
  ];

  private urlDiscovery: SearchEngineUrlDiscovery;
  private llmClient: LLMClient;

  constructor(llmClient?: LLMClient) {
    super();
    this.llmClient = llmClient || createLLMClient();
    this.urlDiscovery = new SearchEngineUrlDiscovery(this.llmClient);
  }

  async search(params: NewsSearchParams): Promise<HospitalNewsItem[]> {
    const { hospitalName, aliases, days, maxResults, keywords, departments } = params;
    const allNames = [hospitalName, ...aliases];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const results: HospitalNewsItem[] = [];
    let browser: Browser | null = null;

    logger.info('[OfficialNewsPlaywright] 开始查询官方数据源', { hospital: hospitalName });

    try {
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

      for (const source of this.officialSources) {
        try {
          const items = await this.searchOfficialSource(
            browser,
            source,
            hospitalName,
            allNames,
            keywords,
            departments,
            cutoffDate,
            maxResults
          );
          results.push(...items);

          // 源之间延迟避免触发反爬
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

  private async searchOfficialSource(
    browser: Browser,
    source: OfficialSource,
    hospitalName: string,
    aliases: string[],
    keywords: string | undefined,
    departments: string[] | undefined,
    cutoffDate: Date,
    maxResults: number
  ): Promise<HospitalNewsItem[]> {
    // 1. 构造百度搜索查询
    const deptPart = departments && departments.length > 0 ? departments.join(' ') : '';
    const keywordPart = keywords || '医疗机构 医院';
    const query = `${hospitalName} ${deptPart} ${keywordPart} site:${source.domain}`.replace(/\s+/g, ' ').trim();

    logger.info(`[OfficialNewsPlaywright] 百度搜索: ${source.name}`, { query });

    // 2. 百度搜索获取候选结果
    const candidates = await this.urlDiscovery.searchBaidu(query, 8);
    if (candidates.length === 0) {
      logger.warn(`[OfficialNewsPlaywright] ${source.name} 百度搜索无结果`);
      return [];
    }

    // 3. 用 LLM 过滤结果
    const filteredUrls = await this.filterResultsWithLLM(hospitalName, source, candidates);
    if (filteredUrls.length === 0) {
      logger.warn(`[OfficialNewsPlaywright] ${source.name} LLM 过滤后无有效结果`);
      return [];
    }

    logger.info(`[OfficialNewsPlaywright] ${source.name} LLM 保留 ${filteredUrls.length} 条结果`);

    // 4. 逐个访问详情页提取信息
    const items: HospitalNewsItem[] = [];
    for (const url of filteredUrls.slice(0, 5)) {
      try {
        const item = await this.extractArticle(browser, url, source, hospitalName, aliases, cutoffDate);
        if (item) {
          items.push(item);
        }
        if (items.length >= maxResults) break;
        await this.delay(2000 + Math.random() * 2000);
      } catch (error) {
        logger.warn(`[OfficialNewsPlaywright] 提取详情页失败: ${url}`, error);
      }
    }

    return items;
  }

  /**
   * 通过 LLM 过滤百度搜索结果，只保留真正来自官方网站且与医院相关的链接
   */
  private async filterResultsWithLLM(
    hospitalName: string,
    source: OfficialSource,
    candidates: { title: string; url: string; source: string }[]
  ): Promise<string[]> {
    const candidateText = candidates
      .map((c, i) => `${i + 1}. 标题: ${c.title}\n   URL: ${c.url}`)
      .join('\n');

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content:
          '你是一个信息过滤助手。用户会提供一家医院名称、一个官方机构和一个百度搜索结果列表。' +
          '请判断哪些结果真正来自该官方机构的网站，并且内容确实与这家医院相关。' +
          `官方机构: ${source.name}，官方网站域名应包含: ${source.domain}\n` +
          '要求：\n' +
          '1. 只保留域名确实属于官方机构的链接\n' +
          '2. 标题或内容应明确提及该医院，或明显与该医院的医疗活动、政策监管相关\n' +
          '3. 不要返回任何解释，只以 JSON 数组格式返回保留的 URL 列表，如: ["https://...", "https://..."]\n' +
          '4. 如果没有符合条件的，返回 []',
      },
      {
        role: 'user',
        content: `医院名称: ${hospitalName}\n官方机构: ${source.name}\n\n候选结果:\n${candidateText}\n\n请返回 JSON 数组格式的 URL 列表:`,
      },
    ];

    try {
      const response = await this.llmClient.call({
        model: this.llmClient.defaultModel,
        messages,
        temperature: 0.1,
      });

      const cleaned = response.trim();

      // 尝试提取 JSON 数组
      const jsonMatch = cleaned.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const urls = JSON.parse(jsonMatch[0]) as string[];
        return urls.filter((u) => typeof u === 'string' && u.startsWith('http'));
      }

      // 兜底：按行提取 URL
      const urls = cleaned
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('http'));
      return urls;
    } catch (error) {
      logger.error('[OfficialNewsPlaywright] LLM 过滤失败', error);
      // LLM 失败时，简单按域名过滤作为兜底
      return candidates
        .filter((c) => c.url.includes(source.domain))
        .map((c) => c.url);
    }
  }

  /**
   * 用 Playwright 访问详情页提取新闻信息
   */
  private async extractArticle(
    browser: Browser,
    url: string,
    source: OfficialSource,
    hospitalName: string,
    aliases: string[],
    cutoffDate: Date
  ): Promise<HospitalNewsItem | null> {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });

    try {
      const page = await context.newPage();

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });

      await page.waitForTimeout(2000);

      const html = await page.content();
      const $ = cheerio.load(html);

      // 移除脚本和样式
      $('script, style, nav, footer').remove();

      // 尝试多种方式提取标题
      const titleSelectors = [
        'h1', '.title', '.article-title', '.news-title', '#title', '[class*="title"]',
      ];
      let title = '';
      for (const sel of titleSelectors) {
        const text = $(sel).first().text().trim();
        if (text && text.length > 5 && text.length < 200) {
          title = text;
          break;
        }
      }

      if (!title) {
        title = $('title').text().trim() || '无标题';
      }

      // 提取日期
      const dateSelectors = [
        '.date', '.time', '[class*="date"]', '[class*="time"]', 'span.pubtime', '.pub-date',
      ];
      let dateText = '';
      for (const sel of dateSelectors) {
        const text = $(sel).first().text().trim();
        if (text && /\d{4}/.test(text)) {
          dateText = text;
          break;
        }
      }

      const publishedAt = this.parseOfficialDate(dateText);
      if (publishedAt < cutoffDate) {
        return null;
      }

      // 提取正文（全文保存到 content，摘要保存到 summary）
      const contentSelectors = [
        'article', '.content', '.main-content', '#content', '.detail', '.article-content', '.news-content',
      ];
      let content = '';
      for (const sel of contentSelectors) {
        const text = $(sel).first().text().trim();
        if (text && text.length > 50) {
          content = text;
          break;
        }
      }
      if (!content) {
        content = $('body').text().trim().replace(/\s+/g, ' ');
      }
      const summary = content.slice(0, 300);

      // 检查是否包含医院名称
      const allNames = [hospitalName, ...aliases];
      const containsHospital = allNames.some(
        (name) => title.includes(name) || content.includes(name)
      );

      // 医疗政策兜底
      const isMedicalPolicy = this.isMedicalPolicy(title + ' ' + content);
      if (!containsHospital && !isMedicalPolicy) {
        return null;
      }

      const relevanceScore = containsHospital ? 95 : isMedicalPolicy ? 50 : 30;

      return {
        id: this.generateId('official', title + url),
        title,
        summary: `[${source.name}] ${summary}`,
        content,
        source: {
          name: source.name,
          type: NewsSourceType.OFFICIAL,
          url: source.baseUrl,
        },
        originalUrl: url,
        publishedAt: publishedAt.toISOString(),
        fetchedAt: new Date().toISOString(),
        relevanceScore,
        sentiment: this.analyzeSentiment(title, content),
        categories: this.categorizeOfficialNews(title),
        verificationStatus: 'verified',
        hospitalMentions: allNames.filter((name) => title.includes(name)),
      };
    } finally {
      await context.close();
    }
  }

  private isMedicalPolicy(title: string): boolean {
    const policyKeywords = [
      '医疗机构', '医院管理', '医疗质量', '医疗安全', '医疗服务',
      '分级诊疗', '医联体', '医共体', '公立医院', '民营医院',
      '临床', '医务人员', '医疗改革', '医保', '医药',
    ];
    return policyKeywords.some((kw) => title.includes(kw));
  }

  private parseOfficialDate(dateStr: string): Date {
    const match = dateStr.match(/(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})/);
    if (match) {
      return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    }
    return new Date();
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
      if (keywords.some((kw) => title.includes(kw))) {
        categories.push(cat);
      }
    }

    return categories.length > 0 ? categories : ['政务'];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
