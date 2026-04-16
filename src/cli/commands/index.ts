/**
 * CLI命令注册中心
 * 所有命令在此注册
 */

import { hospitalCommands } from './hospital.cmd';
import { doctorCommands } from './doctor.cmd';
import { queryCommands } from './query.cmd';
import { newsCommands } from './news.cmd';
import { collectionCommands } from './collection.cmd';
import { progressCommands } from './progress.cmd';
import { wikiCommands } from './wiki.cmd';

export interface CommandModule {
  [key: string]: (argv: string[]) => Promise<void>;
}

// 顶级命令映射
export const commands: Record<string, CommandModule> = {
  hospital: hospitalCommands,
  doctor: doctorCommands,
  query: queryCommands,
  news: newsCommands,
  collection: collectionCommands,
  progress: progressCommands,
  wiki: wikiCommands,
};

// 获取命令帮助信息
export function getCommandHelp(): Record<string, string> {
  return {
    hospital: '医院订阅管理',
    doctor: '医生订阅管理',
    query: '医疗数据查询 (FDA, PubMed, ICD-10, Clinical Trials, medRxiv, NCI Bookshelf)',
    news: '医院新闻查询',
    collection: '知识采集管理（初次查询、定期查询）',
    progress: '采集进度追踪（SSE实时流、摘要查看）',
    wiki: 'Wiki 知识库管理（查询、Ingest、Lint）',
  };
}
