/**
 * CLI参数解析器
 * 将命令行参数解析为结构化对象
 */

import type { ParsedArgs } from '../types';

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    _: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith('--')) {
      // 长选项 --key=value 或 --key
      const eqIndex = arg.indexOf('=');
      if (eqIndex !== -1) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        result[key] = value;
      } else {
        const key = arg.slice(2);
        // 检查下一个参数是否是值
        if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
          result[key] = argv[i + 1];
          i++;
        } else {
          result[key] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      // 短选项 -k value 或 -k
      const key = arg.slice(1);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        result[key] = argv[i + 1];
        i++;
      } else {
        result[key] = true;
      }
    } else {
      // 位置参数
      result._.push(arg);
    }
  }

  return result;
}

/**
 * 将解析后的参数转换为Tool Handler期望的格式
 */
export function toToolArgs(parsed: ParsedArgs): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // 位置参数作为name或第一个参数
  if (parsed._.length > 0) {
    result.name = parsed._[0];
  }

  // 其他参数
  for (const [key, value] of Object.entries(parsed)) {
    if (key !== '_') {
      result[key] = value;
    }
  }

  return result;
}

/**
 * 验证必需参数
 */
export function validateRequired(
  parsed: ParsedArgs,
  required: string[]
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const param of required) {
    if (parsed[param] === undefined && !parsed._.includes(param)) {
      missing.push(param);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}
