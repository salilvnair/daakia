/**
 * AiRequestPatternStatus — shows baseline status for the current METHOD:URL
 * on the REQUEST side (UrlBar area). Lets you manage baselines before sending.
 * Companion to AiResponsePatternLearning (which runs on the response side).
 * Feature 4.6.6 — AI Response Pattern Learning (request-side indicator)
 */
import { useState, useEffect, useRef, useCallback, CSSProperties } from 'react';
import { SparkleIcon } from '../../icons';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PatternRecord {
  url: string;
  method: string;
  sampleBody: string;
  recordedAt: number;
}

interface PopupCoords {
  top?: number;
  bottom?: number;
  right: number;
}

interface Props {
  method: string;
  url: string;
  /**
   * 'gradient' = big styled button matching Pre-flight / Ask AI (for URL bar xl view)
   * undefined   = original small sparkle+circle icon button
   */
  variant?: 'gradient';
  /** Controlled open state — when provided, button calls onToggle instead of managing internally */
  open?: boolean;
  onToggle?: () => void;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const STORAGE_KEY = 'daakia:response-patterns';
const PAGE_SIZE = 10;
const PREVIEW_LIMIT = 5;

function loadPatterns(): PatternRecord[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function savePatterns(p: PatternRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}
function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const METHOD_COLORS: Record<string, string> = {
  GET:     '#22c55e',
  POST:    '#f59e0b',
  PUT:     '#3b82f6',
  PATCH:   '#a855f7',
  DELETE:  '#ef4444',
  HEAD:    '#64748b',
  OPTIONS: '#64748b',
};

// ── All Baselines Modal ───────────────────────────────────────────────────────

function AllBaselinesModal({ onClose }: { onClose: () => void }) {
  const [patterns, setPatterns] = useState<PatternRecord[]>(() => [...loadPatterns()].reverse());
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(patterns.length / PAGE_SIZE);
  const visible = patterns.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const deleteOne = (method: string, url: string) => {
    const key = `${method}:${url}`;
    const updated = loadPatterns().filter(p => `${p.method}:${p.url}` !== key);
    savePatterns(updated);
    const reversed = [...updated].reverse();
    setPatterns(reversed);
    const newPages = Math.ceil(reversed.length / PAGE_SIZE);
    if (page >= newPages && page > 0) setPage(p => p - 1);
  };

  const clearAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    setPatterns([]);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--color-panel)',
          borderColor: 'var(--color-surface-border)',
          width: '560px',
          maxWidth: '92vw',
          maxHeight: '80vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-b flex-shrink-0"
          style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={13} style={{ color: 'var(--color-protocol-ai)' }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            All Pattern Baselines
          </span>
          <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-full ml-0.5"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 15%, transparent)',
              color: 'var(--color-protocol-ai)',
            }}>
            {patterns.length}
          </span>
          <div className="flex-1" />
          {patterns.length > 0 && (
            <button type="button" onClick={clearAll}
              className="text-[11px] px-2.5 py-1 rounded-md border cursor-pointer hover:opacity-80 transition-opacity mr-2"
              style={{
                borderColor: 'color-mix(in srgb, var(--color-error) 40%, var(--color-surface-border))',
                color: 'var(--color-error)',
              }}>
              Clear all
            </button>
          )}
          <button type="button" onClick={onClose}
            className="text-[14px] leading-none opacity-40 hover:opacity-80 cursor-pointer transition-opacity"
            style={{ color: 'var(--color-text-muted)' }}>
            ✕
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {patterns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-6">
              <span className="text-[28px]">📊</span>
              <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>No baselines recorded yet</p>
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                Send a request then click "Record Baseline" in the response panel
              </p>
            </div>
          ) : visible.map((rec, i) => (
            <div key={i}
              className="flex items-center gap-3 px-5 py-2.5 border-b group"
              style={{ borderColor: 'var(--color-surface-border)' }}>
              <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 min-w-[42px] text-center"
                style={{
                  backgroundColor: `color-mix(in srgb, ${METHOD_COLORS[rec.method] ?? '#94a3b8'} 15%, transparent)`,
                  color: METHOD_COLORS[rec.method] ?? '#94a3b8',
                }}>
                {rec.method}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-mono truncate" style={{ color: 'var(--color-text-primary)' }} title={rec.url}>
                  {rec.url}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {timeAgo(rec.recordedAt)} · {(rec.sampleBody.length / 1024).toFixed(1)} KB
                </p>
              </div>
              <button type="button" onClick={() => deleteOne(rec.method, rec.url)}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-[9.5px] px-2 py-0.5 rounded border cursor-pointer transition-opacity"
                style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}>
                Delete
              </button>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t flex-shrink-0"
            style={{ borderColor: 'var(--color-surface-border)' }}>
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, patterns.length)} of {patterns.length}
            </span>
            <div className="flex gap-2">
              <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)}
                className="text-[11px] px-3 py-1 rounded-md border cursor-pointer disabled:opacity-30 transition-opacity"
                style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                ← Prev
              </button>
              <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                className="text-[11px] px-3 py-1 rounded-md border cursor-pointer disabled:opacity-30 transition-opacity"
                style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── PatternBaselinePopup (exported, used by external controlled parents) ──────

export function PatternBaselinePopup({ method, url, onClose, dir = 'down' }: {
  method: string;
  url: string;
  onClose: () => void;
  dir?: 'up' | 'down';
}) {
  const [allPatterns, setAllPatterns] = useState<PatternRecord[]>([]);
  const [baseline, setBaseline] = useState<PatternRecord | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!url.trim()) return;
    const patterns = loadPatterns();
    setAllPatterns([...patterns].reverse());
    const key = `${method.toUpperCase()}:${url}`;
    setBaseline(patterns.filter(p => `${p.method}:${p.url}` === key).pop() ?? null);
  }, [method, url]);

  const deleteBaseline = () => {
    const key = `${method.toUpperCase()}:${url}`;
    const updated = loadPatterns().filter(p => `${p.method}:${p.url}` !== key);
    savePatterns(updated);
    setBaseline(null);
    setAllPatterns([...updated].reverse());
  };

  const clearAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAllPatterns([]);
    setBaseline(null);
    onClose();
  };

  const posStyle: CSSProperties = dir === 'up'
    ? { position: 'absolute', right: 0, bottom: '100%', marginBottom: '4px', zIndex: 50 }
    : { position: 'absolute', right: 0, top: '100%', marginTop: '4px', zIndex: 50 };

  const previewPatterns = allPatterns.slice(0, PREVIEW_LIMIT);
  const hasMore = allPatterns.length > PREVIEW_LIMIT;

  return (
    <>
      <div style={posStyle}>
        <div
          className="rounded-xl border shadow-xl p-3 flex flex-col gap-2.5"
          style={{
            backgroundColor: 'var(--color-panel)',
            borderColor: 'var(--color-surface-border)',
            width: '280px',
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Pattern Baseline</p>
            <button type="button" onClick={onClose} className="text-[10px] opacity-40 hover:opacity-80 cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>✕</button>
          </div>
          <BaselineEndpointCard method={method} url={url} baseline={baseline} onDelete={deleteBaseline} />
          {previewPatterns.length > 0 && <RecentList patterns={previewPatterns} />}
          <BaselineFooter total={allPatterns.length} hasMore={hasMore} onShowAll={() => setShowAll(true)} onClearAll={clearAll} />
        </div>
      </div>
      {showAll && <AllBaselinesModal onClose={() => setShowAll(false)} />}
    </>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function BaselineEndpointCard({
  method, url, baseline, onDelete,
}: {
  method: string; url: string; baseline: PatternRecord | null; onDelete: () => void;
}) {
  return (
    <div className="rounded-lg p-2.5" style={{ backgroundColor: 'var(--color-surface-active)', border: '1px solid var(--color-surface-border)' }}>
      <p className="text-[10.5px] font-mono truncate" style={{ color: 'var(--color-text-secondary)' }}>
        <span className="font-bold" style={{ color: METHOD_COLORS[method.toUpperCase()] ?? 'var(--color-info)' }}>
          {method.toUpperCase()}
        </span>
        {' '}{url.length > 38 ? '…' + url.slice(-35) : url}
      </p>
      {baseline ? (
        <div className="mt-1.5 flex items-center justify-between">
          <div>
            <p className="text-[10px]" style={{ color: 'var(--color-success)' }}>✓ Baseline recorded</p>
            <p className="text-[9.5px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {timeAgo(baseline.recordedAt)} · {(baseline.sampleBody.length / 1024).toFixed(1)} KB
            </p>
          </div>
          <button type="button" onClick={onDelete}
            className="text-[9.5px] px-2 py-0.5 rounded border cursor-pointer"
            style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}>
            Delete
          </button>
        </div>
      ) : (
        <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
          No baseline — send a request then click "Record Baseline" in the response panel
        </p>
      )}
    </div>
  );
}

function RecentList({ patterns }: { patterns: PatternRecord[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[9.5px] font-semibold uppercase tracking-wider mb-0.5"
        style={{ color: 'var(--color-text-muted)' }}>
        Recent
      </p>
      {patterns.map((rec, i) => (
        <div key={i} className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-[var(--color-surface-hover)]">
          <span className="text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0"
            style={{
              backgroundColor: `color-mix(in srgb, ${METHOD_COLORS[rec.method] ?? '#94a3b8'} 15%, transparent)`,
              color: METHOD_COLORS[rec.method] ?? '#94a3b8',
            }}>
            {rec.method}
          </span>
          <span className="text-[10px] font-mono truncate flex-1" style={{ color: 'var(--color-text-secondary)' }} title={rec.url}>
            {rec.url.replace(/^https?:\/\/[^/]+/, '') || rec.url}
          </span>
          <span className="text-[9px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
            {timeAgo(rec.recordedAt)}
          </span>
        </div>
      ))}
    </div>
  );
}

function BaselineFooter({ total, hasMore, onShowAll, onClearAll }: {
  total: number; hasMore: boolean; onShowAll: () => void; onClearAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between text-[10px] pt-1 border-t"
      style={{ borderColor: 'var(--color-surface-border)' }}>
      {hasMore ? (
        <button type="button" onClick={onShowAll}
          className="cursor-pointer hover:underline"
          style={{ color: 'var(--color-protocol-ai)' }}>
          Show all ({total}) →
        </button>
      ) : (
        <span style={{ color: 'var(--color-text-muted)' }}>
          {total} baseline{total !== 1 ? 's' : ''}
        </span>
      )}
      {total > 0 && (
        <button type="button" onClick={onClearAll} className="cursor-pointer"
          style={{ color: 'var(--color-error)' }}>
          Clear all
        </button>
      )}
    </div>
  );
}

// ── AiRequestPatternStatus ────────────────────────────────────────────────────

export function AiRequestPatternStatus({ method, url, variant, open: controlledOpen, onToggle }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [baseline, setBaseline] = useState<PatternRecord | null>(null);
  const [allPatterns, setAllPatterns] = useState<PatternRecord[]>([]);
  const [allCount, setAllCount] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [coords, setCoords] = useState<PopupCoords | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const refresh = useCallback(() => {
    const patterns = loadPatterns();
    setAllCount(patterns.length);
    setAllPatterns([...patterns].reverse());
    const key = `${method.toUpperCase()}:${url}`;
    setBaseline(patterns.filter(p => `${p.method}:${p.url}` === key).pop() ?? null);
  }, [method, url]);

  useEffect(() => {
    if (!url.trim()) { setBaseline(null); return; }
    refresh();
  }, [method, url, refresh]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        closePopup();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const closePopup = () => {
    if (onToggle && isOpen) onToggle();
    else setInternalOpen(false);
  };

  const toggleOpen = () => {
    refresh();
    if (!isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const estimatedHeight = 340;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < estimatedHeight && rect.top > estimatedHeight) {
        // open upward — use bottom anchor
        setCoords({ bottom: window.innerHeight - rect.top + 6, right: window.innerWidth - rect.right });
      } else {
        setCoords({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
      }
    }
    if (onToggle) onToggle();
    else setInternalOpen(p => !p);
  };

  const deleteBaseline = () => {
    const patterns = loadPatterns();
    const key = `${method.toUpperCase()}:${url}`;
    savePatterns(patterns.filter(p => `${p.method}:${p.url}` !== key));
    refresh();
    closePopup();
  };

  const clearAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    refresh();
    closePopup();
  };

  if (!url.trim()) return null;

  const hasBaseline = !!baseline;
  const AI = 'var(--color-protocol-ai)';
  const previewPatterns = allPatterns.slice(0, PREVIEW_LIMIT);
  const hasMore = allCount > PREVIEW_LIMIT;

  // ── Popup rendered via fixed positioning (escapes any parent overflow) ──────
  const popup = isOpen && coords ? (
    <div
      ref={popupRef}
      style={{
        position: 'fixed',
        ...(coords.top !== undefined ? { top: coords.top } : { bottom: coords.bottom }),
        right: coords.right,
        zIndex: 9999,
        width: '288px',
      }}
    >
      <div
        className="rounded-xl border shadow-2xl p-3 flex flex-col gap-2.5"
        style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <SparkleIcon size={11} style={{ color: AI }} />
            <p className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Pattern Baseline</p>
          </div>
          <button type="button" onClick={closePopup}
            className="text-[10px] opacity-40 hover:opacity-80 cursor-pointer"
            style={{ color: 'var(--color-text-muted)' }}>✕</button>
        </div>

        {/* Current endpoint card */}
        <BaselineEndpointCard method={method} url={url} baseline={baseline} onDelete={deleteBaseline} />

        {/* Recent baselines */}
        {previewPatterns.length > 0 && <RecentList patterns={previewPatterns} />}

        {/* Footer */}
        <BaselineFooter total={allCount} hasMore={hasMore} onShowAll={() => setShowAll(true)} onClearAll={clearAll} />

        {/* Description */}
        {allCount === 0 && (
          <p className="text-[9.5px] leading-relaxed" style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-surface-border)', paddingTop: '8px' }}>
            Baselines are recorded per endpoint after a successful response. The AI compares future responses against the baseline to detect structural changes.
          </p>
        )}
      </div>
    </div>
  ) : null;

  if (variant === 'gradient') {
    return (
      <div className="relative flex-shrink-0">
        <button
          ref={btnRef}
          type="button"
          title={hasBaseline ? `Pattern baseline recorded ${timeAgo(baseline!.recordedAt)} — click to manage` : 'Manage AI pattern baselines for this endpoint'}
          onClick={toggleOpen}
          className="flex items-center gap-1.5 h-[36px] px-3.5 rounded-lg cursor-pointer select-none transition-all"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${AI} 22%, var(--color-surface)) 0%, color-mix(in srgb, ${AI} 10%, var(--color-surface)) 100%)`,
            border: `1px solid color-mix(in srgb, ${AI} 45%, var(--color-surface-border))`,
            color: AI,
            boxShadow: isOpen
              ? `0 0 14px color-mix(in srgb, ${AI} 35%, transparent), 0 1px 3px rgba(0,0,0,0.2)`
              : '0 1px 3px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 14px color-mix(in srgb, ${AI} 35%, transparent), 0 1px 3px rgba(0,0,0,0.2)`; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = isOpen ? `0 0 14px color-mix(in srgb, ${AI} 35%, transparent), 0 1px 3px rgba(0,0,0,0.2)` : '0 1px 3px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)'; }}
        >
          <SparkleIcon size={12} style={{ filter: 'drop-shadow(0 0 4px currentColor)' }} />
          <span className="hidden lg:inline text-[11.5px] font-semibold whitespace-nowrap tracking-wide">
            {hasBaseline ? '● Pattern Baseline' : 'Pattern Baseline'}
          </span>
          <span className="lg:hidden text-[11px]">{hasBaseline ? '●' : '○'}</span>
        </button>
        {popup}
        {showAll && <AllBaselinesModal onClose={() => setShowAll(false)} />}
      </div>
    );
  }

  // ── Original small sparkle + circle icon button ────────────────────────────
  return (
    <div className="relative flex-shrink-0">
      <button
        ref={btnRef}
        type="button"
        title={hasBaseline
          ? `Pattern baseline recorded ${timeAgo(baseline!.recordedAt)} — click to manage`
          : 'No pattern baseline recorded for this endpoint'}
        onClick={toggleOpen}
        className="h-[36px] px-2.5 flex items-center gap-1 rounded-md border cursor-pointer transition-all text-[10px]"
        style={{
          borderColor: hasBaseline
            ? `color-mix(in srgb, ${AI} 35%, var(--color-surface-border))`
            : 'var(--color-surface-border)',
          backgroundColor: hasBaseline
            ? `color-mix(in srgb, ${AI} 10%, transparent)`
            : 'transparent',
          color: hasBaseline ? AI : 'var(--color-text-muted)',
        }}
      >
        <SparkleIcon size={11} />
        {hasBaseline ? '📊' : '○'}
      </button>
      {popup}
      {showAll && <AllBaselinesModal onClose={() => setShowAll(false)} />}
    </div>
  );
}
