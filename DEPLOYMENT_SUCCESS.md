# Repsclaw 插件加载成功检查清单

## ⚠️ 绝对准则（必须严格遵守）

### 1. 入口配置（最关键）

**✅ 必须使用以下配置：**

**package.json:**
```json
{
  "main": "index.ts",
  "openclaw": {
    "extensions": ["./index.ts"]
  }
}
```

**openclaw.plugin.json:**
```json
{
  "id": "repsclaw",
  "name": "Repsclaw Healthcare Plugin",
  "version": "1.0.0",
  "configSchema": { ... }
  // ❌ 绝对不要包含 "main" 字段
}
```

**❌ 错误的配置（会导致 plugin not found）：**
```json
// 错误：在 openclaw.plugin.json 中使用 main
{
  "id": "repsclaw",
  "main": "./dist/index.js"
}
```

### 2. 部署方式（必须使用文件复制）

**✅ 正确的部署结构：**
```
~/.openclaw/extensions/repsclaw/
├── index.ts              # 入口文件（必须在根目录）
├── package.json          # 包含 openclaw.extensions
├── openclaw.plugin.json  # 不包含 main 字段
├── tsconfig.json         # TypeScript 配置
├── node_modules/         # 完整依赖（必须复制）
├── src/                  # TypeScript 源码
│   ├── tools/
│   ├── integrations/
│   └── utils/
└── AGENTS.md             # 工具契约文档
```

**❌ 禁止的部署方式：**
- 软链接：`ln -s /path/to/repsclaw ~/.openclaw/extensions/repsclaw`
- 精简结构（仅复制 dist/）
- 缺少 node_modules/

### 3. 导出格式

**✅ 正确的导出方式：**
```typescript
// index.ts
const plugin = {
  id: "repsclaw",
  name: "Repsclaw Healthcare Plugin",
  register(api) { ... }
};

export default plugin;
```

**❌ 错误的导出方式：**
```typescript
// 错误：CommonJS 格式
module.exports = plugin;

// 错误：命名导出
export { plugin };
export const plugin = { ... };
```

### 4. 插件对象结构

**✅ 必须包含的方法：**
```typescript
const plugin = {
  id: "repsclaw",                    // 必需
  name: "Repsclaw Healthcare Plugin", // 必需
  version: "1.0.0",                  // 建议
  description: "...",                // 建议
  
  register(api) {                    // 必需
    // 1. 注册 HTTP 路由
    api.registerHttpRoute({ ... });
    
    // 2. 注册工具（可选）
    if (api.registerTool) {
      api.registerTool(name, definition, handler);
    }
  }
};
```

## 部署前检查清单

### Step 1: 验证 package.json

```bash
# 检查 main 字段
cat package.json | grep '"main"'
# 预期输出: "main": "index.ts"

# 检查 openclaw.extensions
cat package.json | grep -A 3 '"openclaw"'
# 预期输出包含: "extensions": ["./index.ts"]
```

### Step 2: 验证 openclaw.plugin.json

```bash
# 检查是否包含 main 字段（应该没有）
cat openclaw.plugin.json | grep '"main"'
# 预期: 无输出

# 检查 id 字段
cat openclaw.plugin.json | grep '"id"'
# 预期输出: "id": "repsclaw"
```

### Step 3: 验证入口文件

```bash
# 检查 index.ts 是否存在
ls -la index.ts

# 检查是否包含 register 方法
grep "register(api)" index.ts
# 预期: 找到匹配

# 检查导出格式
grep "export default" index.ts
# 预期: export default plugin;
```

### Step 4: 验证目录结构

```bash
# 部署后检查
ls -la ~/.openclaw/extensions/repsclaw/

# 必须是普通目录（不是软链接）
# 预期: drwxrwxr-x repsclaw
# 错误: lrwxrwxrwx repsclaw -> /path
```

## 故障排除流程

### 问题：plugin not found: repsclaw (stale config entry ignored)

**排查步骤：**

1. **检查是否为软链接**
   ```bash
   ls -la ~/.openclaw/extensions/ | grep repsclaw
   # 如果是 lrwxrwxrwx，删除并重新复制
   rm -f ~/.openclaw/extensions/repsclaw
   cp -r /path/to/repsclaw ~/.openclaw/extensions/
   ```

2. **检查 openclaw.plugin.json 是否包含 main 字段**
   ```bash
   cat ~/.openclaw/extensions/repsclaw/openclaw.plugin.json | grep main
   # 如果有输出，删除 main 字段
   ```

3. **检查 package.json 是否包含 openclaw.extensions**
   ```bash
   cat ~/.openclaw/extensions/repsclaw/package.json | grep -A 3 openclaw
   # 应该包含 "extensions": ["./index.ts"]
   ```

4. **强制重置 OpenClaw 状态**
   ```bash
   # 停止 OpenClaw
   pkill -f openclaw
   
   # 清理配置
   # 编辑 ~/.openclaw/openclaw.json，删除 plugins.entries.repsclaw 和 plugins.installs.repsclaw
   
   # 重新部署
   rm -rf ~/.openclaw/extensions/repsclaw
   cp -r /path/to/repsclaw ~/.openclaw/extensions/
   
   # 重新添加配置
   # 编辑 ~/.openclaw/openclaw.json，添加 repsclaw 配置
   ```

### 问题：extension entry escapes package directory

**原因**：`package.json` 中的 `openclaw.extensions` 指向的文件不存在。

**解决**：
```bash
# 检查 index.ts 是否存在
ls ~/.openclaw/extensions/repsclaw/index.ts
# 如果不存在，重新复制
```

### 问题：工具注册失败

**排查步骤**：

1. 检查日志输出，查看 `api` 对象有哪些方法
2. 确认使用了正确的注册方式：
   - `api.registerTool()` 或
   - `api.tools.register()`
3. 检查工具定义是否符合要求

## 成功验证

部署成功后，运行以下命令验证：

```bash
# 1. 检查目录类型
ls -la ~/.openclaw/extensions/ | grep repsclaw
# 预期: drwxrwxr-x repsclaw

# 2. 检查关键文件存在
ls ~/.openclaw/extensions/repsclaw/{index.ts,package.json,openclaw.plugin.json,node_modules}

# 3. 检查配置正确
cat ~/.openclaw/extensions/repsclaw/openclaw.plugin.json | grep -v main
cat ~/.openclaw/extensions/repsclaw/package.json | grep -A 3 '"openclaw"'

# 4. 重启 OpenClaw 观察日志
openclaw gateway restart
# 观察是否有 [REPSCLAW] 开头的日志输出
```

## 历史教训

| 日期 | 问题 | 根本原因 | 解决方案 |
|------|------|----------|----------|
| 2026-03-13 | plugin not found | 使用软链接部署 | 改为文件复制 |
| 2026-03-13 | stale config entry | 使用 `main` 字段而非 `extensions` | 删除 `main`，使用 `openclaw.extensions` |
| 2026-03-13 | 依赖缺失 | 未复制 node_modules | 完整复制所有文件 |
| 2026-03-13 | 工具注册失败 | API 接口不匹配 | 检测 `api.registerTool` 和 `api.tools.register` |

## 参考

- Feishu 插件（成功案例）：`~/.openclaw/extensions/feishu/`
- 失败案例：`DEPLOYMENT.md` 中的历史教训部分
