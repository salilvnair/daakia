/**
 * AiApiDiscoveryModal — URL crawler that probes common API paths and discovers endpoints.
 * Feature 4.6.1 — AI API Discovery (URL Crawler)
 *
 * Phase 1: Probe common paths → collect status codes, content types, response snippets
 * Phase 2: AI analyzes results → generates explanation + collection creation prompt
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { postMsg } from '../../vscode';
import { SparkleIcon, PlusIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { ModalView, ButtonView, AIButtonView, TextInputView, MultilineInputView } from '@salilvnair/dui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProbeResult {
  path: string;
  url: string;
  status: number;
  statusText: string;
  contentType: string;
  responseSize: number;
  duration: number;
  snippet: string;
  isApi: boolean;
  error?: string;
}

type Phase = 'idle' | 'probing' | 'done' | 'analyzing' | 'analyzed';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: number): string {
  if (status === 0) return 'var(--color-text-muted)';
  if (status < 300) return 'var(--color-success)';
  if (status < 400) return 'var(--color-warning)';
  if (status < 500) return 'var(--color-error)';
  return 'var(--color-text-muted)';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}kB`;
}

function formatResultsForAi(results: ProbeResult[], baseUrl: string): string {
  const reachable = results.filter(r => r.status > 0 && r.status < 600);
  const lines = [
    `Base URL: ${baseUrl}`,
    `Total probed: ${results.length} paths`,
    `Reachable: ${reachable.length}`,
    '',
    '## Probe Results',
    ...reachable.map(r =>
      `- [${r.status}] ${r.path} (${r.contentType || 'unknown'}, ${r.duration}ms)${r.snippet ? `\n  Preview: ${r.snippet.slice(0, 100)}` : ''}`,
    ),
  ];
  return lines.join('\n');
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  initialUrl?: string;
  onClose: () => void;
}

export function AiApiDiscoveryModal({ initialUrl = '', onClose }: Props) {
  const openDaakiaAiTab = useTabsStore(s => s.openDaakiaAiTab);

  const [baseUrl, setBaseUrl] = useState(initialUrl);
  const [customPaths, setCustomPaths] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [filter, setFilter] = useState<'all' | 'api' | 'reachable'>('api');

  const reqIdRef = useRef(`disc-${Date.now()}`);
  const accRef = useRef('');

  // Listen for discovery events from extension host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (!msg || typeof msg !== 'object') return;
      const reqId = msg.reqId as string | undefined;
      if (reqId && reqId !== reqIdRef.current) return;

      switch (msg.type) {
        case 'ai:discovery:started':
          setProgress({ completed: 0, total: msg.total as number });
          break;

        case 'ai:discovery:progress': {
          const result = msg.result as ProbeResult;
          setResults(prev => [...prev, result]);
          setProgress(prev => prev ? { ...prev, completed: msg.completed as number } : null);
          break;
        }

        case 'ai:discovery:complete':
          setPhase('done');
          setProgress(null);
          break;

        case 'ai:discovery:error':
          setPhase('idle');
          setProgress(null);
          alert(`Discovery error: ${msg.message as string}`);
          break;

        // AI streaming events (for analysis phase)
        case 'ai:chunk': {
          const chunk = msg.chunk as { delta?: { content?: string } } | string;
          const delta = typeof chunk === 'string' ? chunk
            : (chunk?.delta?.content ?? '');
          accRef.current += delta;
          setAnalysis(accRef.current);
          break;
        }
        case 'ai:complete':
          setPhase('analyzed');
          break;
        case 'ai:error':
          setPhase('done');
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleStart = useCallback(() => {
    if (!baseUrl.trim()) return;
    const parsedCustom = customPaths
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.startsWith('/'));

    reqIdRef.current = `disc-${Date.now()}`;
    accRef.current = '';
    setResults([]);
    setAnalysis('');
    setPhase('probing');
    postMsg({
      type: 'ai:discovery:start',
      reqId: reqIdRef.current,
      baseUrl: baseUrl.trim(),
      customPaths: parsedCustom,
      timeoutMs: 5000,
      maxPaths: 80,
    });
  }, [baseUrl, customPaths]);

  const handleAnalyze = useCallback(() => {
    const resultsText = formatResultsForAi(results, baseUrl);
    const systemPrompt = 'You are a senior API developer helping discover and document API endpoints. Be concise and practical.';
    const userMessage = `I probed this API and found these endpoints:\n\n${resultsText}\n\nPlease:\n1. Identify which paths are likely real API endpoints vs static/infra paths\n2. Describe what each endpoint probably does based on the path name and response\n3. Suggest any important endpoints that might be missing (common patterns)\n4. Rate the overall API health/design quality briefly`;

    accRef.current = '';
    setAnalysis('');
    setPhase('analyzing');
    postMsg({
      type: 'ai:send',
      reqId: reqIdRef.current,
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      stream: true,
    });
  }, [results, baseUrl]);

  const handleCreateCollection = useCallback(() => {
    const apiResults = results.filter(r => r.isApi || (r.status > 0 && r.status < 500));
    if (apiResults.length === 0) return;

    // Open AI tab with a pre-filled analysis to create a collection
    openDaakiaAiTab();
    const summaryText = formatResultsForAi(apiResults, baseUrl);
    postMsg({
      type: 'ai:chat:prefill',
      text: `Create a Daakia collection from these discovered API endpoints:\n\n${summaryText}\n\nFor each endpoint, create a request with the path, method GET (unless obvious), and a descriptive name.`,
    });
    onClose();
  }, [results, baseUrl, openDaakiaAiTab, onClose]);

  // Filtered results
  const displayResults = results.filter(r => {
    if (filter === 'api') return r.isApi;
    if (filter === 'reachable') return r.status > 0 && r.status < 600;
    return true;
  });

  const apiCount = results.filter(r => r.isApi).length;
  const reachableCount = results.filter(r => r.status > 0 && r.status < 600).length;

  return (
    <ModalView
      open
      onClose={onClose}
      title="AI API Discovery"
      subtitle="Probe common paths to discover available endpoints automatically"
      size="lg"
      headerColor="var(--color-protocol-ai)"
      headerGradient
      headerIcon={
        <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-protocol-ai)', flexShrink: 0 }}>
          <SparkleIcon size={15} style={{ color: 'var(--color-btn-primary-text, #fff)' }} />
        </div>
      }
      footerLeft={
        phase !== 'idle' && phase !== 'probing' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <AIButtonView
              label={phase === 'analyzing' ? 'Analyzing…' : 'Analyze with AI'}
              size="sm"
              accentColor="var(--color-protocol-ai)"
              disabled={phase === 'analyzing' || results.length === 0}
              onClick={handleAnalyze}
            />
            <ButtonView
              variant="secondary"
              size="sm"
              iconLeft={<PlusIcon size={11} />}
              disabled={results.filter(r => r.status > 0 && r.status < 500).length === 0}
              onClick={handleCreateCollection}
            >
              Create Collection
            </ButtonView>
          </div>
        ) : undefined
      }
      footerRight={
        phase !== 'idle' && phase !== 'probing' ? (
          <ButtonView
            variant="secondary"
            size="sm"
            onClick={() => { setPhase('idle'); setResults([]); setAnalysis(''); setProgress(null); }}
          >
            Reset
          </ButtonView>
        ) : undefined
      }
    >
        <div className="flex flex-col gap-4">
          {/* URL input row */}
          <div className="flex gap-2 items-center">
            <TextInputView
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && phase === 'idle') handleStart(); }}
              placeholder="https://api.example.com"
              size="md"
              width="fw"
              accentColor="var(--color-protocol-ai)"
              disabled={phase === 'probing'}
            />
            <ButtonView
              size="md"
              accentColor="var(--color-protocol-ai)"
              disabled={!baseUrl.trim() || phase === 'probing'}
              onClick={handleStart}
            >
              {phase === 'probing' ? 'Discovering…' : 'Discover'}
            </ButtonView>
          </div>

          {/* Custom paths */}
          {phase === 'idle' && (
            <div>
              <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--color-text-muted)' }}>
                Custom paths (optional, one per line, e.g. /api/v4/users)
              </label>
              <MultilineInputView
                value={customPaths}
                onChange={e => setCustomPaths(e.target.value)}
                rows={3}
                size="md"
                width="fw"
                accentColor="var(--color-protocol-ai)"
                placeholder={`/api/v4/users\n/internal/metrics\n/api/v1/webhooks`}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
              />
            </div>
          )}

          {/* Progress bar */}
          {phase === 'probing' && progress && (
            <div>
              <div className="flex justify-between text-[11px] mb-1" style={{ color: 'var(--color-text-muted)' }}>
                <span>Probing paths…</span>
                <span>{progress.completed} / {progress.total}</span>
              </div>
              <div className="h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-border)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(progress.completed / progress.total) * 100}%`,
                    backgroundColor: 'var(--color-protocol-ai)',
                  }}
                />
              </div>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div>
              {/* Filter pills */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  Show:
                </span>
                {(['api', 'reachable', 'all'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className="h-[22px] px-2.5 text-[10.5px] font-medium rounded-full border transition-all cursor-pointer"
                    style={{
                      borderColor: filter === f ? 'var(--color-protocol-ai)' : 'var(--color-surface-border)',
                      color: filter === f ? 'var(--color-protocol-ai)' : 'var(--color-text-muted)',
                      backgroundColor: filter === f ? 'color-mix(in srgb, var(--color-protocol-ai) 12%, transparent)' : 'transparent',
                    }}
                  >
                    {f === 'api' ? `API endpoints (${apiCount})` : f === 'reachable' ? `Reachable (${reachableCount})` : `All (${results.length})`}
                  </button>
                ))}
              </div>

              {/* Results table */}
              <div
                className="rounded-lg border overflow-hidden"
                style={{ borderColor: 'var(--color-surface-border)', maxHeight: 260, overflowY: 'auto' }}
              >
                <table className="w-full text-[11px]">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--color-surface)', borderBottom: '1px solid var(--color-surface-border)' }}>
                      <th className="px-2 py-1.5 text-left font-semibold" style={{ color: 'var(--color-text-muted)', width: 50 }}>Status</th>
                      <th className="px-2 py-1.5 text-left font-semibold" style={{ color: 'var(--color-text-muted)' }}>Path</th>
                      <th className="px-2 py-1.5 text-left font-semibold" style={{ color: 'var(--color-text-muted)', width: 120 }}>Content-Type</th>
                      <th className="px-2 py-1.5 text-right font-semibold" style={{ color: 'var(--color-text-muted)', width: 60 }}>Size</th>
                      <th className="px-2 py-1.5 text-right font-semibold" style={{ color: 'var(--color-text-muted)', width: 55 }}>ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayResults.map((r, i) => (
                      <tr
                        key={i}
                        style={{ borderBottom: '1px solid var(--color-surface-border)' }}
                        title={r.snippet || r.error || ''}
                      >
                        <td className="px-2 py-1 font-mono font-bold" style={{ color: statusColor(r.status) }}>
                          {r.status || (r.error ? 'ERR' : '—')}
                        </td>
                        <td className="px-2 py-1 font-mono" style={{ color: 'var(--color-text-primary)' }}>
                          {r.path}
                          {r.isApi && (
                            <span className="ml-1.5 px-1 text-[9px] rounded" style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 15%, transparent)', color: 'var(--color-protocol-ai)' }}>API</span>
                          )}
                        </td>
                        <td className="px-2 py-1 truncate" style={{ color: 'var(--color-text-secondary)', maxWidth: 120 }}>
                          {r.contentType || '—'}
                        </td>
                        <td className="px-2 py-1 text-right" style={{ color: 'var(--color-text-muted)' }}>
                          {r.responseSize > 0 ? formatSize(r.responseSize) : '—'}
                        </td>
                        <td className="px-2 py-1 text-right" style={{ color: 'var(--color-text-muted)' }}>
                          {r.duration > 0 ? r.duration : '—'}
                        </td>
                      </tr>
                    ))}
                    {displayResults.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                          {phase === 'probing' ? 'Probing...' : 'No results for this filter'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AI analysis */}
          {(phase === 'analyzing' || phase === 'analyzed') && analysis && (
            <div
              className="rounded-lg border p-3"
              style={{ borderColor: 'color-mix(in srgb, var(--color-protocol-ai) 25%, var(--color-surface-border))' }}
            >
              <div className="text-[11px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--color-protocol-ai)' }}>
                <SparkleIcon size={12} />
                AI Analysis
                {phase === 'analyzing' && <span className="text-[10px] animate-pulse ml-1" style={{ color: 'var(--color-text-muted)' }}>analyzing…</span>}
              </div>
              <div className="text-[12px]" style={{ color: 'var(--color-text-primary)' }}>
                <MdViewer content={analysis} />
              </div>
            </div>
          )}
        </div>
    </ModalView>
  );
}
