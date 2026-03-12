# OpenClaw 插件挂载测试

本目录包含用于测试 `repsclaw` 插件是否能成功挂载到 OpenClaw 的集成测试。

## 测试脚本

### 1. 简化测试 (推荐)

```bash
# 运行简化测试（无需构建，快速验证）
npm run test:mount

# 或直接使用 tsx
npx tsx tests/integration/simple-mount.test.ts
```

### 2. 完整集成测试

```bash
# 运行完整的集成测试
npm run test:integration

# 或
npx tsx tests/integration/setup.test.ts
```

## 测试内容

### 简化测试 (`simple-mount.test.ts`)

测试项目：
- ✅ 自动探测 OpenClaw 安装路径
- ✅ 创建软链接（支持 Windows/Linux/Mac）
- ✅ 验证插件项目结构
- ✅ 模拟 OpenClaw 插件扫描
- ✅ 重复安装处理

### 完整测试 (`setup.test.ts`)

包含简化测试的所有内容，额外测试：
- ✅ 实际运行 `src/cli/setup.ts` 脚本
- ✅ 验证 postinstall 钩子
- ✅ 检查 IOpenClawPlugin 接口实现
- ✅ 验证插件可加载性

## 预期输出

测试成功时输出：

```
╔══════════════════════════════════════════════════════╗
║      OpenClaw 插件挂载简化测试                      ║
╚══════════════════════════════════════════════════════╝

[14:30:25] ℹ 准备测试环境...
[14:30:25] ℹ 模拟环境: /tmp/openclaw-test-1234567890

━━━ 测试: 自动探测 ━━━
...

════════════════════════════════════════════════════
测试报告
════════════════════════════════════════════════════
✔ 自动探测
✔ 软链接创建
✔ 插件验证
✔ OpenClaw 扫描
✔ 重复安装

════════════════════════════════════════════════════
总计: 5 | 通过: 5 | 失败: 0
════════════════════════════════════════════════════

✨ 所有测试通过！插件可以成功挂载到 OpenClaw。
```

## 环境变量

测试支持以下环境变量：

| 变量 | 说明 |
|------|------|
| `OPENCLAW_HOME` | 指定 OpenClaw 安装路径 |
| `SKIP_CLEANUP` | 设置为 `true` 保留测试环境用于调试 |

## 故障排除

### 测试失败：软链接创建失败

**Linux/Mac:**
```bash
# 检查文件系统是否支持符号链接
ls -la /tmp

# 检查权限
whoami
```

**Windows:**
```powershell
# 以管理员身份运行 PowerShell
# 或者启用开发者模式：设置 -> 更新与安全 -> 开发者选项 -> 开发者模式
```

### 测试失败：插件结构检查失败

确保项目包含以下文件：
- `package.json`（包含 postinstall 脚本）
- `src/index.ts`（实现 IOpenClawPlugin 接口）
- `src/cli/setup.ts`（安装脚本）

### 调试模式

```bash
# 保留测试环境以便检查
SKIP_CLEANUP=true npm run test:mount

# 检查创建的测试环境
ls -la /tmp/openclaw-test-*
```

## CI/CD 集成

在 CI 环境中运行测试：

```yaml
# .github/workflows/test.yml 示例
name: Test Plugin Mount

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run mount test
        run: npm run test:mount
```

## 手动验证

如果你想手动验证挂载是否成功：

```bash
# 1. 运行安装脚本
npm install

# 2. 检查链接是否创建
ls -la ~/.openclaw/extensions/

# 3. 验证链接目标
ls -la ~/.openclaw/extensions/repsclaw

# 4. 重启 OpenClaw 查看插件是否加载
```
