# 知识采集系统实现文档

基于 methodology.md 的医院、科室、客户知识采集功能迭代实现。

## 核心功能

### 1. 三层架构实现

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Tools (OpenClaw Tools)                            │
│  - bootstrap_knowledge_collection                           │
│  - incremental_knowledge_collection                         │
│  - get_collection_status                                    │
│  - query_raw_sources                                        │
│  - get_collection_stats                                     │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Services                                          │
│  - KnowledgeCollectionService (核心采集服务)                 │
│  - RawSourceManager (原始资料管理)                           │
│  - ScheduledTaskService (定时任务调度)                       │
│  - EnhancedHospitalSubscriptionService (增强订阅服务)        │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Raw Sources (Markdown 存储)                        │
│  data/raw-sources/hospitals/{医院名}/contents/*.md           │
└─────────────────────────────────────────────────────────────┘
```

### 2. 首次订阅自动采集

当用户首次订阅医院时，系统自动：

1. 创建订阅记录（Markdown DB）
2. 异步启动首次全量采集（Bootstrap）
3. 采集范围：
   - 医院官网（深度2-3层）
   - 百度搜索（最近90天）
   - 微信搜索（最近30天）
   - 政府公告
   - 媒体报道

### 3. 定时增量更新

使用 `node-cron` 实现每日凌晨2点自动增量采集：

```typescript
// 默认配置
{
  enabled: true,
  schedule: '0 2 * * *',  // 每天凌晨2点
  days: 7,                 // 回溯7天
  sourceTypes: [
    'hospital_official',
    'baidu_search',
    'wechat_search'
  ]
}
```

### 4. 反爬策略

**保守策略，优先考虑稳定性**：

| 策略项 | 配置值 | 说明 |
|--------|--------|------|
| 请求间隔 | 3-8秒随机 | 模拟人工操作 |
| 并发数 | 最多2个 | 降低被封风险 |
| 重试机制 | 指数退避 | 基础5秒，最大5分钟 |
| User-Agent | 轮换3个 | Chrome/Firefox |
| 每日上限 | 500请求 | 防被封 |
| 超时时间 | 30秒 | 避免长时间等待 |

### 5. 去重机制

**URL + 标题哈希双重去重**：

```typescript
// 第一层：URL 精确匹配
hashUrl('https://example.com/article?utm_source=test')
// 标准化后：移除跟踪参数、统一协议、排序参数

// 第二层：标题哈希匹配
hashTitle('北京协和医院新闻')
// 标准化后：转小写、移除多余空格、统一标点

// 第三层：标题相似度检测（90%阈值）
calculateSimilarity('心内科突破', '心内科新突破！') > 0.9
```

### 6. 存储格式

**Markdown + YAML Frontmatter**：

```markdown
---
id: "a1b2c3d4e5f6"
source_type: "hospital_official"
hospital: "北京协和医院"
departments: ["心内科", "肿瘤科"]
collected_at: "2026-04-08T10:30:00Z"
url: "https://www.pumch.cn/news/12345"
title: "心内科成功完成首例AI辅助介入手术"
content_hash: "sha256:abc123..."
url_hash: "sha256:def456..."
title_hash: "sha256:ghi789..."
tags: ["科研", "临床"]
job_id: "uuid-of-collection-job"
---

# 心内科成功完成首例AI辅助介入手术

> 来源：hospital_official
> 采集时间：2026-04-08 10:30:00
> 原始链接：[https://www.pumch.cn/news/12345](https://www.pumch.cn/news/12345)

---

## 原始内容

[网页内容转换后的 Markdown]
```

## 文件结构

```
src/
├── types/knowledge-collection.types.ts      # 类型定义
├── utils/deduplication.ts                   # 去重工具
├── services/
│   ├── knowledge-collection/
│   │   ├── index.ts                         # 模块导出
│   │   ├── knowledge-collection.service.ts  # 核心服务
│   │   ├── raw-source.manager.ts            # 资料管理
│   │   ├── scheduled-task.service.ts        # 定时任务
│   │   └── collection.worker.ts             # Worker线程
│   └── hospital-subscription-enhanced.service.ts  # 增强订阅
├── tools/knowledge-collection.tool.ts       # 工具实现
tests/unit/services/
├── deduplication.test.ts                    # 去重测试
└── raw-source-manager.test.ts              # 管理器测试
```

## 新增依赖

```json
{
  "dependencies": {
    "node-cron": "^3.0.3",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "@types/node-cron": "^3.0.11",
    "@types/uuid": "^9.0.8"
  }
}
```

## 工具API

### bootstrap_knowledge_collection

启动首次全量采集。

```typescript
{
  hospitalName: string;     // 医院名称
  days?: number;            // 回溯天数（默认90）
}
```

### incremental_knowledge_collection

启动增量采集。

```typescript
{
  hospitalName?: string;    // 不传则采集所有医院
  days?: number;            // 回溯天数（默认7）
}
```

### get_collection_status

查询采集任务状态。

```typescript
{
  jobId?: string;           // 不传则返回所有任务
}
```

### query_raw_sources

查询已采集的原始资料。

```typescript
{
  hospitalName?: string;
  keyword?: string;
  sourceType?: CollectionSourceType;
  startDate?: string;       // YYYY-MM-DD
  endDate?: string;         // YYYY-MM-DD
  limit?: number;           // 默认10
}
```

### get_collection_stats

获取采集系统统计信息。

## 工作流程

### 首次订阅流程

```
用户订阅医院
    │
    ▼
创建订阅记录 (Markdown DB)
    │
    ▼
触发自动采集 (异步，不阻塞响应)
    │
    ▼
启动 Worker 线程
    │
    ├── 爬取医院官网 (深度2)
    ├── 百度搜索 (最近90天)
    └── 微信搜索 (最近30天)
    │
    ▼
去重检查 (URL + 标题)
    │
    ▼
存储为 Markdown (Layer 1)
    │
    ▼
更新索引文件
```

### 每日增量流程

```
定时触发 (每天凌晨2点)
    │
    ▼
获取所有订阅医院
    │
    ▼
依次执行增量采集
    │
    ├── 请求间隔3-8秒随机
    ├── 最多2个并发
    └── 指数退避重试
    │
    ▼
新内容存入 Layer 1
    │
    ▼
重复内容自动跳过
```

## 与 methodology.md 的对应

| methodology.md 要求 | 实现方案 |
|---------------------|----------|
| Layer 1: Raw Sources | `data/raw-sources/` 目录，Markdown 格式 |
| 首次订阅启动 subagent | `EnhancedHospitalSubscriptionService` 自动触发 |
| 定期更新资料 | `ScheduledTaskService` + node-cron |
| URL + 标题去重 | `DeduplicationChecker` 三层检测 |
| 反爬策略 | 3-8秒延迟、2并发、指数退避、UA轮换 |
| Worker 线程 | `collection.worker.ts` + `worker_threads` |

## 使用示例

### 订阅医院并自动采集

```typescript
// 用户订阅医院
const result = await subscribeHospital({
  name: '北京协和医院',
  isPrimary: true
});

// 系统自动：
// 1. 创建订阅记录
// 2. 启动后台采集任务
// 3. 返回订阅结果（采集在后台进行）
```

### 查询采集状态

```typescript
const status = await getCollectionStatus({});
console.log(status);
// {
//   recentJobs: [...],
//   stats: {
//     totalJobs: 10,
//     activeJobs: 2,
//     completedJobs: 8,
//     totalSources: 156
//   }
// }
```

### 查询原始资料

```typescript
const sources = await queryRawSources({
  hospitalName: '北京协和医院',
  keyword: '心内科',
  limit: 5
});
```

## 注意事项

1. **首次采集时间较长**：10-30分钟，取决于目标网站响应
2. **Worker 线程限制**：Node.js worker_threads 资源限制
3. **存储空间**：所有资料以 Markdown 存储，注意磁盘空间
4. **反爬风险**：即使采用保守策略，仍有可能被封，请合理使用
5. **定时任务时区**：默认使用 Asia/Shanghai 时区

## 后续扩展

1. **Layer 2 实现**：基于采集的资料，使用 LLM 生成 Wiki 实体页面
2. **搜索增强**：接入 Elasticsearch/MiniSearch 实现全文检索
3. **可视化**：添加采集进度实时 WebSocket 推送
4. **分布式**：使用 BullMQ 支持多实例部署
