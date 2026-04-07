import { CircuitBreaker } from '../utils/circuit-breaker';

/**
 * 医院全网消息查询 - 类型定义
 */

// ===== 来源类型 =====
export enum NewsSourceType {
  HOSPITAL_SELF = 'hospital_self',  // 医院自媒体/官网
  OFFICIAL = 'official',            // 官方政务
  MAINSTREAM = 'mainstream',        // 主流媒体
  BAIDU_SEARCH = 'baidu_search',    // 百度搜索
  WECHAT_SEARCH = 'wechat_search',  // 搜狗微信搜索
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
  incremental?: boolean;      // 是否增量更新
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
  departments?: string[];
  doctors?: string[];
  incremental?: boolean;
  lastQueryAt?: string;
  includeContent?: boolean; // 是否包含文章正文内容（仅微信搜索支持），默认 false
}

export abstract class NewsSourceClient {
  abstract readonly sourceType: NewsSourceType;
  abstract readonly priority: number;

  protected circuitBreaker = new CircuitBreaker({
    name: this.constructor.name,
    failureThreshold: 3,
    timeout: 60000,
  });

  abstract search(params: NewsSearchParams): Promise<HospitalNewsItem[]>;

  /**
   * 带熔断保护的查询
   */
  async searchWithBreaker(params: NewsSearchParams): Promise<HospitalNewsItem[]> {
    try {
      return await this.circuitBreaker.execute(() => this.search(params));
    } catch (error) {
      if (error instanceof Error && error.name === 'CircuitOpenError') {
        // 熔断时返回空数组，不阻断其他数据源
        return [];
      }
      throw error;
    }
  }

  /**
   * 科室过滤 - 检查内容是否匹配订阅的科室
   */
  protected matchesDepartments(
    title: string,
    content: string | undefined,
    departments: string[] | undefined
  ): boolean {
    if (!departments || departments.length === 0) {
      return true; // 无科室限制，全部通过
    }

    const text = (title + ' ' + (content || '')).toLowerCase();

    // 科室关键词映射
    const deptKeywords: Record<string, string[]> = {
      '心内科': ['心内科', '心血管', '心脏科', '冠心病', '心律失常', '心衰'],
      '心外科': ['心外科', '心脏外科', '冠脉搭桥', '瓣膜'],
      '神经内科': ['神经内科', '脑血管', '脑卒中', '癫痫', '帕金森'],
      '神经外科': ['神经外科', '脑外科', '脑肿瘤', '脑血管畸形'],
      '消化内科': ['消化内科', '胃肠', '肝胆', '胰腺', '内镜'],
      '普外科': ['普外科', '胃肠外科', '肝胆外科', '甲状腺'],
      '呼吸内科': ['呼吸内科', '肺科', '哮喘', '慢阻肺', '肺癌'],
      '胸外科': ['胸外科', '肺部手术', '食管', '纵隔'],
      '肾内科': ['肾内科', '透析', '尿毒症', '肾炎'],
      '泌尿外科': ['泌尿外科', '泌尿外', '前列腺', '肾结石'],
      '内分泌科': ['内分泌', '糖尿病', '甲状腺', '肥胖', '代谢'],
      '血液科': ['血液科', '白血病', '淋巴瘤', '贫血', '骨髓'],
      '肿瘤科': ['肿瘤科', '化疗', '放疗', '靶向', '免疫治疗'],
      '骨科': ['骨科', '关节', '脊柱', '骨折', '运动医学'],
      '皮肤科': ['皮肤科', '皮肤病', '银屑病', '白癜风'],
      '眼科': ['眼科', '白内障', '青光眼', '视网膜'],
      '耳鼻喉': ['耳鼻喉', '听力', '鼻炎', '喉癌'],
      '口腔科': ['口腔科', '牙科', '正畸', '种植'],
      '妇产科': ['妇产科', '妇科', '产科', '分娩', '不孕不育'],
      '儿科': ['儿科', '小儿', '新生儿', '儿童'],
      '急诊科': ['急诊科', '急救', '创伤', '中毒'],
      'ICU': ['ICU', '重症', '监护室', '危重症'],
      '感染科': ['感染科', '传染病', '肝炎', '结核', '艾滋病'],
      '精神科': ['精神科', '心理科', '抑郁', '焦虑', '精神分裂'],
      '康复科': ['康复科', '理疗', '针灸', '推拿'],
      '影像科': ['影像科', '放射科', 'CT', 'MRI', '超声'],
      '检验科': ['检验科', '化验', '病理', '基因检测'],
      '麻醉科': ['麻醉科', '镇痛', '无痛'],
    };

    // 检查是否匹配任一科室
    return departments.some(dept => {
      const keywords = deptKeywords[dept] || [dept];
      return keywords.some(kw => text.includes(kw.toLowerCase()));
    });
  }

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
