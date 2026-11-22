/**
 * AiHeaderSuggest — AI-powered header autocomplete for the Headers tab.
 *
 * Task: 4.3.4 — AI Auto-complete Headers
 *
 * Shows a "Suggest" button above the KeyValueTable.
 * On click: asks the active AI provider to suggest relevant headers based on
 * the request's method, URL, body content-type, and auth type.
 * Suggestions appear as clickable chips — one click adds the header row.
 */
import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import type { KeyValueRow } from '../shared';
import { CloseIcon, PlusIcon, SparkleIcon } from '../../icons';
import { IconButtonView } from '@salilvnair/dui';
import './ai-header-suggest.css';
import { postMsg } from '../../vscode';
import { sendAiRequest } from '../../services/ai/ai-client';

export interface AiHeaderSuggestHandle {
  trigger: () => void;
  loading: boolean;
}

const ACCENT = 'var(--color-protocol-ai)';

interface HeaderSuggestion {
  key: string;
  value: string;
  reason: string;
}

interface Props {
  tabId: string;
  method: string;
  url: string;
  bodyContentType: string;
  authType: string;
  existingHeaders: KeyValueRow[];
  /** Every pair in one call: the caller writes them in a single update. */
  onAddHeaders: (pairs: { key: string; value: string }[]) => void;
}

// ─── JSON parser — strips markdown fences if present ─────────────────────────

function parseSuggestions(raw: string): HeaderSuggestion[] {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(stripped);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is HeaderSuggestion =>
        typeof item === 'object' && item !== null &&
        typeof item.key === 'string' && item.key.trim() &&
        typeof item.value === 'string'
      )
      .map(item => ({ key: item.key.trim(), value: item.value, reason: item.reason || '' }));
  } catch {
    return [];
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export const AiHeaderSuggest = forwardRef<AiHeaderSuggestHandle, Props>(function AiHeaderSuggest(
  { tabId, method, url, bodyContentType, authType, existingHeaders, onAddHeaders }: Props,
  ref,
) {
  const [suggestions, setSuggestions] = useState<HeaderSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(false);

  const accumulatedRef = useRef('');
  const popoverIdRef = useRef('');

  // Only need activeTab for envId / authType / authData — provider resolution is
  // handled entirely by ai-handler.ts (reads aiDefaultProvider from DB settings).
  // Do NOT compute provider/model here — it resolves to copilot (first "enabled"
  // in store) instead of the user's configured default.
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === tabId));
  const resolve = useAiPromptTemplatesStore(s => s.resolve);

  // ── Listen for AI responses ────────────────────────────────────────────────

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== popoverIdRef.current) return;

      if (msg.type === 'ai:chunk') {
        const delta = (msg.delta as string) || (msg.text as string) || '';
        accumulatedRef.current += delta;
      }
      if (msg.type === 'ai:complete') {
        const msgPayload = msg.message as Record<string, unknown> | undefined;
        const content = accumulatedRef.current || (msgPayload?.content as string) || '';
        const parsed = parseSuggestions(content);
        setSuggestions(parsed);
        setDismissed(new Set());
        setLoading(false);
        if (parsed.length === 0) setError('No suggestions returned — try again or adjust your request.');
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'AI suggestion failed');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── Trigger suggestion ────────────────────────────────────────────────────

  const triggerSuggest = useCallback(() => {
    setLoading(true);
    setError('');
    setSuggestions([]);
    setDismissed(new Set());
    setVisible(true);
    accumulatedRef.current = '';

    const pid = `ai-headers-${Date.now()}`;
    popoverIdRef.current = pid;

    const existingKeys = existingHeaders.filter(r => r.enabled && r.key).map(r => r.key);
    const existing = existingKeys.join(', ') || 'none';
    const authNote = authType === 'none' ? 'No auth configured' : authType;

    const systemPrompt = resolve('rest.headers.suggest.system');
    const userPrompt = resolve('rest.headers.suggest.generate', {
      method,
      url: url || '(no URL yet)',
      contentType: bodyContentType || 'none',
      authType: authNote,
      existing,
    });

    sendAiRequest({
      tabId: pid,
      // Leave provider/model/baseUrl empty — ai-handler.ts reads aiDefaultProvider
      // from DB settings and auto-resolves (same path as DaakiaAiPanel / AiAssistPopover).
      // Passing providerId here was picking copilot (first "enabled" in store, not the
      // user's selected default). Passing activeTab.url was setting the REST URL as
      // the AI base URL — completely wrong.
      provider: '',
      model: '',
      baseUrl: '',
      stage: 'rest.headers.suggest.generate',
      screen: 'REST · Request',
      systemPrompts: [systemPrompt],
      userPrompt,
      conversation: [],
      tools: [],
      settings: { temperature: 0.3, maxTokens: 512, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
      authType: activeTab?.authType,
      authData: activeTab?.authData,
      envId: activeTab?.envId,
    });
  }, [method, url, bodyContentType, authType, existingHeaders, activeTab, resolve]);

  // ── Add one, or all ──────────────────────────────────────────────────────

  const close = useCallback(() => { setVisible(false); setSuggestions([]); setError(''); }, []);

  const add = useCallback((list: HeaderSuggestion[]) => {
    if (!list.length) return;
    onAddHeaders(list.map(s => ({ key: s.key, value: s.value })));
    const next = new Set(dismissed);
    list.forEach(s => next.add(s.key));
    setDismissed(next);
    /* Nothing left to offer: the panel has done its job. */
    if (suggestions.every(s => next.has(s.key))) close();
  }, [onAddHeaders, dismissed, suggestions, close]);

  const visibleSuggestions = suggestions.filter(s => !dismissed.has(s.key));

  useImperativeHandle(ref, () => ({ trigger: triggerSuggest, loading }), [triggerSuggest, loading]);

  // ─────────────────────────────────────────────────────────────────────────

  if (!visible && !loading) return null;

  return (
    <div className="dk-aihs" role="region" aria-label="Suggested headers">
      <div className="dk-aihs__head">
        <SparkleIcon size={13} className="dk-aihs__spark" />
        <span className="dk-aihs__title">{loading ? 'Asking for headers' : 'Suggested headers'}</span>
        {!loading && visibleSuggestions.length > 0 && <span className="dk-aihs__count">{visibleSuggestions.length}</span>}
        {loading && <span className="dk-aihs__dots" aria-hidden="true"><i /><i /><i /></span>}
        <span className="dk-aihs__spacer" />
        {!loading && visibleSuggestions.length > 1 && (
          <button type="button" className="dk-aihs__all" onClick={() => add(visibleSuggestions)}>
            <PlusIcon size={11} /> Add all {visibleSuggestions.length}
          </button>
        )}
        {!loading && error && (
          <button type="button" className="dk-aihs__all" onClick={triggerSuggest}>Try again</button>
        )}
        <IconButtonView size="xs" icon={<CloseIcon size={11} />} tooltip="Dismiss" aria-label="Dismiss suggestions" onClick={close} />
      </div>

      {error && !loading && <div className="dk-aihs__error">{error}</div>}

      {loading && (
        <div className="dk-aihs__list">
          {[62, 48, 70].map(w => (
            <div key={w} className="dk-aihs__row is-ghost"><span className="dk-aihs__shimmer" style={{ width: `${w}%` }} /></div>
          ))}
        </div>
      )}

      {!loading && visibleSuggestions.length > 0 && (
        <div className="dk-aihs__list">
          {visibleSuggestions.map(s => (
            <button
              key={s.key}
              type="button"
              className="dk-aihs__row"
              title={`Add ${s.key}: ${s.value}`}
              onClick={() => add([s])}
            >
              <span className="dk-aihs__key">{s.key}</span>
              <span className="dk-aihs__value">{s.value}</span>
              {s.reason && <span className="dk-aihs__why">{s.reason}</span>}
              <span className="dk-aihs__add"><PlusIcon size={11} /> Add</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
