#!/bin/bash
# Repsclaw 部署脚本 - 同步到 OpenClaw 插件目录

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 开始部署 Repsclaw 插件...${NC}"

# 定义目录
DEV_DIR="/home/tony203/repsclaw"
PLUGIN_DIR="$HOME/.openclaw/extensions/repsclaw"

# 检查开发目录
if [ ! -d "$DEV_DIR" ]; then
    echo -e "${RED}❌ 开发目录不存在: $DEV_DIR${NC}"
    exit 1
fi

# 确保插件目录存在
mkdir -p "$PLUGIN_DIR"

echo -e "${BLUE}📂 开发目录: $DEV_DIR${NC}"
echo -e "${BLUE}📂 插件目录: $PLUGIN_DIR${NC}"

# 需要同步的文件和目录
SYNC_ITEMS=(
    "index.ts"
    "package.json"
    "tsconfig.json"
    "openclaw.plugin.json"
    "src"
)

echo -e "${YELLOW}🔄 同步文件...${NC}"

# 同步文件
for item in "${SYNC_ITEMS[@]}"; do
    src="$DEV_DIR/$item"
    dst="$PLUGIN_DIR/$item"

    if [ -e "$src" ]; then
        # 删除旧文件/目录
        if [ -e "$dst" ]; then
            rm -rf "$dst"
        fi

        # 复制新文件/目录
        cp -r "$src" "$dst"
        echo -e "  ${GREEN}✓${NC} $item"
    else
        echo -e "  ${RED}✗${NC} $item (不存在)"
    fi
done

# 同步测试目录（可选）
if [ -d "$DEV_DIR/tests" ]; then
    cp -r "$DEV_DIR/tests" "$PLUGIN_DIR/"
    echo -e "  ${GREEN}✓${NC} tests"
fi

# 安装依赖
echo -e "${YELLOW}📦 安装依赖...${NC}"
cd "$PLUGIN_DIR"
npm install --silent 2>&1 | grep -v "npm WARN" || true

echo -e "${GREEN}✅ 依赖安装完成${NC}"

# 验证部署
echo -e "${YELLOW}🔍 验证部署...${NC}"

if [ -f "$PLUGIN_DIR/index.ts" ] && [ -d "$PLUGIN_DIR/src" ]; then
    echo -e "${GREEN}✅ 部署成功！${NC}"
    echo ""
    echo -e "${BLUE}📋 部署信息:${NC}"
    echo "  插件目录: $PLUGIN_DIR"
    echo "  主文件: $PLUGIN_DIR/index.ts"
    echo ""
    echo -e "${YELLOW}⚠️  请重启 OpenClaw 以加载更新后的插件${NC}"
    echo ""
    echo -e "${BLUE}🧪 测试命令:${NC}"
    echo "  cd $PLUGIN_DIR"
    echo "  npm run test:hospital:all"
else
    echo -e "${RED}❌ 部署验证失败${NC}"
    exit 1
fi

# 显示文件数量
FILE_COUNT=$(find "$PLUGIN_DIR" -type f | wc -l)
echo -e "${BLUE}📊 已部署 $FILE_COUNT 个文件${NC}"
