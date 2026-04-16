/**
 * 医生订阅CLI命令
 * 复用Tool的Schema和Handler
 */

import {
  SubscribeDoctorParametersSchema,
  createSubscribeDoctorHandler,
  ListDoctorsToolDefinition,
  createListDoctorsHandler,
  UnsubscribeDoctorParametersSchema,
  createUnsubscribeDoctorHandler,
  SetPrimaryDoctorParametersSchema,
  createSetPrimaryDoctorHandler,
  CheckDoctorSubscriptionStatusToolDefinition,
  createCheckDoctorSubscriptionStatusHandler,
} from '../../domains/subscription/doctor/doctor-subscription.tool';
import { getServices } from '../services/service-container';
import { parseArgs, toToolArgs } from '../utils/arg-parser';
import { printSuccess, printError, printHelp, printTable } from '../utils/output';
import type { CliCommand } from '../types';

const services = getServices();

// 订阅医生
async function subscribe(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw doctor subscribe',
      '订阅医生（必须先订阅医院）',
      'repsclaw doctor subscribe <医生姓名> --hospital=<医院名> [--department=科室名] [--primary]',
      [
        'repsclaw doctor subscribe "张医生" --hospital="北京协和医院"',
        'repsclaw doctor subscribe "李医生" --hospital="华山医院" --department="心内科" --primary',
      ]
    );
    return;
  }

  if (parsed._.length === 0) {
    printError('MISSING_NAME', '请提供医生姓名');
    return;
  }

  if (!parsed.hospital) {
    printError('MISSING_PARAM', '请提供 --hospital 参数（医生所属医院）');
    return;
  }

  try {
    const args = {
      doctorName: parsed._[0],
      hospitalName: parsed.hospital as string,
      department: parsed.department as string | undefined,
      isPrimary: parsed.primary === true || parsed.primary === 'true',
    };

    const validated = SubscribeDoctorParametersSchema.parse(args);
    const handler = createSubscribeDoctorHandler(services.doctorSubscription);
    const result = await handler(validated, { callStack: [] } as any);

    if (result.status === 'success') {
      printSuccess(result.data);

      // 如果有采集任务，显示进度追踪信息
      if (result.data?.collection) {
        console.log('\n📊 采集任务已启动:');
        console.log(`   任务ID: ${result.data.collection.jobId}`);
        console.log(`   进度追踪: ${result.data.collection.streamUrl}`);
        console.log(`   预计用时: ${result.data.collection.estimatedTime}`);
        console.log(`\n   使用以下命令查看实时进度:`);
        console.log(`   repsclaw progress stream ${result.data.collection.jobId}`);
      }
    } else {
      printError(result.error?.code || 'SUBSCRIBE_ERROR', result.error?.message || '订阅失败');
    }
  } catch (error) {
    printError('VALIDATION_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 列出已订阅医生
async function list(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw doctor list',
      '列出所有已订阅的医生',
      'repsclaw doctor list [--hospital=<医院名>]',
      [
        'repsclaw doctor list',
        'repsclaw doctor list --hospital="协和医院"',
      ]
    );
    return;
  }

  try {
    const args = {
      hospitalName: parsed.hospital as string | undefined,
    };

    const handler = createListDoctorsHandler(services.doctorSubscription);
    const result = await handler(args, { callStack: [] } as any);

    if (result.status === 'success') {
      const doctors = result.data?.doctors || [];
      if (doctors.length === 0) {
        console.log('您尚未订阅任何医生');
        return;
      }

      console.log(`\n已订阅 ${doctors.length} 位医生:\n`);
      for (const d of doctors) {
        const primaryMark = d.isPrimary ? '⭐ ' : '';
        const deptInfo = d.department ? ` [${d.department}]` : '';
        console.log(`  👨‍⚕️ ${primaryMark}${d.name}${deptInfo} (${d.hospital})`);
      }
      console.log();

      if (result.data?.primary) {
        console.log(`主要医生: ${result.data.primary.name} (${result.data.primary.hospital})`);
      }
      console.log();
    } else {
      printError(result.error?.code || 'LIST_ERROR', result.error?.message || '查询失败');
    }
  } catch (error) {
    printError('LIST_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 取消订阅
async function unsubscribe(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw doctor unsubscribe',
      '取消医生订阅',
      'repsclaw doctor unsubscribe <医生姓名> --hospital=<医院名>',
      ['repsclaw doctor unsubscribe "张医生" --hospital="北京协和医院"']
    );
    return;
  }

  if (parsed._.length === 0) {
    printError('MISSING_NAME', '请提供医生姓名');
    return;
  }

  if (!parsed.hospital) {
    printError('MISSING_PARAM', '请提供 --hospital 参数');
    return;
  }

  try {
    const args = {
      doctorName: parsed._[0],
      hospitalName: parsed.hospital as string,
    };

    const validated = UnsubscribeDoctorParametersSchema.parse(args);
    const handler = createUnsubscribeDoctorHandler(services.doctorSubscription);
    const result = await handler(validated, { callStack: [] } as any);

    if (result.status === 'success') {
      printSuccess(result.data);
    } else {
      printError(result.error?.code || 'UNSUBSCRIBE_ERROR', result.error?.message || '取消订阅失败');
    }
  } catch (error) {
    printError('VALIDATION_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 设置主要医生
async function setPrimary(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw doctor set-primary',
      '设置主要医生',
      'repsclaw doctor set-primary <医生姓名> --hospital=<医院名>',
      ['repsclaw doctor set-primary "张医生" --hospital="北京协和医院"']
    );
    return;
  }

  if (parsed._.length === 0) {
    printError('MISSING_NAME', '请提供医生姓名');
    return;
  }

  if (!parsed.hospital) {
    printError('MISSING_PARAM', '请提供 --hospital 参数');
    return;
  }

  try {
    const args = {
      doctorName: parsed._[0],
      hospitalName: parsed.hospital as string,
    };

    const validated = SetPrimaryDoctorParametersSchema.parse(args);
    const handler = createSetPrimaryDoctorHandler(services.doctorSubscription);
    const result = await handler(validated, { callStack: [] } as any);

    if (result.status === 'success') {
      printSuccess(result.data);
    } else {
      printError(result.error?.code || 'SET_PRIMARY_ERROR', result.error?.message || '设置主要医生失败');
    }
  } catch (error) {
    printError('VALIDATION_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 查看订阅状态
async function status(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw doctor status',
      '查看医生订阅状态统计',
      'repsclaw doctor status',
      ['repsclaw doctor status']
    );
    return;
  }

  try {
    const handler = createCheckDoctorSubscriptionStatusHandler(services.doctorSubscription);
    const result = await handler({}, { callStack: [] } as any);

    if (result.status === 'success') {
      printSuccess(result.data);
    } else {
      printError('STATUS_ERROR', '获取状态失败');
    }
  } catch (error) {
    printError('STATUS_ERROR', error instanceof Error ? error.message : String(error));
  }
}

export const doctorCommands: Record<string, (argv: string[]) => Promise<void>> = {
  subscribe,
  list,
  unsubscribe,
  'set-primary': setPrimary,
  status,
};

// 导出命令元数据用于文档生成
export const doctorCommandMetadata: CliCommand[] = [
  {
    name: 'doctor subscribe',
    description: '订阅医生（必须先订阅医院）',
    usage: 'repsclaw doctor subscribe <医生姓名> --hospital=<医院名> [--department=科室名] [--primary]',
    examples: [
      'repsclaw doctor subscribe "张医生" --hospital="北京协和医院"',
      'repsclaw doctor subscribe "李医生" --hospital="华山医院" --department="心内科" --primary',
    ],
    handler: subscribe,
  },
  {
    name: 'doctor list',
    description: '列出已订阅的医生',
    usage: 'repsclaw doctor list [--hospital=<医院名>]',
    examples: ['repsclaw doctor list', 'repsclaw doctor list --hospital="协和医院"'],
    handler: list,
  },
  {
    name: 'doctor unsubscribe',
    description: '取消医生订阅',
    usage: 'repsclaw doctor unsubscribe <医生姓名> --hospital=<医院名>',
    examples: ['repsclaw doctor unsubscribe "张医生" --hospital="北京协和医院"'],
    handler: unsubscribe,
  },
  {
    name: 'doctor set-primary',
    description: '设置主要医生',
    usage: 'repsclaw doctor set-primary <医生姓名> --hospital=<医院名>',
    examples: ['repsclaw doctor set-primary "张医生" --hospital="北京协和医院"'],
    handler: setPrimary,
  },
  {
    name: 'doctor status',
    description: '查看医生订阅状态',
    usage: 'repsclaw doctor status',
    examples: ['repsclaw doctor status'],
    handler: status,
  },
];
