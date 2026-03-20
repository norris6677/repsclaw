#!/bin/bash
set -e

echo "🔨 Building Repsclaw Plugin..."

# 清理旧构建
rm -rf dist
mkdir -p dist

# 用 esbuild 转译 src/ → dist/（不 bundle，保留模块结构）
echo "📦 Transpiling TypeScript with esbuild..."
npx esbuild \
  $(find src -name "*.ts" | grep -v "\.test\.ts" | grep -v "\.spec\.ts") \
  --outdir=dist \
  --platform=node \
  --format=cjs \
  --target=node18 \
  --sourcemap

# 复制运行时所需的非 TS 文件
echo "📋 Copying config files..."
cp openclaw.plugin.json dist/openclaw.plugin.json

echo "✅ Build complete!"
echo ""
echo "📦 Output files (dist/):"
find dist -name "*.js" | head -20
