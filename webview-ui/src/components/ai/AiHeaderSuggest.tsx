/**
 * AiHeaderSuggest — AI-powered header autocomplete for the Headers tab.
 *
 * Task: 4.3.4 — AI Auto-complete Headers
 *
 * Shows a "✨ Suggest" button above the KeyValueTable.
 * On click: asks the active AI provider to suggest relevant headers based on
 * the request's method, URL, body content-type, and auth type.
 * Suggestions appear as clickable chips — one click adds the header row.
 */
import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import type { KeyValueRow } from '../shared';
import { CloseIcon, PlusIcon } from '../../icons';
import { postMsg } from '../../vscode';

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
  onAddHeader: (key: string, value: string) => void;
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
  { tabId, method, url, bodyContentType, authType, existingHeaders, onAddHeader }: Props,
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

    postMsg({
      type: 'ai:send',
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

  // ── Add a single suggestion ───────────────────────────────────────────────

  const handleAdd = useCallback((s: HeaderSuggestion) => {
    onAddHeader(s.key, s.value);
    setDismissed(prev => new Set(prev).add(s.key));
  }, [onAddHeader]);

  // ── Add all suggestions at once ───────────────────────────────────────────

  const handleAddAll = useCallback(() => {
    const toAdd = suggestions.filter(s => !dismissed.has(s.key));
    toAdd.forEach(s => onAddHeader(s.key, s.value));
    setDismissed(prev => {
      const next = new Set(prev);
      toAdd.forEach(s => next.add(s.key));
      return next;
    });
  }, [suggestions, dismissed, onAddHeader]);

  const visibleSuggestions = suggestions.filter(s => !dismissed.has(s.key));
  const allAdded = suggestions.length > 0 && visibleSuggestions.length === 0;

  useImperativeHandle(ref, () => ({ trigger: triggerSuggest, loading }), [triggerSuggest, loading]);

  // ─────────────────────────────────────────────────────────────────────────

  if (!visible && !loading) return null;

  return (
    <div className="mb-2">
      {/* Inline status row */}
      <div className="flex items-center gap-2 px-1 mb-1.5">
        {/* Loading indicator */}
        {loading && (
          <div className="flex gap-0.5 items-center">
            {[0, 120, 240].map(d => (
              <span key={d} className="w-[4px] h-[4px] rounded-full animate-pulse" style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
            ))}
            <span className="text-[11px] ml-1.5" style={{ color: ACCENT }}>Suggesting…</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <span className="text-[10px] text-[var(--color-error)] truncate max-w-[280px]">{error}</span>
        )}

        {/* "Add all" */}
        {visibleSuggestions.length > 1 && !loading && (
          <button
            type="button"
            onClick={handleAddAll}
            className="text-[10px] cursor-pointer transition-colors"
            style={{ color: ACCENT }}
          >
            Add all ({visibleSuggestions.length})
          </button>
        )}

        {/* Dismiss */}
        {(suggestions.length > 0 || allAdded || error) && !loading && (
          <button
            type="button"
            onClick={() => { setVisible(false); setSuggestions([]); setError(''); }}
            className="ml-auto w-[18px] h-[18px] flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer transition-opacity"
            title="Dismiss"
          >
            <CloseIcon size={10} />
          </button>
        )}
      </div>

      {/* Suggestion chips */}
      {visible && visibleSuggestions.length > 0 && !loading && (
        <div className="flex flex-wrap gap-1.5 px-1 mb-2">
          {visibleSuggestions.map(s => (
            <SuggestionChip key={s.key} suggestion={s} onAdd={handleAdd} />
          ))}
          {allAdded && (
            <span className="text-[11px] text-[var(--color-text-muted)] italic">All suggestions added ✓</span>
          )}
        </div>
      )}

      {/* Loading skeleton chips */}
      {loading && (
        <div className="flex flex-wrap gap-1.5 px-1 mb-2">
          {[80, 120, 100, 90].map(w => (
            <div
              key={w}
              className="h-[24px] rounded-full animate-pulse"
              style={{ width: w, backgroundColor: `color-mix(in srgb, ${ACCENT} 12%, var(--color-surface-border))` }}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// ─── Single suggestion chip ───────────────────────────────────────────────────

function SuggestionChip({ suggestion, onAdd }: { suggestion: HeaderSuggestion; onAdd: (s: HeaderSuggestion) => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onAdd(suggestion)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative flex items-center gap-1.5 h-[24px] pl-2.5 pr-2 rounded-full text-[11px] font-mono cursor-pointer transition-all border"
      style={{
        borderColor: `color-mix(in srgb, ${ACCENT} ${hovered ? '45%' : '25%'}, transparent)`,
        backgroundColor: hovered ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : `color-mix(in srgb, ${ACCENT} 7%, transparent)`,
        color: hovered ? ACCENT : 'var(--color-text-primary)',
      }}
      title={suggestion.reason || `Add ${suggestion.key}: ${suggestion.value}`}
    >
      <PlusIcon size={9} style={{ color: ACCENT, flexShrink: 0 }} />
      <span style={{ color: hovered ? ACCENT : 'var(--color-text-muted)' }}>{suggestion.key}:</span>
      <span className="max-w-[140px] truncate">{suggestion.value}</span>
    </button>
  );
}
