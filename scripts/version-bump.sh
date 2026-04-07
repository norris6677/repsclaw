#!/bin/bash
#
# 版本号自动更新脚本
# 使用方法:
#   ./scripts/version-bump.sh patch  # 1.0.0 -> 1.0.1
#   ./scripts/version-bump.sh minor  # 1.0.0 -> 1.1.0
#   ./scripts/version-bump.sh major  # 1.0.0 -> 2.0.0
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PACKAGE_JSON="$PROJECT_ROOT/package.json"

# 获取当前版本
CURRENT_VERSION=$(grep -o '"version": "[^"]*"' "$PACKAGE_JSON" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')

if [ -z "$CURRENT_VERSION" ]; then
    echo "Error: Cannot find version in package.json"
    exit 1
fi

# 解析版本号
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# 根据参数更新版本
BUMP_TYPE="${1:-patch}"

case "$BUMP_TYPE" in
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    patch|*)
        PATCH=$((PATCH + 1))
        ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"

# 更新 package.json
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PACKAGE_JSON"
else
    # Linux
    sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PACKAGE_JSON"
fi

# 更新 openclaw.plugin.json (如果存在)
PLUGIN_JSON="$PROJECT_ROOT/openclaw.plugin.json"
if [ -f "$PLUGIN_JSON" ]; then
    if grep -q '"version"' "$PLUGIN_JSON"; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PLUGIN_JSON"
        else
            sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PLUGIN_JSON"
        fi
    fi
fi

# 添加到 git
git add "$PACKAGE_JSON"
if [ -f "$PLUGIN_JSON" ] && git diff --cached --quiet "$PLUGIN_JSON" 2>/dev/null; then
    git add "$PLUGIN_JSON" 2>/dev/null || true
fi

echo "Version bumped: $CURRENT_VERSION -> $NEW_VERSION"
echo "$NEW_VERSION"
