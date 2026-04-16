/**
 * Wiki Types
 * LLM Wiki 模式 - Layer 2 知识本体层类型定义
 */

export type WikiCategory = 'hospitals' | 'departments' | 'doctors' | 'insights' | 'relations';

export interface WikiPage<T extends Record<string, unknown> = Record<string, unknown>> {
  slug: string;
  frontmatter: T;
  body: string;
  filePath: string;
  updatedAt: string;
}

// ===== 医院档案 frontmatter =====
export interface HospitalWikiFrontmatter {
  name: string;
  aliases?: string[];
  type?: string;
  location?: {
    city?: string;
    district?: string;
  };
  rank?: number;
  status?: string;
  primary_contact?: string;
  bed_count?: number;
  annual_patients?: number;
  specialties?: string[];
  created_at: string;
  updated_at: string;
}

// ===== 科室档案 frontmatter =====
export interface DepartmentWikiFrontmatter {
  hospital: string;
  name: string;
  aliases?: string[];
  dept_head?: string;
  bed_count?: number;
  staff_count?: number;
  annual_patients?: number;
  focus_areas?: string[];
  created_at: string;
  updated_at: string;
}

// ===== 医生档案 frontmatter =====
export interface DoctorWikiFrontmatter {
  name: string;
  hospital: string;
  department?: string;
  title?: string;
  role?: string;
  specialties?: string[];
  education?: string;
  contact?: {
    email?: string;
    phone?: string;
  };
  created_at: string;
  updated_at: string;
}

// ===== 专题分析 frontmatter =====
export type InsightType = 'market_analysis' | 'trend_report' | 'competitive_intel' | 'meeting_summary' | 'custom';

export interface InsightWikiFrontmatter {
  title: string;
  type: InsightType;
  related_entities?: string[];
  generated_at?: string;
  source_count?: number;
  created_at: string;
  updated_at: string;
}

// ===== 关系记录 frontmatter =====
export type RelationType = 'collaboration' | 'competition' | 'affiliation' | 'mentorship' | 'other';

export interface RelationWikiFrontmatter {
  title: string;
  relation_type: RelationType;
  entities: string[];
  description?: string;
  evidence_sources?: string[];
  created_at: string;
  updated_at: string;
}

// ===== 全局索引 =====
export interface WikiIndex {
  totalHospitals: number;
  totalDepartments: number;
  totalDoctors: number;
  totalInsights: number;
  totalRelations: number;
  lastIngestAt: string | null;
  lastLintAt: string | null;
}

// ===== 操作日志 =====
export interface LogEntry {
  timestamp: string;
  action: 'ingest' | 'query' | 'lint' | 'manual';
  description: string;
  details?: Record<string, unknown>;
}

// ===== Lint 报告 =====
export interface ContradictionIssue {
  type: 'doctor_role' | 'department_name' | 'timeline' | 'other';
  entities: string[];
  description: string;
  field?: string;
  existingValue?: string;
  proposedValue?: string;
}

export interface StalePageIssue {
  category: WikiCategory;
  slug: string;
  name: string;
  lastUpdatedAt: string;
  daysSinceUpdate: number;
}

export interface OrphanPageIssue {
  category: WikiCategory;
  slug: string;
  name: string;
}

export interface MissingCoverageIssue {
  type: 'hospital' | 'department' | 'relation';
  name: string;
  reason: string;
}

export interface LintReport {
  runAt: string;
  contradictions: ContradictionIssue[];
  stalePages: StalePageIssue[];
  orphanPages: OrphanPageIssue[];
  missingCoverage: MissingCoverageIssue[];
  summary: string;
}
