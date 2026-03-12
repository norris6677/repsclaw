#!/usr/bin/env node
/**
 * 简化的挂载测试
 * 
 * 测试插件通过复制文件方式安装到 OpenClaw
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

// 颜色
const c = {
  g: '\x1b[32m',  // green
  r: '\x1b[31m',  // red
  y: '\x1b[33m',  // yellow
  b: '\x1b[34m',  // blue
  c: '\x1b[36m',  // cyan
  reset: '\x1b[0m',
};

function log(msg: string, type: 'i' | 's' | 'e' | 'w' = 'i') {
  const t = new Date().toLocaleTimeString();
  const icon = type === 's' ? '✔' : type === 'e' ? '✖' : type === 'w' ? '⚠' : 'ℹ';
  const color = type === 's' ? c.g : type === 'e' ? c.r : type === 'w' ? c.y : c.b;
  console.log(`${color}[${t}] ${icon} ${msg}${c.reset}`);
}

interface TestContext {
  mockOpenclawDir: string;
  pluginDir: string;
  targetDir: string;
}

async function setup(): Promise<TestContext> {
  log('准备测试环境...', 'i');
  
  const mockDir = path.join(os.tmpdir(), `openclaw-test-${Date.now()}`);
  const pluginDir = path.resolve(__dirname, '../..');
  const targetDir = path.join(mockDir, '.openclaw/extensions/repsclaw');
  
  // 创建模拟的 OpenClaw 目录
  await fs.ensureDir(path.join(mockDir, '.openclaw/extensions'));
  
  // 创建 openclaw.json
  await fs.writeJson(path.join(mockDir, '.openclaw/openclaw.json'), {
    version: '1.0.0', 
    settings: { autoLoad: true },
    plugins: {
      entries: {},
      installs: {}
    }
  }, { spaces: 2 });
  
  log(`模拟环境: ${mockDir}`, 'i');
  log(`插件源: ${pluginDir}`, 'i');
  log(`安装目标: ${targetDir}`, 'i');
  
  return {
    mockOpenclawDir: mockDir,
    pluginDir,
    targetDir,
  };
}

async function cleanup(ctx: TestContext) {
  log('清理测试环境...', 'i');
  await fs.remove(ctx.mockOpenclawDir);
}

async function testPluginBuild(ctx: TestContext) {
  log('\n━━━ 测试: 插件构建验证 ━━━', 'b');
  
  // 检查 dist 目录
  const distDir = path.join(ctx.pluginDir, 'dist');
  const hasDist = await fs.pathExists(distDir);
  
  if (!hasDist) {
    log('⚠ dist/ 目录不存在', 'w');
  } else {
    log('✓ dist/ 目录存在', 's');
  }
  
  // 检查必要文件
  const requiredFiles = [
    'package.json',
    'openclaw.plugin.json',
    'index.ts',
  ];
  
  for (const file of requiredFiles) {
    const filePath = path.join(ctx.pluginDir, file);
    const exists = await fs.pathExists(filePath);
    if (!exists) {
      throw new Error(`缺少文件: ${file}`);
    }
    log(`✓ ${file} 存在`, 's');
  }
  
  log('构建验证测试通过', 's');
}

async function testCopyPlugin(ctx: TestContext) {
  log('\n━━━ 测试: 复制插件文件 ━━━', 'b');
  
  // 创建目标目录
  await fs.ensureDir(ctx.targetDir);
  
  // 复制文件（排除 node_modules 和 .git）
  const entries = await fs.readdir(ctx.pluginDir);
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'tests') {
      continue;
    }
    const srcPath = path.join(ctx.pluginDir, entry);
    const destPath = path.join(ctx.targetDir, entry);
    await fs.copy(srcPath, destPath);
  }
  
  // 验证复制结果
  const exists = await fs.pathExists(ctx.targetDir);
  if (!exists) {
    throw new Error('插件复制失败');
  }
  log('✓ 插件文件已复制', 's');
  
  // 设置权限（重要：不能是 world-writable）
  await fs.chmod(ctx.targetDir, 0o700);
  log('✓ 权限已设置为 700', 's');
  
  // 验证关键文件
  const checkFiles = ['package.json', 'openclaw.plugin.json', 'index.ts'];
  for (const file of checkFiles) {
    const filePath = path.join(ctx.targetDir, file);
    if (!(await fs.pathExists(filePath))) {
      throw new Error(`复制后缺少文件: ${file}`);
    }
  }
  log('✓ 所有关键文件已复制', 's');
  
  log('复制插件测试通过', 's');
}

async function testPluginValidation(ctx: TestContext) {
  log('\n━━━ 测试: 插件验证 ━━━', 'b');
  
  // 检查必要文件
  const required = ['package.json', 'openclaw.plugin.json', 'index.ts'];
  for (const file of required) {
    const p = path.join(ctx.targetDir, file);
    const exists = await fs.pathExists(p);
    log(`${file}: ${exists ? c.g + '✓' : c.r + '✗'}${c.reset}`, 'i');
    if (!exists) throw new Error(`缺少 ${file}`);
  }
  
  // 验证 package.json
  const pkg = await fs.readJson(path.join(ctx.targetDir, 'package.json'));
  log(`插件名称: ${pkg.name}`, 'i');
  log(`插件版本: ${pkg.version}`, 'i');
  
  // 验证 openclaw.plugin.json
  const pluginConfig = await fs.readJson(path.join(ctx.targetDir, 'openclaw.plugin.json'));
  log(`OpenClaw ID: ${pluginConfig.id}`, 'i');
  
  // 验证权限
  const stat = await fs.stat(ctx.targetDir);
  const mode = stat.mode & 0o777;
  if (mode === 0o777 || mode === 0o755) {
    throw new Error(`目录权限过于开放: ${mode.toString(8)}`);
  }
  log(`权限检查: ${mode.toString(8)} ✓`, 's');
  
  log('插件验证测试通过', 's');
}

async function testConfigUpdate(ctx: TestContext) {
  log('\n━━━ 测试: 配置更新 ━━━', 'b');
  
  const configPath = path.join(ctx.mockOpenclawDir, '.openclaw/openclaw.json');
  const config = await fs.readJson(configPath);
  
  // 模拟配置更新
  if (!config.plugins) {
    config.plugins = {};
  }
  if (!config.plugins.entries) {
    config.plugins.entries = {};
  }
  if (!config.plugins.installs) {
    config.plugins.installs = {};
  }
  
  config.plugins.entries['repsclaw'] = { enabled: true };
  config.plugins.installs['repsclaw'] = {
    source: 'path',
    spec: ctx.targetDir,
    installPath: ctx.targetDir,
    version: '1.0.0',
    installedAt: new Date().toISOString(),
  };
  
  await fs.writeJson(configPath, config, { spaces: 2 });
  
  // 验证配置
  const updatedConfig = await fs.readJson(configPath);
  if (!updatedConfig.plugins.entries['repsclaw']) {
    throw new Error('配置更新失败: entries');
  }
  if (!updatedConfig.plugins.installs['repsclaw']) {
    throw new Error('配置更新失败: installs');
  }
  
  log('✓ 配置已更新', 's');
  log(`  entries.repsclaw: ${JSON.stringify(updatedConfig.plugins.entries['repsclaw'])}`, 'i');
  log(`  installs.repsclaw: ${updatedConfig.plugins.installs['repsclaw'].spec}`, 'i');
  
  log('配置更新测试通过', 's');
}

async function testOpenclawScan(ctx: TestContext) {
  log('\n━━━ 测试: OpenClaw 扫描模拟 ━━━', 'b');
  
  const extDir = path.join(ctx.mockOpenclawDir, '.openclaw/extensions');
  const entries = await fs.readdir(extDir, { withFileTypes: true });
  
  const plugins: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const configPath = path.join(extDir, entry.name, 'openclaw.plugin.json');
      if (await fs.pathExists(configPath)) {
        const config = await fs.readJson(configPath);
        plugins.push(`${config.id}@${config.version}`);
        log(`  发现: ${c.c}${config.id}@${config.version}${c.reset}`, 'i');
      }
    }
  }
  
  if (plugins.length === 0) {
    throw new Error('未扫描到插件');
  }
  
  log(`扫描到 ${plugins.length} 个插件 ✓`, 's');
  log('OpenClaw 扫描测试通过', 's');
}

async function testReinstall(ctx: TestContext) {
  log('\n━━━ 测试: 重复安装处理 ━━━', 'b');
  
  // 模拟重复安装：删除旧目录，重新复制
  await fs.remove(ctx.targetDir);
  await fs.ensureDir(ctx.targetDir);
  
  const entries = await fs.readdir(ctx.pluginDir);
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'tests') {
      continue;
    }
    const srcPath = path.join(ctx.pluginDir, entry);
    const destPath = path.join(ctx.targetDir, entry);
    await fs.copy(srcPath, destPath);
  }
  
  await fs.chmod(ctx.targetDir, 0o700);
  
  const exists = await fs.pathExists(path.join(ctx.targetDir, 'package.json'));
  if (!exists) {
    throw new Error('重复安装失败');
  }
  
  log('✓ 重复安装成功', 's');
  log('重复安装处理测试通过', 's');
}

async function run() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}      OpenClaw 插件挂载测试 (复制安装方式)           ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}\n`);
  
  const results: { name: string; ok: boolean; err?: string }[] = [];
  const ctx = await setup();
  
  const tests = [
    { name: '插件构建验证', fn: testPluginBuild },
    { name: '复制插件文件', fn: testCopyPlugin },
    { name: '插件验证', fn: testPluginValidation },
    { name: '配置更新', fn: testConfigUpdate },
    { name: 'OpenClaw 扫描', fn: testOpenclawScan },
    { name: '重复安装', fn: testReinstall },
  ];
  
  for (const t of tests) {
    try {
      await t.fn(ctx);
      results.push({ name: t.name, ok: true });
    } catch (e) {
      results.push({ name: t.name, ok: false, err: String(e) });
    }
  }
  
  await cleanup(ctx);
  
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
  
  if (passed === total) {
    log('\n✨ 所有测试通过！插件可以通过复制方式安装到 OpenClaw。', 's');
  } else {
    log('\n⚠ 部分测试失败，请检查配置。', 'w');
  }
  
  process.exit(passed === total ? 0 : 1);
}

run().catch(e => {
  log(`测试运行错误: ${e}`, 'e');
  process.exit(1);
});
