/**
 * The log view.
 *
 * Three things make this different from `kubectl logs | less`:
 *   1. A density ribbon across the top — the whole buffer at a glance, so a
 *      burst of errors is visible without scrolling to it.
 *   2. Level chips with live counts, so narrowing is one click, not a pipe.
 *   3. Selecting text offers "Ask AI why", which is the reason dk8s exists.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { SearchInputView } from '@salilvnair/dui';
import { useK8sStore, type LogLevel } from '../../store/k8s-store';
import {
  filterLines, densityBuckets, describeBucket, levelCounts, levelColor,
  levelLabel, formatLogTime, selectionText, LEVEL_ORDER,
  type MatchedLine,
} from './log-view';
import { AskAiButton } from './AskAiButton';

const ACCENT = 'var(--color-dk8s)';
const ROW_HEIGHT = 18;
/** Rows rendered above and below the viewport, to hide fast scrolling. */
const OVERSCAN = 30;

// ── Density ribbon ──────────────────────────────────────────────────────────

function DensityRibbon({ lines, onJump }: {
  lines: MatchedLine[];
  onJump: (index: number) => void;
}) {
  const [width, setWidth] = useState(600);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      setWidth(Math.max(120, entries[0].contentRect.width));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  // One column per ~3px. Finer than that and each column holds so few lines
  // that the shape is noise rather than density.
  const columns = Math.max(20, Math.floor(width / 3));
  const buckets = useMemo(() => densityBuckets(lines, columns), [lines, columns]);

  return (
    <div ref={ref} className="flex items-end gap-px px-4 h-[34px] shrink-0 select-none"
         style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
      {buckets.map(b => (
        <div
          key={b.startIndex}
          onClick={() => onJump(b.startIndex)}
          title={describeBucket(b)}
          className="flex-1 cursor-pointer transition-opacity hover:opacity-100"
          style={{
            height: `${Math.round(b.height * 24) + 2}px`,
            minWidth: 2,
            borderRadius: '1px 1px 0 0',
            background: levelColor(b.worst),
            // Errors at full strength, everything else receded: the ribbon is
            // for spotting trouble, so calm stretches should read as texture.
            opacity: b.worst === 'error' ? 0.95 : b.worst === 'warn' ? 0.7 : 0.32,
          }}
        />
      ))}
      {!buckets.length && (
        <span className="text-[10px] text-[var(--color-text-muted)] self-center">
          waiting for output…
        </span>
      )}
    </div>
  );
}

// ── Level chips ─────────────────────────────────────────────────────────────

function LevelChips() {
  const { logs, logLevels, toggleLogLevel } = useK8sStore();
  const counts = useMemo(() => levelCounts(logs), [logs]);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {LEVEL_ORDER.filter(l => counts[l] > 0).map(level => {
        const on = logLevels.includes(level);
        // No selection means everything, so nothing is dimmed until the user
        // picks — a view where all chips look "off" but all lines show is a lie.
        const idle = logLevels.length === 0;
        const color = levelColor(level);
        return (
          <button
            key={level}
            type="button"
            onClick={() => toggleLogLevel(level)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10.5px] cursor-pointer transition-all"
            style={{
              background: on ? `color-mix(in srgb, ${color} 18%, transparent)` : 'transparent',
              border: `1px solid ${on ? `color-mix(in srgb, ${color} 45%, transparent)` : 'var(--color-surface-border)'}`,
              color: on || idle ? color : 'var(--color-text-muted)',
              fontWeight: on ? 600 : 400,
              opacity: idle || on ? 1 : 0.55,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: 5, background: color }} />
            {levelLabel(level)}
            <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.75 }}>
              {counts[level].toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── One line ────────────────────────────────────────────────────────────────

function Highlighted({ text, hits }: { text: string; hits?: [number, number][] }) {
  if (!hits?.length) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  hits.forEach(([from, to], i) => {
    if (from > at) out.push(text.slice(at, from));
    out.push(
      <mark key={i} style={{
        background: `color-mix(in srgb, ${ACCENT} 34%, transparent)`,
        color: 'var(--color-text-primary)', borderRadius: 2, padding: '0 1px',
      }}>
        {text.slice(from, to)}
      </mark>,
    );
    at = to;
  });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

// ── The viewer ──────────────────────────────────────────────────────────────

export function LogViewer() {
  const {
    logs, logStatus, logDetail, logDropped, logFilter, logLevels,
    logFollow, logWrap, logPrevious, logSelection,
    detail, setLogFilter, setLogFollow, setLogWrap, setLogPrevious, setLogSelection,
  } = useK8sStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(400);

  const visible = useMemo(
    () => filterLines(logs, { query: logFilter, levels: logLevels }),
    [logs, logFilter, logLevels],
  );

  // Virtualise. Twenty thousand absolutely-positioned rows is fine; twenty
  // thousand DOM nodes is not — the tab stops responding to scroll entirely.
  const total = visible.length;
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(total, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN);
  const slice = visible.slice(first, last);

  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // Follow the tail. Only when the user is actually at the bottom: yanking the
  // view down while someone is reading history is the single most infuriating
  // thing a log viewer can do.
  useEffect(() => {
    if (!logFollow || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [total, logFollow]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    // Scrolling up turns follow off; scrolling back to the bottom turns it on.
    // Never make the user find a checkbox to resume tailing.
    if (atBottom !== logFollow) setLogFollow(atBottom);
  }, [logFollow, setLogFollow]);

  const jumpTo = useCallback((index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    setLogFollow(false);
    el.scrollTop = Math.max(0, index * ROW_HEIGHT - el.clientHeight / 3);
  }, [setLogFollow]);

  // Capture the selection while it exists. By the time the button is clicked
  // the browser has already collapsed it, so reading it then returns nothing.
  const captureSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setLogSelection(undefined);
      return;
    }
    const seqOf = (node: Node | null): number | undefined => {
      let el: HTMLElement | null =
        node instanceof HTMLElement ? node : (node?.parentElement ?? null);
      while (el && !el.dataset.seq) el = el.parentElement;
      return el?.dataset.seq ? Number(el.dataset.seq) : undefined;
    };
    const a = seqOf(sel.anchorNode);
    const b = seqOf(sel.focusNode);
    if (a === undefined || b === undefined) { setLogSelection(undefined); return; }
    const firstSeq = Math.min(a, b);
    const lastSeq = Math.max(a, b);
    // Rebuild from the buffer rather than using the raw selection string: the
    // DOM text has no timestamps and the gutter would come along for the ride.
    const text = selectionText(logs, firstSeq, lastSeq);
    setLogSelection({ text, firstSeq, lastSeq, lineCount: lastSeq - firstSeq + 1 });
  }, [logs, setLogSelection]);

  useEffect(() => {
    document.addEventListener('selectionchange', captureSelection);
    return () => document.removeEventListener('selectionchange', captureSelection);
  }, [captureSelection]);

  const containers = detail?.containers ?? [];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Controls ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <div style={{ width: 260 }}>
          <SearchInputView
            value={logFilter}
            onChange={(v: string) => setLogFilter(v)}
            placeholder="Filter — text, or /regex/"
            size="sm"
          />
        </div>

        <LevelChips />

        <div className="flex-1" />

        <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-[var(--color-text-secondary)]">
          <input type="checkbox" checked={logWrap} onChange={e => setLogWrap(e.target.checked)}
                 style={{ accentColor: ACCENT }} />
          wrap
        </label>

        {/* Only offered when the pod has actually restarted — for a pod that
            never has, `--previous` just errors, and offering it invites that. */}
        {(detail?.restarts ?? 0) > 0 && (
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px]"
                 style={{ color: logPrevious ? 'var(--color-warning)' : 'var(--color-text-secondary)' }}
                 title="The run before the last restart — usually where the failure is">
            <input type="checkbox" checked={logPrevious}
                   onChange={e => setLogPrevious(e.target.checked)}
                   style={{ accentColor: 'var(--color-warning)' }} />
            previous run
          </label>
        )}

        <span className="flex items-center gap-1.5 text-[11px]"
              style={{ color: logStatus === 'streaming' ? ACCENT : 'var(--color-text-muted)' }}>
          <span style={{
            width: 6, height: 6, borderRadius: 6,
            background: logStatus === 'streaming' ? ACCENT
              : logStatus === 'error' ? 'var(--color-error)' : 'var(--color-text-muted)',
            boxShadow: logStatus === 'streaming' ? `0 0 6px ${ACCENT}` : 'none',
          }} />
          {logStatus === 'streaming' ? 'live' : logStatus === 'ended' ? 'ended' : logStatus === 'error' ? 'error' : '…'}
        </span>
      </div>

      <DensityRibbon lines={visible} onJump={jumpTo} />

      {/* ── Notices ── */}
      {logDropped > 0 && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-md text-[11px] shrink-0"
             style={{
               background: 'color-mix(in srgb, var(--color-warning) 10%, var(--color-surface))',
               border: '1px solid color-mix(in srgb, var(--color-warning) 28%, transparent)',
               color: 'var(--color-warning)',
             }}>
          {logDropped.toLocaleString()} earlier lines dropped — this pod logs faster than the
          view can hold. Narrow the filter, or export the full log to disk.
        </div>
      )}

      {logStatus === 'error' && logDetail && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-md text-[11px] font-mono shrink-0"
             style={{
               background: 'color-mix(in srgb, var(--color-error) 10%, var(--color-surface))',
               border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
               color: 'var(--color-error)',
             }}>
          {logDetail}
        </div>
      )}

      {containers.length > 1 && (
        <div className="flex items-center gap-1.5 px-4 pt-2 shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
            container
          </span>
          {containers.map(c => (
            <ContainerChip key={c.name} name={c.name} />
          ))}
        </div>
      )}

      {/* ── Lines ── */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-auto px-4 py-2 font-mono min-h-0"
        style={{ fontSize: 11.5, lineHeight: `${ROW_HEIGHT}px` }}
      >
        {total === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[12px] text-[var(--color-text-muted)]" style={{ fontFamily: 'inherit' }}>
              {logs.length === 0
                ? logStatus === 'streaming' ? 'Connected — waiting for the pod to say something.' : 'No output yet.'
                : `No line matches. ${logs.length.toLocaleString()} hidden by the filter.`}
            </span>
          </div>
        ) : (
          <div style={{ height: total * ROW_HEIGHT, position: 'relative' }}>
            <div style={{ position: 'absolute', top: first * ROW_HEIGHT, left: 0, right: 0 }}>
              {slice.map(line => (
                <div
                  key={line.seq}
                  data-seq={line.seq}
                  className="flex gap-2.5"
                  style={{
                    minHeight: ROW_HEIGHT,
                    whiteSpace: logWrap ? 'pre-wrap' : 'pre',
                    // Errors get a faint wash and a left rail: enough to find
                    // by scrolling past, not so much that a burst is a wall.
                    background: line.level === 'error'
                      ? 'color-mix(in srgb, var(--color-error) 7%, transparent)'
                      : line.level === 'warn'
                        ? 'color-mix(in srgb, var(--color-warning) 5%, transparent)'
                        : 'transparent',
                    borderLeft: `2px solid ${
                      line.level === 'error' ? 'var(--color-error)'
                      : line.level === 'warn' ? 'var(--color-warning)' : 'transparent'
                    }`,
                    paddingLeft: 6,
                  }}
                >
                  {line.ts !== undefined && (
                    <span className="shrink-0 select-none"
                          style={{ color: 'var(--color-text-muted)', opacity: 0.65, fontVariantNumeric: 'tabular-nums' }}>
                      {formatLogTime(line.ts)}
                    </span>
                  )}
                  <span style={{
                    color: line.level === 'error' ? 'var(--color-error)'
                      : line.level === 'warn' ? 'var(--color-warning)'
                      : line.level === 'debug' ? 'var(--color-text-muted)'
                      : 'var(--color-text-primary)',
                    flex: logWrap ? 1 : undefined,
                  }}>
                    <Highlighted text={line.text} hits={line.hits} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Selection → AI ── */}
      {logSelection && <AskAiButton selection={logSelection} />}

      {/* ── Footer ── */}
      <div className="flex items-center gap-3 px-4 py-1.5 text-[10.5px] shrink-0"
           style={{
             borderTop: '1px solid var(--color-surface-border)',
             color: 'var(--color-text-muted)',
           }}>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {total.toLocaleString()}
          {total !== logs.length && ` of ${logs.length.toLocaleString()}`} lines
        </span>
        {!logFollow && total > 0 && (
          <button
            type="button"
            onClick={() => setLogFollow(true)}
            className="cursor-pointer bg-transparent border-none px-0 text-[10.5px]"
            style={{ color: ACCENT }}
          >
            ↓ jump to live
          </button>
        )}
        <div className="flex-1" />
        <span>select any text to ask AI about it</span>
      </div>
    </div>
  );
}

function ContainerChip({ name }: { name: string }) {
  const { logContainer, setLogContainer } = useK8sStore();
  const on = logContainer === name;
  return (
    <button
      type="button"
      onClick={() => setLogContainer(on ? undefined : name)}
      className="px-2 py-0.5 rounded text-[10.5px] font-mono cursor-pointer"
      style={{
        background: on ? `color-mix(in srgb, ${ACCENT} 16%, transparent)` : 'transparent',
        border: `1px solid ${on ? `color-mix(in srgb, ${ACCENT} 40%, transparent)` : 'var(--color-surface-border)'}`,
        color: on ? ACCENT : 'var(--color-text-secondary)',
      }}
    >
      {name}
    </button>
  );
}
