#!/bin/bash
# Repsclaw 部署脚本 - 支持本地和远程部署模式

set -e

# ========== 颜色输出 ==========
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ========== 加载 .env 配置 ==========
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
    echo -e "${BLUE}📋 已加载 .env 配置${NC}" >&2
fi

# ========== 配置默认值 ==========
DEPLOY_MODE="${DEPLOY_MODE:-local}"
DEV_DIR="${DEV_DIR:-$SCRIPT_DIR}"

# 本地部署默认路径
LOCAL_PLUGIN_DIR="${LOCAL_PLUGIN_DIR:-$HOME/.openclaw/extensions/repsclaw}"

# 远程部署配置
DEPLOY_TARGET_IP="${DEPLOY_TARGET_IP:-}"
DEPLOY_SSH_USER="${DEPLOY_SSH_USER:-}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-}"
DEPLOY_SSH_PASSWORD="${DEPLOY_SSH_PASSWORD:-}"
# 远程插件目录（发现后会保存到 .env）
REMOTE_PLUGIN_DIR="${REMOTE_PLUGIN_DIR:-}"

# ========== 需要同步的文件和目录 ==========
SYNC_ITEMS=(
    "index.ts"
    "package.json"
    "tsconfig.json"
    "openclaw.plugin.json"
    "src"
    "scripts"
    "dist"
)

# ========== 工具函数 ==========
log_info() {
    echo -e "${BLUE}$1${NC}" >&2
}

log_success() {
    echo -e "${GREEN}$1${NC}" >&2
}

log_warn() {
    echo -e "${YELLOW}$1${NC}" >&2
}

log_error() {
    echo -e "${RED}$1${NC}" >&2
}

# 保存配置到 .env
save_env_var() {
    local key="$1"
    local value="$2"

    if [ -f "$ENV_FILE" ]; then
        # 检查变量是否已存在
        if grep -q "^${key}=" "$ENV_FILE"; then
            # 更新现有变量
            sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
        else
            # 添加新变量
            echo "" >> "$ENV_FILE"
            echo "# Remote plugin directory (auto-discovered)" >> "$ENV_FILE"
            echo "${key}=${value}" >> "$ENV_FILE"
        fi
    else
        log_warn "⚠️  .env 文件不存在，无法保存配置"
    fi
}

# ========== OpenClaw 配置更新 ==========
# 检查是否需要更新 openclaw.json
need_update_openclaw_config() {
    local config_path="$1"
    local plugin_dir="$2"

    # 如果配置文件不存在，需要创建
    if [ ! -f "$config_path" ]; then
        return 0
    fi

    # 检查配置内容是否正确
    local current_spec=$(cat "$config_path" 2>/dev/null | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('plugins', {}).get('installs', {}).get('repsclaw', {}).get('spec', ''))" 2>/dev/null || echo "")

    # 如果 spec 路径与目标目录一致，且 entries 中启用了插件，则不需要更新
    local current_enabled=$(cat "$config_path" 2>/dev/null | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('plugins', {}).get('entries', {}).get('repsclaw', {}).get('enabled', False))" 2>/dev/null || echo "false")

    if [ "$current_spec" = "$plugin_dir" ] && [ "$current_enabled" = "True" ]; then
        return 1  # 不需要更新
    fi

    return 0  # 需要更新
}

# 生成本地更新 openclaw.json 的命令
get_update_openclaw_config_cmd() {
    local config_path="$1"
    local plugin_dir="$2"

    cat << 'PYTHON_SCRIPT'
import json
import os
import sys
from datetime import datetime

config_path = sys.argv[1]
plugin_dir = sys.argv[2]

# 读取或创建配置
if os.path.exists(config_path):
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
    except:
        config = {}
else:
    config = {}

# 确保 plugins 结构存在
if 'plugins' not in config:
    config['plugins'] = {'entries': {}, 'installs': {}}
if 'entries' not in config['plugins']:
    config['plugins']['entries'] = {}
if 'installs' not in config['plugins']:
    config['plugins']['installs'] = {}

# 更新 entries
config['plugins']['entries']['repsclaw'] = {'enabled': True}

# 更新 installs
config['plugins']['installs']['repsclaw'] = {
    'source': 'path',
    'spec': plugin_dir,
    'installPath': plugin_dir,
    'version': '1.0.0',
    'installedAt': datetime.now().isoformat()
}

# 写入配置
os.makedirs(os.path.dirname(config_path), exist_ok=True)
with open(config_path, 'w') as f:
    json.dump(config, f, indent=2)

print(f'✓ OpenClaw 配置已更新: {config_path}')
PYTHON_SCRIPT
}

# 更新本地 openclaw.json 配置
update_local_openclaw_config() {
    local plugin_dir="$1"
    local config_path="${HOME}/.openclaw/openclaw.json"

    log_info "🔧 检查 OpenClaw 配置..."

    # 检查是否需要更新
    if ! need_update_openclaw_config "$config_path" "$plugin_dir"; then
        log_info "  ✓ OpenClaw 配置已是最新，跳过更新"
        return 0
    fi

    # 使用 Python 更新配置
    local python_cmd=$(get_update_openclaw_config_cmd)
    if command -v python3 &> /dev/null; then
        python3 -c "$python_cmd" "$config_path" "$plugin_dir"
        log_success "✅ OpenClaw 配置更新完成"
    else
        log_warn "⚠️  未找到 python3，无法自动更新 openclaw.json"
        log_info "   请手动运行以下命令更新配置："
        echo "   node -e \"const fs=require('fs'),path=require('path');const c=JSON.parse(fs.readFileSync('$config_path','utf8'));c.plugins=c.plugins||{entries:{},installs:{}};c.plugins.entries.repsclaw={enabled:true};c.plugins.installs.repsclaw={source:'path',spec:'$plugin_dir',installPath:'$plugin_dir',version:'1.0.0',installedAt:new Date().toISOString()};fs.writeFileSync('$config_path',JSON.stringify(c,null,2));\""
    fi
}

# 更新远程 openclaw.json 配置
update_remote_openclaw_config() {
    local remote_dir="$1"
    local remote_home=$(remote_exec "echo ~" 2>/dev/null || echo "~")
    local config_path="${remote_home}/.openclaw/openclaw.json"

    log_info "🔧 检查远程 OpenClaw 配置..."

    # 首先检查远程配置文件是否存在
    if ! remote_exec "test -f $config_path" 2>/dev/null; then
        log_info "  远程 openclaw.json 不存在，将创建新配置"
    else
        # 检查当前配置是否正确
        local current_spec=$(remote_exec "cat $config_path 2>/dev/null | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d.get('plugins',{}).get('installs',{}).get('repsclaw',{}).get('spec',''))\" 2>/dev/null || echo ''" 2>/dev/null || echo "")
        local current_enabled=$(remote_exec "cat $config_path 2>/dev/null | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d.get('plugins',{}).get('entries',{}).get('repsclaw',{}).get('enabled',False))\" 2>/dev/null || echo 'false'" 2>/dev/null || echo "false")

        if [ "$current_spec" = "$remote_dir" ] && [ "$current_enabled" = "True" ]; then
            log_info "  ✓ 远程 OpenClaw 配置已是最新，跳过更新"
            return 0
        fi
    fi

    # 使用远程 Python 更新配置
    if remote_exec "command -v python3" &> /dev/null; then
        local python_script='
import json
import os
import sys
from datetime import datetime

config_path = sys.argv[1]
plugin_dir = sys.argv[2]

# 读取或创建配置
if os.path.exists(config_path):
    try:
        with open(config_path, "r") as f:
            config = json.load(f)
    except:
        config = {}
else:
    config = {}

# 确保 plugins 结构存在
if "plugins" not in config:
    config["plugins"] = {"entries": {}, "installs": {}}
if "entries" not in config["plugins"]:
    config["plugins"]["entries"] = {}
if "installs" not in config["plugins"]:
    config["plugins"]["installs"] = {}

# 更新 entries
config["plugins"]["entries"]["repsclaw"] = {"enabled": True}

# 更新 installs
config["plugins"]["installs"]["repsclaw"] = {
    "source": "path",
    "spec": plugin_dir,
    "installPath": plugin_dir,
    "version": "1.0.0",
    "installedAt": datetime.now().isoformat()
}

# 写入配置
os.makedirs(os.path.dirname(config_path), exist_ok=True)
with open(config_path, "w") as f:
    json.dump(config, f, indent=2)

print(f"✓ 远程 OpenClaw 配置已更新: {config_path}")
'
        remote_exec "python3 -c '$python_script' '$config_path' '$remote_dir'"
        log_success "✅ 远程 OpenClaw 配置更新完成"
    else
        log_warn "⚠️  远程服务器未找到 python3，无法自动更新 openclaw.json"
        log_info "   请手动在远程服务器上运行 DEPLOYMENT.md 中的配置更新命令"
    fi
}

# 检查命令是否存在
check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "❌ 缺少必要命令: $1"
        return 1
    fi
    return 0
}

# ========== SSH 相关函数 ==========
# 构建 SSH 选项
build_ssh_opts() {
    local opts="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
    if [ -n "$DEPLOY_SSH_KEY" ] && [ -f "$DEPLOY_SSH_KEY" ]; then
        opts="$opts -i $DEPLOY_SSH_KEY"
    fi
    echo "$opts"
}

# 构建 SSH 目标
build_ssh_target() {
    if [ -n "$DEPLOY_SSH_USER" ]; then
        echo "$DEPLOY_SSH_USER@$DEPLOY_TARGET_IP"
    else
        echo "$DEPLOY_TARGET_IP"
    fi
}

# 执行远程 SSH 命令
remote_exec() {
    local cmd="$1"
    local ssh_opts=$(build_ssh_opts)
    local target=$(build_ssh_target)

    if [ -n "$DEPLOY_SSH_PASSWORD" ]; then
        # 使用 sshpass 支持密码认证
        if command -v sshpass &> /dev/null; then
            sshpass -p "$DEPLOY_SSH_PASSWORD" ssh $ssh_opts "$target" "$cmd"
        else
            log_error "❌ 需要安装 sshpass 以支持密码认证: brew install sshpass 或 apt-get install sshpass"
            exit 1
        fi
    else
        ssh $ssh_opts "$target" "$cmd"
    fi
}

# 执行远程 SCP
remote_copy() {
    local src="$1"
    local dst="$2"
    local ssh_opts=$(build_ssh_opts)
    local target=$(build_ssh_target)

    if [ -n "$DEPLOY_SSH_PASSWORD" ]; then
        if command -v sshpass &> /dev/null; then
            sshpass -p "$DEPLOY_SSH_PASSWORD" scp $ssh_opts -r "$src" "$target:$dst"
        else
            log_error "❌ 需要安装 sshpass 以支持密码认证"
            exit 1
        fi
    else
        scp $ssh_opts -r "$src" "$target:$dst"
    fi
}

# 使用 rsync 同步（如果可用）
remote_rsync() {
    local src="$1"
    local dst="$2"

    # 检查本地 rsync
    if ! command -v rsync &> /dev/null; then
        log_warn "⚠️  本地 rsync 不可用，使用 scp 替代"
        remote_copy "$src" "$dst"
        return
    fi

    # 检查远程 rsync
    if ! remote_exec "command -v rsync" &> /dev/null; then
        log_warn "⚠️  远程服务器没有 rsync，使用 scp 替代"
        remote_copy "$src" "$dst"
        return
    fi

    local ssh_opts=$(build_ssh_opts)
    local target=$(build_ssh_target)
    local rsync_ssh="ssh"

    if [ -n "$DEPLOY_SSH_KEY" ] && [ -f "$DEPLOY_SSH_KEY" ]; then
        rsync_ssh="ssh -i $DEPLOY_SSH_KEY -o StrictHostKeyChecking=no"
    fi

    if [ -n "$DEPLOY_SSH_PASSWORD" ]; then
        if command -v sshpass &> /dev/null; then
            rsync_ssh="sshpass -p '$DEPLOY_SSH_PASSWORD' ssh -o StrictHostKeyChecking=no"
        else
            log_warn "⚠️  密码认证时 rsync 需要 sshpass，使用 scp 替代"
            remote_copy "$src" "$dst"
            return
        fi
    fi

    log_info "🔄 使用 rsync 同步文件..."
    rsync -avz --delete -e "$rsync_ssh" "$src" "$target:$dst"
}

# ========== 远程目录发现 ==========
discover_remote_plugin_dir() {
    log_info "🔍 发现远程插件目录..."

    local target=$(build_ssh_target)

    # 常见路径列表
    local common_paths=(
        "~/.openclaw/extensions/repsclaw"
        "~/.openclaw/extensions/"
        "~/.config/openclaw/extensions/repsclaw"
        "~/openclaw/extensions/repsclaw"
        "/opt/openclaw/extensions/repsclaw"
    )

    # 首先检查常见路径
    for path in "${common_paths[@]}"; do
        if remote_exec "test -d $path" 2>/dev/null; then
            log_success "✓ 在常见路径找到: $path"
            # 如果找到的是父目录，添加 repsclaw
            if [[ "$path" == *"extensions/" ]] && [[ ! "$path" == *"repsclaw" ]]; then
                echo "$path/repsclaw"
            else
                echo "$path"
            fi
            return 0
        fi
    done

    log_warn "⚠️  常见路径未找到，开始搜索..."

    # 搜索 openclaw.plugin.json 文件
    local search_result=$(remote_exec "find ~ -name 'openclaw.plugin.json' -type f 2>/dev/null | head -1" 2>/dev/null || echo "")

    if [ -n "$search_result" ]; then
        local plugin_dir=$(dirname "$search_result")
        # 检查是否是 repsclaw 目录
        if [[ "$plugin_dir" == *"repsclaw" ]]; then
            log_success "✓ 搜索找到插件目录: $plugin_dir"
            echo "$plugin_dir"
            return 0
        else
            # 可能是其他插件，找到 extensions 目录
            local ext_dir=$(remote_exec "dirname $plugin_dir" 2>/dev/null)
            local repsclaw_dir="$ext_dir/repsclaw"
            log_info "📂 使用 extensions 目录: $repsclaw_dir"
            echo "$repsclaw_dir"
            return 0
        fi
    fi

    # 最后尝试：使用默认路径，远程创建目录
    log_warn "⚠️  未找到现有插件目录，将创建默认路径"
    local default_path="~/.openclaw/extensions/repsclaw"
    remote_exec "mkdir -p $default_path" 2>/dev/null || true
    echo "$default_path"
    return 0
}

# ========== CLI 官方部署 ==========
deploy_cli() {
    log_info "🚀 开始 CLI 官方部署..."
    log_info "📂 开发目录: $DEV_DIR"

    # 检查 openclaw 命令
    if ! command -v openclaw &> /dev/null; then
        log_error "❌ 未找到 openclaw 命令，无法使用 CLI 部署"
        log_info "   请确认 OpenClaw 已安装且 openclaw 在 PATH 中"
        log_info "   或回退到本地同步部署: DEPLOY_MODE=local ./deploy.sh"
        exit 1
    fi

    # 检查开发目录
    if [ ! -d "$DEV_DIR" ]; then
        log_error "❌ 开发目录不存在: $DEV_DIR"
        exit 1
    fi

    # 构建
    log_info "🔧 构建项目..."
    cd "$DEV_DIR"
    if ! npm run build; then
        log_error "❌ 构建失败，中断 CLI 部署"
        exit 1
    fi
    log_success "✅ 构建完成"

    # 使用官方 CLI 安装/链接插件
    log_info "📦 通过 OpenClaw CLI 安装/链接插件..."
    if openclaw plugins install -l "$DEV_DIR"; then
        log_success "✅ CLI 安装/链接成功"
    else
        log_warn "⚠️  CLI 安装失败，尝试重新安装..."
        # 如果已存在，先卸载再安装
        openclaw plugins uninstall repsclaw 2>/dev/null || true
        if openclaw plugins install -l "$DEV_DIR"; then
            log_success "✅ CLI 重新安装成功"
        else
            log_error "❌ CLI 部署失败"
            log_info "   请回退到本地同步部署: DEPLOY_MODE=local ./deploy.sh"
            exit 1
        fi
    fi

    # 启用插件
    log_info "🔌 启用插件..."
    if openclaw plugins enable repsclaw; then
        log_success "✅ 插件已启用"
    else
        log_warn "⚠️  插件启用命令未生效，可能已自动启用"
    fi

    # 验证安装状态
    log_info "🔍 验证 CLI 安装状态..."
    if openclaw plugins show repsclaw &> /dev/null; then
        log_success "✅ 插件已在 OpenClaw 中注册"
    else
        log_warn "⚠️  无法确认插件注册状态，建议运行: openclaw doctor"
    fi

    log_info "📋 CLI 部署信息:"
    echo "  源目录: $DEV_DIR" >&2
    echo "  命令: openclaw plugins install -l $DEV_DIR" >&2
    echo ""
    log_warn "⚠️  如插件未立即生效，请重启 OpenClaw Gateway"
    echo "   openclaw gateway restart" >&2
}

# ========== 本地部署 ==========
deploy_local() {
    log_info "🚀 开始本地部署..."
    log_info "📂 开发目录: $DEV_DIR"
    log_info "📂 插件目录: $LOCAL_PLUGIN_DIR"

    # 检查开发目录
    if [ ! -d "$DEV_DIR" ]; then
        log_error "❌ 开发目录不存在: $DEV_DIR"
        exit 1
    fi

    # 构建项目
    log_info "🔧 构建项目..."
    cd "$DEV_DIR"
    if ! npm run build; then
        log_error "❌ 构建失败，中断部署"
        exit 1
    fi
    log_success "✅ 构建完成"

    # 确保插件目录存在
    mkdir -p "$LOCAL_PLUGIN_DIR"

    log_info "🔄 同步文件..."

    # 同步文件
    for item in "${SYNC_ITEMS[@]}"; do
        src="$DEV_DIR/$item"
        dst="$LOCAL_PLUGIN_DIR/$item"

        if [ -e "$src" ]; then
            if command -v rsync &>/dev/null; then
                if [ -d "$src" ]; then
                    mkdir -p "$dst"
                    rsync -a --delete "$src/" "$dst/"
                else
                    rsync -a --delete "$src" "$dst"
                fi
            else
                # 删除旧文件/目录
                if [ -e "$dst" ]; then
                    rm -rf "$dst"
                fi
                cp -r "$src" "$dst"
            fi
            log_success "  ✓ $item"
        else
            log_warn "  ⚠ $item (不存在，已跳过)"
        fi
    done

    # 同步测试目录（可选）
    if [ -d "$DEV_DIR/tests" ]; then
        if command -v rsync &>/dev/null; then
            mkdir -p "$LOCAL_PLUGIN_DIR/tests"
            rsync -a --delete "$DEV_DIR/tests/" "$LOCAL_PLUGIN_DIR/tests/"
        else
            rm -rf "$LOCAL_PLUGIN_DIR/tests"
            cp -r "$DEV_DIR/tests" "$LOCAL_PLUGIN_DIR/"
        fi
        log_success "  ✓ tests"
    fi

    # 同步依赖
    if [ -d "$DEV_DIR/node_modules" ]; then
        log_info "🔄 同步 node_modules..."
        if command -v rsync &>/dev/null; then
            mkdir -p "$LOCAL_PLUGIN_DIR"
            rsync -a --delete "$DEV_DIR/node_modules/" "$LOCAL_PLUGIN_DIR/node_modules/"
        else
            rm -rf "$LOCAL_PLUGIN_DIR/node_modules"
            cp -r "$DEV_DIR/node_modules" "$LOCAL_PLUGIN_DIR/"
        fi
        log_success "✅ 依赖同步完成"
    else
        log_info "📦 安装依赖..."
        cd "$LOCAL_PLUGIN_DIR"
        npm install --silent 2>&1 | grep -v "npm WARN" || true
        log_success "✅ 依赖安装完成"
    fi

    # 更新 OpenClaw 配置
    update_local_openclaw_config "$LOCAL_PLUGIN_DIR"

    # 验证部署
    verify_deployment "$LOCAL_PLUGIN_DIR"
}

# ========== 远程部署 ==========
deploy_remote() {
    log_info "🚀 开始远程部署..."
    log_info "📂 开发目录: $DEV_DIR"
    log_info "🌐 目标服务器: $DEPLOY_TARGET_IP"

    # 检查必要命令
    check_command ssh || exit 1

    # 检查必要配置
    if [ -z "$DEPLOY_TARGET_IP" ]; then
        log_error "❌ 缺少配置: DEPLOY_TARGET_IP"
        log_info "   请在 .env 文件中设置目标 IP 地址"
        exit 1
    fi

    if [ -z "$DEPLOY_SSH_KEY" ] && [ -z "$DEPLOY_SSH_PASSWORD" ]; then
        log_warn "⚠️  未配置 SSH 密钥或密码，将尝试使用默认 SSH 密钥"
    fi

    # 测试 SSH 连接
    log_info "🔌 测试 SSH 连接..."
    if ! remote_exec "echo 'SSH connection successful'" > /dev/null 2>&1; then
        log_error "❌ SSH 连接失败，请检查："
        log_error "   - 目标 IP 是否正确: $DEPLOY_TARGET_IP"
        log_error "   - SSH 用户名是否正确: ${DEPLOY_SSH_USER:-(默认)}"
        log_error "   - SSH 密钥或密码是否配置正确"
        exit 1
    fi
    log_success "✅ SSH 连接成功"

    # 获取远程插件目录
    local remote_dir=""

    # 优先使用已保存的远程目录
    if [ -n "$REMOTE_PLUGIN_DIR" ]; then
        log_info "📂 使用 .env 中配置的远程目录: $REMOTE_PLUGIN_DIR"
        # 验证目录是否存在
        if remote_exec "test -d $REMOTE_PLUGIN_DIR" 2>/dev/null; then
            remote_dir="$REMOTE_PLUGIN_DIR"
        else
            log_warn "⚠️  配置的远程目录不存在，重新发现..."
            remote_dir=$(discover_remote_plugin_dir)
            # 保存新发现的目录
            save_env_var "REMOTE_PLUGIN_DIR" "$remote_dir"
            log_success "✓ 已保存远程目录到 .env: REMOTE_PLUGIN_DIR=$remote_dir"
        fi
    else
        # 发现远程目录
        remote_dir=$(discover_remote_plugin_dir)
        # 保存到 .env
        save_env_var "REMOTE_PLUGIN_DIR" "$remote_dir"
        log_success "✓ 已保存远程目录到 .env: REMOTE_PLUGIN_DIR=$remote_dir"
    fi

    log_info "📂 远程插件目录: $remote_dir"

    # 确保远程目录存在
    remote_exec "mkdir -p $remote_dir"

    # 创建临时目录用于打包
    local temp_dir=$(mktemp -d)
    local temp_deploy="$temp_dir/repsclaw"
    mkdir -p "$temp_deploy"

    log_info "🔄 准备同步文件..."

    # 复制文件到临时目录
    for item in "${SYNC_ITEMS[@]}"; do
        src="$DEV_DIR/$item"
        if [ -e "$src" ]; then
            cp -r "$src" "$temp_deploy/"
            log_success "  ✓ $item"
        else
            log_error "  ✗ $item (不存在)"
        fi
    done

    # 复制测试目录
    if [ -d "$DEV_DIR/tests" ]; then
        cp -r "$DEV_DIR/tests" "$temp_deploy/"
        log_success "  ✓ tests"
    fi

    # 使用 rsync 同步到远程
    log_info "📤 上传到远程服务器..."
    remote_rsync "$temp_deploy/" "$remote_dir"

    # 清理临时目录
    rm -rf "$temp_dir"

    # 远程安装依赖（跳过 postinstall 避免交互式提示）
    log_info "📦 远程安装依赖..."
    remote_exec "cd $remote_dir && npm install --ignore-scripts --silent 2>&1 | grep -v 'npm WARN' || true"
    log_success "✅ 依赖安装完成"

    # 更新远程 OpenClaw 配置
    update_remote_openclaw_config "$remote_dir"

    # 远程验证
    log_info "🔍 远程验证部署..."
    if remote_exec "test -f $remote_dir/index.ts && test -d $remote_dir/src/core" 2>/dev/null; then
        log_success "✅ 远程部署验证成功"
    else
        log_error "❌ 远程部署验证失败"
        exit 1
    fi

    # 显示部署信息
    echo ""
    log_info "📋 远程部署信息:"
    echo "  目标服务器: $DEPLOY_TARGET_IP" >&2
    echo "  插件目录: $remote_dir" >&2
    echo ""
    log_warn "⚠️  请重启远程 OpenClaw 以加载更新后的插件"
}

# ========== 验证部署 ==========
verify_deployment() {
    local plugin_dir="$1"

    log_info "🔍 验证部署..."

    if [ -f "$plugin_dir/index.ts" ] && \
       [ -d "$plugin_dir/src/core" ] && \
       [ -d "$plugin_dir/src/domains" ] && \
       [ -d "$plugin_dir/src/orchestration" ]; then
        log_success "✅ 部署成功！"
        echo ""
        log_info "📋 部署信息:"
        echo "  插件目录: $plugin_dir" >&2
        echo "  主文件: $plugin_dir/index.ts" >&2
        echo ""
        log_warn "⚠️  请重启 OpenClaw 以加载更新后的插件"
        echo ""
        log_info "🧪 测试命令:"
        echo "  cd $plugin_dir" >&2
        echo "  npm run test:unit" >&2
    else
        log_error "❌ 部署验证失败"
        exit 1
    fi

    # 验证构建产物
    if [ ! -f "$plugin_dir/dist/index.js" ]; then
        log_warn "⚠️  dist/index.js 不存在，部分功能可能不可用"
    else
        log_success "  ✓ dist/index.js"
    fi

    # 显示文件数量
    local file_count=$(find "$plugin_dir" -type f | wc -l)
    log_info "📊 已部署 $file_count 个文件"

    # ========== CLI 构建与文档更新 ==========
    echo ""
    log_info "🔧 构建 CLI..."

    if [ "$DEPLOY_MODE" = "remote" ]; then
        # 远程构建 - 使用已保存的 REMOTE_PLUGIN_DIR
        local remote_dir="${REMOTE_PLUGIN_DIR:-}"
        if [ -z "$remote_dir" ]; then
            # 如果没有保存的目录，尝试重新发现
            remote_dir=$(discover_remote_plugin_dir)
        fi
        remote_exec "cd $remote_dir && if [ -f scripts/build-cli.ts ]; then npx tsx scripts/build-cli.ts; fi" 2>/dev/null || true
    else
        # 本地构建
        cd "$plugin_dir"
        if [ -f "scripts/build-cli.ts" ]; then
            npx tsx scripts/build-cli.ts
            log_success "  ✓ CLI 构建完成"
        else
            log_error "  ✗ CLI 构建脚本不存在"
        fi

        # 更新文档
        echo ""
        log_info "📝 更新 AGENTS.md 和 TOOLS.md..."

        if [ -f "scripts/update-docs.ts" ]; then
            npx tsx scripts/update-docs.ts
            log_success "  ✓ 文档更新完成"
        else
            log_error "  ✗ 文档更新脚本不存在"
        fi

        # 显示 CLI 使用提示
        echo ""
        log_info "🚀 CLI 已就绪:"
        echo "  主程序: $plugin_dir/bin/repsclaw" >&2
        echo ""
        log_info "📖 快速开始:"
        echo "  $plugin_dir/bin/repsclaw --help" >&2
        echo "  $plugin_dir/bin/repsclaw hospital list" >&2
    fi
    echo ""
}

# ========== 主入口 ==========
main() {
    echo -e "${CYAN}========================================${NC}" >&2
    echo -e "${CYAN}  Repsclaw 部署脚本${NC}" >&2
    echo -e "${CYAN}========================================${NC}" >&2
    echo "" >&2

    # 显示当前配置
    log_info "⚙️  部署模式: $DEPLOY_MODE"

    case "$DEPLOY_MODE" in
        local)
            deploy_local
            ;;
        remote)
            deploy_remote
            ;;
        cli)
            deploy_cli
            ;;
        *)
            log_error "❌ 未知的部署模式: $DEPLOY_MODE"
            log_info "   支持的值: local, cli, remote"
            log_info "   请在 .env 文件中设置 DEPLOY_MODE"
            exit 1
            ;;
    esac

    echo ""
    log_success "🎉 部署完成！"
}

# 执行主函数
main "$@"
