/**
 * Add patterns — what a logger can say, so a tester can look for it before
 * it happens.
 *
 * The line in the log never carries the `{}`; it carries the value. So the
 * page keeps the fixed text around each hole and names the hole after the
 * argument that fills it, and the line is found however the value changes —
 * and the value becomes a field somebody can filter and group by.
 *
 * Four ways in, one table out:
 *
 *   Paste the code         any number of calls, in any of the four dialects,
 *                          or a dropped file
 *   Scan the repository    every call in a source tree (ScanRepoPane)
 *   Learn from the log     the shapes this pod's lines already fall into
 *   Write one by hand      a template with `{name}` holes
 *
 * ── WHAT THAT MATCHES ──
 *
 * Every pattern is tried against the last two hours this view holds before it
 * is kept. The count is the useful part and the zero most of all: "nothing
 * matched here — either it never ran, or the text differs from the build in
 * this pod" is something a tester needs to know BEFORE they spend an
 * afternoon watching for a line that will never be written that way.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ModalView, ButtonView, SegmentedControlView, SelectInputView, CheckboxView, MultilineInputView,
  TextInputView, FilterInputView, BadgeChipView, IconSize,
} from '@salilvnair/dui';
import { useK8sStore } from '../../store/k8s-store';
import { usePatternsFor, useLoggersFor, addPatterns } from '../../store/dk8s-logger-store';
import {
  parsePaste, dialectsOf, regexSource, learnShapes, numericHoles, fromPlainText, findCalls,
} from './logger-calls';
import { compilePattern, matchPattern, type LoggerPattern } from './logger-pattern';
import { linesInWindow, buildRows, shortName, LEVEL_COLOR } from './logger-catalogue';
import { formatLogTime } from './log-view';
import { ScanRepoPane } from './ScanRepoPane';
import { PatternTemplate } from './PatternTemplate';
import {
  PlusIcon, CodeIcon, SearchIcon, FileTextIcon, PencilIcon, InfoCircleIcon, UploadIcon, EyeIcon, EyeOffIcon,
  WarningTriangleIcon,
} from '../../icons';
import { LOGGERS, LOGGERS_SOFT, LOGGERS_INK, HOLE } from './tone';
import { logUiEvent } from '../../store/ui-audit-store';

type Tab = 'paste' | 'scan' | 'learn' | 'hand';

const TWO_HOURS = '2h' as const;
const GRID = '24px minmax(0, 1fr) 60px 84px';

interface Tested {
  key: string;
  pattern: LoggerPattern;
  count: number;
  sample?: { text: string; ts?: number; level: string; logger?: string };
  numeric: string[];
}

export function AddPatternsModal({ scope, into: initialInto, onClose }: {
  scope: string;
  /** The logger the page opens filed under, from a row's "Add patterns". */
  into?: string;
  onClose: () => void;
}) {
  const logs = useK8sStore(s => s.logs);
  const patterns = usePatternsFor(scope);
  const stored = useLoggersFor(scope);

  const [tab, setTab] = useState<Tab>('paste');
  const [into, setInto] = useState(initialInto ?? '');
  const [paste, setPaste] = useState('');
  const [dropped, setDropped] = useState<string | undefined>();
  const [learnFrom, setLearnFrom] = useState<{ text: string }[] | undefined>();
  const [learnQuery, setLearnQuery] = useState('');
  const [learnPicked, setLearnPicked] = useState<Set<string>>(() => new Set());
  const [handTemplate, setHandTemplate] = useState('');
  const [handLevel, setHandLevel] = useState('info');
  const [scanChosen, setScanChosen] = useState<LoggerPattern[]>([]);
  const [off, setOff] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string | undefined>();
  const [showRegex, setShowRegex] = useState(false);
  const [markAll, setMarkAll] = useState(true);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const now = useMemo(() => Date.now(), []);
  const window2h = useMemo(() => linesInWindow(logs, TWO_HOURS, now), [logs, now]);
  const existingTemplates = useMemo(() => new Set(patterns.map(p => p.template)), [patterns]);

  /* Every logger the catalogue knows, for "into". */
  const loggerNames = useMemo(() => {
    const rows = buildRows(stored, patterns, logs, []);
    const names = rows.filter(r => r.key).map(r => r.name);
    if (initialInto && !names.includes(initialInto)) names.unshift(initialInto);
    return names.sort((a, b) => a.localeCompare(b));
  }, [stored, patterns, logs, initialInto]);

  const shapes = useMemo(
    () => (tab === 'learn' ? learnShapes(learnFrom ?? window2h) : []),
    [tab, learnFrom, window2h],
  );

  /* The drafts of the current tab, before the table's switches. */
  const drafts = useMemo<LoggerPattern[]>(() => {
    const file = (p: LoggerPattern): LoggerPattern => ({ ...p, logger: into || p.logger });
    switch (tab) {
      case 'paste':
        return parsePaste(paste).map(p => file({ ...p.pattern, source: findCalls(p.from).length ? 'paste' : 'manual' }));
      case 'learn':
        return shapes.filter(s => learnPicked.has(s.pattern.template)).map(s => file({ ...s.pattern, source: 'line' }));
      case 'hand': {
        const p = fromPlainText(handTemplate);
        return p ? [file({ ...p, level: handLevel === 'none' ? undefined : handLevel })] : [];
      }
      case 'scan':
        return scanChosen;
    }
    return [];
  }, [tab, paste, shapes, learnPicked, handTemplate, handLevel, scanChosen, into]);

  /* Each against the window: a count, a line it matched, and which holes read
     as numbers. The needle keeps it to a substring test per line. */
  const tested = useMemo<Tested[]>(() => {
    if (tab === 'scan') return [];
    return drafts.map(pattern => {
      const compiled = compilePattern(pattern);
      let count = 0;
      let sample: Tested['sample'];
      const fields: Record<string, string>[] = [];
      for (const l of window2h) {
        if (l.continuation) continue;
        const hit = matchPattern(compiled, l.message ?? l.text);
        if (!hit) continue;
        count++;
        if (!sample) sample = { text: l.message ?? l.text, ts: l.ts, level: l.level, logger: l.logger };
        if (fields.length < 30) fields.push(hit.fields);
      }
      return { key: pattern.template, pattern, count, sample, numeric: numericHoles(pattern, fields) };
    });
  }, [tab, drafts, window2h]);

  useEffect(() => {
    if (!selected || !tested.some(t => t.key === selected)) setSelected(tested[0]?.key);
  }, [tested, selected]);

  const chosen: LoggerPattern[] = tab === 'scan'
    ? scanChosen
    : tested.filter(t => !off.has(t.key) && !existingTemplates.has(t.key)).map(t => t.pattern);
  const matching = tested.filter(t => t.count > 0).length;
  const dialects = dialectsOf(paste);
  const current = tested.find(t => t.key === selected);

  const add = () => {
    const n = addPatterns(chosen, scope, markAll);
    logUiEvent('dk8s.patterns_add', { tab, added: n, marked: markAll, into: !!into });
    onClose();
  };

  /* A dropped file: source goes into the paste box, a log goes to Learn. */
  const takeFile = async (file: File) => {
    if (file.size > 4 * 1024 * 1024) return;
    const text = await file.text();
    setDropped(file.name);
    const looksLikeLog = /\.log$/i.test(file.name)
      || (!findCalls(text).length && text.split(/\r?\n/).slice(0, 20).filter(l => /^\S*\d{2}:\d{2}:\d{2}/.test(l)).length > 3);
    if (looksLikeLog) {
      setLearnFrom(text.split(/\r?\n/).filter(Boolean).slice(0, 50_000).map(t => ({ text: t })));
      setTab('learn');
    } else {
      setPaste(prev => (prev.trim() ? `${prev}\n${text}` : text));
      setTab('paste');
    }
  };

  const noteFor = (t: Tested): { text: string; warn?: boolean } => {
    if (t.count === 0) return { text: 'nothing matched here — either it never ran, or the text differs from the build in this pod', warn: true };
    if (t.pattern.exception) return { text: 'the last argument is the exception — its stack trace is folded into the match' };
    const h = t.pattern.holes;
    if (h.length === 0) return { text: t.pattern.objectFields?.length ? `fields ${t.pattern.objectFields.join(', ')} — carried beside the message` : 'no values in it — found by its text' };
    if (h.length === 1) return { text: `field ${h[0]} — kept from the log, so you can filter by it` };
    const num = t.numeric[0];
    return {
      text: num
        ? `${h.length === 2 ? 'two' : h.length} fields — ${num} reads as a number, so "slowest 10" sorts`
        : `${h.length} fields — ${h.join(', ')}`,
    };
  };

  return (
    <ModalView
      open
      onClose={onClose}
      size="xxl"
      height="86vh"
      headerColor={LOGGERS}
      headerIcon={<PlusIcon size={IconSize.row} color={LOGGERS} />}
      title="Add patterns"
      subtitle="what a logger can say, so a tester can look for it before it happens"
      headerRight={
        <div className="flex items-center gap-2">
          <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>into</span>
          <SelectInputView
            value={into}
            onChange={setInto}
            size="sm"
            accentColor={LOGGERS}
            menuMinWidth={320}
            options={[
              { value: '', label: 'the logger each call names' },
              ...loggerNames.map(n => ({ value: n, label: n })),
            ]}
          />
        </div>
      }
      bodyStyle={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: 12 }}
      footerLeft={
        <div className="flex items-center gap-4">
          <CheckboxView checked={markAll} onChange={setMarkAll} size="sm" accentColor={LOGGERS} label="Mark all after adding" />
          {tab !== 'scan' && (
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {tested.length} pattern{tested.length === 1 ? '' : 's'} · {matching} match here · {tested.length - matching} silent
            </span>
          )}
        </div>
      }
      footerRight={
        <div className="flex items-center gap-2">
          <ButtonView label="Cancel" size="sm" variant="secondary" onClick={onClose} />
          <ButtonView
            size="sm" variant="primary" accentColor={LOGGERS} disabled={!chosen.length} onClick={add}
            style={chosen.length ? { background: LOGGERS, borderColor: LOGGERS, color: LOGGERS_INK, fontWeight: 600 } : undefined}
          >
            {`Add ${chosen.length.toLocaleString()} pattern${chosen.length === 1 ? '' : 's'}`}
          </ButtonView>
        </div>
      }
    >
      <SegmentedControlView
        value={tab}
        onChange={v => setTab(v as Tab)}
        size="md"
        variant="rounded"
        accentColor={LOGGERS}
        options={[
          { value: 'paste', label: 'Paste the code', icon: <CodeIcon size={IconSize.action} /> },
          { value: 'scan', label: 'Scan the repository', icon: <SearchIcon size={IconSize.action} /> },
          { value: 'learn', label: 'Learn from the log', icon: <FileTextIcon size={IconSize.action} /> },
          { value: 'hand', label: 'Write one by hand', icon: <PencilIcon size={IconSize.action} /> },
        ]}
      />

      {tab === 'scan' ? (
        <ScanRepoPane window={window2h} existingTemplates={existingTemplates} into={into || undefined}
                      onChosen={setScanChosen} />
      ) : (
        <div className="flex flex-1 min-h-0 gap-4">
          {/* ── Left: the source ── */}
          <div className="flex flex-col gap-2.5 min-h-0" style={{ width: '42%' }}>
            {tab === 'paste' && (
              <>
                <Label>PASTE LOGGER CALLS</Label>
                <MultilineInputView
                  value={paste}
                  onChange={e => setPaste(e.target.value)}
                  rows={9}
                  resize="vertical"
                  accentColor={LOGGERS}
                  placeholder={'log.info("checking bcbl api for request:{}", reqId);\nlog.warn("bcbl api slow for request:{} took {}ms", reqId, tookMs);'}
                  style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5 }}
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>reads</span>
                  {([['slf4j', 'SLF4J {}'], ['printf', 'printf %s'], ['fstring', 'python f-string'], ['plain', 'plain text']] as const)
                    .map(([k, label]) => (
                      <BadgeChipView key={k} size="xs" tone={dialects[k] ? LOGGERS : 'var(--color-text-muted)'}
                                     title={dialects[k] ? 'Recognised in what you pasted' : 'Read when it appears'}
                                     style={{ opacity: dialects[k] || !paste.trim() ? 1 : 0.5 }}>
                        {label}
                      </BadgeChipView>
                    ))}
                </div>
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void takeFile(f);
                  }}
                  className="flex items-center gap-3 px-3 py-3 rounded-md"
                  style={{
                    border: `1px dashed ${dragging ? LOGGERS : 'var(--color-surface-border)'}`,
                    background: dragging ? LOGGERS_SOFT : 'transparent',
                  }}
                >
                  <UploadIcon size={IconSize.row} color={dragging ? LOGGERS : 'var(--color-text-muted)'} />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-[10px] font-bold" style={{ letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
                      OR DROP A FILE
                    </span>
                    <span className="text-[11px] truncate" style={{ color: 'var(--color-text-secondary)' }}>
                      {dropped ?? 'BcblClient.java · a .log sample · a list of message templates'}
                    </span>
                  </div>
                  <ButtonView size="xs" variant="secondary" onClick={() => fileRef.current?.click()}>Choose a file</ButtonView>
                  <input ref={fileRef} type="file" className="hidden"
                         onChange={e => { const f = e.target.files?.[0]; if (f) void takeFile(f); e.target.value = ''; }} />
                </div>
                <Note>
                  The log never carries the {'{}'} — it carries the value. Daakia keeps the fixed text around each
                  hole and names the hole after the argument, so the line is found however the value changes, and the
                  value itself becomes a field you can filter and group by.
                </Note>
              </>
            )}

            {tab === 'learn' && (
              <>
                <div className="flex items-center gap-2">
                  <Label>{learnFrom ? `SHAPES IN ${dropped ?? 'THE DROPPED FILE'}` : 'SHAPES IN THIS POD’S LAST 2 HOURS'}</Label>
                  <div className="flex-1" />
                  {learnFrom && (
                    <ButtonView size="xs" variant="ghost" onClick={() => { setLearnFrom(undefined); setDropped(undefined); }}>
                      Use this pod instead
                    </ButtonView>
                  )}
                </div>
                <FilterInputView value={learnQuery} onChange={setLearnQuery} placeholder="Filter" size="sm" accentColor={LOGGERS} />
                <div className="flex-1 min-h-0 overflow-auto rounded-md" style={{ border: '1px solid var(--color-surface-border)' }}>
                  {shapes.length === 0 && (
                    <div className="px-3 py-3 text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
                      No lines to learn from — open the Logs tab and fetch some, or drop a .log file on the Paste tab.
                    </div>
                  )}
                  {shapes
                    .filter(s => !learnQuery.trim() || s.pattern.template.toLowerCase().includes(learnQuery.trim().toLowerCase()))
                    .map(s => (
                      <div key={s.pattern.template} className="flex items-center gap-2 px-2.5 py-1"
                           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                        <CheckboxView checked={learnPicked.has(s.pattern.template)} size="sm" accentColor={LOGGERS}
                                      onChange={() => setLearnPicked(prev => {
                                        const next = new Set(prev);
                                        if (next.has(s.pattern.template)) next.delete(s.pattern.template);
                                        else next.add(s.pattern.template);
                                        return next;
                                      })} />
                        <span className="flex-1 min-w-0 truncate font-mono text-[11px]" title={s.sample}>
                          <PatternTemplate template={s.pattern.template} />
                        </span>
                        <span className="text-[11px] font-mono" style={{ color: 'var(--color-text-muted)' }}>{s.count}</span>
                        <ButtonView size="xs" variant="ghost" title="Name the holes yourself"
                                    onClick={() => { setHandTemplate(s.pattern.template); setTab('hand'); }}>
                          Edit
                        </ButtonView>
                      </div>
                    ))}
                </div>
                <Note>
                  Every id and number in a line becomes a hole, and lines with the same shape are one pattern. The
                  holes are named value1, value2 — Edit gives them names that mean something.
                </Note>
              </>
            )}

            {tab === 'hand' && (
              <>
                <Label>THE MESSAGE, WITH ITS HOLES NAMED</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <TextInputView
                      value={handTemplate}
                      onChange={e => setHandTemplate(e.target.value)}
                      placeholder="checking bcbl api for request:{reqId}"
                      size="md"
                      accentColor={LOGGERS}
                      width="fullWidth"
                      style={{ fontFamily: 'var(--font-mono, monospace)' }}
                    />
                  </div>
                  <SelectInputView value={handLevel} onChange={setHandLevel} size="md" accentColor={LOGGERS}
                                   options={['none', 'error', 'warn', 'info', 'debug', 'trace']
                                     .map(l => ({ value: l, label: l === 'none' ? 'no level' : l.toUpperCase() }))} />
                </div>
                <Note>
                  Write the fixed words as they appear in the log, and put a name in braces where the value goes:
                  {' '}<code>{'order {orderId} rejected: {reason}'}</code>. A bare <code>{'{}'}</code> or <code>%s</code> works
                  too, and is named arg1, arg2.
                </Note>
              </>
            )}
          </div>

          {/* ── Right: WHAT THAT MATCHES ── */}
          <div className="flex flex-col flex-1 min-w-0 min-h-0 gap-2.5">
            <div className="flex items-baseline gap-2">
              <Label>WHAT THAT MATCHES</Label>
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                tested against the last 2 hours on this pod
              </span>
            </div>
            <div className="flex flex-col flex-1 min-h-0 rounded-md overflow-hidden"
                 style={{ border: '1px solid var(--color-surface-border)' }}>
              <div className="grid gap-3 px-3 py-1.5 shrink-0 text-[10px] font-bold"
                   style={{ gridTemplateColumns: GRID, letterSpacing: '0.05em', color: 'var(--color-text-muted)',
                            borderBottom: '1px solid var(--color-surface-border)' }}>
                <div /><div>PATTERN &amp; FIELDS</div><div>LEVEL</div><div style={{ textAlign: 'right' }}>MATCHES 2H</div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                {tested.length === 0 && (
                  <div className="px-3 py-3 text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
                    {tab === 'paste' ? 'Paste logger calls on the left.' : tab === 'learn' ? 'Tick the shapes to keep.' : 'Write a template on the left.'}
                  </div>
                )}
                {tested.map(t => {
                  const note = noteFor(t);
                  const existing = existingTemplates.has(t.key);
                  const lv = t.pattern.level?.toUpperCase();
                  return (
                    <div key={t.key}
                         onClick={() => setSelected(t.key)}
                         className="grid gap-3 items-start px-3 py-2 cursor-pointer"
                         style={{
                           gridTemplateColumns: GRID, borderBottom: '1px solid var(--color-surface-border)',
                           background: selected === t.key ? LOGGERS_SOFT : 'transparent',
                           opacity: existing ? 0.5 : 1,
                         }}>
                      <span onClick={e => e.stopPropagation()} className="inline-flex pt-0.5">
                        <CheckboxView checked={!off.has(t.key) && !existing} disabled={existing} size="sm" accentColor={LOGGERS}
                                      onChange={() => setOff(prev => {
                                        const next = new Set(prev);
                                        if (next.has(t.key)) next.delete(t.key); else next.add(t.key);
                                        return next;
                                      })} />
                      </span>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-mono text-[11.5px] truncate" title={t.pattern.template}>
                          <PatternTemplate template={t.pattern.template} dim={t.count === 0} />
                        </span>
                        <span className="flex items-center gap-1 text-[11px]"
                              style={{ color: note.warn ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
                          {note.warn && <WarningTriangleIcon size={IconSize.inline} />}
                          {existing ? 'already in the catalogue' : note.text}
                          {t.pattern.logger && !existing ? <span style={{ color: 'var(--color-text-muted)' }}> · {shortName(t.pattern.logger)}</span> : null}
                        </span>
                      </div>
                      <span className="text-[10.5px] font-bold pt-0.5" style={{ color: lv ? LEVEL_COLOR[lv] : 'var(--color-text-muted)' }}>
                        {lv ?? '—'}
                      </span>
                      <span className="text-right font-mono text-[12px] pt-0.5"
                            style={{ color: t.count ? 'var(--color-text-primary)' : 'var(--color-warning)' }}>
                        {t.count.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {current && (
              <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-md shrink-0"
                   style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold" style={{ letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
                    A LINE IT MATCHED
                  </span>
                  <div className="flex-1" />
                  <ButtonView size="xs" variant="ghost" onClick={() => setShowRegex(v => !v)}
                              iconLeft={showRegex ? <EyeOffIcon size={IconSize.inline} /> : <EyeIcon size={IconSize.inline} />}>
                    {showRegex ? 'Hide what it matches on' : 'Show what it matches on'}
                  </ButtonView>
                </div>
                <span className="font-mono text-[11.5px] truncate" title={current.sample?.text}
                      style={{ color: current.sample ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                  {current.sample
                    ? [current.sample.ts !== undefined ? formatLogTime(current.sample.ts) : '', current.sample.level.toUpperCase(),
                      current.sample.logger ? shortName(current.sample.logger) : '', current.sample.text].filter(Boolean).join(' ')
                    : 'No line in the last 2 hours.'}
                </span>
                {showRegex && (
                  <code className="text-[11px] break-all" style={{ color: HOLE }}>{regexSource(current.pattern)}</code>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </ModalView>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-bold shrink-0" style={{ letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
      {children}
    </span>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[11px] leading-relaxed shrink-0" style={{ color: 'var(--color-text-muted)' }}>
      <span className="shrink-0 pt-0.5"><InfoCircleIcon size={IconSize.action} color={LOGGERS} /></span>
      <span>{children}</span>
    </div>
  );
}
