import axios from 'axios';
import {
  NewsSourceClient,
  NewsSourceType,
  NewsSearchParams,
  HospitalNewsItem,
} from '../../types/hospital-news.types';

/**
 * 主流媒体新闻客户端
 * 数据来源：聚合数据新闻API
 * 优先级：3
 */
export class MainstreamNewsClient extends NewsSourceClient {
  sourceType = NewsSourceType.MAINSTREAM;
  priority = 3;

  private apiKey: string;
  private baseUrl = 'http://v.juhe.cn/toutiao/index';

  // 医疗相关新闻类型
  private medicalTypes = ['shehui', 'guonei', 'health'];

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey || process.env.JUHE_NEWS_API_KEY || '';
  }

  async search(params: NewsSearchParams): Promise<HospitalNewsItem[]> {
    const { hospitalName, aliases, days, maxResults, keywords } = params;

    if (!this.apiKey) {
      console.warn('[MainstreamNewsClient] 未配置API Key，跳过主流媒体查询');
      return [];
    }

    const allNames = [hospitalName, ...aliases];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const results: HospitalNewsItem[] = [];

    // 构建搜索关键词
    const searchKeyword = keywords
      ? `${hospitalName} ${keywords}`
      : hospitalName;

    try {
      // 聚合数据API支持keyword参数
      const response = await axios.get<JuheNewsResponse>(this.baseUrl, {
        params: {
          key: this.apiKey,
          type: this.medicalTypes.join(','),
          keyword: searchKeyword,
          page: 1,
          page_size: Math.min(maxResults * 2, 50), // 多取一些用于过滤
        },
        timeout: 10000,
      });

      if (response.data.error_code !== 0) {
        console.error(`[MainstreamNewsClient] API错误: ${response.data.reason}`);
        return [];
      }

      const articles = response.data.result?.data || [];

      for (const article of articles) {
        const publishedAt = new Date(article.date);

        // 日期过滤
        if (publishedAt < cutoffDate) continue;

        // 检查是否包含医院名称
        const content = `${article.title} ${article.abstract || ''}`;
        const containsHospital = allNames.some(name =>
          content.includes(name) || content.includes(name.replace('医院', ''))
        );

        // 主流媒体的医疗新闻，即使不直接提及医院名也保留（可能是行业新闻）
        const isMedicalNews = this.isMedicalNews(article.title, article.abstract);
        if (!containsHospital && !isMedicalNews) continue;

        const relevanceScore = containsHospital ? 85 : (isMedicalNews ? 40 : 20);

        results.push({
          id: this.generateId('mainstream', article.title),
          title: article.title,
          summary: article.abstract || article.title,
          source: {
            name: article.author_name || article.media_name || '新闻媒体',
            type: NewsSourceType.MAINSTREAM,
          },
          originalUrl: article.url,
          publishedAt: publishedAt.toISOString(),
          fetchedAt: new Date().toISOString(),
          relevanceScore,
          sentiment: this.analyzeSentiment(article.title, article.abstract),
          categories: this.categorize(article.title, article.abstract),
          verificationStatus: 'verified',
          hospitalMentions: allNames.filter(name => content.includes(name)),
        });

        if (results.length >= maxResults) break;
      }
    } catch (error) {
      console.error('[MainstreamNewsClient] 查询失败:', error);
    }

    return results.slice(0, maxResults);
  }

  private isMedicalNews(title: string, abstract?: string): boolean {
    const medicalKeywords = [
      '医院', '医疗', '医生', '患者', '疾病', '治疗', '手术',
      '药物', '疫苗', '医保', '医药', '临床', '科室',
      '专家', '院士', '主任医师', '护士长', '医疗器械',
    ];
    const text = `${title} ${abstract || ''}`.toLowerCase();
    return medicalKeywords.some(kw => text.includes(kw));
  }

  private categorize(title: string, abstract?: string): string[] {
    const categories: string[] = [];
    const text = `${title} ${abstract || ''}`;

    const mapping: Record<string, string[]> = {
      '科研': ['科研', '研究', '论文', '成果', '课题', 'SCI', '学术'],
      '临床': ['手术', '治疗', '患者', '病例', '康复', '疗效'],
      '管理': ['医改', '公立医院', '民营医院', '医疗服务', '分级诊疗'],
      '产业': ['医药', '药企', '医疗器械', '生物技术', '投资'],
      '公卫': ['疫情', '疫苗', '疾控', '公卫', '传染病'],
      '人物': ['院士', '专家', '医生', '名医', '院长'],
    };

    for (const [cat, keywords] of Object.entries(mapping)) {
      if (keywords.some(kw => text.includes(kw))) {
        categories.push(cat);
      }
    }

    return categories.length > 0 ? categories : ['综合'];
  }
}

// 聚合数据API响应格式
interface JuheNewsResponse {
  reason: string;
  result?: {
    stat: string;
    data: Array<{
      uniquekey: string;
      title: string;
      date: string;
      category: string;
      author_name: string;
      media_name?: string;
      url: string;
      thumbnail_pic_s?: string;
      is_content: string;
      abstract?: string;
    }>;
    page: string;
    page_size: string;
  };
  error_code: number;
}

/**
 * 备用：极速数据客户端
 * 当聚合数据不可用时使用
 */
export class IdmayiNewsClient extends NewsSourceClient {
  sourceType = NewsSourceType.MAINSTREAM;
  priority = 4; // 备用，优先级稍低

  private appId: string;
  private appSecret: string;
  private baseUrl = 'https://www.idmayi.com/api/news/list';

  constructor() {
    super();
    this.appId = process.env.IDMAYI_APP_ID || '';
    this.appSecret = process.env.IDMAYI_APP_SECRET || '';
  }

  async search(params: NewsSearchParams): Promise<HospitalNewsItem[]> {
    // 极速数据实现类似，略...
    // 作为聚合数据的备用方案
    return [];
  }
}
