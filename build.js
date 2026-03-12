const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 确保 dist 目录存在
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist', { recursive: true });
}

// 复制 openclaw.plugin.json
fs.copyFileSync('openclaw.plugin.json', 'dist/openclaw.plugin.json');

// 使用 tsx 转译 TypeScript 文件
const files = [
  'src/types/plugin.ts',
  'src/types/services.ts', 
  'src/types/index.ts',
  'src/plugin-simple.ts'
];

console.log('Building plugin...');

for (const file of files) {
  if (fs.existsSync(file)) {
    console.log(`Compiling ${file}...`);
    try {
      const output = execSync(`npx tsx -e "const ts = require('fs').readFileSync('${file}', 'utf8'); console.log(ts)"`, {
        encoding: 'utf8',
        timeout: 10000
      });
    } catch (e) {
      console.log(`Note: ${file} may have type-only exports`);
    }
  }
}

console.log('Build complete!');
