/**
 * HeapHistogramView — the familiar class table, with the columns that matter.
 *
 * Virtualized by hand rather than with a library: a real dump has thousands of
 * classes, and the rows are fixed-height, so windowing is a slice and two spacer
 * divs. Pulling in a virtualization dependency for that would be the expensive
 * way to get the same result.
 */
import { useEffect, useRef, useState } from 'react';
import { heapQuery, bytes, hueFor, type ClassStat } from './heap-query';
import { ClassSourceLink } from './ClassSourceLink';

const ROW_H = 26;
const OVERSCAN = 8;

type Sort = 'shallow' | 'instances' | 'retained';

const COLUMNS: { id: Sort; label: string; title: string }[] = [
  { id: 'shallow', label: 'Shallow', title: 'Sum of the objects’ own bytes. These add up to the live heap exactly.' },
  { id: 'retained', label: 'Retained (sum)', title: 'Sum of each instance’s retained size. Instances that dominate each other overlap, so this can exceed the live heap — it is not MAT’s union retained set.' },
  { id: 'instances', label: 'Instances', title: 'Live instance count.' },
];

export function HeapHistogramView({ liveBytes, packageFilter }: { liveBytes: number; packageFilter?: string }) {
  const [rows, setRows] = useState<ClassStat[]>([]);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<Sort>('shallow');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(400);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Debounced so typing doesn't fire a query per keystroke.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      heapQuery<{ total: number; rows: ClassStat[] }>({ type: 'histogram', sort, search, limit: 1000, packageFilter })
        .then(r => { if (!live) return; setRows(r.rows); setTotal(r.total); setError(''); })
        .catch(e => { if (live) setError(e.message); })
        .finally(() => { if (live) setLoading(false); });
    }, search || packageFilter ? 180 : 0);
    return () => { live = false; clearTimeout(t); };
    // Debounced on the same timer as the search box: a package filter is
    // typed a character at a time too, and each keystroke is a full re-scan.
  }, [sort, search, packageFilter]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visible = Math.ceil(height / ROW_H) + OVERSCAN * 2;
  const slice = rows.slice(first, first + visible);
  const maxShallow = rows.length ? Math.max(...rows.slice(0, 200).map(r => r.shallowBytes)) : 1;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0 flex-wrap"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter classes…"
          className="h-[24px] px-2 rounded-md text-[11.5px] font-mono outline-none"
          style={{
            background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)',
            border: '1px solid var(--color-surface-border)', minWidth: 220,
          }}
        />
        <div className="flex items-center gap-1">
          {COLUMNS.map(c => (
            <button
              key={c.id} type="button" title={c.title}
              onClick={() => setSort(c.id)}
              className="h-[24px] px-2.5 rounded-md text-[11px] cursor-pointer"
              style={{
                color: sort === c.id ? 'var(--color-doctor)' : 'var(--color-text-secondary)',
                background: sort === c.id ? 'color-mix(in srgb, var(--color-doctor) 14%, transparent)' : 'transparent',
                border: `1px solid ${sort === c.id ? 'color-mix(in srgb, var(--color-doctor) 34%, transparent)' : 'transparent'}`,
              }}
            >
              ↓ {c.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-[11px] text-[var(--color-text-muted)] font-mono tabular-nums">
          {loading ? 'loading…' : `${total.toLocaleString()} classes`}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-1 text-[10px] uppercase tracking-wider flex-shrink-0"
           style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-surface-border)' }}>
        <span className="text-right" style={{ width: 78 }}>Shallow</span>
        <span style={{ width: 54 }} />
        <span className="text-right" style={{ width: 84 }}>Retained sum</span>
        <span className="text-right" style={{ width: 70 }}>Instances</span>
        <span>Class</span>
      </div>

      {/* Rows */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto"
           onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}>
        {error && <p className="text-[12px] text-[var(--color-error)] px-3 py-3 m-0">{error}</p>}
        {!error && !loading && rows.length === 0 && (
          <p className="text-[12px] text-[var(--color-text-muted)] px-3 py-3 m-0">
            No classes match “{search}”.
          </p>
        )}
        <div style={{ height: first * ROW_H }} />
        {slice.map(r => {
          // A retained sum above the live heap is real and worth flagging rather
          // than hiding — it means instances of this class dominate each other.
          const overlaps = r.retainedSumBytes > liveBytes;
          return (
            <div key={r.classRow} className="flex items-center gap-3 px-3 text-[11.5px] font-mono"
                 style={{ height: ROW_H }}>
              <span className="text-right tabular-nums text-[var(--color-text-primary)]" style={{ width: 78 }}>
                {bytes(r.shallowBytes)}
              </span>
              <div style={{ width: 54, height: 4, borderRadius: 2, background: 'var(--color-surface-hover)', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ width: `${Math.min(100, (r.shallowBytes / maxShallow) * 100)}%`, height: '100%', background: hueFor(r.className) }} />
              </div>
              <span className="text-right tabular-nums" style={{ width: 84, color: overlaps ? 'var(--color-warning)' : 'var(--color-text-secondary)' }}
                    title={overlaps ? 'Exceeds the live heap — instances of this class dominate each other, so their retained sets overlap.' : undefined}>
                {bytes(r.retainedSumBytes)}
              </span>
              <span className="text-right tabular-nums text-[var(--color-text-secondary)]" style={{ width: 70 }}>
                {r.instances.toLocaleString()}
              </span>
              <ClassSourceLink className={r.className} />
            </div>
          );
        })}
        <div style={{ height: Math.max(0, (rows.length - first - slice.length) * ROW_H) }} />
      </div>
    </div>
  );
}
