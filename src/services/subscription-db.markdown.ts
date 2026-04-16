/**
 * Markdown-based Subscription Database
 * Replaces SQLite with file system + Markdown persistence (Obsidian-style)
 *
 * 数据存储路径：使用统一的数据目录配置
 * - 开发环境: {project_root}/data/
 * - 生产环境: ~/.repsclaw/
 */

import * as path from 'path';
import * as fs from 'fs';
import { createLogger } from '../utils/plugin-logger';
import { serializeFrontmatter, parseFrontmatter, sanitizeFilename } from '../utils/markdown-frontmatter';
import type { ISubscriptionDatabase, HospitalSubscriptionDB, DoctorSubscriptionDB } from './subscription-db.interface';
import {
  BASE_DATA_DIR,
  HOSPITALS_DIR,
  DOCTORS_DIR,
  NEWS_DIR,
  ensureDataDirectories,
} from '../config/data-paths.config';

const logger = createLogger('REPSCLAW:MARKDOWN-DB');

interface ParsedFrontmatter {
  [key: string]: any;
}

interface ParsedMarkdown {
  frontmatter: ParsedFrontmatter;
  content: string;
}

/**
 * Markdown-based subscription database implementation
 */
export class MarkdownSubscriptionDatabase implements ISubscriptionDatabase {
  private baseDir: string;
  private hospitalsDir: string;
  private doctorsDir: string;
  private newsDir: string;

  constructor() {
    // 使用统一的数据目录配置
    this.baseDir = BASE_DATA_DIR;
    this.hospitalsDir = HOSPITALS_DIR;
    this.doctorsDir = DOCTORS_DIR;
    this.newsDir = NEWS_DIR;

    // 自动迁移旧目录结构（如果存在 data/hospitals/ 但没有 data/subscriptions/hospitals/）
    this.migrateLegacyDirectories();

    // Ensure directories exist
    ensureDataDirectories();

    logger.info('MarkdownSubscriptionDatabase initialized', { baseDir: this.baseDir });
  }

  /**
   * 自动迁移旧的目录结构到新的 subscriptions 目录
   */
  private migrateLegacyDirectories(): void {
    const legacyHospitalsDir = path.join(this.baseDir, 'hospitals');
    const legacyDoctorsDir = path.join(this.baseDir, 'doctors');
    const legacyNewsDir = path.join(this.baseDir, 'news');

    const migrations: Array<[string, string, string]> = [
      ['hospitals', legacyHospitalsDir, this.hospitalsDir],
      ['doctors', legacyDoctorsDir, this.doctorsDir],
      ['news', legacyNewsDir, this.newsDir],
    ];

    for (const [label, legacyDir, newDir] of migrations) {
      if (fs.existsSync(legacyDir) && !fs.existsSync(newDir)) {
        fs.mkdirSync(newDir, { recursive: true });
        const files = fs.readdirSync(legacyDir);
        let moved = 0;
        for (const file of files) {
          const src = path.join(legacyDir, file);
          const dest = path.join(newDir, file);
          fs.renameSync(src, dest);
          moved++;
        }
        // Remove empty legacy directory
        if (fs.readdirSync(legacyDir).length === 0) {
          fs.rmdirSync(legacyDir);
        }
        logger.info(`Migrated legacy ${label} directory`, { from: legacyDir, to: newDir, moved });
      }
    }
  }

  private getHospitalFilePath(name: string): string {
    return path.join(this.hospitalsDir, `${sanitizeFilename(name)}.md`);
  }

  private getDoctorFilePath(hospital: string, name: string): string {
    return path.join(this.doctorsDir, `${sanitizeFilename(hospital)}_${sanitizeFilename(name)}.md`);
  }

  private getNewsFilePath(hospitalName: string, newsId: string, publishedAt: string): string {
    const safeHospitalName = hospitalName || 'unknown';
    const safeNewsId = newsId || 'unknown';
    const date = publishedAt ? publishedAt.split('T')[0] : new Date().toISOString().split('T')[0];
    const dateDir = path.join(this.newsDir, date);

    if (!fs.existsSync(dateDir)) {
      fs.mkdirSync(dateDir, { recursive: true });
    }

    return path.join(dateDir, `${sanitizeFilename(safeHospitalName)}_${sanitizeFilename(safeNewsId)}.md`);
  }

  private readMarkdownFile(filePath: string): ParsedMarkdown | null {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(fileContent);
      return { frontmatter, content: body };
    } catch (error) {
      logger.error('Error reading markdown file', { filePath, error });
      return null;
    }
  }

  private writeMarkdownFile(filePath: string, frontmatter: ParsedFrontmatter, content: string = ''): void {
    const yaml = serializeFrontmatter(frontmatter);
    const fullContent = content ? `${yaml}\n${content}` : yaml;
    fs.writeFileSync(filePath, fullContent, 'utf-8');
  }

  private deleteMarkdownFile(filePath: string): boolean {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Error deleting markdown file', { filePath, error });
      return false;
    }
  }

  private listMarkdownFiles(dir: string): string[] {
    try {
      if (!fs.existsSync(dir)) {
        return [];
      }
      return fs.readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .map(f => path.join(dir, f));
    } catch (error) {
      logger.error('Error listing markdown files', { dir, error });
      return [];
    }
  }

  // ========== Hospital Subscription Management ==========

  subscribe(name: string, isPrimary: boolean = false): HospitalSubscriptionDB {
    const filePath = this.getHospitalFilePath(name);
    const existing = this.readMarkdownFile(filePath);

    if (existing) {
      // Update existing
      if (isPrimary) {
        this.clearAllPrimary();
        existing.frontmatter.isPrimary = true;
      }
      this.writeMarkdownFile(filePath, existing.frontmatter, existing.content);
      logger.info('Hospital already subscribed, updated', { name, isPrimary });
      return this.getByName(name)!;
    }

    // If first subscription, auto-set as primary
    if (this.getCount() === 0) {
      isPrimary = true;
    }

    // If setting as primary, clear others
    if (isPrimary) {
      this.clearAllPrimary();
    }

    const now = new Date().toISOString();
    const frontmatter = {
      name,
      isPrimary,
      subscribedAt: now,
      lastPromptedDate: null,
      lastQueryAt: null,
      departments: [],
    };

    const content = `# ${name}\n\n## 订阅信息\n\n- 订阅时间: ${now}\n- 是否主要医院: ${isPrimary ? '是' : '否'}\n`;

    this.writeMarkdownFile(filePath, frontmatter, content);
    logger.info('Subscribed to hospital', { name, isPrimary });

    return {
      id: this.hashString(name),
      name,
      isPrimary,
      subscribedAt: now,
      lastPromptedDate: null,
      lastQueryAt: null,
      departments: [],
    };
  }

  unsubscribe(name: string): boolean {
    const filePath = this.getHospitalFilePath(name);
    const parsed = this.readMarkdownFile(filePath);

    if (!parsed) return false;

    const wasPrimary = parsed.frontmatter.isPrimary;

    this.deleteMarkdownFile(filePath);

    // If unsubscribing primary, set first as primary
    if (wasPrimary) {
      const allHospitals = this.getAll();
      if (allHospitals.length > 0) {
        this.setPrimary(allHospitals[0].name);
      }
    }

    logger.info('Unsubscribed from hospital', { name });
    return true;
  }

  getAll(): HospitalSubscriptionDB[] {
    const files = this.listMarkdownFiles(this.hospitalsDir);
    const hospitals: HospitalSubscriptionDB[] = [];

    for (const file of files) {
      const parsed = this.readMarkdownFile(file);
      if (parsed) {
        hospitals.push(this.parseHospitalFrontmatter(parsed.frontmatter));
      }
    }

    // Sort by primary first, then by subscribedAt
    return hospitals.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) {
        return a.isPrimary ? -1 : 1;
      }
      return new Date(a.subscribedAt).getTime() - new Date(b.subscribedAt).getTime();
    });
  }

  getById(id: number): HospitalSubscriptionDB | null {
    // In markdown implementation, id is hash of name
    const all = this.getAll();
    return all.find(h => h.id === id) || null;
  }

  getByName(name: string): HospitalSubscriptionDB | null {
    const filePath = this.getHospitalFilePath(name);
    const parsed = this.readMarkdownFile(filePath);

    if (!parsed) {
      // Try case-insensitive search
      const all = this.getAll();
      return all.find(h => h.name.toLowerCase() === name.toLowerCase()) || null;
    }

    return this.parseHospitalFrontmatter(parsed.frontmatter);
  }

  getPrimary(): HospitalSubscriptionDB | null {
    const all = this.getAll();
    return all.find(h => h.isPrimary) || all[0] || null;
  }

  setPrimary(name: string): boolean {
    const filePath = this.getHospitalFilePath(name);
    const parsed = this.readMarkdownFile(filePath);

    if (!parsed) return false;

    this.clearAllPrimary();
    parsed.frontmatter.isPrimary = true;
    this.writeMarkdownFile(filePath, parsed.frontmatter, parsed.content);

    logger.info('Set primary hospital', { name });
    return true;
  }

  isSubscribed(name: string): boolean {
    return this.getByName(name) !== null;
  }

  getCount(): number {
    return this.listMarkdownFiles(this.hospitalsDir).length;
  }

  private clearAllPrimary(): void {
    const files = this.listMarkdownFiles(this.hospitalsDir);
    for (const file of files) {
      const parsed = this.readMarkdownFile(file);
      if (parsed && parsed.frontmatter.isPrimary) {
        parsed.frontmatter.isPrimary = false;
        this.writeMarkdownFile(file, parsed.frontmatter, parsed.content);
      }
    }
  }

  private parseHospitalFrontmatter(frontmatter: ParsedFrontmatter): HospitalSubscriptionDB {
    const name = frontmatter.name || '';
    // Ensure departments is always an array
    let departments: string[] = [];
    if (Array.isArray(frontmatter.departments)) {
      departments = frontmatter.departments;
    } else if (frontmatter.departments && typeof frontmatter.departments === 'string') {
      departments = frontmatter.departments.split(',').map(d => d.trim()).filter(Boolean);
    }
    return {
      id: this.hashString(name),
      name,
      isPrimary: frontmatter.isPrimary || false,
      subscribedAt: frontmatter.subscribedAt || new Date().toISOString(),
      lastPromptedDate: frontmatter.lastPromptedDate || null,
      lastQueryAt: frontmatter.lastQueryAt || null,
      departments,
    };
  }

  // ========== Department Subscription Management ==========

  subscribeDepartment(hospitalName: string, department: string): { success: boolean; isExisting: boolean } {
    const filePath = this.getHospitalFilePath(hospitalName);
    const parsed = this.readMarkdownFile(filePath);

    if (!parsed) return { success: false, isExisting: false };

    const departments: string[] = parsed.frontmatter.departments || [];

    if (departments.some(d => d.toLowerCase() === department.toLowerCase())) {
      return { success: true, isExisting: true };
    }

    departments.push(department);
    parsed.frontmatter.departments = departments;

    // Update content section
    let content = parsed.content;
    if (!content.includes('## 科室')) {
      content += '\n\n## 科室\n\n';
    }
    // Simple append - in real usage might want to parse and update properly
    if (!content.includes(`- ${department}`)) {
      content += `- ${department}\n`;
    }

    this.writeMarkdownFile(filePath, parsed.frontmatter, content);
    logger.info('Subscribed to department', { hospital: hospitalName, department });
    return { success: true, isExisting: false };
  }

  unsubscribeDepartment(hospitalName: string, department?: string): { success: boolean; removedAll: boolean } {
    const filePath = this.getHospitalFilePath(hospitalName);
    const parsed = this.readMarkdownFile(filePath);

    if (!parsed) return { success: false, removedAll: false };

    let departments: string[] = parsed.frontmatter.departments || [];

    if (department) {
      const originalLength = departments.length;
      departments = departments.filter(d => d.toLowerCase() !== department.toLowerCase());
      const removed = departments.length < originalLength;

      parsed.frontmatter.departments = departments;
      this.writeMarkdownFile(filePath, parsed.frontmatter, parsed.content);

      logger.info('Unsubscribed from department', { hospital: hospitalName, department });
      return { success: removed, removedAll: false };
    } else {
      const count = departments.length;
      parsed.frontmatter.departments = [];
      this.writeMarkdownFile(filePath, parsed.frontmatter, parsed.content);

      logger.info('Unsubscribed all departments', { hospital: hospitalName, count });
      return { success: count > 0, removedAll: true };
    }
  }

  getDepartments(hospitalName: string): string[] | null {
    const hospital = this.getByName(hospitalName);
    return hospital?.departments || null;
  }

  isDepartmentSubscribed(hospitalName: string, department: string): boolean {
    const departments = this.getDepartments(hospitalName);
    if (!departments) return false;
    return departments.some(d => d.toLowerCase() === department.toLowerCase());
  }

  // ========== Doctor Subscription Management ==========

  subscribeDoctor(hospitalName: string, doctorName: string, department?: string): { success: boolean; isExisting: boolean } {
    const filePath = this.getDoctorFilePath(hospitalName, doctorName);
    const existing = this.readMarkdownFile(filePath);

    if (existing) {
      // Update department if provided
      if (department) {
        existing.frontmatter.department = department;
        this.writeMarkdownFile(filePath, existing.frontmatter, existing.content);
      }
      return { success: true, isExisting: true };
    }

    // If first doctor, auto-set as primary
    const allDoctors = this.getDoctors();
    const isPrimary = allDoctors.length === 0;

    const now = new Date().toISOString();
    const frontmatter = {
      name: doctorName,
      hospital: hospitalName,
      department: department || null,
      isPrimary,
      subscribedAt: now,
    };

    const content = `# ${doctorName}\n\n## 医生信息\n\n- 所属医院: ${hospitalName}\n- 科室: ${department || '未指定'}\n- 订阅时间: ${now}\n- 是否主要医生: ${isPrimary ? '是' : '否'}\n`;

    this.writeMarkdownFile(filePath, frontmatter, content);
    logger.info('Subscribed to doctor', { hospital: hospitalName, doctor: doctorName, department });
    return { success: true, isExisting: false };
  }

  unsubscribeDoctor(hospitalName: string, doctorName: string): boolean {
    const filePath = this.getDoctorFilePath(hospitalName, doctorName);
    const deleted = this.deleteMarkdownFile(filePath);

    if (deleted) {
      logger.info('Unsubscribed from doctor', { hospital: hospitalName, doctor: doctorName });
    }

    return deleted;
  }

  getDoctors(hospitalName?: string): DoctorSubscriptionDB[] {
    const files = this.listMarkdownFiles(this.doctorsDir);
    const doctors: DoctorSubscriptionDB[] = [];

    for (const file of files) {
      const parsed = this.readMarkdownFile(file);
      if (parsed) {
        const doc = this.parseDoctorFrontmatter(parsed.frontmatter);
        if (!hospitalName || doc.hospital.toLowerCase() === hospitalName.toLowerCase()) {
          doctors.push(doc);
        }
      }
    }

    // Sort by primary first, then by subscribedAt
    return doctors.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) {
        return a.isPrimary ? -1 : 1;
      }
      return new Date(a.subscribedAt).getTime() - new Date(b.subscribedAt).getTime();
    });
  }

  getPrimaryDoctor(): DoctorSubscriptionDB | null {
    const doctors = this.getDoctors();
    return doctors.find(d => d.isPrimary) || doctors[0] || null;
  }

  isDoctorSubscribed(hospitalName: string, doctorName: string): boolean {
    const filePath = this.getDoctorFilePath(hospitalName, doctorName);
    return fs.existsSync(filePath);
  }

  setPrimaryDoctor(hospitalName: string, doctorName: string): boolean {
    // Clear all primary doctors
    const allDoctors = this.getDoctors();
    for (const doc of allDoctors) {
      if (doc.isPrimary) {
        const filePath = this.getDoctorFilePath(doc.hospital, doc.name);
        const parsed = this.readMarkdownFile(filePath);
        if (parsed) {
          parsed.frontmatter.isPrimary = false;
          this.writeMarkdownFile(filePath, parsed.frontmatter, parsed.content);
        }
      }
    }

    // Set new primary
    const filePath = this.getDoctorFilePath(hospitalName, doctorName);
    const parsed = this.readMarkdownFile(filePath);

    if (!parsed) return false;

    parsed.frontmatter.isPrimary = true;
    this.writeMarkdownFile(filePath, parsed.frontmatter, parsed.content);

    logger.info('Set primary doctor', { hospital: hospitalName, doctor: doctorName });
    return true;
  }

  private parseDoctorFrontmatter(frontmatter: ParsedFrontmatter): DoctorSubscriptionDB {
    const name = frontmatter.name || '';
    const hospital = frontmatter.hospital || '';
    return {
      id: this.hashString(`${hospital}_${name}`),
      name,
      hospital,
      department: frontmatter.department || undefined,
      isPrimary: frontmatter.isPrimary || false,
      subscribedAt: frontmatter.subscribedAt || new Date().toISOString(),
    };
  }

  // ========== Prompt Date Management ==========

  getLastPromptedDate(): string | null {
    const all = this.getAll();
    let maxDate: string | null = null;

    for (const hospital of all) {
      if (hospital.lastPromptedDate) {
        if (!maxDate || hospital.lastPromptedDate > maxDate) {
          maxDate = hospital.lastPromptedDate;
        }
      }
    }

    return maxDate;
  }

  updateLastPromptedDate(): void {
    const today = new Date().toISOString().split('T')[0];
    const allFiles = this.listMarkdownFiles(this.hospitalsDir);

    for (const file of allFiles) {
      const parsed = this.readMarkdownFile(file);
      if (parsed) {
        parsed.frontmatter.lastPromptedDate = today;
        this.writeMarkdownFile(file, parsed.frontmatter, parsed.content);
      }
    }

    logger.info('Updated last prompted date', { date: today });
  }

  hasPromptedToday(): boolean {
    const today = new Date().toISOString().split('T')[0];
    const all = this.getAll();
    return all.some(h => h.lastPromptedDate === today);
  }

  // ========== News Query Time Management ==========

  updateLastQueryTime(hospitalName: string): void {
    const filePath = this.getHospitalFilePath(hospitalName);
    const parsed = this.readMarkdownFile(filePath);

    if (parsed) {
      parsed.frontmatter.lastQueryAt = new Date().toISOString();
      this.writeMarkdownFile(filePath, parsed.frontmatter, parsed.content);
    }
  }

  getLastQueryTime(hospitalName: string): string | null {
    const hospital = this.getByName(hospitalName);
    return hospital?.lastQueryAt || null;
  }

  // ========== News Cache Management ==========

  getCachedNews(hospitalName: string, since?: Date): any[] {
    const results: any[] = [];

    // List all date directories
    if (!fs.existsSync(this.newsDir)) {
      return results;
    }

    const dateDirs = fs.readdirSync(this.newsDir);

    for (const dateDir of dateDirs) {
      const datePath = path.join(this.newsDir, dateDir);
      if (!fs.statSync(datePath).isDirectory()) continue;

      const files = fs.readdirSync(datePath)
        .filter(f => f.endsWith('.md') && f.startsWith(sanitizeFilename(hospitalName)));

      for (const file of files) {
        const filePath = path.join(datePath, file);
        const parsed = this.readMarkdownFile(filePath);

        if (parsed) {
          const fetchedAt = parsed.frontmatter.fetchedAt;
          if (!since || !fetchedAt || new Date(fetchedAt) > since) {
            results.push({
              id: parsed.frontmatter.id,
              hospitalName: parsed.frontmatter.hospitalName,
              sourceType: parsed.frontmatter.sourceType,
              title: parsed.frontmatter.title,
              summary: parsed.frontmatter.summary,
              originalUrl: parsed.frontmatter.originalUrl,
              publishedAt: parsed.frontmatter.publishedAt,
              fetchedAt: parsed.frontmatter.fetchedAt,
              relevanceScore: parsed.frontmatter.relevanceScore,
              sentiment: parsed.frontmatter.sentiment,
              categories: parsed.frontmatter.categories || [],
              ...JSON.parse(parsed.frontmatter.data || '{}'),
            });
          }
        }
      }
    }

    return results.sort((a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }

  cacheNews(items: any[]): void {
    for (const item of items) {
      if (!item || !item.id) {
        logger.warn('Skipping cache for item without id', { item });
        continue;
      }

      const hospitalName = item.hospitalName || item.hospital || 'unknown';
      const frontmatter = {
        id: item.id,
        hospitalName,
        sourceType: item.source?.type || item.sourceType,
        title: item.title,
        summary: item.summary,
        originalUrl: item.originalUrl,
        publishedAt: item.publishedAt,
        fetchedAt: new Date().toISOString(),
        relevanceScore: item.relevanceScore,
        sentiment: item.sentiment,
        categories: Array.isArray(item.categories) ? item.categories : [],
        data: JSON.stringify(item),
      };

      const filePath = this.getNewsFilePath(
        hospitalName,
        item.id,
        item.publishedAt
      );

      const content = `# ${item.title || '无标题'}\n\n## 摘要\n\n${item.summary || ''}\n\n## 链接\n\n[原文链接](${item.originalUrl || ''})\n\n## 元数据\n\n- 来源: ${item.source?.name || item.sourceType || 'unknown'}\n- 发布于: ${item.publishedAt || ''}\n- 相关度: ${item.relevanceScore || 0}\n- 情感: ${item.sentiment || 'neutral'}\n`;

      this.writeMarkdownFile(filePath, frontmatter, content);
    }

    logger.debug('Cached news items', { count: items.length });
  }

  cleanExpiredCache(maxAgeHours: number = 48): number {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    let deleted = 0;

    if (!fs.existsSync(this.newsDir)) {
      return deleted;
    }

    const dateDirs = fs.readdirSync(this.newsDir);

    for (const dateDir of dateDirs) {
      const datePath = path.join(this.newsDir, dateDir);
      if (!fs.statSync(datePath).isDirectory()) continue;

      const files = fs.readdirSync(datePath).filter(f => f.endsWith('.md'));

      for (const file of files) {
        const filePath = path.join(datePath, file);
        const parsed = this.readMarkdownFile(filePath);

        if (parsed) {
          const fetchedAt = parsed.frontmatter.fetchedAt;
          if (fetchedAt && new Date(fetchedAt) < cutoff) {
            fs.unlinkSync(filePath);
            deleted++;
          }
        }
      }

      // Remove empty date directories
      const remaining = fs.readdirSync(datePath);
      if (remaining.length === 0) {
        fs.rmdirSync(datePath);
      }
    }

    logger.info('Cleaned expired cache', { deleted, maxAgeHours });
    return deleted;
  }

  // ========== Statistics ==========

  getStats(): { totalHospitals: number; totalDepartments: number; totalDoctors: number; primary: string | null; cacheSize: number } {
    const hospitals = this.getAll();
    const doctors = this.getDoctors();
    const primary = this.getPrimary();

    let totalDepartments = 0;
    for (const h of hospitals) {
      totalDepartments += h.departments?.length || 0;
    }

    // Count cache files
    let cacheSize = 0;
    if (fs.existsSync(this.newsDir)) {
      const dateDirs = fs.readdirSync(this.newsDir);
      for (const dateDir of dateDirs) {
        const datePath = path.join(this.newsDir, dateDir);
        if (fs.statSync(datePath).isDirectory()) {
          cacheSize += fs.readdirSync(datePath).filter(f => f.endsWith('.md')).length;
        }
      }
    }

    return {
      totalHospitals: hospitals.length,
      totalDepartments,
      totalDoctors: doctors.length,
      primary: primary?.name || null,
      cacheSize,
    };
  }

  // ========== Lifecycle ==========

  close(): void {
    logger.info('MarkdownSubscriptionDatabase closed');
  }

  // ========== Helper Methods ==========

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

// Export singleton (backward compatibility)
export const subscriptionDB: ISubscriptionDatabase = new MarkdownSubscriptionDatabase();

// Re-export interface types
export type { ISubscriptionDatabase, HospitalSubscriptionDB } from './subscription-db.interface';
