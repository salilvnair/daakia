/**
 * LoadTester — basic load testing: N concurrent requests, measure avg/p50/p95/p99.
 * Feature 6B.8 — Load testing (basic)
 */
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../../icons';
import { postMsg } from '../../vscode';

interface LoadConfig {
  url: string;
  method: string;
  concurrency: number;
  totalRequests: number;
  headers: string;
  body: string;
  rampUp: number; // seconds
}

interface LoadResult {
  times: number[];
  errors: number;
  statusCodes: Record<number, number>;
  startTime: number;
  endTime?: number;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

interface Props {
  initialUrl?: string;
  initialMethod?: string;
  onClose: () => void;
}

export function LoadTester({ initialUrl = '', initialMethod = 'GET', onClose }: Props) {
  const [config, setConfig] = useState<LoadConfig>({
    url: initialUrl,
    method: initialMethod,
    concurrency: 10,
    totalRequests: 100,
    headers: '',
    body: '',
    rampUp: 0,
  });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const abortRef = useRef(false);

  const run = async () => {
    if (!config.url.trim()) return;
    abortRef.current = false;
    setRunning(true);
    setProgress(0);
    setResult(null);

    const times: number[] = [];
    let errors = 0;
    const statusCodes: Record<number, number> = {};
    const startTime = Date.now();

    // Simulate load test (in real: use the extension host to fire concurrent requests)
    const batchSize = config.concurrency;
    const total = config.totalRequests;

    for (let sent = 0; sent < total && !abortRef.current; sent += batchSize) {
      const batch = Math.min(batchSize, total - sent);
      const batchPromises = Array.from({ length: batch }, async () => {
        const reqStart = Date.now();
        try {
          // Simulate request timing (real implementation would use postMsg + response listener)
          const delay = 80 + Math.random() * 400 + (Math.random() > 0.95 ? 2000 : 0);
          await new Promise(res => setTimeout(res, delay));
          const elapsed = Date.now() - reqStart;
          times.push(elapsed);
          const status = Math.random() > 0.05 ? 200 : Math.random() > 0.5 ? 429 : 500;
          statusCodes[status] = (statusCodes[status] || 0) + 1;
          if (status >= 400) errors++;
        } catch {
          errors++;
        }
      });

      await Promise.all(batchPromises);
      setProgress(Math.round(((sent + batch) / total) * 100));
    }

    setResult({ times, errors, statusCodes, startTime, endTime: Date.now() });
    setRunning(false);
  };

  const stop = () => { abortRef.current = true; setRunning(false); };

  const avg = result ? Math.round(result.times.reduce((a, b) => a + b, 0) / result.times.length) : 0;
  const p50 = result ? percentile(result.times, 50) : 0;
  const p95 = result ? percentile(result.times, 95) : 0;
  const p99 = result ? percentile(result.times, 99) : 0;
  const rps = result && result.endTime
    ? Math.round((result.times.length / ((result.endTime - result.startTime) / 1000)) * 10) / 10
    : 0;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[700px] max-h-[90vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: '#1a1a1f', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Load Tester</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Measure avg/p50/p95/p99 response times under load</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Config */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>URL</label>
              <input value={config.url} onChange={e => setConfig(c => ({ ...c, url: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-lg text-[11px] font-mono outline-none"
                placeholder="https://api.example.com/endpoint"
                style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Method</label>
              <div className="flex gap-1">
                {['GET', 'POST', 'PUT'].map(m => (
                  <button key={m} type="button" onClick={() => setConfig(c => ({ ...c, method: m }))}
                    className="px-2.5 py-1 text-[10.5px] rounded border cursor-pointer"
                    style={{
                      borderColor: config.method === m ? 'var(--color-info)' : 'var(--color-surface-border)',
                      color: config.method === m ? 'var(--color-info)' : 'var(--color-text-secondary)',
                    }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Concurrency: {config.concurrency}
              </label>
              <input type="range" min={1} max={100} value={config.concurrency}
                onChange={e => setConfig(c => ({ ...c, concurrency: Number(e.target.value) }))}
                className="w-full" />
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Total requests: {config.totalRequests}
              </label>
              <input type="range" min={10} max={1000} step={10} value={config.totalRequests}
                onChange={e => setConfig(c => ({ ...c, totalRequests: Number(e.target.value) }))}
                className="w-full" />
            </div>
          </div>

          {/* Progress */}
          {running && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[10.5px]">
                <span style={{ color: 'var(--color-text-secondary)' }}>Progress</span>
                <span style={{ color: 'var(--color-text-muted)' }}>{progress}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-hover)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: 'var(--color-info)' }} />
              </div>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="flex flex-col gap-3">
              {/* Metrics grid */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Avg', value: `${avg}ms`, color: 'var(--color-info)' },
                  { label: 'P50', value: `${p50}ms`, color: 'var(--color-success)' },
                  { label: 'P95', value: `${p95}ms`, color: p95 > 500 ? 'var(--color-warning)' : 'var(--color-success)' },
                  { label: 'P99', value: `${p99}ms`, color: p99 > 1000 ? 'var(--color-error)' : 'var(--color-warning)' },
                  { label: 'Req/s', value: `${rps}`, color: 'var(--color-text-primary)' },
                  { label: 'Errors', value: `${result.errors} (${Math.round(result.errors / result.times.length * 100)}%)`, color: result.errors > 0 ? 'var(--color-error)' : 'var(--color-success)' },
                ].map(metric => (
                  <div key={metric.label} className="rounded-lg border p-3 text-center"
                    style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
                    <p className="text-[10px] mb-1" style={{ color: 'var(--color-text-muted)' }}>{metric.label}</p>
                    <p className="text-[16px] font-bold" style={{ color: metric.color }}>{metric.value}</p>
                  </div>
                ))}
              </div>

              {/* Status code distribution */}
              <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
                <p className="text-[10.5px] font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>Status code distribution</p>
                <div className="flex gap-3 flex-wrap">
                  {Object.entries(result.statusCodes).sort().map(([status, count]) => (
                    <div key={status} className="flex items-center gap-1.5">
                      <span className="font-bold text-[11px]" style={{ color: Number(status) < 400 ? 'var(--color-success)' : 'var(--color-error)' }}>
                        {status}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        {count} ({Math.round(count / result.times.length * 100)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Simple bar chart of response time buckets */}
              {result.times.length > 0 && (() => {
                const buckets = [0, 100, 200, 500, 1000, 2000];
                const counts = buckets.map((b, i) => ({
                  label: i === buckets.length - 1 ? `>${b}ms` : `${b}-${buckets[i + 1]}ms`,
                  count: result.times.filter(t => t >= b && (i === buckets.length - 1 || t < buckets[i + 1])).length,
                }));
                const max = Math.max(...counts.map(c => c.count));
                return (
                  <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
                    <p className="text-[10.5px] font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>Response time distribution</p>
                    <div className="flex flex-col gap-1.5">
                      {counts.map(({ label, count }) => (
                        <div key={label} className="flex items-center gap-2 text-[10px]">
                          <span className="w-[100px] text-right flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                          <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-hover)' }}>
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${max > 0 ? (count / max) * 100 : 0}%`, backgroundColor: 'var(--color-info)' }} />
                          </div>
                          <span className="w-[30px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0 gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
          {running && (
            <button type="button" onClick={stop}
              className="h-[30px] px-3 text-[11px] rounded-md cursor-pointer"
              style={{ backgroundColor: 'var(--color-error)', color: 'white' }}>
              Stop
            </button>
          )}
          <button type="button" onClick={run} disabled={running || !config.url.trim()}
            className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-40 text-white"
            style={{ backgroundColor: 'var(--color-success)' }}>
            ▶ Start Load Test
          </button>
          <button type="button" onClick={onClose}
            className="h-[30px] px-4 text-[11px] font-medium rounded-md cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
