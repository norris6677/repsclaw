/**
 * 医院订阅CLI命令
 * 复用Tool的Schema和Handler
 */

import {
  SubscribeHospitalParametersSchema,
  createSubscribeHospitalHandler,
  ListHospitalsToolDefinition,
  createListHospitalsHandler,
  UnsubscribeHospitalParametersSchema,
  createUnsubscribeHospitalHandler,
  SetPrimaryHospitalParametersSchema,
  createSetPrimaryHospitalHandler,
  CheckSubscriptionStatusToolDefinition,
  createCheckSubscriptionStatusHandler,
} from '../../domains/subscription/hospital/hospital-subscription.tool';
import { getServices } from '../services/service-container';
import { parseArgs, toToolArgs } from '../utils/arg-parser';
import { printSuccess, printError, printHelp, printTable } from '../utils/output';
import type { CliCommand } from '../types';

const services = getServices();

// 订阅医院
async function subscribe(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw hospital subscribe',
      '订阅医院并可选设置为主要医院',
      'repsclaw hospital subscribe <医院名称> [--primary] [--department=科室名]',
      [
        'repsclaw hospital subscribe "北京协和医院"',
        'repsclaw hospital subscribe "华山医院" --primary',
        'repsclaw hospital subscribe "协和医院" --department=心内科',
      ]
    );
    return;
  }

  if (parsed._.length === 0) {
    printError('MISSING_NAME', '请提供医院名称');
    return;
  }

  try {
    const args = {
      name: parsed._[0],
      isPrimary: parsed.primary === true || parsed.primary === 'true',
      department: parsed.department as string | undefined,
    };

    const validated = SubscribeHospitalParametersSchema.parse(args);
    const handler = createSubscribeHospitalHandler(services.hospitalSubscription);
    const result = await handler(validated, { callStack: [] } as any);

    if (result.status === 'success') {
      printSuccess(result.data);
    } else {
      printError(result.error?.code || 'SUBSCRIBE_ERROR', result.error?.message || '订阅失败');
    }
  } catch (error) {
    printError('VALIDATION_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 列出已订阅医院
async function list(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw hospital list',
      '列出所有已订阅的医院',
      'repsclaw hospital list',
      ['repsclaw hospital list']
    );
    return;
  }

  try {
    const handler = createListHospitalsHandler(services.hospitalSubscription);
    const result = await handler({}, { callStack: [] } as any);

    if (result.status === 'success') {
      // 格式化为表格输出
      const hospitals = result.data?.hospitals || [];
      if (hospitals.length === 0) {
        console.log('您尚未订阅任何医院');
        return;
      }

      console.log(`\n已订阅 ${hospitals.length} 家医院:\n`);
      for (const h of hospitals) {
        const primary = h.isPrimary ? ' [主要]' : '';
        console.log(`  🏥 ${h.name}${primary}`);
        if (h.departments?.length > 0) {
          console.log(`     📋 科室: ${h.departments.join('、')}`);
        }
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
      'repsclaw hospital unsubscribe',
      '取消医院订阅或特定科室订阅',
      'repsclaw hospital unsubscribe <医院名称> [--department=科室名]',
      [
        'repsclaw hospital unsubscribe "北京协和医院"',
        'repsclaw hospital unsubscribe "华山医院" --department=心内科',
      ]
    );
    return;
  }

  if (parsed._.length === 0) {
    printError('MISSING_NAME', '请提供医院名称');
    return;
  }

  try {
    const args = {
      name: parsed._[0],
      department: parsed.department as string | undefined,
    };

    const validated = UnsubscribeHospitalParametersSchema.parse(args);
    const handler = createUnsubscribeHospitalHandler(services.hospitalSubscription);
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

// 设置主要医院
async function setPrimary(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw hospital set-primary',
      '设置主要医院',
      'repsclaw hospital set-primary <医院名称>',
      ['repsclaw hospital set-primary "北京协和医院"']
    );
    return;
  }

  if (parsed._.length === 0) {
    printError('MISSING_NAME', '请提供医院名称');
    return;
  }

  try {
    const args = {
      name: parsed._[0],
    };

    const validated = SetPrimaryHospitalParametersSchema.parse(args);
    const handler = createSetPrimaryHospitalHandler(services.hospitalSubscription);
    const result = await handler(validated, { callStack: [] } as any);

    if (result.status === 'success') {
      printSuccess(result.data);
    } else {
      printError(result.error?.code || 'SET_PRIMARY_ERROR', result.error?.message || '设置主要医院失败');
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
      'repsclaw hospital status',
      '查看医院订阅状态统计',
      'repsclaw hospital status',
      ['repsclaw hospital status']
    );
    return;
  }

  try {
    const handler = createCheckSubscriptionStatusHandler(services.hospitalSubscription);
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

// 导出命令定义
export const hospitalCommands: Record<string, (argv: string[]) => Promise<void>> = {
  subscribe,
  list,
  unsubscribe,
  'set-primary': setPrimary,
  status,
};

// 导出命令元数据用于文档生成
export const hospitalCommandMetadata: CliCommand[] = [
  {
    name: 'hospital subscribe',
    description: '订阅医院',
    usage: 'repsclaw hospital subscribe <医院名称> [--primary] [--department=科室名]',
    examples: [
      'repsclaw hospital subscribe "北京协和医院"',
      'repsclaw hospital subscribe "华山医院" --primary',
    ],
    handler: subscribe,
  },
  {
    name: 'hospital list',
    description: '列出已订阅的医院',
    usage: 'repsclaw hospital list',
    examples: ['repsclaw hospital list'],
    handler: list,
  },
  {
    name: 'hospital unsubscribe',
    description: '取消医院订阅',
    usage: 'repsclaw hospital unsubscribe <医院名称> [--department=科室名]',
    examples: ['repsclaw hospital unsubscribe "北京协和医院"'],
    handler: unsubscribe,
  },
  {
    name: 'hospital set-primary',
    description: '设置主要医院',
    usage: 'repsclaw hospital set-primary <医院名称>',
    examples: ['repsclaw hospital set-primary "北京协和医院"'],
    handler: setPrimary,
  },
  {
    name: 'hospital status',
    description: '查看订阅状态',
    usage: 'repsclaw hospital status',
    examples: ['repsclaw hospital status'],
    handler: status,
  },
];
