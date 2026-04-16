/**
 * Article Ingestion Service Types
 * 文章采集服务的类型定义
 */

import type { CollectionSourceType } from '../../types/knowledge-collection.types';

// ===== 会话状态 =====
export enum SessionState {
  IDLE = 'idle',
  WAITING_URL = 'waiting_url',
  WAITING_TARGET = 'waiting_target',
  WAITING_CONFIRMATION = 'waiting_confirmation',
  BATCH_COLLECTING = 'batch_collecting',
  PROCESSING = 'processing',
}

// ===== 保存目标类型 =====
export type TargetType = 'hospital' | 'department' | 'doctor' | 'customer';

export interface SaveTarget {
  type: TargetType;
  hospitalName: string;
  departmentName?: string;
  doctorName?: string;
  customerName?: string;
  confidence: number;
  reasoning: string;
}

// ===== 会话上下文 =====
export interface SessionContext {
  sessionId: string;
  state: SessionState;
  userId: string;
  userName?: string;
  channelId: string;
  channelType: 'private' | 'group';

  // 对话历史
  messageHistory: MessageHistoryItem[];

  // 待处理事项
  pendingUrl?: string;
  pendingTarget?: SaveTarget;
  urlQueue: string[];

  // 用户实体库（基于订阅和历史自动构建）
  userEntityLibrary: UserEntityLibrary;

  // 最近操作目标
  recentTargets: RecentTarget[];

  // 时间戳
  createdAt: number;
  lastActivityAt: number;
}

export interface MessageHistoryItem {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  extractedEntities?: ExtractedEntities;
}

export interface UserEntityLibrary {
  hospitals: string[];
  departments: string[];
  doctors: string[];
  customers: string[];
  lastUpdated: number;
}

export interface RecentTarget {
  type: TargetType;
  name: string;
  hospitalName?: string;
  usedAt: string;
}

// ===== 实体提取结果 =====
export interface ExtractedEntities {
  hospitals?: string[];
  departments?: string[];
  doctors?: string[];
  customers?: string[];
  urls?: string[];
}

// ===== 意图理解结果 =====
export interface IntentUnderstanding {
  hasSaveIntent: boolean;
  urls: string[];
  target?: SaveTarget;
  confidence: number;
  missingInfo: ('url' | 'hospital' | 'department' | 'confirmation')[];
  reasoning: string;
  suggestedTargets?: SaveTarget[];
}

// ===== 行动决策 =====
export type ActionType =
  | 'SAVE_ARTICLE'
  | 'BATCH_SAVE'
  | 'REQUEST_URL'
  | 'REQUEST_TARGET'
  | 'REQUEST_CONFIRMATION'
  | 'CLARIFY_INTENT'
  | 'IGNORE';

export interface ActionDecision {
  action: ActionType;
  url?: string;
  urls?: string[];
  target?: SaveTarget;
  message?: string;
  suggestedTargets?: SaveTarget[];
  urlPreview?: {
    title?: string;
    description?: string;
  };
}

// ===== 飞书消息格式 =====
export interface FeishuMessage {
  messageId: string;
  chatId: string;
  chatType: 'p2p' | 'group';
  sender: {
    senderId: string;
    senderType: 'user';
  };
  messageType: 'text' | 'post' | 'image' | 'file' | 'interactive';
  content: string; // JSON string
  mentions?: Array<{
    key: string;
    id: {
      open_id: string;
      union_id?: string;
    };
    name: string;
  }>;
  createTime: string;
}

// ===== 文章保存结果 =====
export interface ArticleSaveResult {
  success: boolean;
  target: SaveTarget;
  filePath?: string;
  metadata?: {
    id: string;
    title: string;
    url: string;
    sourceType: CollectionSourceType;
  };
  isDuplicate?: boolean;
  existingPath?: string;
  error?: string;
}

// ===== 批量保存结果 =====
export interface BatchSaveResult {
  total: number;
  success: number;
  failed: number;
  duplicates: number;
  results: ArticleSaveResult[];
}
