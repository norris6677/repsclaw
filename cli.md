# Repsclaw CLI 使用指南

Repsclaw CLI 是一个命令行工具，用于管理医疗信息订阅、查询医疗数据、执行知识采集任务等操作。

## 目录

- [快速开始](#快速开始)
- [命令概览](#命令概览)
- [订阅管理](#订阅管理)
  - [医院订阅](#医院订阅)
  - [医生订阅](#医生订阅)
- [数据查询](#数据查询)
- [新闻查询](#新闻查询)
- [知识采集](#知识采集)
  - [初次查询 (Bootstrap)](#初次查询-bootstrap)
  - [定期查询 (Incremental)](#定期查询-incremental)
  - [医生/科室采集](#医生科室采集)
- [进度追踪](#进度追踪)

---

## 快速开始

```bash
# 查看帮助
repsclaw --help

# 查看版本
repsclaw --version

# 查看模块帮助
repsclaw hospital --help
```

---

## 命令概览

| 模块 | 描述 |
|------|------|
| `hospital` | 医院订阅管理 |
| `doctor` | 医生订阅管理 |
| `query` | 医疗数据查询 (FDA, PubMed, 等) |
| `news` | 医院新闻查询 |
| `collection` | 知识采集管理 |
| `progress` | 采集进度追踪 |

---

## 订阅管理

### 医院订阅

#### 订阅医院
```bash
repsclaw hospital subscribe <医院名称> [--primary] [--department=科室名]
```

**参数：**
- `医院名称` - 要订阅的医院名称（位置参数）
- `--primary` - 设置为主要医院
- `--department` - 指定科室（可选）

**示例：**
```bash
# 订阅医院
repsclaw hospital subscribe "北京协和医院"

# 订阅并设置为主要医院
repsclaw hospital subscribe "华山医院" --primary

# 订阅特定科室
repsclaw hospital subscribe "协和医院" --department="心内科"
```

#### 列出已订阅医院
```bash
repsclaw hospital list
```

#### 取消订阅
```bash
repsclaw hospital unsubscribe <医院名称> [--department=科室名]
```

**示例：**
```bash
# 取消医院订阅
repsclaw hospital unsubscribe "北京协和医院"

# 取消特定科室订阅
repsclaw hospital unsubscribe "华山医院" --department="心内科"
```

#### 设置主要医院
```bash
repsclaw hospital set-primary <医院名称>
```

**示例：**
```bash
repsclaw hospital set-primary "北京协和医院"
```

#### 查看订阅状态
```bash
repsclaw hospital status
```

---

### 医生订阅

#### 订阅医生
```bash
repsclaw doctor subscribe <医生姓名> --hospital=<医院名> [--department=科室名] [--primary]
```

**参数：**
- `医生姓名` - 要订阅的医生姓名（位置参数）
- `--hospital` - **必需** 医生所属医院
- `--department` - 科室（可选）
- `--primary` - 设置为主要医生

**示例：**
```bash
# 订阅医生（必须先订阅医院）
repsclaw doctor subscribe "张医生" --hospital="北京协和医院"

# 订阅并设置为主要医生
repsclaw doctor subscribe "李医生" --hospital="华山医院" --department="心内科" --primary
```

**注意：**
- 订阅医生前必须先订阅该医生所在的医院
- 订阅成功后会自动触发医生信息采集任务
- 采集进度可通过 `repsclaw progress stream <job-id>` 查看

#### 列出已订阅医生
```bash
repsclaw doctor list [--hospital=<医院名>]
```

**示例：**
```bash
# 列出所有医生
repsclaw doctor list

# 按医院筛选
repsclaw doctor list --hospital="协和医院"
```

#### 取消订阅
```bash
repsclaw doctor unsubscribe <医生姓名> --hospital=<医院名>
```

**示例：**
```bash
repsclaw doctor unsubscribe "张医生" --hospital="北京协和医院"
```

#### 设置主要医生
```bash
repsclaw doctor set-primary <医生姓名> --hospital=<医院名>
```

**示例：**
```bash
repsclaw doctor set-primary "张医生" --hospital="北京协和医院"
```

#### 查看订阅状态
```bash
repsclaw doctor status
```

---

## 数据查询

### FDA 药品查询
```bash
repsclaw query fda --drug=<药品名> [--limit=10]
```

**示例：**
```bash
repsclaw query fda --drug="Aspirin"
repsclaw query fda --drug="Ibuprofen" --limit=5
```

### PubMed 文献查询
```bash
repsclaw query pubmed --term=<搜索词> [--limit=10]
```

**示例：**
```bash
repsclaw query pubmed --term="diabetes treatment"
repsclaw query pubmed --term="COVID-19 vaccine" --limit=20
```

### ICD-10 编码查询
```bash
repsclaw query icd10 --code=<编码>  # 按编码查询
repsclaw query icd10 --term=<关键词> # 按关键词查询
```

**示例：**
```bash
repsclaw query icd10 --code="E11"
repsclaw query icd10 --term="diabetes mellitus"
```

### Clinical Trials 临床试验查询
```bash
repsclaw query clinical-trials --condition=<疾病> [--status=recruiting] [--limit=10]
```

**示例：**
```bash
repsclaw query clinical-trials --condition="lung cancer"
repsclaw query clinical-trials --condition="diabetes" --status=recruiting
```

### medRxiv 预印本查询
```bash
repsclaw query medrxiv --term=<搜索词> [--limit=10]
```

**示例：**
```bash
repsclaw query medrxiv --term="machine learning"
repsclaw query medrxiv --term="COVID-19" --limit=20
```

### NCI Bookshelf 医学书籍查询
```bash
repsclaw query nci-bookshelf --term=<搜索词> [--limit=10]
```

**示例：**
```bash
repsclaw query nci-bookshelf --term="cancer screening"
repsclaw query nci-bookshelf --term="genetics" --limit=5
```

---

## 新闻查询

### 查询医院新闻
```bash
repsclaw news --hospital=<医院名> [--limit=10]
```

**示例：**
```bash
repsclaw news --hospital="北京协和医院"
repsclaw news --hospital="华山医院" --limit=5
```

---

## 知识采集

知识采集模块用于从多个数据源收集医院和医生的相关信息，支持**初次查询**（全量采集）和**定期查询**（增量采集）两种模式。

### 初次查询 (Bootstrap)

全量采集模式，回溯90天数据，适用于首次采集或需要完整数据重建的场景。

```bash
repsclaw collection bootstrap --hospital=<医院名称>
```

**参数：**
- `--hospital` - **必需** 医院名称

**示例：**
```bash
repsclaw collection bootstrap --hospital="北京协和医院"
```

**特性：**
- 回溯90天数据
- 采集数据源：医院官网、百度搜索、微信搜索、政府网站、新闻媒体
- 预计用时：15-20分钟
- 自动触发进度追踪

---

### 定期查询 (Incremental)

增量采集模式，默认采集最近7天的新增数据，用于定期更新。

```bash
repsclaw collection incremental --hospital=<医院名称> [--days=7]
```

**参数：**
- `--hospital` - **必需** 医院名称
- `--days` - 采集天数（默认7天，可选）

**示例：**
```bash
# 采集最近7天数据（默认）
repsclaw collection incremental --hospital="北京协和医院"

# 采集最近3天数据
repsclaw collection incremental --hospital="华山医院" --days=3
```

**特性：**
- 默认采集最近7天数据
- 采集数据源：医院官网、百度搜索、微信搜索
- 预计用时：5-10分钟
- 适合定时任务执行

---

### 医生/科室采集

#### 医生信息采集
```bash
repsclaw collection doctor --hospital=<医院名> --doctor=<医生名> [--days=30] [--bootstrap]
```

**参数：**
- `--hospital` - **必需** 医生所属医院
- `--doctor` - **必需** 医生姓名
- `--days` - 采集天数（默认30天）
- `--bootstrap` - 使用全量模式（采集50条，否则20条）

**示例：**
```bash
# 增量采集医生信息（最近30天）
repsclaw collection doctor --hospital="北京协和医院" --doctor="张医生"

# 全量采集医生信息（回溯90天）
repsclaw collection doctor --hospital="华山医院" --doctor="李医生" --days=90 --bootstrap
```

---

#### 科室信息采集
```bash
repsclaw collection department --hospital=<医院名> --department=<科室名> [--days=30] [--bootstrap]
```

**参数：**
- `--hospital` - **必需** 医院名称
- `--department` - **必需** 科室名称
- `--days` - 采集天数（默认30天）
- `--bootstrap` - 使用全量模式

**示例：**
```bash
# 采集科室信息
repsclaw collection department --hospital="北京协和医院" --department="心内科"

# 全量采集科室信息
repsclaw collection department --hospital="华山医院" --department="神经外科" --days=60 --bootstrap
```

---

### 采集任务管理

#### 列出所有任务
```bash
repsclaw collection list [--active]
```

**参数：**
- `--active` - 只显示运行中的任务

**示例：**
```bash
# 列出所有任务
repsclaw collection list

# 只列出运行中的任务
repsclaw collection list --active
```

---

#### 查看任务详情
```bash
repsclaw collection status <job-id>
```

**示例：**
```bash
repsclaw collection status abc123...
```

---

#### 取消任务
```bash
repsclaw collection cancel <job-id>
```

**示例：**
```bash
repsclaw collection cancel abc123...
```

---

#### 查看采集统计
```bash
repsclaw collection stats
```

输出示例：
```json
{
  "stats": {
    "总任务数": 15,
    "运行中": 2,
    "已完成": 12,
    "失败": 1,
    "数据源总数": 156,
    "去重数": 23,
    "存储大小": "45MB"
  }
}
```

---

#### 批量启动所有医院增量采集
```bash
repsclaw collection run-all [--days=7]
```

**示例：**
```bash
# 为所有已订阅医院启动增量采集（默认7天）
repsclaw collection run-all

# 为所有已订阅医院启动3天增量采集
repsclaw collection run-all --days=3
```

---

## 进度追踪

进度追踪模块提供采集任务的实时监控功能，支持SSE实时流、进度查询和摘要查看。

### 查看任务进度状态
```bash
repsclaw progress status <job-id>
```

**示例：**
```bash
repsclaw progress status abc123...
```

---

### 列出活跃任务
```bash
repsclaw progress list
```

---

### 实时追踪进度（SSE流）
```bash
repsclaw progress stream <job-id> [--json]
```

**参数：**
- `--json` - 以JSON格式输出原始事件

**示例：**
```bash
# 实时查看进度（人类可读格式）
repsclaw progress stream abc123...

# 以JSON格式输出
repsclaw progress stream abc123... --json
```

**输出示例：**
```
🔴 正在追踪任务 abc123... 的实时进度...
按 Ctrl+C 停止监听

[10:30:15] 🚀 任务开始
[10:30:20] 📊 进度: 25% (5/20) [hospital_official]
[10:32:10] ✅ 数据源完成: hospital_official (45条, 110秒)
[10:32:10] 📝 摘要 [hospital_official]:
   1. 医院新闻: 协和医院专家团队发布新研究成果
   2. 学术动态: 心内科主任在国际期刊发表论文
   3. 医疗公告: 新科室即将开业
[10:35:20] ✅ 数据源完成: baidu_search (32条, 190秒)
...
[10:45:30] ✨ 任务完成! 共采集 127 条数据，耗时 915秒
```

**事件类型：**
- `started` - 任务开始
- `progress` - 进度更新
- `source_complete` - 数据源完成
- `summary` - 数据源摘要
- `completed` - 任务完成
- `error` - 错误/警告

---

### 查看数据源摘要
```bash
repsclaw progress summary <job-id>
```

**示例：**
```bash
repsclaw progress summary abc123...
```

**输出示例：**
```
📊 任务 abc123... 的数据源摘要:

【hospital_official】
  采集数量: 45
  分类分布:
    - 医院新闻: 20
    - 学术动态: 15
    - 医疗公告: 10
  重点内容:
    1. 协和医院专家团队发布新研究成果
    2. 心内科主任在国际期刊发表论文
    3. 新科室即将开业

【baidu_search】
  ...
```

---

### 生成完整进度报告
```bash
repsclaw progress report <job-id> [--output=文件名]
```

**参数：**
- `--output` - 输出文件路径（可选，默认输出到控制台）

**示例：**
```bash
# 输出到控制台
repsclaw progress report abc123...

# 保存到文件
repsclaw progress report abc123... --output=report.json
```

---

## 典型工作流程

### 1. 初始设置
```bash
# 1. 订阅主要医院
repsclaw hospital subscribe "北京协和医院" --primary

# 2. 订阅关注的医生
repsclaw doctor subscribe "张主任" --hospital="北京协和医院" --department="心内科" --primary

# 3. 启动全量采集
repsclaw collection bootstrap --hospital="北京协和医院"

# 4. 查看采集进度
repsclaw progress stream <job-id>
```

### 2. 定期更新
```bash
# 批量启动所有医院的增量采集
repsclaw collection run-all --days=7

# 查看活跃任务
repsclaw collection list --active

# 查看统计
repsclaw collection stats
```

### 3. 数据查询
```bash
# 查询医院新闻
repsclaw news --hospital="北京协和医院"

# 查询医学文献
repsclaw query pubmed --term="cardiovascular disease"

# 查询药品信息
repsclaw query fda --drug="Metformin"
```

---

## 环境变量

CLI 支持以下环境变量：

| 变量 | 描述 | 用途 |
|------|------|------|
| `FDA_API_KEY` | FDA API密钥 | FDA药品查询 |
| `PUBMED_API_KEY` / `NCBI_API_KEY` | PubMed/NCBI API密钥 | 文献查询 |
| `JUHE_NEWS_API_KEY` | 聚合新闻API密钥 | 新闻查询 |

---

## 故障排除

### 任务未找到
如果收到 `NOT_FOUND` 错误，可能是因为：
- 任务ID输入错误
- 任务已被清理（已完成任务保留在内存中，最多50个）

### 采集失败
- 检查网络连接
- 查看具体错误：`repsclaw progress report <job-id>`
- 重试采集任务

### 进度追踪无输出
- 确保任务ID正确
- 检查任务是否已开始：`repsclaw collection status <job-id>`
- 任务可能已完成，使用 `repsclaw progress summary` 查看结果
