/**
 * 医院全网消息查询 - 类型定义
 */

// ===== 来源类型 =====
export enum NewsSourceType {
  HOSPITAL_SELF = 'hospital_self',  // 医院自媒体/官网
  OFFICIAL = 'official',            // 官方政务
  MAINSTREAM = 'mainstream',        // 主流媒体
  AGGREGATOR = 'aggregator',        // 聚合平台
}

// ===== 工具参数 =====
export interface GetHospitalNewsParameters {
  hospitalName: string;
  sources?: NewsSourceType[];
  days?: number;              // 1-90，默认7
  maxResults?: number;        // 1-50，默认10
  keywords?: string;
  includeContent?: boolean;   // 是否包含正文
}

// ===== 单条新闻 =====
export interface HospitalNewsItem {
  id: string;
  title: string;
  summary: string;
  content?: string;
  source: {
    name: string;
    type: NewsSourceType;
    url?: string;
  };
  originalUrl: string;
  publishedAt: string;
  fetchedAt: string;
  relevanceScore: number;     // 0-100
  sentiment: 'positive' | 'neutral' | 'negative';
  categories: string[];
  verificationStatus: 'verified' | 'unverified';
  hospitalMentions: string[];
}

// ===== 查询结果 =====
export interface HospitalNewsResult {
  status: 'success' | 'error';
  hospital: {
    input: string;
    resolved: string;
    aliases: string[];
  };
  query: {
    days: number;
    sources: NewsSourceType[];
    keywords?: string;
  };
  totalFound: number;
  results: HospitalNewsItem[];
  sourceStats: Record<NewsSourceType, number>;
  meta: {
    cached: boolean;
    cacheAge?: number;
    fetchedAt: string;
    nextUpdateAt: string;
  };
}

// ===== 数据源客户端接口 =====
export interface NewsSearchParams {
  hospitalName: string;
  aliases: string[];
  days: number;
  maxResults: number;
  keywords?: string;
}

export abstract class NewsSourceClient {
  abstract readonly sourceType: NewsSourceType;
  abstract readonly priority: number;

  abstract search(params: NewsSearchParams): Promise<HospitalNewsItem[]>;

  protected analyzeSentiment(title: string, content?: string): 'positive' | 'neutral' | 'negative' {
    const negativeWords = ['处罚', '违规', '事故', '死亡', '纠纷', '投诉', '整改', '警告', '罚款', '通报'];
    const positiveWords = ['突破', '获奖', '先进', '成功', '创新', '首例', '标杆', '优秀', '表彰', '晋升'];

    const text = (title + ' ' + (content || '')).toLowerCase();
    const negCount = negativeWords.filter(w => text.includes(w)).length;
    const posCount = positiveWords.filter(w => text.includes(w)).length;

    if (negCount > posCount) return 'negative';
    if (posCount > negCount) return 'positive';
    return 'neutral';
  }

  protected generateId(source: string, title: string): string {
    const hash = Buffer.from(source + title).toString('base64').slice(0, 16);
    return `${source}_${hash}`;
  }
}
