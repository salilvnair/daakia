/**
 * AI Protocol types — interfaces for AI/LLM request configuration,
 * provider registry, messages, tool calling, and settings.
 */

// ────────────── Provider Types ──────────────

export type AiProviderId = 'openai' | 'anthropic' | 'google' | 'ollama' | 'groq' | 'together' | 'mistral' | 'xai' | 'deepseek' | 'azure-openai' | 'custom';

export interface AiProviderModel {
  id: string;          // 'gpt-4o', 'claude-3-opus-20240229'
  name: string;        // Display name: 'GPT-4o'
  context: number;     // Context window (tokens)
  supportsVision?: boolean;
  supportsTools?: boolean;
}

export interface AiProvider {
  id: AiProviderId;
  name: string;              // 'OpenAI'
  baseUrl: string;           // 'https://api.openai.com/v1'
  chatEndpoint: string;      // '/chat/completions'
  authType: 'bearer' | 'header' | 'query' | 'none';
  authHeader?: string;       // 'x-api-key' for Anthropic
  models: AiProviderModel[];
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsVision: boolean;
}

// ────────────── Message Types ──────────────

export type AiRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface AiMessage {
  id: string;
  role: AiRole;
  content: string;
  toolCalls?: AiToolCall[];     // For assistant messages with function calls
  toolCallId?: string;          // For tool result messages
  timestamp: number;
  tokens?: AiTokenUsage;
}

export interface AiTokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

// ────────────── Tool Definitions ──────────────

export interface AiToolDef {
  id: string;
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema object
  };
}

// ────────────── Settings ──────────────

export interface AiSettings {
  temperature: number;          // 0-2, default 0.7
  maxTokens: number;            // default 2048
  topP: number;                 // 0-1, default 0.95
  frequencyPenalty: number;     // 0-2, default 0
  presencePenalty: number;      // 0-2, default 0
  stream: boolean;              // default true
  stopSequences: string[];      // optional stop tokens
  responseFormat: 'text' | 'json_object'; // default 'text'
  seed?: number;                // optional deterministic seed
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  temperature: 0.7,
  maxTokens: 2048,
  topP: 0.95,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stream: true,
  stopSequences: [],
  responseFormat: 'text',
};

// ────────────── Request/Response ──────────────

export interface AiRequestPayload {
  tabId: string;
  provider: AiProviderId;
  model: string;
  baseUrl: string;
  chatEndpoint: string;
  messages: AiMessage[];
  tools?: AiToolDef[];
  settings: AiSettings;
  authType: string;
  authData: Record<string, string>;
}

export interface AiStreamChunk {
  tabId: string;
  delta: string;        // Incremental content text
  finishReason?: string;
  tokens?: AiTokenUsage;
}

export interface AiResponseComplete {
  tabId: string;
  message: AiMessage;
  tokens?: AiTokenUsage;
  duration: number;     // ms
}
