#!/usr/bin/env tsx
/**
 * CLI构建脚本
 * 编译CLI并创建可执行文件
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT_DIR = path.resolve(__dirname, '..');
const CLI_DIR = path.join(ROOT_DIR, 'src', 'cli');
const BIN_DIR = path.join(ROOT_DIR, 'bin');

function main() {
  console.log('🔨 Building Repsclaw CLI...\n');

  // 确保bin目录存在
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  // 创建可执行包装脚本
  const wrapperScript = `#!/usr/bin/env node
/**
 * Repsclaw CLI - 可执行包装器
 * 使用 tsx 直接运行 TypeScript 源码
 */

const { spawn } = require('child_process');
const path = require('path');

const cliPath = path.join(__dirname, '..', 'src', 'cli', 'cli.ts');

const child = spawn('npx', ['tsx', cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
`;

  const wrapperPath = path.join(BIN_DIR, 'repsclaw');
  fs.writeFileSync(wrapperPath, wrapperScript, { mode: 0o755 });
  console.log(`✅ Created executable: ${wrapperPath}`);

  // 创建Windows批处理文件
  const batchScript = `@echo off
set CLI_PATH=%~dp0..\\src\\cli\\cli.ts
npx tsx "%CLI_PATH%" %*
`;

  const batchPath = path.join(BIN_DIR, 'repsclaw.bat');
  fs.writeFileSync(batchPath, batchScript);
  console.log(`✅ Created Windows batch: ${batchPath}`);

  console.log('\n✨ CLI build complete!');
  console.log('\nUsage:');
  console.log('  ./bin/repsclaw --help');
  console.log('  ./bin/repsclaw hospital list');
}

main();
