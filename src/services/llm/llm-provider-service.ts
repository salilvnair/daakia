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
import * as vscode from 'vscode';
import { AI_PROVIDERS, getProvider } from '../../ai/ai-providers';
import { getSetting } from '../../storage/db';
import { retrieveApiKey, getAllKeyStatus } from '../secret-store';
import { envKey, envBaseUrl, envModel } from './env-provider';

/**
 * The key for a provider: the keychain first, then the environment.
 *
 * Every lookup in this file goes through here, so a key exported in the shell
 * or loaded from the dev server's `.env` counts as "has a key" everywhere the
 * keychain's does — auth, and the scan that picks a provider when the one
 * asked for has none.
 */
export async function keyFor(providerId: string): Promise<string | undefined> {
  return (await retrieveApiKey(providerId)) || envKey(providerId);
}
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
  const storedToken = await keyFor(providerId) ?? '';

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
    case 'daakia-mock':
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

  const baseUrl = overrideBaseUrl || userOverride?.baseUrl || envBaseUrl(providerId) || def?.baseUrl || '';
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

// ─── Auto Provider Resolution ───

export interface ResolvedProvider {
  /** Final provider id to use */
  providerId: string;
  /** Model to use — may differ from requested if auto-selected */
  model: string;
  /** True when routing should go through VS Code LM API (Copilot) */
  routeToCopilot: boolean;
  /** Base URL — '' means use registry default */
  baseUrl: string;
}

/**
 * Auto-resolve the best available AI provider when the user hasn't explicitly
 * configured one, or when the configured provider has no API key.
 *
 * Priority order:
 *   1. Copilot explicitly requested → use VS Code LM API
 *   2. Requested provider has a stored key → use as-is
 *   3. Any Copilot model available via VS Code LM API → auto-use Copilot
 *   4. First provider (non-copilot) with a stored API key → use that
 *   5. Nothing available → throw with a helpful error message
 */
export async function autoResolveProvider(
  requestedId: string,
  requestedModel: string,
): Promise<ResolvedProvider> {
  // 1. Copilot explicitly requested — always route via LM API
  if (requestedId === 'copilot') {
    return {
      providerId: 'copilot',
      model: requestedModel || 'auto',
      routeToCopilot: true,
      baseUrl: '',
    };
  }

  // 1b. DaakiaAI Mock — no API key needed, routes to user-configured mock AI server URL
  if (requestedId === 'daakia-mock') {
    const config = resolveProviderConfig('daakia-mock');
    return {
      providerId: 'daakia-mock',
      model: requestedModel || 'mock1-model',
      routeToCopilot: false,
      baseUrl: config.baseUrl,
    };
  }

  // 2. Requested provider has a stored key → use it
  try {
    const stored = await keyFor(requestedId);
    if (stored && stored.length > 0) {
      /*
        A provider configured in the environment is configured as a unit.

        When the key came from the environment rather than the keychain and a
        model was set beside it, that model wins over the one the UI sent. The
        UI does not know the environment's model — DeepSeek's built-in list has
        no `deepseek-flash` — so what it sends is its own default, and a key
        from one account paired with a model picked from a list is how a
        working `.env` turns into a 400.
      */
      const fromEnv = !(await retrieveApiKey(requestedId)) && !!envKey(requestedId);
      const defaultModel = (fromEnv ? envModel(requestedId) : undefined)
        || requestedModel
        || envModel(requestedId)
        || AI_PROVIDERS.find(p => p.id === requestedId)?.models[0]?.id
        || '';
      return {
        providerId: requestedId,
        model: defaultModel,
        routeToCopilot: false,
        baseUrl: '',
      };
    }
  } catch { /* keychain unavailable — continue */ }

  // 3. Try VS Code Copilot LM API — works without any API key
  try {
    const copilotModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    if (copilotModels.length > 0) {
      return {
        providerId: 'copilot',
        model: 'auto',
        routeToCopilot: true,
        baseUrl: '',
      };
    }
  } catch { /* VS Code LM API not available */ }

  // 4. Scan all providers for a stored key
  const scanOrder: string[] = ['openai', 'anthropic', 'google', 'groq', 'mistral', 'together', 'xai', 'deepseek', 'ollama', 'custom'];
  for (const id of scanOrder) {
    if (id === requestedId) continue; // already tried above
    try {
      const stored = await keyFor(id);
      if (stored && stored.length > 0) {
        /*
          This provider's OWN model, never the one that was asked for.

          Reaching this loop means the requested provider had no key, so the
          requested model belongs to a provider we are not calling: a Daakia AI
          tab set to OpenAI's `gpt-4o` fell through to DeepSeek and asked
          DeepSeek for `gpt-4o`, which it answers with a 400 that names a model
          the user never chose for it. The requested model only counts if this
          provider actually lists it.
        */
        const ownModels = AI_PROVIDERS.find(p => p.id === id)?.models.map(m => m.id) ?? [];
        const defaultModel = (requestedModel && ownModels.includes(requestedModel) ? requestedModel : undefined)
          || envModel(id)
          || ownModels[0]
          || '';
        return {
          providerId: id,
          model: defaultModel,
          routeToCopilot: false,
          baseUrl: '',
        };
      }
    } catch { /* continue */ }
  }

  // 5. Nothing configured
  throw new Error(
    `No AI provider configured. To get started:\n` +
    `• Open Settings → AI → add an API key for any provider, OR\n` +
    `• Install GitHub Copilot in VS Code (no API key needed)`,
  );
}
