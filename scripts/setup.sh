#!/bin/bash
#
# OpenClaw Plugin Setup Script
# 自动将 Repsclaw 插件复制安装到 OpenClaw
#

set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 打印函数
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_title() {
  echo ""
  echo -e "${CYAN}╔════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC} ${BLUE}         OpenClaw Plugin Setup (Repsclaw)            ${NC} ${CYAN}║${NC}"
  echo -e "${CYAN}╚════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

# 获取项目目录
get_project_dir() {
  cd "$(dirname "$0")/.." && pwd
}

# 检测操作系统
detect_os() {
  case "$(uname -s)" in
    Linux*)     echo "linux";;
    Darwin*)    echo "macos";;
    CYGWIN*|MINGW*|MSYS*) echo "windows";;
    *)          echo "unknown";;
  esac
}

# 检测 OpenClaw 目录
detect_openclaw() {
  local project_dir="$1"
  local parent_dir
  parent_dir="$(dirname "$project_dir")"
  
  # 1. 检查环境变量
  if [ -n "$OPENCLAW_HOME" ] && [ -d "$OPENCLAW_HOME/.openclaw" ]; then
    echo "$OPENCLAW_HOME"
    return 0
  fi
  
  # 2. 检查上一级目录
  if [ -d "$parent_dir/.openclaw" ]; then
    echo "$parent_dir"
    return 0
  fi
  
  # 3. 检查常见路径
  local common_paths=(
    "$HOME/.openclaw"
    "$HOME/openclaw"
    "$HOME/.local/share/openclaw"
    "/usr/local/share/openclaw"
    "/opt/openclaw"
  )
  
  for path in "${common_paths[@]}"; do
    if [ -d "$path" ] || [ -d "$path/.openclaw" ]; then
      if [ -d "$path/.openclaw" ]; then
        echo "$path"
      else
        echo "$(dirname "$path")"
      fi
      return 0
    fi
  done
  
  return 1
}

# 复制插件文件
copy_plugin() {
  local source_dir="$1"
  local target_dir="$2"
  
  print_info "复制插件文件..."
  print_info "  源: $source_dir"
  print_info "  目标: $target_dir"
  
  # 创建目标目录
  mkdir -p "$target_dir"
  
  # 复制文件（排除 node_modules 和 dist）
  rsync -av --exclude='node_modules' --exclude='.git' --exclude='tests' \
    "$source_dir/" "$target_dir/" 2>/dev/null || \
  cp -r "$source_dir"/* "$target_dir/" 2>/dev/null || {
    print_error "复制文件失败"
    return 1
  }
  
  # 设置权限（重要：不能是 world-writable）
  chmod 700 "$target_dir"
  
  print_success "插件文件复制完成"
  return 0
}

# 验证插件结构
verify_plugin() {
  local plugin_dir="$1"
  local has_error=0
  
  print_info "验证插件结构..."
  
  # 检查必要文件
  if [ ! -f "$plugin_dir/package.json" ]; then
    print_error "缺少 package.json"
    has_error=1
  fi
  
  if [ ! -f "$plugin_dir/openclaw.plugin.json" ]; then
    print_error "缺少 openclaw.plugin.json"
    has_error=1
  fi
  
  if [ ! -f "$plugin_dir/index.ts" ] && [ ! -f "$plugin_dir/index.js" ]; then
    print_error "缺少入口文件 (index.ts 或 index.js)"
    has_error=1
  fi
  
  # 检查权限
  local perms
  perms=$(stat -c "%a" "$plugin_dir" 2>/dev/null || stat -f "%Lp" "$plugin_dir" 2>/dev/null)
  if [ "$perms" = "777" ] || [ "$perms" = "755" ]; then
    print_warning "目录权限过于开放，修复中..."
    chmod 700 "$plugin_dir"
  fi
  
  if [ $has_error -eq 0 ]; then
    print_success "插件结构验证通过"
    return 0
  else
    return 1
  fi
}

# 构建插件
build_plugin() {
  local project_dir="$1"
  
  print_info "构建插件..."
  
  cd "$project_dir"
  
  if [ -f "scripts/build.sh" ]; then
    bash scripts/build.sh
  elif [ -f "package.json" ]; then
    npm run build 2>/dev/null || {
      print_warning "构建命令失败，但继续安装..."
    }
  fi
  
  # 检查 dist 目录
  if [ -d "$project_dir/dist" ] && [ -f "$project_dir/dist/plugin.js" ]; then
    print_success "构建输出存在"
  fi
  
  return 0
}

# 更新 OpenClaw 配置
update_config() {
  local openclaw_dir="$1"
  local plugin_dir="$2"
  local plugin_id="repsclaw"
  
  print_info "更新 OpenClaw 配置..."
  
  local config_file="$openclaw_dir/.openclaw/openclaw.json"
  
  if [ ! -f "$config_file" ]; then
    print_error "找不到 openclaw.json: $config_file"
    return 1
  fi
  
  # 使用 Python 更新配置
  python3 << EOF
import json
import sys

config_file = "$config_file"
plugin_id = "$plugin_id"
plugin_dir = "$plugin_dir"

try:
    with open(config_file, 'r') as f:
        data = json.load(f)
    
    if 'plugins' not in data:
        data['plugins'] = {}
    
    plugins = data['plugins']
    
    # 添加 entries
    if 'entries' not in plugins:
        plugins['entries'] = {}
    plugins['entries'][plugin_id] = {'enabled': True}
    
    # 添加 installs
    if 'installs' not in plugins:
        plugins['installs'] = {}
    plugins['installs'][plugin_id] = {
        'source': 'path',
        'spec': plugin_dir,
        'installPath': plugin_dir,
        'version': '1.0.0',
        'installedAt': '2026-03-12T23:20:00.000Z'
    }
    
    with open(config_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    print('配置更新成功')
except Exception as e:
    print(f'配置更新失败: {e}', file=sys.stderr)
    sys.exit(1)
EOF
  
  if [ $? -eq 0 ]; then
    print_success "配置更新完成"
    return 0
  else
    return 1
  fi
}

# 主函数
main() {
  print_title
  
  local project_dir
  project_dir=$(get_project_dir)
  
  print_info "项目目录: $project_dir"
  print_info "操作系统: $(detect_os)"
  
  # 检查是否需要跳过
  if [ "$SKIP_OPENCLAW_SETUP" = "true" ]; then
    print_warning "SKIP_OPENCLAW_SETUP=true，跳过安装"
    exit 0
  fi
  
  # 验证并构建插件
  verify_plugin "$project_dir"
  build_plugin "$project_dir"
  
  # 检测 OpenClaw
  local openclaw_dir
  if ! openclaw_dir=$(detect_openclaw "$project_dir"); then
    print_error "未找到 OpenClaw 安装"
    print_info "请设置 OPENCLAW_HOME 环境变量后重试"
    exit 1
  fi
  
  print_success "找到 OpenClaw: $openclaw_dir"
  
  # 创建扩展目录
  local extensions_dir="$openclaw_dir/.openclaw/extensions"
  mkdir -p "$extensions_dir"
  
  # 复制插件
  local plugin_name
  plugin_name=$(basename "$project_dir")
  local target_dir="$extensions_dir/$plugin_name"
  
  # 如果已存在，先删除
  if [ -e "$target_dir" ]; then
    print_warning "插件已存在，更新中..."
    rm -rf "$target_dir"
  fi
  
  if ! copy_plugin "$project_dir" "$target_dir"; then
    exit 1
  fi
  
  # 再次验证
  if ! verify_plugin "$target_dir"; then
    exit 1
  fi
  
  # 更新配置
  if ! update_config "$openclaw_dir" "$target_dir"; then
    exit 1
  fi
  
  # 显示成功信息
  echo ""
  echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  ✨ 插件安装成功！${NC}"
  echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
  echo ""
  print_info "插件名称: ${CYAN}$plugin_name${NC}"
  print_info "安装位置: ${CYAN}$target_dir${NC}"
  echo ""
  print_warning "重启 OpenClaw 后插件将自动加载"
  print_info "命令: openclaw gateway restart"
  echo ""
}

# 运行主函数
main "$@"
