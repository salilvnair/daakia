/**
 * AiPerformanceInsightsModal — AI-powered performance analysis for collection runs (4.4.5)
 *
 * Accepts completed run results, formats them as a metrics table, and sends to AI
 * via the rest.performance.insights template. Shows actionable optimization suggestions.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { CloseIcon, SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';

interface RequestResult {
  id: string;
  name: string;
  method: string;
  url: string;
  status: number;
  statusText: string;
  time: number;
  size: number;
  error?: string;
}

interface Props {
  collectionName: string;
  results: RequestResult[];
  onClose: () => void;
}

const ACCENT = 'var(--color-warning)';

/** Format results into a human-readable metrics table for the AI */
function formatMetrics(results: RequestResult[]): string {
  const lines = results.map((r, i) => {
    const label = r.name || r.url || `Request ${i + 1}`;
    const sizeKb = r.size > 0 ? `${(r.size / 1024).toFixed(1)} KB` : 'unknown';
    const statusStr = r.error ? `Error: ${r.error.slice(0, 60)}` : `${r.status} ${r.statusText || ''}`.trim();
    return `${i + 1}. [${r.method}] ${label}\n   URL: ${r.url}\n   Status: ${statusStr}\n   Time: ${r.time}ms\n   Size: ${sizeKb}`;
  });

  const times = results.filter(r => !r.error && r.time > 0).map(r => r.time).sort((a, b) => a - b);
  let statsBlock = '';
  if (times.length > 0) {
    const p50 = times[Math.floor(times.length * 0.5)] ?? times[times.length - 1];
    const p90 = times[Math.floor(times.length * 0.9)] ?? times[times.length - 1];
    const p99 = times[Math.floor(times.length * 0.99)] ?? times[times.length - 1];
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const max = times[times.length - 1];
    statsBlock = `\nAggregate stats (${times.length} successful requests):\n  avg: ${avg}ms | p50: ${p50}ms | p90: ${p90}ms | p99: ${p99}ms | max: ${max}ms\n`;
  }

  return statsBlock + '\nPer-request breakdown:\n' + lines.join('\n\n');
}

export function AiPerformanceInsightsModal({ collectionName, results, onClose }: Props) {
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const accRef = useRef('');
  const reqIdRef = useRef('');
  const resolve = useAiPromptTemplatesStore(s => s.resolve);

  // Auto-analyze on mount
  useEffect(() => {
    handleAnalyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;

      if (msg.type === 'ai:chunk') {
        const delta = (msg.delta as string) || (msg.text as string) || '';
        accRef.current += delta;
        setAnalysis(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        const msgPayload = msg.message as Record<string, unknown> | undefined;
        const content = accRef.current || (msgPayload?.content as string) || '';
        setAnalysis(content);
        setLoading(false);
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'Analysis failed.');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleAnalyze = () => {
    if (results.length === 0) {
      setError('No run results to analyze.');
      return;
    }
    setLoading(true);
    setAnalysis('');
    setError('');
    accRef.current = '';

    const pid = `ai-perf-${Date.now()}`;
    reqIdRef.current = pid;

    const metrics = formatMetrics(results);
    const systemPrompt = resolve('rest.performance.insights.system');
    const userPrompt = resolve('rest.performance.insights', {
      collectionName,
      metrics,
    });

    postMsg({
      type: 'ai:send',
      tabId: pid,
      provider: '', model: '', baseUrl: '',
      stage: 'rest.performance.insights',
      systemPrompts: [systemPrompt],
      userPrompt,
      conversation: [],
      tools: [],
      settings: {
        temperature: 0.2,
        maxTokens: 1500,
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
  };

  // Compute quick stats for header badge
  const times = results.filter(r => !r.error && r.time > 0).map(r => r.time);
  const avgTime = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  const slowest = times.length > 0 ? Math.max(...times) : 0;
  const errors = results.filter(r => r.error || r.status >= 400).length;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="w-[680px] max-h-[90vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Performance Insights</p>
            <p className="text-[11px] text-[var(--color-text-muted)] truncate">
              {collectionName} · {results.length} requests · avg {avgTime}ms · max {slowest}ms
              {errors > 0 && <span className="ml-1" style={{ color: 'var(--color-error)' }}>· {errors} error{errors > 1 ? 's' : ''}</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer"
          >
            <CloseIcon size={12} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {/* Quick stats chips */}
          {results.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { label: 'Total', value: `${results.length}` },
                { label: 'Avg', value: `${avgTime}ms` },
                { label: 'Slowest', value: `${slowest}ms` },
                { label: 'Errors', value: `${errors}`, accent: errors > 0 },
              ].map(chip => (
                <span
                  key={chip.label}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px]"
                  style={{
                    backgroundColor: chip.accent
                      ? 'color-mix(in srgb, var(--color-error) 12%, transparent)'
                      : `color-mix(in srgb, ${ACCENT} 10%, var(--color-surface-hover))`,
                    color: chip.accent ? 'var(--color-error)' : ACCENT,
                    border: `1px solid color-mix(in srgb, ${chip.accent ? 'var(--color-error)' : ACCENT} 25%, transparent)`,
                  }}
                >
                  <span className="opacity-70">{chip.label}:</span>
                  <span className="font-medium">{chip.value}</span>
                </span>
              ))}
            </div>
          )}

          {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

          {loading && !analysis && (
            <div className="flex gap-1 items-center py-4">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
              ))}
              <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Analyzing performance metrics…</span>
            </div>
          )}

          {analysis && (
            <div
              className="rounded-lg border p-4"
              style={{
                borderColor: `color-mix(in srgb, ${ACCENT} 20%, var(--color-surface-border))`,
                backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-panel))`,
              }}
            >
              <MdViewer content={analysis} />
              {loading && (
                <span className="inline-block w-[2px] h-[12px] ml-0.5 animate-pulse align-text-bottom"
                  style={{ backgroundColor: ACCENT }} />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3 border-t flex-shrink-0"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          <div>
            {!loading && analysis && (
              <button
                type="button"
                onClick={handleAnalyze}
                className="text-[11px] underline cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              >
                Re-analyze
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-[30px] px-4 text-[12px] font-medium rounded-md cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
