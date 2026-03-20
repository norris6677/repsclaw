#!/usr/bin/env node
/**
 * Repsclaw CLI 入口
 *
 * 命令格式: repsclaw <module> <command> [args...]
 *
 * 示例:
 *   repsclaw hospital subscribe "北京协和医院" --primary
 *   repsclaw query pubmed --term="diabetes"
 */

import { commands, getCommandHelp } from './commands';

const VERSION = '2.0.0';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  if (args[0] === '--version' || args[0] === '-v') {
    console.log(`repsclaw v${VERSION}`);
    process.exit(0);
  }

  const [module, command, ...restArgs] = args;

  // 检查模块是否存在
  if (!commands[module]) {
    console.error(`错误: 未知模块 "${module}"`);
    console.error(`可用模块: ${Object.keys(commands).join(', ')}`);
    process.exit(1);
  }

  const moduleCommands = commands[module];

  // 如果没有指定命令或请求帮助，显示模块帮助
  if (!command || command === '--help' || command === '-h') {
    printModuleHelp(module, moduleCommands);
    process.exit(0);
  }

  // 检查命令是否存在
  const cmd = moduleCommands[command] || moduleCommands['default'];
  if (!cmd) {
    console.error(`错误: 未知命令 "${command}"`);
    console.error(`可用命令: ${Object.keys(moduleCommands).join(', ')}`);
    process.exit(1);
  }

  // 执行命令
  try {
    await cmd(restArgs);
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          status: 'error',
          error: {
            code: 'CLI_ERROR',
            message: error instanceof Error ? error.message : String(error),
          },
          meta: { timestamp: new Date().toISOString() },
        },
        null,
        2
      )
    );
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
repsclaw v${VERSION} - Repsclaw Healthcare Plugin CLI

Usage:
  repsclaw <module> <command> [options]

Modules:
${Object.entries(getCommandHelp())
  .map(([name, desc]) => `  ${name.padEnd(10)} ${desc}`)
  .join('\n')}

Examples:
  repsclaw hospital subscribe "北京协和医院" --primary
  repsclaw hospital list
  repsclaw query pubmed --term="diabetes treatment"
  repsclaw query fda --drug="Aspirin"
  repsclaw news --hospital="协和医院"

Help:
  repsclaw <module> --help    显示模块帮助
  repsclaw <module> <cmd> -h  显示命令帮助
`);
}

function printModuleHelp(module: string, moduleCommands: Record<string, unknown>): void {
  const moduleDesc = getCommandHelp()[module];
  console.log(`
repsclaw ${module} - ${moduleDesc}

Commands:
${Object.keys(moduleCommands)
  .map((cmd) => `  ${cmd}`)
  .join('\n')}

Use "repsclaw ${module} <command> -h" for command help.
`);
}

main();
