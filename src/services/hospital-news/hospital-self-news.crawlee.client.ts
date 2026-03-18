import {
  CheerioCrawler,
  RequestQueue,
  CheerioCrawlingContext,
} from 'crawlee';
import {
  NewsSourceClient,
  NewsSourceType,
  NewsSearchParams,
  HospitalNewsItem,
} from '../../types/hospital-news.types';
import { createLogger } from '../../utils/plugin-logger';

const logger = createLogger('REPSCLAW:HOSPITAL-NEWS');

/**
 * 医院自媒体/官网新闻客户端 (Crawlee 版本)
 * 优先级：1（最高）
 * 特点：
 * - 使用 Crawlee 的 CheerioCrawler 进行爬取
 * - 自动会话轮换和浏览器指纹伪装
 * - 智能重试机制，绕过简单反爬
 */
export class HospitalSelfNewsClient extends NewsSourceClient {
  sourceType = NewsSourceType.HOSPITAL_SELF;
  priority = 1;

  // Top 100 医院官网映射表（更新后的 URL）
  private hospitalUrlMap: Map<string, string> = new Map([
    ['北京协和医院', 'https://www.pumch.cn/xwzx/xwdt/'],
    ['四川大学华西医院', 'https://www.wchscu.cn/Home/NewsList'],
    ['复旦大学附属中山医院', 'https://www.zs-hospital.sh.cn/news/'],
    ['上海交通大学医学院附属瑞金医院', 'https://www.rjh.com.cn/xwzx/yydt/'],
    ['华中科技大学同济医学院附属同济医院', 'https://www.tjh.com.cn/xwzx/xwdt/'],
    ['中山大学附属第一医院', 'https://www.faith-hospital.org/xwzx/'],
    ['浙江大学医学院附属第一医院', 'https://www.zy91.com/xwzx/xwdt/'],
    ['北京大学第一医院', 'https://www.pkufh.com/xwzx/'],
    ['首都医科大学附属北京天坛医院', 'https://www.bjtth.org/xwzx/yydt/'],
    ['复旦大学附属华山医院', 'https://www.huashan.org.cn/xwzx/'],
    ['中南大学湘雅医院', 'https://www.xiangya.com.cn/xwzx/'],
    ['中国医学科学院肿瘤医院', 'https://www.cicams.ac.cn/xwzx/'],
    ['首都医科大学附属北京同仁医院', 'https://www.trhos.com/xwzx/'],
    ['北京大学第三医院', 'https://www.puh3.net/xwzx/'],
    ['中国医科大学附属第一医院', 'https://www.cmu1h.com/xwzx/'],
    ['南方医科大学南方医院', 'https://www.nfyy.com/xwzx/'],
    ['中国医学科学院阜外医院', 'https://www.fuwai.com/xwzx/'],
    ['上海交通大学医学院附属仁济医院', 'https://www.renji.com/xwzx/'],
    ['江苏省人民医院', 'https://www.jsph.org.cn/xwzx/'],
    ['山东大学齐鲁医院', 'https://www.qiluhospital.com/xwzx/'],
    ['南京鼓楼医院', 'https://www.njglyy.com/xwzx/'],
    ['武汉大学人民医院', 'https://www.rmhospital.com/xwzx/'],
    ['郑州大学第一附属医院', 'https://www.zdyfy.com/xwzx/'],
    ['陆军军医大学第一附属医院（西南医院）', 'https://www.xnyy.cn/xwzx/'],
    ['海军军医大学第一附属医院（长海医院）', 'https://www.chhospital.com.cn/xwzx/'],
    ['空军军医大学第一附属医院（西京医院）', 'https://www.xijinghospital.com/xwzx/'],
    ['广东省人民医院', 'https://www.e5413.com/xwzx/'],
    ['哈尔滨医科大学附属第二医院', 'https://www.hrbmush.net/xwzx/'],
    ['上海交通大学医学院附属第九人民医院', 'https://www.9hospital.com/xwzx/'],
    ['中南大学湘雅二医院', 'https://www.xyeyy.com/xwzx/'],
    ['天津医科大学总医院', 'https://www.tjmuh.com/xwzx/'],
    ['哈尔滨医科大学附属第一医院', 'https://www.hrbmuedu.com/xwzx/'],
    ['重庆医科大学附属第一医院', 'https://www.cyhospital.com/xwzx/'],
    ['浙江大学医学院附属第二医院', 'https://www.zy2h.com/xwzx/'],
    ['上海交通大学医学院附属新华医院', 'https://www.xinhuamed.com.cn/xwzx/'],
    ['首都医科大学宣武医院', 'https://www.xwhosp.com/xwzx/'],
    ['吉林大学第一医院', 'https://www.jdyy.cn/xwzx/'],
    ['上海市第六人民医院', 'https://www.6thhosp.com/xwzx/'],
    ['山东省立医院', 'https://www.sph.com.cn/xwzx/'],
    ['中日友好医院', 'https://www.zryhyy.com.cn/xwzx/'],
    ['苏州大学附属第一医院', 'https://www.sdfyy.com/xwzx/'],
    ['上海市肺科医院', 'https://www.shsfkyy.com/xwzx/'],
    ['北京大学人民医院', 'https://www.pkuph.cn/xwzx/'],
    ['首都医科大学附属北京安贞医院', 'https://www.anzhen.org/xwzx/'],
    ['华中科技大学同济医学院附属协和医院', 'https://www.whuh.com/xwzx/'],
    ['西安交通大学第一附属医院', 'https://www.dyyy.xjtu.edu.cn/xwzx/'],
    ['中山大学肿瘤防治中心', 'https://www.sysucc.org/xwzx/'],
    ['东南大学附属中大医院', 'https://www.njzdyy.com/xwzx/'],
    ['北京大学肿瘤医院', 'https://www.bjcancer.org/xwzx/'],
    ['重庆医科大学附属儿童医院', 'https://www.childrenhospital.cn/xwzx/'],
  ]);

  async search(params: NewsSearchParams): Promise<HospitalNewsItem[]> {
    const { hospitalName, aliases, days, maxResults } = params;

    // 1. 获取医院官网URL
    const newsUrl = this.getHospitalNewsUrl(hospitalName);
    if (!newsUrl) {
      logger.warn(`[HospitalSelfNewsClient] 未找到医院 URL: ${hospitalName}`);
      return [];
    }

    logger.info(`[HospitalSelfNewsClient] 开始爬取: ${hospitalName}`, { url: newsUrl });

    try {
      // 2. 使用 Crawlee 爬取新闻列表
      const items = await this.crawlNewsList(newsUrl, hospitalName, aliases, days, maxResults);

      logger.info(`[HospitalSelfNewsClient] 爬取完成: ${hospitalName}`, {
        found: items.length,
      });

      return items;
    } catch (error) {
      logger.error(`[HospitalSelfNewsClient] 爬取失败: ${newsUrl}`, error);
      return [];
    }
  }

  /**
   * 使用 Crawlee 爬取新闻列表
   */
  private async crawlNewsList(
    newsUrl: string,
    hospitalName: string,
    aliases: string[],
    days: number,
    maxResults: number
  ): Promise<HospitalNewsItem[]> {
    const newsItems: HospitalNewsItem[] = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const allNames = [hospitalName, ...aliases];

    // 创建请求队列
    const requestQueue = await RequestQueue.open(`hospital-news-${Date.now()}`);
    await requestQueue.addRequest({ url: newsUrl });

    // 配置 Crawlee 爬虫
    const crawler = new CheerioCrawler({
      requestQueue,

      // 限制
      maxRequestsPerCrawl: 1, // 只爬取入口页

      // 会话和反爬配置
      useSessionPool: true,
      sessionPoolOptions: {
        maxPoolSize: 5,
        sessionOptions: {
          maxUsageCount: 10,
        },
      },

      // 浏览器指纹伪装
      headerGeneratorOptions: {
        browsers: ['chrome', 'firefox'],
        devices: ['desktop'],
        locales: ['zh-CN'],
        operatingSystems: ['windows', 'macos'],
      },

      // 错误处理
      maxRequestRetries: 3,
      retryOnBlocked: true,

      // 请求处理器
      requestHandler: async ({ request, $, response }: CheerioCrawlingContext) => {
        logger.debug(`[Crawlee] 处理医院新闻页: ${request.url}`);

        if (response.statusCode !== 200) {
          logger.warn(`[Crawlee] 页面返回非 200 状态: ${request.url} = ${response.statusCode}`);
          return;
        }

        // 移除脚本和样式
        $('script, style, nav, footer').remove();

        // 尝试多种选择器找到新闻列表
        const selectors = [
          'ul.news-list li',
          '.news-item',
          '.list-item',
          'article',
          '.media',
          '.news-list .item',
          '.content-list li',
          '[class*="news"] li',
          'ul li',
        ];

        for (const selector of selectors) {
          $(selector).each((_, element) => {
            if (newsItems.length >= maxResults) return false;

            const titleEl = $(element).find('a, h1, h2, h3, h4, .title').first();
            const title = titleEl.text().trim();
            const link = titleEl.attr('href') || $(element).find('a').attr('href');
            const dateEl = $(element).find('.date, .time, [class*="date"], [class*="time"]');
            let dateText = dateEl.first().text().trim();

            if (!title) return;

            // 检查是否包含医院名称或别名
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
              summary: $(element).find('.summary, .desc, p').first().text().trim().slice(0, 200),
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
      },

      // 失败处理器
      failedRequestHandler({ request }, error: Error) {
        logger.error(`[Crawlee] 医院新闻请求失败: ${request.url}`, error);
      },
    }, this.config);

    // 运行爬虫
    await crawler.run();

    // 清理队列
    await requestQueue.drop();

    return newsItems.slice(0, maxResults);
  }

  private getHospitalNewsUrl(hospitalName: string): string | null {
    // 1. 先查映射表
    const mappedUrl = this.hospitalUrlMap.get(hospitalName);
    if (mappedUrl) return mappedUrl;

    // 2. 尝试用别名查找
    for (const [name, url] of this.hospitalUrlMap) {
      if (hospitalName.includes(name) || name.includes(hospitalName)) {
        return url;
      }
    }

    // 3. 尝试构造 URL
    const pinyin = this.toPinyin(hospitalName);
    return `https://www.${pinyin}.com/xwzx/`;
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

  private toPinyin(chinese: string): string {
    // 简化版拼音转换
    return chinese
      .replace(/医院/g, 'yy')
      .replace(/大学/g, 'dx')
      .replace(/附属/g, 'fs')
      .replace(/第./g, 'd')
      .replace(/[省市]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
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
