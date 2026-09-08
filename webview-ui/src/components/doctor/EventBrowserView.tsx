/**
 * Every event type in the recording, and the raw rows behind any of them.
 *
 * The other views each answer one question well and, in doing so, throw most
 * of the recording away. A profile recording holds thirty-odd event types and
 * the built views read nine; the rest are the JVM's flags, its safepoints, its
 * module graph, its compiler statistics — things nobody wants a screen for,
 * and which occasionally settle an argument in one line.
 *
 * So this is a fallback rather than a feature: no interpretation, no ranking,
 * no rules. It is also the honest answer to "does dk8s support event X" — if
 * the JVM wrote it, it is here, whether or not anyone built a chart for it.
 *
 * Rows are fetched per type instead of arriving with the recording, because
 * the rows for every type in a profile recording are larger than everything
 * else the analyzer sends combined, and most sessions never open this at all.
 */
import { useEffect, useMemo, useState } from 'react';
import { SplitPanelView, SideNavView, BadgeChipView, IconButtonView, type SideNavItem } from '@salilvnair/dui';
import { ChevronLeftIcon, ChevronRightIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useUiStateStore } from '../../store/ui-state-store';

export interface EventTypeSummary {
  name: string;
  count: number;
  fields: string[];
}

interface Rows {
  fields: string[];
  rows: Record<string, string>[];
  total: number;
  error?: string;
}

const PAGE = 60;

let seq = 0;
const pending = new Map<string, (r: Rows) => void>();
let listening = false;

function ensureListener() {
  if (listening) return;
  listening = true;
  window.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data;
    if (msg?.type !== 'jfr:events') return;
    const resolve = pending.get(msg.requestId);
    if (!resolve) return;
    pending.delete(msg.requestId);
    resolve({ fields: msg.fields ?? [], rows: msg.rows ?? [], total: msg.total ?? 0, error: msg.error });
  });
}

function fetchRows(path: string, eventType: string, offset: number): Promise<Rows> {
  ensureListener();
  const requestId = `ev-${++seq}`;
  return new Promise(resolve => {
    /*
      A timeout that resolves rather than rejects.

      The row fetch re-reads the file, and if the host never answers the honest
      outcome is "we asked and heard nothing" — an error message in the table,
      not an unhandled rejection in the console and a spinner forever.
    */
    const timer = setTimeout(() => {
      if (pending.delete(requestId)) {
        resolve({ fields: [], rows: [], total: 0, error: 'The host did not answer in time.' });
      }
    }, 20_000);
    pending.set(requestId, r => { clearTimeout(timer); resolve(r); });
    postMsg({ type: 'jfr:events', requestId, path, eventType, limit: PAGE, offset });
  });
}

/** Group by the JFR namespace, which is the only structure the names carry. */
function familyOf(name: string): string {
  const bare = name.replace(/^jdk\./, '');
  if (/^(GC|Young|Old|G1|Parallel|Shenandoah|Z|Metaspace|Promote|Tenuring|Concurrent)/.test(bare)) return 'Garbage collection';
  if (/^(Thread|Java(Monitor|Thread)|Park)/.test(bare)) return 'Threads & locks';
  if (/^(Socket|File|NativeLibrary|SystemProcess)/.test(bare)) return 'I/O & system';
  if (/^(Object|Allocation|Class(Load|Loader)|Compil|CodeCache|Deopt)/.test(bare)) return 'Memory & JIT';
  if (/(Flag|Setting|Module|Initial|Environment|Security|SystemProperty|Container|CPU|OS|Virtualization|Shutdown|JVM)/.test(bare)) return 'JVM & environment';
  return 'Other';
}

export function EventBrowserView({ types, path }: {
  types?: EventTypeSummary[];
  /** The recording on disk; the rows are read from it on demand. */
  path?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Rows | null>(null);
  const [busy, setBusy] = useState(false);
  /* Remembered like every other split in the app. */
  const storedSplit = useUiStateStore(s => s.prefs['doctor.events.split']);
  const [railSplit, setRailSplit] = useState(() => Number(storedSplit) || 26);

  useEffect(() => {
    if (!selected || !path) { setData(null); return; }
    let cancelled = false;
    setBusy(true);
    fetchRows(path, selected, offset).then(r => { if (!cancelled) { setData(r); setBusy(false); } });
    return () => { cancelled = true; };
  }, [selected, offset, path]);

  if (!types?.length) {
    return (
      <div className="px-2 py-6 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
        No event types were read from this recording.
      </div>
    );
  }

  /* The families the JFR namespace implies, each with the types inside it.
     SideNavView draws a group header with its count and a child per type with
     its event count as a badge — the same shape Settings uses. */
  const navItems: SideNavItem[] = useMemo(() => {
    const families = new Map<string, EventTypeSummary[]>();
    for (const t of types ?? []) {
      const f = familyOf(t.name);
      const list = families.get(f);
      if (list) list.push(t); else families.set(f, [t]);
    }
    return [...families].map(([family, list]) => ({
      id: `g-${family}`,
      label: family,
      isGroup: true,
      count: list.length,
      children: list.map(t => ({
        id: t.name,
        label: t.name.replace(/^jdk\./, ''),
        badge: t.count,
      })),
    }));
  }, [types]);

  const totalEvents = (types ?? []).reduce((a, t) => a + t.count, 0);
  const current = types?.find(t => t.name === selected);

  return (
    <SplitPanelView
      direction="horizontal"
      split={railSplit}
      defaultSplit={26}
      minFirstPct={16}
      minSecondPct={40}
      accentColor="var(--color-dk8s)"
      onResize={setRailSplit}
      onResizeEnd={next => useUiStateStore.getState().setPref('doctor.events.split', String(next))}
      style={{ height: '100%', minHeight: 0 }}
      first={
        <div className="flex flex-col h-full min-h-0">
          {/* What the recording holds, before you pick anything out of it. */}
          <div className="flex items-center gap-2 px-3 py-2 shrink-0"
               style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
            <BadgeChipView tone="var(--color-dk8s)" size="sm">{types?.length ?? 0} types</BadgeChipView>
            <BadgeChipView tone="var(--color-text-muted)" size="sm" style={{ textTransform: 'none' }}>
              {totalEvents.toLocaleString()} events
            </BadgeChipView>
          </div>
          <div className="flex-1 min-h-0">
            <SideNavView
              items={navItems}
              activeId={selected ?? undefined}
              onSelect={id => { setSelected(id); setOffset(0); }}
              fillContainer
              searchable
              searchPlaceholder="Filter event types…"
              emptyText="No event type matches."
              accentColor="var(--color-dk8s)"
              size="sm"
              style={{ height: '100%' }}
            />
          </div>
        </div>
      }
      second={
        <div className="flex flex-col h-full min-w-0 min-h-0">
          {!selected ? (
            <div className="px-5 py-6 text-[11.5px] leading-relaxed"
                 style={{ color: 'var(--color-text-muted)', maxWidth: '42em' }}>
              Pick an event type to see what the JVM actually wrote. This is the
              recording with nothing interpreted — the other tabs each read a
              handful of these types and summarise them; here they are raw, in the
              order the JVM emitted them.
            </div>
          ) : (
            <>
              {/* Says what you are looking at, rather than leaving it to
                  whichever row happens to be highlighted in the rail. */}
              <div className="flex items-center gap-2.5 px-4 py-2.5 shrink-0 flex-wrap"
                   style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                <span style={{
                  fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 600,
                  color: 'var(--color-text-primary)',
                }}>{selected}</span>
                {current && (
                  <BadgeChipView tone="var(--color-dk8s)" size="xs" style={{ textTransform: 'none' }}>
                    {current.count.toLocaleString()}
                  </BadgeChipView>
                )}
                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  {data ? <>{(offset + 1).toLocaleString()}–{(offset + data.rows.length).toLocaleString()} of {data.total.toLocaleString()}</> : '…'}
                </span>
                <span className="flex-1" />
                <IconButtonView
                  icon={<ChevronLeftIcon size={13} />}
                  size="sm"
                  tooltip="Newer events"
                  disabled={offset === 0 || busy}
                  onClick={() => setOffset(o => Math.max(0, o - PAGE))}
                />
                <IconButtonView
                  icon={<ChevronRightIcon size={13} />}
                  size="sm"
                  tooltip="Older events"
                  disabled={busy || !data || offset + PAGE >= data.total}
                  onClick={() => setOffset(o => o + PAGE)}
                />
              </div>

              <div style={{ overflow: 'auto', minHeight: 0, flex: 1 }}>
                {busy && (
                  <div className="px-4 py-3 text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                    reading the recording…
                  </div>
                )}
                {data?.error && (
                  <div className="px-4 py-3 text-[10.5px]" style={{ color: 'var(--color-error)' }}>
                    {data.error}
                  </div>
                )}
                {!busy && data && !data.error && data.rows.length > 0 && (
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>
                        {data.fields.map((f, i) => (
                          <th key={f} style={{
                            position: 'sticky', top: 0, zIndex: 1,
                            textAlign: 'left', whiteSpace: 'nowrap',
                            fontSize: 8.5, fontWeight: 600, letterSpacing: '.06em',
                            textTransform: 'uppercase', color: 'var(--color-text-muted)',
                            padding: '7px 14px 7px ' + (i === 0 ? '16px' : '14px'),
                            background: 'var(--color-panel)',
                            borderBottom: '1px solid var(--color-surface-border)',
                          }}>{f}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((r, i) => (
                        /* Striped: these rows are wide and mostly numbers, and
                           the eye loses the line halfway across without it. */
                        <tr key={i} style={{
                          background: i % 2 ? 'color-mix(in srgb, var(--color-text-primary) 2.5%, transparent)' : 'transparent',
                        }}>
                          {data.fields.map((f, j) => (
                            <td key={f} title={r[f]} style={{
                              fontFamily: 'ui-monospace, monospace', fontSize: 10.5,
                              color: 'var(--color-text-secondary)',
                              padding: '5px 14px 5px ' + (j === 0 ? '16px' : '14px'),
                              whiteSpace: 'nowrap',
                              maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>{r[f]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {!busy && data && !data.error && data.rows.length === 0 && (
                  <div className="px-4 py-3 text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                    No rows at this offset.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      }
    />
  );
}
