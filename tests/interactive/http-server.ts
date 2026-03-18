#!/usr/bin/env tsx
/**
 * 方案 2: HTTP API + Web 界面
 * 启动本地服务器，通过浏览器进行交互测试
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import { HospitalSubscriptionService } from '../../src/services/hospital-subscription.service';
import {
  createSubscribeHospitalHandler,
  createListHospitalsHandler,
  createUnsubscribeHospitalHandler,
  createSetPrimaryHospitalHandler,
  createCheckSubscriptionStatusHandler,
} from '../../src/tools/hospital-subscription.tool';
import chalk from 'chalk';

const PORT = 3456;

// 测试数据目录
const testDir = path.join(process.cwd(), 'tmp-test-http');
const testStoragePath = path.join(testDir, 'hospital-subscriptions.json');

function createTestService(): HospitalSubscriptionService {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  const service = new HospitalSubscriptionService();
  // @ts-ignore
  service['storagePath'] = testStoragePath;
  // @ts-ignore
  service['data'] = { hospitals: [], lastPromptedDate: null };
  return service;
}

const service = createTestService();
const subscribeHandler = createSubscribeHospitalHandler(service);
const listHandler = createListHospitalsHandler(service);
const unsubscribeHandler = createUnsubscribeHospitalHandler(service);
const setPrimaryHandler = createSetPrimaryHospitalHandler(service);
const checkStatusHandler = createCheckSubscriptionStatusHandler(service);

// HTML 页面内容
const HTML_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>医院订阅功能 - 交互测试</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 { font-size: 28px; margin-bottom: 8px; }
        .header p { opacity: 0.9; }
        .content { padding: 30px; }
        .section { margin-bottom: 30px; }
        .section-title {
            font-size: 18px;
            font-weight: 600;
            color: #333;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .input-group {
            display: flex;
            gap: 10px;
            margin-bottom: 10px;
        }
        input[type="text"] {
            flex: 1;
            padding: 12px 16px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        input[type="text"]:focus {
            outline: none;
            border-color: #667eea;
        }
        button {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.3s;
            font-weight: 500;
        }
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4); }
        .btn-danger { background: #ff4757; color: white; }
        .btn-danger:hover { background: #ff3838; }
        .btn-secondary { background: #f1f2f6; color: #333; }
        .btn-secondary:hover { background: #dfe4ea; }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 12px;
            text-align: center;
        }
        .stat-value {
            font-size: 32px;
            font-weight: 700;
            color: #667eea;
        }
        .stat-label {
            color: #666;
            font-size: 14px;
            margin-top: 5px;
        }

        .hospital-list {
            list-style: none;
        }
        .hospital-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 10px;
            margin-bottom: 10px;
            transition: all 0.3s;
        }
        .hospital-item:hover { background: #e9ecef; }
        .hospital-item.primary {
            background: linear-gradient(135deg, #667eea20 0%, #764ba220 100%);
            border: 2px solid #667eea;
        }
        .hospital-info { display: flex; align-items: center; gap: 12px; }
        .hospital-icon { font-size: 24px; }
        .hospital-name { font-weight: 500; }
        .hospital-tag {
            background: #667eea;
            color: white;
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 12px;
        }
        .hospital-actions { display: flex; gap: 8px; }
        .hospital-actions button {
            padding: 8px 16px;
            font-size: 14px;
        }

        .result-panel {
            background: #1a1a2e;
            color: #00ff88;
            padding: 20px;
            border-radius: 10px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            overflow-x: auto;
            margin-top: 20px;
        }
        .result-panel.error { color: #ff6b6b; }

        .quick-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }
        .quick-actions button { padding: 8px 16px; font-size: 14px; }

        .empty-state {
            text-align: center;
            padding: 40px;
            color: #999;
        }
        .empty-state-icon { font-size: 48px; margin-bottom: 10px; }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 10px;
        }
        .checkbox-group input[type="checkbox"] {
            width: 18px;
            height: 18px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏥 医院订阅功能测试</h1>
            <p>无需部署到 OpenClaw，本地即可测试完整交互体验</p>
        </div>

        <div class="content">
            <!-- 统计信息 -->
            <div class="section">
                <div class="section-title">📊 订阅统计</div>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value" id="total-count">0</div>
                        <div class="stat-label">订阅医院</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="primary-hospital">-</div>
                        <div class="stat-label">主要医院</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="is-first">是</div>
                        <div class="stat-label">首次使用</div>
                    </div>
                </div>
                <button class="btn-secondary" onclick="checkStatus()">🔄 刷新状态</button>
            </div>

            <!-- 订阅医院 -->
            <div class="section">
                <div class="section-title">➕ 订阅新医院</div>
                <div class="input-group">
                    <input type="text" id="subscribe-input" placeholder="输入医院名称，如：北京协和医院">
                    <button class="btn-primary" onclick="subscribe()">订阅</button>
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="primary-check">
                    <label for="primary-check">设为默认医院</label>
                </div>
            </div>

            <!-- 快速操作 -->
            <div class="section">
                <div class="section-title">⚡ 快速测试数据</div>
                <div class="quick-actions">
                    <button class="btn-secondary" onclick="quickSubscribe('北京协和医院')">+ 北京协和</button>
                    <button class="btn-secondary" onclick="quickSubscribe('上海华山医院')">+ 上海华山</button>
                    <button class="btn-secondary" onclick="quickSubscribe('广州中山医院')">+ 广州中山</button>
                    <button class="btn-secondary" onclick="quickSubscribe('四川大学华西医院')">+ 成都华西</button>
                    <button class="btn-danger" onclick="clearAll()">🗑️ 清空全部</button>
                </div>
            </div>

            <!-- 订阅列表 -->
            <div class="section">
                <div class="section-title">📋 我的订阅</div>
                <ul class="hospital-list" id="hospital-list">
                    <li class="empty-state">
                        <div class="empty-state-icon">🏥</div>
                        <div>暂无订阅的医院</div>
                    </li>
                </ul>
            </div>

            <!-- 结果面板 -->
            <div class="section">
                <div class="section-title">📝 操作日志</div>
                <pre class="result-panel" id="result-panel">等待操作...</pre>
            </div>
        </div>
    </div>

    <script>
        let hospitals = [];
        let primary = null;

        async function apiCall(endpoint, data = {}) {
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                showResult(result);
                return result;
            } catch (error) {
                showResult({ error: error.message }, true);
            }
        }

        function showResult(result, isError = false) {
            const panel = document.getElementById('result-panel');
            panel.textContent = JSON.stringify(result, null, 2);
            panel.className = 'result-panel' + (isError ? ' error' : '');
        }

        function updateUI(data) {
            hospitals = data.hospitals || [];
            primary = data.primary;

            // 更新统计
            document.getElementById('total-count').textContent = hospitals.length;
            document.getElementById('primary-hospital').textContent = primary || '-';

            // 更新列表
            const list = document.getElementById('hospital-list');
            if (hospitals.length === 0) {
                list.innerHTML = \`
                    <li class="empty-state">
                        <div class="empty-state-icon">🏥</div>
                        <div>暂无订阅的医院</div>
                    </li>
                \`;
            } else {
                list.innerHTML = hospitals.map(h => \`
                    <li class="hospital-item \${h.name === primary ? 'primary' : ''}">
                        <div class="hospital-info">
                            <span class="hospital-icon">🏥</span>
                            <span class="hospital-name">\${h.name}</span>
                            \${h.name === primary ? '<span class="hospital-tag">默认</span>' : ''}
                        </div>
                        <div class="hospital-actions">
                            \${h.name !== primary ? \`<button class="btn-secondary" onclick="setPrimary('\${h.name}')">设为默认</button>\` : ''}
                            <button class="btn-danger" onclick="unsubscribe('\${h.name}')">取消订阅</button>
                        </div>
                    </li>
                \`).join('');
            }
        }

        async function subscribe() {
            const input = document.getElementById('subscribe-input');
            const name = input.value.trim();
            if (!name) return alert('请输入医院名称');

            const isPrimary = document.getElementById('primary-check').checked;
            const result = await apiCall('/api/subscribe', { name, isPrimary });
            if (result.status === 'success') {
                input.value = '';
                updateUI(result.data);
            }
        }

        async function quickSubscribe(name) {
            const result = await apiCall('/api/subscribe', { name });
            if (result.status === 'success') {
                updateUI(result.data);
            }
        }

        async function unsubscribe(name) {
            if (!confirm(\`确定要取消订阅 \${name} 吗？\`)) return;
            const result = await apiCall('/api/unsubscribe', { name });
            if (result.status === 'success') {
                await listHospitals();
            }
        }

        async function setPrimary(name) {
            const result = await apiCall('/api/set-primary', { name });
            if (result.status === 'success') {
                await listHospitals();
            }
        }

        async function listHospitals() {
            const result = await apiCall('/api/list', {});
            if (result.status === 'success') {
                updateUI(result.data);
            }
        }

        async function checkStatus() {
            const result = await apiCall('/api/status', {});
            if (result.status === 'success') {
                document.getElementById('is-first').textContent = result.data.isFirstTime ? '是' : '否';
            }
        }

        async function clearAll() {
            if (!confirm('确定要清空所有订阅数据吗？')) return;
            await apiCall('/api/clear', {});
            await listHospitals();
            await checkStatus();
        }

        // 回车键订阅
        document.getElementById('subscribe-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') subscribe();
        });

        // 初始化
        listHospitals();
        checkStatus();
    </script>
</body>
</html>
`;

// 创建 HTTP 服务器
const server = http.createServer(async (req, res) => {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  // 主页
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML_PAGE);
    return;
  }

  // API 路由
  if (url.pathname.startsWith('/api/')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    await new Promise<void>(resolve => req.on('end', resolve));

    const data = body ? JSON.parse(body) : {};
    let result: any;

    try {
      switch (url.pathname) {
        case '/api/subscribe':
          result = await subscribeHandler(data);
          break;
        case '/api/unsubscribe':
          result = await unsubscribeHandler(data);
          break;
        case '/api/list':
          result = await listHandler(data);
          break;
        case '/api/set-primary':
          result = await setPrimaryHandler(data);
          break;
        case '/api/status':
          result = await checkStatusHandler(data);
          break;
        case '/api/clear':
          // @ts-ignore
          service['data'] = { hospitals: [], lastPromptedDate: null };
          // @ts-ignore
          service['saveData']();
          result = { status: 'success', message: '数据已清空' };
          break;
        default:
          result = { status: 'error', error: { message: '未知 API' } };
      }
    } catch (error: any) {
      result = { status: 'error', error: { message: error.message } };
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

function printBanner() {
  console.log(chalk.cyan.bold('╔════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║') + chalk.white.bold('      🌐 HTTP API + Web 界面测试服务器                 ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.white('  访问地址: ') + chalk.green.bold(`http://localhost:${PORT}`));
  console.log();
  console.log(chalk.gray('  功能:'));
  console.log(chalk.gray('    • 可视化界面操作'));
  console.log(chalk.gray('    • 实时状态显示'));
  console.log(chalk.gray('    • 快速测试数据'));
  console.log(chalk.gray('    • 操作日志输出'));
  console.log();
  console.log(chalk.yellow('  按 Ctrl+C 停止服务器'));
  console.log();
}

server.listen(PORT, () => {
  printBanner();
});
