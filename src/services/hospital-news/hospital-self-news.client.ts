import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  NewsSourceClient,
  NewsSourceType,
  NewsSearchParams,
  HospitalNewsItem,
} from '../../types/hospital-news.types';

/**
 * 医院自媒体/官网新闻客户端
 * 优先级：1（最高）
 */
export class HospitalSelfNewsClient extends NewsSourceClient {
  sourceType = NewsSourceType.HOSPITAL_SELF;
  priority = 1;

  // Top 100 医院官网映射表
  private hospitalUrlMap: Map<string, string> = new Map([
    ['北京协和医院', 'http://www.pumch.cn/news.html'],
    ['四川大学华西医院', 'https://www.wchscu.cn/news.html'],
    ['复旦大学附属中山医院', 'https://www.zs-hospital.sh.cn/news/'],
    ['上海交通大学医学院附属瑞金医院', 'https://www.rjh.com.cn/'],
    ['华中科技大学同济医学院附属同济医院', 'https://www.tjh.com.cn/'],
    ['中山大学附属第一医院', 'https://www.faith-hospital.org/'],
    ['浙江大学医学院附属第一医院', 'https://www.zy91.com/'],
    ['北京大学第一医院', 'http://www.bjmu.edu.cn/'],
    ['首都医科大学附属北京天坛医院', 'http://www.bjtth.org/'],
    ['复旦大学附属华山医院', 'https://www.huashan.org.cn/'],
    ['中南大学湘雅医院', 'https://www.xiangya.com.cn/'],
    ['中国医学科学院肿瘤医院', 'http://www.cicams.ac.cn/'],
    ['首都医科大学附属北京同仁医院', 'http://www.trhos.com/'],
    ['北京大学第三医院', 'http://www.puh3.net/'],
    ['中国医科大学附属第一医院', 'http://www.cmu.edu.cn/'],
    ['南方医科大学南方医院', 'http://www.nfyy.com/'],
    ['中国医学科学院阜外医院', 'http://www.fuwai.com/'],
    ['上海交通大学医学院附属仁济医院', 'https://www.renji.com/'],
    ['江苏省人民医院', 'http://www.jsph.org.cn/'],
    ['山东大学齐鲁医院', 'http://www.qiluhospital.com/'],
    ['南京鼓楼医院', 'http://www.njglyy.com/'],
    ['武汉大学人民医院', 'http://www.rmhospital.com/'],
    ['郑州大学第一附属医院', 'http://www.zdyfy.com/'],
    ['陆军军医大学第一附属医院（西南医院）', 'http://www.xnyy.cn/'],
    ['海军军医大学第一附属医院（长海医院）', 'http://www.chhospital.com.cn/'],
    ['空军军医大学第一附属医院（西京医院）', 'http://www.xijing hospital.com/'],
    ['广东省人民医院', 'http://www.e5413.com/'],
    ['哈尔滨医科大学附属第二医院', 'http://www.hrbmush.net/'],
    ['上海交通大学医学院附属第九人民医院', 'https://www.9hospital.com/'],
    ['中南大学湘雅二医院', 'https://www.xyeyy.com/'],
    ['天津医科大学总医院', 'http://www.tjmuh.com/'],
    ['哈尔滨医科大学附属第一医院', 'http://www.54hrbmu.edu.cn/'],
    ['重庆医科大学附属第一医院', 'http://www.cyhospital.com/'],
    ['浙江大学医学院附属第二医院', 'https://www.zy2h.com/'],
    ['上海交通大学医学院附属新华医院', 'https://www.xinhuamed.com.cn/'],
    ['首都医科大学宣武医院', 'http://www.xwhosp.com/'],
    ['吉林大学第一医院', 'http://www.jdyy.cn/'],
    ['上海市第六人民医院', 'https://www.6thhosp.com/'],
    ['山东省立医院', 'http://www.sph.com.cn/'],
    ['中日友好医院', 'http://www.zryhyy.com.cn/'],
    ['苏州大学附属第一医院', 'http://www.sdfyy.com/'],
    ['上海市肺科医院', 'https://www.shsfkyy.com/'],
    ['北京大学人民医院', 'http://www.pkuph.cn/'],
    ['首都医科大学附属北京安贞医院', 'http://www.anzhen.org/'],
    ['华中科技大学同济医学院附属协和医院', 'http://www.whuh.com/'],
    ['西安交通大学第一附属医院', 'http://www.dyyy.xjtu.edu.cn/'],
    ['中山大学肿瘤防治中心', 'http://www.sysucc.org/'],
    ['东南大学附属中大医院', 'http://www.njzdyy.com/'],
    ['北京大学肿瘤医院', 'http://www.bjcancer.org/'],
    ['重庆医科大学附属儿童医院', 'http://www.childrenhospital.cn/'],
  ]);

  private searchEngine: SearchEngineUrlResolver;

  constructor() {
    super();
    this.searchEngine = new SearchEngineUrlResolver();
  }

  async search(params: NewsSearchParams): Promise<HospitalNewsItem[]> {
    const { hospitalName, aliases, days, maxResults } = params;

    // 1. 获取医院官网URL
    const newsUrl = await this.getHospitalNewsUrl(hospitalName);
    if (!newsUrl) {
      return [];
    }

    try {
      // 2. 爬取新闻列表
      const response = await axios.get(newsUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const $ = cheerio.load(response.data);
      const newsItems: HospitalNewsItem[] = [];
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      // 3. 解析新闻列表（通用选择器，可能需要针对特定网站调整）
      const selectors = [
        'ul.news-list li', '.news-item', '.list-item', 'article', '.media',
        '.news-list .item', '.content-list li', '[class*="news"] li',
      ];

      for (const selector of selectors) {
        $(selector).each((_, element) => {
          if (newsItems.length >= maxResults) return false;

          const titleEl = $(element).find('a, h1, h2, h3, h4, .title');
          const title = titleEl.text().trim();
          const link = titleEl.attr('href') || $(element).find('a').attr('href');
          const dateEl = $(element).find('.date, .time, [class*="date"], [class*="time"]');
          let dateText = dateEl.text().trim();

          if (!title) return;

          // 检查是否包含医院名称或别名
          const allNames = [hospitalName, ...aliases];
          const containsHospital = allNames.some(name =>
            title.includes(name) || title.includes(name.replace('医院', ''))
          );

          // 如果标题不包含医院名，可能是通用新闻，相关性降低但仍保留
          const relevanceScore = containsHospital ? 100 : 60;

          // 解析日期
          let publishedAt: Date;
          if (dateText) {
            publishedAt = this.parseDate(dateText);
          } else {
            // 尝试从链接或文本中提取日期
            publishedAt = this.extractDateFromText(title + ' ' + link) || new Date();
          }

          // 过滤日期范围
          if (publishedAt < cutoffDate) return;

          const absoluteUrl = this.resolveUrl(link, newsUrl);

          newsItems.push({
            id: this.generateId('hospital_self', title),
            title,
            summary: $(element).find('.summary, .desc, p').text().trim().slice(0, 200),
            source: {
              name: `${hospitalName}官网`,
              type: NewsSourceType.HOSPITAL_SELF,
              url: newsUrl,
            },
            originalUrl: absoluteUrl || newsUrl,
            publishedAt: publishedAt.toISOString(),
            fetchedAt: new Date().toISOString(),
            relevanceScore,
            sentiment: this.analyzeSentiment(title),
            categories: this.categorize(title),
            verificationStatus: 'verified',
            hospitalMentions: allNames.filter(name => title.includes(name)),
          });
        });

        if (newsItems.length >= maxResults) break;
      }

      return newsItems.slice(0, maxResults);
    } catch (error) {
      console.error(`[HospitalSelfNewsClient] 爬取失败: ${newsUrl}`, error);
      return [];
    }
  }

  private async getHospitalNewsUrl(hospitalName: string): Promise<string | null> {
    // 1. 先查映射表
    const mappedUrl = this.hospitalUrlMap.get(hospitalName);
    if (mappedUrl) return mappedUrl;

    // 2. 尝试用别名查找
    for (const [name, url] of this.hospitalUrlMap) {
      if (hospitalName.includes(name) || name.includes(hospitalName)) {
        return url;
      }
    }

    // 3. 使用搜索引擎（非Top 100医院）
    return await this.searchEngine.findHospitalNewsUrl(hospitalName);
  }

  private parseDate(dateStr: string): Date {
    // 处理常见中文日期格式
    const patterns = [
      /(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/,
      /(\d{4})-(\d{2})-(\d{2})/,
      /(\d{2})-(\d{2})/,  // MM-DD，假设当年
    ];

    for (const pattern of patterns) {
      const match = dateStr.match(pattern);
      if (match) {
        if (match.length === 4) {
          return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
        } else if (match.length === 3) {
          const year = new Date().getFullYear();
          return new Date(year, parseInt(match[1]) - 1, parseInt(match[2]));
        }
      }
    }

    return new Date();
  }

  private extractDateFromText(text: string): Date | null {
    const match = text.match(/(\d{4})(\d{2})(\d{2})/);
    if (match) {
      return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    }
    return null;
  }

  private resolveUrl(url: string | undefined, baseUrl: string): string | null {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    const base = new URL(baseUrl);
    if (url.startsWith('/')) {
      return `${base.protocol}//${base.host}${url}`;
    }
    return `${baseUrl.replace(/\/$/, '')}/${url}`;
  }

  private categorize(title: string): string[] {
    const categories: string[] = [];
    const keywords: Record<string, string[]> = {
      '科研': ['科研', '研究', '论文', '成果', '课题', '基金', 'SCI', '专利'],
      '临床': ['手术', '治疗', '患者', '病例', '新技术', '新疗法'],
      '管理': ['管理', '改革', '制度', '流程', '服务'],
      '教学': ['教学', '培训', '进修', '研究生', '学生'],
      '人才': ['招聘', '引进', '专家', '院士', '人才'],
      '合作': ['合作', '联盟', '签约', '揭牌'],
      '荣誉': ['获奖', '表彰', '荣誉', '先进'],
    };

    for (const [category, words] of Object.entries(keywords)) {
      if (words.some(w => title.includes(w))) {
        categories.push(category);
      }
    }

    return categories.length > 0 ? categories : ['综合'];
  }
}

/**
 * 搜索引擎URL解析器（用于非Top 100医院）
 */
class SearchEngineUrlResolver {
  async findHospitalNewsUrl(hospitalName: string): Promise<string | null> {
    // 构造搜索查询
    const query = encodeURIComponent(`${hospitalName} 官网 新闻`);

    // 尝试使用百度搜索（实际实现可能需要代理或第三方服务）
    // 这里提供一个简化实现
    const possibleUrls = [
      `http://www.${this.pinyin(hospitalName)}.com`,
      `http://www.${this.pinyin(hospitalName)}.cn`,
      `http://${this.pinyin(hospitalName)}.com`,
    ];

    for (const url of possibleUrls) {
      try {
        const response = await axios.head(url, {
          timeout: 5000,
          validateStatus: () => true,
        });
        if (response.status < 400) {
          // 尝试找新闻页面
          const newsUrl = await this.findNewsPage(url);
          if (newsUrl) return newsUrl;
          return url;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private async findNewsPage(baseUrl: string): Promise<string | null> {
    const newsPaths = ['/news', '/news.html', '/xw', '/xwzx', '/article'];

    for (const path of newsPaths) {
      try {
        const url = `${baseUrl.replace(/\/$/, '')}${path}`;
        const response = await axios.head(url, {
          timeout: 3000,
          validateStatus: () => true,
        });
        if (response.status < 400) {
          return url;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private pinyin(chinese: string): string {
    // 简化版拼音转换（实际应用应使用pinyin库）
    // 这里仅作占位，实际实现需要引入pinyin库
    return chinese
      .replace(/医院/g, 'yy')
      .replace(/大学/g, 'dx')
      .replace(/附属/g, 'fs')
      .replace(/第./g, 'd')
      .replace(/[省市]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }
}
