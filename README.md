# RepsClaw

OpenClaw 插件系统 - 基于 Fastify 的高性能 RAG、合规检查与爬虫服务。

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenClaw Core                           │
│                   (Plugin Loader)                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
    ┌───────────────────┼───────────────────┐
    ▼                   ▼                   ▼
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Plugins  │     │ Services │     │Integrations│
│  /plugins│     │/services │     │/integrations│
└──────────┘     └──────────┘     └──────────┘
    │                   │                   │
    ▼                   ▼                   ▼
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Health   │     │ RAG      │     │ Milvus   │
│ Example  │     │ Compliance│    │ Pinecone │
│ ...      │     │ Crawler  │     │ PubMed   │
│          │     │          │     │ CNKI     │
└──────────┘     └──────────┘     └──────────┘
```

## 目录结构

```
repsclaw/
├── src/
│   ├── core/           # 核心插件加载器
│   │   └── plugin-loader.ts
│   ├── plugins/        # OpenClaw 动态插件
│   │   ├── health.plugin.ts
│   │   └── example.plugin.ts
│   ├── services/       # 业务逻辑服务
│   │   ├── rag.service.ts
│   │   ├── compliance.service.ts
│   │   └── crawler.service.ts
│   ├── integrations/   # 外部集成
│   │   ├── vector/     # 向量数据库适配器
│   │   │   ├── milvus.adapter.ts
│   │   │   └── pinecone.adapter.ts
│   │   └── api/        # 外部 API 客户端
│   │       ├── pubmed.client.ts
│   │       └── cnki.client.ts
│   ├── types/          # TypeScript 类型定义
│   │   ├── plugin.ts
│   │   └── services.ts
│   ├── utils/          # 工具函数
│   │   └── service-registry.ts
│   └── index.ts        # 应用入口
├── .env.example        # 环境变量示例
├── package.json
├── tsconfig.json
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件配置相关参数
```

### 3. 开发模式运行

```bash
npm run dev
```

### 4. 构建与生产运行

```bash
npm run build
npm start
```

## 插件开发指南

所有插件必须实现 `IOpenClawPlugin` 接口，并以 Class 形式导出。

```typescript
import { IOpenClawPlugin, IPluginContext, IPluginMetadata } from '../types';

export default class MyPlugin implements IOpenClawPlugin {
  readonly metadata: IPluginMetadata = {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'My custom plugin',
    dependencies: ['other-plugin'], // 可选
  };

  async register(context: IPluginContext): Promise<void> {
    const { server, logger, services } = context;
    
    // 注册路由
    server.get('/api/my-route', async () => {
      return { message: 'Hello from MyPlugin!' };
    });
    
    // 注册服务
    services.register('myService', { ... });
  }

  async unregister(context: IPluginContext): Promise<void> {
    // 清理工作
  }
}
```

## API 文档

启动服务后访问：`http://localhost:3000/documentation`

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| PORT | 服务端口 | 3000 |
| HOST | 服务主机 | 0.0.0.0 |
| NODE_ENV | 运行环境 | development |
| LOG_LEVEL | 日志级别 | info |
| OPENAI_API_KEY | OpenAI API 密钥 | - |
| PINECONE_API_KEY | Pinecone API 密钥 | - |
| MILVUS_HOST | Milvus 主机地址 | - |
| PUBMED_API_KEY | PubMed API 密钥 | - |
| CNKI_API_KEY | CNKI API 密钥 | - |

## 许可证

MIT
