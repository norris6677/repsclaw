/**
 * 医院新闻CLI命令
 */

import { getServices } from '../services/service-container';
import { parseArgs } from '../utils/arg-parser';
import { printSuccess, printError, printHelp } from '../utils/output';

const services = getServices();

async function news(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw news',
      '查询医院新闻',
      'repsclaw news --hospital=<医院名> [--limit=10]',
      [
        'repsclaw news --hospital="北京协和医院"',
        'repsclaw news --hospital="华山医院" --limit=5',
      ]
    );
    return;
  }

  if (!parsed.hospital) {
    printError('MISSING_PARAM', '请提供 --hospital 参数');
    return;
  }

  try {
    const result = await services.hospitalNews.getNews({
      hospitalName: parsed.hospital as string,
      limit: parsed.limit ? parseInt(parsed.limit as string, 10) : 10,
    });
    printSuccess(result);
  } catch (error) {
    printError('NEWS_ERROR', error instanceof Error ? error.message : String(error));
  }
}

export const newsCommands: Record<string, (argv: string[]) => Promise<void>> = {
  default: news,
};
