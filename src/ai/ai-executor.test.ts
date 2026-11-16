import { describe, it, expect } from 'vitest';
import { buildAiRequest, quirkFromError, learnQuirk } from './ai-executor';
import type { AiRequestPayload } from './ai-types';

function payload(provider: string, model: string, baseUrl = ''): AiRequestPayload {
  return {
    tabId: 't1',
    provider,
    model,
    baseUrl,
    authType: 'bearer',
    authData: { token: 'x' },
    messages: [{ role: 'user', content: 'hi' }],
    settings: {
      temperature: 0.7, maxTokens: 2048, topP: 1, stream: false,
      frequencyPenalty: 0, presencePenalty: 0, stopSequences: [],
    },
  } as unknown as AiRequestPayload;
}

const body = (p: AiRequestPayload) => JSON.parse(buildAiRequest(p).body);

describe('OpenAI-compatible request body', () => {
  it('sends max_completion_tokens to OpenAI, and no sampling to a reasoning model', () => {
    const b = body(payload('openai', 'gpt-5.4'));
    expect(b.max_completion_tokens).toBe(2048);
    expect(b).not.toHaveProperty('max_tokens');
    expect(b).not.toHaveProperty('temperature');
    expect(b).not.toHaveProperty('top_p');
  });

  it('keeps temperature for an OpenAI chat model', () => {
    const b = body(payload('openai', 'gpt-4o'));
    expect(b.max_completion_tokens).toBe(2048);
    expect(b.temperature).toBe(0.7);
  });

  it('keeps max_tokens for everyone else', () => {
    const b = body(payload('deepseek', 'deepseek-v4-flash'));
    expect(b.max_tokens).toBe(2048);
    expect(b).not.toHaveProperty('max_completion_tokens');
    expect(b.temperature).toBe(0.7);
  });

  it('treats an Azure deployment named like a reasoning model as one', () => {
    const b = body(payload('azure-openai', 'o4-mini', 'https://a.example'));
    expect(b.max_completion_tokens).toBe(2048);
    expect(b).not.toHaveProperty('temperature');
  });
});

describe('learning from a 400', () => {
  it('reads the two complaints the API makes', () => {
    expect(quirkFromError("Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."))
      .toEqual({ completionTokens: true });
    expect(quirkFromError("Unsupported value: 'temperature' does not support 0.7 with this model. Only the default (1) value is supported."))
      .toEqual({ noSampling: true });
    expect(quirkFromError('Invalid API key')).toBeNull();
  });

  it('remembers the quirk for that model, and says when there is nothing new', () => {
    const p = payload('azure-openai', 'my-deployment', 'https://b.example');
    expect(body(p).max_tokens).toBe(2048);
    expect(learnQuirk(p, { completionTokens: true })).toBe(true);
    expect(body(p).max_completion_tokens).toBe(2048);
    expect(learnQuirk(p, { completionTokens: true })).toBe(false);
    expect(body(payload('azure-openai', 'other', 'https://b.example')).max_tokens).toBe(2048);
  });
});
