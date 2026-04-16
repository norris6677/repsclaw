/**
 * LLM Client
 * 统一的 LLM 调用抽象，支持 OpenClaw 运行时和独立 CLI 运行时
 *
 * 优先级：
 * 1. OpenClaw 运行时：使用 openclaw.callLLM()
 * 2. 配置文件：~/.repsclaw/config.json 或项目根目录 config.json
 * 3. 环境变量：ANTHROPIC_API_KEY, OPENAI_API_KEY, REPSCLAW_LLM_MODEL
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { OpenClawAPI } from '../types/openclaw.types';
import { createLogger } from '../utils/plugin-logger';

const logger = createLogger('REPSCLAW:LLM');

export const DEFAULT_LLM_MODEL = 'claude-sonnet-4-6';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCallOptions {
  model?: string;
  messages: LLMMessage[];
  temperature?: number;
}

export interface LLMClient {
  call(options: LLMCallOptions): Promise<string>;
  defaultModel: string;
}

export interface LLMConfig {
  provider: 'anthropic' | 'openclaw' | 'openai';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

/**
 * 加载 LLM 配置文件
 * 查找路径优先级：
 * 1. ~/.repsclaw/config.json
 * 2. 项目根目录 config.json
 */
function loadLLMConfig(): LLMConfig | null {
  const configPaths = [
    path.join(process.env.HOME || process.env.USERPROFILE || os.homedir() || '/tmp', '.repsclaw', 'config.json'),
    path.join(process.cwd(), 'config.json'),
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);
        if (config.repsclaw?.llm || config.llm) {
          const llmConfig = config.repsclaw?.llm || config.llm;
          logger.debug('Loaded LLM config from file', { path: configPath });
          return {
            provider: llmConfig.provider || 'anthropic',
            apiKey: llmConfig.apiKey,
            model: llmConfig.model,
            baseUrl: llmConfig.baseUrl,
          };
        }
      } catch (error) {
        logger.warn('Failed to parse LLM config file', { path: configPath, error });
      }
    }
  }

  return null;
}

/**
 * 基于 OpenClaw 的 LLM 客户端
 */
export class OpenClawLLMClient implements LLMClient {
  defaultModel: string;

  constructor(private openclaw: OpenClawAPI, defaultModel?: string) {
    this.defaultModel = defaultModel || DEFAULT_LLM_MODEL;
  }

  async call(options: LLMCallOptions): Promise<string> {
    if (!this.openclaw.callLLM) {
      throw new Error('OpenClaw API does not have callLLM method');
    }

    const result = await this.openclaw.callLLM({
      model: options.model || this.defaultModel,
      messages: options.messages,
      temperature: options.temperature ?? 0.3,
    });

    if (typeof result.content === 'string') {
      return result.content;
    }

    // Some implementations return object with text field
    const contentObj = result.content as { text?: string; content?: string };
    return contentObj.text || contentObj.content || JSON.stringify(result.content);
  }
}

/**
 * 基于 Anthropic API 的直接 LLM 客户端（用于 CLI 独立运行）
 */
export class AnthropicLLMClient implements LLMClient {
  defaultModel: string;
  private apiKey: string;

  constructor(apiKey?: string, defaultModel?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.defaultModel = defaultModel || DEFAULT_LLM_MODEL;
    if (!this.apiKey) {
      logger.warn('ANTHROPIC_API_KEY not set, AnthropicLLMClient will fail on call');
    }
  }

  async call(options: LLMCallOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model || this.defaultModel,
        max_tokens: 4096,
        messages: options.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options.temperature ?? 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
      error?: { message: string };
    };

    if (data.error) {
      throw new Error(`Anthropic API error: ${data.error.message}`);
    }

    const textBlock = data.content.find(c => c.type === 'text');
    return textBlock?.text || JSON.stringify(data.content);
  }
}

/**
 * 基于 OpenAI 兼容 API 的 LLM 客户端
 */
export class OpenAILLMClient implements LLMClient {
  defaultModel: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string, defaultModel?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    this.baseUrl = baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.defaultModel = defaultModel || 'gpt-4o';
    if (!this.apiKey) {
      logger.warn('OPENAI_API_KEY not set, OpenAILLMClient will fail on call');
    }
  }

  async call(options: LLMCallOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || this.defaultModel,
        messages: options.messages,
        temperature: options.temperature ?? 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      error?: { message: string };
    };

    if (data.error) {
      throw new Error(`OpenAI API error: ${data.error.message}`);
    }

    return data.choices[0]?.message?.content || '';
  }
}

/**
 * 创建适合当前运行环境的 LLM 客户端
 *
 * 优先级：
 * 1. OpenClaw API (如果提供了 openclaw 且支持 callLLM)
 * 2. 配置文件 ( ~/.repsclaw/config.json )
 * 3. 环境变量 (ANTHROPIC_API_KEY / OPENAI_API_KEY)
 * 4. Fallback: 抛出有用错误信息的占位客户端
 */
export function createLLMClient(openclaw?: OpenClawAPI): LLMClient {
  // 1. OpenClaw 运行时优先
  if (openclaw?.callLLM) {
    return new OpenClawLLMClient(openclaw);
  }

  // 2. 读取配置文件
  const fileConfig = loadLLMConfig();
  if (fileConfig) {
    const defaultModel = fileConfig.model || process.env.REPSCLAW_LLM_MODEL || DEFAULT_LLM_MODEL;

    if (fileConfig.provider === 'openai') {
      return new OpenAILLMClient(fileConfig.apiKey, fileConfig.baseUrl, defaultModel);
    }

    // 默认 anthropic
    return new AnthropicLLMClient(fileConfig.apiKey, defaultModel);
  }

  // 3. 环境变量 fallback
  if (process.env.ANTHROPIC_API_KEY) {
    return new AnthropicLLMClient(
      undefined,
      process.env.REPSCLAW_LLM_MODEL || DEFAULT_LLM_MODEL
    );
  }

  if (process.env.OPENAI_API_KEY) {
    return new OpenAILLMClient(
      undefined,
      undefined,
      process.env.REPSCLAW_LLM_MODEL || 'gpt-4o'
    );
  }

  // 4. Fallback: return a client that throws with helpful message
  const fallbackModel = process.env.REPSCLAW_LLM_MODEL || DEFAULT_LLM_MODEL;
  return {
    defaultModel: fallbackModel,
    async call(): Promise<string> {
      throw new Error(
        'LLM client not available. Please configure one of the following:\n' +
          '1. OpenClaw with callLLM support\n' +
          '2. Config file: ~/.repsclaw/config.json with repsclaw.llm.{provider,apiKey,model}\n' +
          '3. Environment variable: ANTHROPIC_API_KEY or OPENAI_API_KEY'
      );
    },
  };
}
