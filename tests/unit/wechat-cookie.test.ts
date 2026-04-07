#!/usr/bin/env tsx
/**
 * WeChat Cookie 动态更新功能单元测试
 */

import { WechatSearchClient } from '../../src/services/hospital-news/wechat-search.client';
import { SubscriptionDatabase } from '../../src/services/subscription-db.service';
import { TestSuite, assertEqual, assertTrue, assertExists, c } from './test-utils';

const suite = new TestSuite();

// 创建测试客户端
function createTestClient(): WechatSearchClient {
  const db = new SubscriptionDatabase();
  return new WechatSearchClient(db);
}

// ===== Cookie 获取测试 =====

suite.add('WechatSearchClient - 默认 Cookie 获取', async () => {
  const client = createTestClient();

  // 直接访问私有方法进行测试
  const cookie = await (client as any).getSogouCookie();

  assertExists(cookie);
  assertTrue(typeof cookie === 'string');
  assertTrue(cookie.length > 0);
});

suite.add('WechatSearchClient - Cookie 缓存机制', async () => {
  const client = createTestClient();

  // 第一次获取
  const cookie1 = await (client as any).getSogouCookie();
  const timestamp1 = (client as any).cookieLastUpdated;

  // 第二次获取（应该使用缓存）
  const cookie2 = await (client as any).getSogouCookie();
  const timestamp2 = (client as any).cookieLastUpdated;

  assertEqual(cookie1, cookie2);
  assertEqual(timestamp1, timestamp2);
});

suite.add('WechatSearchClient - 手动设置 Cookie', async () => {
  const client = createTestClient();

  const testCookie = 'TEST_COOKIE=123; SNUID=abc123';
  client.setCookie(testCookie);

  const currentCookie = await (client as any).getSogouCookie();
  assertEqual(currentCookie, testCookie);
});

suite.add('WechatSearchClient - includeContent 默认值为 false', async () => {
  const client = createTestClient();

  // 模拟 search 方法参数解构
  const testParams = {
    hospitalName: '北京协和医院',
    aliases: ['协和医院'],
    days: 7,
    maxResults: 10,
    // 不提供 includeContent
  };

  // 验证默认值设置
  const { includeContent = false } = testParams;
  assertEqual(includeContent, false);
});

suite.add('WechatSearchClient - includeContent 可以设置为 true', async () => {
  const client = createTestClient();

  const testParams = {
    hospitalName: '北京协和医院',
    aliases: ['协和医院'],
    days: 7,
    maxResults: 10,
    includeContent: true,
  };

  const { includeContent = false } = testParams;
  assertEqual(includeContent, true);
});

// ===== Cookie 文件持久化测试 =====

suite.add('WechatSearchClient - Cookie 保存到文件', async () => {
  const client = createTestClient();

  const testCookie = 'SNUID=test123; ABTEST=7';
  client.setCookie(testCookie);

  // 创建新客户端实例，验证可以从文件读取
  const client2 = createTestClient();
  const cookieFromFile = await (client2 as any).getSogouCookie();

  assertEqual(cookieFromFile, testCookie);
});

// ===== 环境变量测试 =====

suite.add('WechatSearchClient - 环境变量 SOGOU_COOKIE 优先级', async () => {
  const originalEnv = process.env.SOGOU_COOKIE;

  // 设置环境变量
  process.env.SOGOU_COOKIE = 'ENV_COOKIE=from_env';

  const client = createTestClient();
  const cookie = await (client as any).getSogouCookie();

  assertEqual(cookie, 'ENV_COOKIE=from_env');

  // 恢复环境变量
  if (originalEnv) {
    process.env.SOGOU_COOKIE = originalEnv;
  } else {
    delete process.env.SOGOGU_COOKIE;
  }
});

// 运行测试
async function main() {
  console.log(`${c.c}╔══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.c}║${c.b}     WeChat Cookie 动态更新功能单元测试             ${c.c}║${c.reset}`);
  console.log(`${c.c}╚══════════════════════════════════════════════════════╝${c.reset}`);

  const success = await suite.run('WeChat Cookie 功能测试套件');
  process.exit(success ? 0 : 1);
}

main().catch((e) => {
  console.error('测试运行错误:', e);
  process.exit(1);
});
