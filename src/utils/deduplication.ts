/**
 * Deduplication Utilities
 * URL + 标题哈希双重去重机制
 */

import * as crypto from 'crypto';
import type { DuplicateCheckResult, RawSourceMetadata } from '../types/knowledge-collection.types';

/**
 * 标准化 URL（移除跟踪参数、统一格式）
 */
export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // 移除常见跟踪参数
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'from', 'source', 'referrer', 'ref', 'spm', 'timestamp', '_t',
    ];

    trackingParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });

    // 统一协议为 https
    if (urlObj.protocol === 'http:') {
      urlObj.protocol = 'https:';
    }

    // 移除末尾斜杠
    let pathname = urlObj.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    urlObj.pathname = pathname;

    // 排序查询参数（确保顺序一致）
    const sortedParams = new URLSearchParams();
    const keys = Array.from(urlObj.searchParams.keys()).sort();
    keys.forEach(key => {
      const values = urlObj.searchParams.getAll(key);
      values.forEach(value => sortedParams.append(key, value));
    });
    urlObj.search = sortedParams.toString();

    return urlObj.toString().toLowerCase();
  } catch {
    // URL 解析失败，返回原值的小写形式
    return url.toLowerCase().trim();
  }
}

/**
 * 计算 URL 哈希
 */
export function hashUrl(url: string): string {
  const normalized = normalizeUrl(url);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * 标准化标题（移除多余空格、统一标点）
 */
export function normalizeTitle(title: string): string {
  // 确保 title 是字符串
  if (typeof title !== 'string') {
    return '';
  }
  return title
    .toLowerCase()
    .replace(/[\uff0c\uff0e\uff1b\uff1a\uff1f\uff01]/g, ' ') // 全角标点转空格
    .replace(/[\u3000]/g, ' ')               // 全角空格转普通空格
    .replace(/\s+/g, ' ')                    // 多空格变单空格
    .replace(/[^\w\u4e00-\u9fa5\s]/g, '')    // 只保留字母数字中文和空格
    .trim();
}

/**
 * 计算标题哈希
 */
export function hashTitle(title: string): string {
  const normalized = normalizeTitle(title);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * 计算内容哈希（用于内容级去重）
 */
export function hashContent(content: string): string {
  // 提取纯文本（移除 HTML 标签）
  const text = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * 计算 Levenshtein 距离（编辑距离）
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,  // 替换
          matrix[i][j - 1] + 1,      // 插入
          matrix[i - 1][j] + 1       // 删除
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * 计算字符串相似度（0-1，1为完全相同）
 */
export function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);

  if (maxLength === 0) return 1;

  return 1 - distance / maxLength;
}

/**
 * 去重检查器类
 */
export class DeduplicationChecker {
  private urlIndex: Map<string, RawSourceMetadata> = new Map();
  private titleIndex: Map<string, RawSourceMetadata> = new Map();

  /**
   * 添加已存在的源到索引
   */
  addExistingSource(source: RawSourceMetadata): void {
    this.urlIndex.set(source.urlHash, source);
    this.titleIndex.set(source.titleHash, source);
  }

  /**
   * 批量添加已存在源
   */
  addExistingSources(sources: RawSourceMetadata[]): void {
    sources.forEach(source => this.addExistingSource(source));
  }

  /**
   * 检查是否重复
   */
  checkDuplicate(
    url: string,
    title: string
  ): DuplicateCheckResult {
    const urlHash = hashUrl(url);
    const titleHash = hashTitle(title);

    // 第一层：URL 精确匹配
    const existingByUrl = this.urlIndex.get(urlHash);
    if (existingByUrl) {
      return {
        isDuplicate: true,
        duplicateType: 'url',
        existingSource: existingByUrl,
        similarityScore: 1,
      };
    }

    // 第二层：标题哈希匹配
    const existingByTitle = this.titleIndex.get(titleHash);
    if (existingByTitle) {
      return {
        isDuplicate: true,
        duplicateType: 'title',
        existingSource: existingByTitle,
        similarityScore: 1,
      };
    }

    // 第三层：标题相似度检测（编辑距离）
    const normalizedTitle = normalizeTitle(title);
    for (const [_, existing] of this.titleIndex) {
      const existingTitle = normalizeTitle(existing.title);
      const similarity = calculateSimilarity(normalizedTitle, existingTitle);

      if (similarity >= 0.9) {  // 90% 相似度阈值
        return {
          isDuplicate: true,
          duplicateType: 'title',
          existingSource: existing,
          similarityScore: similarity,
        };
      }
    }

    return { isDuplicate: false };
  }

  /**
   * 添加新源到索引（用于增量更新索引）
   */
  addNewSource(source: RawSourceMetadata): void {
    this.addExistingSource(source);
  }

  /**
   * 清空索引
   */
  clear(): void {
    this.urlIndex.clear();
    this.titleIndex.clear();
  }

  /**
   * 获取索引统计
   */
  getStats(): { urls: number; titles: number } {
    return {
      urls: this.urlIndex.size,
      titles: this.titleIndex.size,
    };
  }
}

/**
 * 从文件内容提取唯一标识
 */
export function extractSourceId(url: string, title: string): string {
  const data = `${normalizeUrl(url)}|${normalizeTitle(title)}`;
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}