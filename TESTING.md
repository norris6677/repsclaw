# OpenClaw 插件挂载测试指南

本测试套件用于验证 `repsclaw` 插件是否能成功通过 npm install 自动挂载到 OpenClaw。

## 快速开始

```bash
# 运行所有测试
npm test

# 或分别运行
npm run test:mount        # 简化测试（推荐）
npm run test:integration  # 完整集成测试
npm run test:postinstall  # postinstall 钩子测试
```

## 测试类型

### 1. 简化挂载测试 (`npm run test:mount`)

最快速的测试方式，无需实际运行 npm install。

**测试内容：**
- 自动探测 OpenClaw 安装路径
- 创建软链接（Windows: junction, Linux/Mac: symlink）
- 验证插件项目结构
- 模拟 OpenClaw 插件扫描
- 重复安装处理

**运行时间：** ~5-10 秒

### 2. 完整集成测试 (`npm run test:integration`)

更全面的测试，包含简化测试的所有内容。

**额外测试：**
- 实际运行 `src/cli/setup.ts` 脚本
- 验证 IOpenClawPlugin 接口实现
- 检查插件元数据
- 验证插件可加载性

**运行时间：** ~15-30 秒

### 3. postinstall 钩子测试 (`npm run test:postinstall`)

验证 npm install 后的自动挂载行为。

**测试内容：**
- npm install 触发 postinstall 钩子
- SKIP_OPENCLAW_SETUP 环境变量生效
- 手动运行 setup 脚本

**⚠️ 注意：** 此测试需要网络连接（npm install），运行时间 ~2-5 分钟。

## 测试脚本详解

| 命令 | 描述 | 适用场景 |
|------|------|----------|
| `npm test` | 运行默认测试（test:mount） | 快速验证 |
| `npm run test:mount` | 简化挂载测试 | 开发时快速检查 |
| `npm run test:integration` | 完整集成测试 | CI/CD 流程 |
| `npm run test:postinstall` | postinstall 钩子测试 | 验证 npm 行为 |
| `npm run test:all` | 运行所有测试 | 发布前全面检查 |
| `npm run test:ci` | CI 专用（包含构建） | GitHub Actions |

## 本地验证步骤

### 方式 1：使用测试脚本（推荐）

```bash
# 1. 运行简化测试
npm run test:mount

# 2. 如果通过，运行完整测试
npm run test:integration
```

### 方式 2：手动验证

```bash
# 1. 构建项目
npm run build

# 2. 创建模拟 OpenClaw 环境
mkdir -p ~/.openclaw/extensions
echo '{"version":"1.0.0"}' > ~/.openclaw/openclaw.json

# 3. 运行安装脚本
npm run setup:openclaw

# 4. 验证链接
ls -la ~/.openclaw/extensions/repsclaw

# 5. 验证插件内容
cat ~/.openclaw/extensions/repsclaw/package.json
```

### 方式 3：完整的 npm install 模拟

```bash
# 1. 创建隔离的测试目录
mkdir /tmp/test-repsclaw && cd /tmp/test-repsclaw

# 2. 创建 package.json 依赖本插件
cat > package.json << 'EOF'
{
  "name": "test-consumer",
  "version": "1.0.0",
  "dependencies": {
    "repsclaw": "file:/path/to/repsclaw"
  }
}
EOF

# 3. 创建 OpenClaw 环境
mkdir -p ~/.openclaw/extensions

# 4. 运行 npm install
npm install

# 5. 验证挂载
ls -la ~/.openclaw/extensions/
```

## 预期测试结果

### 成功输出示例

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

## 故障排除

### 测试失败：软链接创建失败

**问题原因：**
- Windows 未启用开发者模式或未以管理员身份运行
- Linux/Mac 文件系统不支持符号链接

**解决方案：**

Windows:
```powershell
# 启用开发者模式（PowerShell 管理员）
reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /t REG_DWORD /f /v "AllowDevelopmentWithoutDevLicense" /d "1"
```

Linux/Mac:
```bash
# 检查 /tmp 是否支持符号链接
mount | grep /tmp

# 如果使用的是 noexec，改用其他目录
TMPDIR=$HOME/tmp npm run test:mount
```

### 测试失败：postinstall 未触发

**检查点：**
1. package.json 中是否有 `postinstall` 脚本？
2. 脚本路径是否正确？
3. 是否有执行权限？

```bash
# 检查 package.json
cat package.json | grep -A 3 '"scripts"'

# 手动测试脚本
node dist/cli/setup.js
# 或
npx tsx src/cli/setup.ts
```

### 测试失败：找不到 OpenClaw

**解决方案：**

```bash
# 设置环境变量
export OPENCLAW_HOME=/path/to/openclaw

# 然后运行测试
npm run test:mount
```

### 测试超时

```bash
# 增加超时时间（以简化测试为例）
npx tsx tests/integration/simple-mount.test.ts --timeout=120000
```

## CI/CD 集成

### GitHub Actions

已配置 `.github/workflows/test-mount.yml`，会自动：
- 在 Ubuntu、Windows、macOS 上运行测试
- 测试 Node.js 18 和 20
- 验证真实的 npm install 行为

### 其他 CI 系统

通用配置：

```yaml
steps:
  - uses: actions/checkout@v4
  
  - name: Setup Node.js
    uses: actions/setup-node@v4
    with:
      node-version: '20'
  
  - name: Install dependencies
    run: npm ci
  
  - name: Run mount tests
    run: npm run test:mount
```

## 调试模式

保留测试环境以便检查：

```bash
# 简化测试
SKIP_CLEANUP=true npm run test:mount

# 查看创建的测试环境
ls -la /tmp/openclaw-test-*
```

## 测试覆盖范围

| 功能 | 简化测试 | 集成测试 | postinstall |
|------|----------|----------|-------------|
| 自动探测 | ✅ | ✅ | ✅ |
| 软链接创建 | ✅ | ✅ | ✅ |
| Windows junction | ✅ | ✅ | ✅ |
| Linux/Mac symlink | ✅ | ✅ | ✅ |
| 插件结构验证 | ✅ | ✅ | ✅ |
| 接口实现检查 | ❌ | ✅ | ❌ |
| npm install 触发 | ❌ | ❌ | ✅ |
| SKIP 环境变量 | ❌ | ❌ | ✅ |
| 重复安装处理 | ✅ | ✅ | ✅ |

## 贡献指南

添加新的测试：

1. 在 `tests/integration/` 创建新的测试文件
2. 使用统一的日志输出格式
3. 确保测试可跨平台运行
4. 更新本 README

示例：

```typescript
// tests/integration/my-test.ts
import { setup, cleanup, log } from './test-utils';

async function run() {
  const ctx = await setup();
  
  try {
    // 你的测试代码
    log('测试通过', 's');
  } catch (e) {
    log(`测试失败: ${e}`, 'e');
    process.exit(1);
  }
  
  await cleanup(ctx);
}

run();
```

## 参考

- [SETUP.md](./SETUP.md) - 安装脚本说明
- [tests/README.md](./tests/README.md) - 测试目录说明
- [src/cli/setup.ts](./src/cli/setup.ts) - 安装脚本源码
