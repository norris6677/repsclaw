/**
 * 文档生成器
 * 从Tool Registry提取信息，生成AGENTS.md和TOOLS.md内容
 */

import { registry } from '../../core/registry';

export interface GeneratedDocs {
  agentsSection: string;
  toolsSection: string;
  version: string;
  timestamp: string;
}

/**
 * 生成CLI文档
 */
export function generateCliDocs(version: string): GeneratedDocs {
  const timestamp = new Date().toISOString();

  return {
    agentsSection: generateAgentsSection(version, timestamp),
    toolsSection: generateToolsSection(version, timestamp),
    version,
    timestamp,
  };
}

/**
 * 生成AGENTS.md的CLI参考部分
 */
function generateAgentsSection(version: string, timestamp: string): string {
  return `<!-- REPSCLAW-AUTO-SECTION:START -->
<!-- 警告：此区域由 deploy.sh 自动生成，手动修改将被覆盖 -->
<!-- 生成时间: ${timestamp} -->
<!-- 版本: ${version} -->

## Repsclaw CLI 快速参考

当需要操作医疗数据时，直接使用 CLI（响应时间 < 1 秒）：

### 医院订阅
\`\`\`bash
# 订阅医院并设为主要医院
~/.openclaw/extensions/repsclaw/bin/repsclaw hospital subscribe "北京协和医院" --primary

# 订阅医院并同时订阅科室
~/.openclaw/extensions/repsclaw/bin/repsclaw hospital subscribe "华山医院" --department=心内科

# 列出已订阅的医院
~/.openclaw/extensions/repsclaw/bin/repsclaw hospital list

# 设置主要医院
~/.openclaw/extensions/repsclaw/bin/repsclaw hospital set-primary "协和医院"

# 取消订阅医院
~/.openclaw/extensions/repsclaw/bin/repsclaw hospital unsubscribe "北京协和医院"

# 仅取消某个科室
~/.openclaw/extensions/repsclaw/bin/repsclaw hospital unsubscribe "华山医院" --department=心内科

# 查看订阅统计
~/.openclaw/extensions/repsclaw/bin/repsclaw hospital status
\`\`\`

### 医生订阅
\`\`\`bash
# 订阅医生
~/.openclaw/extensions/repsclaw/bin/repsclaw doctor subscribe "张医生" --hospital="协和医院"

# 列出已订阅的医生
~/.openclaw/extensions/repsclaw/bin/repsclaw doctor list

# 取消订阅医生
~/.openclaw/extensions/repsclaw/bin/repsclaw doctor unsubscribe "张医生"
\`\`\`

### 医疗数据查询
\`\`\`bash
# FDA药品查询
~/.openclaw/extensions/repsclaw/bin/repsclaw query fda --drug="Aspirin" --limit=10

# PubMed文献查询
~/.openclaw/extensions/repsclaw/bin/repsclaw query pubmed --term="diabetes treatment" --limit=20

# ICD-10编码查询
~/.openclaw/extensions/repsclaw/bin/repsclaw query icd10 --code="E11"
~/.openclaw/extensions/repsclaw/bin/repsclaw query icd10 --term="diabetes mellitus"

# ClinicalTrials.gov临床试验查询
~/.openclaw/extensions/repsclaw/bin/repsclaw query clinical-trials --condition="lung cancer"

# medRxiv预印本查询
~/.openclaw/extensions/repsclaw/bin/repsclaw query medrxiv --term="COVID-19"

# NCBI Bookshelf医学书籍查询
~/.openclaw/extensions/repsclaw/bin/repsclaw query nci-bookshelf --term="cancer screening"
\`\`\`

### 医院新闻
\`\`\`bash
# 查询医院新闻
~/.openclaw/extensions/repsclaw/bin/repsclaw news --hospital="北京协和医院" --limit=5
\`\`\`

### 帮助命令
\`\`\`bash
# 查看CLI帮助
~/.openclaw/extensions/repsclaw/bin/repsclaw --help

# 查看模块帮助
~/.openclaw/extensions/repsclaw/bin/repsclaw hospital --help

# 查看具体命令帮助
~/.openclaw/extensions/repsclaw/bin/repsclaw hospital subscribe -h
\`\`\`

**重要**: 这些 CLI 命令直接操作本地数据文件或调用外部API，无需启动子代理，比 \`openclaw run/tool\` 快 100 倍以上。

**环境变量**（如需要调用外部API）：
- \`FDA_API_KEY\` - FDA药品查询
- \`PUBMED_API_KEY\` / \`NCBI_API_KEY\` - PubMed/NCBI查询

<!-- REPSCLAW-AUTO-SECTION:END -->`;
}

/**
 * 生成TOOLS.md的CLI参考部分
 */
function generateToolsSection(version: string, timestamp: string): string {
  return `<!-- REPSCLAW-TOOLS-AUTO:START -->
<!-- 生成时间: ${timestamp} -->
<!-- 版本: ${version} -->

### Repsclaw CLI

CLI主程序: \`~/.openclaw/extensions/repsclaw/bin/repsclaw\`

数据目录: \`~/.openclaw/repsclaw/\`

#### 常用命令速查

| 命令 | 说明 | 示例 |
|------|------|------|
| \`repsclaw hospital subscribe\` | 订阅医院 | \`repsclaw hospital subscribe "协和医院" --primary\` |
| \`repsclaw hospital list\` | 列出医院订阅 | \`repsclaw hospital list\` |
| \`repsclaw hospital unsubscribe\` | 取消订阅 | \`repsclaw hospital unsubscribe "协和医院"\` |
| \`repsclaw hospital set-primary\` | 设置主要医院 | \`repsclaw hospital set-primary "协和医院"\` |
| \`repsclaw hospital status\` | 订阅统计 | \`repsclaw hospital status\` |
| \`repsclaw doctor subscribe\` | 订阅医生 | \`repsclaw doctor subscribe "张医生"\` |
| \`repsclaw doctor list\` | 列出医生订阅 | \`repsclaw doctor list\` |
| \`repsclaw doctor unsubscribe\` | 取消医生订阅 | \`repsclaw doctor unsubscribe "张医生"\` |
| \`repsclaw query fda\` | FDA药品查询 | \`repsclaw query fda --drug="Aspirin"\` |
| \`repsclaw query pubmed\` | PubMed查询 | \`repsclaw query pubmed --term="cancer"\` |
| \`repsclaw query icd10\` | ICD-10查询 | \`repsclaw query icd10 --code="E11"\` |
| \`repsclaw query clinical-trials\` | 临床试验查询 | \`repsclaw query clinical-trials --condition="diabetes"\` |
| \`repsclaw query medrxiv\` | medRxiv查询 | \`repsclaw query medrxiv --term="COVID-19"\` |
| \`repsclaw query nci-bookshelf\` | NCBI Bookshelf | \`repsclaw query nci-bookshelf --term="genetics"\` |
| \`repsclaw news\` | 医院新闻 | \`repsclaw news --hospital="协和医院"\` |

#### 输出格式

所有命令输出JSON格式，包含以下字段：

\`\`\`json
{
  "status": "success|error",
  "data": { ... },
  "meta": {
    "timestamp": "2026-03-20T10:30:00.000Z"
  }
}
\`\`\`

#### 故障排查

1. **命令不存在**: 确保已运行部署脚本 `./deploy.sh`
2. **权限问题**: 检查CLI是否有执行权限 `chmod +x ~/.openclaw/extensions/repsclaw/bin/repsclaw`
3. **数据不更新**: CLI直接操作JSON文件，确保没有其他进程锁定文件

<!-- REPSCLAW-TOOLS-AUTO:END -->`;
}
