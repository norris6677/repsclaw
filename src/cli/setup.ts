#!/usr/bin/env node
/**
 * OpenClaw Plugin Setup Script
 * 
 * 该脚本在 npm postinstall 阶段运行，自动将本插件链接到 OpenClaw 的扩展目录
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { createInterface } from 'readline';

// 尝试导入 chalk，如果不可用则使用降级方案
let chalk: any;
try {
  chalk = require('chalk');
} catch {
  // 降级方案：如果没有 chalk，创建简单的颜色函数
  chalk = {
    green: (text: string) => text,
    red: (text: string) => text,
    yellow: (text: string) => text,
    blue: (text: string) => text,
    cyan: (text: string) => text,
    gray: (text: string) => text,
    bold: {
      green: (text: string) => text,
      red: (text: string) => text,
      yellow: (text: string) => text,
      blue: (text: string) => text,
    },
  };
}

// 常量定义
const OPENCLAW_EXTENSIONS_DIR = '.openclaw/extensions';
const PLUGIN_PACKAGE_NAME = 'repsclaw';

// 检测操作系统
const isWindows = process.platform === 'win32';

/**
 * 打印带样式的消息
 */
function print(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = `[${timestamp}]`;
  
  switch (type) {
    case 'success':
      console.log(chalk.green(`${prefix} ✔ ${message}`));
      break;
    case 'error':
      console.error(chalk.red(`${prefix} ✖ ${message}`));
      break;
    case 'warning':
      console.log(chalk.yellow(`${prefix} ⚠ ${message}`));
      break;
    default:
      console.log(chalk.blue(`${prefix} ℹ ${message}`));
  }
}

/**
 * 打印标题
 */
function printTitle() {
  console.log('\n' + chalk.cyan('╔════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.bold.blue('           OpenClaw Plugin Setup (Repsclaw)             ') + chalk.cyan('║'));
  console.log(chalk.cyan('╚════════════════════════════════════════════════════════╝\n'));
}

/**
 * 创建 readline 接口
 */
function createReadline() {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * 询问用户输入
 */
function askQuestion(rl: ReturnType<typeof createReadline>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(chalk.yellow(question + ' '), (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * 确认提示
 */
async function confirm(rl: ReturnType<typeof createReadline>, message: string): Promise<boolean> {
  const answer = await askQuestion(rl, `${message} (y/n):`);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

/**
 * 获取当前项目目录
 */
function getCurrentProjectDir(): string {
  // 从 dist/cli/setup.js 运行时，需要找到项目根目录
  const currentFile = __filename;
  const cliDir = path.dirname(currentFile);
  const srcDir = path.dirname(cliDir);
  const projectRoot = path.dirname(srcDir);
  
  return projectRoot;
}

/**
 * 获取上一级目录
 */
function getParentDir(dir: string): string {
  return path.dirname(dir);
}

/**
 * 检测指定路径是否是 OpenClaw 安装目录
 */
async function isOpenClawDir(dir: string): Promise<boolean> {
  try {
    const openclawJsonPath = path.join(dir, '.openclaw/openclaw.json');
    const openclawDir = path.join(dir, '.openclaw');
    
    // 检查 .openclaw 目录是否存在
    const hasOpenclawDir = await fs.pathExists(openclawDir);
    
    return hasOpenclawDir;
  } catch {
    return false;
  }
}

/**
 * 自动探测 OpenClaw 安装路径
 * 
 * 优先级：
 * 1. 环境变量 OPENCLAW_HOME / OPENCLAW_PATH
 * 2. 上一级目录
 * 3. 常见安装路径
 */
async function detectOpenClawPath(): Promise<string | null> {
  print('正在自动探测 OpenClaw 安装路径...', 'info');
  
  // 策略 0: 环境变量（最高优先级）
  const envPath = process.env.OPENCLAW_HOME || process.env.OPENCLAW_PATH;
  if (envPath) {
    if (await isOpenClawDir(envPath)) {
      print(`通过环境变量发现 OpenClaw: ${envPath}`, 'success');
      return envPath;
    } else {
      print(`环境变量指向的路径无效: ${envPath}`, 'warning');
    }
  }
  
  const projectDir = getCurrentProjectDir();
  const parentDir = getParentDir(projectDir);
  
  // 策略 1: 检查上一级目录
  if (await isOpenClawDir(parentDir)) {
    print(`在上一级目录发现 OpenClaw: ${parentDir}`, 'success');
    return parentDir;
  }
  
  // 策略 2: 检查常见的安装位置
  const commonPaths = [
    path.join(require('os').homedir(), '.openclaw'),
    path.join(require('os').homedir(), 'openclaw'),
    path.join(require('os').homedir(), '.local/share/openclaw'),
    '/usr/local/share/openclaw',
    '/opt/openclaw',
  ];
  
  for (const testPath of commonPaths) {
    if (await isOpenClawDir(testPath)) {
      print(`在常用路径发现 OpenClaw: ${testPath}`, 'success');
      return testPath;
    }
  }
  
  print('未能自动发现 OpenClaw 安装路径', 'warning');
  return null;
}

/**
 * 获取 OpenClaw 扩展目录
 */
function getExtensionsDir(openclawPath: string): string {
  return path.join(openclawPath, OPENCLAW_EXTENSIONS_DIR);
}

/**
 * 创建软链接
 */
async function createSymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    // 确保父目录存在
    await fs.ensureDir(path.dirname(linkPath));
    
    // 如果链接已存在，先删除
    if (await fs.pathExists(linkPath)) {
      const stat = await fs.lstat(linkPath);
      if (stat.isSymbolicLink() || stat.isDirectory()) {
        await fs.remove(linkPath);
        print('已移除现有链接', 'info');
      }
    }
    
    // 根据操作系统创建不同类型的链接
    if (isWindows) {
      // Windows 使用 junction（目录链接）
      await fs.ensureDir(target);
      await fs.symlink(target, linkPath, 'junction');
    } else {
      // Linux/Mac 使用符号链接
      await fs.ensureSymlink(target, linkPath, 'dir');
    }
    
    return true;
  } catch (error) {
    print(`创建链接失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return false;
  }
}

/**
 * 验证链接是否创建成功
 */
async function verifySymlink(linkPath: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(linkPath);
    const isLink = stat.isSymbolicLink() || stat.isDirectory();
    
    if (isLink) {
      const realPath = await fs.realpath(linkPath);
      print(`链接验证成功 -> ${realPath}`, 'success');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 交互式设置
 */
async function interactiveSetup(): Promise<boolean> {
  const rl = createReadline();
  
  try {
    print('\n进入交互式设置模式...', 'info');
    print('请输入 OpenClaw 的安装路径（包含 .openclaw 目录的路径）:', 'info');
    
    const inputPath = await askQuestion(rl, '路径:');
    
    if (!inputPath) {
      print('未提供路径，跳过安装', 'warning');
      return false;
    }
    
    const resolvedPath = path.resolve(inputPath);
    
    if (!(await fs.pathExists(resolvedPath))) {
      print(`路径不存在: ${resolvedPath}`, 'error');
      return false;
    }
    
    if (!(await isOpenClawDir(resolvedPath))) {
      print('该路径似乎不是有效的 OpenClaw 安装目录', 'warning');
      const proceed = await confirm(rl, '是否仍要继续？');
      if (!proceed) {
        return false;
      }
    }
    
    const extensionsDir = getExtensionsDir(resolvedPath);
    const projectDir = getCurrentProjectDir();
    const linkName = path.basename(projectDir);
    const linkPath = path.join(extensionsDir, linkName);
    
    print(`\n准备创建链接:`, 'info');
    print(`  目标: ${projectDir}`, 'info');
    print(`  链接: ${linkPath}`, 'info');
    
    const confirmed = await confirm(rl, '确认创建链接？');
    if (!confirmed) {
      print('用户取消操作', 'warning');
      return false;
    }
    
    const success = await createSymlink(projectDir, linkPath);
    
    if (success && (await verifySymlink(linkPath))) {
      print('\n' + '═'.repeat(50), 'success');
      print('✨ 插件安装成功！', 'success');
      print('═'.repeat(50) + '\n', 'success');
      print(`插件名称: ${chalk.cyan(linkName)}`, 'info');
      print(`安装位置: ${chalk.cyan(linkPath)}`, 'info');
      print('\n重启 OpenClaw 后插件将自动加载', 'info');
      return true;
    }
    
    return false;
  } finally {
    rl.close();
  }
}

/**
 * 自动安装
 */
async function autoInstall(openclawPath: string): Promise<boolean> {
  const extensionsDir = getExtensionsDir(openclawPath);
  const projectDir = getCurrentProjectDir();
  const linkName = path.basename(projectDir);
  const linkPath = path.join(extensionsDir, linkName);
  
  print(`\n创建插件链接:`, 'info');
  print(`  目标: ${chalk.gray(projectDir)}`, 'info');
  print(`  链接: ${chalk.gray(linkPath)}`, 'info');
  
  const success = await createSymlink(projectDir, linkPath);
  
  if (success && (await verifySymlink(linkPath))) {
    print('\n' + '═'.repeat(50), 'success');
    print('✨ 插件自动安装成功！', 'success');
    print('═'.repeat(50) + '\n', 'success');
    print(`插件名称: ${chalk.cyan(linkName)}`, 'info');
    print(`安装位置: ${chalk.cyan(linkPath)}`, 'info');
    print('\n重启 OpenClaw 后插件将自动加载', 'info');
    return true;
  }
  
  return false;
}

/**
 * 主函数
 */
async function main() {
  printTitle();
  
  // 检查是否在 CI 环境
  if (process.env.CI || process.env.NODE_ENV === 'ci') {
    print('检测到 CI 环境，跳过交互式设置', 'info');
  }
  
  // 检查是否需要跳过
  if (process.env.SKIP_OPENCLAW_SETUP === 'true') {
    print('设置 SKIP_OPENCLAW_SETUP=true，跳过安装', 'info');
    process.exit(0);
  }
  
  print(`运行平台: ${chalk.cyan(process.platform)}`, 'info');
  print(`当前项目: ${chalk.cyan(getCurrentProjectDir())}`, 'info');
  
  // 尝试自动探测
  const detectedPath = await detectOpenClawPath();
  
  let success = false;
  
  if (detectedPath) {
    // 自动安装
    success = await autoInstall(detectedPath);
  } else {
    // 进入交互模式（仅在非 CI 环境）
    if (process.env.CI || process.env.NODE_ENV === 'ci') {
      print('\nCI 环境中未找到 OpenClaw，跳过安装', 'warning');
      print('您可以稍后手动运行:', 'info');
      print(chalk.cyan('  npm run setup:openclaw'), 'info');
      process.exit(0);
    }
    
    print('\n' + '─'.repeat(50), 'warning');
    print('未能自动发现 OpenClaw', 'warning');
    print('─'.repeat(50) + '\n', 'warning');
    
    const rl = createReadline();
    try {
      const shouldProceed = await confirm(rl, '是否手动指定 OpenClaw 路径？');
      if (shouldProceed) {
        success = await interactiveSetup();
      } else {
        print('\n跳过安装。稍后您可以手动运行:', 'info');
        print(chalk.cyan('  npm run setup:openclaw'), 'info');
        print('\n或设置 OPENCLAW_HOME 环境变量后重新安装。', 'info');
      }
    } finally {
      rl.close();
    }
  }
  
  console.log(''); // 空行
  process.exit(success ? 0 : 1);
}

// 运行主函数
main().catch((error) => {
  print(`意外错误: ${error instanceof Error ? error.message : String(error)}`, 'error');
  process.exit(1);
});
