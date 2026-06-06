/**
 * LLM Provider Service — central orchestrator for AI provider resolution.
 *
 * Responsibilities:
 * - Resolve the active provider config (from settings store)
 * - Inject stored API key into auth data (from ai_keys KV store)
 * - Build the complete AiRequestPayload auth block for any provider
 * - Provide capability queries (streaming support, tool support, vision)
 *
 * Used by ai-handler.ts to automatically fill in auth credentials
 * so the webview never needs to store sensitive keys.
 */
import { AI_PROVIDERS, getProvider } from '../../ai/ai-providers';
import { getSetting } from '../../storage/db';
import { retrieveApiKey, getAllKeyStatus } from '../secret-store';
import type { AiProviderId } from '../../ai/ai-types';

// ─── Auth Data Builder ───

export interface ResolvedAuth {
  authType: string;
  authData: Record<string, string>;
}

/**
 * Build auth data for a given provider by injecting the stored API key.
 * If the webview already supplied an authData.token (non-empty), use it as-is.
 * Otherwise look up the key from OS keychain (async).
 */
export async function resolveProviderAuth(
  providerId: AiProviderId | string,
  _baseUrl: string,
  incomingAuthType?: string,
  incomingAuthData?: Record<string, string>,
): Promise<ResolvedAuth> {
  // If caller already provided a full key, use it
  if (incomingAuthData?.token && incomingAuthData.token.length > 0) {
    return { authType: incomingAuthType || 'bearer', authData: incomingAuthData };
  }
  if (incomingAuthData?.keyValue && (incomingAuthData.keyValue as string).length > 0) {
    return { authType: incomingAuthType || 'api-key', authData: incomingAuthData };
  }

  // Look up stored key from OS keychain
  const storedToken = await retrieveApiKey(providerId) ?? '';

  switch (providerId) {
    case 'anthropic':
      return {
        authType: 'api-key',
        authData: { keyName: 'x-api-key', keyValue: storedToken },
      };
    case 'google':
      return {
        authType: 'bearer',
        authData: { token: storedToken },
      };
    case 'azure-openai':
      return {
        authType: 'api-key',
        authData: { keyName: 'api-key', keyValue: storedToken },
      };
    case 'ollama':
      return { authType: 'none', authData: {} };
    default:
      return {
        authType: 'bearer',
        authData: { token: storedToken },
      };
  }
}

// ─── Provider Config Resolver ───

export interface ActiveProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  chatEndpoint: string;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsVision: boolean;
}

/**
 * Resolve provider config: merges registry defaults with user overrides from settings.
 */
export function resolveProviderConfig(providerId: AiProviderId | string, overrideBaseUrl?: string): ActiveProviderConfig {
  const def = getProvider(providerId as AiProviderId);
  const userProviders = getSetting<Array<{ id: string; baseUrl: string }>>('aiProviders') ?? [];
  const userOverride = userProviders.find(p => p.id === providerId);

  const baseUrl = overrideBaseUrl || userOverride?.baseUrl || def?.baseUrl || '';
  const chatEndpoint = def?.chatEndpoint || '/chat/completions';

  return {
    id: providerId,
    name: def?.name || providerId,
    baseUrl,
    chatEndpoint,
    supportsTools: def?.supportsTools ?? true,
    supportsStreaming: def?.supportsStreaming ?? true,
    supportsVision: def?.supportsVision ?? false,
  };
}

// ─── Keys Summary (for webview init) ───

/** Returns a map of providerId → boolean (has key stored) — never exposes actual tokens */
export async function getProviderKeyStatus(): Promise<Record<string, boolean>> {
  const ids = AI_PROVIDERS.map(p => p.id);
  return getAllKeyStatus(ids);
}
