/**
 * AiRequestPatternStatus — shows baseline status for the current METHOD:URL
 * on the REQUEST side (UrlBar area). Lets you manage baselines before sending.
 * Companion to AiResponsePatternLearning (which runs on the response side).
 * Feature 4.6.6 — AI Response Pattern Learning (request-side indicator)
 */
import { useState, useEffect } from 'react';
import { SparkleIcon } from '../../icons';

interface PatternRecord {
  url: string;
  method: string;
  sampleBody: string;
  recordedAt: number;
}

interface Props {
  method: string;
  url: string;
}

const STORAGE_KEY = 'daakia:response-patterns';

function loadPatterns(): PatternRecord[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function savePatterns(patterns: PatternRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(patterns));
}

function timeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AiRequestPatternStatus({ method, url }: Props) {
  const [open, setOpen] = useState(false);
  const [baseline, setBaseline] = useState<PatternRecord | null>(null);
  const [allCount, setAllCount] = useState(0);

  // Refresh whenever method/url changes or popover is opened
  const refresh = () => {
    const patterns = loadPatterns();
    setAllCount(patterns.length);
    const key = `${method.toUpperCase()}:${url}`;
    const match = patterns.filter(p => `${p.method}:${p.url}` === key).pop() ?? null;
    setBaseline(match);
  };

  useEffect(() => {
    if (!url.trim()) { setBaseline(null); return; }
    refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, url]);

  const deleteBaseline = () => {
    const patterns = loadPatterns();
    const key = `${method.toUpperCase()}:${url}`;
    savePatterns(patterns.filter(p => `${p.method}:${p.url}` !== key));
    setBaseline(null);
    setOpen(false);
  };

  const clearAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    setBaseline(null);
    setAllCount(0);
    setOpen(false);
  };

  // Don't render if URL is blank
  if (!url.trim()) return null;

  const hasBaseline = !!baseline;

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        title={hasBaseline ? `Pattern baseline recorded ${timeAgo(baseline!.recordedAt)} — click to manage` : 'No pattern baseline recorded for this endpoint'}
        onClick={() => { refresh(); setOpen(p => !p); }}
        className="h-[36px] px-2.5 flex items-center gap-1 rounded-md border cursor-pointer transition-all text-[10px]"
        style={{
          borderColor: hasBaseline
            ? 'color-mix(in srgb, var(--color-protocol-ai) 35%, var(--color-surface-border))'
            : 'var(--color-surface-border)',
          backgroundColor: hasBaseline
            ? 'color-mix(in srgb, var(--color-protocol-ai) 10%, transparent)'
            : 'transparent',
          color: hasBaseline ? 'var(--color-protocol-ai)' : 'var(--color-text-muted)',
        }}
      >
        <SparkleIcon size={11} />
        {hasBaseline ? '📊' : '○'}
      </button>

      {open && (
        <div
          className="absolute top-full mt-1 right-0 z-50 w-[280px] rounded-xl border shadow-xl p-3 flex flex-col gap-2.5"
          style={{ backgroundColor: 'var(--color-surface-bg)', borderColor: 'var(--color-surface-border)' }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Pattern Baseline
            </p>
            <button type="button" onClick={() => setOpen(false)} className="text-[10px] opacity-40 hover:opacity-80 cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>✕</button>
          </div>

          {/* Current endpoint status */}
          <div className="rounded-lg p-2.5" style={{ backgroundColor: 'var(--color-panel)', border: '1px solid var(--color-surface-border)' }}>
            <p className="text-[10.5px] font-mono truncate" style={{ color: 'var(--color-text-secondary)' }}>
              <span className="font-bold" style={{ color: 'var(--color-info)' }}>{method.toUpperCase()}</span>
              {' '}{url.length > 40 ? '…' + url.slice(-37) : url}
            </p>
            {hasBaseline ? (
              <div className="mt-1.5 flex items-center justify-between">
                <div>
                  <p className="text-[10px]" style={{ color: 'var(--color-success)' }}>✓ Baseline recorded</p>
                  <p className="text-[9.5px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {timeAgo(baseline!.recordedAt)} · {(baseline!.sampleBody.length / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={deleteBaseline}
                  className="text-[9.5px] px-2 py-0.5 rounded border cursor-pointer"
                  style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
                >
                  Delete
                </button>
              </div>
            ) : (
              <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                No baseline — send a request then click "Record baseline" in the response panel
              </p>
            )}
          </div>

          {/* Global stats */}
          <div className="flex items-center justify-between text-[10px]">
            <span style={{ color: 'var(--color-text-muted)' }}>{allCount} baseline{allCount !== 1 ? 's' : ''} stored total</span>
            {allCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="cursor-pointer"
                style={{ color: 'var(--color-error)' }}
              >
                Clear all
              </button>
            )}
          </div>

          <p className="text-[9.5px] leading-relaxed" style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-surface-border)', paddingTop: '8px' }}>
            Baselines are recorded per endpoint after a successful response. The AI compares future responses against the baseline to detect structural changes.
          </p>
        </div>
      )}
    </div>
  );
}
