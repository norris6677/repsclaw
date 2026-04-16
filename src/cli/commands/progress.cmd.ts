/**
 * 进度追踪CLI命令
 * 提供采集任务的实时监控和进度查询
 */

import { getServices } from '../services/service-container';
import { parseArgs } from '../utils/arg-parser';
import { printSuccess, printError, printHelp } from '../utils/output';
import type { CliCommand } from '../types';

const services = getServices();

// 查看任务进度状态
async function status(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw progress status',
      '查看采集任务的进度状态',
      'repsclaw progress status <job-id>',
      ['repsclaw progress status abc123...']
    );
    return;
  }

  if (parsed._.length === 0) {
    printError('MISSING_PARAM', '请提供任务ID');
    return;
  }

  const jobId = parsed._[0];

  try {
    const jobState = services.progressService.getJobState(jobId);

    if (!jobState) {
      // 尝试从采集服务获取
      const job = services.knowledgeCollection.getJobStatus(jobId);
      if (!job) {
        printError('NOT_FOUND', `未找到任务 ${jobId}`);
        return;
      }

      printSuccess({
        jobId,
        status: job.status,
        progress: job.progress,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        note: '此任务暂无详细进度追踪信息',
      });
      return;
    }

    // 计算统计信息
    const eventCount = jobState.events.length;
    const summaryCount = Array.from(jobState.summaryGenerated).length;

    printSuccess({
      jobId: jobState.jobId,
      status: jobState.status,
      startedAt: jobState.startedAt,
      completedAt: jobState.completedAt,
      lastEventId: jobState.lastEventId,
      eventCount,
      summaryGenerated: summaryCount,
    });
  } catch (error) {
    printError('STATUS_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 列出活跃任务
async function list(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw progress list',
      '列出所有正在追踪的活跃任务',
      'repsclaw progress list',
      ['repsclaw progress list']
    );
    return;
  }

  try {
    const activeJobs = services.progressService.getActiveJobs();

    if (activeJobs.length === 0) {
      console.log('暂无活跃任务');
      return;
    }

    console.log(`\n活跃任务列表 (${activeJobs.length} 个):\n`);
    console.log('任务ID                                状态      开始时间                     事件数  最后事件ID');
    console.log('-'.repeat(100));

    for (const job of activeJobs) {
      const startTime = new Date(job.startedAt).toLocaleString('zh-CN');
      console.log(
        `${job.jobId.substring(0, 36)}  ${job.status.padEnd(8)}  ${startTime}  ${String(job.events.length).padStart(5)}  ${job.lastEventId}`
      );
    }
    console.log();
  } catch (error) {
    printError('LIST_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 模拟SSE流输出（用于命令行查看实时进度）
async function stream(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw progress stream',
      '实时追踪采集进度（SSE流输出）',
      'repsclaw progress stream <job-id> [--json]',
      [
        'repsclaw progress stream abc123...',
        'repsclaw progress stream abc123... --json',
      ]
    );
    return;
  }

  if (parsed._.length === 0) {
    printError('MISSING_PARAM', '请提供任务ID');
    return;
  }

  const jobId = parsed._[0];
  const outputJson = parsed.json === true || parsed.json === 'true';

  try {
    // 检查任务是否存在
    const jobState = services.progressService.getJobState(jobId);
    if (!jobState) {
      const job = services.knowledgeCollection.getJobStatus(jobId);
      if (!job) {
        printError('NOT_FOUND', `未找到任务 ${jobId}`);
        return;
      }
    }

    console.log(`\n🔴 正在追踪任务 ${jobId} 的实时进度...`);
    console.log('按 Ctrl+C 停止监听\n');

    // 设置事件监听器
    const progressService = services.progressService;

    const handleProgress = (event: { type: string; jobId: string; timestamp: string; data: unknown }) => {
      if (event.jobId !== jobId) return;

      if (outputJson) {
        console.log(JSON.stringify(event));
      } else {
        const time = new Date(event.timestamp).toLocaleTimeString('zh-CN');

        switch (event.type) {
          case 'started':
            console.log(`[${time}] 🚀 任务开始`);
            break;
          case 'progress': {
            const progress = event.data as { percent: number; completed: number; total: number; currentSource?: string };
            const source = progress.currentSource ? ` [${progress.currentSource}]` : '';
            console.log(`[${time}] 📊 进度: ${progress.percent}% (${progress.completed}/${progress.total})${source}`);
            break;
          }
          case 'source_complete': {
            const data = event.data as { sourceType: string; itemCount: number; duration: number };
            console.log(`[${time}] ✅ 数据源完成: ${data.sourceType} (${data.itemCount} 条, ${Math.round(data.duration / 1000)}秒)`);
            break;
          }
          case 'summary': {
            const summary = event.data as { sourceType: string; count: number; highlights: string[] };
            console.log(`[${time}] 📝 摘要 [${summary.sourceType}]:`);
            summary.highlights.slice(0, 3).forEach((highlight, i) => {
              console.log(`   ${i + 1}. ${highlight}`);
            });
            break;
          }
          case 'completed': {
            const data = event.data as { totalItems: number; totalDuration: number };
            console.log(`[${time}] ✨ 任务完成! 共采集 ${data.totalItems} 条数据，耗时 ${Math.round(data.totalDuration / 1000)}秒`);
            break;
          }
          case 'error': {
            const error = event.data as { source: string; message: string; fatal: boolean };
            const level = error.fatal ? '❌ 致命错误' : '⚠️ 警告';
            console.log(`[${time}] ${level} [${error.source}]: ${error.message}`);
            break;
          }
        }
      }
    };

    progressService.on('progress', handleProgress);

    // 保持进程运行
    await new Promise<void>((resolve) => {
      // 检查任务是否已完成
      const checkInterval = setInterval(() => {
        const job = services.knowledgeCollection.getJobStatus(jobId);
        if (job && (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled')) {
          clearInterval(checkInterval);
          progressService.off('progress', handleProgress);
          resolve();
        }
      }, 1000);

      // 10分钟后自动退出
      setTimeout(() => {
        clearInterval(checkInterval);
        progressService.off('progress', handleProgress);
        console.log('\n\n监听已超时（10分钟）');
        resolve();
      }, 600000);
    });

    console.log('\n监听已结束');
  } catch (error) {
    printError('STREAM_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 查看任务摘要
async function summary(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw progress summary',
      '查看任务的数据源摘要',
      'repsclaw progress summary <job-id>',
      ['repsclaw progress summary abc123...']
    );
    return;
  }

  if (parsed._.length === 0) {
    printError('MISSING_PARAM', '请提供任务ID');
    return;
  }

  const jobId = parsed._[0];

  try {
    const jobState = services.progressService.getJobState(jobId);

    if (!jobState) {
      printError('NOT_FOUND', `未找到任务 ${jobId} 的进度信息`);
      return;
    }

    // 提取所有摘要事件
    const summaries = jobState.events
      .filter(e => e.event.type === 'summary')
      .map(e => e.event.data as { sourceType: string; count: number; highlights: string[]; categories: Record<string, number> });

    if (summaries.length === 0) {
      console.log('暂无摘要信息，任务可能还在进行中');
      return;
    }

    console.log(`\n📊 任务 ${jobId.substring(0, 8)}... 的数据源摘要:\n`);

    for (const summary of summaries) {
      console.log(`\n【${summary.sourceType}】`);
      console.log(`  采集数量: ${summary.count}`);
      console.log(`  分类分布:`);
      Object.entries(summary.categories).forEach(([cat, count]) => {
        if (count > 0) {
          console.log(`    - ${cat}: ${count}`);
        }
      });
      console.log(`  重点内容:`);
      summary.highlights.slice(0, 5).forEach((highlight, i) => {
        console.log(`    ${i + 1}. ${highlight}`);
      });
    }
    console.log();
  } catch (error) {
    printError('SUMMARY_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 生成进度报告
async function report(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw progress report',
      '生成采集任务完整报告',
      'repsclaw progress report <job-id> [--output=文件名]',
      [
        'repsclaw progress report abc123...',
        'repsclaw progress report abc123... --output=report.json',
      ]
    );
    return;
  }

  if (parsed._.length === 0) {
    printError('MISSING_PARAM', '请提供任务ID');
    return;
  }

  const jobId = parsed._[0];

  try {
    const jobState = services.progressService.getJobState(jobId);
    const job = services.knowledgeCollection.getJobStatus(jobId);

    if (!job) {
      printError('NOT_FOUND', `未找到任务 ${jobId}`);
      return;
    }

    const report = {
      job: {
        id: job.id,
        status: job.status,
        config: job.config,
        progress: job.progress,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
      progressTracking: jobState ? {
        status: jobState.status,
        startedAt: jobState.startedAt,
        completedAt: jobState.completedAt,
        totalEvents: jobState.events.length,
        summariesGenerated: Array.from(jobState.summaryGenerated),
      } : null,
      events: jobState?.events.map(e => ({
        id: e.eventId,
        type: e.event.type,
        timestamp: e.event.timestamp,
        data: e.event.data,
      })),
    };

    if (parsed.output) {
      const fs = await import('fs');
      fs.writeFileSync(parsed.output as string, JSON.stringify(report, null, 2));
      printSuccess({ message: `报告已保存到 ${parsed.output}` });
    } else {
      printSuccess(report);
    }
  } catch (error) {
    printError('REPORT_ERROR', error instanceof Error ? error.message : String(error));
  }
}

export const progressCommands: Record<string, (argv: string[]) => Promise<void>> = {
  status,
  list,
  stream,
  summary,
  report,
};

// 导出命令元数据用于文档生成
export const progressCommandMetadata: CliCommand[] = [
  {
    name: 'progress status',
    description: '查看采集任务进度状态',
    usage: 'repsclaw progress status <job-id>',
    examples: ['repsclaw progress status abc123...'],
    handler: status,
  },
  {
    name: 'progress list',
    description: '列出所有活跃任务',
    usage: 'repsclaw progress list',
    examples: ['repsclaw progress list'],
    handler: list,
  },
  {
    name: 'progress stream',
    description: '实时追踪采集进度',
    usage: 'repsclaw progress stream <job-id> [--json]',
    examples: ['repsclaw progress stream abc123...'],
    handler: stream,
  },
  {
    name: 'progress summary',
    description: '查看数据源摘要',
    usage: 'repsclaw progress summary <job-id>',
    examples: ['repsclaw progress summary abc123...'],
    handler: summary,
  },
  {
    name: 'progress report',
    description: '生成完整进度报告',
    usage: 'repsclaw progress report <job-id> [--output=文件名]',
    examples: ['repsclaw progress report abc123... --output=report.json'],
    handler: report,
  },
];
