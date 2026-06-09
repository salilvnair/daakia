/**
 * AiEnvExtractModal — AI-powered environment variable extractor (4.3.6)
 *
 * Analyzes a collection's requests → identifies hardcoded values that should
 * be `{{variables}}` → lets the user add them to the active environment in
 * one click.
 *
 * Opens from the collection context menu: "Extract Variables with AI"
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useEnvStore } from '../../store/env-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { CloseIcon, PlusIcon, SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import type { CollectionTreeNode, CollectionRequest } from '../../services/collections';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnvSuggestion {
  name: string;
  value: string;
  reason: string;
  occurrences: number;
}

interface Props {
  collectionNode: CollectionTreeNode;
  onClose: () => void;
}

const ACCENT = 'var(--color-success)';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Recursively collect all requests from a tree node */
function flattenRequests(node: CollectionTreeNode): CollectionRequest[] {
  const reqs: CollectionRequest[] = [...node.requests];
  for (const child of node.children) {
    reqs.push(...flattenRequests(child));
  }
  return reqs;
}

/** Build compact text summary of requests for the AI prompt */
function buildRequestsSummary(requests: CollectionRequest[]): string {
  return requests.slice(0, 40).map((req, i) => {
    let line = `${i + 1}. [${req.method}] ${req.url}`;
    if (req.data) {
      try {
        const d = JSON.parse(req.data) as Record<string, unknown>;
        // Include headers (first 3)
        const hdrs = (d.headers as Array<{ key: string; value: string; enabled?: boolean }> | undefined)
          ?.filter(h => h.enabled !== false && h.key)
          .slice(0, 3)
          .map(h => `${h.key}: ${h.value}`)
          .join(', ');
        if (hdrs) line += `\n   Headers: ${hdrs}`;
        // Include body sample (truncated)
        const body = d.bodyRaw as string | undefined;
        if (body && body.length > 4) line += `\n   Body: ${body.slice(0, 120)}`;
      } catch { /* skip malformed data */ }
    }
    return line;
  }).join('\n');
}

/** Parse JSON suggestions, strips markdown fences */
function parseSuggestions(raw: string): EnvSuggestion[] {
  const stripped = raw
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();
  try {
    const parsed = JSON.parse(stripped);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is EnvSuggestion =>
        typeof item === 'object' && item !== null &&
        typeof item.name === 'string' && item.name.trim() &&
        typeof item.value === 'string'
      )
      .map(s => ({
        name: s.name.trim(),
        value: s.value,
        reason: s.reason || '',
        occurrences: typeof s.occurrences === 'number' ? s.occurrences : 1,
      }));
  } catch {
    return [];
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AiEnvExtractModal({ collectionNode, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<EnvSuggestion[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [ran, setRan] = useState(false);

  const accumulatedRef = useRef('');
  const reqIdRef = useRef('');

  const { environments, activeEnvId, updateVariables } = useEnvStore();
  const resolve = useAiPromptTemplatesStore(s => s.resolve);

  // ── Auto-start analysis on mount ─────────────────────────────────────────
  useEffect(() => {
    handleAnalyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Listen for AI stream messages ─────────────────────────────────────────
  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;

      if (msg.type === 'ai:chunk') {
        const delta = (msg.delta as string) || (msg.text as string) || '';
        accumulatedRef.current += delta;
      }
      if (msg.type === 'ai:complete') {
        const msgPayload = msg.message as Record<string, unknown> | undefined;
        const content = accumulatedRef.current || (msgPayload?.content as string) || '';
        const parsed = parseSuggestions(content);
        setSuggestions(parsed);
        setLoading(false);
        setRan(true);
        if (parsed.length === 0) setError('No hardcoded values found — your collection may already use variables, or try adding more requests first.');
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'AI analysis failed. Check your AI provider settings.');
        setLoading(false);
        setRan(true);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── Trigger analysis ──────────────────────────────────────────────────────
  const handleAnalyze = useCallback(() => {
    const requests = flattenRequests(collectionNode);
    if (requests.length === 0) {
      setError('This collection has no requests to analyze.');
      setRan(true);
      return;
    }

    setLoading(true);
    setError('');
    setSuggestions([]);
    setAdded(new Set());
    accumulatedRef.current = '';

    const pid = `ai-env-extract-${Date.now()}`;
    reqIdRef.current = pid;

    const systemPrompt = resolve('rest.env.extract.system');
    const userPrompt = resolve('rest.env.extract', {
      collectionName: collectionNode.name,
      requests: buildRequestsSummary(requests),
    });

    postMsg({
      type: 'ai:send',
      tabId: pid,
      provider: '',
      model: '',
      baseUrl: '',
      stage: 'rest.env.extract',
      systemPrompts: [systemPrompt],
      userPrompt,
      conversation: [],
      tools: [],
      settings: {
        temperature: 0.2,
        maxTokens: 1024,
        stream: true,
        topP: 1,
        stopSequences: [],
        responseFormat: 'text',
        frequencyPenalty: 0,
        presencePenalty: 0,
        seed: null,
      },
      mcpServerConfigs: [],
    });
  }, [collectionNode, resolve]);

  // ── Add single suggestion to environment ──────────────────────────────────
  const handleAdd = useCallback((s: EnvSuggestion) => {
    const envId = activeEnvId;
    if (!envId) return;
    const env = environments.find(e => e.id === envId);
    if (!env) return;

    // Skip if variable already exists with this name
    if (env.variables.some(v => v.key === s.name)) {
      setAdded(prev => new Set(prev).add(s.name));
      return;
    }

    const newVar = {
      id: crypto.randomUUID(),
      key: s.name,
      initialValue: s.value,
      currentValue: s.value,
      isSecret: /key|token|secret|password|pass|apikey|auth/i.test(s.name),
    };
    updateVariables(envId, [...env.variables, newVar]);
    setAdded(prev => new Set(prev).add(s.name));
  }, [activeEnvId, environments, updateVariables]);

  // ── Add all at once ───────────────────────────────────────────────────────
  const handleAddAll = useCallback(() => {
    const toAdd = suggestions.filter(s => !added.has(s.name));
    toAdd.forEach(s => handleAdd(s));
  }, [suggestions, added, handleAdd]);

  const activeEnvName = environments.find(e => e.id === activeEnvId)?.name || 'Global';
  const visibleSuggestions = suggestions.filter(s => !added.has(s.name));
  const allAdded = suggestions.length > 0 && visibleSuggestions.length === 0;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="w-[520px] max-h-[80vh] flex flex-col rounded-xl border shadow-2xl"
        style={{
          backgroundColor: 'var(--color-panel)',
          borderColor: 'var(--color-surface-border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2.5 px-5 py-4 border-b"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          <SparkleIcon size={16} style={{ color: ACCENT, flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Extract Environment Variables</p>
            <p className="text-[11px] text-[var(--color-text-muted)] truncate">{collectionNode.name} → {activeEnvName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer transition-opacity"
          >
            <CloseIcon size={12} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]">
          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <div className="flex gap-1">
                {[0, 150, 300].map(d => (
                  <span
                    key={d}
                    className="w-[6px] h-[6px] rounded-full animate-pulse"
                    style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
              <p className="text-[12px] text-[var(--color-text-muted)]">Analyzing {flattenRequests(collectionNode).length} requests…</p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="text-[12px] text-[var(--color-error)] py-2">{error}</div>
          )}

          {/* All added */}
          {allAdded && !loading && (
            <div className="text-[12px] text-[var(--color-success)] py-2">
              ✓ All variables added to <strong>{activeEnvName}</strong>
            </div>
          )}

          {/* Suggestions */}
          {visibleSuggestions.length > 0 && !loading && (
            <>
              <p className="text-[11px] text-[var(--color-text-muted)] mb-3">
                Found <strong style={{ color: ACCENT }}>{suggestions.length}</strong> variable{suggestions.length !== 1 ? 's' : ''} to extract.
                {' '}Click to add each to <strong>{activeEnvName}</strong>.
              </p>
              <div className="flex flex-col gap-2">
                {visibleSuggestions.map(s => (
                  <SuggestionRow key={s.name} suggestion={s} onAdd={handleAdd} />
                ))}
              </div>
            </>
          )}

          {/* Already added chips */}
          {added.size > 0 && !loading && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Array.from(added).map(name => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 h-[22px] px-2 rounded-full text-[10px] font-mono"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
                    color: ACCENT,
                    border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)`,
                  }}
                >
                  ✓ {name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3 border-t"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          <div className="text-[11px] text-[var(--color-text-muted)]">
            {ran && !loading && suggestions.length > 0 && (
              <button
                type="button"
                onClick={handleAnalyze}
                className="underline cursor-pointer hover:text-[var(--color-text-primary)] transition-colors"
              >
                Re-analyze
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {visibleSuggestions.length > 1 && !loading && (
              <button
                type="button"
                onClick={handleAddAll}
                className="h-[30px] px-4 rounded-md text-[12px] font-medium text-white cursor-pointer transition-opacity hover:opacity-90"
                style={{ backgroundColor: ACCENT }}
              >
                Add All ({visibleSuggestions.length})
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="h-[30px] px-4 rounded-md text-[12px] font-medium cursor-pointer transition-colors bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ─── Single suggestion row ────────────────────────────────────────────────────

function SuggestionRow({ suggestion, onAdd }: { suggestion: EnvSuggestion; onAdd: (s: EnvSuggestion) => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-all"
      style={{
        borderColor: hovered
          ? `color-mix(in srgb, ${ACCENT} 35%, transparent)`
          : 'var(--color-surface-border)',
        backgroundColor: hovered
          ? `color-mix(in srgb, ${ACCENT} 5%, var(--color-panel))`
          : 'var(--color-panel)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Name + value */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[12px] font-mono font-semibold text-[var(--color-text-primary)]">
            {`{{${suggestion.name}}}`}
          </span>
          {suggestion.occurrences > 1 && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
                color: ACCENT,
              }}
            >
              ×{suggestion.occurrences}
            </span>
          )}
        </div>
        <p className="text-[11px] font-mono text-[var(--color-text-muted)] truncate mb-0.5">
          {suggestion.value}
        </p>
        <p className="text-[10px] text-[var(--color-text-muted)] opacity-70">
          {suggestion.reason}
        </p>
      </div>

      {/* Add button */}
      <button
        type="button"
        onClick={() => onAdd(suggestion)}
        className="flex-shrink-0 flex items-center gap-1.5 h-[28px] px-3 rounded-md text-[11px] font-medium cursor-pointer transition-all border"
        style={{
          borderColor: hovered ? ACCENT : 'var(--color-surface-border)',
          backgroundColor: hovered ? `color-mix(in srgb, ${ACCENT} 15%, transparent)` : 'transparent',
          color: hovered ? ACCENT : 'var(--color-text-muted)',
        }}
      >
        <PlusIcon size={10} />
        Add
      </button>
    </div>
  );
}
