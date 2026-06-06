/**
 * AI Provider data for the webview (mirrored from src/ai/ai-providers.ts).
 * Kept separate since webview can't import from extension host.
 */

export type AiProviderId = 'openai' | 'anthropic' | 'google' | 'ollama' | 'groq' | 'together' | 'mistral' | 'xai' | 'deepseek' | 'azure-openai' | 'custom' | 'copilot';

export interface AiProviderModel {
  id: string;
  name: string;
  context: number;
  supportsVision?: boolean;
  supportsTools?: boolean;
}

export interface AiProviderInfo {
  id: AiProviderId;
  name: string;
  baseUrl: string;
  models: AiProviderModel[];
}

export const AI_PROVIDERS: AiProviderInfo[] = [
  {
    id: 'copilot', name: 'GitHub Copilot', baseUrl: 'vscode://copilot',
    models: [
      { id: 'auto', name: 'Auto (Copilot chooses)', context: 200000 },
      { id: 'gpt-4o', name: 'GPT-4o', context: 128000, supportsVision: true, supportsTools: true },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', context: 200000, supportsVision: true, supportsTools: true },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', context: 1048576, supportsVision: true },
      { id: 'o3-mini', name: 'o3-mini', context: 200000, supportsTools: true },
    ],
  },
  {
    id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-5.4', name: 'GPT-5.4', context: 1047576, supportsVision: true, supportsTools: true },
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', context: 1047576, supportsVision: true, supportsTools: true },
      { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', context: 1047576, supportsVision: true, supportsTools: true },
      { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', context: 1047576, supportsTools: true },
      { id: 'gpt-4.1', name: 'GPT-4.1', context: 1047576, supportsVision: true, supportsTools: true },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', context: 1047576, supportsVision: true, supportsTools: true },
      { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', context: 1047576, supportsVision: true, supportsTools: true },
      { id: 'gpt-4o', name: 'GPT-4o', context: 128000, supportsVision: true, supportsTools: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', context: 128000, supportsVision: true, supportsTools: true },
      { id: 'o3-pro', name: 'o3 Pro', context: 200000, supportsTools: true },
      { id: 'o3', name: 'o3', context: 200000, supportsTools: true },
      { id: 'o4-mini', name: 'o4 Mini', context: 200000, supportsTools: true },
    ],
  },
  {
    id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', context: 200000, supportsVision: true, supportsTools: true },
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', context: 200000, supportsVision: true, supportsTools: true },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', context: 200000, supportsVision: true, supportsTools: true },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', context: 200000, supportsVision: true, supportsTools: true },
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', context: 200000, supportsVision: true, supportsTools: true },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', context: 200000, supportsTools: true },
    ],
  },
  {
    id: 'google', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', context: 1048576, supportsVision: true, supportsTools: true },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', context: 1048576, supportsVision: true, supportsTools: true },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', context: 1048576, supportsVision: true, supportsTools: true },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', context: 2097152, supportsVision: true, supportsTools: true },
    ],
  },
  {
    id: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1',
    models: [
      { id: 'llama3.3', name: 'Llama 3.3', context: 128000, supportsTools: true },
      { id: 'llama3.1', name: 'Llama 3.1', context: 128000, supportsTools: true },
      { id: 'deepseek-r1', name: 'DeepSeek R1', context: 64000 },
      { id: 'qwen2.5', name: 'Qwen 2.5', context: 32768, supportsTools: true },
      { id: 'mistral', name: 'Mistral', context: 32768 },
      { id: 'codellama', name: 'Code Llama', context: 16384 },
    ],
  },
  {
    id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'compound-beta', name: 'Compound Beta', context: 128000, supportsTools: true },
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick 128E', context: 131072, supportsTools: true },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 16E', context: 131072, supportsTools: true },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', context: 128000, supportsTools: true },
      { id: 'qwen/qwen3-32b', name: 'Qwen 3 32B', context: 32768, supportsTools: true },
      { id: 'moonshotai/kimi-k2-instruct', name: 'Kimi K2', context: 131072, supportsTools: true },
    ],
  },
  {
    id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1',
    models: [
      { id: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', name: 'Llama 3.1 405B', context: 128000 },
      { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', name: 'Llama 3.1 70B', context: 128000 },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', context: 64000 },
    ],
  },
  {
    id: 'mistral', name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', context: 128000, supportsTools: true },
      { id: 'mistral-small-latest', name: 'Mistral Small', context: 32768, supportsTools: true },
      { id: 'codestral-latest', name: 'Codestral', context: 32768 },
    ],
  },
  {
    id: 'xai', name: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1',
    models: [
      { id: 'grok-3', name: 'Grok 3', context: 131072, supportsTools: true },
      { id: 'grok-3-mini', name: 'Grok 3 Mini', context: 131072, supportsTools: true },
    ],
  },
  {
    id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', context: 1000000, supportsTools: true },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', context: 1000000, supportsTools: true },
      { id: 'deepseek-chat', name: 'DeepSeek V3', context: 64000, supportsTools: true },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', context: 64000 },
    ],
  },
  {
    id: 'azure-openai', name: 'Azure OpenAI', baseUrl: '',
    models: [
      { id: 'gpt-5.4', name: 'GPT-5.4 (Azure)', context: 1047576, supportsVision: true, supportsTools: true },
      { id: 'gpt-4.1', name: 'GPT-4.1 (Azure)', context: 1047576, supportsVision: true, supportsTools: true },
      { id: 'gpt-4o', name: 'GPT-4o (Azure)', context: 128000, supportsVision: true, supportsTools: true },
    ],
  },
  {
    id: 'custom', name: 'Custom', baseUrl: '',
    models: [],
  },
];

export function getProviderInfo(id: string): AiProviderInfo | undefined {
  return AI_PROVIDERS.find(p => p.id === id);
}
