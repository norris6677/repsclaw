#!/usr/bin/env node
/**
 * OpenClaw Plugin Setup Script
 * 
 * 该脚本在 npm postinstall 阶段运行，自动将本插件复制到 OpenClaw 的扩展目录
 * 
 * 【绝对准则】禁止在本项目中使用软链接（symlink）部署插件
 * - 原因：软链接会导致 OpenClaw 加载时出现 "plugin not found" 错误
 * - 替代方案：始终使用文件复制（fs.copy）方式部署
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
 * 复制插件文件到目标目录
 * 【绝对准则】禁止使用软链接，必须使用文件复制
 * 【方案 A】对齐 Feishu 模式：复制完整项目结构（包括 node_modules）
 */
async function copyPluginFiles(sourceDir: string, targetDir: string): Promise<boolean> {
  try {
    print('复制插件文件...', 'info');
    
    // 确保父目录存在
    await fs.ensureDir(path.dirname(targetDir));
    
    // 如果目标已存在，先删除
    if (await fs.pathExists(targetDir)) {
      const stat = await fs.lstat(targetDir);
      // 检查是否是软链接，如果是则删除
      if (stat.isSymbolicLink()) {
        print('发现现有的软链接，正在移除...', 'warning');
        await fs.unlink(targetDir);
      } else if (stat.isDirectory()) {
        await fs.remove(targetDir);
        print('已移除现有目录', 'info');
      }
    }
    
    // 创建新的目标目录
    await fs.ensureDir(targetDir);
    
    // 【方案 A】复制关键文件和目录（完整复制，对齐 Feishu 模式）
    const filesToCopy = [
      'index.ts',              // 入口文件（必须在根目录）
      'package.json',          // 包含 openclaw.extensions 配置
      'openclaw.plugin.json',  // 插件配置（不包含 main 字段）
      'tsconfig.json',         // TypeScript 配置
      'node_modules',          // 完整依赖（必须复制）
      'src',                   // TypeScript 源码
    ];
    
    for (const file of filesToCopy) {
      const sourcePath = path.join(sourceDir, file);
      const targetPath = path.join(targetDir, file);
      
      if (await fs.pathExists(sourcePath)) {
        await fs.copy(sourcePath, targetPath);
        print(`  复制: ${file}`, 'info');
      } else {
        print(`  跳过: ${file} (不存在)`, 'warning');
      }
    }
    
    return true;
  } catch (error) {
    print(`复制文件失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return false;
  }
}

/**
 * 验证复制是否成功
 * 【方案 A】验证 Feishu 模式的要求
 */
async function verifyCopy(targetDir: string): Promise<boolean> {
  try {
    // 检查关键文件是否存在（方案 A）
    const requiredFiles = [
      'index.ts',              // 入口文件
      'package.json',          // 包含 openclaw.extensions
      'openclaw.plugin.json',  // 插件配置
      'node_modules',          // 依赖目录
    ];
    
    for (const file of requiredFiles) {
      const filePath = path.join(targetDir, file);
      if (!(await fs.pathExists(filePath))) {
        print(`缺少必需文件/目录: ${file}`, 'error');
        return false;
      }
    }
    
    // 验证 openclaw.plugin.json 格式
    const pluginJsonPath = path.join(targetDir, 'openclaw.plugin.json');
    const pluginJson = await fs.readJson(pluginJsonPath);
    
    if (!pluginJson.id) {
      print('openclaw.plugin.json 缺少必需字段 (id)', 'error');
      return false;
    }
    
    // 【方案 A】检查是否错误地包含了 main 字段
    if (pluginJson.main) {
      print('警告: openclaw.plugin.json 包含 main 字段，这会导致加载失败', 'warning');
      print('请删除 main 字段，使用 package.json 中的 openclaw.extensions 替代', 'warning');
      return false;
    }
    
    // 验证 package.json 包含 openclaw.extensions
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = await fs.readJson(packageJsonPath);
    
    if (!packageJson.openclaw || !packageJson.openclaw.extensions) {
      print('package.json 缺少 openclaw.extensions 配置', 'error');
      print('请添加: "openclaw": { "extensions": ["./index.ts"] }', 'error');
      return false;
    }
    
    print(`验证成功: ${targetDir}`, 'success');
    return true;
  } catch (error) {
    print(`验证失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
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
    const pluginName = path.basename(projectDir);
    const targetDir = path.join(extensionsDir, pluginName);
    
    print(`\n准备安装插件:`, 'info');
    print(`  源目录: ${projectDir}`, 'info');
    print(`  目标: ${targetDir}`, 'info');
    print(`  方式: 文件复制（禁止使用软链接）`, 'warning');
    
    const confirmed = await confirm(rl, '确认安装？');
    if (!confirmed) {
      print('用户取消操作', 'warning');
      return false;
    }
    
    const success = await copyPluginFiles(projectDir, targetDir);
    
    if (success && (await verifyCopy(targetDir))) {
      print('\n' + '═'.repeat(50), 'success');
      print('✨ 插件安装成功！', 'success');
      print('═'.repeat(50) + '\n', 'success');
      print(`插件名称: ${chalk.cyan(pluginName)}`, 'info');
      print(`安装位置: ${chalk.cyan(targetDir)}`, 'info');
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
  const pluginName = path.basename(projectDir);
  const targetDir = path.join(extensionsDir, pluginName);
  
  print(`\n安装插件:`, 'info');
  print(`  源目录: ${chalk.gray(projectDir)}`, 'info');
  print(`  目标: ${chalk.gray(targetDir)}`, 'info');
  print(`  方式: ${chalk.yellow('文件复制（禁止使用软链接）')}`, 'warning');
  
  const success = await copyPluginFiles(projectDir, targetDir);
  
  if (success && (await verifyCopy(targetDir))) {
    print('\n' + '═'.repeat(50), 'success');
    print('✨ 插件自动安装成功！', 'success');
    print('═'.repeat(50) + '\n', 'success');
    print(`插件名称: ${chalk.cyan(pluginName)}`, 'info');
    print(`安装位置: ${chalk.cyan(targetDir)}`, 'info');
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
