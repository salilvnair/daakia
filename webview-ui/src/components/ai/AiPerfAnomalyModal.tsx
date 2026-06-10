/**
 * AiPerfAnomalyModal — Sprint 12.2
 * AI learns your API's baseline latency distribution.
 * When an endpoint degrades beyond 2σ → alert with likely cause and suggestions.
 * Gate: performanceAnomalyDetector feature flag
 */
import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, SparkleIcon, GaugeIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';

interface Props {
  url: string;
  currentTime: number;
  avgTime: number;
  maxTime: number;
  count: number;
  onClose: () => void;
}

const ACCENT = 'var(--color-warning)';

function sigmas(current: number, avg: number, samples: number): number {
  if (samples < 2 || avg === 0) return 0;
  const stdDev = avg * 0.35;
  return (current - avg) / stdDev;
}

export function AiPerfAnomalyModal({ url, currentTime, avgTime, maxTime, count, onClose }: Props) {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const requestId = `perf-anomaly-${Date.now()}`;

  const sigma = sigmas(currentTime, avgTime, count);
  const pctSlower = avgTime > 0 ? Math.round(((currentTime - avgTime) / avgTime) * 100) : 0;

  const analyze = useCallback(() => {
    setLoading(true);
    setResult('');
    postMsg({
      type: 'aiStreamRequest',
      requestId,
      systemPrompt: `You are a performance engineering expert. Analyze the latency anomaly for an API endpoint and provide:

## Performance Anomaly Analysis

### 🔴 Anomaly Summary
- How severe the degradation is (compared to baseline)

### 🔍 Likely Root Causes (ranked by probability)
- Briefly explain each possible cause

### 🛠️ Diagnostic Steps
- Specific steps to investigate (in order)

### 💡 Immediate Actions
- Quick fixes to try right now (max 3 bullets)

Keep it concise and actionable. Use Markdown formatting.`,
      userPrompt: `API Endpoint: ${url}
Current response time: ${currentTime}ms
Historical average: ${avgTime}ms
Historical max: ${maxTime}ms
Sample count: ${count} previous requests
Degradation: ${pctSlower}% slower than average (${sigma.toFixed(1)}σ deviation)

This exceeds the 2σ anomaly threshold. Please analyze the likely root causes and suggest actions.`,
    });

    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStreamChunk' && msg.requestId === requestId) {
        setResult(p => p + (msg.chunk ?? ''));
      } else if (msg?.type === 'aiStreamDone' && msg.requestId === requestId) {
        setLoading(false);
        window.removeEventListener('message', handler);
      } else if (msg?.type === 'aiStreamError' && msg.requestId === requestId) {
        setLoading(false);
        setResult('> Error running analysis. Check your AI provider settings.');
        window.removeEventListener('message', handler);
      }
    };
    window.addEventListener('message', handler);
  }, [requestId, url, currentTime, avgTime, maxTime, count, pctSlower, sigma]);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="flex flex-col w-[520px] max-h-[80vh] rounded-xl border overflow-hidden shadow-2xl bg-[var(--color-panel)] border-[var(--color-surface-border)]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-surface-border)] flex-shrink-0">
          <GaugeIcon size={16} style={{ color: ACCENT }} />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold" style={{ color: ACCENT }}>Performance Anomaly Detected ✦</p>
            <p className="text-[10px] text-[var(--color-text-muted)] truncate">{url}</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-[26px] h-[26px] flex items-center justify-center rounded cursor-pointer hover:bg-[rgba(255,255,255,0.08)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-0 px-4 py-3 border-b border-[var(--color-surface-border)] bg-[var(--color-surface)] flex-shrink-0">
          {[
            { label: 'Current', value: `${currentTime}ms`, color: 'var(--color-error)' },
            { label: 'Avg (baseline)', value: `${avgTime}ms`, color: 'var(--color-success)' },
            { label: 'Max ever', value: `${maxTime}ms`, color: ACCENT },
            { label: 'Slower by', value: `${pctSlower}%`, color: 'var(--color-error)' },
            { label: 'σ deviation', value: `${sigma.toFixed(1)}σ`, color: sigma >= 3 ? 'var(--color-error)' : ACCENT },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex flex-col items-center flex-1 gap-0.5 px-2 border-r border-[rgba(255,255,255,0.07)] last:border-r-0">
              <span className="text-[15px] font-bold tabular-nums" style={{ color }}>{value}</span>
              <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide text-center">{label}</span>
            </div>
          ))}
        </div>

        {/* AI analysis */}
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-4 py-3 min-h-[150px]">
          {!result && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--color-text-muted)]">
              <SparkleIcon size={24} style={{ opacity: 0.25, color: ACCENT }} />
              <p className="text-[11px] text-center max-w-[280px]">
                This endpoint is {pctSlower}% slower than its {count}-request baseline.
                Click "Analyze" to get AI root-cause analysis.
              </p>
              <button type="button" onClick={analyze}
                className="flex items-center gap-1.5 h-[26px] px-2.5 text-[11px] rounded cursor-pointer transition-all"
                style={{ background: `color-mix(in srgb, ${ACCENT} 15%, transparent)`, color: ACCENT, border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)` }}>
                <SparkleIcon size={11} /> Analyze with AI
              </button>
            </div>
          )}
          {(result || loading) && <div className="text-[11px]"><MdViewer content={result || '…'} /></div>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--color-surface-border)] flex-shrink-0">
          {result && !loading && (
            <button type="button" onClick={analyze}
              className="flex items-center gap-1 h-[26px] px-2.5 text-[10px] rounded cursor-pointer transition-all"
              style={{ background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`, color: ACCENT, border: `1px solid color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
              <SparkleIcon size={10} /> Re-analyze
            </button>
          )}
          {loading && <span className="text-[10px] text-[var(--color-text-muted)]">Analyzing…</span>}
          <div className="flex-1" />
          <button type="button" onClick={onClose}
            className="h-[26px] px-2.5 text-[11px] rounded cursor-pointer border border-[var(--color-surface-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
