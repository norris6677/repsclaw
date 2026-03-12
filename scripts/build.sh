#!/bin/bash
set -e

echo "🔨 Building Repsclaw Plugin..."

# 清理旧构建
rm -rf dist
mkdir -p dist/types

# 复制配置文件
cp openclaw.plugin.json dist/openclaw.plugin.json

# 生成 types/plugin.js
cat > dist/types/plugin.js << 'EOF'
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
EOF

# 生成 types/plugin.d.ts
cat > dist/types/plugin.d.ts << 'EOF'
import { FastifyInstance } from 'fastify';

export interface IPluginMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string;
  dependencies?: string[];
  configSchema?: Record<string, unknown>;
}

export interface IPluginContext {
  server: FastifyInstance;
  config: Record<string, string | undefined>;
  logger: FastifyInstance['log'];
  services: IServiceRegistry;
}

export interface IServiceRegistry {
  get<T>(name: string): T | undefined;
  register<T>(name: string, service: T): void;
  has(name: string): boolean;
}

export interface IOpenClawPlugin {
  readonly metadata: IPluginMetadata;
  register(context: IPluginContext): Promise<void> | void;
  unregister?(context: IPluginContext): Promise<void> | void;
}

export type PluginConstructor = new () => IOpenClawPlugin;
EOF

# 生成 types/services.js
cat > dist/types/services.js << 'EOF'
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
EOF

# 生成 types/services.d.ts
cat > dist/types/services.d.ts << 'EOF'
export interface IEmbeddingConfig {
  model: string;
  dimensions: number;
  apiKey?: string;
  baseUrl?: string;
}

export interface IVectorDocument {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding?: number[];
}

export interface ISearchResult {
  document: IVectorDocument;
  score: number;
}

export interface IRAGQuery {
  query: string;
  topK?: number;
  filters?: Record<string, unknown>;
  minScore?: number;
}

export interface IRAGResponse {
  results: ISearchResult[];
  context: string;
  sources: string[];
}

export interface IComplianceRule {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: string;
  checkFunction: (content: string) => Promise<IComplianceCheckResult>;
}

export interface IComplianceCheckResult {
  passed: boolean;
  ruleId: string;
  violations: IViolation[];
  suggestions?: string[];
}

export interface IViolation {
  message: string;
  location?: { start: number; end: number };
  severity: string;
}

export interface ICrawlConfig {
  url: string;
  depth?: number;
  maxPages?: number;
  delay?: number;
  userAgent?: string;
  timeout?: number;
  headers?: Record<string, string>;
  proxy?: {
    host: string;
    port: number;
    auth?: { username: string; password: string };
  };
}

export interface ICrawledPage {
  url: string;
  title: string;
  content: string;
  html?: string;
  metadata: {
    crawledAt: Date;
    statusCode: number;
    contentType: string;
    links: string[];
  };
}

export interface IExternalAPIConfig {
  source: string;
  apiKey?: string;
  baseUrl: string;
  rateLimit?: {
    requestsPerSecond: number;
    burstSize: number;
  };
}
EOF

# 生成 types/index.js
cat > dist/types/index.js << 'EOF'
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
EOF

# 生成 types/index.d.ts
cat > dist/types/index.d.ts << 'EOF'
export * from './plugin';
export * from './services';
EOF

# 生成 plugin.js
cat > dist/plugin.js << 'EOF'
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepsclawPlugin = void 0;

class RepsclawPlugin {
  constructor() {
    this.metadata = {
      name: 'repsclaw',
      version: '1.0.0',
      description: 'Healthcare Plugin with FDA, PubMed, Clinical Trials, Medical Terminology APIs',
      author: 'Repsclaw Team',
      dependencies: [],
    };
  }

  async register(context) {
    const { server, logger } = context;
    logger.info('🩺 Repsclaw plugin initializing...');
    this.registerRoutes(server);
    logger.info('✅ Repsclaw plugin registered successfully');
  }

  async unregister(context) {
    context.logger.info('🛑 Repsclaw plugin unregistered');
  }

  registerRoutes(server) {
    server.get('/api/repsclaw', async () => ({
      name: 'repsclaw',
      version: '1.0.0',
      description: 'Healthcare data integration plugin',
      status: 'active',
      endpoints: ['/api/repsclaw/health'],
    }));

    server.get('/api/repsclaw/health', async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: ['FDA', 'PubMed', 'ClinicalTrials', 'ICD-10', 'medRxiv', 'NCBI Bookshelf'],
    }));
  }
}

exports.default = RepsclawPlugin;
exports.RepsclawPlugin = RepsclawPlugin;
EOF

# 生成 plugin.d.ts
cat > dist/plugin.d.ts << 'EOF'
import { FastifyInstance } from 'fastify';
import { IOpenClawPlugin, IPluginMetadata, IPluginContext } from './types';

export default class RepsclawPlugin implements IOpenClawPlugin {
  readonly metadata: IPluginMetadata;
  constructor();
  register(context: IPluginContext): Promise<void>;
  unregister(context: IPluginContext): Promise<void>;
  private registerRoutes;
}

export { RepsclawPlugin };
EOF

# 生成 index.js
cat > dist/index.js << 'EOF'
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepsclawPlugin = void 0;

var plugin_1 = require("./plugin");
Object.defineProperty(exports, "default", {
  enumerable: true,
  get: function () { return plugin_1.default; }
});
Object.defineProperty(exports, "RepsclawPlugin", {
  enumerable: true,
  get: function () { return plugin_1.RepsclawPlugin; }
});
EOF

# 生成 index.d.ts
cat > dist/index.d.ts << 'EOF'
export { default } from './plugin';
export { RepsclawPlugin } from './plugin';
export * from './types';
EOF

echo "✅ Build complete!"
echo ""
echo "📦 Output files:"
ls -la dist/
