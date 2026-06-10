/**
 * AiInsightsTab — Sprint 12.1 AI Intelligence Dashboard.
 * Aggregates request history across all protocols, surfaces slowest endpoints,
 * highest error rates, usage patterns, and runs an AI analysis on demand.
 * Gate: intelligenceDashboard feature flag.
 */
import { useState, useMemo, useCallback } from 'react';
import { SparkleIcon, GaugeIcon, ChevronRightIcon, RefreshIcon } from '../../../icons';
import { MdViewer } from '../display/MdViewer';
import { useSidebarDataStore } from '../../../store/sidebar-data-store';
import { useAiFeaturesStore } from '../../../store/ai-features-store';
import { postMsg } from '../../../vscode';

const ACCENT = 'var(--color-protocol-ai)';
const PROTOCOLS = ['rest', 'graphql', 'grpc', 'soap', 'websocket', 'sse', 'mqtt', 'socketio'];

interface EndpointStat {
  url: string;
  method: string;
  protocol: string;
  count: number;
  errorCount: number;
  avgTime: number;
  maxTime: number;
  errorRate: number;
}

function buildStats(history: ReturnType<typeof useSidebarDataStore.getState>['history']): EndpointStat[] {
  const map = new Map<string, { times: number[]; errors: number; protocol: string; method: string }>();
  for (const proto of PROTOCOLS) {
    const entries = history[proto] ?? [];
    for (const e of entries) {
      const key = `${e.method}::${e.url}`;
      if (!map.has(key)) map.set(key, { times: [], errors: 0, protocol: proto, method: e.method });
      const s = map.get(key)!;
      if (e.response_time != null) s.times.push(e.response_time);
      if (e.status === 0 || e.status >= 400) s.errors++;
    }
  }
  return Array.from(map.entries()).map(([key, s]) => {
    const [, url] = key.split('::');
    const count = Math.max(s.times.length, s.errors);
    const avgTime = s.times.length ? Math.round(s.times.reduce((a, b) => a + b, 0) / s.times.length) : 0;
    const maxTime = s.times.length ? Math.max(...s.times) : 0;
    return { url, method: s.method, protocol: s.protocol, count, errorCount: s.errors, avgTime, maxTime, errorRate: count > 0 ? Math.round((s.errors / count) * 100) : 0 };
  });
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function statusColor(rate: number): string {
  if (rate === 0) return 'var(--color-success)';
  if (rate < 20) return 'var(--color-warning)';
  return 'var(--color-error)';
}

function speedColor(ms: number): string {
  if (ms < 200) return 'var(--color-success)';
  if (ms < 1000) return 'var(--color-warning)';
  return 'var(--color-error)';
}

export function AiInsightsTab() {
  const history = useSidebarDataStore(s => s.history);
  const { isEnabled } = useAiFeaturesStore();
  const [aiResult, setAiResult] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'slow' | 'errors' | 'usage'>('slow');
  const [analysisId] = useState(() => `ai-insights-${Date.now()}`);

  const stats = useMemo(() => buildStats(history), [history]);
  const totalRequests = stats.reduce((s, e) => s + e.count, 0);
  const totalErrors = stats.reduce((s, e) => s + e.errorCount, 0);

  const slowest = useMemo(() => [...stats].sort((a, b) => b.avgTime - a.avgTime).slice(0, 8), [stats]);
  const mostErrors = useMemo(() => [...stats].filter(s => s.errorCount > 0).sort((a, b) => b.errorRate - a.errorRate).slice(0, 8), [stats]);
  const mostUsed = useMemo(() => [...stats].sort((a, b) => b.count - a.count).slice(0, 8), [stats]);

  const displayList = view === 'slow' ? slowest : view === 'errors' ? mostErrors : mostUsed;

  const runAnalysis = useCallback(() => {
    if (!isEnabled('intelligenceDashboard')) return;
    setLoading(true);
    setAiResult('');

    const summary = [
      `Total requests: ${totalRequests}, Total errors: ${totalErrors} (${totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 100) : 0}% error rate)`,
      '',
      'Slowest endpoints (avg response time):',
      ...slowest.slice(0, 5).map(e => `  ${e.method} ${e.url} — avg ${formatMs(e.avgTime)}, max ${formatMs(e.maxTime)}, errors: ${e.errorRate}%`),
      '',
      'Highest error rate endpoints:',
      ...mostErrors.slice(0, 5).map(e => `  ${e.method} ${e.url} — error rate: ${e.errorRate}%, count: ${e.count}`),
      '',
      'Most used endpoints:',
      ...mostUsed.slice(0, 5).map(e => `  ${e.method} ${e.url} — ${e.count} calls`),
    ].join('\n');

    postMsg({
      type: 'aiStreamRequest',
      requestId: analysisId,
      systemPrompt: `You are an API intelligence analyst. Analyze the request history data and provide:

## AI API Intelligence Report

### 🔴 Performance Issues
- Identify slow endpoints and likely root causes (payload size, server-side, network)

### 🟡 Reliability Concerns
- Endpoints with high error rates and what error patterns suggest

### 🟢 Usage Patterns
- Heavily used endpoints, unusual usage spikes, underutilized APIs

### 💡 Optimization Recommendations
- Specific, actionable steps to improve performance and reliability (max 5 bullets)

### 📊 Weekly Trend Estimate
- Based on the patterns, briefly estimate what the trend looks like

Keep the analysis concise and actionable. Use emoji bullets. Format in clear Markdown.`,
      userPrompt: summary,
    });
  }, [analysisId, totalRequests, totalErrors, slowest, mostErrors, mostUsed, isEnabled]);

  // Listen for AI stream events
  useState(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStreamChunk' && msg.requestId === analysisId) {
        setAiResult(prev => prev + (msg.chunk ?? ''));
      } else if (msg?.type === 'aiStreamDone' && msg.requestId === analysisId) {
        setLoading(false);
      } else if (msg?.type === 'aiStreamError' && msg.requestId === analysisId) {
        setLoading(false);
        setAiResult('> Error running AI analysis. Check your AI provider settings.');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  });

  if (stats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--color-text-muted)]">
        <GaugeIcon size={28} style={{ opacity: 0.3 }} />
        <p className="text-[11px]">No request history yet. Send some requests to see AI insights.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: stats */}
      <div className="flex flex-col w-[55%] min-w-0 border-r border-[var(--color-surface-border)] overflow-hidden">
        {/* Summary row */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--color-surface-border)] flex-shrink-0">
          <div className="flex flex-col items-center">
            <span className="text-[16px] font-bold tabular-nums" style={{ color: ACCENT }}>{totalRequests}</span>
            <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide">Requests</span>
          </div>
          <div className="w-px h-8 bg-[var(--color-surface-border)]" />
          <div className="flex flex-col items-center">
            <span className="text-[16px] font-bold tabular-nums" style={{ color: totalErrors > 0 ? 'var(--color-error)' : 'var(--color-success)' }}>{totalErrors}</span>
            <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide">Errors</span>
          </div>
          <div className="w-px h-8 bg-[var(--color-surface-border)]" />
          <div className="flex flex-col items-center">
            <span className="text-[16px] font-bold tabular-nums" style={{ color: stats.length > 0 ? ACCENT : 'var(--color-text-muted)' }}>{stats.length}</span>
            <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide">Endpoints</span>
          </div>
          <div className="flex-1" />
          {/* View toggle */}
          <div className="flex items-center gap-0.5 p-0.5 rounded bg-[var(--color-panel)]">
            {(['slow', 'errors', 'usage'] as const).map(v => (
              <button key={v} type="button" onClick={() => setView(v)}
                className="px-2 h-[20px] text-[10px] rounded cursor-pointer transition-all"
                style={{
                  background: view === v ? `color-mix(in srgb, ${ACCENT} 18%, transparent)` : 'transparent',
                  color: view === v ? ACCENT : 'var(--color-text-muted)',
                  fontWeight: view === v ? 600 : 400,
                }}>
                {v === 'slow' ? 'Slow' : v === 'errors' ? 'Errors' : 'Usage'}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          {displayList.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[11px] text-[var(--color-text-muted)]">No data for this view</div>
          ) : displayList.map((stat, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.03)]">
              <span className="text-[9px] font-bold px-1 rounded bg-[rgba(255,255,255,0.08)] text-[var(--color-text-muted)] flex-shrink-0 uppercase">{stat.method}</span>
              <span className="flex-1 min-w-0 text-[10px] text-[var(--color-text-primary)] truncate font-mono">{stat.url}</span>
              {view === 'slow' && (
                <span className="text-[10px] font-mono tabular-nums flex-shrink-0" style={{ color: speedColor(stat.avgTime) }}>{formatMs(stat.avgTime)}</span>
              )}
              {view === 'errors' && (
                <span className="text-[10px] font-mono tabular-nums flex-shrink-0" style={{ color: statusColor(stat.errorRate) }}>{stat.errorRate}%</span>
              )}
              {view === 'usage' && (
                <span className="text-[10px] font-mono tabular-nums flex-shrink-0 text-[var(--color-text-muted)]">{stat.count}×</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right: AI analysis */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)] flex-shrink-0">
          <SparkleIcon size={12} style={{ color: ACCENT }} />
          <span className="text-[11px] font-medium" style={{ color: ACCENT }}>AI Analysis</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={runAnalysis}
            disabled={loading}
            className="flex items-center gap-1 h-[22px] px-2.5 text-[10px] rounded cursor-pointer transition-all disabled:opacity-50 disabled:cursor-default"
            style={{ background: `color-mix(in srgb, ${ACCENT} 15%, transparent)`, color: ACCENT, border: `1px solid color-mix(in srgb, ${ACCENT} 25%, transparent)` }}
          >
            {loading ? (
              <RefreshIcon size={10} className="animate-spin" />
            ) : (
              <ChevronRightIcon size={10} />
            )}
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-3 py-2">
          {!aiResult && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--color-text-muted)]">
              <SparkleIcon size={20} style={{ opacity: 0.25, color: ACCENT }} />
              <p className="text-[11px] text-center max-w-[200px]">Click "Analyze" to get AI-powered insights on your request history</p>
            </div>
          )}
          {(aiResult || loading) && (
            <div className="text-[11px]">
              <MdViewer content={aiResult || '…'} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
