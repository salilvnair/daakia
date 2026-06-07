/**
 * useAiStream — Centralized AI streaming hook.
 *
 * All AI-powered features (DataSchemaModal, AiAssistPopover, future widgets)
 * should use this hook instead of calling postMsg({ type: 'ai:send' }) directly.
 *
 * Benefits:
 * - Single place to maintain the ai:send message contract
 * - baseUrl is ALWAYS '' — the extension host resolves from provider registry + user settings
 * - Consistent streaming state (text / streaming / error)
 * - Per-call tabId isolation prevents message cross-talk
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { postMsg } from '../vscode';
import { useAiProvidersStore } from '../store/ai-providers-store';
import { useTabsStore } from '../store/tabs-store';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiStreamSettings {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  topP?: number;
  stopSequences?: string[];
  responseFormat?: string;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: null | number;
}

export interface AiStreamOptions {
  /** Override the active AI provider ID */
  provider?: string;
  /** Override the active model ID */
  model?: string;
  /** System prompts to prepend */
  systemPrompts?: string[];
  /** Per-call settings override */
  settings?: AiStreamSettings;
}

export interface AiStreamResult {
  /** Accumulated streaming text so far */
  text: string;
  /** True while the stream is open */
  streaming: boolean;
  /** Non-empty when the request failed */
  error: string;
  /**
   * Fire an AI request.
   * @param userPrompt   The user message / prompt to send.
   * @param opts         Optional overrides for provider, model, settings, system prompts.
   */
  trigger: (userPrompt: string, opts?: AiStreamOptions) => void;
  /** Reset text/streaming/error to initial state (useful for reuse without unmount) */
  reset: () => void;
}

// ─── Default settings ─────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Required<AiStreamSettings> = {
  temperature: 0.4,
  maxTokens: 1024,
  stream: true,
  topP: 1,
  stopSequences: [],
  responseFormat: 'text',
  frequencyPenalty: 0,
  presencePenalty: 0,
  seed: null,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAiStream(): AiStreamResult {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');

  /** Current request's unique tabId — filters incoming messages */
  const streamIdRef = useRef('');
  /** Accumulated chunks (ref avoids stale-closure issues in the listener) */
  const accRef = useRef('');

  // Resolve provider + model from store (same logic as AiAssistPopover)
  const providers = useAiProvidersStore(s => s.providers);
  const defaultProviderId = useAiProvidersStore(s => s.defaultProviderId);
  const defaultModelId = useAiProvidersStore(s => s.defaultModelId);
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));

  // ── Global message listener ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== streamIdRef.current) return;

      if (msg.type === 'ai:chunk') {
        const chunk = (msg.delta as string) || (msg.text as string) || '';
        accRef.current += chunk;
        setText(accRef.current);
      }

      if (msg.type === 'ai:complete') {
        const payload = msg.message as Record<string, unknown> | undefined;
        const content = (payload?.content as string) || '';
        const final = accRef.current || content;
        if (final) setText(final);
        setStreaming(false);
      }

      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'AI request failed');
        setStreaming(false);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── trigger ─────────────────────────────────────────────────────────────────
  const trigger = useCallback(
    (userPrompt: string, opts: AiStreamOptions = {}) => {
      // Unique request ID — used to isolate this stream from other AI tabs
      const pid = `ai-stream-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      streamIdRef.current = pid;
      accRef.current = '';

      setText('');
      setError('');
      setStreaming(true);

      // Resolve provider / model: opts override > active tab > store defaults > first enabled
      const resolvedProvider =
        opts.provider ||
        activeTab?.aiProvider ||
        defaultProviderId ||
        providers.find(p => p.enabled)?.id ||
        'openai';

      const resolvedModel =
        opts.model ||
        activeTab?.aiModel ||
        defaultModelId ||
        providers.find(p => p.id === resolvedProvider)?.models.find(m => m.enabled)?.id ||
        '';

      const mergedSettings = { ...DEFAULT_SETTINGS, ...opts.settings };

      postMsg({
        type: 'ai:send',
        tabId: pid,
        provider: resolvedProvider,
        model: resolvedModel,
        // CRITICAL: always empty — extension resolves baseUrl from provider registry + user settings.
        // Never pass activeTab.url here (that's the REST endpoint, not the AI provider URL).
        baseUrl: '',
        systemPrompts: opts.systemPrompts || [],
        userPrompt,
        conversation: [],
        tools: [],
        settings: mergedSettings,
        mcpServerConfigs: [],
        envId: activeTab?.envId,
      });
    },
    [providers, defaultProviderId, defaultModelId, activeTab],
  );

  // ── reset ───────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    streamIdRef.current = '';
    accRef.current = '';
    setText('');
    setError('');
    setStreaming(false);
  }, []);

  return { text, streaming, error, trigger, reset };
}
