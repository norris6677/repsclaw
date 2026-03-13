#!/usr/bin/env tsx
/**
 * 运行所有 API 真实请求集成测试
 */

import { log, c, TestResult } from './test-config';
import { spawn } from 'child_process';
import * as path from 'path';

interface TestFile {
  name: string;
  path: string;
}

const testFiles: TestFile[] = [
  { name: 'PubMed', path: 'pubmed.client.real.test.ts' },
  { name: 'FDA', path: 'fda.client.real.test.ts' },
  { name: 'Clinical Trials', path: 'clinical-trials.client.real.test.ts' },
  { name: 'Medical Terminology', path: 'medical-terminology.client.real.test.ts' },
  { name: 'MedRxiv', path: 'medrxiv.client.real.test.ts' },
  { name: 'NCBI Bookshelf', path: 'nci-bookshelf.client.real.test.ts' },
  { name: 'CNKI', path: 'cnki.client.real.test.ts' },
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

      // 从输出中解析是否所有测试通过
      const allPassed = output.includes('所有真实请求测试通过') || 
                        (output.includes('测试汇总报告') && !output.includes('失败: 0') === false);

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
  console.log(`${c.c}║${c.b}         所有 API 真实请求集成测试套件               ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}\n`);

  log('⚠ 这些测试会发起真实的 HTTP 请求到外部 API', 'w');
  log('  请确保网络连接正常，并检查环境变量配置', 'i');
  console.log();

  const results: TestResult[] = [];

  for (const testFile of testFiles) {
    log(`\n${'='.repeat(60)}`, 'b');
    log(`运行 ${testFile.name} API 测试...`, 'i');
    log(`${'='.repeat(60)}`, 'b');
    
    const result = await runTest(testFile);
    results.push(result);
  }

  // 最终报告
  console.log(`\n${c.c}${'═'.repeat(60)}${c.reset}`);
  console.log(`${c.b}              所有 API 测试汇总报告                       ${c.reset}`);
  console.log(`${c.c}${'═'.repeat(60)}${c.reset}\n`);

  for (const result of results) {
    const icon = result.ok ? c.g + '✔' : c.r + '✗';
    const status = result.ok ? '通过' : '失败';
    console.log(`${icon} ${result.name} API: ${status}${c.reset}`);
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
    console.log(`\n${c.g}✨ 所有 API 真实请求测试通过！${c.reset}\n`);
  } else {
    console.log(`\n${c.r}⚠ 部分 API 测试失败${c.reset}\n`);
    console.log(`${c.y}提示:${c.reset}`);
    console.log('  1. 检查网络连接');
    console.log('  2. 检查 .env 文件中的 API Key 配置');
    console.log('  3. 某些 API 可能有访问限制或需要特殊权限');
    console.log();
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
