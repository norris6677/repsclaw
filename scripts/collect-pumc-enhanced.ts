/**
 * 北京协和医院增强版采集测试
 * 重点测试：
 * 1. 微信搜索反爬策略
 * 2. 医院官网深度采集
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

function log(level: 'info' | 'success' | 'warn' | 'error', message: string, data?: unknown) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const prefix = { info: chalk.blue('ℹ'), success: chalk.green('✓'), warn: chalk.yellow('⚠'), error: chalk.red('✗') }[level];
  console.log(`${chalk.gray(`[${timestamp}]`)} ${prefix} ${message}`);
  if (data) console.log(chalk.gray('  →'), data);
}

function renderProgressBar(percent: number, width: number = 40): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  return `[${bar}] ${percent.toFixed(1)}%`;
}

async function main() {
  log('info', '🏥 北京协和医院增强版采集测试');
  log('info', '🔍 重点：微信搜索反爬 + 医院官网深度采集');

  const rawSourceManager = new RawSourceManager();
  const progressService = new CollectionProgressService();
  const service = new KnowledgeCollectionService(rawSourceManager, undefined, progressService);

  const events: { type: string; timestamp: number; data: unknown }[] = [];

  progressService.on('progress', (event: { type: string; jobId: string; data: unknown }) => {
    events.push({ type: event.type, timestamp: Date.now(), data: event.data });

    switch (event.type) {
      case 'started':
        log('info', '🚀 任务启动', event.data);
        break;
      case 'progress': {
        const p = event.data as { total: number; completed: number; failed: number; duplicates: number };
        const percent = p.total > 0 ? (p.completed / p.total) * 100 : 0;
        console.log(`[${new Date().toISOString().substring(11, 19)}] ${renderProgressBar(percent)} | 完成:${p.completed} 失败:${p.failed} 去重:${p.duplicates}`);
        break;
      }
      case 'source_complete': {
        const d = event.data as { sourceType: string; itemCount: number; duration: number };
        log('success', `✅ ${d.sourceType}: ${d.itemCount}条 (${(d.duration/1000).toFixed(1)}s)`);
        break;
      }
      case 'error': {
        const e = event.data as { source: string; message: string };
        log('error', `❌ ${e.source}: ${e.message.substring(0, 80)}`);
        break;
      }
      case 'completed':
        log('success', '🎉 任务完成', event.data);
        break;
    }
  });

  try {
    // 只测试微信搜索和医院官网
    log('info', '📡 启动专项采集（wechat_search + hospital_official）...');

    const job = await service.startBootstrapCollection(HOSPITAL_NAME);

    log('info', '🔧 任务配置', {
      jobId: job.id,
      医院: job.config.hospitalName,
      数据源: job.config.sourceTypes,
      深度: job.config.depth,
    });

    // 等待完成（延长超时到15分钟）
    const startTime = Date.now();
    const maxWaitTime = 15 * 60 * 1000;

    const finalJob = await new Promise<typeof job>((resolve) => {
      const checkInterval = setInterval(() => {
        const current = service.getJobStatus(job.id);
        const elapsed = Date.now() - startTime;

        if (
          current?.status === CollectionJobStatus.COMPLETED ||
          current?.status === CollectionJobStatus.FAILED ||
          current?.status === CollectionJobStatus.CANCELLED
        ) {
          clearInterval(checkInterval);
          resolve(current);
        }

        if (elapsed > maxWaitTime) {
          log('warn', '⏱️ 采集超时，取消任务');
          service.cancelJob(job.id);
          clearInterval(checkInterval);
          resolve(current);
        }
      }, 1000);
    });

    // 结果统计
    console.log('\n' + chalk.green('='.repeat(80)));
    log('success', '🏁 采集完成', {
      状态: finalJob?.status,
      总条目: finalJob?.results.length,
      进度: finalJob?.progress,
    });

    const status = service.getHospitalCollectionStatus(HOSPITAL_NAME);
    log('info', '📊 数据源分布', status.sourceTypeDistribution);

    // 保存日志
    const logPath = path.join(DATA_DIR, `pumc-enhanced-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify({ hospital: HOSPITAL_NAME, events, finalJob, status }, null, 2));
    log('success', `📝 日志已保存: ${logPath}`);

    // 列出采集文件
    const hospitalDir = path.join(DATA_DIR, 'hospitals', HOSPITAL_NAME, 'contents');
    if (fs.existsSync(hospitalDir)) {
      const files = fs.readdirSync(hospitalDir);
      const bySource: Record<string, number> = {};
      for (const f of files) {
        const match = f.match(/_(\w+)_/);
        if (match) {
          bySource[match[1]] = (bySource[match[1]] || 0) + 1;
        }
      }
      log('info', '📁 采集文件统计', bySource);
    }

    console.log(chalk.green('='.repeat(80)));
    process.exit(0);
  } catch (error) {
    log('error', '💥 错误', error);
    process.exit(1);
  }
}

main();
