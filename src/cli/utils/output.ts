/**
 * CLI输出格式化工具
 */

export function printSuccess(data: unknown): void {
  const output = {
    status: 'success',
    data,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };
  console.log(JSON.stringify(output, null, 2));
}

export function printError(code: string, message: string, details?: unknown): void {
  const output = {
    status: 'error',
    error: {
      code,
      message,
      ...(details && { details }),
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
}

export function printTable(headers: string[], rows: string[][]): void {
  const colWidths = headers.map((h, i) => {
    const maxContent = Math.max(...rows.map(r => (r[i] || '').length));
    return Math.max(h.length, maxContent);
  });

  const line = '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+';

  console.log(line);
  console.log('| ' + headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ') + ' |');
  console.log(line);

  for (const row of rows) {
    console.log('| ' + row.map((cell, i) => (cell || '').padEnd(colWidths[i])).join(' | ') + ' |');
  }

  console.log(line);
}

export function printHelp(command: string, description: string, usage: string, examples: string[]): void {
  console.log(`
${command}
${'='.repeat(command.length)}

${description}

Usage:
  ${usage}

Examples:
${examples.map(e => `  $ ${e}`).join('\n')}
`);
}
