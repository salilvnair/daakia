/**
 * The catalogue, as a tab on the pod.
 *
 * It answers what a tester cannot know from the log: which loggers exist,
 * what each can say, and which have never fired on this pod. The log shows
 * what HAS been said; this shows what CAN be, laid over what was — every
 * logger somebody declared or the buffer named, how many lines it wrote in
 * the window, and under it the message patterns it has, each with its own
 * count.
 *
 * ── The zero is the point ──
 *
 * "Declared, never fired in this window" is the most informative row on the
 * screen: either the path it watches was not taken on this pod, or the
 * pattern is wrong — and the reader can tell which by opening it. "Never
 * fired here" filters to exactly those, and the footer counts them.
 *
 * ── Where things are added ──
 *
 * Loggers from Add loggers (a project folder, the pod, a pasted list, one by
 * one); patterns from Add patterns (a paste of calls, a scan of the
 * repository, the log itself, or by hand). Both open over this tab and write
 * to the same catalogue, kept per workload so a rollout does not lose it.
 *
 * ── Drawn to the board ──
 *
 * Every measure here is the Loggers board's: a 46px toolbar of 28px controls,
 * a 210px rail on the card colour, the six columns at 330 · 74 · 92 · 110 ·
 * rest · 96, rows at 9px, a LEVEL pill on its own 16% fill, and the opened
 * row's patterns indented to 40px under a purple wash. What the board does
 * not draw — marking one pattern, summarising it, taking it out — is still
 * here, but on the pattern's row only while the pointer is on it, so the
 * table at rest is the picture.
 */
import { useEffect, useMemo, useState } from 'react';
import { SearchInputView } from '@salilvnair/dui';
import { useK8sStore } from '../../store/k8s-store';
import {
  useCatalogue, usePatternsFor, useLoggersFor, removePattern, removeLogger, toggleMark, setMarks,
  projectFor, addLoggers, addPatterns, rememberProject, MARK_COLORS, type CataloguePattern,
} from '../../store/dk8s-logger-store';
import { templateParts } from './logger-pattern';
import { markOf } from './logger-marks';
import {
  buildRows, filterRows, sortRows, packageCounts, sourceCounts, linesInWindow, isSilent, isOffAtLevel,
  isDeclared, ago, exportCatalogue, shortName, SOURCE_LABEL, SOURCE_COLOR, LEVEL_COLOR, WINDOW_LABEL,
  WINDOW_SHORT, WINDOW_MS, type CatalogueRow, type CatalogueWindow, type RowSource, type SourceFilter,
  type PatternStat,
} from './logger-catalogue';
import { projectCandidates, patternsForLoggers, type ProjectReadMsg } from './add-loggers';
import {
  PlusIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon, ClockIcon, FilterIcon, EyeIcon, EyeOffIcon,
  MarkFlagIcon, ChartBarIcon, ExportIcon,
} from '../../icons';
import { useSurfaceMenu, copyItem, SEP, textInputAt, type ContextMenuItem } from './surface-menu';
import { LOGGERS } from './tone';
import { CARD, DIVIDER, EDGE, TEXT, LABEL, QUIET, AMBER, tint } from './loggers-tone';
import { BoardButton, LevelPill, Picker, Tick, HEAD_TYPE } from './loggers-parts';
import { postMsg } from '../../vscode';
import { logUiEvent } from '../../store/ui-audit-store';
import { AddLoggersModal } from './AddLoggersModal';
import { AddPatternsModal } from './AddPatternsModal';
import { SummaryBuilder } from './SummaryBuilder';
import { PatternTemplate as Template } from './PatternTemplate';
import { useLiveLevels, LiveLevelsBar, LiveLevelCell, type Live } from './LiveLevels';

/** The workload a pattern belongs to — never the pod, which a rollout renames. */
export function scopeOf(pod: {
  namespace: string; context?: string; workload?: { kind: string; name: string };
} | undefined): string {
  if (!pod) return '*';
  const where = `${pod.context ?? ''}/${pod.namespace}`;
  return pod.workload ? `${where}/${pod.workload.kind}/${pod.workload.name}` : `${where}/Pod`;
}

/** The table's columns, from the board: 330 · 74 · 92 · 110 · the rest · 96. */
const GRID = 'minmax(200px, 330px) 74px 92px 110px minmax(0, 1fr) 96px';
/* A live level is a picker, wider than the pill it replaces. */
const GRID_LIVE = 'minmax(200px, 330px) 112px 92px 110px minmax(0, 1fr) 96px';
/** An opened row's patterns: the message, then 88 · 96 · 120. */
const PATTERN_GRID = 'minmax(0, 1fr) 88px 96px 120px';

/** Source filter's menu, and what its face says for each. */
const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: 'any', label: 'any' },
  { value: 'declared', label: 'declared' },
  { value: 'seen', label: 'seen in logs' },
  { value: 'code', label: 'source code' },
  { value: 'hand', label: 'added by hand' },
];

export function LoggersTab() {
  const detail = useK8sStore(s => s.detail);
  const logs = useK8sStore(s => s.logs);
  const scope = scopeOf(detail);
  const catalogue = useCatalogue();
  const patterns = usePatternsFor(scope);
  const stored = useLoggersFor(scope);

  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('any');
  const [source, setSource] = useState<SourceFilter>('any');
  const [neverFired, setNeverFired] = useState(false);
  const [win, setWin] = useState<CatalogueWindow>('2h');
  const [pkg, setPkg] = useState<string | undefined>();
  const [from, setFrom] = useState<RowSource | undefined>();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [adding, setAdding] = useState<'loggers' | 'patterns' | undefined>();
  const [into, setInto] = useState<string | undefined>();
  const levelsLive = useLiveLevels(detail ? { name: detail.name, namespace: detail.namespace, context: detail.context } : undefined);
  const live = levelsLive.live;
  const grid = live ? GRID_LIVE : GRID;

  /* "2s ago" has to keep being true. A tick every fifteen seconds is often
     enough for a column read in minutes, and cheap enough to leave running. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const windowLines = useMemo(() => linesInWindow(logs, win, now), [logs, win, now]);
  const rows = useMemo(
    () => buildRows(stored, patterns, logs, windowLines),
    [stored, patterns, logs, windowLines],
  );
  const shown = useMemo(
    () => sortRows(filterRows(rows, { query, level, source, neverFired, pkg, from })),
    [rows, query, level, source, neverFired, pkg, from],
  );

  const named = rows.filter(r => r.key);
  const fired = named.filter(r => r.events > 0).length;
  const silent = named.filter(isSilent).length;
  const packages = useMemo(() => packageCounts(rows), [rows]);
  const sources = useMemo(() => sourceCounts(rows), [rows]);
  const levels = useMemo(() => [...new Set(named.map(r => r.level ?? 'none'))].sort(), [named]);

  /*
    Does the buffer reach back as far as the window? A tail of 200 lines on a
    busy pod is thirty seconds, and "0 in the last 2 hours" read off thirty
    seconds is a false zero. The footer says where the buffer starts and
    offers to read the whole window.
  */
  const oldest = logs.find(l => l.ts !== undefined)?.ts;
  const span = WINDOW_MS[win];
  const short = span !== undefined && oldest !== undefined && oldest > now - span + 60_000;

  /*
    "Rescan when the project changes", checked when the tab opens.

    The folder and the choices it was read with are remembered with the
    catalogue; the host walks it again and answers `unchanged` when nothing
    in it moved, so an untouched project costs one walk and no write.
  */
  const link = projectFor(catalogue, scope);
  useEffect(() => {
    if (!link?.rescan) return;
    const reqId = `rescan-${Date.now()}`;
    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type !== 'dk8s:projectRead' || msg.reqId !== reqId) return;
      window.removeEventListener('message', onMessage);
      if (msg.error || msg.cancelled || msg.unchanged) return;
      const read = msg as ProjectReadMsg;
      const existing = new Set(stored.map(l => l.name));
      const fresh = projectCandidates(read, link.profile, existing)
        .filter(c => !c.existing && (!link.skipLibrary || !c.library));
      if (fresh.length) {
        addLoggers(fresh.map(c => ({ name: c.name, level: c.level, source: c.source, origin: c.from })), scope);
        if (link.patterns) addPatterns(patternsForLoggers(read.hits, new Set(fresh.map(c => c.name))), scope);
      }
      rememberProject({ ...link, fingerprint: read.fingerprint });
      logUiEvent('dk8s.loggers_rescan', { added: fresh.length });
    };
    window.addEventListener('message', onMessage);
    postMsg({ type: 'dk8s:readProject', reqId, folder: link.folder, fingerprint: link.fingerprint });
    return () => window.removeEventListener('message', onMessage);
    // Once per tab and project: a rescan on every catalogue write would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, link?.folder]);

  const toggleOpen = (key: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const readWindow = () => {
    const s = useK8sStore.getState();
    s.setLogDirection('last');
    s.setLogSince(win === '15m' || win === '1h' || win === '2h' || win === '6h' ? win : 'all');
    s.setLogTail(Math.max(s.logTail, 20_000));
    s.fetchLogs();
  };

  const exportIt = () => {
    const name = detail?.workload?.name ?? detail?.name ?? 'catalogue';
    postMsg({
      type: 'dk8s:exportCatalogue',
      filename: `${name}-loggers.json`,
      content: exportCatalogue(rows, scope, win),
    });
    logUiEvent('dk8s.catalogue_export', { loggers: named.length, patterns: patterns.length });
  };

  /* Right-click: a row answers with its own menu; the rest of the tab offers
     what the toolbar and footer do, and a text box or selection its editing. */
  const menu = useSurfaceMenu((target, selection) => {
    if (textInputAt(target) || selection.trim()) return [];
    return [
      { id: 'add-loggers', label: 'Add loggers…', icon: <PlusIcon size={14} />, iconColor: LOGGERS, onClick: () => setAdding('loggers') },
      { id: 'add-patterns', label: 'Add patterns…', icon: <PlusIcon size={14} />, iconColor: LOGGERS, onClick: () => { setInto(undefined); setAdding('patterns'); } },
      SEP('root-sep'),
      { id: 'export', label: 'Export catalogue', disabled: !rows.length, icon: <ExportIcon size={14} />, iconColor: 'var(--color-info)', onClick: exportIt },
    ];
  });

  return (
    <div className="flex flex-col h-full min-h-0" data-context-menu="loggers" onContextMenu={menu.onContextMenu}>
      {menu.element}
      {levelsLive.confirm}
      {/* ── Toolbar ── */}
      <div className="flex items-center shrink-0 flex-wrap"
           style={{ gap: 8, minHeight: 46, padding: '9px 14px', borderBottom: `1px solid ${EDGE}` }}>
        <div style={{ width: 330, maxWidth: '100%' }}>
          <SearchInputView
            value={query}
            onChange={setQuery}
            placeholder="Search a logger, a class, a message"
            size="lg"
            height={28}
            aria-label="Search loggers"
            style={{ background: CARD, border: `1px solid ${EDGE}`, borderRadius: 6, paddingLeft: 10, paddingRight: 10 }}
          />
        </div>
        <Picker
          lead="Level"
          value={level}
          onChange={setLevel}
          options={[
            { value: 'any', label: 'any' },
            ...levels.map(l => ({ value: l, label: l === 'none' ? 'not set' : l })),
          ]}
        />
        <Picker
          lead="Source"
          value={source}
          onChange={v => setSource(v as SourceFilter)}
          options={SOURCE_OPTIONS}
        />
        {/* A checkbox in a box the toolbar's height, on an amber wash, because
            what it shows is the thing worth worrying about. */}
        <Tick
          checked={neverFired}
          onChange={setNeverFired}
          accent={AMBER}
          color={AMBER}
          title="Declared loggers that wrote nothing in this window"
          label={<>Never fired here <span style={{ color: QUIET }}>{silent}</span></>}
          style={{
            height: 28, padding: '0 10px', border: `1px solid ${EDGE}`, borderRadius: 6,
            background: tint(AMBER, 10),
          }}
        />

        <div className="flex-1" />

        <span style={{ fontSize: 11.5, color: QUIET }}>window</span>
        <Picker
          icon={<ClockIcon size={11} color={QUIET} strokeWidth={2} />}
          value={win}
          onChange={v => setWin(v as CatalogueWindow)}
          options={(Object.keys(WINDOW_LABEL) as CatalogueWindow[]).map(w => ({ value: w, label: WINDOW_LABEL[w] }))}
        />
        {/* Not on the board, which reaches Add patterns from a row; kept here
            because an empty catalogue has no row to reach it from. */}
        <BoardButton
          h={28}
          fill={CARD}
          onClick={() => { setInto(undefined); setAdding('patterns'); }}
          title="Paste logger calls, scan the repository, or learn from the log"
          iconLeft={<PlusIcon size={12} color={LOGGERS} strokeWidth={2.4} />}
        >
          Add patterns
        </BoardButton>
        <BoardButton
          h={28}
          tone="primary"
          onClick={() => setAdding('loggers')}
          title="From a project folder, from this pod, a pasted list, or one by one"
          iconLeft={<PlusIcon size={12} strokeWidth={2.4} />}
        >
          Add loggers
        </BoardButton>
      </div>

      <LiveLevelsBar live={live} status={levelsLive.status} reason={levelsLive.reason} now={now}
                     onPorts={() => useK8sStore.getState().setDetailTab('ports')} />

      <div className="flex flex-1 min-h-0">
        {/* ── Rail ── */}
        <div className="shrink-0 overflow-auto dk8s-no-scrollbar"
             style={{ width: 210, padding: '12px 0', borderRight: `1px solid ${EDGE}`, background: CARD }}>
          <RailHeading>PACKAGES</RailHeading>
          <RailRow label="All" count={named.length} on={!pkg} onClick={() => setPkg(undefined)} />
          {packages.map(([p, n]) => (
            <RailRow key={p} label={p} count={n} on={pkg === p}
                     onClick={() => setPkg(pkg === p ? undefined : p)} />
          ))}

          <RailHeading top>WHERE FROM</RailHeading>
          {sources.map(([s, n]) => (
            <RailRow key={s} label={SOURCE_LABEL[s]} count={n} on={from === s} swatch={SOURCE_COLOR[s]}
                     onClick={() => setFrom(from === s ? undefined : s)} />
          ))}
          {!sources.length && (
            <span className="block" style={{ padding: '4px 12px', fontSize: 11.5, lineHeight: 1.6, color: QUIET }}>
              Nothing yet — add loggers, or open a log a format can read the logger off.
            </span>
          )}
        </div>

        {/* ── Table ── */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="grid shrink-0"
               style={{ ...HEAD_TYPE, gridTemplateColumns: grid, gap: 12, padding: '8px 14px', borderBottom: `1px solid ${EDGE}` }}>
            <div>LOGGER</div><div>{live ? 'LEVEL · LIVE' : 'LEVEL'}</div><div>SOURCE</div>
            <div style={{ textAlign: 'right' }}>EVENTS {WINDOW_SHORT[win]}</div>
            <div>PATTERNS</div><div style={{ textAlign: 'right' }}>LAST SEEN</div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {shown.length === 0 && (
              <div style={{ padding: '24px 14px', fontSize: 12, lineHeight: 1.6, color: QUIET, maxWidth: 560 }}>
                {rows.length === 0
                  ? 'Nothing catalogued for this workload yet. Add loggers from the project or the pod to see which ones exist before they fire, or add patterns to find what a logger said.'
                  : 'No logger matches these filters.'}
              </div>
            )}
            {shown.map(row => (
              <LoggerRow
                key={row.key || '__none'}
                row={row}
                now={now}
                open={open.has(row.key || '__none')}
                onToggle={() => toggleOpen(row.key || '__none')}
                onAddPatterns={() => { setInto(row.key || undefined); setAdding('patterns'); }}
                onMenu={menu.open}
                live={live}
                grid={grid}
              />
            ))}
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center shrink-0"
               style={{ gap: 10, height: 34, padding: '0 14px', borderTop: `1px solid ${EDGE}`, fontSize: 11.5, color: QUIET }}>
            <span className="truncate">
              {named.length.toLocaleString()} logger{named.length === 1 ? '' : 's'}
              {' · '}{fired.toLocaleString()} fired in the {WINDOW_LABEL[win]}
              {' · '}{silent.toLocaleString()} declared but silent
            </span>
            <div className="flex-1" />
            {/* Only when the buffer is shorter than the window — the board's
                buffer reaches back far enough, so it never shows this. */}
            {short && oldest !== undefined && (
              <>
                <span className="truncate" title="The counts are over what the view holds, and it does not reach the start of the window.">
                  the buffer starts {ago(oldest, now)}
                </span>
                <BoardButton tone="quiet" onClick={readWindow}
                             title="Fetch this pod's log for the whole window, so the counts cover it">
                  Read the {WINDOW_LABEL[win]}
                </BoardButton>
              </>
            )}
            <BoardButton tone="quiet" onClick={exportIt} disabled={!rows.length}
                         title="Every logger and pattern here, with its counts, as a JSON file">
              Export catalogue
            </BoardButton>
          </div>
        </div>
      </div>

      {adding === 'loggers' && <AddLoggersModal scope={scope} onClose={() => setAdding(undefined)} />}
      {adding === 'patterns' && (
        <AddPatternsModal scope={scope} into={into} onClose={() => setAdding(undefined)} />
      )}
    </div>
  );
}

function RailHeading({ children, top }: { children: string; top?: boolean }) {
  return (
    <div style={{
      padding: `${top ? 16 : 0}px 12px 8px`, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: LABEL,
    }}>
      {children}
    </div>
  );
}

/**
 * A rail row. A package is a button 5px tall at 12px, lit purple when it is
 * the filter; a WHERE FROM row is 4px with its colour square set down to the
 * text's baseline, the way the board draws it. Both filter the table.
 */
function RailRow({ label, count, on, onClick, swatch }: {
  label: string; count: number; on: boolean; onClick: () => void; swatch?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="flex w-full border-none cursor-pointer text-left"
      style={{
        gap: 8, padding: swatch ? '4px 12px' : '5px 12px', fontSize: 12,
        alignItems: swatch ? 'flex-start' : 'center',
        background: on ? tint(LOGGERS, 14) : 'transparent',
        color: on ? TEXT : LABEL,
      }}
    >
      {swatch && <span className="shrink-0" style={{ width: 8, height: 8, marginTop: 5, borderRadius: 2, background: swatch }} />}
      <span className="flex-1 min-w-0 truncate">{label}</span>
      <span style={{ color: QUIET, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
    </button>
  );
}

type OpenMenu = (e: React.MouseEvent, items: ContextMenuItem[]) => void;

function LoggerRow({ row, now, open, onToggle, onAddPatterns, onMenu, live, grid = GRID }: {
  row: CatalogueRow; now: number; open: boolean; onToggle: () => void; onAddPatterns: () => void;
  onMenu: OpenMenu; live?: Live; grid?: string;
}) {
  const silent = isSilent(row);
  const off = isOffAtLevel(row);
  const allMarked = row.patterns.length > 0 && row.patterns.every(p => p.pattern.marked);
  const n = row.patterns.length;
  const patternsText = silent && !off
    ? 'declared, never fired in this window'
    : off && row.events === 0
      ? 'off at this level'
      : n === 0 ? 'no patterns yet' : `${n} message pattern${n === 1 ? '' : 's'}`;

  const showInLogs = () => {
    const s = useK8sStore.getState();
    s.clearFieldFilters();
    if (row.seenNames.length) {
      s.setLogFilter('');
      for (const seen of row.seenNames) s.addFieldFilter({ field: 'logger', value: seen, mode: 'include' });
    } else if (row.patterns.length) {
      const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
      s.setLogFilter(`/${row.patterns.map(p => esc(firstLiteral(p.pattern.template))).filter(Boolean).join('|')}/`);
    } else {
      s.setLogFilter(shortName(row.name));
    }
    s.setDetailTab('logs');
    logUiEvent('dk8s.logger_show', { by: row.seenNames.length ? 'logger' : 'pattern' });
  };

  const copy = () => {
    void navigator.clipboard?.writeText(row.patterns.map(p => p.pattern.template).join('\n'));
  };

  /* No last-seen is the board's muted dash, whatever the row's own shade. */
  const last = row.key ? ago(row.lastSeen, now) : '';

  /* The opened row's buttons, and a little more, without opening it. */
  const rowMenu = (e: React.MouseEvent) => {
    if (window.getSelection()?.toString().trim()) return;
    onMenu(e, [
      { id: 'toggle', label: open ? 'Hide patterns' : 'Show patterns', icon: open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />, onClick: onToggle },
      { id: 'show', label: 'Show in Logs', disabled: !row.key && !n, icon: <FilterIcon size={14} />, iconColor: LOGGERS, onClick: showInLogs },
      {
        id: 'watch', label: allMarked ? 'Stop watching' : 'Watch this logger', disabled: !n,
        description: n ? undefined : 'Add patterns first',
        icon: allMarked ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />, iconColor: 'var(--color-warning)',
        onClick: () => setMarks(row.patterns.map(p => p.pattern.id), !allMarked),
      },
      { id: 'add', label: 'Add patterns…', icon: <PlusIcon size={14} />, iconColor: LOGGERS, onClick: onAddPatterns },
      SEP('row-sep-1'),
      ...(row.name ? [copyItem('copy-name', 'Copy logger name', row.name)] : []),
      ...(n ? [copyItem('copy-patterns', n === 1 ? 'Copy pattern' : `Copy ${n} patterns`, row.patterns.map(p => p.pattern.template).join('\n'))] : []),
      ...(row.stored && isDeclared(row) ? [
        SEP('row-sep-2'),
        { id: 'remove', label: 'Remove logger', description: 'Its patterns stay', danger: true, icon: <TrashIcon size={14} />, onClick: () => removeLogger(row.stored!.id) },
      ] : []),
    ]);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onContextMenu={rowMenu}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        aria-expanded={open}
        className="grid items-center cursor-pointer"
        style={{
          gridTemplateColumns: grid, gap: 12, padding: '9px 14px',
          borderBottom: `1px solid ${DIVIDER}`,
          background: open ? tint(LOGGERS, 8)
            : silent && !off ? tint(AMBER, 6) : 'transparent',
        }}
      >
        <div className="flex items-center min-w-0" style={{ gap: 7 }}>
          <span className="inline-flex shrink-0">
            {open
              ? <ChevronDownIcon size={11} color={LOGGERS} />
              : <ChevronRightIcon size={11} color={QUIET} />}
          </span>
          <span className="font-mono truncate"
                title={row.name || 'Patterns that name no logger'}
                style={{
                  fontSize: 12,
                  color: !row.key ? QUIET : silent && !off ? LABEL : TEXT,
                  fontStyle: row.key ? undefined : 'italic',
                }}>
            {row.name || 'patterns with no logger'}
          </span>
        </div>
        <div>{live && row.key ? <LiveLevelCell live={live} name={row.name} fallback={row.level} /> : <LevelPill level={row.level} />}</div>
        <div className="truncate" title={row.origin ?? row.sources.map(s => SOURCE_LABEL[s]).join(', ')}
             style={{ fontSize: 11, color: SOURCE_COLOR[row.primary] }}>
          {row.primary === 'config' && row.origin ? row.origin.split(' · ')[0] : SOURCE_LABEL[row.primary]}
        </div>
        <div className="text-right font-mono"
             style={{ fontSize: 12, color: silent ? (off ? QUIET : AMBER) : off && row.events === 0 ? QUIET : TEXT }}>
          {row.key ? row.events.toLocaleString() : ''}
        </div>
        <div className="truncate"
             style={{ fontSize: 11.5, color: silent && !off ? AMBER : off ? QUIET : LABEL }}>
          {patternsText}
        </div>
        <div className="text-right" style={{ fontSize: 11.5, color: row.lastSeen === undefined ? QUIET : LABEL }}>
          {last}
        </div>
      </div>

      {open && (
        <div onContextMenu={rowMenu} style={{
          padding: '6px 14px 12px 40px', borderBottom: `1px solid ${DIVIDER}`,
          background: tint(LOGGERS, 4),
        }}>
          {row.patterns.length > 0 && (
            <div className="grid"
                 style={{ ...HEAD_TYPE, fontSize: 10, gridTemplateColumns: PATTERN_GRID, gap: 12, padding: '4px 0' }}>
              <div>MESSAGE PATTERN</div><div style={{ textAlign: 'right' }}>COUNT</div><div>LEVEL</div>
              <div style={{ textAlign: 'right' }}>LAST</div>
            </div>
          )}
          {row.patterns.map(stat => <PatternLine key={stat.pattern.id} stat={stat} now={now} onMenu={onMenu} />)}
          {row.patterns.length === 0 && (
            <div style={{ padding: '4px 0', fontSize: 11.5, color: QUIET }}>
              No message patterns for this logger yet. Add the calls it makes and the Logs tab can find, name and mark every line it writes.
            </div>
          )}

          <div className="flex items-center" style={{ gap: 8, paddingTop: 8 }}>
            <BoardButton onClick={showInLogs} disabled={!row.key && !row.patterns.length}>
              Show in Logs
            </BoardButton>
            <BoardButton
              style={allMarked ? { color: LOGGERS, borderColor: tint(LOGGERS, 42) } : undefined}
              disabled={!row.patterns.length}
              onClick={() => setMarks(row.patterns.map(p => p.pattern.id), !allMarked)}
              title={row.patterns.length
                ? allMarked ? 'Stop highlighting this logger’s patterns in Logs' : 'Mark every pattern of this logger, so the Logs tab lights its lines'
                : 'A logger is watched by its patterns — add some first'}
            >
              {allMarked ? 'Watching' : 'Watch this logger'}
            </BoardButton>
            <BoardButton tone="quiet" onClick={copy} disabled={!row.patterns.length}>
              Copy patterns
            </BoardButton>
            {/* Past the board's three: filing new patterns under this logger,
                and taking a declared one out. */}
            <BoardButton tone="quiet" onClick={onAddPatterns}
                         iconLeft={<PlusIcon size={11} color={LOGGERS} strokeWidth={2.4} />}>
              Add patterns
            </BoardButton>
            <div className="flex-1" />
            {row.stored && isDeclared(row) && (
              <BoardButton tone="quiet" onClick={() => removeLogger(row.stored!.id)}
                           style={{ border: 'none' }}
                           iconLeft={<TrashIcon size={11} />}
                           title="Take this logger out of the catalogue. Its patterns stay.">
                Remove logger
              </BoardButton>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** The first fixed words of a template — what Show in Logs searches for. */
function firstLiteral(template: string): string {
  const parts = templateParts(template).filter(p => !p.hole).map(p => p.text.trim());
  return parts.sort((a, b) => b.length - a.length)[0] ?? '';
}

/**
 * One pattern under an opened logger, as the board draws it: the template
 * with its `{holes}` in teal, the count, the level in its colour as plain
 * text, and when it was last seen — the whole row greyed, level included,
 * when it has never matched here.
 *
 * Marking, summarising and removing are not on the board. They sit over the
 * LAST cell while the pointer is on the row (and stay while the summary is
 * open), so the row at rest is the picture; a marked pattern keeps a dot in
 * its mark colour before the template, so a mark is visible without a hover.
 */
function PatternLine({ stat, now, onMenu }: { stat: PatternStat; now: number; onMenu: OpenMenu }) {
  const p: CataloguePattern = stat.pattern;
  const color = MARK_COLORS[p.color ?? 0];
  const lv = p.level?.toUpperCase();
  const silent = stat.count === 0;
  const [building, setBuilding] = useState(false);
  const [hover, setHover] = useState(false);

  /* This one pattern's lines, found by its longest fixed words. */
  const showInLogs = () => {
    const words = firstLiteral(p.template);
    if (!words) return;
    const s = useK8sStore.getState();
    s.clearFieldFilters();
    s.setLogFilter(words);
    s.setDetailTab('logs');
    logUiEvent('dk8s.logger_show', { by: 'one-pattern' });
  };

  const patternMenu = (e: React.MouseEvent) => {
    if (window.getSelection()?.toString().trim()) return;
    onMenu(e, [
      {
        id: 'mark', label: p.marked ? 'Unmark' : 'Mark', description: p.marked ? undefined : 'Highlight it in Logs',
        icon: <MarkFlagIcon size={14} />, iconColor: p.marked ? color : LOGGERS, onClick: () => toggleMark(p.id),
      },
      { id: 'summarise', label: building ? 'Close the summary' : 'Summarise…', icon: <ChartBarIcon size={14} />, iconColor: 'var(--color-info)', onClick: () => setBuilding(v => !v) },
      { id: 'show', label: 'Show in Logs', disabled: !firstLiteral(p.template), icon: <FilterIcon size={14} />, iconColor: LOGGERS, onClick: showInLogs },
      SEP('pat-sep-1'),
      copyItem('copy-template', 'Copy pattern', p.template),
      SEP('pat-sep-2'),
      { id: 'remove', label: 'Remove from the catalogue', danger: true, icon: <TrashIcon size={14} />, onClick: () => removePattern(p.id) },
    ]);
  };

  return (
    <div className="flex flex-col">
      <div className="grid items-center font-mono relative"
           onContextMenu={patternMenu}
           onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
           onFocus={() => setHover(true)} onBlur={() => setHover(false)}
           style={{ gridTemplateColumns: PATTERN_GRID, gap: 12, padding: '4px 0', fontSize: 11.5, color: silent ? QUIET : TEXT }}>
        <div className="flex items-center min-w-0" style={{ gap: 6 }}>
          {p.marked && (
            <span className="shrink-0" title="Marked — highlighted in Logs"
                  style={{ width: 7, height: 7, borderRadius: 999, background: color }} />
          )}
          <span className="truncate" title={p.template}>
            <Template template={p.template} dim={silent} />
          </span>
          {p.objectFields?.length ? (
            <span className="shrink-0" style={{ fontSize: 10.5, color: QUIET }}>
              + {p.objectFields.join(', ')}
            </span>
          ) : null}
        </div>
        <div className="text-right">{stat.count.toLocaleString()}</div>
        <div style={{ color: silent || !lv ? undefined : LEVEL_COLOR[lv] ?? QUIET }}>{lv ?? '—'}</div>
        <div className="text-right" style={{ color: silent ? QUIET : LABEL }}>
          {silent ? 'never here' : ago(stat.last, now)}
        </div>

        {/* Always rendered, so Tab reaches it — focusing into it shows it. */}
        <div className="absolute flex items-center font-sans"
             style={{
               right: 0, top: '50%', transform: 'translateY(-50%)', gap: 6, paddingLeft: 8, background: CARD, borderRadius: 6,
               opacity: hover || building ? 1 : 0, pointerEvents: hover || building ? 'auto' : 'none',
             }}>
          <Tick checked={!!p.marked} onChange={() => toggleMark(p.id)} accent={p.marked ? color : LOGGERS}
                label="Mark" color={LABEL} fontSize={11}
                title={p.marked ? 'Marked — highlighted in Logs' : 'Mark it, to highlight it in Logs'} />
          {/* A pattern worth watching is often a pattern worth counting, and
              the reader notices the second thing right after the first. */}
          <BoardButton h={22} tone="quiet" onClick={() => setBuilding(v => !v)}
                       style={p.summary ? { color: LOGGERS } : undefined}
                       title="Group and count this pattern over a window">
            Summarise
          </BoardButton>
          <BoardButton h={22} tone="quiet" onClick={() => removePattern(p.id)} style={{ padding: '0 6px' }}
                       aria-label="Remove it from the catalogue" title="Remove it from the catalogue"
                       iconLeft={<TrashIcon size={11} />} />
        </div>
      </div>
      {building && <SummaryBuilder pattern={p} onClose={() => setBuilding(false)} />}
    </div>
  );
}

/** Exported for the Logs tab, which highlights what is marked here. */
export { markOf };
