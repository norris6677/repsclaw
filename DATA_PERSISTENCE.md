# RepsClaw 数据持久化结构

本文档描述 RepsClaw 项目使用 Markdown 文件进行数据持久化的结构规范。

## 概述

项目采用文件系统 + Markdown（类似 Obsidian）的方式进行数据持久化。所有数据存储在统一的数据目录下，根据运行环境自动选择存储位置：

- **开发环境**: `{project_root}/data/`
- **生产环境**: `~/.repsclaw/data/`

## 目录结构

```
data/ 或 ~/.repsclaw/data/
├── hospitals/          # 医院订阅数据 (Markdown)
├── doctors/            # 医生订阅数据 (Markdown)
├── news/               # 新闻缓存数据 (Markdown，按日期组织)
│   ├── 2026-04-01/
│   ├── 2026-04-02/
│   └── ...
├── cache/              # 临时缓存数据
│   ├── wechat/         # WeChat 搜索缓存
│   │   ├── rate-limit.json      # 频率限制记录
│   │   ├── sogou-cookie.txt     # Cookie 存储
│   │   └── content-cache/       # 文章内容缓存
│   └── search/         # 其他搜索缓存
└── storage/            # Crawlee 存储目录
    ├── key_value_stores/
    └── request_queues/
```

## 环境区分

### 开发环境

当在项目根目录（包含 `package.json` 且 `name` 为 `repsclaw`）下运行时，数据存储在：

```
{project_root}/data/
```

### 生产环境

当作为 OpenClaw 插件运行时，数据存储在用户主目录：

```
~/.repsclaw/data/
```

### 自定义路径

通过环境变量可以自定义数据存储路径（优先级最高）：

```bash
export REPSCLAW_DATA_DIR=/path/to/custom/data
```

## 配置文件

数据路径配置位于：`src/config/data-paths.config.ts`

主要常量：

| 常量 | 路径 | 说明 |
|------|------|------|
| `BASE_DATA_DIR` | `data/` 或 `~/.repsclaw/` | 基础数据目录 |
| `HOSPITALS_DIR` | `.../hospitals/` | 医院订阅数据 |
| `DOCTORS_DIR` | `.../doctors/` | 医生订阅数据 |
| `NEWS_DIR` | `.../news/` | 新闻缓存数据 |
| `CACHE_DIR` | `.../cache/` | 临时缓存数据 |
| `WECHAT_CACHE_DIR` | `.../cache/wechat/` | WeChat 搜索缓存 |
| `CRAWLEE_STORAGE_DIR` | `.../storage/` | Crawlee 存储目录 |

## 文件命名规范

- 文件名中的特殊字符（`\/:*?"<>|`）和空格会被替换为下划线 `_`
- 文件名长度限制为 100 个字符

## 文件格式

所有 Markdown 文件使用统一格式，包含 YAML frontmatter（元数据）和 Markdown 内容两部分。

### YAML Frontmatter 格式

```yaml
---
key1: value1
key2: value2
array_key:
  - item1
  - item2
---
```

### 支持的 YAML 数据类型

| 类型 | 示例 | 说明 |
|------|------|------|
| 字符串 | `name: 协和医院` | 无需引号，除非包含特殊字符 |
| 数字 | `count: 42` | 整数或浮点数 |
| 布尔值 | `isPrimary: true` | `true` 或 `false` |
| 空值 | `field: null` | `null`、`~` 或留空 |
| 空数组 | `departments: []` | 显式空数组 |
| 数组 | `departments:`<br>`  - 心内科`<br>`  - 神经内科` | 每项以 `- ` 开头 |
| JSON字符串 | `data: "{\"key\":\"value\"}"` | 自动转义双引号 |

---

## 医院订阅数据

**存储位置**: `{data_dir}/hospitals/`（开发环境为 `{project_root}/data/hospitals/`，生产环境为 `~/.repsclaw/data/hospitals/`）

**文件名格式**: `{医院名称}.md`

### YAML Frontmatter 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✓ | 医院完整名称 |
| `isPrimary` | boolean | ✓ | 是否为默认/主要医院 |
| `subscribedAt` | string | ✓ | 订阅时间（ISO 8601 格式） |
| `lastPromptedDate` | string \| null | ✓ | 最后提示日期（YYYY-MM-DD） |
| `lastQueryAt` | string \| null | ✓ | 最后查询时间（ISO 8601） |
| `departments` | string[] | ✓ | 订阅的科室列表 |

### 示例文件

```markdown
---
name: 北京协和医院
isPrimary: true
subscribedAt: 2026-04-07T10:30:00.000Z
lastPromptedDate: 2026-04-07
lastQueryAt: 2026-04-07T11:00:00.000Z
departments:
  - 心内科
  - 神经内科
  - 骨科
---

# 北京协和医院

## 订阅信息

- 订阅时间: 2026-04-07T10:30:00.000Z
- 是否主要医院: 是

## 科室

- 心内科
- 神经内科
- 骨科
```

---

## 医生订阅数据

**存储位置**: `{data_dir}/doctors/`（开发环境为 `{project_root}/data/doctors/`，生产环境为 `~/.repsclaw/data/doctors/`）

**文件名格式**: `{医院名称}_{医生姓名}.md`

### YAML Frontmatter 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✓ | 医生姓名 |
| `hospital` | string | ✓ | 所属医院名称 |
| `department` | string \| null | ✗ | 所属科室（可选） |
| `isPrimary` | boolean | ✓ | 是否为默认/主要医生 |
| `subscribedAt` | string | ✓ | 订阅时间（ISO 8601 格式） |

### 示例文件

```markdown
---
name: 张医生
hospital: 北京协和医院
department: 心内科
isPrimary: true
subscribedAt: 2026-04-07T10:35:00.000Z
---

# 张医生

## 医生信息

- 所属医院: 北京协和医院
- 科室: 心内科
- 订阅时间: 2026-04-07T10:35:00.000Z
- 是否主要医生: 是
```

---

## 新闻缓存数据

**存储位置**: `{data_dir}/news/YYYY-MM-DD/`（开发环境为 `{project_root}/data/news/`，生产环境为 `~/.repsclaw/data/news/`）

**文件名格式**: `{医院名称}_{新闻ID}.md`

### YAML Frontmatter 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✓ | 新闻唯一标识（MD5 或 UUID） |
| `hospitalName` | string | ✓ | 关联医院名称 |
| `sourceType` | string | ✓ | 新闻来源类型（如 `hospital_self`, `official`, `mainstream`） |
| `title` | string | ✓ | 新闻标题 |
| `summary` | string | ✓ | 新闻摘要 |
| `originalUrl` | string | ✓ | 原文链接 |
| `publishedAt` | string | ✓ | 发布时间（ISO 8601） |
| `fetchedAt` | string | ✓ | 抓取时间（ISO 8601） |
| `relevanceScore` | number | ✓ | 相关度评分（0-1） |
| `sentiment` | string | ✓ | 情感分析结果（如 `positive`, `neutral`, `negative`） |
| `categories` | string[] | ✓ | 新闻分类标签 |
| `data` | string | ✓ | 完整数据 JSON 字符串化 |

### 示例文件

```markdown
---
id: a1b2c3d4e5f6
hospitalName: 北京协和医院
sourceType: hospital_self
title: 医院荣获2026年度最佳医院称号
summary: 北京协和医院在全国医院评选中荣获年度最佳医院称号...
originalUrl: https://www.pumch.cn/news/12345
publishedAt: 2026-04-07T09:00:00.000Z
fetchedAt: 2026-04-07T10:00:00.000Z
relevanceScore: 0.95
sentiment: positive
categories:
  - 荣誉
  - 医院动态
data: "{\"fullContent\":\"完整新闻内容...\",\"author\":\"院办\"}"
---

# 医院荣获2026年度最佳医院称号

## 摘要

北京协和医院在全国医院评选中荣获年度最佳医院称号...

## 链接

[原文链接](https://www.pumch.cn/news/12345)

## 元数据

- 来源: hospital_self
- 发布于: 2026-04-07T09:00:00.000Z
- 相关度: 0.95
- 情感: positive
```

---

## 缓存数据

### WeChat 搜索缓存

**存储位置**: `{data_dir}/cache/wechat/`

| 文件 | 说明 |
|------|------|
| `rate-limit.json` | 频率限制记录（上次请求时间、失败状态） |
| `sogou-cookie.txt` | 搜狗 Cookie 存储 |
| `content-cache/{hash}.json` | 微信公众号文章内容缓存（24小时过期） |

### 缓存清理策略

- **新闻缓存**: 默认保留 48 小时，过期文件自动清理
- **WeChat 内容缓存**: 24 小时过期
- **Crawlee 存储**: 临时存储，任务完成后清理

清理逻辑：

1. 遍历缓存目录
2. 检查每个文件的 `fetchedAt` 或时间戳字段
3. 删除超过 `maxAgeHours` 的文件
4. 删除空目录

---

## 与 SQLite 的对比

| 特性 | SQLite | Markdown |
|------|--------|----------|
| 可读性 | 需专用工具 | 纯文本，可直接查看 |
| 版本控制 | 二进制文件 | 适合 Git 管理 |
| 编辑方式 | SQL | 直接编辑文件 |
| 性能 | 高（索引优化） | 适合中小数据量 |
| 依赖 | better-sqlite3 原生模块 | 仅 Node.js fs 模块 |
| 数据迁移 | 需导出工具 | 直接复制文件 |

---

## 相关文件

- `src/config/data-paths.config.ts` - 统一数据路径配置
- `src/services/subscription-db.markdown.ts` - Markdown 数据库实现
- `src/services/subscription-db.interface.ts` - 数据库接口定义
- `src/services/subscription-db.memory.ts` - 内存数据库实现（测试用）
