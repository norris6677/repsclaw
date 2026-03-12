# RepsClaw - AI 编码助手指南

## 项目概述

RepsClaw 是一个基于 Fastify 框架的 OpenClaw 插件系统，提供 RAG (检索增强生成)、合规检查和网页爬虫服务。该项目采用 TypeScript 开发，支持动态插件加载机制，允许通过插件扩展系统功能。

### 核心功能

- **RAG 服务**: 向量存储、语义检索和上下文构建
- **合规检查服务**: 内容合规性验证和报告生成
- **爬虫服务**: 递归网页爬取、内容提取和状态管理
- **外部 API 集成**: PubMed、CNKI 等学术文献数据源
- **向量数据库支持**: Milvus、Pinecone

## 技术栈

- **运行时**: Node.js (>=18.0.0)
- **框架**: Fastify 4.x
- **语言**: TypeScript 5.x
- **包管理器**: npm
- **主要依赖**:
  - `@fastify/cors` - 跨域支持
  - `@fastify/helmet` - 安全头
  - `@fastify/swagger` - API 文档
  - `axios` - HTTP 客户端
  - `cheerio` - HTML 解析
  - `zod` - 数据校验
  - `dotenv` - 环境变量

## 项目结构

```
repsclaw/
├── src/
│   ├── core/                    # 核心插件加载器
│   │   ├── index.ts             # 核心模块导出
│   │   └── plugin-loader.ts     # 插件扫描、加载和管理
│   │
│   ├── plugins/                 # OpenClaw 动态插件
│   │   ├── example.plugin.ts    # 示例插件（带依赖演示）
│   │   └── health.plugin.ts     # 健康检查插件
│   │
│   ├── services/                # 业务逻辑服务
│   │   ├── index.ts             # 服务模块导出
│   │   ├── rag.service.ts       # RAG 服务（向量操作）
│   │   ├── compliance.service.ts # 合规检查服务
│   │   └── crawler.service.ts   # 爬虫服务
│   │
│   ├── integrations/            # 外部系统集成
│   │   ├── index.ts             # 集成模块导出
│   │   ├── vector/              # 向量数据库适配器
│   │   │   ├── milvus.adapter.ts
│   │   │   └── pinecone.adapter.ts
│   │   └── api/                 # 外部 API 客户端
│   │       ├── pubmed.client.ts
│   │       └── cnki.client.ts
│   │
│   ├── types/                   # TypeScript 类型定义
│   │   ├── index.ts             # 类型模块导出
│   │   ├── plugin.ts            # 插件相关接口
│   │   └── services.ts          # 服务相关类型
│   │
│   ├── utils/                   # 工具函数
│   │   └── service-registry.ts  # 服务注册表实现
│   │
│   └── index.ts                 # 应用入口
│
├── .env.example                 # 环境变量示例
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## 构建和运行命令

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 编译 TypeScript
npm run build

# 生产环境运行
npm start

# 代码检查
npm run lint

# 清理构建输出
npm run clean
```

## 插件开发规范

### 插件接口要求

所有插件必须实现 `IOpenClawPlugin` 接口，以 Class 形式导出：

```typescript
import { IOpenClawPlugin, IPluginContext, IPluginMetadata } from '../types';

export default class MyPlugin implements IOpenClawPlugin {
  readonly metadata: IPluginMetadata = {
    name: 'my-plugin',           // 唯一标识，必需
    version: '1.0.0',            // 版本号，必需
    description: '描述',          // 可选
    author: '作者',               // 可选
    dependencies: ['other-plugin'], // 依赖的其他插件，可选
  };

  // 必需：注册插件
  async register(context: IPluginContext): Promise<void> {
    const { server, logger, services, config } = context;
    
    // 注册路由
    server.get('/api/my-route', async () => {
      return { message: 'Hello!' };
    });
    
    // 注册服务供其他插件使用
    services.register('myService', { ... });
  }

  // 可选：卸载插件（清理资源）
  async unregister(context: IPluginContext): Promise<void> {
    // 清理工作
  }
}
```

### 插件加载规则

1. 插件文件必须放在 `src/plugins/` 目录下（或通过 `OPENCLAW_PLUGIN_PATH` 指定）
2. 插件文件扩展名必须是 `.ts` 或 `.js`
3. 插件类可以通过默认导出 (`export default`) 或命名导出
4. 插件类必须有 `register` 方法
5. 依赖的插件会自动按依赖顺序加载

## 服务使用指南

### 访问服务

通过插件上下文的服务注册表访问核心服务：

```typescript
const ragService = context.services.get<RAGService>('rag');
const complianceService = context.services.get<ComplianceService>('compliance');
const crawlerService = context.services.get<CrawlerService>('crawler');
```

### RAG 服务

```typescript
// 索引文档
await ragService.indexDocument({
  id: 'doc-1',
  content: '文档内容',
  metadata: { source: 'web' }
});

// 查询
const result = await ragService.query({
  query: '查询问题',
  topK: 5,
  minScore: 0.7
});
```

### 合规检查服务

```typescript
// 注册自定义规则
complianceService.registerRule(myRule);

// 执行检查
const report = await complianceService.checkCompliance('doc-1', content);
```

### 爬虫服务

```typescript
// 启动爬取任务
const result = await crawlerService.crawl({
  url: 'https://example.com',
  depth: 2,
  maxPages: 50,
  delay: 1000
});

// 监听事件
crawlerService.on('page:crawled', ({ url, page }) => {
  console.log(`已爬取: ${url}`);
});
```

## 环境变量配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | 3000 |
| `HOST` | 服务主机 | 0.0.0.0 |
| `NODE_ENV` | 运行环境 | development |
| `LOG_LEVEL` | 日志级别 | info |
| `OPENCLAW_PLUGIN_PATH` | 插件目录路径 | ./plugins |
| `OPENAI_API_KEY` | OpenAI API 密钥 | - |
| `PINECONE_API_KEY` | Pinecone API 密钥 | - |
| `PINECONE_INDEX_NAME` | Pinecone 索引名 | documents |
| `MILVUS_HOST` | Milvus 主机地址 | - |
| `MILVUS_PORT` | Milvus 端口 | 19530 |
| `PUBMED_API_KEY` | PubMed API 密钥 | - |
| `CNKI_API_KEY` | CNKI API 密钥 | - |

## 代码风格规范

1. **语言**: 中文注释，英文代码
2. **缩进**: 2 个空格
3. **引号**: 单引号
4. **分号**: 必需
5. **类型**: 严格 TypeScript，启用 `strict: true`
6. **路径别名**:
   - `@/*` → `src/*`
   - `@plugins/*` → `src/plugins/*`
   - `@services/*` → `src/services/*`
   - `@integrations/*` → `src/integrations/*`
   - `@types/*` → `src/types/*`

## 类型定义规范

类型定义放在 `src/types/` 目录：

- `plugin.ts` - 插件相关接口 (`IOpenClawPlugin`, `IPluginContext`, `IPluginMetadata`)
- `services.ts` - 服务相关类型 (RAG、Compliance、Crawler)

新加类型应遵循现有命名规范：接口以 `I` 开头，类型使用 PascalCase。

## 错误处理

- 使用 Fastify 的日志记录器 (`server.log`) 记录错误
- 插件加载失败不会中断系统，会记录错误并跳过
- 服务初始化依赖环境变量，缺失时优雅降级

## 注意事项

1. **向量数据库适配器**: 当前为骨架实现，需根据实际 SDK 补全
2. **嵌入模型**: `RAGService.generateEmbedding` 目前返回模拟数据，需接入实际模型
3. **CNKI 客户端**: 需要商务合作获取官方 API，当前为框架实现
4. **Swagger 文档**: 启动后访问 `http://localhost:3000/documentation`

## 扩展开发

### 添加新的向量数据库支持

1. 在 `src/integrations/vector/` 创建适配器
2. 实现 `IVectorStore` 接口
3. 在 `src/integrations/index.ts` 导出
4. 在 `src/index.ts` 中添加初始化逻辑

### 添加新的外部 API 客户端

1. 在 `src/integrations/api/` 创建客户端
2. 定义配置类型继承 `IExternalAPIConfig`
3. 在 `src/index.ts` 中根据环境变量初始化

### 添加新插件

1. 在 `src/plugins/` 创建插件文件
2. 实现 `IOpenClawPlugin` 接口
3. 导出插件类（默认导出或命名导出）
4. 重启服务自动加载
