/**
 * Collection Agent
 * Subagent 抽象 - 代表一个独立的采集代理单元
 *
 * 每个 CollectionAgent 负责一个数据源（如百度、微信、医院官网）的深度采集。
 * 多个 agent 可以在 Worker 线程中并行执行，通过事件向外汇报进度。
 */

import type {
  CollectionAgentConfig,
  CollectionAgentResult,
  CollectionSourceType,
  CollectionStrategy,
  RawSourceMetadata,
  CollectionError,
} from '../../types/knowledge-collection.types';

export interface AgentProgressEvent {
  type: 'agent_started' | 'agent_progress' | 'agent_complete' | 'agent_error';
  agentId: string;
  sourceType: CollectionSourceType;
  data: unknown;
}

export type AgentProgressHandler = (event: AgentProgressEvent) => void;

export interface CollectionAgent {
  readonly agentId: string;
  readonly sourceType: CollectionSourceType;
  readonly config: CollectionAgentConfig;

  /**
   * 执行采集
   * @param onProgress 进度回调
   */
  run(onProgress?: AgentProgressHandler): Promise<CollectionAgentResult>;
}

export interface AgentStartedPayload {
  queryCount: number;
  maxResults: number;
  estimatedDuration: number;
}

export interface AgentProgressPayload {
  completed: number;
  failed: number;
  duplicates: number;
  currentQuery?: string;
}

export interface AgentCompletePayload {
  itemCount: number;
  duration: number;
}

export interface AgentErrorPayload {
  message: string;
  fatal: boolean;
}

/**
 * 生成唯一的 Agent ID
 */
export function generateAgentId(sourceType: CollectionSourceType, index: number): string {
  return `${sourceType}_${index}_${Date.now()}`;
}

/**
 * 创建基础 Agent 配置
 */
export function createAgentConfig(
  sourceType: CollectionSourceType,
  queries: string[],
  maxResults: number,
  strategyOverrides?: Partial<CollectionStrategy>
): CollectionAgentConfig {
  return {
    agentId: generateAgentId(sourceType, 0),
    sourceType,
    queries,
    maxResults,
    strategyOverrides,
  };
}
