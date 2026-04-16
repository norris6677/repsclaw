/**
 * Data Paths Configuration
 * 统一数据存储路径配置
 *
 * 所有数据持久化都使用 Markdown 格式，存储在统一的目录结构下：
 * - 开发环境: {project_root}/data/
 * - 生产环境: ~/.repsclaw/data/
 *
 * 目录结构:
 * data/ 或 ~/.repsclaw/data/
 * ├── hospitals/          # 医院订阅数据 (Markdown)
 * ├── doctors/            # 医生订阅数据 (Markdown)
 * ├── news/               # 新闻缓存数据 (Markdown，按日期组织)
 * ├── cache/              # 临时缓存数据
 * │   ├── wechat/         # WeChat 搜索缓存
 * │   │   ├── rate-limit.json
 * │   │   ├── sogou-cookie.txt
 * │   │   └── content-cache/
 * │   └── search/         # 其他搜索缓存
 * └── storage/            # Crawlee 存储目录
 *     ├── key_value_stores/
 *     └── request_queues/
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * 获取项目根目录
 */
function getProjectRoot(): string {
  // 从当前文件向上查找，直到找到 package.json
  let currentDir = __dirname;
  while (currentDir !== '/') {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return process.cwd();
}

/**
 * 判断是否为开发环境
 * 开发环境：在项目目录内运行（有 package.json 且是 repsclaw）
 * 生产环境：作为插件在 OpenClaw 中运行
 */
function isDevelopment(): boolean {
  try {
    const projectRoot = getProjectRoot();
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return false;
    }
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.name === 'repsclaw';
  } catch {
    return false;
  }
}

/**
 * 获取基础数据目录
 */
function getBaseDataDir(): string {
  // 优先使用环境变量
  if (process.env.REPSCLAW_DATA_DIR) {
    return process.env.REPSCLAW_DATA_DIR;
  }

  // 开发环境：使用项目根目录下的 data/ 文件夹
  if (isDevelopment()) {
    return path.join(getProjectRoot(), 'data');
  }

  // 生产环境：使用用户主目录下的 ~/.repsclaw/data/
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir() || '/tmp';
  return path.join(homeDir, '.repsclaw', 'data');
}

// 基础目录
export const BASE_DATA_DIR = getBaseDataDir();

// 订阅数据存储目录 (Markdown)
export const SUBSCRIPTIONS_DIR = path.join(BASE_DATA_DIR, 'subscriptions');
export const HOSPITALS_DIR = path.join(SUBSCRIPTIONS_DIR, 'hospitals');
export const DOCTORS_DIR = path.join(SUBSCRIPTIONS_DIR, 'doctors');
export const NEWS_DIR = path.join(SUBSCRIPTIONS_DIR, 'news');

// Wiki 知识库目录 (LLM Wiki 模式 - Layer 2)
export const WIKI_DIR = path.join(BASE_DATA_DIR, 'wiki');
export const WIKI_HOSPITALS_DIR = path.join(WIKI_DIR, 'hospitals');
export const WIKI_DEPARTMENTS_DIR = path.join(WIKI_DIR, 'departments');
export const WIKI_DOCTORS_DIR = path.join(WIKI_DIR, 'doctors');
export const WIKI_INSIGHTS_DIR = path.join(WIKI_DIR, 'insights');
export const WIKI_RELATIONS_DIR = path.join(WIKI_DIR, 'relations');
export const WIKI_LINT_REPORTS_DIR = path.join(WIKI_DIR, 'lint-reports');

// 原始资料目录 (Layer 1: Raw Sources - 对应 methodology.md 的 sources/)
export const SOURCES_DIR = path.join(WIKI_DIR, 'sources');

// 原始资料和其他数据目录
export const WEB_PAGES_DIR = path.join(BASE_DATA_DIR, 'web-pages');

// 缓存目录
export const CACHE_DIR = path.join(BASE_DATA_DIR, 'cache');
export const WECHAT_CACHE_DIR = path.join(CACHE_DIR, 'wechat');
export const CONTENT_CACHE_DIR = path.join(WECHAT_CACHE_DIR, 'content-cache');
export const SEARCH_CACHE_DIR = path.join(CACHE_DIR, 'search');

// Crawlee 存储目录
export const CRAWLEE_STORAGE_DIR = path.join(BASE_DATA_DIR, 'storage');

// WeChat 相关文件路径
export const WECHAT_RATE_LIMIT_FILE = path.join(WECHAT_CACHE_DIR, 'rate-limit.json');
export const SOGOU_COOKIE_FILE = path.join(WECHAT_CACHE_DIR, 'sogou-cookie.txt');

/**
 * 确保所有必要的目录存在
 */
export function ensureDataDirectories(): void {
  const dirs = [
    BASE_DATA_DIR,
    SUBSCRIPTIONS_DIR,
    HOSPITALS_DIR,
    DOCTORS_DIR,
    NEWS_DIR,
    WIKI_DIR,
    WIKI_HOSPITALS_DIR,
    WIKI_DEPARTMENTS_DIR,
    WIKI_DOCTORS_DIR,
    WIKI_INSIGHTS_DIR,
    WIKI_RELATIONS_DIR,
    WIKI_LINT_REPORTS_DIR,
    SOURCES_DIR,
    WEB_PAGES_DIR,
    CACHE_DIR,
    WECHAT_CACHE_DIR,
    CONTENT_CACHE_DIR,
    SEARCH_CACHE_DIR,
    CRAWLEE_STORAGE_DIR,
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * 获取数据目录信息（用于调试）
 */
export function getDataDirInfo(): Record<string, string> {
  return {
    baseDir: BASE_DATA_DIR,
    subscriptionsDir: SUBSCRIPTIONS_DIR,
    hospitalsDir: HOSPITALS_DIR,
    doctorsDir: DOCTORS_DIR,
    newsDir: NEWS_DIR,
    wikiDir: WIKI_DIR,
    wikiHospitalsDir: WIKI_HOSPITALS_DIR,
    wikiDepartmentsDir: WIKI_DEPARTMENTS_DIR,
    wikiDoctorsDir: WIKI_DOCTORS_DIR,
    wikiInsightsDir: WIKI_INSIGHTS_DIR,
    wikiRelationsDir: WIKI_RELATIONS_DIR,
    sourcesDir: SOURCES_DIR,
    webPagesDir: WEB_PAGES_DIR,
    cacheDir: CACHE_DIR,
    wechatCacheDir: WECHAT_CACHE_DIR,
    crawleeStorageDir: CRAWLEE_STORAGE_DIR,
    isDevelopment: isDevelopment().toString(),
  };
}
