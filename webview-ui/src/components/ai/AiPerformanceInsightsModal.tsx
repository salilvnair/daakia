/**
 * AiPerformanceInsightsModal — AI-powered performance analysis for collection runs (4.4.5)
 *
 * Accepts completed run results, formats them as a metrics table, and sends to AI
 * via the rest.performance.insights template. Shows actionable optimization suggestions.
 */
import { useState, useEffect, useRef } from 'react';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';
import { ModalView, AIButtonView } from '@salilvnair/dui';

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

  return (
    <ModalView
      open
      onClose={onClose}
      title="Performance Insights"
      subtitle={`${collectionName} · ${results.length} requests · avg ${avgTime}ms · max ${slowest}ms${errors > 0 ? ` · ${errors} error${errors > 1 ? 's' : ''}` : ''}`}
      size="xl"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={
        !loading && analysis ? (
          <AIButtonView label="Re-analyze" size="md" accentColor={ACCENT} onClick={handleAnalyze} />
        ) : undefined
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
    </ModalView>
  );
}
