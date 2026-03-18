#!/usr/bin/env tsx
/**
 * Hospital News Tool 单元测试
 * 测试医院新闻查询工具的完整功能
 */

import {
  GetHospitalNewsTool,
  GetHospitalNewsParametersSchema,
  createGetHospitalNewsHandler,
  GET_HOSPITAL_NEWS_TOOL_NAME,
} from '../../../src/tools/hospital-news.tool';
import { HospitalNewsService } from '../../../src/services/hospital-news/hospital-news.service';
import { NewsSourceType } from '../../../src/types/hospital-news.types';
import { TestSuite, assertEqual, assertTrue, assertExists, assertFalse, c } from '../test-utils';

const suite = new TestSuite();

// 模拟 HospitalNewsService
function createMockNewsService() {
  return {
    getNews: async (params: any) => ({
      status: 'success' as const,
      hospital: {
        input: params.hospitalName,
        resolved: '北京协和医院',
        aliases: ['协和医院', '协和'],
      },
      query: {
        days: params.days || 7,
        sources: params.sources || ['hospital_self', 'official', 'mainstream'],
        keywords: params.keywords,
      },
      totalFound: 5,
      results: [
        {
          id: 'news_1',
          title: 'Test News Title',
          summary: 'Test summary',
          source: {
            name: '医院官网',
            type: 'hospital_self',
          },
          originalUrl: 'https://example.com/news/1',
          publishedAt: new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
          relevanceScore: 95,
          sentiment: 'positive' as const,
          categories: ['科研'],
          verificationStatus: 'verified' as const,
          hospitalMentions: ['北京协和医院'],
        },
      ],
      sourceStats: {
        hospital_self: 2,
        official: 1,
        mainstream: 2,
        aggregator: 0,
      },
      meta: {
        cached: false,
        fetchedAt: new Date().toISOString(),
        nextUpdateAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
    }),
  };
}

// ===== 工具定义测试 =====

suite.add('GetHospitalNewsTool - 工具定义完整', async () => {
  assertEqual(GetHospitalNewsTool.name, 'get_hospital_news');
  assertExists(GetHospitalNewsTool.description);
  assertExists(GetHospitalNewsTool.parameters);
  assertEqual(GetHospitalNewsTool.parameters.type, 'object');
});

suite.add('GetHospitalNewsTool - 工具名称常量', async () => {
  assertEqual(GET_HOSPITAL_NEWS_TOOL_NAME, 'get_hospital_news');
});

suite.add('GetHospitalNewsTool - 参数Schema结构', async () => {
  const schema = GetHospitalNewsTool.parameters;
  assertExists(schema.properties);
  assertExists(schema.properties.hospitalName);
  assertExists(schema.properties.days);
  assertExists(schema.properties.maxResults);
  assertExists(schema.properties.sources);
  assertExists(schema.properties.keywords);
  assertExists(schema.properties.includeContent);
});

// ===== 参数验证测试 =====

suite.add('GetHospitalNewsTool - 参数Schema验证', async () => {
  // 有效参数
  const validParams = {
    hospitalName: '北京协和医院',
    days: 7,
    maxResults: 10,
  };
  const result = GetHospitalNewsParametersSchema.safeParse(validParams);
  assertTrue(result.success, '有效参数应该通过验证');

  // 空医院名应该失败
  const invalidParams = {
    hospitalName: '',
  };
  const invalidResult = GetHospitalNewsParametersSchema.safeParse(invalidParams);
  assertTrue(!invalidResult.success, '空医院名应该失败');
});

suite.add('GetHospitalNewsTool - 必需参数检查', async () => {
  // 只提供hospitalName
  const minimalParams = { hospitalName: '华山医院' };
  const result = GetHospitalNewsParametersSchema.parse(minimalParams);
  assertEqual(result.hospitalName, '华山医院');
  assertEqual(result.days, 7); // 默认值
  assertEqual(result.maxResults, 10); // 默认值
  assertEqual(result.includeContent, false); // 默认值
});

suite.add('GetHospitalNewsTool - days参数范围', async () => {
  // 最小值
  const minParams = { hospitalName: 'test', days: 1 };
  const minResult = GetHospitalNewsParametersSchema.parse(minParams);
  assertEqual(minResult.days, 1);

  // 最大值
  const maxParams = { hospitalName: 'test', days: 90 };
  const maxResult = GetHospitalNewsParametersSchema.parse(maxParams);
  assertEqual(maxResult.days, 90);

  // 超出范围应该验证失败
  const overParams = { hospitalName: 'test', days: 100 };
  const overResult = GetHospitalNewsParametersSchema.safeParse(overParams);
  assertFalse(overResult.success, '超出范围的days应该验证失败');
});

suite.add('GetHospitalNewsTool - maxResults参数范围', async () => {
  // 最小值
  const minParams = { hospitalName: 'test', maxResults: 1 };
  const minResult = GetHospitalNewsParametersSchema.parse(minParams);
  assertEqual(minResult.maxResults, 1);

  // 最大值
  const maxParams = { hospitalName: 'test', maxResults: 50 };
  const maxResult = GetHospitalNewsParametersSchema.parse(maxParams);
  assertEqual(maxResult.maxResults, 50);

  // 超出范围应该验证失败
  const overParams = { hospitalName: 'test', maxResults: 100 };
  const overResult = GetHospitalNewsParametersSchema.safeParse(overParams);
  assertFalse(overResult.success, '超出范围的maxResults应该验证失败');
});

suite.add('GetHospitalNewsTool - sources参数验证', async () => {
  const paramsWithSources = {
    hospitalName: 'test',
    sources: ['hospital_self', 'official'] as const,
  };
  const result = GetHospitalNewsParametersSchema.parse(paramsWithSources);
  assertEqual(result.sources?.length, 2);
  assertTrue(result.sources?.includes('hospital_self' as NewsSourceType));
  assertTrue(result.sources?.includes('official' as NewsSourceType));
});

suite.add('GetHospitalNewsTool - 无效sources值', async () => {
  const invalidSources = {
    hospitalName: 'test',
    sources: ['invalid_source'],
  };
  const result = GetHospitalNewsParametersSchema.safeParse(invalidSources);
  assertFalse(result.success, '无效的source应该失败');
});

suite.add('GetHospitalNewsTool - includeContent参数', async () => {
  const paramsWithContent = {
    hospitalName: 'test',
    includeContent: true,
  };
  const result = GetHospitalNewsParametersSchema.parse(paramsWithContent);
  assertEqual(result.includeContent, true);
});

suite.add('GetHospitalNewsTool - keywords参数', async () => {
  const paramsWithKeywords = {
    hospitalName: 'test',
    keywords: '科研 获奖',
  };
  const result = GetHospitalNewsParametersSchema.parse(paramsWithKeywords);
  assertEqual(result.keywords, '科研 获奖');
});

// ===== Handler 测试 =====

suite.add('GetHospitalNewsTool - Handler成功调用', async () => {
  const mockService = createMockNewsService() as any;
  const handler = createGetHospitalNewsHandler(mockService);

  const result = await handler({ hospitalName: '协和医院', days: 7 });

  assertEqual(result.status, 'success');
  assertExists(result.data);
  assertEqual(result.data.hospital.resolved, '北京协和医院');
});

suite.add('GetHospitalNewsTool - Handler返回消息格式', async () => {
  const mockService = createMockNewsService() as any;
  const handler = createGetHospitalNewsHandler(mockService);

  const result = await handler({ hospitalName: '协和医院' });

  assertEqual(result.status, 'success');
  assertExists(result.message);
  assertTrue(result.message.includes('北京协和医院'));
});

suite.add('GetHospitalNewsTool - Handler带keywords', async () => {
  const mockService = createMockNewsService() as any;
  const handler = createGetHospitalNewsHandler(mockService);

  const result = await handler({
    hospitalName: '协和医院',
    keywords: '科研 获奖',
  });

  assertEqual(result.status, 'success');
});

suite.add('GetHospitalNewsTool - Handler带sources过滤', async () => {
  const mockService = createMockNewsService() as any;
  const handler = createGetHospitalNewsHandler(mockService);

  const result = await handler({
    hospitalName: '协和医院',
    sources: ['hospital_self', 'official'],
  });

  assertEqual(result.status, 'success');
});

suite.add('GetHospitalNewsTool - Handler参数验证失败', async () => {
  const mockService = createMockNewsService() as any;
  const handler = createGetHospitalNewsHandler(mockService);

  const result = await handler({ hospitalName: '' }); // 空医院名

  assertEqual(result.status, 'error');
  assertExists(result.error);
});

suite.add('GetHospitalNewsTool - Handler医院未找到', async () => {
  const errorService = {
    getNews: async () => ({
      status: 'error' as const,
      hospital: { input: '不存在的医院', resolved: '', aliases: [] },
      query: { days: 7, sources: [] },
      totalFound: 0,
      results: [],
      sourceStats: { hospital_self: 0, official: 0, mainstream: 0, aggregator: 0 },
      meta: { cached: false, fetchedAt: '', nextUpdateAt: '' },
    }),
  };
  const handler = createGetHospitalNewsHandler(errorService as any);

  const result = await handler({ hospitalName: '不存在的医院' });

  assertEqual(result.status, 'error');
  assertEqual(result.error.code, 'HOSPITAL_NOT_FOUND');
});

suite.add('GetHospitalNewsTool - Handler异常处理', async () => {
  const errorService = {
    getNews: async () => {
      throw new Error('Service error');
    },
  };
  const handler = createGetHospitalNewsHandler(errorService as any);

  const result = await handler({ hospitalName: '协和医院' });

  assertEqual(result.status, 'error');
  assertEqual(result.error.code, 'QUERY_ERROR');
});

// ===== 综合场景测试 =====

suite.add('GetHospitalNewsTool - 复杂查询参数组合', async () => {
  const mockService = createMockNewsService() as any;
  const handler = createGetHospitalNewsHandler(mockService);

  const result = await handler({
    hospitalName: '北京协和医院',
    days: 30,
    maxResults: 20,
    sources: ['hospital_self', 'mainstream'],
    keywords: '科研突破',
    includeContent: true,
  });

  assertEqual(result.status, 'success');
  assertExists(result.data);
  assertExists(result.meta);
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         Hospital News Tool 单元测试                 ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);

  const success = await suite.run('Hospital News Tool 测试套件');
  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
