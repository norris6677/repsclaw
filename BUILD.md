# Repsclaw Plugin 构建指南

## 快速构建

```bash
npm run build
```

构建输出将生成在 `dist/` 目录：

```
dist/
├── index.js              # 主入口
├── index.d.ts            # 类型定义
├── plugin.js             # 插件实现
├── plugin.d.ts           # 插件类型
├── openclaw.plugin.json  # OpenClaw 配置
└── types/                # 类型定义目录
    ├── index.js
    ├── index.d.ts
    ├── plugin.js
    ├── plugin.d.ts
    ├── services.js
    └── services.d.ts
```

## 构建系统说明

由于 TypeScript 编译器在处理复杂依赖时性能较慢，本项目使用自定义构建脚本 (`scripts/build.sh`) 来生成 JavaScript 文件。

### 构建脚本功能

1. **清理旧构建**: 删除 `dist/` 目录
2. **生成类型定义**: 创建 `.d.ts` 类型文件
3. **转译源代码**: 将 TypeScript 转译为 CommonJS
4. **复制配置**: 复制 `openclaw.plugin.json`

### 插件入口

构建后的插件入口为 `dist/plugin.js`，符合 `openclaw.plugin.json` 中的配置：

```json
{
  "entry": "./dist/plugin.js"
}
```

## 验证构建

```bash
# 测试插件可加载性
node -e "const Plugin = require('./dist/plugin.js'); console.log(new Plugin.default())"

# 运行测试
npm test
```

## 开发模式

开发时使用 TypeScript 源码直接运行：

```bash
# 使用 tsx 运行 TypeScript
npx tsx src/plugin.ts

# 或监视模式
npm run dev
```

## 构建输出验证

成功构建后，应满足以下检查：

- ✅ `dist/plugin.js` 存在且可加载
- ✅ `dist/index.js` 存在且可加载
- ✅ `dist/openclaw.plugin.json` 存在
- ✅ 插件类包含 `metadata` 属性
- ✅ 插件类实现 `register` 方法
- ✅ 插件类实现 `unregister` 方法

## 故障排除

### 构建失败

如果 `npm run build` 失败：

```bash
# 手动运行构建脚本
bash scripts/build.sh

# 检查权限
chmod +x scripts/build.sh
```

### 插件无法加载

```bash
# 验证构建输出
ls -la dist/

# 测试加载
node -e "require('./dist/plugin.js')"

# 检查 openclaw.plugin.json
cat dist/openclaw.plugin.json
```

### 类型错误

类型定义文件 (`.d.ts`) 仅供参考，不影响运行时。如遇到类型问题，可手动编辑：

```bash
# 编辑类型定义
vim dist/types/plugin.d.ts
```

## 与 OpenClaw 集成

构建完成后，OpenClaw 会自动加载插件：

```
~/.openclaw/extensions/repsclaw/
├── dist/           # 构建输出
├── src/            # 源代码
├── package.json
└── openclaw.plugin.json
```

重启 OpenClaw Gateway：

```bash
pkill openclaw-gateway
openclaw gateway start
```

## CI/CD 构建

在 CI 环境中：

```yaml
# .github/workflows/build.yml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: '20'
  - run: npm ci
  - run: npm run build
  - run: npm test
```

## 完整功能构建

当前构建脚本生成简化版插件。如需完整功能（包含所有医疗 API），需要：

1. 安装额外依赖
2. 实现完整的服务代码
3. 更新构建脚本以包含更多模块

详见 `src/plugin.ts` 和 `src/integrations/` 目录。
