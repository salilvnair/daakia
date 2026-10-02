/**
 * The environment fallback, and the model the fallback provider is asked for.
 *
 * Both failed in ways a typecheck cannot see: `keyFor` once called itself —
 * a scripted rename rewrote the one call inside it — and took the dev server
 * down with a stack overflow on the first AI request; and the provider scan
 * asked DeepSeek for whatever model had been requested of a provider that had
 * no key.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const keychain: Record<string, string | undefined> = {};

vi.mock('vscode', () => ({ lm: { selectChatModels: async () => [] } }));
vi.mock('../../storage/db', () => ({ getSetting: () => undefined }));
vi.mock('../secret-store', () => ({
  retrieveApiKey: async (id: string) => keychain[id],
  getAllKeyStatus: async () => ({}),
}));

import { keyFor, autoResolveProvider } from './llm-provider-service';

beforeEach(() => {
  for (const k of Object.keys(keychain)) delete keychain[k];
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_MODEL;
});

describe('keyFor', () => {
  it('prefers the keychain', async () => {
    keychain.deepseek = 'from-keychain';
    process.env.DEEPSEEK_API_KEY = 'from-env';
    expect(await keyFor('deepseek')).toBe('from-keychain');
  });

  it('falls back to the environment, and returns rather than recursing', async () => {
    process.env.DEEPSEEK_API_KEY = 'from-env';
    expect(await keyFor('deepseek')).toBe('from-env');
  });

  it('is nothing when neither has one', async () => {
    expect(await keyFor('deepseek')).toBeUndefined();
  });
});

describe('the provider a request falls back to', () => {
  it('uses its own model, not the one asked of a provider with no key', async () => {
    process.env.DEEPSEEK_API_KEY = 'from-env';
    process.env.DEEPSEEK_MODEL = '\tdeepseek-flash';
    const resolved = await autoResolveProvider('openai', 'gpt-4o');
    expect(resolved.providerId).toBe('deepseek');
    expect(resolved.model).toBe('deepseek-flash');
  });

  it('keeps the requested model when that provider lists it', async () => {
    process.env.DEEPSEEK_API_KEY = 'from-env';
    const resolved = await autoResolveProvider('openai', 'deepseek-chat');
    expect(resolved.model).toBe('deepseek-chat');
  });
});

describe('a provider configured in the environment', () => {
  it("uses the environment's model over the UI's default", async () => {
    process.env.DEEPSEEK_API_KEY = 'from-env';
    process.env.DEEPSEEK_MODEL = 'deepseek-flash';
    // The UI sends the first model in its own list for DeepSeek.
    const resolved = await autoResolveProvider('deepseek', 'deepseek-v4-pro');
    expect(resolved.model).toBe('deepseek-flash');
  });

  it("leaves a keychain-configured provider's chosen model alone", async () => {
    keychain.deepseek = 'from-keychain';
    process.env.DEEPSEEK_MODEL = 'deepseek-flash';
    const resolved = await autoResolveProvider('deepseek', 'deepseek-v4-pro');
    expect(resolved.model).toBe('deepseek-v4-pro');
  });
});

