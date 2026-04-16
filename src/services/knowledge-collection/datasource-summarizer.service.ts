/**
 * Data Source Summarizer Service
 * 数据源摘要生成服务 - 基于规则提取，无需LLM
 *
 * 核心功能：
 * 1. 基于关键词匹配进行分类
 * 2. 提取关键信息作为亮点
 * 3. 生成结构化摘要
 */

import { createLogger } from '../../utils/plugin-logger';
import type {
  CollectionSourceType,
  RawSourceMetadata,
} from '../../types/knowledge-collection.types';
import type {
  DataSourceSummaryEventData,
  SummarizerConfig,
} from '../../types/collection-progress.types';
import { DEFAULT_SUMMARIZER_CONFIG } from '../../types/collection-progress.types';

const logger = createLogger('REPSCLAW:COLLECTION:SUMMARIZER');

/**
 * 数据源摘要生成器
 */
export class DataSourceSummarizer {
  private config: SummarizerConfig;

  constructor(config: SummarizerConfig = DEFAULT_SUMMARIZER_CONFIG) {
    this.config = config;
  }

  /**
   * 生成数据源摘要
   */
  summarize(
    sourceType: CollectionSourceType,
    items: RawSourceMetadata[]
  ): DataSourceSummaryEventData {
    const startTime = Date.now();

    // 分类统计
    const categories = this.categorize(items);

    // 提取亮点
    const highlights = this.extractHighlights(items, categories);

    const summary: DataSourceSummaryEventData = {
      sourceType,
      count: items.length,
      highlights: highlights.slice(0, this.config.maxHighlights),
      categories: categories
        .map((cat) => ({
          category: cat.name,
          count: cat.items.length,
          items: cat.items.slice(0, this.config.maxItemsPerCategory).map((item) => item.title),
        }))
        .filter((cat) => cat.count > 0),
    };

    logger.debug('Summary generated', {
      sourceType,
      itemCount: items.length,
      categoryCount: categories.length,
      highlightCount: highlights.length,
      duration: Date.now() - startTime,
    });

    return summary;
  }

  /**
   * 分类条目
   */
  private categorize(
    items: RawSourceMetadata[]
  ): { name: string; items: RawSourceMetadata[] }[] {
    const categories: { name: string; items: RawSourceMetadata[] }[] = [];

    for (const [categoryName, keywords] of Object.entries(this.config.categoryKeywords)) {
      const matchedItems = items.filter((item) => {
        const text = `${item.title} ${item.departments?.join(' ') || ''} ${item.doctors?.join(' ') || ''}`.toLowerCase();
        return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
      });

      categories.push({
        name: categoryName,
        items: matchedItems,
      });
    }

    // 添加"其他"分类
    const categorizedItems = new Set(categories.flatMap((c) => c.items.map((i) => i.id)));
    const otherItems = items.filter((item) => !categorizedItems.has(item.id));

    if (otherItems.length > 0) {
      categories.push({
        name: '其他',
        items: otherItems,
      });
    }

    // 按数量排序
    return categories.sort((a, b) => b.items.length - a.items.length);
  }

  /**
   * 提取亮点
   */
  private extractHighlights(
    items: RawSourceMetadata[],
    categories: { name: string; items: RawSourceMetadata[] }[]
  ): string[] {
    const highlights: string[] = [];
    const usedItems = new Set<string>();

    // 1. 提取最新信息（按时间排序取前2条）
    const sortedByTime = [...items].sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dateB - dateA;
    });

    for (const item of sortedByTime.slice(0, 2)) {
      if (!usedItems.has(item.id)) {
        const highlight = this.formatHighlight(item, '最新');
        if (highlight) {
          highlights.push(highlight);
          usedItems.add(item.id);
        }
      }
    }

    // 2. 从主要分类中提取代表性条目
    for (const category of categories.slice(0, 3)) {
      if (highlights.length >= this.config.maxHighlights) break;

      const representativeItem = category.items.find((item) => !usedItems.has(item.id));
      if (representativeItem) {
        const highlight = this.formatHighlight(representativeItem, category.name);
        if (highlight) {
          highlights.push(highlight);
          usedItems.add(representativeItem.id);
        }
      }
    }

    // 3. 如果亮点不足，补充其他信息
    if (highlights.length < this.config.maxHighlights) {
      for (const item of items) {
        if (highlights.length >= this.config.maxHighlights) break;
        if (!usedItems.has(item.id)) {
          const highlight = this.formatHighlight(item, '相关');
          if (highlight) {
            highlights.push(highlight);
            usedItems.add(item.id);
          }
        }
      }
    }

    return highlights;
  }

  /**
   * 格式化亮点
   */
  private formatHighlight(item: RawSourceMetadata, context: string): string | null {
    // 清理标题
    let title = item.title.trim();

    // 去除常见前缀
    const prefixes = ['【', '[', '（', '('];
    for (const prefix of prefixes) {
      if (title.includes(prefix)) {
        const endChar = prefix === '【' ? '】' : prefix === '[' ? ']' : prefix === '（' ? '）' : ')';
        const endIndex = title.indexOf(endChar);
        if (endIndex > 0 && endIndex < 10) {
          title = title.substring(endIndex + 1).trim();
        }
      }
    }

    // 限制长度
    const maxLength = 50;
    if (title.length > maxLength) {
      title = title.substring(0, maxLength) + '...';
    }

    if (title.length < 5) {
      return null;
    }

    // 根据上下文格式化
    switch (context) {
      case '最新':
        return `📰 最新动态：${title}`;
      case '学术成果':
        return `🔬 学术成果：${title}`;
      case '媒体报道':
        return `📺 媒体报道：${title}`;
      case '荣誉奖项':
        return `🏆 荣誉奖项：${title}`;
      case '门诊信息':
        return `🏥 门诊信息：${title}`;
      case '科室动态':
        return `👥 科室动态：${title}`;
      case '社会公益':
        return `❤️ 社会公益：${title}`;
      default:
        return `• ${title}`;
    }
  }

  /**
   * 批量生成多个数据源的摘要
   */
  summarizeBatch(
    sourceResults: Map<CollectionSourceType, RawSourceMetadata[]>
  ): Map<CollectionSourceType, DataSourceSummaryEventData> {
    const summaries = new Map<CollectionSourceType, DataSourceSummaryEventData>();

    for (const [sourceType, items] of sourceResults.entries()) {
      if (items.length > 0) {
        const summary = this.summarize(sourceType, items);
        summaries.set(sourceType, summary);
      }
    }

    return summaries;
  }
}

// 导出单例
export const dataSourceSummarizer = new DataSourceSummarizer();
