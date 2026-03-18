# 备份文件说明

## 备份时间
2026-03-17

## 备份原因
这些文件是过时的 CommonJS 入口文件，OpenClaw 现在直接使用 TypeScript 入口 `index.ts`。

## 备份内容

### index.js.bak
旧的 CommonJS 入口文件，内容：
```javascript
const { RepsclawPlugin } = require('./dist/plugin.js');
module.exports = RepsclawPlugin;
module.exports.default = RepsclawPlugin;
```

问题：引用了不存在的 `./dist/plugin.js` 文件

### dist/
旧的构建输出目录，包含：
- index.js (718 bytes)
- openclaw.plugin.json

缺少 plugin.js 文件，导致 index.js 无法正常加载。

## 当前方案
使用 TypeScript 直接运行：
- 入口: `index.ts`
- 配置: `package.json` 中的 `openclaw.extensions: ["./index.ts"]`

## 恢复方法
如需恢复 CommonJS 支持：
1. 复制 index.js.bak 到 ../index.js
2. 复制 dist/ 目录到 ../dist/
3. 运行 `npm run build` 生成完整的 dist/plugin.js
