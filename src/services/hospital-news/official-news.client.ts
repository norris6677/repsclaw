import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  NewsSourceClient,
  NewsSourceType,
  NewsSearchParams,
  HospitalNewsItem,
} from '../../types/hospital-news.types';

/**
 * 官方政务新闻客户端
 * 数据来源：卫健委、药监局等官方渠道
 * 优先级：2
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

    // 并行查询所有官方源
    const searchPromises = this.officialSources.map(source =>
      this.searchSingleSource(source, allNames, cutoffDate, maxResults, keywords)
    );

    const sourceResults = await Promise.allSettled(searchPromises);

    for (const result of sourceResults) {
      if (result.status === 'fulfilled') {
        results.push(...result.value);
      }
    }

    return results.slice(0, maxResults);
  }

  private async searchSingleSource(
    source: typeof this.officialSources[0],
    hospitalNames: string[],
    cutoffDate: Date,
    maxResults: number,
    keywords?: string
  ): Promise<HospitalNewsItem[]> {
    const items: HospitalNewsItem[] = [];

    try {
      const response = await axios.get(source.newsUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const $ = cheerio.load(response.data);

      $(source.listSelector).each((_, element) => {
        const titleEl = $(element).find(source.titleSelector);
        const title = titleEl.text().trim();
        const link = titleEl.attr('href');
        const dateText = $(element).find(source.dateSelector).text().trim();

        if (!title) return;

        // 过滤：检查是否包含医院名称
        const containsHospital = hospitalNames.some(name =>
          title.includes(name) || title.includes(name.replace('医院', ''))
        );

        // 过滤：检查关键词
        if (keywords && !title.includes(keywords)) {
          return;
        }

        // 即使不包含完整医院名，如果是医疗政策相关也保留（降低相关性）
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
          summary: `[${source.name}] ${title}`,
          source: {
            name: source.name,
            type: NewsSourceType.OFFICIAL,
            url: source.baseUrl,
          },
          originalUrl: this.resolveUrl(link, source.baseUrl),
          publishedAt: publishedAt.toISOString(),
          fetchedAt: new Date().toISOString(),
          relevanceScore,
          sentiment: this.analyzeSentiment(title),
          categories: this.categorizeOfficialNews(title),
          verificationStatus: 'verified',
          hospitalMentions: hospitalNames.filter(name => title.includes(name)),
        });
      });
    } catch (error) {
      console.error(`[OfficialNewsClient] ${source.name} 查询失败:`, error);
    }

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
}
