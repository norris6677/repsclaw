# Repsclaw 插件部署指南

## ⚠️ 部署绝对准则

### 1. 必须使用方案 A（Feishu 模式）

**禁止**使用 `main` 字段在 `openclaw.plugin.json` 中指定入口。

**必须**使用 `package.json` 中的 `openclaw.extensions` 字段：

```json
{
  "openclaw": {
    "extensions": ["./index.ts"]
  }
}
```

### 2. 完整复制部署（禁止软链接）

部署时必须复制以下完整目录结构：

```
~/.openclaw/extensions/repsclaw/
├── index.ts              # 入口文件（必须在根目录）
├── package.json          # 包含 openclaw.extensions 配置
├── openclaw.plugin.json  # 插件配置（不包含 main 字段）
├── node_modules/         # 完整依赖（必须复制）
├── src/                  # TypeScript 源码
└── tsconfig.json         # TypeScript 配置
```

**禁止**使用软链接：
```bash
# ❌ 错误：使用软链接
ln -s /path/to/repsclaw ~/.openclaw/extensions/repsclaw

# ✅ 正确：使用文件复制
cp -r /path/to/repsclaw ~/.openclaw/extensions/
```

### 3. openclaw.plugin.json 格式

```json
{
  "id": "repsclaw",
  "name": "Repsclaw Healthcare Plugin",
  "version": "1.0.0",
  "description": "Healthcare data integration...",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "FDA_API_KEY": { "type": "string" },
      "PUBMED_API_KEY": { "type": "string" },
      "NCBI_API_KEY": { "type": "string" }
    }
  }
}
```

**注意：不包含 `main` 字段！**

### 4. index.ts 导出格式

使用 `export default`：

```typescript
const plugin = {
  id: "repsclaw",
  name: "Repsclaw Healthcare Plugin",
  
  register(api) {
    api.logger.info("🩺 Repsclaw plugin initializing...");
    // ...
  },
};

export default plugin;
```

## 部署步骤

### 第一步：准备文件

确保以下文件配置正确：

1. `package.json` 包含 `openclaw.extensions`
2. `openclaw.plugin.json` 不包含 `main` 字段
3. `index.ts` 在项目根目录

### 第二步：强制重置状态

```bash
# 1. 停止 OpenClaw
pkill -f openclaw

# 2. 清理配置
node -e "
const fs = require('fs');
const configPath = require('path').join(process.env.HOME, '.openclaw', 'openclaw.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (config.plugins) {
  delete config.plugins.entries.repsclaw;
  delete config.plugins.installs.repsclaw;
}
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
"

# 3. 删除旧目录
rm -rf ~/.openclaw/extensions/repsclaw
```

### 第三步：完整复制部署

```bash
# 创建目录
mkdir -p ~/.openclaw/extensions/repsclaw

# 复制必要文件
cp index.ts package.json openclaw.plugin.json tsconfig.json ~/.openclaw/extensions/repsclaw/
cp -r node_modules src ~/.openclaw/extensions/repsclaw/
```

### 第四步：更新配置

```bash
node -e "
const fs = require('fs');
const path = require('path');
const configPath = path.join(process.env.HOME, '.openclaw', 'openclaw.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

if (!config.plugins) config.plugins = { entries: {}, installs: {} };

config.plugins.entries.repsclaw = { enabled: true };
config.plugins.installs.repsclaw = {
  source: 'path',
  spec: '/home/tony203/.openclaw/extensions/repsclaw',
  installPath: '/home/tony203/.openclaw/extensions/repsclaw',
  version: '1.0.0',
  installedAt: new Date().toISOString()
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
"
```

### 第五步：重启 OpenClaw

```bash
openclaw gateway restart
```

## 故障排除

### 错误：plugin not found: repsclaw (stale config entry ignored)

**原因**：
1. 使用了 `main` 字段而不是 `openclaw.extensions`
2. 使用了软链接而不是文件复制
3. 缺少 `node_modules` 依赖

**解决**：
按上述部署步骤强制重置并重新部署。

### 错误：extension entry escapes package directory

**原因**：
`package.json` 中的 `openclaw.extensions` 指向的文件不存在。

**解决**：
确保 `index.ts` 存在于插件根目录。

### 验证部署是否正确

```bash
# 1. 检查是否为普通目录（不是软链接）
ls -la ~/.openclaw/extensions/ | grep repsclaw
# 应为：drwxrwxr-x repsclaw
# 不应为：lrwxrwxrwx repsclaw -> /path

# 2. 检查关键文件
ls ~/.openclaw/extensions/repsclaw/index.ts
ls ~/.openclaw/extensions/repsclaw/node_modules/

# 3. 检查配置
cat ~/.openclaw/extensions/repsclaw/package.json | grep -A 3 '"openclaw"'
# 应显示："extensions": ["./index.ts"]

# 4. 检查 openclaw.json
cat ~/.openclaw/openclaw.json | grep -A 5 '"repsclaw":'
```

## 历史教训

| 时间 | 问题 | 原因 | 解决方案 |
|------|------|------|----------|
| 2026-03-13 | plugin not found | 使用软链接部署 | 改为文件复制 |
| 2026-03-13 | stale config entry | 使用 `main` 字段 | 改用 `openclaw.extensions` |
| 2026-03-13 | 依赖缺失 | 未复制 node_modules | 完整复制所有文件 |
| 2026-03-13 | 导出格式不兼容 | 使用 `exports.default` | 使用 `export default` |

## 参考

- Feishu 插件结构：`~/.openclaw/extensions/feishu/`
- OpenClaw 配置：`~/.openclaw/openclaw.json`
