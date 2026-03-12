# OpenClaw 插件自动安装说明

## 自动安装

本插件支持在安装时自动链接到 OpenClaw。

### 工作原理

在 `npm install` 完成后，`postinstall` 钩子会自动运行 `src/cli/setup.ts` 脚本：

1. **自动探测** - 脚本会尝试在以下位置查找 OpenClaw：
   - 上一级目录 (`../openclaw`)
   - 用户主目录 (`~/.openclaw`, `~/openclaw`)
   - 常见安装路径 (`/usr/local/share/openclaw`, `/opt/openclaw`)
   - 环境变量 (`OPENCLAW_HOME`, `OPENCLAW_PATH`)

2. **自动链接** - 找到后会在 `~/.openclaw/extensions/` 创建软链接

3. **交互模式** - 如果自动探测失败，会提示用户手动输入路径

### 使用方法

#### 标准安装

```bash
npm install
```

安装完成后会自动尝试链接到 OpenClaw。

#### 手动运行设置

```bash
# 使用 npm 脚本
npm run setup:openclaw

# 或直接运行
npx tsx src/cli/setup.ts
```

#### 跳过自动安装

如果需要在安装时跳过链接步骤：

```bash
# 方式 1: 设置环境变量
SKIP_OPENCLAW_SETUP=true npm install

# 方式 2: CI 环境自动跳过
CI=true npm install
```

### 环境变量

| 变量 | 说明 |
|------|------|
| `OPENCLAW_HOME` | OpenClaw 安装路径 |
| `OPENCLAW_PATH` | 备选路径变量 |
| `SKIP_OPENCLAW_SETUP` | 设置为 `true` 跳过安装 |
| `CI` | CI 环境标志，自动跳过交互 |

### 平台支持

- **Linux/macOS**: 使用符号链接 (symlink)
- **Windows**: 使用目录链接 (junction)

### 故障排除

#### 安装后插件未加载

1. 检查链接是否存在：
   ```bash
   ls -la ~/.openclaw/extensions/
   ```

2. 手动运行设置：
   ```bash
   npm run setup:openclaw
   ```

3. 重启 OpenClaw

#### 权限问题

在 Linux/macOS 上，如果遇到权限错误，请检查：

```bash
# 检查 .openclaw 目录权限
ls -la ~ | grep openclaw

# 修复权限
chmod 755 ~/.openclaw
chmod 755 ~/.openclaw/extensions
```

### 目录结构

安装成功后，目录结构如下：

```
~/.openclaw/extensions/
├── feishu/           # 其他插件
└── repsclaw -> /path/to/repsclaw   # 本插件的软链接
```
