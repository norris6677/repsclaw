#!/usr/bin/env tsx
/**
 * 文档更新脚本
 * 更新AGENTS.md和TOOLS.md中的CLI参考部分
 */

import * as fs from 'fs';
import * as path from 'path';
import { generateCliDocs } from '../src/cli/generator/doc-generator';

const WORKSPACE_DIR = path.join(process.env.HOME || '/home/tony203', '.openclaw', 'workspace');
const AGENTS_FILE = path.join(WORKSPACE_DIR, 'AGENTS.md');
const TOOLS_FILE = path.join(WORKSPACE_DIR, 'TOOLS.md');
const PLUGIN_DIR = path.resolve(__dirname, '..');

function main() {
  // 读取版本号
  const packageJson = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, 'package.json'), 'utf8'));
  const version = packageJson.version;

  console.log(`📝 Updating docs for Repsclaw v${version}...\n`);

  // 生成文档内容
  const docs = generateCliDocs(version);

  // 更新AGENTS.md
  if (fs.existsSync(AGENTS_FILE)) {
    updateFile(AGENTS_FILE, docs.agentsSection, 'REPSCLAW-AUTO-SECTION');
    console.log(`✅ Updated: ${AGENTS_FILE}`);
  } else {
    console.warn(`⚠️  Not found: ${AGENTS_FILE}`);
  }

  // 更新TOOLS.md
  if (fs.existsSync(TOOLS_FILE)) {
    updateFile(TOOLS_FILE, docs.toolsSection, 'REPSCLAW-TOOLS-AUTO');
    console.log(`✅ Updated: ${TOOLS_FILE}`);
  } else {
    console.warn(`⚠️  Not found: ${TOOLS_FILE}`);
  }

  console.log('\n✨ Docs update complete!');
}

function updateFile(filePath: string, newContent: string, marker: string): void {
  let content = fs.readFileSync(filePath, 'utf8');
  const startMarker = `<!-- ${marker}:START -->`;
  const endMarker = `<!-- ${marker}:END -->`;

  // 转义特殊字符用于正则
  const escapedStart = startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const startRegex = new RegExp(escapedStart);
  const endRegex = new RegExp(escapedEnd);

  const hasStart = startRegex.test(content);
  const hasEnd = endRegex.test(content);

  if (hasStart && hasEnd) {
    // 替换现有区域
    const regex = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`, 'g');
    content = content.replace(regex, newContent.trim());
  } else {
    // 追加到文件末尾
    content += '\n\n' + newContent.trim() + '\n';
  }

  fs.writeFileSync(filePath, content);
}

main();
