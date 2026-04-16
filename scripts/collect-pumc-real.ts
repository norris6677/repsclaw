/**
 * 北京协和医院真实数据采集脚本
 * PUMC (Peking Union Medical College Hospital) Real Data Collection
 *
 * 用法: ENABLE_REAL_HTTP_TESTS=true tsx scripts/collect-pumc-real.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeCollectionService } from '../src/services/knowledge-collection/knowledge-collection.service';
import { RawSourceManager } from '../src/services/knowledge-collection/raw-source.manager';
import { CollectionProgressService } from '../src/services/knowledge-collection/collection-progress.service';
import {
  CollectionJobStatus,
  CollectionSourceType,
} from '../src/types/knowledge-collection.types';
import chalk from 'chalk';

const HOSPITAL_NAME = '北京协和医院';
const DATA_DIR = path.join(process.cwd(), 'data', 'raw-sources');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 日志输出
function log(level: 'info' | 'success' | 'warn' | 'error', message: string, data?: unknown) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const prefix = {
    info: chalk.blue('ℹ'),
    success: chalk.green('✓'),
    warn: chalk.yellow('⚠'),
    error: chalk.red('✗'),
  }[level];

  console.log(`${chalk.gray(`[${timestamp}]`)} ${prefix} ${message}`);
  if (data) {
    console.log(chalk.gray('  →'), data);
  }
}

// 进度条渲染
function renderProgressBar(percent: number, width: number = 40): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  return `[${bar}] ${percent.toFixed(1)}%`;
}

async function main() {
  log('info', '🏥 开始北京协和医院真实数据采集');
  log('info', `📁 数据保存目录: ${DATA_DIR}`);

  // 初始化服务
  const rawSourceManager = new RawSourceManager();
  const progressService = new CollectionProgressService();
  const service = new KnowledgeCollectionService(rawSourceManager, undefined, progressService);

  // 统计事件
  const events: { type: string; timestamp: number; data: unknown }[] = [];

  // 监听进度事件
  progressService.on('progress', (event: { type: string; jobId: string; data: unknown }) => {
    events.push({ type: event.type, timestamp: Date.now(), data: event.data });

    switch (event.type) {
      case 'started': {
        log('info', '🚀 采集任务已启动', event.data);
        break;
      }

      case 'progress': {
        const progress = event.data as {
          total: number;
          completed: number;
          failed: number;
          duplicates: number;
          percent: number;
        };
        console.log(
          `${chalk.gray(`[${new Date().toISOString().replace('T', ' ').substring(0, 19)}]`)} 📊 进度: ${renderProgressBar(progress.percent)} | 总: ${progress.total} | 完成: ${chalk.green(progress.completed.toString())} | 失败: ${chalk.red(progress.failed.toString())} | 去重: ${chalk.yellow(progress.duplicates.toString())}`
        );
        break;
      }

      case 'source_complete': {
        const data = event.data as { sourceType: string; itemCount: number; duration: number };
        log('success', `✅ 数据源完成: ${chalk.cyan(data.sourceType)}`, {
          采集数量: data.itemCount,
          耗时: `${(data.duration / 1000).toFixed(2)}s`,
        });
        break;
      }

      case 'summary': {
        const summary = event.data as {
          totalItems?: number;
          avgProcessingTime?: number;
          duplicatesFiltered?: number;
          sourceBreakdown?: Record<string, number>;
        };
        log('info', '📝 数据源摘要', {
          总条目: summary.totalItems ?? 0,
          平均处理时间: summary.avgProcessingTime ? `${summary.avgProcessingTime.toFixed(2)}ms` : 'N/A',
          去重数量: summary.duplicatesFiltered ?? 0,
          来源分布: summary.sourceBreakdown ?? {},
        });
        break;
      }

      case 'error': {
        const error = event.data as { source: string; message: string; isFatal: boolean };
        log('error', `❌ 采集错误 (${error.source}): ${error.message}`, {
          严重错误: error.isFatal,
        });
        break;
      }

      case 'completed': {
        const data = event.data as { totalItems: number; duration: number };
        log('success', '🎉 采集任务完成!', {
          总条目: data.totalItems,
          总耗时: `${(data.duration / 1000).toFixed(2)}s`,
        });
        break;
      }
    }
  });

  try {
    // 启动全量采集 (Bootstrap)
    log('info', '📡 启动全量采集 (Bootstrap Collection)...');
    const job = await service.startBootstrapCollection(HOSPITAL_NAME);

    log('info', '🔧 任务配置', {
      jobId: job.id,
      医院: job.config.hospitalName,
      采集天数: job.config.days,
      深度: job.config.depth,
      最大结果数: job.config.maxResults,
      数据源类型: job.config.sourceTypes,
    });

    // 等待任务完成
    const startTime = Date.now();
    const maxWaitTime = 10 * 60 * 1000; // 10分钟超时

    const finalJob = await new Promise<typeof job>((resolve) => {
      const checkInterval = setInterval(() => {
        const currentJob = service.getJobStatus(job.id);
        const elapsed = Date.now() - startTime;

        if (
          currentJob?.status === CollectionJobStatus.COMPLETED ||
          currentJob?.status === CollectionJobStatus.FAILED ||
          currentJob?.status === CollectionJobStatus.CANCELLED
        ) {
          clearInterval(checkInterval);
          resolve(currentJob);
        }

        if (elapsed > maxWaitTime) {
          log('warn', '⏱️ 采集超时，正在取消任务...');
          service.cancelJob(job.id);
          clearInterval(checkInterval);
          resolve(currentJob);
        }
      }, 1000);
    });

    // 输出最终结果
    console.log('\n' + chalk.green('='.repeat(80)));
    log('success', '🏁 采集任务最终状态', {
      状态: finalJob?.status,
      总条目: finalJob?.results.length,
      错误数: finalJob?.errors.length,
      采集进度: finalJob?.progress,
    });

    // 获取医院采集统计
    const hospitalStatus = service.getHospitalCollectionStatus(HOSPITAL_NAME);
    log('info', '📊 医院采集统计', hospitalStatus);

    // 获取全局统计
    const globalStats = service.getStats();
    log('info', '🌍 全局采集统计', {
      总任务数: globalStats.totalJobs,
      活跃任务: globalStats.activeJobs,
      已完成: globalStats.completedJobs,
      失败: globalStats.failedJobs,
      总数据源: globalStats.totalSources,
      去重数量: globalStats.duplicatesFiltered,
    });

    // 保存事件日志
    const eventLogPath = path.join(DATA_DIR, `pumc-events-${Date.now()}.json`);
    fs.writeFileSync(
      eventLogPath,
      JSON.stringify(
        {
          hospital: HOSPITAL_NAME,
          jobId: job.id,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date().toISOString(),
          events,
          finalJob,
          hospitalStatus,
          globalStats,
        },
        null,
        2
      )
    );
    log('success', `📝 事件日志已保存: ${eventLogPath}`);

    // 列出已保存的数据文件
    const hospitalDir = path.join(DATA_DIR, 'hospitals');
    if (fs.existsSync(hospitalDir)) {
      const hospitalDirs = fs.readdirSync(hospitalDir);
      const pumcDirs = hospitalDirs.filter((d) => d.toLowerCase().includes('协和'));

      if (pumcDirs.length > 0) {
        log('info', '📂 已保存的数据目录:');
        for (const dir of pumcDirs) {
          const fullPath = path.join(hospitalDir, dir);
          const contentsDir = path.join(fullPath, 'contents');
          if (fs.existsSync(contentsDir)) {
            const files = fs.readdirSync(contentsDir);
            console.log(`  ${chalk.cyan(dir)}: ${files.length} 个文件`);
          }
        }
      }
    }

    console.log(chalk.green('='.repeat(80)));

    // 清理
    const activeJobs = service.getActiveJobs();
    for (const activeJob of activeJobs) {
      service.cancelJob(activeJob.id);
    }

    process.exit(0);
  } catch (error) {
    log('error', '💥 采集过程发生错误', error);
    process.exit(1);
  }
}

// 检查环境变量
if (process.env.ENABLE_REAL_HTTP_TESTS !== 'true') {
  console.log(chalk.yellow('⚠️  警告: 未设置 ENABLE_REAL_HTTP_TESTS=true'));
  console.log(chalk.gray('   设置环境变量以启用真实HTTP请求:'));
  console.log(chalk.cyan('   ENABLE_REAL_HTTP_TESTS=true tsx scripts/collect-pumc-real.ts'));
  console.log('');
  console.log(chalk.gray('   继续使用测试模式运行...\n'));
}

main();
