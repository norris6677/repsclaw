#!/bin/bash
set -e

echo "🔨 Building Repsclaw Plugin..."

# 清理旧构建
rm -rf dist
mkdir -p dist

# 复制配置文件
cp openclaw.plugin.json dist/openclaw.plugin.json

# 生成 dist/index.js - 使用 OpenClaw 兼容的导出格式
cat > dist/index.js << 'EOF'
"use strict";

const plugin = {
  id: "repsclaw",
  name: "Repsclaw Healthcare Plugin",
  description: "Healthcare data integration with FDA, PubMed, Clinical Trials, and Medical Terminology APIs",
  
  register(api) {
    api.logger.info("🩺 Repsclaw plugin initializing...");

    // Register health check endpoint
    api.registerHttpRoute({
      path: "/api/repsclaw/health",
      auth: "gateway",
      handler: (_req, res) => {
        res.statusCode = 200;
        res.end(JSON.stringify({
          status: "ok",
          plugin: "repsclaw",
          timestamp: new Date().toISOString(),
        }));
        return true;
      },
    });

    api.logger.info("✅ Repsclaw plugin registered successfully");
  },
};

// OpenClaw 兼容的导出方式
module.exports = plugin;
EOF

echo "✅ Build complete!"
echo ""
echo "📦 Output files:"
ls -la dist/
