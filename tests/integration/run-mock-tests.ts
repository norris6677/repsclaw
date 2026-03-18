#!/usr/bin/env tsx
/**
 * 运行所有 Mock 集成测试
 */

import { log, c, TestResult } from './api/test-config';
import { spawn } from 'child_process';
import * as path from 'path';

interface TestFile {
  name: string;
  path: string;
}

const testFiles: TestFile[] = [
  // Service Integration Tests
  { name: 'Health API Service', path: 'services/health-api.service.test.ts' },
  { name: 'Hospital News Service', path: 'services/hospital-news.service.test.ts' },
  { name: 'Hospital Name Resolver', path: 'services/hospital-name-resolver.test.ts' },
];

async function runTest(file: TestFile): Promise<TestResult> {
  return new Promise((resolve) => {
    const testPath = path.join(__dirname, file.path);
    const child = spawn('npx', ['tsx', testPath], {
      stdio: 'pipe',
      shell: true,
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      // 输出测试内容
      console.log(output);
      if (errorOutput) {
        console.error(errorOutput);
      }

      resolve({
        name: file.name,
        ok: code === 0,
        err: code !== 0 ? `退出码: ${code}` : undefined,
      });
    });

    child.on('error', (err) => {
      resolve({
        name: file.name,
        ok: false,
        err: String(err),
      });
    });
  });
}

async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}         Mock 集成测试套件                           ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}\n`);

  log('✓ 这些测试使用 Mock 数据，不发起真实 HTTP 请求', 'i');
  console.log();

  const results: TestResult[] = [];

  for (const testFile of testFiles) {
    log(`\n${'='.repeat(60)}`, 'b');
    log(`运行 ${testFile.name} Mock 测试...`, 'i');
    log(`${'='.repeat(60)}`, 'b');

    const result = await runTest(testFile);
    results.push(result);
  }

  // 最终报告
  console.log(`\n${c.c}${'═'.repeat(60)}${c.reset}`);
  console.log(`${c.b}              Mock 集成测试汇总报告                       ${c.reset}`);
  console.log(`${c.c}${'═'.repeat(60)}${c.reset}\n`);

  for (const result of results) {
    const icon = result.ok ? c.g + '✔' : c.r + '✗';
    const status = result.ok ? '通过' : '失败';
    console.log(`${icon} ${result.name}: ${status}${c.reset}`);
    if (result.err) {
      console.log(`  ${c.r}错误: ${result.err}${c.reset}`);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;

  console.log(`\n${c.c}${'═'.repeat(60)}${c.reset}`);
  console.log(`${c.b}总计: ${total} | ${c.g}通过: ${passed}${c.reset} | ${c.r}失败: ${total - passed}${c.reset}`);
  console.log(`${c.c}${'═'.repeat(60)}${c.reset}`);

  if (passed === total) {
    console.log(`\n${c.g}✨ 所有 Mock 集成测试通过！${c.reset}\n`);
  } else {
    console.log(`\n${c.r}⚠ 部分测试失败${c.reset}\n`);
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
