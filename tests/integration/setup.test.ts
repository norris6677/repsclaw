#!/usr/bin/env node
/**
 * OpenClaw 插件挂载集成测试
 * 
 * 测试内容：
 * 1. 验证插件通过复制文件方式安装
 * 2. 验证文件权限正确（非 world-writable）
 * 3. 验证 openclaw.json 配置更新
 * 4. 验证插件能被正确加载
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { spawn } from 'child_process';

// 测试配置
const TEST_CONFIG = {
  mockOpenclawDir: path.join(__dirname, '.mock-openclaw'),
  pluginProjectDir: path.join(__dirname, '../..'),
  timeout: 60000,
};

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = `[${timestamp}]`;
  
  switch (type) {
    case 'success':
      console.log(`${colors.green}${prefix} ✔ ${message}${colors.reset}`);
      break;
    case 'error':
      console.error(`${colors.red}${prefix} ✖ ${message}${colors.reset}`);
      break;
    case 'warning':
      console.log(`${colors.yellow}${prefix} ⚠ ${message}${colors.reset}`);
      break;
    default:
      console.log(`${colors.blue}${prefix} ℹ ${message}${colors.reset}`);
  }
}

function printTitle() {
  console.log('\n' + colors.cyan + '╔════════════════════════════════════════════════════════╗' + colors.reset);
  console.log(colors.cyan + '║' + colors.blue + '     OpenClaw Plugin Mount Integration Test             ' + colors.cyan + '║' + colors.reset);
  console.log(colors.cyan + '╚════════════════════════════════════════════════════════╝\n' + colors.reset);
}

function printSection(title: string) {
  console.log('\n' + colors.cyan + '─'.repeat(50) + colors.reset);
  console.log(colors.blue + `  ${title}` + colors.reset);
  console.log(colors.cyan + '─'.repeat(50) + colors.reset + '\n');
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    log(`开始测试: ${name}`);
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    log(`测试通过: ${name} (${duration}ms)`, 'success');
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: errorMsg, duration });
    log(`测试失败: ${name} - ${errorMsg}`, 'error');
  }
}

async function cleanup() {
  log('清理测试环境...');
  try {
    await fs.remove(TEST_CONFIG.mockOpenclawDir);
    log('清理完成', 'success');
  } catch (error) {
    log(`清理警告: ${error}`, 'warning');
  }
}

async function createMockOpenclaw() {
  log('创建模拟 OpenClaw 环境...');
  
  const extensionsDir = path.join(TEST_CONFIG.mockOpenclawDir, '.openclaw/extensions');
  await fs.ensureDir(extensionsDir);
  
  const openclawConfig = {
    version: '1.0.0',
    plugins: {
      entries: {},
      installs: {}
    },
    settings: { autoLoad: true },
  };
  
  await fs.writeJson(
    path.join(TEST_CONFIG.mockOpenclawDir, '.openclaw/openclaw.json'),
    openclawConfig,
    { spaces: 2 }
  );
  
  log(`模拟环境创建完成: ${TEST_CONFIG.mockOpenclawDir}`, 'success');
}

// 测试 1: 检查插件项目结构
async function testPluginStructure() {
  printSection('测试 1: 插件项目结构检查');
  
  const requiredFiles = [
    'package.json',
    'openclaw.plugin.json',
    'index.ts',
    'src/plugin.ts',
    'src/types/plugin.ts',
  ];
  
  for (const file of requiredFiles) {
    const filePath = path.join(TEST_CONFIG.pluginProjectDir, file);
    const exists = await fs.pathExists(filePath);
    if (!exists) {
      throw new Error(`缺少必要文件: ${file}`);
    }
    log(`✓ 存在: ${file}`, 'success');
  }
  
  // 检查 package.json
  const pkgJson = await fs.readJson(path.join(TEST_CONFIG.pluginProjectDir, 'package.json'));
  if (!pkgJson.scripts?.build) {
    throw new Error('package.json 中缺少 build 脚本');
  }
  log('✓ build 脚本已配置', 'success');
  
  // 检查 openclaw.plugin.json
  const pluginJson = await fs.readJson(path.join(TEST_CONFIG.pluginProjectDir, 'openclaw.plugin.json'));
  if (!pluginJson.id) {
    throw new Error('openclaw.plugin.json 缺少 id');
  }
  log(`✓ 插件 ID: ${pluginJson.id}`, 'success');
}

// 测试 2: 复制插件文件
async function testCopyPlugin() {
  printSection('测试 2: 复制插件文件');
  
  const sourceDir = TEST_CONFIG.pluginProjectDir;
  const targetDir = path.join(TEST_CONFIG.mockOpenclawDir, '.openclaw/extensions/repsclaw');
  
  log(`复制插件...`);
  log(`  源: ${sourceDir}`);
  log(`  目标: ${targetDir}`);
  
  // 创建目标目录
  await fs.ensureDir(targetDir);
  
  // 复制文件（排除 node_modules 和 .git）
  const entries = await fs.readdir(sourceDir);
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'tests') {
      continue;
    }
    const srcPath = path.join(sourceDir, entry);
    const destPath = path.join(targetDir, entry);
    await fs.copy(srcPath, destPath);
  }
  
  // 验证复制结果
  const exists = await fs.pathExists(targetDir);
  if (!exists) {
    throw new Error('插件复制失败');
  }
  log('✓ 插件文件已复制', 'success');
  
  // 设置权限（重要：不能是 world-writable）
  await fs.chmod(targetDir, 0o700);
  log('✓ 权限已设置为 700', 'success');
  
  // 验证关键文件
  const checkFiles = ['package.json', 'openclaw.plugin.json', 'index.ts'];
  for (const file of checkFiles) {
    const filePath = path.join(targetDir, file);
    if (!(await fs.pathExists(filePath))) {
      throw new Error(`复制后缺少文件: ${file}`);
    }
  }
  log('✓ 所有关键文件已复制', 'success');
}

// 测试 3: 验证插件权限
async function testPluginPermissions() {
  printSection('测试 3: 验证插件权限');
  
  const targetDir = path.join(TEST_CONFIG.mockOpenclawDir, '.openclaw/extensions/repsclaw');
  
  // 检查目录权限
  const stat = await fs.stat(targetDir);
  const mode = stat.mode & 0o777;
  
  log(`目录权限: ${mode.toString(8)}`);
  
  if (mode === 0o777 || mode === 0o755 || mode === 0o775) {
    throw new Error(`目录权限过于开放: ${mode.toString(8)}`);
  }
  
  if (mode !== 0o700) {
    log(`警告: 权限不是 700，而是 ${mode.toString(8)}`, 'warning');
  } else {
    log('✓ 目录权限正确 (700)', 'success');
  }
  
  // 验证文件可读
  const pkgPath = path.join(targetDir, 'package.json');
  const pkg = await fs.readJson(pkgPath);
  if (!pkg.name) {
    throw new Error('无法读取 package.json');
  }
  log(`✓ 文件可读: ${pkg.name}`, 'success');
}

// 测试 4: 更新 openclaw.json 配置
async function testUpdateConfig() {
  printSection('测试 4: 更新 OpenClaw 配置');
  
  const configPath = path.join(TEST_CONFIG.mockOpenclawDir, '.openclaw/openclaw.json');
  const targetDir = path.join(TEST_CONFIG.mockOpenclawDir, '.openclaw/extensions/repsclaw');
  
  const config = await fs.readJson(configPath);
  
  // 添加插件配置
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
    spec: targetDir,
    installPath: targetDir,
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
  
  log('✓ 配置已更新', 'success');
  log(`  entries.repsclaw: enabled = ${updatedConfig.plugins.entries['repsclaw'].enabled}`, 'info');
}

// 测试 5: 验证插件可加载
async function testPluginLoadable() {
  printSection('测试 5: 验证插件可加载性');
  
  const targetDir = path.join(TEST_CONFIG.mockOpenclawDir, '.openclaw/extensions/repsclaw');
  
  // 检查 openclaw.plugin.json
  const configPath = path.join(targetDir, 'openclaw.plugin.json');
  if (!(await fs.pathExists(configPath))) {
    throw new Error('缺少 openclaw.plugin.json');
  }
  
  const pluginConfig = await fs.readJson(configPath);
  if (!pluginConfig.id) {
    throw new Error('openclaw.plugin.json 配置不完整');
  }
  log(`✓ openclaw.plugin.json 有效: ${pluginConfig.id}`, 'success');
  
  // 检查入口文件
  const indexPath = path.join(targetDir, 'index.ts');
  if (!(await fs.pathExists(indexPath))) {
    throw new Error('缺少入口文件 index.ts');
  }
  log('✓ 入口文件存在', 'success');
  
  // 检查 package.json
  const pkgPath = path.join(targetDir, 'package.json');
  const pkg = await fs.readJson(pkgPath);
  
  if (!pkg.name || !pkg.version) {
    throw new Error('package.json 缺少 name 或 version');
  }
  log(`✓ package.json 有效: ${pkg.name}@${pkg.version}`, 'success');
}

// 测试 6: 模拟 OpenClaw 扫描
async function testOpenclawScan() {
  printSection('测试 6: 模拟 OpenClaw 插件扫描');
  
  const extensionsDir = path.join(TEST_CONFIG.mockOpenclawDir, '.openclaw/extensions');
  
  const entries = await fs.readdir(extensionsDir, { withFileTypes: true });
  const plugins: string[] = [];
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const configPath = path.join(extensionsDir, entry.name, 'openclaw.plugin.json');
      if (await fs.pathExists(configPath)) {
        const config = await fs.readJson(configPath);
        plugins.push(`${config.id}@${config.version}`);
        log(`  发现插件: ${colors.cyan}${config.id}@${config.version}${colors.reset}`, 'info');
      }
    }
  }
  
  if (plugins.length === 0) {
    throw new Error('未找到任何插件');
  }
  
  log(`✓ 扫描到 ${plugins.length} 个插件`, 'success');
}

// 打印测试报告
function printReport() {
  printSection('测试报告');
  
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  
  console.log('');
  results.forEach((result, index) => {
    const icon = result.passed ? colors.green + '✔' : colors.red + '✖';
    const status = result.passed ? colors.green + 'PASS' : colors.red + 'FAIL';
    console.log(`${icon} ${index + 1}. ${result.name}${colors.reset}`);
    console.log(`   状态: ${status}${colors.reset} | 耗时: ${result.duration}ms`);
    if (result.error) {
      console.log(`   错误: ${colors.red}${result.error}${colors.reset}`);
    }
    console.log('');
  });
  
  console.log(colors.cyan + '═'.repeat(50) + colors.reset);
  console.log(`  总计: ${total} | ${colors.green}通过: ${passed}${colors.reset} | ${colors.red}失败: ${failed}${colors.reset}`);
  console.log(colors.cyan + '═'.repeat(50) + colors.reset);
  
  return failed === 0;
}

async function main() {
  printTitle();
  
  log('测试配置:');
  log(`  模拟环境: ${TEST_CONFIG.mockOpenclawDir}`);
  log(`  插件项目: ${TEST_CONFIG.pluginProjectDir}`);
  
  try {
    await cleanup();
    await createMockOpenclaw();
    
    await runTest('插件项目结构检查', testPluginStructure);
    await runTest('复制插件文件', testCopyPlugin);
    await runTest('验证插件权限', testPluginPermissions);
    await runTest('更新 OpenClaw 配置', testUpdateConfig);
    await runTest('验证插件可加载性', testPluginLoadable);
    await runTest('OpenClaw 插件扫描模拟', testOpenclawScan);
    
    const allPassed = printReport();
    await cleanup();
    
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    log(`测试运行错误: ${error instanceof Error ? error.message : String(error)}`, 'error');
    await cleanup();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { main, TEST_CONFIG };
