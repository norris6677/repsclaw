/**
 * 微信搜索独立测试脚本
 * 专门测试搜狗微信搜索的反爬策略
 *
 * 用法: ENABLE_REAL_HTTP_TESTS=true tsx scripts/test-wechat-search.ts
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

async function main() {
  log('info', '🔍 微信搜索独立测试');
  log('info', '目标：测试强化版搜狗微信搜索反爬策略');

  // 初始化服务
  const rawSourceManager = new RawSourceManager();
  const progressService = new CollectionProgressService();
  const service = new KnowledgeCollectionService(rawSourceManager, undefined, progressService);

  // 统计事件
  const events: { type: string; timestamp: number; data: unknown }[] = [];
  const wechatResults: Array<{
    title: string;
    url: string;
    account: string;
    collectedAt: string;
  }> = [];

  // 监听进度事件
  progressService.on('progress', (event: { type: string; jobId: string; data: unknown }) => {
    events.push({ type: event.type, timestamp: Date.now(), data: event.data });

    switch (event.type) {
      case 'started': {
        log('info', '🚀 采集任务已启动', event.data);
        break;
      }

      case 'result': {
        const result = event.data as {
          sourceType: string;
          title: string;
          url: string;
          account?: string;
          collectedAt: string;
        };
        if (result.sourceType === 'wechat_search') {
          wechatResults.push({
            title: result.title,
            url: result.url,
            account: result.account || '未知',
            collectedAt: result.collectedAt,
          });
          log('success', `📱 微信文章: ${result.title.substring(0, 50)}...`);
        }
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

      case 'error': {
        const error = event.data as { source: string; message: string; isFatal: boolean };
        log('error', `❌ 采集错误: ${error.message.substring(0, 80)}`);
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
    // 启动只采集微信搜索的专项任务
    log('info', '📡 启动微信搜索专项采集...');

    // 使用 createJob + runCollectionWorker 创建自定义任务
    const job = (service as any).createJob({
      hospitalName: HOSPITAL_NAME,
      sourceTypes: ['wechat_search'],
      maxResults: 10,  // 限制数量，快速测试
      depth: 1,
      days: 30,
      isBootstrap: false,
    });

    // 启动 worker 执行采集
    (service as any).runCollectionWorker(job);

    log('info', '🔧 任务配置', {
      jobId: job.id,
      医院: job.config.hospitalName,
      数据源: job.config.sourceTypes,
      最大结果数: job.config.maxResults,
    });

    // 等待任务完成（微信搜索专用超时：10分钟）
    const startTime = Date.now();
    const maxWaitTime = 10 * 60 * 1000;

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
    log('success', '🏁 微信搜索测试完成', {
      状态: finalJob?.status,
      微信文章数: wechatResults.length,
      总条目: finalJob?.results.length,
      错误数: finalJob?.errors.length,
    });

    // 列出采集的微信文章
    if (wechatResults.length > 0) {
      console.log(chalk.cyan('\n📱 采集到的微信文章:'));
      wechatResults.forEach((item, i) => {
        console.log(`  ${i + 1}. ${chalk.white(item.title.substring(0, 60))}${item.title.length > 60 ? '...' : ''}`);
        console.log(`     ${chalk.gray(item.account)} | ${chalk.gray(item.url.substring(0, 60))}...`);
      });
    }

    // 保存测试结果
    const testResultPath = path.join(DATA_DIR, `wechat-test-${Date.now()}.json`);
    fs.writeFileSync(
      testResultPath,
      JSON.stringify(
        {
          hospital: HOSPITAL_NAME,
          jobId: job.id,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date().toISOString(),
          wechatResults,
          finalJob,
          events,
        },
        null,
        2
      )
    );
    log('success', `📝 测试结果已保存: ${testResultPath}`);

    console.log(chalk.green('='.repeat(80)));

    // 清理
    const activeJobs = service.getActiveJobs();
    for (const activeJob of activeJobs) {
      service.cancelJob(activeJob.id);
    }

    process.exit(0);
  } catch (error) {
    log('error', '💥 测试过程发生错误', error);
    process.exit(1);
  }
}

// 检查环境变量
if (process.env.ENABLE_REAL_HTTP_TESTS !== 'true') {
  console.log(chalk.yellow('⚠️  警告: 未设置 ENABLE_REAL_HTTP_TESTS=true'));
  console.log(chalk.gray('   设置环境变量以启用真实HTTP请求:'));
  console.log(chalk.cyan('   ENABLE_REAL_HTTP_TESTS=true tsx scripts/test-wechat-search.ts'));
  console.log('');
  console.log(chalk.gray('   继续使用测试模式运行...\n'));
}

main();
