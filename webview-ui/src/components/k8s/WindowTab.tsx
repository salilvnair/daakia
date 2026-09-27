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
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ButtonView, CheckboxView, SegmentedControlView, DateTimeInputView, PopoverView, SearchInputView, IconSize,
} from '@salilvnair/dui';
import {
  ChevronLeftIcon, ChevronRightIcon, SettingsIcon, DownloadIcon, SparkleIcon, NetworkIcon, ClockIcon, SearchIcon,
} from '../../icons';
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
  density, failing, mixLabel, mixVerdict, narrowBy, narrowed, summaryText, rowLines, WINDOW_HALVES,
} from './window-summary';
import { snapshotSource, standIn, useSnapshotView } from './snapshot-source';
import { replicaHue, podTail } from './pod-hue';
import { ReadingPods } from './FollowView';
import { openWith } from '../ai/ai-chat-actions';
import { ACCENT, AI as AI_ACCENT } from './tone';

const label: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--color-text-muted)',
};

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

function DensityStrip({ lines, from, to, anchor }: { lines: ResultLine[]; from: number; to: number; anchor: number }) {
  const buckets = useMemo(() => density(lines, from, to, 80), [lines, from, to]);
  const max = Math.max(1, ...buckets.map(b => b.n));
  const W = 800;
  const H = 34;
  const bw = W / buckets.length;
  const ax = ((anchor - from) / Math.max(1, to - from)) * W;
  const pct = Math.min(100, Math.max(0, (ax / W) * 100));
  return (
    <div className="flex flex-col gap-0.5">
      {/* Stretched to the width it is given, so no text inside it: text would stretch with it. */}
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
           aria-label={`${lines.length} lines between ${hhmm(from)} and ${hhmm(to)}`} style={{ display: 'block' }}>
        {buckets.map((b, i) => {
          const h = b.n ? Math.max(2, (b.n / max) * H) : 0;
          const eh = b.errors ? Math.max(2, (b.errors / max) * H) : 0;
          return (
            <g key={i}>
              <rect x={i * bw + 0.5} y={H - h} width={Math.max(1, bw - 1)} height={h}
                    fill={`color-mix(in srgb, ${ACCENT} 45%, transparent)`} />
              {eh > 0 && <rect x={i * bw + 0.5} y={H - eh} width={Math.max(1, bw - 1)} height={eh} fill="var(--color-error)" />}
            </g>
          );
        })}
        <line x1={ax} x2={ax} y1={0} y2={H} stroke="var(--color-text-primary)" strokeWidth={1.5} strokeDasharray="3 2"
              vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="relative text-[10px]" style={{ height: 13, fontVariantNumeric: 'tabular-nums' }}>
        <span className="absolute left-0" style={{ color: 'var(--color-text-muted)' }}>{hhmm(from)}</span>
        <span className="absolute" style={{ left: `${pct}%`, transform: 'translateX(-50%)', color: 'var(--color-text-secondary)' }}>
          {formatLogTime(anchor).slice(0, 8)}
        </span>
        <span className="absolute right-0" style={{ color: 'var(--color-text-muted)' }}>{hhmm(to)}</span>
      </div>
    </div>
  );
}

function TableCard({ s, onRow }: { s: Summary; onRow: (r: SummaryRow) => void }) {
  const [onlyFailing, setOnlyFailing] = useState(false);
  const [all, setAll] = useState(false);
  const spec = s.pattern.summary!;
  const show = showOf(spec);
  const calls = s.rows.reduce((a, r) => a + r.count, 0);
  const rows = onlyFailing ? s.rows.filter(r => failing(r) > 0) : s.rows;
  const shown = all ? rows : rows.slice(0, 4);
  const cell: React.CSSProperties = { padding: '6px 8px', fontSize: 11.5, borderTop: '1px solid var(--color-surface-border)', textAlign: 'left' };
  const head: React.CSSProperties = { ...label, padding: '6px 8px', textAlign: 'left', fontSize: 9.5 };
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-surface-border)', background: 'var(--color-panel, var(--color-surface))' }}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex flex-col min-w-0">
          <span className="text-[12.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{determinantName(s.pattern)}</span>
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {s.rows.length} {s.rows.length === 1 ? 'row' : 'rows'} · {calls.toLocaleString()} line{calls === 1 ? '' : 's'}
            {s.pattern.logger ? ` · from ${s.pattern.logger}` : ''}
          </span>
        </div>
        <div className="flex-1" />
        {spec.mix && s.rows.some(r => failing(r) > 0) && (
          <CheckboxView label="Only the failing ones" checked={onlyFailing} onChange={setOnlyFailing} size="sm" accentColor={ACCENT} />
        )}
      </div>
      {rows.length ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            <tr>
              {spec.groupBy.map(h => <th key={h} style={head}>{h}</th>)}
              {show.count && <th style={head}>calls</th>}
              {spec.mix && <th style={head}>{spec.mix}</th>}
              {spec.measure && show.worst && <th style={head}>max {spec.measure}</th>}
              {show.seen && <th style={head}>first seen</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map(r => {
              const bad = failing(r);
              return (
                <tr key={r.key.join('\u0000')} onClick={() => onRow(r)} className="cursor-pointer hover:bg-[var(--color-surface-hover)]"
                    title="Open the lines this row was counted from">
                  {r.key.map((k, i) => (
                    <td key={i} style={{ ...cell, fontFamily: 'var(--font-mono, monospace)', color: i === 0 ? ACCENT : 'var(--color-text-primary)' }}>{k}</td>
                  ))}
                  {show.count && <td style={{ ...cell, color: 'var(--color-text-primary)' }}>{r.count}</td>}
                  {spec.mix && (
                    <td style={{ ...cell, color: bad ? 'var(--color-error)' : 'var(--color-success)' }}>{mixLabel(r)}</td>
                  )}
                  {spec.measure && show.worst && <td style={{ ...cell, color: 'var(--color-text-secondary)' }}>{r.worst ?? '—'}</td>}
                  {show.seen && <td style={{ ...cell, color: 'var(--color-text-muted)' }}>{r.firstTs !== undefined ? formatLogTime(r.firstTs).slice(0, 8) : '—'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="px-3 pb-3 text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {onlyFailing ? 'Nothing failed in this window.' : 'Nothing in this window matched it.'}
        </div>
      )}
      {rows.length > 4 && (
        <button type="button" onClick={() => setAll(a => !a)}
                className="w-full px-3 py-1.5 text-[11px] cursor-pointer border-none bg-transparent text-left"
                style={{ color: ACCENT, borderTop: '1px solid var(--color-surface-border)' }}>
          {all ? 'Show the first four' : `${rows.length - 4} more`}
        </button>
      )}
    </div>
  );
}

function ListCard({ s, onRow }: { s: Summary; onRow: (r: SummaryRow) => void }) {
  return (
    <div className="rounded-lg" style={{ border: '1px solid var(--color-surface-border)', background: 'var(--color-panel, var(--color-surface))' }}>
      <div className="flex flex-col px-3 py-2.5">
        <span className="text-[12.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{determinantName(s.pattern)}</span>
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {s.rows.length} {s.pattern.summary!.groupBy[0]}{s.rows.length === 1 ? '' : 's'}
        </span>
      </div>
      {s.rows.length ? s.rows.slice(0, 8).map(r => {
        const verdict = mixVerdict(r) || (r.worst !== undefined ? `max ${r.worst}` : '');
        const bad = failing(r) > 0;
        return (
          <button key={r.key.join('\u0000')} type="button" onClick={() => onRow(r)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left cursor-pointer border-none bg-transparent hover:bg-[var(--color-surface-hover)]"
                  style={{ borderTop: '1px solid var(--color-surface-border)' }}>
            <span className="font-mono text-[11.5px] flex-1 truncate" style={{ color: 'var(--color-text-primary)' }}>{r.key.join(' ')}</span>
            <span className="text-[11px]" style={{ color: bad ? 'var(--color-error)' : 'var(--color-text-muted)' }}>{verdict}</span>
            <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{r.count}</span>
          </button>
        );
      }) : (
        <div className="px-3 pb-3 text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>Nothing in this window matched it.</div>
      )}
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
  const openDk8sTab = useTabsStore(s => s.openDk8sTab);
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

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: 'var(--color-bg, var(--color-surface))' }}>
      {/* ── Where this came from ── */}
      <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-1 text-[11.5px] shrink-0" style={{ color: 'var(--color-text-muted)' }}>
        <button type="button" onClick={openDk8sTab} className="cursor-pointer border-none bg-transparent p-0" style={{ color: 'var(--color-text-secondary)' }}>Pods</button>
        <ChevronRightIcon size={IconSize.chip} />
        {spec.query && (
          <>
            <button type="button" onClick={() => useTabsStore.getState().openDk8sResultsTab(spec.query!)}
                    className="cursor-pointer border-none bg-transparent p-0" style={{ color: 'var(--color-text-secondary)' }}>
              Search · {spec.query}
            </button>
            <ChevronRightIcon size={IconSize.chip} />
          </>
        )}
        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Window · {formatLogTime(spec.anchor.ts).slice(0, 8)}</span>
      </div>

      {/* ── The window ── */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap" style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <span className="inline-flex items-center gap-1.5 px-2.5 rounded-md text-[11.5px] truncate"
              title={spec.anchor.text}
              style={{ height: 28, maxWidth: 420, background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`, color: ACCENT }}>
          <ClockIcon size={IconSize.chip} />
          anchored on {spec.anchor.level ? `${spec.anchor.level.toUpperCase()} · ` : ''}{shortSaid(spec.anchor.message ?? spec.anchor.text)} · {formatLogTime(spec.anchor.ts)}
        </span>
        <SegmentedControlView
          size="md" variant="rounded" borderRadius="sm" style={{ borderRadius: 4 }} accentColor={ACCENT}
          value={mode}
          onChange={v => setMode(v as Mode)}
          options={[
            { value: String(WINDOW_HALVES[0]), label: '±5m' },
            { value: String(WINDOW_HALVES[1]), label: '±15m' },
            { value: 'custom', label: 'custom' },
          ]}
        />
        {mode === 'custom' ? (
          <span className="inline-flex items-center gap-1.5">
            <DateTimeInputView value={custom.from} onChange={v => setCustom(c => ({ ...c, from: v }))} size="md" color={ACCENT} />
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>to</span>
            <DateTimeInputView value={custom.to} onChange={v => setCustom(c => ({ ...c, to: v }))} size="md" color={ACCENT} />
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 rounded-md text-[11.5px]"
                style={{ height: 28, border: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
            {hhmm(range.from)} – {hhmm(range.to)}
          </span>
        )}
        <span ref={podAnchor}>
          <ButtonView size="md" variant="secondary" accentColor={ACCENT} color={ACCENT}
                      iconLeft={<NetworkIcon size={IconSize.action} />} onClick={() => setPodMenu(m => !m)}>
            {pods.length} pod{pods.length === 1 ? '' : 's'} · {namespaces}
          </ButtonView>
          <PopoverView open={podMenu} onClose={() => setPodMenu(false)} anchorEl={podAnchor.current} placement="bottom" borderRadius={10}>
            <div className="flex flex-col gap-1.5 p-3" style={{ minWidth: 260 }}>
              {spec.pods.map(p => (
                <CheckboxView key={p.pod} label={p.pod} size="sm" accentColor={ACCENT}
                              checked={podsOn.includes(p.pod)}
                              onChange={v => setPodsOn(prev => (v ? [...prev, p.pod] : prev.filter(x => x !== p.pod)))} />
              ))}
            </div>
          </PopoverView>
        </span>
        <div className="flex-1" />
        <SearchInputView value={query} onChange={setQuery} placeholder="Search this window" size="md"
                         onKeyDown={e => { if (e.key === 'Enter') runSearch(); }} style={{ width: 220 }} />
        <ButtonView size="md" variant="secondary" accentColor={ACCENT} color={ACCENT} iconLeft={<SearchIcon size={IconSize.action} />}
                    onClick={runSearch}>
          Search
        </ButtonView>
      </div>

      {/* ── How busy it was ── */}
      <div className="px-4 pt-2 pb-1.5 shrink-0" style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <div className="flex items-center gap-2 text-[11px] mb-1" style={{ color: 'var(--color-text-muted)' }}>
          <span>{minutes} minutes · {running && !all.length ? 'reading…' : `${lines.length.toLocaleString()} lines`} · read on this machine</span>
          {search?.groups.some(g => g.result.error) && (
            <span style={{ color: 'var(--color-warning)' }}
                  title={search.groups.filter(g => g.result.error).map(g => `${g.result.pod}: ${g.result.error}`).join(' · ')}>
              · {search.groups.filter(g => g.result.error).map(g => podTail(g.result.pod)).join(', ')} could not be read
            </span>
          )}
          {search?.groups.some(g => g.result.capped) && (
            <span style={{ color: 'var(--color-warning)' }}>· a pod wrote more than the window keeps — the counts are of what was kept</span>
          )}
        </div>
        <DensityStrip lines={lines} from={range.from} to={range.to} anchor={spec.anchor.ts} />
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {running && !all.length ? (
            <ReadingPods title="Reading the window"
                         detail={<>Every line from {hhmm(range.from)} to {hhmm(range.to)} on {pods.map(p => podTail(p.pod)).join(', ')}</>}
                         done={search?.progress.done ?? 0} total={search?.progress.total ?? pods.length} />
          ) : lineView ? (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center gap-2 px-4 py-1.5 shrink-0" style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                <ButtonView size="sm" variant="secondary" accentColor={ACCENT} iconLeft={<ChevronLeftIcon size={IconSize.action} />}
                            onClick={() => { setLineView(undefined); view.setFilter(''); }}>
                  What ran
                </ButtonView>
                <span className="text-[11.5px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{lineView.title}</span>
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                <LogSourceProvider value={source}>
                  <LogViewer />
                </LogSourceProvider>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto px-4 py-3 flex flex-col gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[14px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>What ran in these {minutes} minutes</span>
                <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>from the determinants that are on, not from a model</span>
              </div>
              {!determinants.length ? (
                <div className="rounded-lg px-4 py-4 text-[12px]" style={{ border: '1px dashed var(--color-surface-border)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  No determinants yet. A determinant is a question you keep asking a log — which APIs, which downstreams, what
                  retried — written once as a logger&rsquo;s pattern and what to count. Add one and every window answers it.
                  <div className="mt-2">
                    <ButtonView size="sm" variant="secondary" accentColor={ACCENT} color={ACCENT}
                                onClick={() => openDeterminantSettings()}>
                      Add determinants in Settings
                    </ButtonView>
                  </div>
                </div>
              ) : !summaries.length ? (
                <div className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>Every determinant is switched off for this window.</div>
              ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
                  {summaries.map(s => (s.pattern.summary!.groupBy.length > 1 || s.pattern.summary!.mix
                    ? <div key={s.pattern.id} style={{ gridColumn: '1 / -1' }}><TableCard s={s} onRow={r => openRow(s, r)} /></div>
                    : <ListCard key={s.pattern.id} s={s} onRow={r => openRow(s, r)} />))}
                </div>
              )}
              {summaries.length > 0 && (
                <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>A row opens the lines it was counted from.</div>
              )}
            </div>
          )}
        </div>

        {/* ── What is counted, and what narrows it ── */}
        <div className="flex flex-col min-h-0 shrink-0"
             style={{ width: 300, borderLeft: '1px solid var(--color-surface-border)', background: 'var(--color-panel, var(--color-surface))' }}>
          <div className="flex-1 min-h-0 overflow-auto">
            <div className="px-3.5 pt-3 text-[12.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Determinants in this window</div>
            <div className="px-3.5 pt-1 pb-2.5 text-[11px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
              Each one is a logger and a pattern you saved. Off is off — the summary only ever holds what is ticked here.
            </div>
            <div className="flex flex-col gap-1 px-2.5">
              {determinants.map(p => {
                const ticked = isOn(p.id);
                return (
                  <div key={p.id} className="flex items-center gap-2 px-1.5 py-1.5 rounded-md">
                    <CheckboxView checked={ticked} size="sm" accentColor={ACCENT}
                                  aria-label={`Count ${determinantName(p)} in this window`}
                                  onChange={v => setOverride(prev => ({ ...prev, [p.id]: v }))} />
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-[11.5px] truncate" style={{ color: ticked ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{determinantName(p)}</span>
                      {p.logger && <span className="text-[10px] font-mono truncate" style={{ color: 'var(--color-text-muted)' }}>{p.logger}</span>}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {ticked ? (reach[p.id] ?? 0).toLocaleString() : 'off'}
                    </span>
                  </div>
                );
              })}
              <div className="px-1.5 pt-1 pb-3">
                <ButtonView size="xs" variant="secondary" accentColor={ACCENT} iconLeft={<SettingsIcon size={IconSize.chip} />}
                            onClick={() => openDeterminantSettings()}>
                  Edit determinants in Settings
                </ButtonView>
              </div>
            </div>

            <div className="px-3.5 py-3" style={{ borderTop: '1px solid var(--color-surface-border)' }}>
              <div className="mb-2" style={label}>narrow this window by</div>
              <div className="flex flex-wrap gap-1.5">
                {offered.map(c => {
                  const isOn = chips.some(x => x.field === c.field && x.value === c.value);
                  return (
                    <button key={`${c.field}=${c.value}`} type="button"
                            onClick={() => setChips(prev => (isOn ? prev.filter(x => !(x.field === c.field && x.value === c.value)) : [...prev, c]))}
                            className="inline-flex items-center gap-1 px-2 rounded-full cursor-pointer text-[11px]"
                            style={{
                              height: 22,
                              border: `1px solid ${isOn ? ACCENT : 'var(--color-surface-border)'}`,
                              background: isOn ? `color-mix(in srgb, ${ACCENT} 16%, transparent)` : 'transparent',
                              color: isOn ? ACCENT : 'var(--color-text-secondary)',
                            }}>
                      {c.field} · <span className="font-mono">{c.field === 'pod' ? podTail(c.value) : c.value.length > 18 ? `${c.value.slice(0, 18)}…` : c.value}</span>
                    </button>
                  );
                })}
                {!offered.length && <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>The hit names nothing to narrow by.</span>}
              </div>
              <div className="text-[11px] mt-2" style={{ color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
                The summary re-counts against whatever is left, so &ldquo;which APIs did this one request touch&rdquo; is the same
                screen with one chip on.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3.5 py-2.5 shrink-0" style={{ borderTop: '1px solid var(--color-surface-border)' }}>
            <span className="flex-1 min-w-0"><ButtonView size="sm" variant="secondary" accentColor={ACCENT} width="fullWidth" disabled={!summaries.length}
                        iconLeft={<DownloadIcon size={IconSize.action} />} onClick={exportSummary}>
              Export summary
            </ButtonView></span>
            <span className="flex-1 min-w-0"><ButtonView size="sm" variant="secondary" accentColor={AI_ACCENT} color={AI_ACCENT} width="fullWidth" disabled={!lines.length}
                        iconLeft={<SparkleIcon size={IconSize.action} />} onClick={askAi}>
              Ask the AI tab
            </ButtonView></span>
          </div>
        </div>
      </div>
    </div>
  );
}
