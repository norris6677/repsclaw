# OpenClaw 插件自动安装说明

## ⚠️ 绝对准则

### 1. 禁止使用软链接部署插件

在安装插件和进行完整集成测试时，**绝对不要使用软链接（symlink）**。必须使用文件复制方式部署。

原因：
- 软链接会导致 OpenClaw 加载时出现 `plugin not found` 错误
- 全局配置 `~/.openclaw/openclaw.json` 与软链接指向的文件状态不同步
- 必须使用普通目录才能确保插件正确加载

### 2. 必须使用方案 A（Feishu 模式）

插件部署必须对齐 Feishu 插件的工作模式：

- 使用 `package.json` 中的 `openclaw.extensions` 指定入口
- **禁止**在 `openclaw.plugin.json` 中使用 `main` 字段
- 完整复制部署（包括 `node_modules`）

详见 `DEPLOYMENT.md`

---

## 自动安装

本插件支持在安装时自动复制到 OpenClaw。

### 工作原理

在 `npm install` 完成后，`postinstall` 钩子会自动运行 `src/cli/setup.ts` 脚本：

1. **自动探测** - 脚本会尝试在以下位置查找 OpenClaw：
   - 上一级目录 (`../openclaw`)
   - 用户主目录 (`~/.openclaw`, `~/openclaw`)
   - 常见安装路径 (`/usr/local/share/openclaw`, `/opt/openclaw`)
   - 环境变量 (`OPENCLAW_HOME`, `OPENCLAW_PATH`)

2. **文件复制** - 找到后会将插件文件复制到 `~/.openclaw/extensions/`
   - 只复制必要文件：`dist/`、`openclaw.plugin.json`、`package.json`
   - 不复制 `node_modules/`、`src/` 等开发依赖

3. **交互模式** - 如果自动探测失败，会提示用户手动输入路径

### 使用方法

#### 标准安装

```bash
npm install
```

安装完成后会自动尝试复制到 OpenClaw。

#### 手动运行设置

```bash
# 使用 npm 脚本
npm run setup:openclaw

# 或直接运行
npx tsx src/cli/setup.ts
```

#### 跳过自动安装

如果需要在安装时跳过复制步骤：

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

- **Linux/macOS**: 使用文件复制
- **Windows**: 使用文件复制

### 故障排除

#### 安装后插件未加载

1. 检查是否为普通目录（不是软链接）：
   ```bash
   ls -la ~/.openclaw/extensions/
   # 正确：drwxrwxr-x repsclaw
   # 错误：lrwxrwxrwx repsclaw -> /path
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
├── feishu/                    # 其他插件
└── repsclaw/                  # 本插件（普通目录，不是软链接）
    ├── dist/
    │   └── index.js
    ├── openclaw.plugin.json
    └── package.json
```

### 验证安装

```bash
# 检查是否为普通目录
ls -la ~/.openclaw/extensions/repsclaw
# 应显示：drwxrwxr-x ... repsclaw
# 不应显示：lrwxrwxrwx ... repsclaw -> /path

# 检查关键文件是否存在
ls ~/.openclaw/extensions/repsclaw/dist/index.js
ls ~/.openclaw/extensions/repsclaw/openclaw.plugin.json
```
