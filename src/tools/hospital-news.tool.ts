import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../utils/plugin-logger';
import { HospitalNewsService } from '../services/hospital-news/hospital-news.service';
import { NewsSourceType } from '../types/hospital-news.types';

const toolLogger = createLogger('REPSCLAW:TOOL');

// ========== 参数定义 ==========
export const GetHospitalNewsParametersSchema = z.object({
  hospitalName: z.string().min(1).describe('医院名称 / Hospital name（支持别名）'),
  sources: z.array(
    z.enum(['hospital_self', 'official', 'mainstream', 'aggregator'])
  ).optional().describe('消息来源筛选，默认查询全部 / Filter by source type'),
  days: z.number().min(1).max(90).optional().default(7)
    .describe('查询最近N天的消息（1-90，默认7）/ Days to look back'),
  maxResults: z.number().min(1).max(50).optional().default(10)
    .describe('最大返回条数（1-50，默认10）/ Max results to return'),
  keywords: z.string().optional()
    .describe('额外关键词过滤 / Additional keywords to filter'),
  includeContent: z.boolean().optional().default(false)
    .describe('是否返回正文内容（默认只返回摘要）/ Include full content'),
}).strict();

export type GetHospitalNewsParameters = z.infer<typeof GetHospitalNewsParametersSchema>;
export const GET_HOSPITAL_NEWS_TOOL_NAME = 'get_hospital_news';

// ========== 工具定义 ==========
export const GetHospitalNewsTool = {
  name: GET_HOSPITAL_NEWS_TOOL_NAME,
  description: `查询指定医院的全网最新消息，聚合多源信息

数据来源（按优先级排序）：
1. 医院自媒体/官网 - 医院官网新闻、官方公众号（最可靠、最及时）
2. 官方政务渠道 - 卫健委、药监局等官方通告（政策影响类消息）
3. 主流媒体 - 健康报、丁香园、动脉网等医疗媒体报道（行业新闻）

功能特性：
- 支持医院名称自动解析（别名识别）
- 按来源类型筛选消息
- 情感分析（正面/中性/负面）
- 自动分类（科研/临床/管理/政策等）
- 2小时缓存，平衡实时性与性能

使用示例：
- "查询北京协和医院最近一周的新闻"
- "查询华山医院最近有什么科研突破"
- "查询瑞金医院最近是否有负面消息"`,
  parameters: zodToJsonSchema(GetHospitalNewsParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

// ========== Handler ==========
export function createGetHospitalNewsHandler(newsService: HospitalNewsService) {
  return async (args: unknown) => {
    toolLogger.toolCall(GET_HOSPITAL_NEWS_TOOL_NAME, args);

    try {
      const params = GetHospitalNewsParametersSchema.parse(args);

      const result = await newsService.getNews({
        hospitalName: params.hospitalName,
        sources: params.sources as NewsSourceType[],
        days: params.days,
        maxResults: params.maxResults,
        keywords: params.keywords,
        includeContent: params.includeContent,
      });

      if (result.status === 'error') {
        toolLogger.toolResult(GET_HOSPITAL_NEWS_TOOL_NAME, 'error', { input: params.hospitalName });
        return {
          status: 'error',
          error: {
            code: 'HOSPITAL_NOT_FOUND',
            message: `未找到"${params.hospitalName}"，请检查医院名称是否正确`,
          },
        };
      }

      toolLogger.toolResult(GET_HOSPITAL_NEWS_TOOL_NAME, 'success', {
        hospital: result.hospital.resolved,
        total: result.totalFound,
        returned: result.results.length,
      });

      // 格式化返回结果，便于LLM理解和展示
      return {
        status: 'success',
        message: formatNewsForDisplay(result),
        data: result,
        meta: result.meta,
      };
    } catch (error) {
      toolLogger.error('Get hospital news tool error', error);
      return {
        status: 'error',
        error: {
          code: 'QUERY_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

/**
 * 格式化新闻为易读的文本
 */
function formatNewsForDisplay(result: import('../types/hospital-news.types').HospitalNewsResult): string {
  const { hospital, totalFound, results, sourceStats } = result;

  if (results.length === 0) {
    return `未找到${hospital.resolved}的近期消息。`;
  }

  const lines: string[] = [
    `🏥 ${hospital.resolved} - 全网消息查询结果`,
    `共找到 ${totalFound} 条消息，显示前 ${results.length} 条`,
    '',
    '📊 数据来源分布：',
  ];

  // 来源统计
  if (sourceStats.hospital_self > 0) {
    lines.push(`  • 医院官方: ${sourceStats.hospital_self}条`);
  }
  if (sourceStats.official > 0) {
    lines.push(`  • 官方政务: ${sourceStats.official}条`);
  }
  if (sourceStats.mainstream > 0) {
    lines.push(`  • 主流媒体: ${sourceStats.mainstream}条`);
  }

  lines.push('', '📰 最新消息：', '');

  // 新闻列表
  results.forEach((item, index) => {
    const emoji = getSourceEmoji(item.source.type);
    const sentimentEmoji = getSentimentEmoji(item.sentiment);
    const date = new Date(item.publishedAt).toLocaleDateString('zh-CN');

    lines.push(`${index + 1}. ${emoji} ${sentimentEmoji} ${item.title}`);
    lines.push(`   📅 ${date} | 📍 ${item.source.name}`);

    if (item.categories.length > 0) {
      lines.push(`   🏷️ ${item.categories.join(', ')}`);
    }

    if (item.summary && item.summary !== item.title) {
      lines.push(`   📝 ${item.summary.slice(0, 100)}${item.summary.length > 100 ? '...' : ''}`);
    }

    lines.push(`   🔗 ${item.originalUrl}`);
    lines.push('');
  });

  lines.push('---');
  lines.push(`💡 提示：数据缓存至 ${new Date(result.meta.nextUpdateAt).toLocaleString('zh-CN')}`);

  return lines.join('\n');
}

function getSourceEmoji(type: NewsSourceType): string {
  const emojis: Record<NewsSourceType, string> = {
    hospital_self: '🏥',
    official: '📜',
    mainstream: '📰',
    aggregator: '📡',
  };
  return emojis[type] || '📄';
}

function getSentimentEmoji(sentiment: string): string {
  const emojis: Record<string, string> = {
    positive: '✅',
    neutral: '➖',
    negative: '⚠️',
  };
  return emojis[sentiment] || '➖';
}
