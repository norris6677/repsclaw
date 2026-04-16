/**
 * Article Ingestion Tools
 * 文章采集工具 - OpenClaw 工具注册
 *
 * 暴露给 OpenClaw 的 Function Calling 能力
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ArticleIngestionService } from '../services/article-ingestion/article-ingestion.service';
import { createLogger } from '../utils/plugin-logger';

const logger = createLogger('REPSCLAW:TOOL');

// ========== Tool 1: 智能保存文章 ==========

export const QuickSaveArticleParametersSchema = z.object({
  url: z.string().url().describe('文章链接 URL'),
  context: z.string().optional().describe('上下文信息，如用户消息内容'),
  userId: z.string().optional().describe('用户ID，用于上下文关联'),
}).strict();

export type QuickSaveArticleParameters = z.infer<typeof QuickSaveArticleParametersSchema>;
export const QUICK_SAVE_ARTICLE_TOOL_NAME = 'quick_save_article';

export const QuickSaveArticleTool = {
  name: QUICK_SAVE_ARTICLE_TOOL_NAME,
  description: `智能保存文章到知识库（自动识别意图和目标）

能力：
1. 自动分析 URL 内容
2. 识别用户意图（基于上下文和订阅信息）
3. 推断保存目标（医院/科室/医生）
4. 自动去重
5. 转换为 Markdown 保存

适用场景：
- 用户发送"保存这篇文章 https://..."
- 用户转发文章链接
- 用户说"存到北京协和"后提供链接

自动推断逻辑：
- 如果用户只订阅了一个医院，默认使用该医院
- 如果有多个订阅，基于最近操作或文章标题推断
- 支持指代消解（"刚才那个医院"）`,
  parameters: zodToJsonSchema(QuickSaveArticleParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  },
};

export function createQuickSaveArticleHandler(ingestionService: ArticleIngestionService) {
  return async (args: unknown) => {
    logger.info('Tool called: quick_save_article', args);

    try {
      const params = QuickSaveArticleParametersSchema.parse(args);

      // 真正调用文章采集服务进行保存
      const result = await ingestionService.quickSave(
        params.url,
        params.context,
        params.userId
      );

      if (!result.success) {
        return {
          status: 'error',
          error: {
            code: result.metadata ? 'DUPLICATE' : 'SAVE_ERROR',
            message: result.error || '保存失败',
            existing: result.metadata
              ? {
                  title: result.metadata.title,
                  hospitalName: result.metadata.hospitalName,
                  filePath: result.metadata.filePath,
                }
              : undefined,
          },
        };
      }

      return {
        status: 'success',
        message: `文章《${result.metadata!.title}》已保存到 ${result.target!.hospitalName}${
          result.target!.departmentName ? ' · ' + result.target!.departmentName : ''
        }`,
        data: {
          url: params.url,
          title: result.metadata!.title,
          hospitalName: result.target!.hospitalName,
          departmentName: result.target!.departmentName,
          doctorName: result.target!.doctorName,
          filePath: result.metadata!.filePath,
        },
      };
    } catch (error) {
      logger.error('Tool error: quick_save_article', error);
      return {
        status: 'error',
        error: {
          code: 'SAVE_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

// ========== Tool 2: 分析 URL 内容 ==========

export const AnalyzeUrlParametersSchema = z.object({
  url: z.string().url().describe('要分析的 URL'),
  extractEntities: z.boolean().optional().default(true).describe('是否提取实体'),
}).strict();

export type AnalyzeUrlParameters = z.infer<typeof AnalyzeUrlParametersSchema>;
export const ANALYZE_URL_TOOL_NAME = 'analyze_url_content';

export const AnalyzeUrlTool = {
  name: ANALYZE_URL_TOOL_NAME,
  description: `预分析 URL 内容，提取标题、摘要和可能的医院/科室关联

返回：
- 文章标题
- 内容摘要
- 检测到的医院/科室/医生名称
- 建议的保存目标

用于在保存前给用户预览和确认`,
  parameters: zodToJsonSchema(AnalyzeUrlParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  },
};

export function createAnalyzeUrlHandler() {
  return async (args: unknown) => {
    try {
      const params = AnalyzeUrlParametersSchema.parse(args);

      // 调用 WebToMarkdown 服务预分析
      const { convertWebToMarkdown } = await import('../services/web-to-markdown.service');
      const result = await convertWebToMarkdown({
        url: params.url,
        outputMode: 'content',
        usePlaywright: false, // 静态获取即可
        timeout: 15000,
      });

      if (!result.success) {
        return {
          status: 'error',
          error: {
            code: 'FETCH_ERROR',
            message: result.error || '无法获取文章内容',
          },
        };
      }

      return {
        status: 'success',
        data: {
          url: params.url,
          title: result.title,
          wordCount: result.metadata.wordCount,
          preview: result.markdown.substring(0, 500) + '...',
        },
      };
    } catch (error) {
      return {
        status: 'error',
        error: {
          code: 'ANALYSIS_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

// ========== Tool 3: 获取保存建议 ==========

export const GetSaveSuggestionsParametersSchema = z.object({
  url: z.string().url().describe('文章 URL'),
  userId: z.string().describe('用户ID'),
}).strict();

export type GetSaveSuggestionsParameters = z.infer<typeof GetSaveSuggestionsParametersSchema>;
export const GET_SAVE_SUGGESTIONS_TOOL_NAME = 'get_save_suggestions';

export const GetSaveSuggestionsTool = {
  name: GET_SAVE_SUGGESTIONS_TOOL_NAME,
  description: `基于 URL 内容和用户订阅，智能推荐保存目标

返回建议的目标列表，按置信度排序
用于让用户选择或确认`,
  parameters: zodToJsonSchema(GetSaveSuggestionsParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  },
};

// ========== Tool 4: 指定目标保存 ==========

export const SaveToTargetParametersSchema = z.object({
  url: z.string().url().describe('文章 URL'),
  hospitalName: z.string().describe('医院名称'),
  departmentName: z.string().optional().describe('科室名称'),
  doctorName: z.string().optional().describe('医生名称'),
  tags: z.array(z.string()).optional().describe('额外标签'),
}).strict();

export type SaveToTargetParameters = z.infer<typeof SaveToTargetParametersSchema>;
export const SAVE_TO_TARGET_TOOL_NAME = 'save_article_to_target';

export const SaveToTargetTool = {
  name: SAVE_TO_TARGET_TOOL_NAME,
  description: `将文章保存到指定的医院/科室/医生目录

适用场景：
- 用户明确指定了保存位置
- 自动推断的结果需要精确保存

会执行：
1. 抓取文章内容
2. 转换为 Markdown
3. 保存到指定位置
4. 返回保存结果`,
  parameters: zodToJsonSchema(SaveToTargetParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  },
};

export function createSaveToTargetHandler(rawSourceManager: any) {
  return async (args: unknown) => {
    logger.info('Tool called: save_article_to_target', args);

    try {
      const params = SaveToTargetParametersSchema.parse(args);

      // 抓取内容
      const { convertWebToMarkdown } = await import('../services/web-to-markdown.service');
      const webResult = await convertWebToMarkdown({
        url: params.url,
        outputMode: 'content',
        usePlaywright: true,
        timeout: 60000,
      });

      if (!webResult.success) {
        return {
          status: 'error',
          error: {
            code: 'FETCH_ERROR',
            message: webResult.error || '抓取失败',
          },
        };
      }

      // 保存
      const { CollectionSourceType } = await import('../types/knowledge-collection.types');
      const metadata = rawSourceManager.saveRawSource({
        sourceType: CollectionSourceType.USER_SUBMITTED,
        url: params.url,
        title: webResult.title,
        content: webResult.markdown,
        hospitalName: params.hospitalName,
        departments: params.departmentName ? [params.departmentName] : undefined,
        doctors: params.doctorName ? [params.doctorName] : undefined,
        tags: [...(params.tags || []), 'manual-save'],
      });

      if (!metadata) {
        return {
          status: 'error',
          error: {
            code: 'SAVE_ERROR',
            message: '保存失败（可能已存在）',
          },
        };
      }

      return {
        status: 'success',
        message: '文章已保存',
        data: {
          title: metadata.title,
          hospitalName: metadata.hospitalName,
          filePath: metadata.filePath,
        },
      };
    } catch (error) {
      logger.error('Tool error: save_article_to_target', error);
      return {
        status: 'error',
        error: {
          code: 'SAVE_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

// ========== Tool 5: 批量保存 ==========

export const BatchSaveParametersSchema = z.object({
  urls: z.array(z.string().url()).describe('文章 URL 列表'),
  hospitalName: z.string().describe('目标医院'),
  departmentName: z.string().optional().describe('目标科室'),
}).strict();

export type BatchSaveParameters = z.infer<typeof BatchSaveParametersSchema>;
export const BATCH_SAVE_TOOL_NAME = 'batch_save_articles';

export const BatchSaveTool = {
  name: BATCH_SAVE_TOOL_NAME,
  description: `批量保存多篇文章到同一个目标

适用场景：
- 用户一次发送多个链接
- 需要保存文章集合

会逐个处理，汇总结果`,
  parameters: zodToJsonSchema(BatchSaveParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  },
};

// ========== 工具导出 ==========

export * from '../services/article-ingestion/types';
