/**
 * CLI类型定义
 */

export interface CliCommand {
  name: string;
  description: string;
  usage: string;
  examples: string[];
  handler: (args: string[]) => Promise<void>;
}

export interface CliContext {
  serviceInstances: Map<string, unknown>;
}

export interface ParsedArgs {
  _: string[]; // 位置参数
  [key: string]: string | boolean | string[] | undefined;
}
