/**
 * Wiki Manager Service
 * Layer 2: The Wiki - 知识本体层的存储管理
 *
 * 负责医院/科室/医生/专题/关系档案的持久化、检索、索引管理
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  WIKI_DIR,
  WIKI_HOSPITALS_DIR,
  WIKI_DEPARTMENTS_DIR,
  WIKI_DOCTORS_DIR,
  WIKI_INSIGHTS_DIR,
  WIKI_RELATIONS_DIR,
  WIKI_LINT_REPORTS_DIR,
} from '../../config/data-paths.config';
import { serializeFrontmatter, parseFrontmatter, sanitizeFilename } from '../../utils/markdown-frontmatter';
import { createLogger } from '../../utils/plugin-logger';
import type {
  WikiCategory,
  WikiPage,
  HospitalWikiFrontmatter,
  DepartmentWikiFrontmatter,
  DoctorWikiFrontmatter,
  InsightWikiFrontmatter,
  RelationWikiFrontmatter,
  WikiIndex,
  LogEntry,
} from './wiki-types';

const logger = createLogger('REPSCLAW:WIKI');

const CATEGORY_DIRS: Record<WikiCategory, string> = {
  hospitals: WIKI_HOSPITALS_DIR,
  departments: WIKI_DEPARTMENTS_DIR,
  doctors: WIKI_DOCTORS_DIR,
  insights: WIKI_INSIGHTS_DIR,
  relations: WIKI_RELATIONS_DIR,
};

const DEFAULT_INDEX: WikiIndex = {
  totalHospitals: 0,
  totalDepartments: 0,
  totalDoctors: 0,
  totalInsights: 0,
  totalRelations: 0,
  lastIngestAt: null,
  lastLintAt: null,
};

/**
 * Wiki 管理器
 */
export class WikiManager {
  private baseDir: string;

  constructor(baseDir: string = WIKI_DIR) {
    this.baseDir = baseDir;
    this.ensureDirectories();
    this.ensureIndexAndLog();
  }

  getBaseDir(): string {
    return this.baseDir;
  }

  // ==================== 目录管理 ====================

  private ensureDirectories(): void {
    const dirs = [
      this.baseDir,
      path.join(this.baseDir, 'hospitals'),
      path.join(this.baseDir, 'departments'),
      path.join(this.baseDir, 'doctors'),
      path.join(this.baseDir, 'insights'),
      path.join(this.baseDir, 'relations'),
      path.join(this.baseDir, 'lint-reports'),
    ];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private getCategoryDir(category: WikiCategory): string {
    return path.join(this.baseDir, category);
  }

  // ==================== Slug 生成 ====================

  private generateSlug(category: WikiCategory, name: string, hospital?: string): string {
    switch (category) {
      case 'hospitals':
        return sanitizeFilename(name);
      case 'departments':
        return sanitizeFilename(`${hospital || 'unknown'}_${name}`);
      case 'doctors':
        return sanitizeFilename(`${hospital || 'unknown'}_${name}`);
      case 'insights':
        return sanitizeFilename(name);
      case 'relations':
        return sanitizeFilename(name);
      default:
        return sanitizeFilename(name);
    }
  }

  private getFilePath(category: WikiCategory, slug: string): string {
    return path.join(this.getCategoryDir(category), `${slug}.md`);
  }

  // ==================== 核心 CRUD ====================

  getPage<T extends Record<string, unknown>>(category: WikiCategory, slug: string): WikiPage<T> | null {
    const filePath = this.getFilePath(category, slug);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(content);

      return {
        slug,
        frontmatter: frontmatter as T,
        body,
        filePath,
        updatedAt: (frontmatter.updated_at as string) || new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to read wiki page', { category, slug, error });
      return null;
    }
  }

  savePage<T extends Record<string, unknown>>(
    category: WikiCategory,
    slug: string,
    frontmatter: T,
    body: string
  ): WikiPage<T> {
    const filePath = this.getFilePath(category, slug);
    const now = new Date().toISOString();

    // 确保 updated_at 存在
    const fm = { ...frontmatter, updated_at: (frontmatter as any).updated_at || now };
    if (!(frontmatter as any).created_at) {
      (fm as any).created_at = now;
    }

    const markdownContent = body.trim()
      ? `${serializeFrontmatter(fm)}\n${body.trim()}\n`
      : `${serializeFrontmatter(fm)}\n`;

    try {
      fs.writeFileSync(filePath, markdownContent, 'utf-8');
      logger.info('Saved wiki page', { category, slug, filePath });
    } catch (error) {
      logger.error('Failed to save wiki page', { category, slug, error });
      throw error;
    }

    return {
      slug,
      frontmatter: fm as T,
      body: body.trim(),
      filePath,
      updatedAt: (fm as any).updated_at,
    };
  }

  deletePage(category: WikiCategory, slug: string): boolean {
    const filePath = this.getFilePath(category, slug);
    if (!fs.existsSync(filePath)) {
      return false;
    }
    try {
      fs.unlinkSync(filePath);
      logger.info('Deleted wiki page', { category, slug });
      return true;
    } catch (error) {
      logger.error('Failed to delete wiki page', { category, slug, error });
      return false;
    }
  }

  listPages(category: WikiCategory): Array<{ slug: string; title: string; updatedAt?: string }> {
    const dir = this.getCategoryDir(category);
    if (!fs.existsSync(dir)) {
      return [];
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    const results: Array<{ slug: string; title: string; updatedAt?: string }> = [];

    for (const file of files) {
      const slug = file.replace(/\.md$/, '');
      const page = this.getPage(category, slug);
      if (page) {
        let title = '';
        switch (category) {
          case 'hospitals':
            title = (page.frontmatter as HospitalWikiFrontmatter).name || slug;
            break;
          case 'departments':
            title = `${(page.frontmatter as DepartmentWikiFrontmatter).hospital}_${(page.frontmatter as DepartmentWikiFrontmatter).name}` || slug;
            break;
          case 'doctors':
            title = `${(page.frontmatter as DoctorWikiFrontmatter).name}（${(page.frontmatter as DoctorWikiFrontmatter).hospital}）` || slug;
            break;
          case 'insights':
            title = (page.frontmatter as InsightWikiFrontmatter).title || slug;
            break;
          case 'relations':
            title = (page.frontmatter as RelationWikiFrontmatter).title || slug;
            break;
        }
        results.push({
          slug,
          title,
          updatedAt: page.updatedAt,
        });
      }
    }

    return results.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }

  pageExists(category: WikiCategory, slug: string): boolean {
    return fs.existsSync(this.getFilePath(category, slug));
  }

  // ==================== 分类快捷方法 ====================

  getHospitalPage(name: string): WikiPage<HospitalWikiFrontmatter> | null {
    return this.getPage('hospitals', this.generateSlug('hospitals', name));
  }

  saveHospitalPage(name: string, frontmatter: Partial<HospitalWikiFrontmatter>, body?: string): WikiPage<HospitalWikiFrontmatter> {
    const slug = this.generateSlug('hospitals', name);
    const existing = this.getHospitalPage(name);
    const now = new Date().toISOString();

    const mergedFm: HospitalWikiFrontmatter = {
      ...(existing?.frontmatter || {}),
      ...frontmatter,
      name,
      created_at: existing?.frontmatter?.created_at || now,
      updated_at: now,
    } as HospitalWikiFrontmatter;

    const mergedBody = body !== undefined ? body : (existing?.body || `## 基本信息\n\n- **名称**: ${name}\n`);
    return this.savePage('hospitals', slug, mergedFm, mergedBody);
  }

  getDepartmentPage(hospital: string, name: string): WikiPage<DepartmentWikiFrontmatter> | null {
    return this.getPage('departments', this.generateSlug('departments', name, hospital));
  }

  saveDepartmentPage(hospital: string, name: string, frontmatter: Partial<DepartmentWikiFrontmatter>, body?: string): WikiPage<DepartmentWikiFrontmatter> {
    const slug = this.generateSlug('departments', name, hospital);
    const existing = this.getDepartmentPage(hospital, name);
    const now = new Date().toISOString();

    const mergedFm: DepartmentWikiFrontmatter = {
      ...(existing?.frontmatter || {}),
      ...frontmatter,
      hospital,
      name,
      created_at: existing?.frontmatter?.created_at || now,
      updated_at: now,
    } as DepartmentWikiFrontmatter;

    const mergedBody = body !== undefined ? body : (existing?.body || `## 科室概况\n\n- **所属医院**: ${hospital}\n- **科室名称**: ${name}\n`);
    return this.savePage('departments', slug, mergedFm, mergedBody);
  }

  getDoctorPage(hospital: string, name: string): WikiPage<DoctorWikiFrontmatter> | null {
    return this.getPage('doctors', this.generateSlug('doctors', name, hospital));
  }

  saveDoctorPage(hospital: string, name: string, frontmatter: Partial<DoctorWikiFrontmatter>, body?: string): WikiPage<DoctorWikiFrontmatter> {
    const slug = this.generateSlug('doctors', name, hospital);
    const existing = this.getDoctorPage(hospital, name);
    const now = new Date().toISOString();

    const mergedFm: DoctorWikiFrontmatter = {
      ...(existing?.frontmatter || {}),
      ...frontmatter,
      name,
      hospital,
      created_at: existing?.frontmatter?.created_at || now,
      updated_at: now,
    } as DoctorWikiFrontmatter;

    const mergedBody = body !== undefined ? body : (existing?.body || `## 基本信息\n\n- **姓名**: ${name}\n- **所属医院**: ${hospital}\n`);
    return this.savePage('doctors', slug, mergedFm, mergedBody);
  }

  getInsightPage(slug: string): WikiPage<InsightWikiFrontmatter> | null {
    return this.getPage('insights', slug);
  }

  saveInsightPage(slug: string, frontmatter: Partial<InsightWikiFrontmatter>, body: string): WikiPage<InsightWikiFrontmatter> {
    const existing = this.getInsightPage(slug);
    const now = new Date().toISOString();

    const mergedFm: InsightWikiFrontmatter = {
      ...(existing?.frontmatter || {}),
      ...frontmatter,
      created_at: existing?.frontmatter?.created_at || now,
      updated_at: now,
    } as InsightWikiFrontmatter;

    return this.savePage('insights', slug, mergedFm, body);
  }

  getRelationPage(name: string): WikiPage<RelationWikiFrontmatter> | null {
    return this.getPage('relations', this.generateSlug('relations', name));
  }

  saveRelationPage(name: string, frontmatter: Partial<RelationWikiFrontmatter>, body?: string): WikiPage<RelationWikiFrontmatter> {
    const slug = this.generateSlug('relations', name);
    const existing = this.getRelationPage(name);
    const now = new Date().toISOString();

    const mergedFm: RelationWikiFrontmatter = {
      ...(existing?.frontmatter || {}),
      ...frontmatter,
      title: name,
      created_at: existing?.frontmatter?.created_at || now,
      updated_at: now,
    } as RelationWikiFrontmatter;

    const mergedBody = body !== undefined ? body : (existing?.body || `## 关系描述\n\n`);
    return this.savePage('relations', slug, mergedFm, mergedBody);
  }

  // ==================== 索引与日志 ====================

  private getIndexPath(): string {
    return path.join(this.baseDir, 'index.md');
  }

  private getLogPath(): string {
    return path.join(this.baseDir, 'log.md');
  }

  private ensureIndexAndLog(): void {
    const indexPath = this.getIndexPath();
    if (!fs.existsSync(indexPath)) {
      this.rebuildIndex();
    }

    const logPath = this.getLogPath();
    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, '# 操作日志\n\n', 'utf-8');
    }
  }

  getIndex(): WikiIndex {
    const indexPath = this.getIndexPath();
    if (!fs.existsSync(indexPath)) {
      return { ...DEFAULT_INDEX };
    }

    try {
      const content = fs.readFileSync(indexPath, 'utf-8');
      const { frontmatter } = parseFrontmatter(content);

      return {
        totalHospitals: (frontmatter.total_hospitals as number) || 0,
        totalDepartments: (frontmatter.total_departments as number) || 0,
        totalDoctors: (frontmatter.total_doctors as number) || 0,
        totalInsights: (frontmatter.total_insights as number) || 0,
        totalRelations: (frontmatter.total_relations as number) || 0,
        lastIngestAt: (frontmatter.last_ingest_at as string) || null,
        lastLintAt: (frontmatter.last_lint_at as string) || null,
      };
    } catch (error) {
      logger.error('Failed to read wiki index', { error });
      return { ...DEFAULT_INDEX };
    }
  }

  updateIndex(updates: Partial<WikiIndex>): void {
    const existing = this.getIndex();
    const index: WikiIndex = { ...existing, ...updates };

    // 重新计算数量（防御性编程，确保统计准确）
    index.totalHospitals = this.listPages('hospitals').length;
    index.totalDepartments = this.listPages('departments').length;
    index.totalDoctors = this.listPages('doctors').length;
    index.totalInsights = this.listPages('insights').length;
    index.totalRelations = this.listPages('relations').length;

    const frontmatter = {
      total_hospitals: index.totalHospitals,
      total_departments: index.totalDepartments,
      total_doctors: index.totalDoctors,
      total_insights: index.totalInsights,
      total_relations: index.totalRelations,
      last_ingest_at: index.lastIngestAt,
      last_lint_at: index.lastLintAt,
    };

    const hospitals = this.listPages('hospitals').slice(0, 20);
    const body = `# Medical Wiki 索引\n\n## 统计概览\n\n- 医院：${index.totalHospitals} 家\n- 科室：${index.totalDepartments} 个\n- 医生：${index.totalDoctors} 人\n- 专题分析：${index.totalInsights} 篇\n- 关系记录：${index.totalRelations} 条\n- 最后更新：${index.lastIngestAt ? new Date(index.lastIngestAt).toLocaleString('zh-CN') : 'N/A'}\n\n## 重点医院\n\n${hospitals.length > 0 ? hospitals.map(h => `- [[${h.title}]]`).join('\n') : '（暂无）'}\n\n## 最近更新\n\n${index.lastIngestAt ? `- [${index.lastIngestAt}] 知识库更新` : '（暂无）'}\n`;

    fs.writeFileSync(this.getIndexPath(), `${serializeFrontmatter(frontmatter)}\n${body}\n`, 'utf-8');
    logger.info('Updated wiki index', { stats: index });
  }

  rebuildIndex(): void {
    this.updateIndex({});
  }

  appendLog(entry: LogEntry): void {
    const logPath = this.getLogPath();
    const date = entry.timestamp.split('T')[0];
    const time = entry.timestamp.split('T')[1]?.replace('Z', '').substring(0, 8) || '';

    let content = '';
    if (fs.existsSync(logPath)) {
      content = fs.readFileSync(logPath, 'utf-8');
    } else {
      content = '# 操作日志\n\n';
    }

    // 检查是否已经有今天的标题
    const dateHeader = `\n## ${date}\n\n`;
    if (!content.includes(`## ${date}`)) {
      content += dateHeader;
    }

    const actionLabel = entry.action === 'ingest' ? '[INGEST]' : entry.action === 'query' ? '[QUERY]' : entry.action === 'lint' ? '[LINT]' : '[MANUAL]';
    const detailStr = entry.details ? `\n  - 详情: ${JSON.stringify(entry.details)}` : '';
    const entryLine = `- ${time} ${actionLabel} ${entry.description}${detailStr}\n`;

    // 找到今天标题的位置，在后面插入
    const dateIndex = content.indexOf(`## ${date}`);
    const nextHeaderIndex = content.indexOf('\n## ', dateIndex + 1);
    if (nextHeaderIndex === -1) {
      content += entryLine;
    } else {
      content = content.slice(0, nextHeaderIndex) + entryLine + content.slice(nextHeaderIndex);
    }

    fs.writeFileSync(logPath, content, 'utf-8');
  }

  // ==================== 搜索 ====================

  searchPages(keyword: string, categories?: WikiCategory[]): WikiPage[] {
    const targetCategories = categories || (Object.keys(CATEGORY_DIRS) as WikiCategory[]);
    const lowerKeyword = keyword.toLowerCase();
    const results: WikiPage[] = [];

    for (const category of targetCategories) {
      const pages = this.listPages(category);
      for (const pageInfo of pages) {
        const page = this.getPage(category, pageInfo.slug);
        if (!page) continue;

        const searchText = `${JSON.stringify(page.frontmatter)} ${page.body}`.toLowerCase();
        if (searchText.includes(lowerKeyword)) {
          results.push(page);
        }
      }
    }

    return results;
  }

  // ==================== 统计 ====================

  getStats(): WikiIndex {
    return this.getIndex();
  }
}

// 导出单例
export const wikiManager = new WikiManager();
