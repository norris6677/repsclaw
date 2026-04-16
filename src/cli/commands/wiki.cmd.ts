/**
 * Wiki CLI 命令
 * 知识库查询、Ingest、Lint 维护
 */

import { getServices } from '../services/service-container';
import { parseArgs } from '../utils/arg-parser';
import { printSuccess, printError, printHelp } from '../utils/output';
import type { CliCommand } from '../types';

const services = getServices();

// 查询 Wiki
async function query(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw wiki query',
      '基于本地 Wiki 知识库查询',
      'repsclaw wiki query --question="问题内容"',
      [
        'repsclaw wiki query --question="北京协和心内科主任是谁？"',
        'repsclaw wiki query --question="最近AI诊断设备采购趋势" --save-insight --insight-title="AI诊断趋势分析"',
      ]
    );
    return;
  }

  if (!parsed.question) {
    printError('MISSING_PARAM', '请提供 --question 参数');
    return;
  }

  try {
    const result = await services.wikiQuery.query({
      question: parsed.question as string,
      queryType: parsed['query-type'] as any,
      saveAsInsight: parsed['save-insight'] === true || parsed['save-insight'] === 'true',
      insightTitle: parsed['insight-title'] as string | undefined,
    });

    printSuccess({
      answer: result.answer,
      sources: result.sources,
      savedInsightPath: result.savedInsightPath,
    });
  } catch (error) {
    printError('QUERY_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 手动触发 Ingest
async function ingest(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw wiki ingest',
      '手动触发 Wiki Ingest（将原始资料整合到 Wiki）',
      'repsclaw wiki ingest --source-id=<id> --hospital=<医院名>',
      [
        'repsclaw wiki ingest --source-id=abc123 --hospital="北京协和医院"',
      ]
    );
    return;
  }

  if (!parsed['source-id']) {
    printError('MISSING_PARAM', '请提供 --source-id 参数');
    return;
  }

  if (!parsed.hospital) {
    printError('MISSING_PARAM', '请提供 --hospital 参数');
    return;
  }

  try {
    // 查找原始资料
    const sources = services.rawSourceManager.searchSources({
      hospitalName: parsed.hospital as string,
    });
    const source = sources.find(s => s.id === parsed['source-id']);

    if (!source) {
      printError('NOT_FOUND', `未找到 source-id 为 ${parsed['source-id']} 的原始资料`);
      return;
    }

    const result = await services.wikiIngest.ingestFromRawSource(source);

    printSuccess({
      message: 'Wiki Ingest 完成',
      success: result.success,
      updatedPages: result.updatedPages,
      newPages: result.newPages,
      contradictions: result.contradictions,
    });
  } catch (error) {
    printError('INGEST_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 运行 Lint
async function lint(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw wiki lint',
      '运行 Wiki 健康检查',
      'repsclaw wiki lint',
      ['repsclaw wiki lint']
    );
    return;
  }

  try {
    const report = await services.wikiLint.runLint();

    printSuccess({
      summary: report.summary,
      contradictions: report.contradictions.length,
      stalePages: report.stalePages.length,
      orphanPages: report.orphanPages.length,
      missingCoverage: report.missingCoverage.length,
      runAt: report.runAt,
    });
  } catch (error) {
    printError('LINT_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 查看 Wiki 状态
async function status(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw wiki status',
      '查看 Wiki 知识库状态',
      'repsclaw wiki status',
      ['repsclaw wiki status']
    );
    return;
  }

  try {
    const stats = services.wikiManager.getStats();
    const index = services.wikiManager.getIndex();

    printSuccess({
      stats: {
        医院: stats.totalHospitals,
        科室: stats.totalDepartments,
        医生: stats.totalDoctors,
        专题分析: stats.totalInsights,
        关系记录: stats.totalRelations,
        最后Ingest: index.lastIngestAt || 'N/A',
        最后Lint: index.lastLintAt || 'N/A',
      },
    });
  } catch (error) {
    printError('STATUS_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 查看 Wiki 页面
async function page(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw wiki page',
      '查看指定 Wiki 页面内容',
      'repsclaw wiki page --category=hospitals --slug=<slug>',
      [
        'repsclaw wiki page --category=hospitals --slug=北京协和医院',
        'repsclaw wiki page --category=doctors --slug=北京协和医院_张三',
      ]
    );
    return;
  }

  if (!parsed.category) {
    printError('MISSING_PARAM', '请提供 --category 参数 (hospitals|departments|doctors|insights|relations)');
    return;
  }

  if (!parsed.slug) {
    printError('MISSING_PARAM', '请提供 --slug 参数');
    return;
  }

  try {
    const page = services.wikiManager.getPage(
      parsed.category as any,
      parsed.slug as string
    );

    if (!page) {
      printError('NOT_FOUND', `未找到 ${parsed.category}/${parsed.slug}`);
      return;
    }

    printSuccess({
      slug: page.slug,
      frontmatter: page.frontmatter,
      body: page.body.substring(0, 2000) + (page.body.length > 2000 ? '\n... (truncated)' : ''),
    });
  } catch (error) {
    printError('PAGE_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 重建索引
async function rebuildIndex(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw wiki index',
      '重建 Wiki 全局索引',
      'repsclaw wiki index',
      ['repsclaw wiki index']
    );
    return;
  }

  try {
    services.wikiManager.rebuildIndex();
    printSuccess({ message: '索引已重建' });
  } catch (error) {
    printError('INDEX_ERROR', error instanceof Error ? error.message : String(error));
  }
}

export const wikiCommands: Record<string, (argv: string[]) => Promise<void>> = {
  query,
  ingest,
  lint,
  status,
  page,
  index: rebuildIndex,
};

export const wikiCommandMetadata: CliCommand[] = [
  {
    name: 'wiki query',
    description: '基于本地 Wiki 知识库查询',
    usage: 'repsclaw wiki query --question="问题内容"',
    examples: ['repsclaw wiki query --question="北京协和心内科主任是谁？"'],
    handler: query,
  },
  {
    name: 'wiki ingest',
    description: '手动触发 Wiki Ingest',
    usage: 'repsclaw wiki ingest --source-id=<id> --hospital=<医院名>',
    examples: ['repsclaw wiki ingest --source-id=abc123 --hospital="北京协和医院"'],
    handler: ingest,
  },
  {
    name: 'wiki lint',
    description: '运行 Wiki 健康检查',
    usage: 'repsclaw wiki lint',
    examples: ['repsclaw wiki lint'],
    handler: lint,
  },
  {
    name: 'wiki status',
    description: '查看 Wiki 知识库状态',
    usage: 'repsclaw wiki status',
    examples: ['repsclaw wiki status'],
    handler: status,
  },
  {
    name: 'wiki page',
    description: '查看指定 Wiki 页面',
    usage: 'repsclaw wiki page --category=<类别> --slug=<slug>',
    examples: ['repsclaw wiki page --category=hospitals --slug=北京协和医院'],
    handler: page,
  },
  {
    name: 'wiki index',
    description: '重建 Wiki 全局索引',
    usage: 'repsclaw wiki index',
    examples: ['repsclaw wiki index'],
    handler: rebuildIndex,
  },
];
