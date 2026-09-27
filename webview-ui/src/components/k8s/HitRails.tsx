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
 * Each pod wears its replica's colour — red, amber, blue in the order the
 * pods were searched — the same colour Follow's count strip and pod column
 * give it, so a pod is recognisable from one screen to the next by colour
 * alone. By app (`podHue`) all three would be one colour, which is the one
 * thing a result over three replicas must not do.
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
 * The card the Correlate by order picks — the one "follow this line" means —
 * is the selected card: teal-edged, its Follow filled, its value one click
 * from the clipboard. The others offer Follow in outline; a wide one says it
 * will ask, in amber, where the rest have Add as column.
 *
 * Every card says where it was read from, and the rail says it once at the
 * bottom — the layout pattern and the MDC are the pod's own words, a pattern's
 * hole is somebody's statement about a logger, and nothing here is guessed.
 */
import { useMemo, useState } from 'react';
import { ButtonView, ModalView, IconSize } from '@salilvnair/dui';
import { CloseIcon } from '../../icons';
import { copyText } from '../../utils/clipboard';
import { useTabsStore } from '../../store/tabs-store';
import type { ResultLine } from './search-results';
import { fieldsOf, type LineField } from './line-fields';
import { readFields, valueOf, type FieldReader } from './field-readers';
import { spread, numberOf, series, isMeasure } from './follow';
import { correlateFor, removeView, type CorrelateKey, type SavedFollow } from './follow-prefs';
import { replicaHue, podTail } from './pod-hue';
import { FOLLOW, FIELD_KEY, FIELD_VALUE, FIELD_NUMBER, AMBER, GOOD, tint } from './follow-tone';
import { LineButton, FillButton, railLabel, mono } from './follow-ui';
import { useCopyTick, CopyGlyph } from '../shared/CopyTick';

/* ── Left ── */

export function HitsByPodRail({ lines, pods, shown, current, onTogglePod, onLogger }: {
  lines: ResultLine[];
  /** Every pod searched, so a pod with nothing is listed as nothing. */
  pods: string[];
  /** The pods on screen; empty is all. */
  shown: string[];
  /**
   * The pod of the line the reader clicked. With every pod on screen, its row
   * is the one marked — the rail says where the line in the card came from.
   */
  current?: string;
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
    <div className="flex flex-col shrink-0"
         style={{ padding: '10px 0', borderBottom: '1px solid var(--color-surface-border)' }}>
      {byPod.length > 1 && (
        <>
          <div style={{ ...railLabel, padding: '0 12px 8px' }}>hits by pod</div>
          {byPod.map(([pod, n]) => {
            const filtered = shown.includes(pod);
            const on = filtered || (!shown.length && pod === current);
            return (
              <button key={pod} type="button" onClick={() => onTogglePod(pod)}
                      title={filtered ? 'Show every pod again' : `Only ${pod}`}
                      className="flex items-center w-full text-left cursor-pointer border-none"
                      style={{
                        gap: 9, padding: '7px 12px', fontSize: 12,
                        background: on ? tint(FOLLOW, 10) : 'transparent',
                        borderLeft: on ? `2px solid ${FOLLOW}` : 'none',
                        color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        opacity: n ? 1 : 0.55,
                      }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: replicaHue(pod, pods), flexShrink: 0 }} />
                <span className="flex-1 min-w-0 truncate" style={{ ...mono, fontSize: 11.5 }}>{pod}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
              </button>
            );
          })}
        </>
      )}
      {byPod.length > 1 && loggers.length > 0 && (
        <div style={{ height: 1, margin: '10px 12px', background: 'var(--color-surface-border)' }} />
      )}
      {loggers.length > 0 && (
        <>
          <div style={{ ...railLabel, padding: '0 12px 8px' }}>loggers that matched</div>
          <div style={{ padding: '0 12px', ...mono, fontSize: 11, lineHeight: 1.9 }}>
            {loggers.map(([logger, n]) => (
              <button key={logger} type="button" onClick={() => onLogger(logger)}
                      title={`Only lines from ${logger}`}
                      className="block w-full truncate text-left cursor-pointer border-none bg-transparent p-0 hover:underline"
                      style={{ font: 'inherit', lineHeight: 'inherit', color: 'var(--color-text-secondary)' }}>
                {logger} <span style={{ color: 'var(--color-text-muted)' }}>&middot; {n}</span>
              </button>
            ))}
          </div>
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
            fill={tint(FOLLOW, 16)} stroke="none" />
      <path d={d} fill="none" stroke={FOLLOW} strokeWidth={1.4} />
      <circle cx={x(last.ts)} cy={y(last.v)} r={2.6} fill={FOLLOW} />
      <text x={width - 4} y={9} textAnchor="end" fontSize={9} fill="var(--color-text-muted)">max {max}</text>
    </svg>
  );
}

/** Where each reader's fields came from, in the words the rail's footer uses. */
const FROM: Record<string, string> = {
  format: 'the layout pattern', mdc: 'the MDC', pattern: 'the message itself',
  custom: 'a field you named', payload: 'the payload',
};
const FROM_ORDER = ['format', 'mdc', 'pattern', 'custom', 'payload'];

/**
 * "thread from the layout pattern, requestDataId and downstream from the MDC,
 * hikari.active from the message itself." — `whereFrom`'s sentence, with each
 * field's name in the teal the board draws it in.
 */
function WhereFrom({ fields }: { fields: LineField[] }) {
  const groups = FROM_ORDER
    .map(origin => ({ origin, keys: fields.filter(f => f.origin === origin).map(f => f.key) }))
    .filter(g => g.keys.length);
  if (!groups.length) return <>The layout pattern, the MDC, the Loggers tab&rsquo;s patterns and the fields you name &mdash; in that order.</>;
  const name = (k: string) => <span key={k} style={{ color: FOLLOW }}>{k}</span>;
  return (
    <>
      {groups.map((g, gi) => (
        <span key={g.origin}>
          {gi > 0 && ', '}
          {g.keys.map((k, i) => (
            <span key={k}>
              {i > 0 && (i === g.keys.length - 1 ? ' and ' : ', ')}
              {name(k)}
            </span>
          ))}
          {' '}from {FROM[g.origin]}
        </span>
      ))}
      .
    </>
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

  /*
    The selected card: the first key in the Correlate order the line carries —
    what following the whole line would take. Its Follow is the filled one, so
    "follow this line" is that button, on the card that says what it follows.
  */
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
         style={{ width: 320, flexShrink: 0, borderLeft: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
      <div className="shrink-0" style={{ padding: '12px 14px 8px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>Fields in this line</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3, lineHeight: 1.5 }}>
          {line
            ? 'Follow takes the value across every pod in the search, not just this one.'
            : 'Click a line to see what it names — its thread, its ids — and follow any of them across the pods.'}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto flex flex-col" style={{ padding: '0 10px 8px', gap: 6 }}>
        {line && !fields.length && (
          <div style={{ fontSize: 11, padding: '8px 4px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
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
          const charted = charts.includes(f.key);
          const isColumn = columns.includes(f.key);
          const column = (
            <LineButton tone={isColumn ? FOLLOW : undefined} onClick={() => onToggleColumn(f.key)}
                        style={{ padding: '0 9px' }}>
              {isColumn ? 'Remove column' : 'Add as column'}
            </LineButton>
          );
          return (
            <div key={f.key} className="group"
                 style={{
                   padding: '8px 10px', borderRadius: 8,
                   border: `1px solid ${isPrimary ? FOLLOW : 'var(--color-surface-border)'}`,
                   background: isPrimary ? tint(FOLLOW, 8) : 'transparent',
                 }}>
              <div className="flex items-center" style={{ gap: 8 }}>
                <span className="truncate" style={{ ...mono, fontSize: 11, color: FIELD_KEY }}>{f.key}</span>
                <span className="flex-1" />
                <span className="shrink-0" style={{ fontSize: 10, color: 'var(--color-text-muted)' }} title={`Read from ${f.origin}`}>
                  {numeric ? 'numeric' : `${s.lines.toLocaleString()} line${s.lines === 1 ? '' : 's'}${s.pods > 1 ? ` · ${s.pods} pods` : ''}`}
                </span>
              </div>
              <div style={{ ...mono, fontSize: 11.5, margin: '3px 0 7px', wordBreak: 'break-all', color: numeric ? FIELD_NUMBER : FIELD_VALUE }}>
                {f.secret ? '••••••' : f.value}
              </div>
              {numeric ? (
                <>
                  <div className="flex items-center" style={{ gap: 6 }}>
                    <LineButton tone={charted ? FOLLOW : undefined} onClick={() => onToggleChart(f.key)}>
                      {charted ? 'Hide chart' : 'Chart it'}
                    </LineButton>
                    <LineButton tone={floor ? FOLLOW : undefined} style={{ padding: '0 9px' }}
                                title={floor ? 'Show every line again' : `Only lines where ${f.key} is at least ${n}`}
                                onClick={() => onFloor(f.key, floor ? undefined : n)}>
                      {floor ? `≥ ${floor.min} · clear` : `Only when ≥ ${n}`}
                    </LineButton>
                  </div>
                  {charted && (
                    <div className="mt-2"><Sparkline points={series(hits, f.key, readers)} /></div>
                  )}
                </>
              ) : wide && !isPrimary ? (
                <div className="flex items-center" style={{ gap: 8 }}>
                  <LineButton title={`Every line with ${f.key} = ${f.value}, on every pod in the search`}
                              onClick={() => follow(f)}>
                    Follow
                  </LineButton>
                  <span style={{ fontSize: 10.5, color: AMBER }}>wide &mdash; it will ask first</span>
                  {/* The board has the note where Add as column would be. A
                      column already on stays in view to be removed; otherwise
                      the button waits for the pointer. */}
                  {isColumn ? column : <Reveal>{column}</Reveal>}
                </div>
              ) : (
                <div className="flex items-center" style={{ gap: 6 }}>
                  {isPrimary ? (
                    <FillButton title={`Every line with ${f.key} = ${f.value}, on every pod in the search — the first of the Correlate by order this line carries`}
                                onClick={() => follow(f)}>
                      Follow
                    </FillButton>
                  ) : (
                    <LineButton tone={FOLLOW} title={`Every line with ${f.key} = ${f.value}, on every pod in the search`}
                                onClick={() => follow(f)}>
                      Follow
                    </LineButton>
                  )}
                  {column}
                  {isPrimary ? <CopyButton value={f.value} /> : <Reveal><CopyButton value={f.value} /></Reveal>}
                  {wide && <span style={{ fontSize: 10.5, color: AMBER }}>wide</span>}
                </div>
              )}
            </div>
          );
        })}

        {!line && views.length > 0 && (
          <div className="flex flex-col mt-1" style={{ gap: 6 }}>
            <div style={{ ...railLabel, padding: '0 4px 2px' }}>saved follows</div>
            {views.map(v => (
              <div key={v.id} className="flex items-center"
                   style={{ gap: 6, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-surface-border)' }}>
                <button type="button" onClick={() => onOpenView(v)}
                        className="flex-1 min-w-0 text-left cursor-pointer border-none bg-transparent p-0">
                  <div className="truncate" style={{ fontSize: 11.5, color: 'var(--color-text-primary)' }}>{v.name}</div>
                  <div className="truncate" style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
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

      <div className="shrink-0" style={{ padding: '10px 14px', borderTop: '1px solid var(--color-surface-border)' }}>
        <div style={{ ...railLabel, marginBottom: 6 }}>where these came from</div>
        <div style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
          <WhereFrom fields={fields} />
        </div>
        <LineButton style={{ marginTop: 8 }}
                    onClick={() => useTabsStore.getState().openSettingsTab('dk8s-fields')}>
          Edit how fields are read
        </LineButton>
      </div>

      {asking && (
        <ModalView open onClose={() => setAsking(undefined)} size="sm"
                   title={`Follow ${asking.field}?`}
                   subtitle={`${asking.value}`}
                   headerColor={FOLLOW}
                   footerRight={
                     <div className="flex items-center gap-2">
                       <LineButton h={28} fs={12} onClick={() => setAsking(undefined)}>Cancel</LineButton>
                       <FillButton h={28} fs={12} onClick={() => { const a = asking; setAsking(undefined); onFollow(a.field, a.value); }}>
                         Follow anyway
                       </FillButton>
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

/**
 * A control the board does not draw on a card at rest — copy on a card that is
 * not the selected one, Add as column on a wide one — kept, but shown only
 * while the pointer or the keyboard is on the card.
 */
function Reveal({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">{children}</span>;
}

/** The square copy button beside the selected card's Follow. */
function CopyButton({ value }: { value: string }) {
  const { copied: done, flash } = useCopyTick();
  return (
    <LineButton title={done ? 'Copied' : 'Copy value'} aria-label="Copy value"
                style={{ width: 26, padding: 0, color: done ? GOOD : 'var(--color-text-secondary)' }}
                iconLeft={<CopyGlyph copied={done} size={12} />}
                onClick={async () => { if (await copyText(value)) flash(); }} />
  );
}
