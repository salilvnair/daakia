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
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { useTabsStore } from '../../store/tabs-store';
import type { KeyValueRow } from '../shared';
import { SparkleIcon, CloseIcon, PlusIcon } from '../../icons';
import { postMsg } from '../../vscode';

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

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildHeaderPrompt(method: string, url: string, contentType: string, authType: string, existingKeys: string[]): string {
  const existing = existingKeys.filter(Boolean).join(', ') || 'none';
  const authNote = authType === 'none' ? 'No auth configured' : `Auth type: ${authType} (auth header will be added automatically)`;

  return `Suggest HTTP request headers for this API call.

Request context:
- Method: ${method}
- URL: ${url || '(no URL yet)'}
- Body Content-Type: ${contentType || 'none'}
- ${authNote}
- Headers already set: ${existing}

Return ONLY a JSON array. No markdown, no explanation, no code fences. Example format:
[{"key":"Accept","value":"application/json","reason":"Specify expected response format"},{"key":"X-Request-ID","value":"{{$random.uuid}}","reason":"Correlation ID for distributed tracing"}]

Rules:
- Suggest 3 to 6 headers
- Skip any header already in the "Headers already set" list
- Skip Content-Type if it is already set or if method is GET/HEAD
- Skip Authorization if auth is already configured
- Tailor suggestions to the URL pattern and method (e.g. pagination headers for GET lists, idempotency keys for POST)
- Use Daakia variable syntax {{$random.uuid}} for dynamic IDs
- Keep reason to one short sentence`;
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

export function AiHeaderSuggest({ tabId, method, url, bodyContentType, authType, existingHeaders, onAddHeader }: Props) {
  const [suggestions, setSuggestions] = useState<HeaderSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(false);

  const accumulatedRef = useRef('');
  const popoverIdRef = useRef('');

  const providers = useAiProvidersStore(s => s.providers);
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === tabId));
  const providerId = activeTab?.aiProvider || providers.find(p => p.enabled)?.id || 'openai';
  const model = activeTab?.aiModel || providers.find(p => p.id === providerId)?.models.find(m => m.enabled)?.id || '';

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

    postMsg({
      type: 'ai:send',
      tabId: pid,
      provider: providerId,
      model,
      baseUrl: activeTab?.url || '',
      systemPrompts: ['You are a precise HTTP header suggestion assistant. Always return valid JSON arrays only — never explanatory text.'],
      userPrompt: buildHeaderPrompt(method, url, bodyContentType, authType, existingKeys),
      conversation: [],
      tools: [],
      settings: { temperature: 0.3, maxTokens: 512, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
      authType: activeTab?.authType,
      authData: activeTab?.authData,
      envId: activeTab?.envId,
    });
  }, [method, url, bodyContentType, authType, existingHeaders, providerId, model, activeTab]);

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

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="mb-2">
      {/* Trigger button — always visible */}
      <div className="flex items-center gap-2 px-1 mb-1.5">
        <button
          type="button"
          onClick={triggerSuggest}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-all border"
          style={{
            color: loading ? 'var(--color-text-muted)' : ACCENT,
            borderColor: `color-mix(in srgb, ${ACCENT} 25%, transparent)`,
            backgroundColor: loading ? 'transparent' : `color-mix(in srgb, ${ACCENT} 7%, transparent)`,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
          title="Ask AI to suggest relevant headers for this request"
        >
          {loading ? (
            <>
              <div className="flex gap-0.5">
                {[0, 120, 240].map(d => (
                  <span key={d} className="w-[3px] h-[3px] rounded-full animate-pulse" style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
                ))}
              </div>
              Suggesting…
            </>
          ) : (
            <>
              <SparkleIcon size={10} style={{ color: ACCENT }} />
              Suggest headers
            </>
          )}
        </button>

        {/* Error */}
        {error && !loading && (
          <span className="text-[10px] text-[var(--color-error)] truncate max-w-[200px]">{error}</span>
        )}

        {/* "Add all" — when there are visible suggestions */}
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

        {/* Dismiss strip */}
        {visible && (suggestions.length > 0 || allAdded) && !loading && (
          <button
            type="button"
            onClick={() => { setVisible(false); setSuggestions([]); setError(''); }}
            className="ml-auto w-[18px] h-[18px] flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer transition-opacity"
            title="Dismiss suggestions"
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
      {loading && visible && (
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
}

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
