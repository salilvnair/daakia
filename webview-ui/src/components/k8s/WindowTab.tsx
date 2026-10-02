/**
 * The window around a hit — what ran.
 *
 * Hit at 11:00, look at 10:50 to 11:30. The tab reads every line in that
 * window on the pods involved (parsed with each pod's own format, on this
 * machine) and says what the service was doing: every API called, with its
 * status mix and its slowest; every downstream; the retries and the pool. All
 * of it from the determinants that are switched on — questions somebody wrote
 * down once in Settings — and none of it from a model.
 *
 * Then it narrows without losing the summary: a chip for the thread, the
 * request id, the order, the pod the hit came from. With one on, the summary
 * re-counts against what is left, so "which APIs did this one request touch"
 * is the same screen with one chip on.
 *
 * A row opens the lines it was counted from, and the search box reads the
 * window's lines — the summary is always one step from the evidence.
 *
 * ── How it is drawn ──
 *
 * As the board draws it: a strip of where-you-came-from (Pods, the search,
 * this window) with the window as the lit tab; the hit as a pill in its
 * level's colour; the range as a segmented track whose lit segment is the
 * range being read; the density as a handful of runs, calm, amber and red,
 * with the error run taller. Table cards put the grouped-by key in the
 * method purple and tint a row red only when the service broke it — a 409 is
 * the caller's and is drawn amber, not a failure of this window.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckboxView, DateTimeInputView, PopoverView } from '@salilvnair/dui';
import { ClockIcon, CloseIcon, PlusIcon, ShorterLinesIcon, RoundTripIcon } from '../../icons';
import type { RequestTab } from '../../store/tabs-store';
import { useTabsStore } from '../../store/tabs-store';
import { useTaggedSearchStore } from '../../store/dk8s-tagged-search-store';
import { useK8sStore } from '../../store/k8s-store';
import { LogViewer } from './LogViewer';
import { LogSourceProvider } from './log-source';
import { resultLines, type ResultLine } from './search-results';
import { formatLogTime } from './log-view';
import { summarise, determinantName, showOf, type Summary, type SummaryRow } from './determinants';
import { useDeterminantsFor } from './use-determinants';
import { openDeterminantSettings } from '../settings/determinant-nav';
import { compilePattern, matchPattern } from './logger-pattern';
import { readFields } from './field-readers';
import { useFieldReaders } from './follow-prefs';
import {
  density, densityRuns, failing, mixTone, brokeHere, mixVerdict, worstLabel, chipValue,
  narrowBy, narrowed, summaryText, rowLines, WINDOW_HALVES, type RunTone,
} from './window-summary';
import { snapshotSource, standIn, useSnapshotView } from './snapshot-source';
import { replicaHue, podTail } from './pod-hue';
import { ReadingPods } from './FollowView';
import { openWith } from '../ai/ai-chat-actions';
import {
  FOLLOW, CHECK, HOLE_FIELD, GOOD, AMBER, RED, GUTTER_CALM, GUTTER_WARN, tint,
} from './follow-tone';
import { LineButton, FillButton, PillButton, SegTrack, railLabel, headLabel, mono } from './follow-ui';

type Mode = '300' | '900' | 'custom';

/** `YYYY-MM-DDTHH:mm` on the reader's clock, for the custom range inputs. */
function localInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The hit, said short enough to sit in a chip. */
const shortSaid = (t: string) => (t.length > 40 ? `${t.slice(0, 40)}…` : t);

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** A mix value's colour, by `mixTone`. */
const MIX_COLOR = { ok: GOOD, warn: AMBER, bad: RED } as const;

/** A run's colour and height in the density strip. */
const RUN: Record<RunTone, { color: string; h: number }> = {
  none: { color: 'var(--color-surface-border)', h: 7 },
  calm: { color: GUTTER_CALM, h: 7 },
  warn: { color: GUTTER_WARN, h: 7 },
  error: { color: RED, h: 11 },
};

/** Forty minutes as a handful of runs — see `densityRuns`. */
function DensityStrip({ lines, from, to }: { lines: ResultLine[]; from: number; to: number }) {
  const runs = useMemo(() => densityRuns(density(lines, from, to, 80)), [lines, from, to]);
  const slice = (to - from) / 80;
  return (
    <div className="flex items-center flex-1 min-w-0" style={{ height: 16, gap: 1 }}
         role="img" aria-label={`${lines.length} lines between ${hhmm(from)} and ${hhmm(to)}`}>
      {runs.map(r => (
        <span key={r.from}
              title={`${formatLogTime(from + r.from * slice).slice(0, 8)} – ${formatLogTime(from + (r.from + r.span) * slice).slice(0, 8)} · ${r.lines.toLocaleString()} line${r.lines === 1 ? '' : 's'}`}
              style={{ flexGrow: r.span, flexBasis: 0, height: RUN[r.tone].h, borderRadius: 2, background: RUN[r.tone].color, opacity: r.tone === 'none' ? 0.4 : 1 }} />
      ))}
    </div>
  );
}

/** Each card's mark, in the order the board draws them: calls, downstreams, retries. */
const CARD_ICONS = [
  { Icon: ShorterLinesIcon, color: AMBER },
  { Icon: RoundTripIcon, color: HOLE_FIELD },
];

/** "endpoints" where the rows are paths, "groups" otherwise — the table's own noun. */
function rowNoun(groupBy: string[], n: number): string {
  const one = groupBy.some(g => /path|endpoint|url|uri|route/i.test(g)) ? 'endpoint' : 'group';
  return n === 1 ? one : `${one}s`;
}

function TableCard({ s, onRow }: { s: Summary; onRow: (r: SummaryRow) => void }) {
  const [onlyFailing, setOnlyFailing] = useState(false);
  const [all, setAll] = useState(false);
  const spec = s.pattern.summary!;
  const show = showOf(spec);
  const calls = s.rows.reduce((a, r) => a + r.count, 0);
  const rows = onlyFailing ? s.rows.filter(r => failing(r) > 0) : s.rows;
  const shown = all ? rows : rows.slice(0, 4);
  const cols = [
    ...spec.groupBy.map((_, i) => (spec.groupBy.length > 1 && i === 0 ? '74px' : 'minmax(0, 1fr)')),
    ...(show.count ? ['66px'] : []),
    ...(spec.mix ? ['132px'] : []),
    ...(spec.measure && show.worst ? ['78px'] : []),
    ...(show.seen ? ['96px'] : []),
  ].join(' ');
  const head: React.CSSProperties = { ...headLabel, padding: '6px 12px' };
  const cell = (bad: boolean): React.CSSProperties => ({
    padding: '7px 12px', borderTop: '1px solid var(--color-surface-border)', minWidth: 0,
    background: bad ? tint(RED, 6) : undefined, fontVariantNumeric: 'tabular-nums',
  });
  return (
    <div style={{ border: '1px solid var(--color-surface-border)', borderRadius: 9, background: 'var(--color-surface)', overflow: 'hidden' }}>
      <div className="flex items-center" style={{ gap: 9, padding: '9px 12px', borderBottom: '1px solid var(--color-surface-border)' }}>
        <PlusIcon size={13} color={FOLLOW} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{determinantName(s.pattern)}</span>
        <span className="truncate" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          {s.rows.length} {rowNoun(spec.groupBy, s.rows.length)} &middot; {calls.toLocaleString()} call{calls === 1 ? '' : 's'}
          {s.pattern.logger && <> &middot; from <span style={mono}>{s.pattern.logger}</span></>}
        </span>
        <div className="flex-1" />
        {spec.mix && s.rows.some(r => failing(r) > 0) && (
          <LineButton h={23} style={{ padding: '0 9px' }} tone={onlyFailing ? FOLLOW : undefined}
                      onClick={() => setOnlyFailing(v => !v)}>
            {onlyFailing ? 'Every row' : 'Only the failing ones'}
          </LineButton>
        )}
      </div>
      {rows.length ? (
        <div role="table" style={{ display: 'grid', gridTemplateColumns: cols, fontSize: 11.5 }}>
          {spec.groupBy.map(h => <div key={h} role="columnheader" style={head}>{h}</div>)}
          {show.count && <div role="columnheader" style={head}>calls</div>}
          {spec.mix && <div role="columnheader" style={head}>{spec.mix}</div>}
          {spec.measure && show.worst && <div role="columnheader" style={head}>slowest</div>}
          {show.seen && <div role="columnheader" style={head}>first seen</div>}
          {shown.map(r => {
            const bad = brokeHere(r);
            const c = cell(bad);
            return (
              <div key={r.key.join('\u0000')} role="row" onClick={() => onRow(r)} title="Open the lines this row was counted from"
                   className="cursor-pointer" style={{ display: 'contents' }}>
                {r.key.map((k, i) => (
                  <div key={i} className="truncate" title={k}
                       style={{ ...c, ...mono, color: i === 0 && spec.groupBy.length > 1 ? HOLE_FIELD : 'var(--color-text-primary)' }}>{k}</div>
                ))}
                {show.count && <div style={{ ...c, color: 'var(--color-text-primary)' }}>{r.count}</div>}
                {spec.mix && (
                  <div className="truncate" style={c}>
                    {(r.mix ?? []).map(([v, n], i) => (
                      <span key={v} style={{ color: MIX_COLOR[mixTone(v)] }}>{i > 0 && ' '}{n}&times;{v}</span>
                    ))}
                  </div>
                )}
                {spec.measure && show.worst && (
                  <div style={{ ...c, color: bad ? RED : 'var(--color-text-primary)' }}>{worstLabel(spec.measure, r.worst)}</div>
                )}
                {show.seen && (
                  <div style={{ ...c, color: 'var(--color-text-muted)' }}>{r.firstTs !== undefined ? formatLogTime(r.firstTs).slice(0, 8) : '—'}</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: '9px 12px', fontSize: 11.5, color: 'var(--color-text-muted)' }}>
          {onlyFailing ? 'Nothing failed in this window.' : 'Nothing in this window matched it.'}
        </div>
      )}
      <div className="flex items-center" style={{ gap: 10, padding: '7px 12px', borderTop: '1px solid var(--color-surface-border)', fontSize: 11, color: 'var(--color-text-muted)' }}>
        {rows.length > 4 && (
          <LineButton h={22} style={{ padding: '0 9px' }} onClick={() => setAll(a => !a)}>
            {all ? 'Show the first four' : `${rows.length - 4} more ${rowNoun(spec.groupBy, rows.length - 4)}`}
          </LineButton>
        )}
        <span>A row opens the lines it was counted from.</span>
      </div>
    </div>
  );
}

function ListCard({ s, index, onRow }: { s: Summary; index: number; onRow: (r: SummaryRow) => void }) {
  const { Icon, color } = CARD_ICONS[index % CARD_ICONS.length];
  const noun = s.pattern.summary!.groupBy[0];
  return (
    <div style={{ border: '1px solid var(--color-surface-border)', borderRadius: 9, background: 'var(--color-surface)', padding: '10px 12px' }}>
      <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
        <Icon size={12} color={color} />
        <span className="truncate" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>{determinantName(s.pattern)}</span>
        <div className="flex-1" />
        <span className="shrink-0" style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>
          {s.rows.length} {noun}{s.rows.length === 1 ? '' : 's'}
        </span>
      </div>
      {s.rows.length ? (
        <div className="flex flex-col" style={{ gap: 5, fontSize: 11.5 }}>
          {s.rows.slice(0, 8).map(r => {
            const verdict = mixVerdict(r) || (r.worst !== undefined ? `max ${worstLabel(s.pattern.summary!.measure, r.worst)}` : '');
            const bad = failing(r) > 0;
            return (
              <button key={r.key.join('\u0000')} type="button" onClick={() => onRow(r)}
                      title="Open the lines this row was counted from"
                      className="flex w-full text-left cursor-pointer border-none bg-transparent p-0 hover:underline"
                      style={{ gap: 8, font: 'inherit', color: 'var(--color-text-primary)' }}>
                <span className="flex-1 min-w-0 truncate" style={mono}>{r.key.join(' ')}</span>
                {verdict && <span style={{ color: bad ? RED : verdict === 'all fine' ? GOOD : 'var(--color-text-muted)' }}>{verdict}</span>}
                <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{r.count}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>Nothing in this window matched it.</div>
      )}
    </div>
  );
}

/** The tabs this window was reached through, as the board draws them above it. */
function Trail({ query, at, onClose }: { query?: string; at: number; onClose: () => void }) {
  const item: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 12px', fontSize: 11.5,
    borderBottom: '2px solid var(--color-surface-border)', color: 'var(--color-text-muted)',
    background: 'transparent', border: 'none', cursor: 'pointer',
  };
  return (
    <div className="flex items-center shrink-0"
         style={{ height: 32, padding: '0 10px', borderBottom: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
      <button type="button" onClick={() => useTabsStore.getState().openDk8sTab()}
              style={{ ...item, borderBottom: '2px solid var(--color-surface-border)' }}>
        Pods
      </button>
      {query && (
        <button type="button" onClick={() => useTabsStore.getState().openDk8sResultsTab(query)}
                style={{ ...item, borderBottom: '2px solid var(--color-surface-border)' }}>
          Search &middot; {query}
        </button>
      )}
      <span style={{
        ...item, cursor: 'default', borderBottom: `2px solid ${FOLLOW}`,
        color: 'var(--color-text-primary)', background: 'var(--color-panel)',
      }}>
        <ClockIcon size={11} color={FOLLOW} />
        Window &middot; {formatLogTime(at).slice(0, 8)}
        <button type="button" onClick={onClose} aria-label="Close this tab" title="Close this tab"
                className="inline-flex items-center justify-center cursor-pointer border-none bg-transparent p-0"
                style={{ width: 15, height: 15, borderRadius: 3, color: 'var(--color-text-muted)' }}>
          <CloseIcon size={8} strokeWidth={3} />
        </button>
      </span>
    </div>
  );
}

export function WindowTab({ tab }: { tab: RequestTab }) {
  const spec = tab.windowView!;
  const readers = useFieldReaders();
  const run = useTaggedSearchStore(s => s.run);
  const livePods = useK8sStore(s => s.pods);
  const drop = useTaggedSearchStore(s => s.drop);
  const logLineNumbers = useK8sStore(s => s.logLineNumbers);
  const exportLines = useK8sStore(s => s.exportLines);
  const view = useSnapshotView();

  const [mode, setMode] = useState<Mode>(spec.from !== undefined ? 'custom' : String(spec.half) === '900' ? '900' : '300');
  const [custom, setCustom] = useState(() => ({
    from: localInput(spec.from ?? spec.anchor.ts - spec.half * 1000),
    to: localInput(spec.to ?? spec.anchor.ts + spec.half * 1000),
  }));
  const [podsOn, setPodsOn] = useState<string[]>(() => spec.pods.map(p => p.pod));
  const [podMenu, setPodMenu] = useState(false);
  const podAnchor = useRef<HTMLSpanElement>(null);
  /* Ticked or not in THIS window, over what Settings has on — a window's choice, never saved back. */
  const [override, setOverride] = useState<Record<string, boolean>>({});
  const [chips, setChips] = useState<{ field: string; value: string }[]>([]);
  const [lineView, setLineView] = useState<{ title: string; lines?: ResultLine[] } | undefined>();
  const [query, setQuery] = useState('');

  const range = useMemo(() => {
    if (mode === 'custom') {
      const f = Date.parse(custom.from);
      const t = Date.parse(custom.to) + 59_999;
      if (Number.isFinite(f) && Number.isFinite(t) && f < t) return { from: f, to: t };
    }
    const half = mode === '900' ? 900 : 300;
    return { from: spec.anchor.ts - half * 1000, to: spec.anchor.ts + half * 1000 };
  }, [mode, custom, spec.anchor.ts]);

  const pods = useMemo(() => spec.pods.filter(p => podsOn.includes(p.pod)), [spec.pods, podsOn]);
  const podNames = useMemo(() => spec.pods.map(p => p.pod), [spec.pods]);

  /* One read per window and set of pods; the tag is this tab's, so a second Window tab reads on its own. */
  const runKey = `${range.from}|${range.to}|${pods.map(p => p.pod).join(',')}`;
  const [tag, setTag] = useState('');
  useEffect(() => {
    if (!pods.length) return;
    const next = `window:${tab.id}:${Date.now()}`;
    if (tag) drop(tag);
    setTag(next);
    run(next, pods.map(p => ({ context: p.context, namespace: p.namespace, pod: p.pod, containers: p.containers })), {
      query: '.', regex: true, everyLine: true, fromMs: range.from, toMs: range.to,
      maxMatchesPerPod: 40000, maxMatchesTotal: 120000,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);
  const tagNow = useRef(tag);
  tagNow.current = tag;
  useEffect(() => () => { if (tagNow.current) drop(tagNow.current); }, [drop]);

  const search = useTaggedSearchStore(s => (tag ? s.byTag[tag] : undefined));
  const all = useMemo(() => {
    const out = search ? resultLines(search.groups) : [];
    return out.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0) || a.seq - b.seq);
  }, [search]);

  /* The hit this window is anchored on, as read in the window — its fields are what the chips offer. */
  const anchorLine = useMemo(() => all.find(l => l.pod === spec.anchor.pod && l.text === spec.anchor.text), [all, spec.anchor]);
  const offered = useMemo(() => narrowBy(anchorLine ?? spec.anchor, l => readFields(l, readers)),
    [anchorLine, spec.anchor, readers]);

  const lines = useMemo(() => narrowed(all, chips, readers), [all, chips, readers]);

  /*
    The determinants that apply to the pod the hit came from — yours and your
    team's, scoped the way Settings scopes them — ticked as Settings has them.
  */
  const anchorPod = useMemo(() => {
    const sp = spec.pods.find(p => p.pod === spec.anchor.pod) ?? spec.pods[0];
    if (!sp) return undefined;
    return livePods.find(p => p.name === sp.pod && p.namespace === sp.namespace && (p.context ?? '') === sp.context)
      ?? { name: sp.pod, namespace: sp.namespace, context: sp.context };
  }, [spec.pods, spec.anchor.pod, livePods]);
  const { mine, team, enabled } = useDeterminantsFor(anchorPod);
  const determinants = useMemo(() => [...mine, ...team.map(t => t.pattern)], [mine, team]);
  const isOn = (id: string) => override[id] ?? enabled.some(p => p.id === id);
  const on = useMemo(() => determinants.filter(p => override[p.id] ?? enabled.some(e => e.id === p.id)),
    [determinants, enabled, override]);
  const summaries = useMemo(() => summarise(lines, on), [lines, on]);
  /* Every determinant's reach in this window, on or off — what the rail shows beside each. */
  const reach = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of summarise(lines, determinants)) out[s.pattern.id] = s.rows.reduce((a, r) => a + r.count, 0) + s.ungrouped;
    return out;
  }, [lines, determinants]);

  const minutes = Math.round((range.to - range.from) / 60000);
  const running = !!search?.running;

  const openRow = (s: Summary, r: SummaryRow) => {
    const compiled = compilePattern(s.pattern);
    const hits = rowLines(lines, l => matchPattern(compiled, l.message ?? l.text)?.fields, s.pattern.summary!.groupBy, r.key);
    setLineView({ title: `${determinantName(s.pattern)} · ${r.key.join(' ')}`, lines: hits });
  };

  const runSearch = () => {
    view.setFilter(query);
    setLineView({ title: query ? `lines with “${query}”` : 'every line' });
  };

  const exportSummary = () => {
    const text = summaryText(summaries, { from: range.from, to: range.to, lines: lines.length, pods: pods.map(p => p.pod) }, chips);
    exportLines(`window-${hhmm(spec.anchor.ts).replace(':', '')}`, pods[0]?.namespace ?? '', text.split('\n'));
  };

  const askAi = () => {
    const text = summaryText(summaries, { from: range.from, to: range.to, lines: lines.length, pods: pods.map(p => p.pod) }, chips);
    openWith(`${text}\n\nThe window is anchored on this line from ${spec.anchor.pod}:\n${spec.anchor.text}\n\nWhat was this service doing around it, and what looks wrong? `);
  };

  const shownLines = lineView?.lines ?? lines;
  const source = snapshotSource({
    lines: shownLines,
    view,
    detail: standIn(`window ${hhmm(range.from)}–${hhmm(range.to)}`, pods[0]?.namespace ?? '', pods[0]?.context ?? '', `window:${tab.id}`, 'Window'),
    logDetail: `${shownLines.length.toLocaleString()} lines between ${hhmm(range.from)} and ${hhmm(range.to)}`,
    requestedAt: search?.startedAt ?? 0,
    lineNumbers: logLineNumbers,
    onExport: () => exportLines(`window-${hhmm(spec.anchor.ts).replace(':', '')}`, pods[0]?.namespace ?? '',
      shownLines.map(l => `${l.ts !== undefined ? new Date(l.ts).toISOString() : ''} [${l.pod}] ${l.text}`)),
    onClose: () => setLineView(undefined),
    extra: {
      podColumn: spec.pods.length > 1,
      podColor: (pod: string) => replicaHue(pod, podNames),
      focusSeq: anchorLine && shownLines.includes(anchorLine) ? anchorLine.seq : undefined,
      focusLabel: 'the hit this window is around',
    },
  });

  const namespaces = [...new Set(spec.pods.map(p => p.namespace))].join(', ');
  /* The hit's pill takes its level's colour: an ERROR is red, a WARN amber. */
  const level = spec.anchor.level?.toLowerCase();
  const anchorTone = level === 'error' ? RED : level === 'warn' ? AMBER : FOLLOW;
  /* The rail's lit card: the determinant the first card above answers. */
  const lead = summaries[0]?.pattern.id;
  const tableCards = summaries.filter(s => s.pattern.summary!.groupBy.length > 1 || s.pattern.summary!.mix);
  const listCards = summaries.filter(s => !tableCards.includes(s));

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: 'var(--color-panel, var(--color-surface))' }}>
      <Trail query={spec.query} at={spec.anchor.ts} onClose={() => useTabsStore.getState().closeTab(tab.id)} />

      {/* ── The window ── */}
      <div className="flex items-center shrink-0 flex-wrap"
           style={{ gap: 8, minHeight: 46, padding: '0 14px', borderBottom: '1px solid var(--color-surface-border)' }}>
        <span className="inline-flex items-center truncate shrink-0"
              title={spec.anchor.text}
              style={{ gap: 7, height: 27, padding: '0 10px', borderRadius: 999, maxWidth: 420, fontSize: 11.5, background: tint(anchorTone, 14), color: anchorTone }}>
          anchored on {spec.anchor.level ? `${spec.anchor.level.toUpperCase()} · ` : ''}{shortSaid(spec.anchor.message ?? spec.anchor.text)} · {formatLogTime(spec.anchor.ts)}
        </span>
        <SegTrack<Mode | 'range'>
          h={23} well="var(--color-surface)"
          value={mode === 'custom' ? 'custom' : 'range'}
          onChange={v => { if (v !== 'range') setMode(v); }}
          options={[
            { value: String(WINDOW_HALVES[0]) as Mode, label: '±5m', title: 'Five minutes either side of the hit' },
            { value: String(WINDOW_HALVES[1]) as Mode, label: '±15m', title: 'Fifteen minutes either side of the hit' },
            { value: 'range', label: <>{hhmm(range.from)} &ndash; {hhmm(range.to)}</>, title: 'The range being read' },
            { value: 'custom', label: 'custom', title: 'Your own start and end' },
          ]}
        />
        {mode === 'custom' && (
          <span className="inline-flex items-center gap-1.5">
            <DateTimeInputView value={custom.from} onChange={v => setCustom(c => ({ ...c, from: v }))} size="sm" color={FOLLOW} />
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>to</span>
            <DateTimeInputView value={custom.to} onChange={v => setCustom(c => ({ ...c, to: v }))} size="sm" color={FOLLOW} />
          </span>
        )}
        <span ref={podAnchor} className="shrink-0">
          <LineButton h={26} fs={11.5} onClick={() => setPodMenu(m => !m)}>
            {pods.length} pod{pods.length === 1 ? '' : 's'} &middot; {namespaces}
          </LineButton>
          <PopoverView open={podMenu} onClose={() => setPodMenu(false)} anchorEl={podAnchor.current} placement="bottom" borderRadius={10}>
            <div className="flex flex-col gap-1.5 p-3" style={{ minWidth: 260 }}>
              {spec.pods.map(p => (
                <CheckboxView key={p.pod} label={p.pod} size="sm" accentColor={CHECK}
                              checked={podsOn.includes(p.pod)}
                              onChange={v => setPodsOn(prev => (v ? [...prev, p.pod] : prev.filter(x => x !== p.pod)))} />
              ))}
            </div>
          </PopoverView>
        </span>
        <div className="flex-1" />
        <input type="search" aria-label="Search inside this window" value={query} placeholder="Search this window"
               onChange={e => setQuery(e.target.value)}
               onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
               style={{
                 width: 300, height: 27, padding: '0 10px', borderRadius: 6, outline: 'none',
                 border: `1px solid ${FOLLOW}`, background: 'var(--color-surface)', color: 'var(--color-text-primary)',
                 ...mono, fontSize: 11.5,
               }} />
        <FillButton h={27} fs={11.5} style={{ padding: '0 11px' }} onClick={runSearch}>Search</FillButton>
      </div>

      {/* ── How busy it was ── */}
      <div className="flex items-center shrink-0"
           style={{ gap: 10, padding: '7px 14px', fontSize: 11, color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-surface-border)' }}>
        <span className="shrink-0">
          {minutes} minutes &middot; {running && !all.length ? 'reading…' : `${lines.length.toLocaleString()} lines`} &middot; read on this machine
          {search?.groups.some(g => g.result.error) && (
            <span style={{ color: AMBER }}
                  title={search.groups.filter(g => g.result.error).map(g => `${g.result.pod}: ${g.result.error}`).join(' · ')}>
              {' '}&middot; {search.groups.filter(g => g.result.error).map(g => podTail(g.result.pod)).join(', ')} could not be read
            </span>
          )}
          {search?.groups.some(g => g.result.capped) && (
            <span style={{ color: AMBER }} title="A pod wrote more than the window keeps — the counts are of what was kept">
              {' '}&middot; capped
            </span>
          )}
        </span>
        <DensityStrip lines={lines} from={range.from} to={range.to} />
        <span className="shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLogTime(spec.anchor.ts).slice(0, 8)}</span>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {running && !all.length ? (
            <ReadingPods title="Reading the window"
                         detail={<>Every line from {hhmm(range.from)} to {hhmm(range.to)} on {pods.map(p => podTail(p.pod)).join(', ')}</>}
                         done={search?.progress.done ?? 0} total={search?.progress.total ?? pods.length} />
          ) : lineView ? (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center shrink-0" style={{ gap: 8, padding: '6px 14px', borderBottom: '1px solid var(--color-surface-border)' }}>
                <LineButton h={24} onClick={() => { setLineView(undefined); view.setFilter(''); }}>&larr; What ran</LineButton>
                <span className="truncate" style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>{lineView.title}</span>
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                <LogSourceProvider value={source}>
                  <LogViewer />
                </LogSourceProvider>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto flex flex-col" style={{ padding: '12px 14px', gap: 10 }}>
              <div className="flex items-baseline" style={{ gap: 9 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>What ran in these {minutes} minutes</span>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>from the determinants that are on, not from a model</span>
              </div>
              {!determinants.length ? (
                <div style={{ padding: '12px 14px', borderRadius: 9, fontSize: 12, lineHeight: 1.6, border: '1px dashed var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                  No determinants yet. A determinant is a question you keep asking a log — which APIs, which downstreams, what
                  retried — written once as a logger&rsquo;s pattern and what to count. Add one and every window answers it.
                  <div className="mt-2">
                    <FillButton h={26} fs={11.5} onClick={() => openDeterminantSettings()}>Add determinants in Settings</FillButton>
                  </div>
                </div>
              ) : !summaries.length ? (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Every determinant is switched off for this window.</div>
              ) : (
                <>
                  {tableCards.map(s => <TableCard key={s.pattern.id} s={s} onRow={r => openRow(s, r)} />)}
                  {listCards.length > 0 && (
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                      {listCards.map((s, i) => <ListCard key={s.pattern.id} s={s} index={i} onRow={r => openRow(s, r)} />)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── What is counted, and what narrows it ── */}
        <div className="flex flex-col min-h-0 shrink-0"
             style={{ width: 306, borderLeft: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
          <div className="flex-1 min-h-0 overflow-auto">
            <div style={{ padding: '12px 14px 8px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>Determinants in this window</div>
              <div style={{ fontSize: 11, marginTop: 3, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
                Each one is a logger and a pattern you saved. Off is off &mdash; the summary above only ever holds what is ticked here.
              </div>
            </div>
            <div className="flex flex-col" style={{ padding: '0 10px', gap: 5 }}>
              {determinants.map(p => {
                const ticked = isOn(p.id);
                const lit = ticked && p.id === lead;
                const set = (v: boolean) => setOverride(prev => ({ ...prev, [p.id]: v }));
                return (
                  <div key={p.id} role="presentation" onClick={() => set(!ticked)}
                       className="flex items-center cursor-pointer"
                       style={{
                         gap: 9, padding: '8px 10px', borderRadius: 7,
                         border: `1px solid ${lit ? FOLLOW : 'var(--color-surface-border)'}`,
                         background: lit ? tint(FOLLOW, 8) : 'transparent',
                       }}>
                    <CheckboxView checked={ticked} size="sm" accentColor={CHECK}
                                  aria-label={`Count ${determinantName(p)} in this window`}
                                  onChange={set} />
                    <span className="flex-1 min-w-0 truncate"
                          style={{ fontSize: 11.5, color: ticked ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}
                          title={p.logger ? `${determinantName(p)} · ${p.logger}` : determinantName(p)}>
                      {determinantName(p)}
                      {p.logger && <span style={{ color: 'var(--color-text-muted)' }}> {p.logger.split('.').pop()}</span>}
                    </span>
                    <span className="shrink-0" style={{ fontSize: 10.5, fontVariantNumeric: 'tabular-nums', color: lit ? GOOD : 'var(--color-text-muted)' }}>
                      {ticked ? (reach[p.id] ?? 0).toLocaleString() : 'off'}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '10px 14px' }}>
              <LineButton h={27} fs={11.5} style={{ width: '100%' }} onClick={() => openDeterminantSettings()}>
                Edit determinants in Settings
              </LineButton>
            </div>

            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--color-surface-border)' }}>
              <div style={{ ...railLabel, marginBottom: 7 }}>narrow this window by</div>
              <div className="flex flex-wrap" style={{ gap: 5 }}>
                {offered.map(c => {
                  const chipOn = chips.some(x => x.field === c.field && x.value === c.value);
                  return (
                    <PillButton key={`${c.field}=${c.value}`} on={chipOn} title={`${c.field} = ${c.value}`}
                                onClick={() => setChips(prev => (chipOn ? prev.filter(x => !(x.field === c.field && x.value === c.value)) : [...prev, c]))}>
                      {c.field} &middot; {chipValue(c.field, c.value)}
                    </PillButton>
                  );
                })}
                {!offered.length && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>The hit names nothing to narrow by.</span>}
              </div>
              <div style={{ fontSize: 11, marginTop: 8, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
                The summary re-counts against whatever is left, so &quot;which APIs did this one request touch&quot; is the same
                screen with one chip on.
              </div>
            </div>
          </div>

          <div className="flex items-center shrink-0" style={{ gap: 6, padding: '10px 14px', borderTop: '1px solid var(--color-surface-border)' }}>
            <LineButton h={26} fs={11.5} style={{ flexGrow: 1, flexBasis: 0, minWidth: 0 }} disabled={!summaries.length} onClick={exportSummary}>
              Export summary
            </LineButton>
            <LineButton h={26} fs={11.5} style={{ flexGrow: 1, flexBasis: 0, minWidth: 0 }} disabled={!lines.length} onClick={askAi}>
              Ask the AI tab
            </LineButton>
          </div>
        </div>
      </div>
    </div>
  );
}
