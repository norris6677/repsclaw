/**
 * Wiki Lint Service
 * 定期健康检查：矛盾检测、过期标记、孤儿页面、缺失补全
 */

import * as path from 'path';
import * as fs from 'fs';
import { WikiManager } from './wiki-manager.service';
import { createLogger } from '../../utils/plugin-logger';
import { serializeFrontmatter } from '../../utils/markdown-frontmatter';
import { BASE_DATA_DIR, WIKI_LINT_REPORTS_DIR } from '../../config/data-paths.config';
import type {
  WikiCategory,
  LintReport,
  ContradictionIssue,
  StalePageIssue,
  OrphanPageIssue,
  MissingCoverageIssue,
} from './wiki-types';

const logger = createLogger('REPSCLAW:WIKI-LINT');

const STALE_DAYS = 180; // 6个月

export class WikiLintService {
  constructor(private wikiManager: WikiManager) {}

  async runLint(): Promise<LintReport> {
    logger.info('Starting wiki lint');

    const contradictions = this.checkContradictions();
    const stalePages = this.checkStalePages();
    const orphanPages = this.checkOrphanPages();
    const missingCoverage = this.checkMissingCoverage();

    const report: LintReport = {
      runAt: new Date().toISOString(),
      contradictions,
      stalePages,
      orphanPages,
      missingCoverage,
      summary: `本次检查共发现 ${contradictions.length} 个矛盾, ${stalePages.length} 个过期页面, ${orphanPages.length} 个孤儿页面, ${missingCoverage.length} 个缺失项。`,
    };

    // 保存报告
    this.saveLintReport(report);

    // 更新索引和日志
    this.wikiManager.updateIndex({ lastLintAt: report.runAt });
    this.wikiManager.appendLog({
      timestamp: report.runAt,
      action: 'lint',
      description: report.summary,
      details: {
        contradictions: contradictions.length,
        stalePages: stalePages.length,
        orphanPages: orphanPages.length,
        missingCoverage: missingCoverage.length,
      },
    });

    logger.info('Wiki lint completed', {
      contradictions: contradictions.length,
      stalePages: stalePages.length,
      orphanPages: orphanPages.length,
      missingCoverage: missingCoverage.length,
    });

    return report;
  }

  // ==================== 矛盾检测 ====================

  private checkContradictions(): ContradictionIssue[] {
    const issues: ContradictionIssue[] = [];

    const doctors = this.wikiManager.listPages('doctors');
    const doctorPages = doctors
      .map(d => this.wikiManager.getDoctorPage(
        d.slug.split('_')[0].replace(/_/g, ' '),
        d.slug.split('_').slice(1).join('_').replace(/_/g, ' ')
      ))
      .filter(Boolean);

    // 检测同一医生在不同医院任主任
    const roleMap = new Map<string, Array<{ hospital: string; role: string }>>();
    for (const doc of doctorPages) {
      if (!doc) continue;
      const name = doc.frontmatter.name;
      const role = doc.frontmatter.role || '';
      if (role.includes('主任') || role.includes('负责人')) {
        if (!roleMap.has(name)) roleMap.set(name, []);
        roleMap.get(name)!.push({ hospital: doc.frontmatter.hospital, role });
      }
    }

    for (const [name, entries] of roleMap) {
      if (entries.length > 1) {
        issues.push({
          type: 'doctor_role',
          entities: entries.map(e => `${e.hospital}_${name}`),
          description: `医生 "${name}" 在多家医院担任主任/负责人角色`,
          field: 'role',
        });
      }
    }

    // 检测医生档案与科室档案的科室名称不一致
    for (const doc of doctorPages) {
      if (!doc || !doc.frontmatter.department) continue;
      const deptPage = this.wikiManager.getDepartmentPage(doc.frontmatter.hospital, doc.frontmatter.department);
      if (!deptPage) {
        // 科室不存在
        issues.push({
          type: 'other',
          entities: [doc.frontmatter.hospital, doc.frontmatter.name],
          description: `医生 "${doc.frontmatter.name}" 所属科室 "${doc.frontmatter.department}" 在 Wiki 中不存在`,
          field: 'department',
        });
      }
    }

    return issues;
  }

  // ==================== 过期标记 ====================

  private checkStalePages(): StalePageIssue[] {
    const issues: StalePageIssue[] = [];
    const now = Date.now();
    const cutoff = now - STALE_DAYS * 24 * 60 * 60 * 1000;

    const categories: WikiCategory[] = ['hospitals', 'departments', 'doctors', 'insights', 'relations'];

    for (const category of categories) {
      const pages = this.wikiManager.listPages(category);
      for (const page of pages) {
        if (!page.updatedAt) continue;
        const updatedAt = new Date(page.updatedAt).getTime();
        if (updatedAt < cutoff) {
          issues.push({
            category,
            slug: page.slug,
            name: page.title,
            lastUpdatedAt: page.updatedAt,
            daysSinceUpdate: Math.floor((now - updatedAt) / (24 * 60 * 60 * 1000)),
          });
        }
      }
    }

    return issues;
  }

  // ==================== 孤儿页面 ====================

  private checkOrphanPages(): OrphanPageIssue[] {
    const issues: OrphanPageIssue[] = [];

    // 收集所有被引用的 slugs
    const referencedSlugs = new Set<string>();

    const categories: WikiCategory[] = ['hospitals', 'departments', 'doctors', 'insights', 'relations'];
    const allBodies: string[] = [];

    for (const category of categories) {
      const pages = this.wikiManager.listPages(category);
      for (const p of pages) {
        const page = this.wikiManager.getPage(category, p.slug);
        if (page) {
          allBodies.push(page.body);
        }
      }
    }

    const index = this.wikiManager.getIndex();
    // index 本身引用不算，但其他页面的 body 引用算

    const allText = allBodies.join('\n');

    // 检查医生页面
    const doctors = this.wikiManager.listPages('doctors');
    for (const doc of doctors) {
      const searchName = doc.title.replace(/（.*?）/g, '').trim();
      if (!allText.includes(searchName) || allBodies.filter(b => b.includes(searchName)).length <= 1) {
        issues.push({
          category: 'doctors',
          slug: doc.slug,
          name: doc.title,
        });
      }
    }

    // 检查科室页面
    const departments = this.wikiManager.listPages('departments');
    for (const dept of departments) {
      const searchName = dept.title.replace(/_/g, '');
      if (!allText.includes(searchName) || allBodies.filter(b => b.includes(searchName)).length <= 1) {
        issues.push({
          category: 'departments',
          slug: dept.slug,
          name: dept.title,
        });
      }
    }

    // 检查 insights
    const insights = this.wikiManager.listPages('insights');
    for (const insight of insights) {
      if (!allText.includes(insight.title)) {
        issues.push({
          category: 'insights',
          slug: insight.slug,
          name: insight.title,
        });
      }
    }

    return issues;
  }

  // ==================== 缺失补全 ====================

  private checkMissingCoverage(): MissingCoverageIssue[] {
    const issues: MissingCoverageIssue[] = [];

    // 已订阅的医院应该有 Wiki 档案
    // 这里通过读取 subscriptions 目录来检查
    const subsHospitalsDir = path.join(BASE_DATA_DIR, 'subscriptions', 'hospitals');

    if (fs.existsSync(subsHospitalsDir)) {
      const files = fs.readdirSync(subsHospitalsDir).filter((f: string) => f.endsWith('.md'));
      for (const file of files) {
        const name = file.replace(/\.md$/, '').replace(/_/g, ' ');
        if (!this.wikiManager.getHospitalPage(name)) {
          issues.push({
            type: 'hospital',
            name,
            reason: '已订阅但缺少 Wiki 档案',
          });
        }
      }
    }

    return issues;
  }

  // ==================== 报告保存 ====================

  private saveLintReport(report: LintReport): void {
    const month = report.runAt.substring(0, 7); // YYYY-MM
    const filePath = path.join(this.wikiManager.getBaseDir(), 'lint-reports', `${month}.md`);

    const frontmatter = {
      run_at: report.runAt,
      contradictions: report.contradictions.length,
      stale_pages: report.stalePages.length,
      orphan_pages: report.orphanPages.length,
      missing_coverage: report.missingCoverage.length,
    };

    let body = `# 知识库健康检查报告 (${month})\n\n${report.summary}\n\n`;

    body += `## 矛盾检测 (${report.contradictions.length})\n\n`;
    if (report.contradictions.length === 0) {
      body += '未发现矛盾。\n\n';
    } else {
      for (const issue of report.contradictions) {
        body += `- **${issue.type}**: ${issue.description}\n  - 涉及: ${issue.entities.join(', ')}\n`;
      }
      body += '\n';
    }

    body += `## 过期页面 (${report.stalePages.length})\n\n`;
    if (report.stalePages.length === 0) {
      body += '无过期页面。\n\n';
    } else {
      for (const issue of report.stalePages) {
        body += `- [[${issue.name}]] (${issue.category}) - ${issue.daysSinceUpdate} 天未更新\n`;
      }
      body += '\n';
    }

    body += `## 孤儿页面 (${report.orphanPages.length})\n\n`;
    if (report.orphanPages.length === 0) {
      body += '无孤儿页面。\n\n';
    } else {
      for (const issue of report.orphanPages) {
        body += `- [[${issue.name}]] (${issue.category})\n`;
      }
      body += '\n';
    }

    body += `## 缺失补全 (${report.missingCoverage.length})\n\n`;
    if (report.missingCoverage.length === 0) {
      body += '无缺失项。\n\n';
    } else {
      for (const issue of report.missingCoverage) {
        body += `- **${issue.type}**: ${issue.name} - ${issue.reason}\n`;
      }
      body += '\n';
    }

    fs.writeFileSync(filePath, `${serializeFrontmatter(frontmatter)}\n${body}`, 'utf-8');
  }
}
