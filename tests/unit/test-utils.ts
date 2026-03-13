#!/usr/bin/env node
/**
 * 单元测试工具
 */

// 颜色
export const c = {
  g: '\x1b[32m',  // green
  r: '\x1b[31m',  // red
  y: '\x1b[33m',  // yellow
  b: '\x1b[34m',  // blue
  c: '\x1b[36m',  // cyan
  reset: '\x1b[0m',
};

export function log(msg: string, type: 'i' | 's' | 'e' | 'w' = 'i') {
  const t = new Date().toLocaleTimeString();
  const icon = type === 's' ? '✔' : type === 'e' ? '✖' : type === 'w' ? '⚠' : 'ℹ';
  const color = type === 's' ? c.g : type === 'e' ? c.r : type === 'w' ? c.y : c.b;
  console.log(`${color}[${t}] ${icon} ${msg}${c.reset}`);
}

export interface TestCase {
  name: string;
  fn: () => Promise<void> | void;
}

export interface TestResult {
  name: string;
  ok: boolean;
  err?: string;
}

export class TestSuite {
  private tests: TestCase[] = [];
  private beforeEachFn?: () => Promise<void> | void;
  private afterEachFn?: () => Promise<void> | void;

  add(name: string, fn: () => Promise<void> | void) {
    this.tests.push({ name, fn });
  }

  beforeEach(fn: () => Promise<void> | void) {
    this.beforeEachFn = fn;
  }

  afterEach(fn: () => Promise<void> | void) {
    this.afterEachFn = fn;
  }

  async run(suiteName: string): Promise<boolean> {
    console.log(`\n${c.c}━━━ ${suiteName} ━━━${c.reset}\n`);
    
    const results: TestResult[] = [];
    
    for (const test of this.tests) {
      try {
        if (this.beforeEachFn) {
          await this.beforeEachFn();
        }
        
        await test.fn();
        results.push({ name: test.name, ok: true });
        log(`✓ ${test.name}`, 's');
        
        if (this.afterEachFn) {
          await this.afterEachFn();
        }
      } catch (e) {
        results.push({ name: test.name, ok: false, err: String(e) });
        log(`✗ ${test.name}`, 'e');
        if (e instanceof Error && e.stack) {
          log(`  ${c.r}${e.message}${c.reset}`, 'e');
        }
        
        if (this.afterEachFn) {
          try {
            await this.afterEachFn();
          } catch {
            // ignore cleanup errors
          }
        }
      }
    }
    
    // 汇总
    const passed = results.filter(r => r.ok).length;
    const total = results.length;
    
    console.log(`\n${c.b}总计: ${total} | ${c.g}通过: ${passed}${c.reset} | ${c.r}失败: ${total - passed}${c.reset}`);
    
    return passed === total;
  }
}

// 断言工具
export function assertEqual(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected}, but got ${actual}`);
  }
}

export function assertTrue(value: boolean, msg?: string) {
  if (!value) {
    throw new Error(msg || `Expected true, but got false`);
  }
}

export function assertFalse(value: boolean, msg?: string) {
  if (value) {
    throw new Error(msg || `Expected false, but got true`);
  }
}

export function assertExists(value: unknown, msg?: string) {
  if (value === null || value === undefined) {
    throw new Error(msg || `Expected value to exist, but got ${value}`);
  }
}

export function assertThrows(fn: () => void, msg?: string) {
  let thrown = false;
  try {
    fn();
  } catch {
    thrown = true;
  }
  if (!thrown) {
    throw new Error(msg || `Expected function to throw, but it did not`);
  }
}

export async function assertRejects(fn: () => Promise<unknown>, msg?: string) {
  let rejected = false;
  try {
    await fn();
  } catch {
    rejected = true;
  }
  if (!rejected) {
    throw new Error(msg || `Expected promise to reject, but it did not`);
  }
}
