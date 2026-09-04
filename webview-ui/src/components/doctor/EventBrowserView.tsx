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
import { useEffect, useState } from 'react';
import { postMsg } from '../../vscode';

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
  const [filter, setFilter] = useState('');

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

  const shown = filter.trim()
    ? types.filter(t => t.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : types;

  const families = new Map<string, EventTypeSummary[]>();
  for (const t of shown) {
    const f = familyOf(t.name);
    const list = families.get(f);
    if (list) list.push(t); else families.set(f, [t]);
  }

  const totalEvents = types.reduce((a, t) => a + t.count, 0);

  return (
    <div className="flex min-h-0" style={{ gap: 0, height: '100%' }}>
      {/* ── the types ── */}
      <div className="flex flex-col min-h-0" style={{ width: 268, flexShrink: 0 }}>
        <div className="px-2 py-1.5 flex items-center gap-2">
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter event types…"
            spellCheck={false}
            className="h-[22px] px-2 rounded-md text-[10.5px] font-mono outline-none"
            style={{
              width: '100%', color: 'var(--color-text-primary)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-surface-border)',
            }}
          />
        </div>
        <div className="px-2 pb-1 text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {types.length} types · {totalEvents.toLocaleString()} events
        </div>

        <div style={{ overflowY: 'auto', minHeight: 0, paddingBottom: 8 }}>
          {[...families].map(([family, list]) => (
            <div key={family}>
              <div style={{
                fontSize: 8.5, fontWeight: 600, letterSpacing: '.08em',
                textTransform: 'uppercase', color: 'var(--color-text-muted)',
                padding: '7px 10px 3px', opacity: 0.75,
              }}>{family}</div>
              {list.map(t => {
                const on = t.name === selected;
                return (
                  <button key={t.name} type="button"
                          onClick={() => { setSelected(t.name); setOffset(0); }}
                          title={t.fields.length ? t.fields.join(', ') : t.name}
                          style={{
                            font: 'inherit', cursor: 'pointer', width: '100%',
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '3px 10px', border: 'none', textAlign: 'left',
                            background: on ? 'color-mix(in srgb, var(--color-dk8s) 14%, transparent)' : 'transparent',
                          }}>
                    <span style={{
                      flex: 1, minWidth: 0, fontFamily: 'ui-monospace, monospace', fontSize: 10.5,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      color: on ? 'var(--color-dk8s)' : 'var(--color-text-secondary)',
                    }}>{t.name.replace(/^jdk\./, '')}</span>
                    <span style={{
                      fontFamily: 'ui-monospace, monospace', fontSize: 9.5,
                      fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-muted)',
                    }}>{t.count.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── the rows ── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0"
           style={{ borderLeft: '1px solid var(--color-surface-border)' }}>
        {!selected && (
          <div className="px-4 py-6 text-[11.5px] leading-relaxed"
               style={{ color: 'var(--color-text-muted)', maxWidth: '42em' }}>
            Pick an event type to see what the JVM actually wrote. This is the
            recording with nothing interpreted — the other tabs each read a
            handful of these types and summarise them; here they are raw, in the
            order the JVM emitted them.
          </div>
        )}

        {selected && (
          <>
            <div className="flex items-center gap-3 px-3 py-1.5 flex-wrap"
                 style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
              <span style={{
                fontFamily: 'ui-monospace, monospace', fontSize: 11.5, fontWeight: 600,
                color: 'var(--color-text-primary)',
              }}>{selected}</span>
              <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                {data ? <>{(offset + 1).toLocaleString()}–{(offset + data.rows.length).toLocaleString()} of {data.total.toLocaleString()}</> : '…'}
              </span>
              <span className="flex-1" />
              <button type="button" disabled={offset === 0 || busy}
                      onClick={() => setOffset(o => Math.max(0, o - PAGE))}
                      style={pageBtn(offset === 0 || busy)}>← newer</button>
              <button type="button"
                      disabled={busy || !data || offset + PAGE >= data.total}
                      onClick={() => setOffset(o => o + PAGE)}
                      style={pageBtn(busy || !data || offset + PAGE >= data.total)}>older →</button>
            </div>

            <div style={{ overflow: 'auto', minHeight: 0 }}>
              {busy && (
                <div className="px-3 py-3 text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                  reading the recording…
                </div>
              )}
              {data?.error && (
                <div className="px-3 py-3 text-[10.5px]" style={{ color: 'var(--color-error)' }}>
                  {data.error}
                </div>
              )}
              {!busy && data && !data.error && data.rows.length > 0 && (
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      {data.fields.map(f => (
                        <th key={f} style={{
                          position: 'sticky', top: 0, zIndex: 1,
                          textAlign: 'left', whiteSpace: 'nowrap',
                          fontSize: 8.5, fontWeight: 600, letterSpacing: '.06em',
                          textTransform: 'uppercase', color: 'var(--color-text-muted)',
                          padding: '5px 10px 5px 0', background: 'var(--color-panel)',
                          borderBottom: '1px solid var(--color-surface-border)',
                        }}>{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={i}>
                        {data.fields.map(f => (
                          <td key={f} title={r[f]} style={{
                            fontFamily: 'ui-monospace, monospace', fontSize: 10,
                            color: 'var(--color-text-secondary)',
                            padding: '2.5px 10px 2.5px 0', whiteSpace: 'nowrap',
                            maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{r[f]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!busy && data && !data.error && data.rows.length === 0 && (
                <div className="px-3 py-3 text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                  No rows at this offset.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function pageBtn(disabled: boolean): React.CSSProperties {
  return {
    font: 'inherit', fontSize: 10, fontFamily: 'ui-monospace, monospace',
    cursor: disabled ? 'default' : 'pointer',
    padding: '2px 8px', borderRadius: 5,
    color: disabled ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
    background: 'transparent',
    border: '1px solid var(--color-surface-border)',
    opacity: disabled ? 0.45 : 1,
  };
}
