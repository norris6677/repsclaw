/**
 * 知识采集CLI命令
 * 管理初次查询(Bootstrap)和定期查询(Incremental)采集任务
 */

import { getServices } from '../services/service-container';
import { parseArgs } from '../utils/arg-parser';
import { printSuccess, printError, printHelp } from '../utils/output';
import type { CliCommand } from '../types';
import { CollectionJobStatus } from '../../types/knowledge-collection.types';

const services = getServices();

// 启动 Agent 驱动的智能采集
async function agent(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw collection agent',
      '启动 LLM 驱动的 Agent 采集（并行多源深度采集）',
      'repsclaw collection agent --hospital=<医院名称> [--department=<科室>] [--doctor=<医生>] [--days=7]',
      [
        'repsclaw collection agent --hospital="北京协和医院"',
        'repsclaw collection agent --hospital="北京协和医院" --department="心内科"',
        'repsclaw collection agent --hospital="北京协和医院" --doctor="张医生" --days=14',
      ]
    );
    return;
  }

  if (!parsed.hospital) {
    printError('MISSING_PARAM', '请提供 --hospital 参数');
    return;
  }

  try {
    const days = parsed.days ? parseInt(parsed.days as string, 10) : 7;
    const job = await services.knowledgeCollection.startAgentCollection({
      hospitalName: parsed.hospital as string,
      departmentName: parsed.department as string | undefined,
      doctorName: parsed.doctor as string | undefined,
      days,
    });

    printSuccess({
      message: `已启动 Agent 智能采集`,
      job: {
        id: job.id,
        hospital: parsed.hospital,
        department: parsed.department,
        doctor: parsed.doctor,
        days,
        status: job.status,
        estimatedTime: '15-30分钟',
      },
      commands: {
        stream: `repsclaw progress stream ${job.id}`,
        status: `repsclaw progress status ${job.id}`,
      },
    });
  } catch (error) {
    printError('AGENT_COLLECTION_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 启动医院全量采集（初次查询）
async function bootstrap(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw collection bootstrap',
      '启动医院全量采集（初次查询，回溯90天）',
      'repsclaw collection bootstrap --hospital=<医院名称>',
      [
        'repsclaw collection bootstrap --hospital="北京协和医院"',
        'repsclaw collection bootstrap --hospital="华山医院"',
      ]
    );
    return;
  }

  if (!parsed.hospital) {
    printError('MISSING_PARAM', '请提供 --hospital 参数');
    return;
  }

  try {
    const job = await services.knowledgeCollection.startBootstrapCollection(
      parsed.hospital as string
    );

    printSuccess({
      message: `已启动医院全量采集`,
      job: {
        id: job.id,
        hospital: parsed.hospital,
        status: job.status,
        estimatedTime: '15-20分钟',
      },
      commands: {
        stream: `repsclaw progress stream ${job.id}`,
        status: `repsclaw progress status ${job.id}`,
      },
    });
  } catch (error) {
    printError('BOOTSTRAP_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 启动增量采集（定期查询）
async function incremental(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw collection incremental',
      '启动医院增量采集（定期查询，默认最近7天）',
      'repsclaw collection incremental --hospital=<医院名称> [--days=7]',
      [
        'repsclaw collection incremental --hospital="北京协和医院"',
        'repsclaw collection incremental --hospital="华山医院" --days=3',
      ]
    );
    return;
  }

  if (!parsed.hospital) {
    printError('MISSING_PARAM', '请提供 --hospital 参数');
    return;
  }

  try {
    const days = parsed.days ? parseInt(parsed.days as string, 10) : 7;
    const job = await services.knowledgeCollection.startIncrementalCollection(
      parsed.hospital as string,
      days
    );

    printSuccess({
      message: `已启动医院增量采集`,
      job: {
        id: job.id,
        hospital: parsed.hospital,
        days,
        status: job.status,
        estimatedTime: '5-10分钟',
      },
      commands: {
        stream: `repsclaw progress stream ${job.id}`,
        status: `repsclaw progress status ${job.id}`,
      },
    });
  } catch (error) {
    printError('INCREMENTAL_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 启动医生信息采集
async function doctor(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw collection doctor',
      '启动医生信息采集（查询医生相关信息）',
      'repsclaw collection doctor --hospital=<医院名称> --doctor=<医生姓名> [--days=30] [--bootstrap]',
      [
        'repsclaw collection doctor --hospital="北京协和医院" --doctor="张医生"',
        'repsclaw collection doctor --hospital="华山医院" --doctor="李医生" --days=90 --bootstrap',
      ]
    );
    return;
  }

  if (!parsed.hospital) {
    printError('MISSING_PARAM', '请提供 --hospital 参数');
    return;
  }

  if (!parsed.doctor) {
    printError('MISSING_PARAM', '请提供 --doctor 参数');
    return;
  }

  try {
    const days = parsed.days ? parseInt(parsed.days as string, 10) : 30;
    const isBootstrap = parsed.bootstrap === true || parsed.bootstrap === 'true';

    const job = await services.knowledgeCollection.startDoctorCollection(
      parsed.hospital as string,
      parsed.doctor as string,
      { days, isBootstrap }
    );

    printSuccess({
      message: `已启动医生信息采集`,
      job: {
        id: job.id,
        hospital: parsed.hospital,
        doctor: parsed.doctor,
        days,
        isBootstrap,
        status: job.status,
        estimatedTime: isBootstrap ? '10-15分钟' : '5-8分钟',
      },
      commands: {
        stream: `repsclaw progress stream ${job.id}`,
        status: `repsclaw progress status ${job.id}`,
      },
    });
  } catch (error) {
    printError('DOCTOR_COLLECTION_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 启动科室信息采集
async function department(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw collection department',
      '启动科室信息采集（查询科室相关信息）',
      'repsclaw collection department --hospital=<医院名称> --department=<科室名称> [--days=30] [--bootstrap]',
      [
        'repsclaw collection department --hospital="北京协和医院" --department="心内科"',
        'repsclaw collection department --hospital="华山医院" --department="神经外科" --days=60 --bootstrap',
      ]
    );
    return;
  }

  if (!parsed.hospital) {
    printError('MISSING_PARAM', '请提供 --hospital 参数');
    return;
  }

  if (!parsed.department) {
    printError('MISSING_PARAM', '请提供 --department 参数');
    return;
  }

  try {
    const days = parsed.days ? parseInt(parsed.days as string, 10) : 30;
    const isBootstrap = parsed.bootstrap === true || parsed.bootstrap === 'true';

    const job = await services.knowledgeCollection.startDepartmentCollection(
      parsed.hospital as string,
      parsed.department as string,
      { days, isBootstrap }
    );

    printSuccess({
      message: `已启动科室信息采集`,
      job: {
        id: job.id,
        hospital: parsed.hospital,
        department: parsed.department,
        days,
        isBootstrap,
        status: job.status,
        estimatedTime: isBootstrap ? '10-15分钟' : '5-8分钟',
      },
      commands: {
        stream: `repsclaw progress stream ${job.id}`,
        status: `repsclaw progress status ${job.id}`,
      },
    });
  } catch (error) {
    printError('DEPARTMENT_COLLECTION_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 列出所有采集任务
async function list(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw collection list',
      '列出所有采集任务',
      'repsclaw collection list [--active]',
      [
        'repsclaw collection list',
        'repsclaw collection list --active',
      ]
    );
    return;
  }

  try {
    let jobs = services.knowledgeCollection.getAllJobs();

    if (parsed.active) {
      jobs = jobs.filter(j => j.status === CollectionJobStatus.RUNNING);
    }

    if (jobs.length === 0) {
      console.log('暂无采集任务');
      return;
    }

    console.log(`\n采集任务列表 (${jobs.length} 个):\n`);
    console.log('ID                                    医院              目标         状态      进度');
    console.log('-'.repeat(100));

    for (const job of jobs.slice(0, 20)) {
      const target = job.config.targetName
        ? `${job.config.targetType === 'doctor' ? '👨‍⚕️' : '🏥'} ${job.config.targetName}`
        : '🏥 全院';
      const progress = `${job.progress.completed}/${job.progress.total}`;
      const statusIcon = job.status === 'running' ? '▶️' :
                         job.status === 'completed' ? '✅' :
                         job.status === 'failed' ? '❌' : '⏸️';

      console.log(
        `${job.id.substring(0, 36)}  ${job.config.hospitalName.padEnd(16)}  ${target.padEnd(20)}  ${statusIcon} ${job.status.padEnd(10)}  ${progress}`
      );
    }

    if (jobs.length > 20) {
      console.log(`\n... 还有 ${jobs.length - 20} 个任务`);
    }
    console.log();
  } catch (error) {
    printError('LIST_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 查看任务详情
async function status(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw collection status',
      '查看采集任务详情',
      'repsclaw collection status <job-id>',
      ['repsclaw collection status abc123...']
    );
    return;
  }

  if (parsed._.length === 0) {
    printError('MISSING_PARAM', '请提供任务ID');
    return;
  }

  const jobId = parsed._[0];

  try {
    const job = services.knowledgeCollection.getJobStatus(jobId);

    if (!job) {
      printError('NOT_FOUND', `未找到任务 ${jobId}`);
      return;
    }

    const duration = job.startedAt && job.completedAt
      ? `${Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)}秒`
      : job.startedAt
        ? '进行中...'
        : '未开始';

    printSuccess({
      job: {
        id: job.id,
        status: job.status,
        config: job.config,
        progress: job.progress,
        results: job.results.length,
        errors: job.errors.length,
        duration,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      },
    });
  } catch (error) {
    printError('STATUS_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 取消采集任务
async function cancel(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw collection cancel',
      '取消正在运行的采集任务',
      'repsclaw collection cancel <job-id>',
      ['repsclaw collection cancel abc123...']
    );
    return;
  }

  if (parsed._.length === 0) {
    printError('MISSING_PARAM', '请提供任务ID');
    return;
  }

  const jobId = parsed._[0];

  try {
    const success = services.knowledgeCollection.cancelJob(jobId);

    if (success) {
      printSuccess({ message: `已取消任务 ${jobId}` });
    } else {
      printError('CANCEL_FAILED', `无法取消任务 ${jobId}，可能任务不存在或已完成`);
    }
  } catch (error) {
    printError('CANCEL_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 查看采集统计
async function stats(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw collection stats',
      '查看全局采集统计',
      'repsclaw collection stats',
      ['repsclaw collection stats']
    );
    return;
  }

  try {
    const stats = services.knowledgeCollection.getStats();

    printSuccess({
      stats: {
        总任务数: stats.totalJobs,
        运行中: stats.activeJobs,
        已完成: stats.completedJobs,
        失败: stats.failedJobs,
        数据源总数: stats.totalSources,
        去重数: stats.duplicatesFiltered,
        存储大小: `${Math.round(stats.storageSize / 1024 / 1024)}MB`,
      },
    });
  } catch (error) {
    printError('STATS_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 批量启动所有医院的增量采集
async function runAll(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw collection run-all',
      '批量启动所有已订阅医院的增量采集',
      'repsclaw collection run-all [--days=7]',
      [
        'repsclaw collection run-all',
        'repsclaw collection run-all --days=3',
      ]
    );
    return;
  }

  try {
    const days = parsed.days ? parseInt(parsed.days as string, 10) : 7;
    const jobs = await services.knowledgeCollection.runIncrementalForAll(days);

    printSuccess({
      message: `已为 ${jobs.length} 家医院启动增量采集`,
      jobs: jobs.map(job => ({
        id: job.id,
        hospital: job.config.hospitalName,
        status: job.status,
      })),
    });
  } catch (error) {
    printError('RUN_ALL_ERROR', error instanceof Error ? error.message : String(error));
  }
}

export const collectionCommands: Record<string, (argv: string[]) => Promise<void>> = {
  agent,
  bootstrap,
  incremental,
  doctor,
  department,
  list,
  status,
  cancel,
  stats,
  'run-all': runAll,
};

// 导出命令元数据用于文档生成
export const collectionCommandMetadata: CliCommand[] = [
  {
    name: 'collection agent',
    description: '启动 LLM 驱动的 Agent 采集（并行多源深度采集）',
    usage: 'repsclaw collection agent --hospital=<医院名称> [--department=<科室>] [--doctor=<医生>] [--days=7]',
    examples: [
      'repsclaw collection agent --hospital="北京协和医院"',
      'repsclaw collection agent --hospital="北京协和医院" --department="心内科"',
    ],
    handler: agent,
  },
  {
    name: 'collection bootstrap',
    description: '启动医院全量采集（初次查询）',
    usage: 'repsclaw collection bootstrap --hospital=<医院名称>',
    examples: ['repsclaw collection bootstrap --hospital="北京协和医院"'],
    handler: bootstrap,
  },
  {
    name: 'collection incremental',
    description: '启动医院增量采集（定期查询）',
    usage: 'repsclaw collection incremental --hospital=<医院名称> [--days=7]',
    examples: ['repsclaw collection incremental --hospital="北京协和医院" --days=7'],
    handler: incremental,
  },
  {
    name: 'collection doctor',
    description: '启动医生信息采集',
    usage: 'repsclaw collection doctor --hospital=<医院名称> --doctor=<医生姓名> [--days=30] [--bootstrap]',
    examples: ['repsclaw collection doctor --hospital="北京协和医院" --doctor="张医生"'],
    handler: doctor,
  },
  {
    name: 'collection department',
    description: '启动科室信息采集',
    usage: 'repsclaw collection department --hospital=<医院名称> --department=<科室名称> [--days=30] [--bootstrap]',
    examples: ['repsclaw collection department --hospital="北京协和医院" --department="心内科"'],
    handler: department,
  },
  {
    name: 'collection list',
    description: '列出所有采集任务',
    usage: 'repsclaw collection list [--active]',
    examples: ['repsclaw collection list', 'repsclaw collection list --active'],
    handler: list,
  },
  {
    name: 'collection status',
    description: '查看采集任务详情',
    usage: 'repsclaw collection status <job-id>',
    examples: ['repsclaw collection status abc123...'],
    handler: status,
  },
  {
    name: 'collection cancel',
    description: '取消采集任务',
    usage: 'repsclaw collection cancel <job-id>',
    examples: ['repsclaw collection cancel abc123...'],
    handler: cancel,
  },
  {
    name: 'collection stats',
    description: '查看采集统计',
    usage: 'repsclaw collection stats',
    examples: ['repsclaw collection stats'],
    handler: stats,
  },
  {
    name: 'collection run-all',
    description: '批量启动所有医院增量采集',
    usage: 'repsclaw collection run-all [--days=7]',
    examples: ['repsclaw collection run-all'],
    handler: runAll,
  },
];
