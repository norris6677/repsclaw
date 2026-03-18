import { createLogger } from './plugin-logger';

const resolverLogger = createLogger('REPSCLAW:RESOLVER');

/**
 * 医院名称解析器
 * 支持别名匹配、模糊查找和名称规范化
 */

export interface HospitalMatch {
  name: string;
  score: number; // 匹配分数 0-1
  matchType: 'exact' | 'contains' | 'fuzzy' | 'alias';
}

export interface ResolvedHospital {
  name: string;
  aliases: string[];
  isAlias: boolean;
}

// Top 100 医院列表（简化版，实际需要完整列表）
const TOP_HOSPITALS: Array<{ name: string; aliases: string[] }> = [
  { name: '北京协和医院', aliases: ['协和医院', '协和'] },
  { name: '四川大学华西医院', aliases: ['华西医院', '华西', '四川华西'] },
  { name: '复旦大学附属中山医院', aliases: ['中山医院', '上海中山医院'] },
  { name: '上海交通大学医学院附属瑞金医院', aliases: ['瑞金医院', '上海瑞金'] },
  { name: '华中科技大学同济医学院附属同济医院', aliases: ['同济医院', '武汉同济'] },
  { name: '中山大学附属第一医院', aliases: ['中山一院', '广州中山一院'] },
  { name: '浙江大学医学院附属第一医院', aliases: ['浙大一院', '浙江一院'] },
  { name: '北京大学第一医院', aliases: ['北大一院'] },
  { name: '首都医科大学附属北京天坛医院', aliases: ['天坛医院', '北京天坛'] },
  { name: '复旦大学附属华山医院', aliases: ['华山医院', '上海华山'] },
  { name: '中南大学湘雅医院', aliases: ['湘雅医院', '湘雅'] },
  { name: '中国医学科学院肿瘤医院', aliases: ['肿瘤医院', '医科院肿瘤医院'] },
  { name: '首都医科大学附属北京同仁医院', aliases: ['同仁医院', '北京同仁'] },
  { name: '北京大学第三医院', aliases: ['北医三院', '北大三院'] },
  { name: '中国医科大学附属第一医院', aliases: ['中国医大一院', '沈阳医大一院'] },
  { name: '南方医科大学南方医院', aliases: ['南方医院', '广州南方医院'] },
  { name: '中国医学科学院阜外医院', aliases: ['阜外医院', '北京阜外'] },
  { name: '上海交通大学医学院附属仁济医院', aliases: ['仁济医院', '上海仁济'] },
  { name: '江苏省人民医院', aliases: ['南京省人民'] },
  { name: '山东大学齐鲁医院', aliases: ['齐鲁医院', '济南齐鲁'] },
  { name: '南京鼓楼医院', aliases: ['鼓楼医院'] },
  { name: '武汉大学人民医院', aliases: ['湖北省人民'] },
  { name: '郑州大学第一附属医院', aliases: ['郑大一附院'] },
  { name: '陆军军医大学第一附属医院', aliases: ['西南医院', '重庆西南'] },
  { name: '海军军医大学第一附属医院', aliases: ['长海医院', '上海长海'] },
  { name: '空军军医大学第一附属医院', aliases: ['西京医院', '西安西京'] },
  { name: '广东省人民医院', aliases: ['广东省人民'] },
  { name: '哈尔滨医科大学附属第二医院', aliases: ['哈医大二院'] },
  { name: '上海交通大学医学院附属第九人民医院', aliases: ['上海九院', '九院'] },
  { name: '中南大学湘雅二医院', aliases: ['湘雅二院', '湘雅附二'] },
];

export class HospitalNameResolver {
  private hospitals: Array<{ name: string; aliases: string[] }>;

  constructor() {
    this.hospitals = TOP_HOSPITALS;
  }

  /**
   * 解析医院名称
   * 返回标准名称和别名列表
   */
  resolve(input: string): ResolvedHospital | null {
    // 1. 精确匹配
    for (const hospital of this.hospitals) {
      if (this.normalize(hospital.name) === this.normalize(input)) {
        return { name: hospital.name, aliases: hospital.aliases, isAlias: false };
      }
      for (const alias of hospital.aliases) {
        if (this.normalize(alias) === this.normalize(input)) {
          return { name: hospital.name, aliases: hospital.aliases, isAlias: true };
        }
      }
    }

    // 2. 包含匹配
    for (const hospital of this.hospitals) {
      if (this.normalize(hospital.name).includes(this.normalize(input)) ||
          this.normalize(input).includes(this.normalize(hospital.name))) {
        return { name: hospital.name, aliases: hospital.aliases, isAlias: true };
      }
    }

    // 3. 模糊匹配
    let bestMatch: { hospital: typeof this.hospitals[0]; score: number } | null = null;
    let bestScore = 0;

    for (const hospital of this.hospitals) {
      const score = this.calculateSimilarity(
        this.normalize(input),
        this.normalize(hospital.name)
      );
      if (score > bestScore && score > 0.7) {
        bestScore = score;
        bestMatch = { hospital, score };
      }
    }

    if (bestMatch) {
      return {
        name: bestMatch.hospital.name,
        aliases: bestMatch.hospital.aliases,
        isAlias: true,
      };
    }

    // 4. 未找到，但尝试返回原名称（让后续流程处理）
    return null;
  }

  /**
   * 规范化医院名称
   */
  private normalize(name: string): string {
    return name
      .toLowerCase()
      .replace(/[\s,，.。!！?？]/g, '')
      .replace(/大学附属/g, '')
      .replace(/附属/g, '');
  }

  /**
   * 计算字符串相似度（Levenshtein 距离）
   */
  private calculateSimilarity(s1: string, s2: string): number {
    const len1 = s1.length;
    const len2 = s2.length;

    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const maxLen = Math.max(len1, len2);
    return 1 - matrix[len1][len2] / maxLen;
  }

  // ===== 静态方法（保持向后兼容） =====
  /**
   * 查找医院（支持别名和模糊匹配）
   */
  static findHospital(input: string, candidates: string[]): HospitalMatch | null {
    resolverLogger.debug('findHospital called', { input, candidates });

    if (!input || candidates.length === 0) {
      resolverLogger.debug('findHospital - empty input or candidates');
      return null;
    }

    const normalizedInput = this.normalize(input);
    resolverLogger.debug('findHospital - normalized input', { normalizedInput });

    // 1. 精确匹配
    for (const candidate of candidates) {
      if (this.normalize(candidate) === normalizedInput) {
        resolverLogger.debug('findHospital - exact match found', { candidate });
        return { name: candidate, score: 1.0, matchType: 'exact' };
      }
    }

    // 2. 包含匹配（双向）
    for (const candidate of candidates) {
      const normalizedCandidate = this.normalize(candidate);
      if (normalizedCandidate.includes(normalizedInput) ||
          normalizedInput.includes(normalizedCandidate)) {
        resolverLogger.debug('findHospital - contains match found', { candidate });
        return { name: candidate, score: 0.9, matchType: 'contains' };
      }
    }

    // 3. 别名匹配 - 提取关键部分
    for (const candidate of candidates) {
      if (this.isAliasMatch(input, candidate)) {
        resolverLogger.debug('findHospital - alias match found', { candidate });
        return { name: candidate, score: 0.85, matchType: 'alias' };
      }
    }

    // 4. 模糊匹配 - 编辑距离
    let bestMatch: HospitalMatch | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const normalizedCandidate = this.normalize(candidate);
      const score = this.calculateSimilarity(normalizedInput, normalizedCandidate);
      resolverLogger.debug('findHospital - similarity check', { candidate, normalizedCandidate, score });
      if (score > bestScore && score > 0.6) {
        bestScore = score;
        bestMatch = { name: candidate, score, matchType: 'fuzzy' };
      }
    }

    if (bestMatch) {
      resolverLogger.debug('findHospital - fuzzy match found', bestMatch);
    } else {
      resolverLogger.debug('findHospital - no match found');
    }

    return bestMatch;
  }

  /**
   * 检查是否是别名匹配
   * 例如："华山医院" 匹配 "上海华山医院"
   * 注意：排除过于通用的匹配（如 "医院A" 和 "医院B" 不应匹配）
   */
  private static isAliasMatch(input: string, candidate: string): boolean {
    // 特殊处理：医院A/B/C/D模式 - 必须有明确的区分标识
    const letterPattern = /医院([A-D])$/;
    const inputLetter = input.match(letterPattern);
    const candidateLetter = candidate.match(letterPattern);

    if (inputLetter && candidateLetter) {
      // 如果都有字母后缀，必须相同
      return inputLetter[1] === candidateLetter[1];
    }

    const inputParts = this.extractKeyParts(input);
    const candidateParts = this.extractKeyParts(candidate);

    // 检查输入的关键部分是否都在候选中（排除过于通用的"医院"）
    for (const part of inputParts) {
      // 跳过过于通用的部分
      if (part === '医院' || part.length < 2) continue;

      // 检查是否有非通用的关键部分匹配
      for (const cp of candidateParts) {
        if (cp === '医院' || cp.length < 2) continue;
        if (cp.includes(part) || part.includes(cp)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 提取名称关键部分
   */
  private static extractKeyParts(name: string): string[] {
    const normalized = this.normalize(name);

    // 常见医院名称模式
    const patterns = [
      /([\u4e00-\u9fa5]{2,4}协和[\u4e00-\u9fa5]{0,4})/,
      /([\u4e00-\u9fa5]{2,4}华山[\u4e00-\u9fa5]{0,4})/,
      /([\u4e00-\u9fa5]{2,4}中山[\u4e00-\u9fa5]{0,4})/,
      /([\u4e00-\u9fa5]{2,4}人民[\u4e00-\u9fa5]{0,4})/,
      /([\u4e00-\u9fa5]{2,4}儿童[\u4e00-\u9fa5]{0,4})/,
      /([\u4e00-\u9fa5]{2,4}肿瘤[\u4e00-\u9fa5]{0,4})/,
      /([\u4e00-\u9fa5]{2,4}妇产[\u4e00-\u9fa5]{0,4})/,
      /([\u4e00-\u9fa5]{2,6}医院)/,
    ];

    const parts: string[] = [];
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) {
        parts.push(match[1] || match[0]);
      }
    }

    // 如果没有匹配到模式，按字拆分
    if (parts.length === 0) {
      for (let i = 0; i < normalized.length - 1; i++) {
        parts.push(normalized.substring(i, i + 2));
      }
    }

    return parts;
  }

  /**
   * 规范化医院名称
   */
  static normalize(name: string): string {
    return name
      .toLowerCase()
      .replace(/[\s,，.。!！?？]/g, '')
      .replace(/大学附属/g, '')
      .replace(/附属/g, '');
  }

  /**
   * 计算字符串相似度（Levenshtein 距离）
   */
  private static calculateSimilarity(s1: string, s2: string): number {
    const len1 = s1.length;
    const len2 = s2.length;

    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // 删除
          matrix[i][j - 1] + 1,      // 插入
          matrix[i - 1][j - 1] + cost // 替换
        );
      }
    }

    const maxLen = Math.max(len1, len2);
    return 1 - matrix[len1][len2] / maxLen;
  }

  /**
   * 从用户输入中提取医院名称
   */
  static extractFromInput(input: string, intent: string): string {
    // 根据意图移除关键词
    const keywords: Record<string, string[]> = {
      subscribe: ['订阅', '添加', '关注', '加入', '我想', '我要', '再帮我', '给我', '加上', '关注下', '添加一下'],
      unsubscribe: ['取消订阅', '删除', '移除', '退订', '不再关注', '取消关注', '删掉', '去除', '移除关注', '不想关注了'],
      'set-primary': ['设置', '设为', '改成', '把', '设成', '设为主要', '设为默认', '主要医院', '默认医院', '我的', '为', '成', '默认用', '优先', '主用', '常用'],
      list: ['列表', '查看', '我的医院', '显示', '有哪些', '给我看看', '都有哪些'],
    };

    let cleaned = input;
    const words = keywords[intent] || [];

    // 按长度降序排序，避免部分匹配问题
    const sortedWords = [...words].sort((a, b) => b.length - a.length);

    for (const word of sortedWords) {
      cleaned = cleaned.split(word).join('');
    }

    // 清理其他常见词
    cleaned = cleaned.replace(/主要的|一下|了|吧/g, '').trim();

    // 尝试匹配标准医院名称模式
    const patterns = [
      /北京协和医院/,
      /上海华山医院/,
      /广州中山医院/,
      /([\u4e00-\u9fa5]{2,6}协和[\u4e00-\u9fa5]{0,4}医院)/,
      /([\u4e00-\u9fa5]{2,6}华山[\u4e00-\u9fa5]{0,4}医院)/,
      /([\u4e00-\u9fa5]{2,6}中山[\u4e00-\u9fa5]{0,4}医院)/,
      /([\u4e00-\u9fa5]{2,6}人民[\u4e00-\u9fa5]{0,4}医院)/,
      /([\u4e00-\u9fa5]{2,20}医院)/,
    ];

    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }

    return cleaned.replace(/[，。！？\s]+/g, '').trim() || input.trim();
  }
}
