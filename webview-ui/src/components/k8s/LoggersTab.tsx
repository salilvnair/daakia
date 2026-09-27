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
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ButtonView, SearchInputView, SelectInputView, CheckboxView, IconSize,
} from '@salilvnair/dui';
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
  PlusIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon, CopyIcon, EyeIcon, FileTextIcon, ClockIcon,
  DownloadIcon, CheckIcon,
} from '../../icons';
import { LOGGERS, LOGGERS_SOFT, LOGGERS_EDGE, LOGGERS_INK } from './tone';
import { postMsg } from '../../vscode';
import { logUiEvent } from '../../store/ui-audit-store';
import { AddLoggersModal } from './AddLoggersModal';
import { AddPatternsModal } from './AddPatternsModal';
import { SummaryBuilder } from './SummaryBuilder';
import { PatternTemplate as Template } from './PatternTemplate';

/** One size for every control in the toolbar, so the row is one height. */
const CTL = 'md';

/** The workload a pattern belongs to — never the pod, which a rollout renames. */
export function scopeOf(pod: {
  namespace: string; context?: string; workload?: { kind: string; name: string };
} | undefined): string {
  if (!pod) return '*';
  const where = `${pod.context ?? ''}/${pod.namespace}`;
  return pod.workload ? `${where}/${pod.workload.kind}/${pod.workload.name}` : `${where}/Pod`;
}

/** The table's columns, from the board. */
const GRID = 'minmax(220px, 330px) 74px 104px 96px minmax(120px, 1fr) 92px';
const PATTERN_GRID = 'minmax(0, 1fr) 72px 64px 92px auto';

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

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 shrink-0 flex-wrap"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <div style={{ width: 330, maxWidth: '100%' }}>
          <SearchInputView
            value={query}
            onChange={setQuery}
            placeholder="Search a logger, a class, a message"
            size={CTL}
            aria-label="Search loggers"
          />
        </div>
        <SelectInputView
          value={level}
          onChange={setLevel}
          size={CTL}
          accentColor={LOGGERS}
          options={[
            { value: 'any', label: 'Level  any' },
            ...levels.map(l => ({ value: l, label: l === 'none' ? 'Level  not set' : `Level  ${l}` })),
          ]}
        />
        <SelectInputView
          value={source}
          onChange={v => setSource(v as SourceFilter)}
          size={CTL}
          accentColor={LOGGERS}
          options={[
            { value: 'any', label: 'Source  any' },
            { value: 'declared', label: 'Source  declared' },
            { value: 'seen', label: 'Source  seen in logs' },
            { value: 'code', label: 'Source  source code' },
            { value: 'hand', label: 'Source  added by hand' },
          ]}
        />
        {/* A toggle, drawn as a button so it is the toolbar's height. Amber,
            because what it shows is the thing worth worrying about. */}
        <ButtonView
          size={CTL}
          variant="secondary"
          accentColor="var(--color-warning)"
          color="var(--color-warning)"
          onClick={() => setNeverFired(v => !v)}
          aria-pressed={neverFired}
          title="Declared loggers that wrote nothing in this window"
          iconLeft={<Tick on={neverFired} color="var(--color-warning)" />}
          style={{
            background: neverFired ? 'color-mix(in srgb, var(--color-warning) 12%, transparent)' : 'transparent',
            borderColor: neverFired ? 'color-mix(in srgb, var(--color-warning) 40%, transparent)' : 'var(--color-surface-border)',
          }}
        >
          Never fired here <span style={{ color: 'var(--color-text-muted)', marginLeft: 4 }}>{silent}</span>
        </ButtonView>

        <div className="flex-1" />

        <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>window</span>
        <SelectInputView
          value={win}
          onChange={v => setWin(v as CatalogueWindow)}
          size={CTL}
          accentColor={LOGGERS}
          options={(Object.keys(WINDOW_LABEL) as CatalogueWindow[]).map(w => ({ value: w, label: WINDOW_LABEL[w] }))}
        />
        <ButtonView
          size={CTL}
          variant="secondary"
          accentColor={LOGGERS}
          color={LOGGERS}
          onClick={() => { setInto(undefined); setAdding('patterns'); }}
          title="Paste logger calls, scan the repository, or learn from the log"
          iconLeft={<PlusIcon size={IconSize.action} />}
          style={{ borderColor: LOGGERS_EDGE }}
        >
          Add patterns
        </ButtonView>
        <ButtonView
          size={CTL}
          variant="primary"
          accentColor={LOGGERS}
          onClick={() => setAdding('loggers')}
          title="From a project folder, from this pod, a pasted list, or one by one"
          iconLeft={<PlusIcon size={IconSize.action} />}
          style={{ background: LOGGERS, borderColor: LOGGERS, color: LOGGERS_INK, fontWeight: 600 }}
        >
          Add loggers
        </ButtonView>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* ── Rail ── */}
        <div className="shrink-0 overflow-auto py-3 dk8s-no-scrollbar"
             style={{ width: 210, borderRight: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
          <RailHeading>PACKAGES</RailHeading>
          <RailRow label="All" count={named.length} on={!pkg} onClick={() => setPkg(undefined)} />
          {packages.map(([p, n]) => (
            <RailRow key={p} label={p} count={n} on={pkg === p} mono
                     onClick={() => setPkg(pkg === p ? undefined : p)} />
          ))}

          <RailHeading top>WHERE FROM</RailHeading>
          {sources.map(([s, n]) => (
            <RailRow key={s} label={SOURCE_LABEL[s]} count={n} on={from === s} swatch={SOURCE_COLOR[s]}
                     onClick={() => setFrom(from === s ? undefined : s)} />
          ))}
          {!sources.length && (
            <span className="block px-3 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              Nothing yet — add loggers, or open a log a format can read the logger off.
            </span>
          )}
        </div>

        {/* ── Table ── */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="grid gap-3 px-4 py-2 shrink-0 text-[10.5px] font-bold"
               style={{
                 gridTemplateColumns: GRID, letterSpacing: '0.05em', color: 'var(--color-text-muted)',
                 borderBottom: '1px solid var(--color-surface-border)',
               }}>
            <div>LOGGER</div><div>LEVEL</div><div>SOURCE</div>
            <div style={{ textAlign: 'right' }}>EVENTS {WINDOW_SHORT[win]}</div>
            <div>PATTERNS</div><div style={{ textAlign: 'right' }}>LAST SEEN</div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {shown.length === 0 && (
              <div className="px-4 py-6 text-[12px] leading-relaxed" style={{ color: 'var(--color-text-muted)', maxWidth: 560 }}>
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
              />
            ))}
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center gap-2.5 px-4 shrink-0 text-[11.5px]"
               style={{ height: 34, borderTop: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
            <span className="truncate">
              {named.length.toLocaleString()} logger{named.length === 1 ? '' : 's'}
              {' · '}{fired.toLocaleString()} fired in the {WINDOW_LABEL[win]}
              {' · '}{silent.toLocaleString()} declared but silent
            </span>
            <div className="flex-1" />
            {short && oldest !== undefined && (
              <>
                <span className="truncate" title="The counts are over what the view holds, and it does not reach the start of the window.">
                  the buffer starts {ago(oldest, now)}
                </span>
                <ButtonView size="xs" variant="secondary" accentColor={LOGGERS} onClick={readWindow}
                            iconLeft={<ClockIcon size={IconSize.inline} />}
                            title="Fetch this pod's log for the whole window, so the counts cover it">
                  Read the {WINDOW_LABEL[win]}
                </ButtonView>
              </>
            )}
            <ButtonView size="xs" variant="secondary" onClick={exportIt} disabled={!rows.length}
                        iconLeft={<DownloadIcon size={IconSize.inline} />}
                        title="Every logger and pattern here, with its counts, as a JSON file">
              Export catalogue
            </ButtonView>
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

/** A small checkbox glyph for a toggle drawn as a button. */
function Tick({ on, color }: { on: boolean; color: string }) {
  return (
    <span className="inline-flex items-center justify-center"
          style={{
            width: 12, height: 12, borderRadius: 3,
            border: `1.5px solid ${color}`, background: on ? color : 'transparent',
          }}>
      {on && <CheckIcon size={9} color="var(--color-panel)" />}
    </span>
  );
}

function RailHeading({ children, top }: { children: string; top?: boolean }) {
  return (
    <div className="px-3 pb-2 text-[10.5px] font-bold"
         style={{ paddingTop: top ? 16 : 0, letterSpacing: '0.06em', color: 'var(--color-text-secondary)' }}>
      {children}
    </div>
  );
}

function RailRow({ label, count, on, onClick, swatch, mono }: {
  label: string; count: number; on: boolean; onClick: () => void; swatch?: string; mono?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="flex items-center w-full gap-2 px-3 py-1 border-none cursor-pointer text-left text-[12px]"
      style={{
        background: on ? LOGGERS_SOFT : 'transparent',
        color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
      }}
    >
      {swatch && <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: 2, background: swatch }} />}
      <span className={`flex-1 min-w-0 truncate${mono ? ' font-mono text-[11.5px]' : ''}`}>{label}</span>
      <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
    </button>
  );
}

function LevelChip({ level }: { level?: string }) {
  if (!level) return <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>&mdash;</span>;
  const color = LEVEL_COLOR[level] ?? 'var(--color-text-muted)';
  return (
    <span className="px-1.5 rounded text-[10.5px] font-bold"
          style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
      {level}
    </span>
  );
}

function LoggerRow({ row, now, open, onToggle, onAddPatterns }: {
  row: CatalogueRow; now: number; open: boolean; onToggle: () => void; onAddPatterns: () => void;
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

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        aria-expanded={open}
        className="grid gap-3 items-center px-4 cursor-pointer"
        style={{
          gridTemplateColumns: GRID, paddingTop: 9, paddingBottom: 9,
          borderBottom: '1px solid var(--color-surface-border)',
          background: open ? `color-mix(in srgb, ${LOGGERS} 8%, transparent)`
            : silent && !off ? 'color-mix(in srgb, var(--color-warning) 6%, transparent)' : 'transparent',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {open
            ? <ChevronDownIcon size={IconSize.inline} color={LOGGERS} />
            : <ChevronRightIcon size={IconSize.inline} color="var(--color-text-muted)" />}
          <span className="font-mono text-[12px] truncate"
                title={row.name || 'Patterns that name no logger'}
                style={{
                  color: !row.key ? 'var(--color-text-muted)' : silent ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
                  fontStyle: row.key ? undefined : 'italic',
                }}>
            {row.name || 'patterns with no logger'}
          </span>
        </div>
        <div><LevelChip level={row.level} /></div>
        <div className="text-[11px] truncate" title={row.origin ?? row.sources.map(s => SOURCE_LABEL[s]).join(', ')}
             style={{ color: SOURCE_COLOR[row.primary] }}>
          {row.primary === 'config' && row.origin ? row.origin.split(' · ')[0] : SOURCE_LABEL[row.primary]}
        </div>
        <div className="text-right font-mono text-[12px]"
             style={{ color: silent ? (off ? 'var(--color-text-muted)' : 'var(--color-warning)') : 'var(--color-text-primary)' }}>
          {row.key ? row.events.toLocaleString() : ''}
        </div>
        <div className="text-[11.5px] truncate"
             style={{ color: silent && !off ? 'var(--color-warning)' : off ? 'var(--color-text-muted)' : 'var(--color-text-secondary)' }}>
          {patternsText}
        </div>
        <div className="text-right text-[11.5px]" style={{ color: 'var(--color-text-secondary)' }}>
          {row.key ? ago(row.lastSeen, now) : ''}
        </div>
      </div>

      {open && (
        <div className="px-4 pb-3 pt-1.5"
             style={{
               paddingLeft: 40, borderBottom: '1px solid var(--color-surface-border)',
               background: `color-mix(in srgb, ${LOGGERS} 4%, transparent)`,
             }}>
          {row.patterns.length > 0 && (
            <div className="grid gap-3 py-1 text-[10px] font-bold"
                 style={{ gridTemplateColumns: PATTERN_GRID, letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
              <div>MESSAGE PATTERN</div><div style={{ textAlign: 'right' }}>COUNT</div><div>LEVEL</div>
              <div style={{ textAlign: 'right' }}>LAST</div><div />
            </div>
          )}
          {row.patterns.map(stat => <PatternLine key={stat.pattern.id} stat={stat} now={now} />)}
          {row.patterns.length === 0 && (
            <div className="py-1 text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
              No message patterns for this logger yet. Add the calls it makes and the Logs tab can find, name and mark every line it writes.
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <ButtonView size="xs" variant="secondary" onClick={showInLogs}
                        iconLeft={<FileTextIcon size={IconSize.inline} />}
                        disabled={!row.key && !row.patterns.length}>
              Show in Logs
            </ButtonView>
            <ButtonView
              size="xs" variant="secondary"
              accentColor={LOGGERS}
              color={allMarked ? LOGGERS : undefined}
              disabled={!row.patterns.length}
              onClick={() => setMarks(row.patterns.map(p => p.pattern.id), !allMarked)}
              title={row.patterns.length
                ? allMarked ? 'Stop highlighting this logger’s patterns in Logs' : 'Mark every pattern of this logger, so the Logs tab lights its lines'
                : 'A logger is watched by its patterns — add some first'}
              iconLeft={<EyeIcon size={IconSize.inline} />}
            >
              {allMarked ? 'Watching' : 'Watch this logger'}
            </ButtonView>
            <ButtonView size="xs" variant="secondary" onClick={copy} disabled={!row.patterns.length}
                        iconLeft={<CopyIcon size={IconSize.inline} />}>
              Copy patterns
            </ButtonView>
            <ButtonView size="xs" variant="secondary" accentColor={LOGGERS} onClick={onAddPatterns}
                        iconLeft={<PlusIcon size={IconSize.inline} />}>
              Add patterns
            </ButtonView>
            <div className="flex-1" />
            {row.stored && isDeclared(row) && (
              <ButtonView size="xs" variant="ghost" onClick={() => removeLogger(row.stored!.id)}
                          iconLeft={<TrashIcon size={IconSize.inline} />}
                          title="Take this logger out of the catalogue. Its patterns stay.">
                Remove logger
              </ButtonView>
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

function PatternLine({ stat, now }: { stat: PatternStat; now: number }) {
  const p: CataloguePattern = stat.pattern;
  const color = MARK_COLORS[p.color ?? 0];
  const lv = p.level?.toUpperCase();
  const [building, setBuilding] = useState(false);

  return (
    <div className="flex flex-col">
      <div className="grid gap-3 items-center py-1 font-mono text-[11.5px]"
           style={{ gridTemplateColumns: PATTERN_GRID }}>
        <div className="flex items-center gap-2 min-w-0">
          <span title={p.marked ? 'Marked — highlighted in Logs' : 'Mark it, to highlight it in Logs'}
                className="shrink-0 inline-flex" onClick={e => e.stopPropagation()}>
            <CheckboxView checked={!!p.marked} onChange={() => toggleMark(p.id)} size="sm"
                          accentColor={p.marked ? color : LOGGERS} />
          </span>
          <span className="truncate" title={p.template}>
            <Template template={p.template} dim={stat.count === 0} />
          </span>
          {p.objectFields?.length ? (
            <span className="shrink-0 text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
              + {p.objectFields.join(', ')}
            </span>
          ) : null}
        </div>
        <div className="text-right" style={{ color: stat.count ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
          {stat.count.toLocaleString()}
        </div>
        <div style={{ color: lv ? LEVEL_COLOR[lv] ?? 'var(--color-text-muted)' : 'var(--color-text-muted)' }}>
          {lv ?? '—'}
        </div>
        <div className="text-right font-sans" style={{ color: stat.count ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
          {stat.count ? ago(stat.last, now) : 'never here'}
        </div>
        <div className="flex items-center gap-1.5 font-sans">
          {/* A pattern worth watching is often a pattern worth counting, and
              the reader notices the second thing right after the first. */}
          <ButtonView size="xs" variant="secondary" accentColor={LOGGERS}
                      color={p.summary ? LOGGERS : undefined}
                      onClick={() => setBuilding(v => !v)}
                      title="Group and count this pattern over a window">
            Summarise
          </ButtonView>
          <ButtonView size="xs" variant="ghost" onClick={() => removePattern(p.id)}
                      aria-label="Remove it from the catalogue" title="Remove it from the catalogue"
                      iconLeft={<TrashIcon size={IconSize.inline} />} />
        </div>
      </div>
      {building && <SummaryBuilder pattern={p} onClose={() => setBuilding(false)} />}
    </div>
  );
}

/** Exported for the Logs tab, which highlights what is marked here. */
export { markOf };
