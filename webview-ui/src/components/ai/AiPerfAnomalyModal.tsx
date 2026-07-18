/**
 * AiPerfAnomalyModal — Sprint 12.2
 * AI learns your API's baseline latency distribution.
 * When an endpoint degrades beyond 2σ → alert with likely cause and suggestions.
 * Gate: performanceAnomalyDetector feature flag
 */
import { useState, useCallback } from 'react';
import { SparkleIcon, GaugeIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView } from '@salilvnair/dui';

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

  return (
    <ModalView
      open
      onClose={onClose}
      title="Performance Anomaly Detected"
      subtitle={url}
      size="md"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <GaugeIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={
        result && !loading ? (
          <AIButtonView label="Re-analyze" size="md" accentColor={ACCENT} onClick={analyze} />
        ) : loading ? (
          <span className="text-[10px] text-[var(--color-text-muted)]">Analyzing…</span>
        ) : undefined
      }
    >
      {/* Stats row */}
      <div className="flex items-center gap-0 rounded-lg border mb-4 overflow-hidden" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface)' }}>
        {[
          { label: 'Current', value: `${currentTime}ms`, color: 'var(--color-error)' },
          { label: 'Avg (baseline)', value: `${avgTime}ms`, color: 'var(--color-success)' },
          { label: 'Max ever', value: `${maxTime}ms`, color: ACCENT },
          { label: 'Slower by', value: `${pctSlower}%`, color: 'var(--color-error)' },
          { label: 'σ deviation', value: `${sigma.toFixed(1)}σ`, color: sigma >= 3 ? 'var(--color-error)' : ACCENT },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex flex-col items-center flex-1 gap-0.5 px-2 py-3 border-r border-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)] last:border-r-0">
            <span className="text-[15px] font-bold tabular-nums" style={{ color }}>{value}</span>
            <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide text-center">{label}</span>
          </div>
        ))}
      </div>

      {/* AI analysis */}
      {!result && !loading && (
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-[var(--color-text-muted)]">
          <SparkleIcon size={24} style={{ opacity: 0.25, color: ACCENT }} />
          <p className="text-[11px] text-center max-w-[280px]">
            This endpoint is {pctSlower}% slower than its {count}-request baseline.
            Click "Analyze" to get AI root-cause analysis.
          </p>
          <AIButtonView label="Analyze with AI" size="md" accentColor={ACCENT} onClick={analyze} />
        </div>
      )}
      {(result || loading) && <div className="text-[11px]"><MdViewer content={result || '…'} /></div>}
    </ModalView>
  );
}
