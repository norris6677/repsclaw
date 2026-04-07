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

---

# HTTP 真实环境测试

`tests/integration/services/` 目录下包含针对 repsclaw 各功能的 **HTTP 真实环境测试**。这些测试会发起真实的 HTTP 请求，连接外部数据源（如医院官网、Baidu 搜索、WeChat 搜索等），验证端到端的功能正确性。

## 双模式测试架构

为了兼容不同开发环境，HTTP 真实测试支持通过 `.env` 配置在 **两种模式** 间切换，且共享同一套测试用例代码，避免重复。

### 模式对比

| 模式 | 名称 | 依赖 | 存储 | 适用场景 |
|------|------|------|------|----------|
| `virtual` | 虚拟环境 | 无需 OpenClaw | 内存 + Markdown 文件 | 本地开发、CI（默认） |
| `local` | 本地环境 | 需要已启动的 OpenClaw 服务 | Markdown 文件 | 集成验证 |

### 架构设计

```
测试用例 (tests/integration/services/*.http.real.test.ts)
         │
         ▼
共享基座 (tests/integration/http-test-infra.ts)
         │
    ┌────┴────┐
    ▼         ▼
virtual   local
模式      模式
    │         │
    ▼         ▼
Virtual   连接外部
Test      OpenClaw
Server    服务
```

**核心设计原则**：
- 测试用例不感知运行模式，统一调用 `startTestEnvironment()`、`httpRequest()` 等接口
- 模式切换由 `http-test-infra.ts` 根据环境变量统一处理
- Virtual 模式下，内置的 `VirtualTestServer` 仅模拟 OpenClaw 的最小 API 表面，实际仍调用各 Service 的真实实现，保证外部 HTTP 请求的真实性

## `.env` 配置

在项目根目录的 `.env` 文件中加入以下配置项：

```bash
# =============================================
# HTTP 真实环境测试配置
# =============================================
# 测试模式: virtual (默认) | local
REPSCLAW_TEST_MODE=virtual

# virtual 模式: 可选自定义测试服务器端口
REPSCLAW_TEST_HOST=127.0.0.1
REPSCLAW_TEST_PORT=3001

# local 模式: 本地 OpenClaw 服务地址
REPSCLAW_TEST_URL=http://localhost:3000
```

> 如果不配置，默认使用 `REPSCLAW_TEST_MODE=virtual`。

## 测试文件说明

| 测试文件 | 功能覆盖 | 外部数据源 |
|----------|----------|------------|
| `doctor-subscription.http.real.test.ts` | 医生订阅 CRUD、主医生设置、别名解析 | - |
| `hospital-subscription.http.real.test.ts` | 医院订阅 CRUD、新闻查询联动 | - |
| `hospital-news.http.real.test.ts` | 医院新闻聚合查询 | 医院官网、Baidu、WeChat、NHC/NMPA 等 |

## 运行方式

### 运行单个测试

```bash
# 医生订阅
REPSCLAW_TEST_MODE=virtual npx tsx tests/integration/services/doctor-subscription.http.real.test.ts

# 医院订阅
REPSCLAW_TEST_MODE=virtual npx tsx tests/integration/services/hospital-subscription.http.real.test.ts

# 医院新闻
REPSCLAW_TEST_MODE=virtual npx tsx tests/integration/services/hospital-news.http.real.test.ts
```

### 指定测试医院

对于医院新闻测试，默认测试医院为 `北京协和医院`。若需修改，可手动编辑对应测试文件中的 `hospitalName` 参数，或自行扩展为参数化测试。

## 关键实现文件

| 文件 | 说明 |
|------|------|
| `tests/integration/http-test-infra.ts` | 共享测试基础设施：环境启动/停止、HTTP 请求工具、断言工具、测试套件运行器 |
| `tests/integration/server/virtual-server.ts` | 虚拟测试服务器，注册真实的 HTTP 路由和 Tool 处理器 |
| `tests/integration/server/minimal-api.ts` | 最小化的 OpenClaw API 模拟实现 |
| `tests/integration/server/test-server.types.ts` | 虚拟服务器类型定义 |

## 注意事项

1. **Playwright 依赖**：医院新闻测试中部分数据源（如官方 NHC/NMPA 查询）使用 Playwright 浏览器。若本地未安装浏览器，对应源会返回错误并被测试框架正常处理，不会导致测试失败。
   ```bash
   # 如需完整启用 Playwright 数据源
   npx playwright install
   ```
2. **API Keys**：主流媒体查询依赖 `JUHE_NEWS_API_KEY`。若未配置，该数据源自会跳过。
3. **Markdown 持久化**：`virtual` 模式下所有持久化使用 Markdown 文件或内存完成，无需外部数据库。
4. **端口占用**：运行前确保 `REPSCLAW_TEST_PORT`（默认 3001）未被占用。
