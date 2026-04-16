/**
 * Feishu Adapter
 * 飞书平台适配器 - 支持 WebSocket 长连接接收消息
 *
 * 飞书开放平台提供两种事件接收方式：
 * 1. Webhook - HTTP 回调（需要公网URL）
 * 2. WebSocket - 长连接（纯本地，推荐）
 *
 * 本实现使用 WebSocket 模式，支持纯本地部署
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type { FeishuMessage } from './types';
import { createLogger } from '../../utils/plugin-logger';

const logger = createLogger('REPSCLAW:FEISHU');

interface FeishuAdapterOptions {
  appId: string;
  appSecret: string;
  encryptKey?: string;
  verificationToken?: string;
  reconnectInterval?: number;
  heartbeatInterval?: number;
}

interface FeishuTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}

interface FeishuWebSocketResponse {
  code: number;
  msg: string;
  data?: {
    url: string;
  };
}

export class FeishuAdapter extends EventEmitter {
  private options: Required<FeishuAdapterOptions>;
  private ws: WebSocket | null = null;
  private reconnectTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private token: string | null = null;
  private tokenExpireAt: number = 0;
  private isConnecting = false;
  private shouldReconnect = true;

  constructor(options: FeishuAdapterOptions) {
    super();
    this.options = {
      ...options,
      reconnectInterval: options.reconnectInterval ?? 5000,
      heartbeatInterval: options.heartbeatInterval ?? 30000,
    };
  }

  /**
   * 启动连接
   */
  async start(): Promise<void> {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      logger.warn('Already connected or connecting');
      return;
    }

    this.shouldReconnect = true;
    await this.connect();
  }

  /**
   * 停止连接
   */
  async stop(): Promise<void> {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    logger.info('Feishu adapter stopped');
  }

  /**
   * 发送文本消息
   */
  async sendTextMessage(chatId: string, text: string, options?: { threadId?: string }): Promise<void> {
    const token = await this.ensureToken();

    const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
        ...(options?.threadId && { uuid: options.threadId }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send message: ${error}`);
    }
  }

  /**
   * 发送交互式卡片消息
   */
  async sendCardMessage(
    chatId: string,
    card: Record<string, unknown>,
    options?: { threadId?: string }
  ): Promise<void> {
    const token = await this.ensureToken();

    const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
        ...(options?.threadId && { uuid: options.threadId }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send card: ${error}`);
    }
  }

  // ==================== 私有方法 ====================

  private async connect(): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      // 1. 获取 access token
      const token = await this.ensureToken();

      // 2. 获取 WebSocket 连接地址
      const wsUrl = await this.getWebSocketUrl(token);

      // 3. 建立 WebSocket 连接
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        logger.info('Feishu WebSocket connected');
        this.isConnecting = false;
        this.startHeartbeat();
        this.emit('connected');
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        logger.warn('Feishu WebSocket closed', { code, reason: reason.toString() });
        this.isConnecting = false;
        this.stopHeartbeat();
        this.emit('disconnected');

        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error: Error) => {
        logger.error('Feishu WebSocket error', error);
        this.isConnecting = false;
        this.emit('error', error);
      });
    } catch (error) {
      logger.error('Failed to connect to Feishu', error);
      this.isConnecting = false;

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private async ensureToken(): Promise<string> {
    // 检查 token 是否过期
    if (this.token && Date.now() < this.tokenExpireAt - 60000) {
      return this.token;
    }

    // 获取新 token
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: this.options.appId,
        app_secret: this.options.appSecret,
      }),
    });

    const data: FeishuTokenResponse = await response.json();

    if (data.code !== 0) {
      throw new Error(`Failed to get token: ${data.msg}`);
    }

    this.token = data.tenant_access_token!;
    this.tokenExpireAt = Date.now() + (data.expire || 7200) * 1000;

    return this.token;
  }

  private async getWebSocketUrl(token: string): Promise<string> {
    const response = await fetch('https://open.feishu.cn/open-apis/event/v1/outbound/event/ws', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data: FeishuWebSocketResponse = await response.json();

    if (data.code !== 0 || !data.data?.url) {
      throw new Error(`Failed to get WebSocket URL: ${data.msg}`);
    }

    return data.data.url;
  }

  private handleMessage(data: string): void {
    try {
      const event = JSON.parse(data);

      // 处理心跳响应
      if (event.type === 'pong') {
        return;
      }

      // 处理消息事件
      if (event.schema === '2.0' && event.header?.event_type === 'im.message.receive_v1') {
        const message = this.parseMessage(event);
        if (message) {
          this.emit('message', message);
        }
      }

      // 处理其他事件类型...
      this.emit('event', event);
    } catch (error) {
      logger.error('Failed to handle message', { data, error });
    }
  }

  private parseMessage(event: any): FeishuMessage | null {
    try {
      const { event: eventData } = event;
      const message = eventData.message;
      const sender = eventData.sender;

      // 忽略机器人自己的消息
      if (sender.sender_type !== 'user') {
        return null;
      }

      return {
        messageId: message.message_id,
        chatId: message.chat_id,
        chatType: message.chat_type === 'p2p' ? 'p2p' : 'group',
        sender: {
          senderId: sender.sender_id?.open_id || sender.sender_id?.union_id,
          senderType: 'user',
        },
        messageType: message.message_type,
        content: message.content,
        mentions: message.mentions,
        createTime: message.create_time,
      };
    } catch (error) {
      logger.error('Failed to parse message', { event, error });
      return null;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, this.options.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    logger.info(`Reconnecting in ${this.options.reconnectInterval}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, this.options.reconnectInterval);
  }
}
