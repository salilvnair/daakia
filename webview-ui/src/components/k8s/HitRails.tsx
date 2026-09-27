/**
 * The two rails of a search result: which pods and loggers the hits came
 * from, and what the line you clicked names.
 *
 * ── Left: where the hits are ──
 *
 * Hits by pod first, because the first thing a result over three pods is
 * asked is whether it is one pod's problem or all of theirs. Then the loggers
 * that matched — a search for `LedgerClient` that also caught `LedgerRetry`
 * is two stories, and a click narrows to one.
 *
 * ── Right: what the line knows ──
 *
 * A search finds a line; the question after is never about that line. So the
 * rail lists what it names — the thread, the request id, the downstream — each
 * with how far it spreads through the result, and Follow beside it. Follow
 * takes the value across every pod in the search, not only this one. A value
 * that spreads over most of the log is "wide", and Follow asks before running
 * it. A number is not followed at all: it is charted, or used as a floor.
 *
 * Every card says where it was read from, and the rail says it once at the
 * bottom — the layout pattern and the MDC are the pod's own words, a pattern's
 * hole is somebody's statement about a logger, and nothing here is guessed.
 */
import { useMemo, useState } from 'react';
import { ButtonView, ModalView, IconSize } from '@salilvnair/dui';
import { CopyIcon, CheckIcon, SettingsIcon, CloseIcon } from '../../icons';
import { copyText } from '../../utils/clipboard';
import { useTabsStore } from '../../store/tabs-store';
import type { ResultLine } from './search-results';
import { fieldsOf, type LineField } from './line-fields';
import { readFields, valueOf, type FieldReader } from './field-readers';
import { spread, numberOf, series, whereFrom, isMeasure } from './follow';
import { correlateFor, removeView, type CorrelateKey, type SavedFollow } from './follow-prefs';
import { podHue, podTail } from './pod-hue';
import { ACCENT } from './tone';

const label: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--color-text-muted)',
};

/* ── Left ── */

export function HitsByPodRail({ lines, pods, shown, onTogglePod, onLogger }: {
  lines: ResultLine[];
  /** Every pod searched, so a pod with nothing is listed as nothing. */
  pods: string[];
  /** The pods on screen; empty is all. */
  shown: string[];
  onTogglePod: (pod: string) => void;
  onLogger: (logger: string) => void;
}) {
  const { byPod, loggers } = useMemo(() => {
    const p = new Map<string, number>(pods.map(x => [x, 0]));
    const l = new Map<string, number>();
    for (const line of lines) {
      if (line.context) continue;
      p.set(line.pod, (p.get(line.pod) ?? 0) + 1);
      if (line.logger) l.set(line.logger, (l.get(line.logger) ?? 0) + 1);
    }
    return {
      byPod: [...p.entries()].sort((a, b) => b[1] - a[1]),
      loggers: [...l.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  }, [lines, pods]);

  if (byPod.length < 2 && !loggers.length) return null;

  return (
    <div className="flex flex-col py-2.5 shrink-0" style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
      {byPod.length > 1 && (
        <>
          <div className="px-3 pb-1.5" style={label}>hits by pod</div>
          {byPod.map(([pod, n]) => {
            const on = shown.includes(pod);
            return (
              <button key={pod} type="button" onClick={() => onTogglePod(pod)}
                      title={on ? `Show every pod again` : `Only ${pod}`}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-left cursor-pointer border-none"
                      style={{
                        background: on ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : 'transparent',
                        borderLeft: `2px solid ${on ? ACCENT : 'transparent'}`,
                        opacity: n ? 1 : 0.55,
                      }}>
                <span style={{ width: 7, height: 7, borderRadius: 7, background: podHue(pod), flexShrink: 0 }} />
                <span className="flex-1 truncate font-mono text-[11px]" style={{ color: 'var(--color-text-primary)' }}>{pod}</span>
                <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
              </button>
            );
          })}
        </>
      )}
      {loggers.length > 0 && (
        <>
          <div className="px-3 pt-3 pb-1.5" style={label}>loggers that matched</div>
          {loggers.map(([logger, n]) => (
            <button key={logger} type="button" onClick={() => onLogger(logger)}
                    title={`Only lines from ${logger}`}
                    className="flex items-center gap-2 w-full px-3 py-1 text-left cursor-pointer border-none bg-transparent hover:bg-[var(--color-surface-hover)]">
              <span className="flex-1 truncate font-mono text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{logger}</span>
              <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>{n}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

/* ── Right ── */

/** A numeric field's values over time, drawn small: area, last point marked. */
export function Sparkline({ points, width = 260, height = 44 }: { points: { ts: number; v: number }[]; width?: number; height?: number }) {
  if (points.length < 2) {
    return <div className="text-[10.5px] py-1" style={{ color: 'var(--color-text-muted)' }}>Only {points.length} point — nothing to chart yet.</div>;
  }
  const t0 = points[0].ts;
  const t1 = points[points.length - 1].ts || t0 + 1;
  const max = Math.max(...points.map(p => p.v));
  const min = Math.min(0, ...points.map(p => p.v));
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * (width - 8) + 4;
  const y = (v: number) => height - 4 - ((v - min) / Math.max(1e-9, max - min)) * (height - 10);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.ts).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img"
         aria-label={`${points.length} values from ${min} to ${max}`} style={{ display: 'block' }}>
      <line x1={4} x2={width - 4} y1={y(min)} y2={y(min)} stroke="var(--color-surface-border)" strokeWidth={1} />
      <path d={`${d} L${x(last.ts).toFixed(1)},${y(min)} L${x(t0).toFixed(1)},${y(min)} Z`}
            fill={`color-mix(in srgb, ${ACCENT} 16%, transparent)`} stroke="none" />
      <path d={d} fill="none" stroke={ACCENT} strokeWidth={1.4} />
      <circle cx={x(last.ts)} cy={y(last.v)} r={2.6} fill={ACCENT} />
      <text x={width - 4} y={9} textAnchor="end" fontSize={9} fill="var(--color-text-muted)">max {max}</text>
    </svg>
  );
}

export function HitFieldsRail({
  line, lines, readers, order, askAbove, columns, floors, charts, views,
  onFollow, onToggleColumn, onFloor, onToggleChart, onOpenView,
}: {
  line?: ResultLine;
  lines: ResultLine[];
  readers: FieldReader[];
  order: CorrelateKey[];
  askAbove: number;
  columns: string[];
  floors: { field: string; min: number }[];
  charts: string[];
  views: SavedFollow[];
  onFollow: (field: string, value: string) => void;
  onToggleColumn: (key: string) => void;
  onFloor: (field: string, min: number | undefined) => void;
  onToggleChart: (field: string) => void;
  onOpenView: (v: SavedFollow) => void;
}) {
  const [asking, setAsking] = useState<{ field: string; value: string; lines: number; pods: number } | undefined>();

  const fields = useMemo(() => {
    if (!line) return [];
    /* The logger is in the left rail for every line; a card for it would say
       "follow everything this class wrote", which is a filter, not a thread. */
    return fieldsOf(line, { read: readFields(line, readers) }).filter(f => f.key !== 'logger');
  }, [line, readers]);

  /* The card Follow-this-line would pick: the first key in the Correlate order the line carries. */
  const byOrder = useMemo(() => (line
    ? correlateFor(line, order, k => valueOf(line, k, readers))
    : undefined), [line, order, readers]);
  const primary = byOrder?.field;

  const hits = useMemo(() => lines.filter(l => !l.context), [lines]);

  const follow = (f: LineField) => {
    const s = spread(hits, f.key, f.value, readers);
    if (s.lines >= askAbove) setAsking({ field: f.key, value: f.value, ...s });
    else onFollow(f.key, f.value);
  };

  return (
    <div className="flex flex-col h-full min-h-0"
         style={{ width: 320, flexShrink: 0, borderLeft: '1px solid var(--color-surface-border)', background: 'var(--color-panel, var(--color-surface))' }}>
      <div className="px-3.5 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="text-[12.5px] font-semibold flex-1" style={{ color: 'var(--color-text-primary)' }}>Fields in this line</div>
          {line && (
            <ButtonView size="xs" variant="secondary" accentColor={ACCENT} color={byOrder ? ACCENT : undefined}
                        disabled={!byOrder}
                        title={byOrder
                          ? `Follows ${byOrder.field} — the first of the Correlate by order this line carries`
                          : 'This line carries none of the Correlate by fields — follow one of its fields instead'}
                        onClick={() => byOrder && follow({ key: byOrder.field, value: byOrder.value, origin: 'mdc' })}>
              Follow this line
            </ButtonView>
          )}
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          {line
            ? 'Follow takes the value across every pod in the search, not just this one.'
            : 'Click a line to see what it names — its thread, its ids — and follow any of them across the pods.'}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-2.5 flex flex-col gap-1.5 pb-2">
        {line && !fields.length && (
          <div className="text-[11px] px-1 py-2" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            This line names nothing that can be followed. A log format on its pod would give it a thread;
            a pattern in the Loggers tab, or a field on the Fields page, would name the values in its message.
          </div>
        )}

        {fields.map(f => {
          const n = numberOf(f.value);
          const numeric = n !== undefined && f.origin !== 'format' && isMeasure(f.key, f.value);
          const s = spread(hits, f.key, f.value, readers);
          const wide = !numeric && s.lines >= askAbove;
          const isPrimary = f.key === primary;
          const floor = floors.find(x => x.field === f.key);
          return (
            <div key={f.key} className="rounded-lg px-2.5 py-2"
                 style={{
                   border: `1px solid ${isPrimary ? ACCENT : 'var(--color-surface-border)'}`,
                   background: isPrimary ? `color-mix(in srgb, ${ACCENT} 8%, transparent)` : 'transparent',
                 }}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px]" style={{ color: 'var(--color-info, #9cdcfe)' }}>{f.key}</span>
                <span className="flex-1" />
                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }} title={`Read from ${f.origin}`}>
                  {numeric ? 'numeric' : `${s.lines.toLocaleString()} line${s.lines === 1 ? '' : 's'}${s.pods > 1 ? ` · ${s.pods} pods` : ''}`}
                </span>
              </div>
              <div className="font-mono text-[11.5px] my-1 break-all"
                   style={{ color: numeric ? 'var(--color-success, #b5cea8)' : 'var(--color-warning-text, #ce9178)' }}>
                {f.secret ? '••••••' : f.value}
              </div>
              {numeric ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <ButtonView size="xs" variant="secondary" accentColor={ACCENT}
                                color={charts.includes(f.key) ? ACCENT : undefined}
                                onClick={() => onToggleChart(f.key)}>
                      {charts.includes(f.key) ? 'Hide chart' : 'Chart it'}
                    </ButtonView>
                    <ButtonView size="xs" variant="secondary" accentColor={ACCENT}
                                color={floor ? ACCENT : undefined}
                                title={floor ? 'Show every line again' : `Only lines where ${f.key} is at least ${n}`}
                                onClick={() => onFloor(f.key, floor ? undefined : n)}>
                      {floor ? `≥ ${floor.min} · clear` : `Only when ≥ ${n}`}
                    </ButtonView>
                  </div>
                  {charts.includes(f.key) && (
                    <div className="mt-2"><Sparkline points={series(hits, f.key, readers)} /></div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  <ButtonView size="xs" variant={isPrimary && !wide ? 'accent' : 'secondary'} accentColor={ACCENT}
                              color={isPrimary || wide ? undefined : ACCENT}
                              title={`Every line with ${f.key} = ${f.value}, on every pod in the search`}
                              onClick={() => follow(f)}>
                    Follow
                  </ButtonView>
                  <ButtonView size="xs" variant="secondary" accentColor={ACCENT}
                              color={columns.includes(f.key) ? ACCENT : undefined}
                              onClick={() => onToggleColumn(f.key)}>
                    {columns.includes(f.key) ? 'Remove column' : 'Add as column'}
                  </ButtonView>
                  <CopyButton value={f.value} />
                  {wide && <span className="text-[10.5px]" style={{ color: 'var(--color-warning)' }}>wide — it will ask first</span>}
                </div>
              )}
            </div>
          );
        })}

        {!line && views.length > 0 && (
          <div className="flex flex-col gap-1 mt-1">
            <div className="px-1 pb-1" style={label}>saved follows</div>
            {views.map(v => (
              <div key={v.id} className="flex items-center gap-1.5 rounded-md px-2 py-1.5"
                   style={{ border: '1px solid var(--color-surface-border)' }}>
                <button type="button" onClick={() => onOpenView(v)}
                        className="flex-1 min-w-0 text-left cursor-pointer border-none bg-transparent p-0">
                  <div className="text-[11.5px] truncate" style={{ color: 'var(--color-text-primary)' }}>{v.name}</div>
                  <div className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                    {v.conds.map(c => `${c.field} = ${c.value}`).join(' AND ')} · {v.pods.map(p => podTail(p.pod)).join(', ')}
                  </div>
                </button>
                <ButtonView size="xs" variant="ghost" title="Forget this follow" aria-label="Forget this follow"
                            iconLeft={<CloseIcon size={IconSize.chip} />} onClick={() => removeView(v.id)} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-3.5 py-2.5 shrink-0" style={{ borderTop: '1px solid var(--color-surface-border)' }}>
        <div className="mb-1.5" style={label}>where these came from</div>
        <div className="text-[11px]" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          {whereFrom(fields) || 'The layout pattern, the MDC, the Loggers tab’s patterns and the fields you name — in that order.'}
        </div>
        <div className="mt-2">
          <ButtonView size="xs" variant="secondary" accentColor={ACCENT}
                      iconLeft={<SettingsIcon size={IconSize.chip} />}
                      onClick={() => useTabsStore.getState().openSettingsTab('dk8s-fields')}>
            Edit how fields are read
          </ButtonView>
        </div>
      </div>

      {asking && (
        <ModalView open onClose={() => setAsking(undefined)} size="sm"
                   title={`Follow ${asking.field}?`}
                   subtitle={`${asking.value}`}
                   headerColor={ACCENT}
                   footerRight={
                     <div className="flex items-center gap-2">
                       <ButtonView size="sm" variant="secondary" label="Cancel" onClick={() => setAsking(undefined)} />
                       <ButtonView size="sm" variant="secondary" accentColor={ACCENT} color={ACCENT} label="Follow anyway"
                                   onClick={() => { const a = asking; setAsking(undefined); onFollow(a.field, a.value); }} />
                     </div>
                   }>
          <div className="text-[12px] py-1" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            This value is on {asking.lines.toLocaleString()} lines{asking.pods > 1 ? ` across ${asking.pods} pods` : ''} of
            the result already — more than the {askAbove.toLocaleString()} set on the Fields page. Following it reads
            every pod again around this line and will bring back a great deal. A narrower field, if the line has one,
            is usually the better thread.
          </div>
        </ModalView>
      )}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <ButtonView size="xs" variant="secondary" accentColor={ACCENT}
                title={done ? 'Copied' : 'Copy the value'} aria-label="Copy the value"
                color={done ? 'var(--color-success)' : undefined}
                iconLeft={done ? <CheckIcon size={IconSize.chip} /> : <CopyIcon size={IconSize.chip} />}
                onClick={async () => { if (await copyText(value)) { setDone(true); setTimeout(() => setDone(false), 1400); } }} />
  );
}
