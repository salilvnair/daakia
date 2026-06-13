/**
 * AiRequestPatternStatus — shows baseline status for the current METHOD:URL
 * on the REQUEST side (UrlBar area). Lets you manage baselines before sending.
 * Companion to AiResponsePatternLearning (which runs on the response side).
 * Feature 4.6.6 — AI Response Pattern Learning (request-side indicator)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { SparkleIcon } from '../../icons';
import { ModalView, ButtonView } from '../../dui';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PatternRecord {
  url: string;
  method: string;
  sampleBody: string;
  recordedAt: number;
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
  GET:     'var(--color-method-get)',
  POST:    'var(--color-method-post)',
  PUT:     'var(--color-method-put)',
  PATCH:   'var(--color-method-patch)',
  DELETE:  'var(--color-method-delete)',
  HEAD:    'var(--color-method-head)',
  OPTIONS: 'var(--color-method-options)',
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

  const countBadge = (
    <span style={{
      fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 20,
      background: 'color-mix(in srgb, var(--color-protocol-ai) 15%, transparent)',
      color: 'var(--color-protocol-ai)',
    }}>
      {patterns.length}
    </span>
  );

  return (
    <ModalView
      open
      onClose={onClose}
      title="All Pattern Baselines"
      size="md"
      headerColor="var(--color-protocol-ai)"
      headerIcon={
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--color-protocol-ai) 18%, transparent)',
        }}>
          <SparkleIcon size={13} style={{ color: 'var(--color-protocol-ai)' }} />
        </div>
      }
      headerRight={countBadge}
      footerLeft={
        patterns.length > 0
          ? <ButtonView label="Clear all" size="sm" variant="danger" onClick={clearAll} />
          : undefined
      }
      footerRight={
        totalPages > 1 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, patterns.length)} of {patterns.length}
            </span>
            <ButtonView label="← Prev" size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)} />
            <ButtonView label="Next →" size="sm" variant="secondary" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} />
          </div>
        ) : undefined
      }
      noPadding
    >
      {patterns.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: 8, textAlign: 'center' }}>
          <span style={{ fontSize: 28 }}>📊</span>
          <p style={{ fontSize: 12, margin: 0, color: 'var(--color-text-secondary)' }}>No baselines recorded yet</p>
          <p style={{ fontSize: 11, margin: 0, color: 'var(--color-text-muted)' }}>
            Send a request then click "Record Baseline" in the response panel
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {visible.map((rec, i) => (
            <div key={i} className="group" style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 20px',
              borderBottom: '1px solid var(--color-surface-border)',
            }}>
              <span style={{
                fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                flexShrink: 0, minWidth: 42, textAlign: 'center',
                background: `color-mix(in srgb, ${METHOD_COLORS[rec.method] ?? 'var(--color-text-muted)'} 15%, transparent)`,
                color: METHOD_COLORS[rec.method] ?? 'var(--color-text-muted)',
              }}>
                {rec.method}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-primary)' }} title={rec.url}>
                  {rec.url}
                </p>
                <p style={{ fontSize: 10, margin: '2px 0 0', color: 'var(--color-text-muted)' }}>
                  {timeAgo(rec.recordedAt)} · {(rec.sampleBody.length / 1024).toFixed(1)} KB
                </p>
              </div>
              <button type="button" onClick={() => deleteOne(rec.method, rec.url)}
                className="opacity-0 group-hover:opacity-100"
                style={{
                  flexShrink: 0, fontSize: 9.5, padding: '2px 8px', borderRadius: 4,
                  cursor: 'pointer', border: '1px solid var(--color-error)',
                  color: 'var(--color-error)', background: 'transparent',
                  transition: 'opacity 120ms',
                }}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </ModalView>
  );
}

// ── PatternBaselinePopup (exported, used by external controlled parents) ──────

export function PatternBaselinePopup({ method, url, onClose }: {
  method: string;
  url: string;
  onClose: () => void;
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

  const previewPatterns = allPatterns.slice(0, PREVIEW_LIMIT);
  const hasMore = allPatterns.length > PREVIEW_LIMIT;

  return (
    <>
      <ModalView
        open
        onClose={onClose}
        title="Pattern Baseline"
        size="sm"
        headerColor="var(--color-protocol-ai)"
        headerIcon={
          <div style={{
            width: 22, height: 22, borderRadius: 5, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'color-mix(in srgb, var(--color-protocol-ai) 18%, transparent)',
          }}>
            <SparkleIcon size={11} style={{ color: 'var(--color-protocol-ai)' }} />
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <BaselineEndpointCard method={method} url={url} baseline={baseline} onDelete={deleteBaseline} />
          {previewPatterns.length > 0 && <RecentList patterns={previewPatterns} />}
          <BaselineFooter total={allPatterns.length} hasMore={hasMore} onShowAll={() => setShowAll(true)} onClearAll={clearAll} />
          {allPatterns.length === 0 && (
            <p style={{ fontSize: 9.5, lineHeight: 1.6, margin: 0, color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-surface-border)', paddingTop: 8 }}>
              Baselines are recorded per endpoint after a successful response. The AI compares future responses against the baseline to detect structural changes.
            </p>
          )}
        </div>
      </ModalView>
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
    <div style={{ borderRadius: 8, padding: 10, background: 'var(--color-surface-active)', border: '1px solid var(--color-surface-border)' }}>
      <p style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
        <span style={{ fontWeight: 700, color: METHOD_COLORS[method.toUpperCase()] ?? 'var(--color-info)' }}>
          {method.toUpperCase()}
        </span>
        {' '}{url.length > 38 ? '…' + url.slice(-35) : url}
      </p>
      {baseline ? (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 10, margin: 0, color: 'var(--color-success)' }}>✓ Baseline recorded</p>
            <p style={{ fontSize: 9.5, margin: '2px 0 0', color: 'var(--color-text-muted)' }}>
              {timeAgo(baseline.recordedAt)} · {(baseline.sampleBody.length / 1024).toFixed(1)} KB
            </p>
          </div>
          <button type="button" onClick={onDelete}
            style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--color-error)', color: 'var(--color-error)', background: 'transparent' }}>
            Delete
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 10, margin: '4px 0 0', color: 'var(--color-text-muted)' }}>
          No baseline — send a request then click "Record Baseline" in the response panel
        </p>
      )}
    </div>
  );
}

function RecentList({ patterns }: { patterns: PatternRecord[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <p style={{ fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px', color: 'var(--color-text-muted)' }}>
        Recent
      </p>
      {patterns.map((rec, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 4 }}
          className="hover:bg-[var(--color-surface-hover)]">
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 4px', borderRadius: 3, flexShrink: 0,
            background: `color-mix(in srgb, ${METHOD_COLORS[rec.method] ?? 'var(--color-text-muted)'} 15%, transparent)`,
            color: METHOD_COLORS[rec.method] ?? 'var(--color-text-muted)',
          }}>
            {rec.method}
          </span>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }} title={rec.url}>
            {rec.url.replace(/^https?:\/\/[^/]+/, '') || rec.url}
          </span>
          <span style={{ fontSize: 9, flexShrink: 0, color: 'var(--color-text-muted)' }}>
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, paddingTop: 4, borderTop: '1px solid var(--color-surface-border)' }}>
      {hasMore ? (
        <button type="button" onClick={onShowAll}
          style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, color: 'var(--color-protocol-ai)', textDecoration: 'underline' }}>
          Show all ({total}) →
        </button>
      ) : (
        <span style={{ color: 'var(--color-text-muted)' }}>
          {total} baseline{total !== 1 ? 's' : ''}
        </span>
      )}
      {total > 0 && (
        <button type="button" onClick={onClearAll}
          style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, color: 'var(--color-error)' }}>
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
  const btnRef = useRef<HTMLButtonElement>(null);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const refresh = useCallback(() => {
    const patterns = loadPatterns();
    const key = `${method.toUpperCase()}:${url}`;
    setBaseline(patterns.filter(p => `${p.method}:${p.url}` === key).pop() ?? null);
  }, [method, url]);

  useEffect(() => {
    if (!url.trim()) { setBaseline(null); return; }
    refresh();
  }, [method, url, refresh]);

  const closePopup = () => {
    if (onToggle && isOpen) onToggle();
    else setInternalOpen(false);
  };

  const toggleOpen = () => {
    refresh();
    if (onToggle) onToggle();
    else setInternalOpen(p => !p);
  };

  if (!url.trim()) return null;

  const hasBaseline = !!baseline;
  const AI = 'var(--color-protocol-ai)';

  if (variant === 'gradient') {
    return (
      <>
        <button
          ref={btnRef}
          type="button"
          title={hasBaseline ? `Pattern baseline recorded ${timeAgo(baseline!.recordedAt)} — click to manage` : 'Manage AI pattern baselines for this endpoint'}
          onClick={toggleOpen}
          className="flex items-center gap-1.5 h-[36px] px-3.5 rounded-lg cursor-pointer select-none transition-all flex-shrink-0"
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
        {isOpen && (
          <PatternBaselinePopup method={method} url={url} onClose={closePopup} />
        )}
      </>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={hasBaseline
          ? `Pattern baseline recorded ${timeAgo(baseline!.recordedAt)} — click to manage`
          : 'No pattern baseline recorded for this endpoint'}
        onClick={toggleOpen}
        className="h-[36px] px-2.5 flex items-center gap-1 rounded-md border cursor-pointer transition-all text-[10px] flex-shrink-0"
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
      {isOpen && (
        <PatternBaselinePopup method={method} url={url} onClose={closePopup} />
      )}
    </>
  );
}
