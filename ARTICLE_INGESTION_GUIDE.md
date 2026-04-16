# 文章采集功能使用指南

## 功能概述

文章采集功能允许用户通过飞书等IM工具发送文章链接，系统会自动：

1. **理解用户意图** - 识别保存文章的意图和目标位置
2. **多轮对话支持** - 支持先发送意图后发送链接，或反之
3. **自动目标推断** - 基于用户订阅和上下文推断保存位置
4. **内容抓取** - 将网页内容转换为 Markdown
5. **智能保存** - 保存到对应医院/科室/医生的知识库

## 架构特点

### 纯本地高可用
- **会话管理**：内存存储 + 30秒文件持久化
- **故障恢复**：启动自动恢复活跃会话
- **TTL管理**：5分钟无活动自动清理
- **优雅关闭**：退出前强制持久化

### 飞书接入方式
- **WebSocket长连接**：纯本地运行，无需公网IP/域名
- **自动重连**：断线后5秒自动重连
- **心跳保活**：30秒一次心跳检测

### 三层意图理解
1. **快速规则匹配**：常见模式直接处理，不走LLM
2. **LLM语义理解**：复杂场景调用OpenClaw LLM
3. **个性化决策**：基于用户订阅信息二次确认

## 配置方法（自动读取，无需手动配置）

**零配置设计**：插件会自动从以下位置读取配置（按优先级排序）

### 方式1：OpenClaw settings.json（推荐）

编辑 OpenClaw 的 `settings.json` 文件：

```json
{
  "repsclaw": {
    "articleIngestion": {
      "feishu": {
        "appId": "cli_xxxxxx",
        "appSecret": "xxxxxxxxx",
        "encryptKey": "optional",
        "verificationToken": "optional"
      },
      "session": {
        "ttl": 300000,
        "checkpointInterval": 30000
      },
      "intent": {
        "autoSaveThreshold": 0.8,
        "suggestThreshold": 0.5,
        "llmModel": "claude-sonnet-4-6"
      }
    }
  }
}
```

也支持简化的配置路径：
```json
{
  "repsclaw": {
    "feishu": {
      "appId": "cli_xxxxxx",
      "appSecret": "xxxxxxxxx"
    }
  }
}
```

或全局配置：
```json
{
  "feishu": {
    "appId": "cli_xxxxxx",
    "appSecret": "xxxxxxxxx"
  }
}
```

### 方式2：环境变量

```bash
# 必需
FEISHU_APP_ID=cli_xxxxxx
FEISHU_APP_SECRET=xxxxxxxx

# 可选
FEISHU_ENCRYPT_KEY=          # 消息加密密钥
FEISHU_VERIFICATION_TOKEN=   # 验证Token
ARTICLE_SESSION_TTL=300000   # 会话过期时间(毫秒)
ARTICLE_AUTO_SAVE_THRESHOLD=0.8
```

### 方式3：OpenClaw 环境配置

在 OpenClaw 的环境变量配置界面中添加：
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`

### 配置优先级

1. `repsclaw.articleIngestion.feishu.appId` (settings.json)
2. `FEISHU_APP_ID` (环境变量)
3. `repsclaw.feishu.appId` (settings.json 简化路径)
4. `feishu.appId` (settings.json 全局路径)

**注意**：如果配置不完整，插件会自动禁用，并在日志中提示如何配置。

### 2. 飞书应用设置

1. 登录 [飞书开放平台](https://open.feishu.cn/)
2. 创建企业自建应用
3. 开启机器人能力
4. 订阅事件：
   - `im.message.receive_v1` - 接收消息
5. **事件接收方式选择**：WebSocket（不是Webhook）
6. 发布应用到企业

### 3. 启用功能

插件会自动读取配置，无需手动传入：

```typescript
import { registerArticleIngestion } from './article-ingestion-plugin';

// 在插件 register 函数中 - 配置自动从 settings.json 或环境变量读取
await registerArticleIngestion(openclaw, context);
```

或使用独立的插件类：

```typescript
import { ArticleIngestionPlugin } from './article-ingestion-plugin';

// 在 OpenClaw 插件列表中添加
const plugins = [
  new RepsclawPlugin(),
  new ArticleIngestionPlugin(), // 自动读取配置
];
```

## 用户使用场景

### 场景1：一句话完成
```
用户: 保存这篇文章到北京协和医院 https://example.com/article

机器人: ✅ 文章已保存
       📰 文章标题
       🏥 北京协和医院
```

### 场景2：先意图后链接
```
用户: 存到北京协和
机器人: 好的，保存到北京协和医院。
       ⏳ 请发送文章链接（5分钟内有效）

用户: https://example.com/article
机器人: ✅ 文章已保存...
```

### 场景3：先链接后确认
```
用户: https://example.com/article
机器人: 📄 检测到文章《文章标题》
       🤔 推断您想保存到「北京协和医院」
       回复"是"确认，或告诉我正确的目标

用户: 是
机器人: ✅ 文章已保存...
```

### 场景4：转发消息
```
用户: [转发了一篇微信公众号文章]

机器人: 📄 检测到文章《文章标题》
       🤔 推断您想保存到「北京协和医院 · 心内科」
       回复"是"确认...
```

### 场景5：指代消解
```
用户: 保存这篇文章 https://example.com/1
机器人: ✅ 文章已保存到北京协和医院

用户: 这篇也存到同样的地方 https://example.com/2
机器人: ✅ 文章已保存到北京协和医院

用户: 存到刚才那个科室 https://example.com/3
机器人: ✅ 文章已保存到北京协和医院 · 心内科
```

## OpenClaw 工具列表

### 1. quick_save_article
智能保存文章，自动识别意图和目标。

```typescript
{
  url: "https://example.com/article",
  context?: "用户消息内容",
  userId?: "user_123"
}
```

### 2. analyze_url_content
预分析URL内容，提取标题和实体。

```typescript
{
  url: "https://example.com/article",
  extractEntities: true
}
```

### 3. save_article_to_target
指定目标保存文章。

```typescript
{
  url: "https://example.com/article",
  hospitalName: "北京协和医院",
  departmentName?: "心内科",
  doctorName?: "张主任"
}
```

### 4. get_save_suggestions
获取保存建议。

```typescript
{
  url: "https://example.com/article",
  userId: "user_123"
}
```

### 5. batch_save_articles
批量保存多篇文章。

```typescript
{
  urls: ["url1", "url2", "url3"],
  hospitalName: "北京协和医院"
}
```

## 文件存储结构

```
data/raw-sources/hospitals/
└── {医院名称}/
    ├── contents/
    │   └── 2026-04-12_user-submitted_abc123.md
    └── sources.index.md
```

生成的 Markdown 文件格式：
```markdown
---
id: "abc123def456"
source_type: "user_submitted"
hospital: "北京协和医院"
departments: ["心内科"]
doctors: ["张医生"]
collected_at: "2026-04-12T10:30:00Z"
submitted_by: "user_123"
submitted_via: "feishu"
url: "https://example.com/article"
title: "文章标题"
tags: ["user-submitted", "feishu"]
---

# 文章标题

> 来源：user_submitted
> 提交时间：2026-04-12 10:30:00
> 原始链接：[https://example.com/article](https://example.com/article)

---

## 原始内容

[Markdown 格式的文章内容]
```

## 状态监控

访问 `http://localhost:3000/article-ingestion/status` 查看状态：

```json
{
  "feishuConnected": true,
  "activeSessions": 5,
  "sessionStats": {
    "total": 5,
    "byState": {
      "idle": 3,
      "waiting_target": 1,
      "processing": 1
    }
  }
}
```

## 日志查看

```bash
# 查看文章采集相关日志
grep "REPSCLAW:INGESTION" logs/app.log

# 查看飞书连接日志
grep "REPSCLAW:FEISHU" logs/app.log

# 查看会话管理日志
grep "REPSCLAW:SESSION" logs/app.log
```

## 故障排查

### 配置未生效

查看启动日志：
```bash
grep "REPSCLAW:CONFIG" logs/app.log
```

如果显示 `Configuration incomplete`，说明配置缺失。插件会自动检测并提示：

```
Missing required configuration:
  - feishu.appId (配置路径: repsclaw.articleIngestion.feishu.appId 或环境变量 FEISHU_APP_ID)
  - feishu.appSecret (配置路径: repsclaw.articleIngestion.feishu.appSecret 或环境变量 FEISHU_APP_SECRET)
```

检查配置位置：
1. `~/.claude/settings.json` 或 OpenClaw 配置目录
2. 环境变量 `echo $FEISHU_APP_ID`
3. OpenClaw 环境配置界面

### 飞书连接失败
1. 检查日志中是否正确加载了 `feishuAppId`（会脱敏显示）
2. 确认应用已发布到企业
3. 检查网络是否能访问 `open.feishu.cn`

### 无法保存文章
1. 检查目标医院是否已创建目录
2. 查看 `data/raw-sources/` 目录权限
3. 检查 WebToMarkdown 服务是否正常

### 意图识别不准确
1. 检查用户是否有订阅记录
2. 查看会话历史是否正确累积
3. 确认 OpenClaw LLM 调用是否正常

## 扩展开发

### 添加新的IM平台

1. 创建平台适配器：
```typescript
export class DingtalkAdapter extends EventEmitter {
  // 实现 start/stop/sendMessage 等方法
}
```

2. 在 ArticleIngestionService 中添加支持

### 自定义意图识别规则

编辑 `src/services/article-ingestion/intent-engine.ts`：
```typescript
private fastPathAnalysis(text: string, session: SessionContext) {
  // 添加自定义规则
  if (text.includes('我的专属关键词')) {
    return { confidence: 1.0, ... };
  }
}
```

## 注意事项

1. **会话TTL**：5分钟无活动会话过期，用户需要重新开始对话
2. **并发限制**：默认最多1000个活跃会话
3. **文件句柄**：大量会话会创建持久化文件，注意磁盘空间
4. **LLM调用**：复杂意图会调用LLM，注意Token消耗

## 后续规划

- [ ] 支持钉钉、企业微信
- [ ] 图片OCR识别（用户发送文章截图）
- [ ] 语音消息转文字识别
- [ ] 自动标签生成（基于内容分析）
- [ ] 保存结果通知（飞书卡片消息）
