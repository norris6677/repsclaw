#!/usr/bin/env node
/**
 * postinstall 钩子测试
 * 
 * 验证 npm install 后是否能正确触发 setup.ts 脚本
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

// 颜色
const c = {
  g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[34m', c: '\x1b[36m', reset: '\x1b[0m'
};

function log(msg: string, type: 'i'|'s'|'e'|'w' = 'i') {
  const t = new Date().toLocaleTimeString();
  const icon = type === 's' ? '✔' : type === 'e' ? '✖' : type === 'w' ? '⚠' : 'ℹ';
  const color = type === 's' ? c.g : type === 'e' ? c.r : type === 'w' ? c.y : c.b;
  console.log(`${color}[${t}] ${icon} ${msg}${c.reset}`);
}

async function setup() {
  log('准备测试环境...', 'i');
  
  const testDir = path.join(os.tmpdir(), `repsclaw-postinstall-test-${Date.now()}`);
  await fs.ensureDir(testDir);
  
  // 创建模拟的 OpenClaw 环境
  const openclawDir = path.join(testDir, 'openclaw');
  await fs.ensureDir(path.join(openclawDir, '.openclaw/extensions'));
  await fs.writeJson(path.join(openclawDir, '.openclaw/openclaw.json'), {
    version: '1.0.0', settings: { autoLoad: true }
  });
  
  // 复制当前项目到测试目录
  const currentDir = path.resolve(__dirname, '../..');
  const pluginDir = path.join(testDir, 'repsclaw');
  
  await fs.copy(currentDir, pluginDir, {
    filter: (src) => !src.includes('node_modules') && !src.includes('dist')
  });
  
  log(`测试目录: ${testDir}`, 'i');
  log(`OpenClaw: ${openclawDir}`, 'i');
  log(`插件: ${pluginDir}`, 'i');
  
  return { testDir, openclawDir, pluginDir };
}

async function cleanup(testDir: string) {
  log('清理测试环境...', 'i');
  await fs.remove(testDir);
}

async function testNpmInstallTriggersPostinstall(ctx: { testDir: string, openclawDir: string, pluginDir: string }) {
  log('\n━━━ 测试: npm install 触发 postinstall ━━━', 'b');
  
  // 设置环境变量
  const env = {
    ...process.env,
    OPENCLAW_HOME: ctx.openclawDir,
    CI: 'true', // 避免交互式提示
  };
  
  log('运行 npm install...', 'i');
  
  try {
    // 运行 npm install
    const output = execSync('npm install --no-audit --no-fund', {
      cwd: ctx.pluginDir,
      env,
      encoding: 'utf-8',
      timeout: 120000,
      stdio: 'pipe',
    });
    
    log('npm install 完成', 's');
    
    // 检查输出中是否包含 setup 脚本的信息
    if (output.includes('OpenClaw') || output.includes('setup') || output.includes('Plugin')) {
      log('检测到 postinstall 脚本输出', 's');
    } else {
      log('未检测到明确的 setup 输出（可能是静默模式）', 'w');
    }
  } catch (e: any) {
    // 即使 npm install 返回非零，setup 可能已经运行
    log(`npm install 输出:\n${e.stdout || e.message}`, 'w');
  }
  
  // 验证链接是否创建
  const linkPath = path.join(ctx.openclawDir, '.openclaw/extensions/repsclaw');
  const exists = await fs.pathExists(linkPath);
  
  if (exists) {
    log(`链接已创建: ${linkPath}`, 's');
    
    const stat = await fs.lstat(linkPath);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      log('链接类型正确', 's');
    } else {
      throw new Error('链接类型错误');
    }
    
    const realPath = await fs.realpath(linkPath);
    if (realPath === ctx.pluginDir) {
      log('链接目标正确', 's');
    } else {
      throw new Error('链接目标错误');
    }
  } else {
    throw new Error('链接未创建');
  }
}

async function testSkipFlag(ctx: { testDir: string, openclawDir: string, pluginDir: string }) {
  log('\n━━━ 测试: SKIP_OPENCLAW_SETUP 环境变量 ━━━', 'b');
  
  // 清理之前的链接
  const linkPath = path.join(ctx.openclawDir, '.openclaw/extensions/repsclaw');
  await fs.remove(linkPath);
  
  const env = {
    ...process.env,
    OPENCLAW_HOME: ctx.openclawDir,
    SKIP_OPENCLAW_SETUP: 'true',
  };
  
  log('运行 npm install (SKIP_OPENCLAW_SETUP=true)...', 'i');
  
  try {
    execSync('npm install --no-audit --no-fund', {
      cwd: ctx.pluginDir,
      env,
      encoding: 'utf-8',
      timeout: 120000,
      stdio: 'pipe',
    });
  } catch (e: any) {
    // 忽略错误
  }
  
  // 验证链接未创建
  const exists = await fs.pathExists(linkPath);
  if (!exists) {
    log('SKIP_OPENCLAW_SETUP 有效，链接未创建', 's');
  } else {
    throw new Error('SKIP_OPENCLAW_SETUP 未生效');
  }
}

async function testManualSetupScript(ctx: { testDir: string, openclawDir: string, pluginDir: string }) {
  log('\n━━━ 测试: 手动运行 setup 脚本 ━━━', 'b');
  
  const linkPath = path.join(ctx.openclawDir, '.openclaw/extensions/repsclaw');
  await fs.remove(linkPath);
  
  const env = {
    ...process.env,
    OPENCLAW_HOME: ctx.openclawDir,
    CI: 'true',
  };
  
  log('运行 npm run setup:openclaw...', 'i');
  
  try {
    const output = execSync('npm run setup:openclaw', {
      cwd: ctx.pluginDir,
      env,
      encoding: 'utf-8',
      timeout: 60000,
      stdio: 'pipe',
    });
    
    log('Setup 脚本执行完成', 's');
    
    // 检查输出
    if (output.includes('安装成功') || output.includes('成功')) {
      log('检测到成功消息', 's');
    }
  } catch (e: any) {
    log(`Setup 输出:\n${e.stdout || e.message}`, 'w');
  }
  
  // 验证链接
  const exists = await fs.pathExists(linkPath);
  if (exists) {
    log('手动 setup 成功创建链接', 's');
  } else {
    throw new Error('手动 setup 未创建链接');
  }
}

async function run() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}      postinstall 钩子集成测试                       ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}\n`);
  
  const ctx = await setup();
  const results: { name: string; ok: boolean; err?: string }[] = [];
  
  const tests = [
    { name: 'npm install 触发 postinstall', fn: testNpmInstallTriggersPostinstall },
    { name: 'SKIP_OPENCLAW_SETUP 环境变量', fn: testSkipFlag },
    { name: '手动运行 setup 脚本', fn: testManualSetupScript },
  ];
  
  for (const t of tests) {
    try {
      await t.fn(ctx);
      results.push({ name: t.name, ok: true });
    } catch (e) {
      results.push({ name: t.name, ok: false, err: String(e) });
    }
  }
  
  await cleanup(ctx.testDir);
  
  // 报告
  log('\n' + '═'.repeat(50), 'b');
  log('测试报告', 'b');
  log('═'.repeat(50), 'b');
  
  for (const r of results) {
    const icon = r.ok ? c.g + '✔' : c.r + '✖';
    log(`${icon} ${r.name}${c.reset}`, r.ok ? 's' : 'e');
    if (r.err) log(`  ${c.r}${r.err}${c.reset}`, 'e');
  }
  
  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  
  log(`\n${'═'.repeat(50)}`, 'b');
  log(`总计: ${total} | ${c.g}通过: ${passed}${c.reset} | ${c.r}失败: ${total - passed}${c.reset}`, passed === total ? 's' : 'e');
  log('═'.repeat(50), 'b');
  
  process.exit(passed === total ? 0 : 1);
}

run().catch(e => {
  log(`测试运行错误: ${e}`, 'e');
  process.exit(1);
});
