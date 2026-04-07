#!/usr/bin/env tsx
/**
 * HTTP Real Test Infrastructure
 * Shared test infrastructure for both local and virtual test modes
 */

import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { VirtualTestServer } from './server/virtual-server';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Test mode configuration
export const TEST_MODE = (process.env.REPSCLAW_TEST_MODE || 'virtual') as 'local' | 'virtual';

// Server configuration
const TEST_HOST = process.env.REPSCLAW_TEST_HOST || '127.0.0.1';
const TEST_PORT = parseInt(process.env.REPSCLAW_TEST_PORT || '3001', 10);

// Base URL for HTTP requests
export const TEST_BASE_URL = TEST_MODE === 'virtual'
  ? `http://${TEST_HOST}:${TEST_PORT}`
  : (process.env.REPSCLAW_TEST_URL || 'http://localhost:3000');

// Test timeout
export const TEST_TIMEOUT = 60000; // 60 seconds for real HTTP calls

// Virtual server instance (only used in virtual mode)
let virtualServer: VirtualTestServer | null = null;

/**
 * Start test environment
 * - Virtual mode: starts virtual server
 * - Local mode: assumes server is already running
 */
export async function startTestEnvironment(): Promise<string> {
  console.log(`[Test Environment] Mode: ${TEST_MODE}`);
  console.log(`[Test Environment] Base URL: ${TEST_BASE_URL}`);

  if (TEST_MODE === 'virtual') {
    virtualServer = new VirtualTestServer({
      port: TEST_PORT,
      host: TEST_HOST,
    });

    await virtualServer.initialize();
    await virtualServer.start();

    console.log(`[Test Environment] Virtual server started at ${virtualServer.getUrl()}`);

    // Wait a bit for server to be fully ready
    await sleep(500);

    return virtualServer.getUrl();
  } else {
    // Local mode: verify server is running
    try {
      await httpRequest('/api/repsclaw/health');
      console.log('[Test Environment] Connected to local server');
    } catch (error) {
      throw new Error(
        `Local server not running at ${TEST_BASE_URL}. ` +
        `Please start OpenClaw server or switch to virtual mode (REPSCLAW_TEST_MODE=virtual)`
      );
    }

    return TEST_BASE_URL;
  }
}

/**
 * Stop test environment
 */
export async function stopTestEnvironment(): Promise<void> {
  if (virtualServer) {
    await virtualServer.stop();
    virtualServer = null;
    console.log('[Test Environment] Virtual server stopped');
  }
}

/**
 * HTTP response type
 */
export interface HttpResponse {
  statusCode: number;
  data: any;
  headers: http.IncomingHttpHeaders;
}

/**
 * HTTP request utility
 */
export async function httpRequest(
  path: string,
  method: string = 'GET',
  query?: Record<string, string>,
  body?: unknown
): Promise<HttpResponse> {
  const url = new URL(path, TEST_BASE_URL);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });
  }

  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      timeout: TEST_TIMEOUT,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    };

    const req = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = data ? JSON.parse(data) : null;
          resolve({
            statusCode: res.statusCode || 0,
            data: parsedData,
            headers: res.headers,
          });
        } catch {
          resolve({
            statusCode: res.statusCode || 0,
            data: data,
            headers: res.headers,
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body && (method === 'POST' || method === 'PUT')) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * Test result type
 */
export interface TestResult {
  name: string;
  ok: boolean;
  err?: string;
  duration?: number;
}

/**
 * Test case type
 */
export interface TestCase {
  name: string;
  fn: () => Promise<void>;
  critical?: boolean;
}

/**
 * Run a single test
 */
export async function runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, ok: true, duration: Date.now() - start };
  } catch (error) {
    return {
      name,
      ok: false,
      err: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

/**
 * Run test suite
 */
export async function runTestSuite(
  suiteName: string,
  tests: TestCase[],
  options: {
    beforeAll?: () => Promise<void>;
    afterAll?: () => Promise<void>;
    beforeEach?: () => Promise<void>;
    afterEach?: () => Promise<void>;
  } = {}
): Promise<{ passed: number; failed: number; results: TestResult[] }> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Test Suite: ${suiteName}`);
  console.log(`Mode: ${TEST_MODE}`);
  console.log(`${'='.repeat(60)}\n`);

  // Run beforeAll
  if (options.beforeAll) {
    try {
      await options.beforeAll();
    } catch (error) {
      console.error('beforeAll failed:', error);
      return { passed: 0, failed: tests.length, results: [] };
    }
  }

  const results: TestResult[] = [];
  let criticalFailed = false;

  for (const test of tests) {
    if (criticalFailed && !test.critical) {
      console.log(`\n[SKIP] ${test.name} (critical test failed)`);
      results.push({ name: test.name, ok: false, err: 'Skipped due to critical failure' });
      continue;
    }

    console.log(`\n[TEST] ${test.name}`);

    // Run beforeEach
    if (options.beforeEach) {
      try {
        await options.beforeEach();
      } catch (error) {
        console.error('  beforeEach failed:', error);
        results.push({ name: test.name, ok: false, err: 'beforeEach failed' });
        if (test.critical) criticalFailed = true;
        continue;
      }
    }

    // Run test
    const result = await runTest(test.name, test.fn);
    results.push(result);

    if (result.ok) {
      console.log(`  ✓ PASS (${result.duration}ms)`);
    } else {
      console.log(`  ✗ FAIL: ${result.err}`);
      if (test.critical) {
        criticalFailed = true;
        console.log('  ! Critical test failed, subsequent tests may be skipped');
      }
    }

    // Run afterEach
    if (options.afterEach) {
      try {
        await options.afterEach();
      } catch (error) {
        console.error('  afterEach failed:', error);
      }
    }
  }

  // Run afterAll
  if (options.afterAll) {
    try {
      await options.afterAll();
    } catch (error) {
      console.error('afterAll failed:', error);
    }
  }

  // Summary
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(60)}\n`);

  return { passed, failed, results };
}

// Utility functions
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Assertion utilities
export function assertEqual(actual: unknown, expected: unknown, msg?: string): void {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected}, but got ${actual}`);
  }
}

export function assertExists(value: unknown, msg?: string): void {
  if (value === null || value === undefined) {
    throw new Error(msg || `Expected value to exist, but got ${value}`);
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

// Logging utilities
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
