#!/usr/bin/env tsx
/**
 * 集成测试配置
 * 从环境变量加载配置
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// 颜色
export const c = {
  g: '\x1b[32m',
  r: '\x1b[31m',
  y: '\x1b[33m',
  b: '\x1b[34m',
  c: '\x1b[36m',
  reset: '\x1b[0m',
};

export function log(msg: string, type: 'i' | 's' | 'e' | 'w' = 'i') {
  const t = new Date().toLocaleTimeString();
  const icon = type === 's' ? '✔' : type === 'e' ? '✖' : type === 'w' ? '⚠' : 'ℹ';
  const color = type === 's' ? c.g : type === 'e' ? c.r : type === 'w' ? c.y : c.b;
  console.log(`${color}[${t}] ${icon} ${msg}${c.reset}`);
}

export interface TestResult {
  name: string;
  ok: boolean;
  err?: string;
  duration?: number;
}

export interface APIConfig {
  apiKey?: string;
  baseUrl: string;
  timeout: number;
}

// API 配置
export const apiConfigs = {
  pubmed: {
    apiKey: process.env.PUBMED_API_KEY,
    baseUrl: process.env.PUBMED_BASE_URL || 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',
    timeout: 20000,
  },
  fda: {
    apiKey: process.env.FDA_API_KEY,
    baseUrl: process.env.FDA_BASE_URL || 'https://api.fda.gov/drug',
    timeout: 20000,
  },
  clinicalTrials: {
    baseUrl: process.env.CLINICAL_TRIALS_BASE_URL || 'https://clinicaltrials.gov/api/v2',
    timeout: 20000,
  },
  medicalTerminology: {
    baseUrl: process.env.MEDICAL_TERMINOLOGY_BASE_URL || 'https://clinicaltables.nlm.nih.gov/api/icd10cm/v3',
    timeout: 20000,
  },
  medrxiv: {
    baseUrl: process.env.MEDRXIV_BASE_URL || 'https://api.medrxiv.org',
    timeout: 20000,
  },
  nciBookshelf: {
    apiKey: process.env.NCBI_BOOKSHELF_API_KEY || process.env.PUBMED_API_KEY,
    baseUrl: process.env.NCBI_BOOKSHELF_BASE_URL || 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',
    timeout: 20000,
  },
  cnki: {
    apiKey: process.env.CNKI_API_KEY,
    baseUrl: process.env.CNKI_BASE_URL || '',
    timeout: 20000,
  },
};

// 断言工具
export function assertExists(value: unknown, msg?: string): void {
  if (value === null || value === undefined) {
    throw new Error(msg || `Expected value to exist, but got ${value}`);
  }
}

export function assertEqual(actual: unknown, expected: unknown, msg?: string): void {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected}, but got ${actual}`);
  }
}

export function assertTrue(value: boolean, msg?: string): void {
  if (!value) {
    throw new Error(msg || `Expected true, but got false`);
  }
}

export function assertArray(value: unknown, msg?: string): void {
  if (!Array.isArray(value)) {
    throw new Error(msg || `Expected array, but got ${typeof value}`);
  }
}

export function assertObject(value: unknown, msg?: string): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(msg || `Expected object, but got ${typeof value}`);
  }
}

// 安全解析 JSON
export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// 格式化错误
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// 延迟函数
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
