/**
 * AiEnvExtractModal — AI-powered environment variable extractor (4.3.6)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useEnvStore } from '../../store/env-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { PlusIcon, SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import type { CollectionTreeNode, CollectionRequest } from '../../services/collections';
import { ModalView, ButtonView } from '@salilvnair/dui';

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

function flattenRequests(node: CollectionTreeNode): CollectionRequest[] {
  const reqs: CollectionRequest[] = [...node.requests];
  for (const child of node.children) reqs.push(...flattenRequests(child));
  return reqs;
}

function buildRequestsSummary(requests: CollectionRequest[]): string {
  return requests.slice(0, 40).map((req, i) => {
    let line = `${i + 1}. [${req.method}] ${req.url}`;
    if (req.data) {
      try {
        const d = JSON.parse(req.data) as Record<string, unknown>;
        const hdrs = (d.headers as Array<{ key: string; value: string; enabled?: boolean }> | undefined)
          ?.filter(h => h.enabled !== false && h.key).slice(0, 3).map(h => `${h.key}: ${h.value}`).join(', ');
        if (hdrs) line += `\n   Headers: ${hdrs}`;
        const body = d.bodyRaw as string | undefined;
        if (body && body.length > 4) line += `\n   Body: ${body.slice(0, 120)}`;
      } catch { /* skip */ }
    }
    return line;
  }).join('\n');
}

function parseSuggestions(raw: string): EnvSuggestion[] {
  const stripped = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
  try {
    const parsed = JSON.parse(stripped);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is EnvSuggestion =>
        typeof item === 'object' && item !== null &&
        typeof item.name === 'string' && item.name.trim() && typeof item.value === 'string')
      .map(s => ({ name: s.name.trim(), value: s.value, reason: s.reason || '', occurrences: typeof s.occurrences === 'number' ? s.occurrences : 1 }));
  } catch { return []; }
}

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

  useEffect(() => { handleAnalyze(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;
      if (msg.type === 'ai:chunk') { accumulatedRef.current += (msg.delta as string) || (msg.text as string) || ''; }
      if (msg.type === 'ai:complete') {
        const content = accumulatedRef.current || ((msg.message as Record<string, unknown>)?.content as string) || '';
        const parsed = parseSuggestions(content);
        setSuggestions(parsed);
        setLoading(false);
        setRan(true);
        if (parsed.length === 0) setError('No hardcoded values found — collection may already use variables.');
      }
      if (msg.type === 'ai:error') { setError((msg.message as string) || 'AI analysis failed.'); setLoading(false); setRan(true); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleAnalyze = useCallback(() => {
    const requests = flattenRequests(collectionNode);
    if (requests.length === 0) { setError('This collection has no requests to analyze.'); setRan(true); return; }
    setLoading(true); setError(''); setSuggestions([]); setAdded(new Set()); accumulatedRef.current = '';
    const pid = `ai-env-extract-${Date.now()}`;
    reqIdRef.current = pid;
    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'rest.env.extract',
      systemPrompts: [resolve('rest.env.extract.system')],
      userPrompt: resolve('rest.env.extract', { collectionName: collectionNode.name, requests: buildRequestsSummary(requests) }),
      conversation: [], tools: [],
      settings: { temperature: 0.2, maxTokens: 1024, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  }, [collectionNode, resolve]);

  const handleAdd = useCallback((s: EnvSuggestion) => {
    const envId = activeEnvId;
    if (!envId) return;
    const env = environments.find(e => e.id === envId);
    if (!env) return;
    if (env.variables.some(v => v.key === s.name)) { setAdded(prev => new Set(prev).add(s.name)); return; }
    updateVariables(envId, [...env.variables, {
      id: crypto.randomUUID(), key: s.name, initialValue: s.value, currentValue: s.value,
      isSecret: /key|token|secret|password|pass|apikey|auth/i.test(s.name),
    }]);
    setAdded(prev => new Set(prev).add(s.name));
  }, [activeEnvId, environments, updateVariables]);

  const handleAddAll = useCallback(() => {
    suggestions.filter(s => !added.has(s.name)).forEach(s => handleAdd(s));
  }, [suggestions, added, handleAdd]);

  const activeEnvName = environments.find(e => e.id === activeEnvId)?.name || 'Global';
  const visibleSuggestions = suggestions.filter(s => !added.has(s.name));
  const allAdded = suggestions.length > 0 && visibleSuggestions.length === 0;

  const footerLeft = ran && !loading && suggestions.length > 0 ? (
    <button
      type="button"
      onClick={handleAnalyze}
      className="text-[11px] underline cursor-pointer transition-colors"
      style={{ color: 'var(--color-text-muted)' }}
    >
      Re-analyze
    </button>
  ) : undefined;

  const footerRight = visibleSuggestions.length > 1 && !loading ? (
    <ButtonView size="sm" accentColor={ACCENT} variant="primary" onClick={handleAddAll}>
      Add All ({visibleSuggestions.length})
    </ButtonView>
  ) : undefined;

  return (
    <ModalView
      open
      onClose={onClose}
      title="Extract Environment Variables"
      subtitle={`${collectionNode.name} → ${activeEnvName}`}
      size="md"
      elevated
      headerColor={ACCENT}
      headerIcon={<SparkleIcon size={16} style={{ color: ACCENT }} />}
      footerLeft={footerLeft}
      footerRight={footerRight}
    >
      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center gap-3 py-8">
          <div className="flex gap-1">
            {[0, 150, 300].map(d => (
              <span key={d} className="w-[6px] h-[6px] rounded-full animate-pulse"
                style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
            ))}
          </div>
          <p className="text-[12px] text-[var(--color-text-muted)]">Analyzing {flattenRequests(collectionNode).length} requests…</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="text-[12px] py-2" style={{ color: 'var(--color-error)' }}>{error}</div>
      )}

      {/* All added */}
      {allAdded && !loading && (
        <div className="text-[12px] py-2" style={{ color: 'var(--color-success)' }}>
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
            {visibleSuggestions.map(s => <SuggestionRow key={s.name} suggestion={s} onAdd={handleAdd} />)}
          </div>
        </>
      )}

      {/* Added chips */}
      {added.size > 0 && !loading && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from(added).map(name => (
            <span key={name} className="inline-flex items-center gap-1 h-[22px] px-2 rounded-full text-[10px] font-mono"
              style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 12%, transparent)`, color: ACCENT, border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)` }}>
              ✓ {name}
            </span>
          ))}
        </div>
      )}
    </ModalView>
  );
}

function SuggestionRow({ suggestion, onAdd }: { suggestion: EnvSuggestion; onAdd: (s: EnvSuggestion) => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-all"
      style={{
        borderColor: hovered ? `color-mix(in srgb, ${ACCENT} 35%, transparent)` : 'var(--color-surface-border)',
        backgroundColor: hovered ? `color-mix(in srgb, ${ACCENT} 5%, var(--color-panel))` : 'var(--color-panel)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[12px] font-mono font-semibold text-[var(--color-text-primary)]">{`{{${suggestion.name}}}`}</span>
          {suggestion.occurrences > 1 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 12%, transparent)`, color: ACCENT }}>
              ×{suggestion.occurrences}
            </span>
          )}
        </div>
        <p className="text-[11px] font-mono text-[var(--color-text-muted)] truncate mb-0.5">{suggestion.value}</p>
        <p className="text-[10px] text-[var(--color-text-muted)] opacity-70">{suggestion.reason}</p>
      </div>
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
