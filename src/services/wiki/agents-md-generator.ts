/**
 * AGENTS.md Generator
 * 根据类型定义自动生成 Schema 层规则说明书
 */

import * as fs from 'fs';
import * as path from 'path';
import { WIKI_DIR } from '../../config/data-paths.config';
import { createLogger } from '../../utils/plugin-logger';

const logger = createLogger('REPSCLAW:WIKI-AGENTS');

const AGENTS_MD_CONTENT = `# Medical Wiki - 知识管理规则

## 实体类型定义

### 医院 (Hospital)
- **必需字段**: name, created_at, updated_at
- **可选字段**: aliases, type, location, rank, status, primary_contact, bed_count, annual_patients, specialties
- **关联**: departments[], doctors[], relations[]

### 科室 (Department)
- **必需字段**: hospital, name, created_at, updated_at
- **可选字段**: aliases, dept_head, bed_count, staff_count, annual_patients, focus_areas
- **关联**: hospital, doctors[]

### 医生 (Doctor)
- **必需字段**: name, hospital, created_at, updated_at
- **可选字段**: department, title, role, specialties, education, contact
- **关联**: hospital, department, mentors[], collaborators[]

### 专题分析 (Insight)
- **必需字段**: title, type, created_at, updated_at
- **可选字段**: related_entities, generated_at, source_count
- **类型**: market_analysis, trend_report, competitive_intel, meeting_summary, custom

### 关系记录 (Relation)
- **必需字段**: title, relation_type, entities, created_at, updated_at
- **可选字段**: description, evidence_sources
- **类型**: collaboration, competition, affiliation, mentorship, other

## 命名规范

- 医院档案: \`{医院全称}.md\`
- 科室档案: \`{医院简称}_{科室名}.md\`
- 医生档案: \`{医院简称}_{姓名}.md\`
- 专题分析: \`{主题}.md\` (建议包含日期前缀)
- 关系记录: \`{主题}.md\`

## 更新规则

1. **矛盾处理**: 新信息覆盖旧信息，旧信息移入页面底部的 "更新记录" 或 "历史记录" 部分
2. **时效标记**: 超过 6 个月未更新的页面，Lint 服务会自动标记为 stale
3. **待办同步**: 实体页面的 \`## 待办事项\` 与全局待办列表同步（手动维护）
4. **关系双向**: A 引用 B 时，建议 B 也应引用 A（通过关系页面统一维护）

## Ingest 流程

1. 读取相关现有 Wiki 页面作为上下文
2. 识别 Source 中的实体（医院、科室、医生）
3. 提取关键事实（人事变动、设备采购、科研项目、合作关系）
4. 检测与现有知识的矛盾
5. 更新/创建实体档案
6. 更新关系和专题页面
7. 追加 log.md
8. 更新 index.md 的统计

## Query 流程

1. 读取 index.md 了解整体结构
2. 根据问题关键词定位相关实体页面
3. 深入读取关联页面
4. 调用 LLM 合成答案并标注引用来源
5. 如答案有价值，询问是否保存为 insight

## Lint 流程

1. **矛盾检测**: 检查同一医生在不同医院任职、科室名称不一致等
2. **过期标记**: 标记超过 6 个月未更新的页面
3. **孤儿页面**: 检测未被引用的实体页面
4. **缺失补全**: 检查已订阅医院是否都有 Wiki 档案
5. 生成月度报告保存到 \`lint-reports/YYYY-MM.md\`

## 最佳实践

- 保持实体页面的 YAML frontmatter 完整
- 每次 Ingest 后检查 log.md 记录
- 使用 [[页面名称]] 格式建立双向链接
- 对不确定的信息标注 \`[[待验证]]\`
- 每月至少运行一次 Lint
`;

export function ensureAgentsMd(): void {
  const agentsPath = path.join(WIKI_DIR, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    fs.writeFileSync(agentsPath, AGENTS_MD_CONTENT, 'utf-8');
    logger.info('Generated AGENTS.md', { path: agentsPath });
  }
}

export function getAgentsMdContent(): string {
  return AGENTS_MD_CONTENT;
}
