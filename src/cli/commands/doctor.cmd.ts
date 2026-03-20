/**
 * 医生订阅CLI命令
 */

import { getServices } from '../services/service-container';
import { parseArgs } from '../utils/arg-parser';
import { printSuccess, printError, printHelp } from '../utils/output';

const services = getServices();

// 订阅医生
async function subscribe(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw doctor subscribe',
      '订阅医生',
      'repsclaw doctor subscribe <医生姓名> [--hospital=医院名]',
      [
        'repsclaw doctor subscribe "张医生"',
        'repsclaw doctor subscribe "李医生" --hospital="协和医院"',
      ]
    );
    return;
  }

  if (parsed._.length === 0) {
    printError('MISSING_NAME', '请提供医生姓名');
    return;
  }

  try {
    const result = await services.doctorSubscription.subscribe({
      name: parsed._[0],
      hospital: parsed.hospital as string | undefined,
    });
    printSuccess(result);
  } catch (error) {
    printError('SUBSCRIBE_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 列出已订阅医生
async function list(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw doctor list',
      '列出所有已订阅的医生',
      'repsclaw doctor list',
      ['repsclaw doctor list']
    );
    return;
  }

  try {
    const doctors = services.doctorSubscription.getDoctors();
    console.log(`\n已订阅 ${doctors.length} 位医生:\n`);
    for (const d of doctors) {
      const hospital = d.hospital ? ` (${d.hospital})` : '';
      console.log(`  👨‍⚕️ ${d.name}${hospital}`);
    }
    console.log();
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
      'repsclaw doctor unsubscribe <医生姓名>',
      ['repsclaw doctor unsubscribe "张医生"']
    );
    return;
  }

  if (parsed._.length === 0) {
    printError('MISSING_NAME', '请提供医生姓名');
    return;
  }

  try {
    const result = await services.doctorSubscription.unsubscribe(parsed._[0]);
    if (result) {
      printSuccess({ message: `已取消订阅 ${parsed._[0]}` });
    } else {
      printError('NOT_FOUND', `未找到 ${parsed._[0]} 的订阅`);
    }
  } catch (error) {
    printError('UNSUBSCRIBE_ERROR', error instanceof Error ? error.message : String(error));
  }
}

export const doctorCommands: Record<string, (argv: string[]) => Promise<void>> = {
  subscribe,
  list,
  unsubscribe,
};
