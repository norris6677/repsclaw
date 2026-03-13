#!/usr/bin/env tsx
/**
 * 运行所有单元测试
 */

import { log, c, TestResult } from './test-utils';
import { spawn } from 'child_process';
import * as path from 'path';

interface TestFile {
  name: string;
  path: string;
}

const testFiles: TestFile[] = [
  { name: '限流器', path: 'rate-limiter.test.ts' },
  { name: 'PubMed Client', path: 'api/pubmed.client.test.ts' },
  { name: 'FDA Client', path: 'api/fda.client.test.ts' },
  { name: 'Clinical Trials Client', path: 'api/clinical-trials.client.test.ts' },
  { name: 'Medical Terminology Client', path: 'api/medical-terminology.client.test.ts' },
  { name: 'MedRxiv Client', path: 'api/medrxiv.client.test.ts' },
  { name: 'NCBI Bookshelf Client', path: 'api/nci-bookshelf.client.test.ts' },
  { name: 'CNKI Client', path: 'api/cnki.client.test.ts' },
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
  console.log(`${c.c}║${c.b}         RepsClaw 单元测试套件                       ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}\n`);

  const results: TestResult[] = [];

  for (const testFile of testFiles) {
    log(`\n运行 ${testFile.name} 测试...`, 'i');
    const result = await runTest(testFile);
    results.push(result);
  }

  // 最终报告
  console.log(`\n${c.c}${'═'.repeat(56)}${c.reset}`);
  console.log(`${c.b}                    测试汇总报告                        ${c.reset}`);
  console.log(`${c.c}${'═'.repeat(56)}${c.reset}\n`);

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

  console.log(`\n${c.c}${'═'.repeat(56)}${c.reset}`);
  console.log(`${c.b}总计: ${total} | ${c.g}通过: ${passed}${c.reset} | ${c.r}失败: ${total - passed}${c.reset}`);
  console.log(`${c.c}${'═'.repeat(56)}${c.reset}`);

  if (passed === total) {
    console.log(`\n${c.g}✨ 所有单元测试通过！${c.reset}\n`);
  } else {
    console.log(`\n${c.r}⚠ 部分测试失败${c.reset}\n`);
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
