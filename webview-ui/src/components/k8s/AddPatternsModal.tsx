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
 *
 * ── Drawn to the board ──
 *
 * The Add patterns board, piece for piece: the purple header band with "into"
 * on its right, the four ways in as tabs, a 40% left column (the paste box in
 * the editor's own syntax colours, the "reads" dialect chips, OR DROP A FILE
 * as a dashed box, the note pinned to the bottom) and on the right WHAT THAT
 * MATCHES — holes as teal pills, LEVEL pills, the 2H count green when it
 * matched and amber when it did not — then A LINE IT MATCHED with its purple
 * edge, "Show what it matches on" with the regex beside it, and the footer
 * under the right column only. The Scan tab swaps in the Scan the repository
 * board and its own title, and puts its folder chip into this header.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ModalView, TextInputView, SearchInputView } from '@salilvnair/dui';
import { useK8sStore } from '../../store/k8s-store';
import { usePatternsFor, useLoggersFor, addPatterns } from '../../store/dk8s-logger-store';
import {
  parsePaste, dialectsOf, regexSource, learnShapes, numericHoles, fromPlainText, findCalls,
} from './logger-calls';
import { compilePattern, matchPattern, type LoggerPattern } from './logger-pattern';
import { linesInWindow, buildRows, shortName } from './logger-catalogue';
import { formatLogTime } from './log-view';
import { ScanRepoPane } from './ScanRepoPane';
import { ChevronRightIcon, ChevronDownIcon, MarkFlagIcon, SearchIcon } from '../../icons';
import { LOGGERS, HOLE } from './tone';
import {
  CARD, CARD_EDGE, EDGE, DIVIDER, TEXT, LABEL, QUIET, GREEN, AMBER, PICKED, PICKED_ROW, HOLE_FILL,
  SYN_VAR, SYN_CALL, SYN_STRING,
} from './loggers-tone';
import {
  DialogHead, BoardTabs, Tick, LevelPill, SectionLabel, NoteBox, Code, HolePills, Picker, BoardButton, HEAD_TYPE,
} from './loggers-parts';
import { logUiEvent } from '../../store/ui-audit-store';

type Tab = 'paste' | 'scan' | 'learn' | 'hand';

const TWO_HOURS = '2h' as const;
/** The board's table: tick 30 · PATTERN & FIELDS · LEVEL 74 · MATCHES 2H 92. */
const GRID = '30px minmax(0, 1fr) 74px 92px';

interface Tested {
  key: string;
  pattern: LoggerPattern;
  count: number;
  sample?: { text: string; ts?: number; level: string; logger?: string; fields: Record<string, string> };
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
  const [headSlot, setHeadSlot] = useState<HTMLSpanElement | null>(null);
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
        if (!sample) sample = { text: l.message ?? l.text, ts: l.ts, level: l.level, logger: l.logger, fields: hit.fields };
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

  /* The note under a pattern. Field names are set in mono teal, as the board
     sets `reqId` and `tookMs`. */
  const noteFor = (t: Tested): { text: ReactNode; warn?: boolean } => {
    if (t.count === 0) return { text: 'nothing matched here — either it never ran, or the text differs from the build in this pod', warn: true };
    if (t.pattern.exception) return { text: 'the last argument is the exception — its stack trace is folded into the match' };
    const h = t.pattern.holes;
    if (h.length === 0) {
      return {
        text: t.pattern.objectFields?.length
          ? <>fields <Field>{t.pattern.objectFields.join(', ')}</Field> — carried beside the message</>
          : 'no values in it — found by its text',
      };
    }
    if (h.length === 1) return { text: <>field <Field>{h[0]}</Field> — kept from the log, so you can filter by it</> };
    const num = t.numeric[0];
    return {
      text: num
        ? <>{h.length === 2 ? 'two' : h.length} fields — <Field>{num}</Field> reads as a number, so "slowest 10" sorts</>
        : <>{h.length} fields — <Field>{h.join(', ')}</Field></>,
    };
  };

  const actions = (
    <>
      <BoardButton h={30} onClick={onClose}>Cancel</BoardButton>
      <BoardButton h={30} tone="primary" disabled={!chosen.length} onClick={add}>
        {`Add ${chosen.length.toLocaleString()} pattern${chosen.length === 1 ? '' : 's'}`}
      </BoardButton>
    </>
  );
  const markAllTick = (
    <Tick checked={markAll} onChange={setMarkAll} color={LABEL} fontSize={11.5} label="Mark all after adding" />
  );

  return (
    <ModalView
      open
      onClose={onClose}
      size="xxl"
      height="86vh"
      elevated
      noPadding
      showCloseIcon={false}
      bodyStyle={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'hidden' }}
    >
      <DialogHead
        icon={tab === 'scan' ? <SearchIcon size={15} color={LOGGERS} /> : <MarkFlagIcon size={15} color={LOGGERS} />}
        title={tab === 'scan' ? 'Scan the repository' : 'Add patterns'}
        subtitle={tab === 'scan'
          ? 'every logger call in the source, as patterns'
          : 'what a logger can say, so a tester can look for it before it happens'}
        right={
          <>
            <span style={{ fontSize: 11.5, color: LABEL }}>into</span>
            <Picker
              value={into}
              onChange={setInto}
              mono
              height={27}
              fontSize={11.5}
              menuMinWidth={320}
              maxWidth={320}
              options={[
                { value: '', label: 'the logger each call names' },
                ...loggerNames.map(n => ({ value: n, label: n })),
              ]}
            />
            {tab === 'scan' && <span ref={setHeadSlot} className="inline-flex items-center" />}
          </>
        }
      />

      <div className="shrink-0" style={{ padding: '10px 16px 0' }}>
        <BoardTabs
          value={tab}
          onChange={setTab}
          height={30}
          padX={12}
          options={[
            { value: 'paste', label: 'Paste the code' },
            { value: 'scan', label: 'Scan the repository' },
            { value: 'learn', label: 'Learn from the log' },
            { value: 'hand', label: 'Write one by hand' },
          ]}
        />
      </div>

      {tab === 'scan' ? (
        <div className="flex flex-col flex-1 min-h-0" style={{ borderTop: `1px solid ${EDGE}` }}>
          <ScanRepoPane window={window2h} existingTemplates={existingTemplates} into={into || undefined}
                        onChosen={setScanChosen} headSlot={headSlot} extra={markAllTick} actions={actions} />
        </div>
      ) : (
        <div className="flex flex-1 min-h-0" style={{ borderTop: `1px solid ${EDGE}` }}>
          {/* ── Left: the source ── */}
          <div className="flex flex-col shrink-0 min-h-0"
               style={{ width: '40%', minWidth: 360, borderRight: `1px solid ${EDGE}` }}>
            {tab === 'paste' && (
              <>
                <SectionLabel style={{ padding: '10px 16px 6px' }}>PASTE LOGGER CALLS</SectionLabel>
                <PasteBox
                  value={paste}
                  onChange={setPaste}
                  placeholder={'log.info("checking bcbl api for request:{}", reqId);\nlog.warn("bcbl api slow for request:{} took {}ms", reqId, tookMs);'}
                />
                <div className="flex items-center flex-wrap" style={{ gap: 8, padding: '10px 16px' }}>
                  <span style={{ fontSize: 11.5, color: QUIET }}>reads</span>
                  {([['slf4j', 'SLF4J {}'], ['printf', 'printf %s'], ['fstring', 'python f-string'], ['plain', 'plain text']] as const)
                    .map(([k, label]) => (
                      <span key={k}
                            title={dialects[k] ? 'Recognised in what you pasted' : 'Read when it appears'}
                            style={{
                              padding: '2px 8px', borderRadius: 999, fontSize: 11, background: CARD,
                              color: dialects[k] ? TEXT : LABEL,
                            }}>
                        {label}
                      </span>
                    ))}
                </div>
                <SectionLabel style={{ padding: '4px 16px 8px' }}>OR DROP A FILE</SectionLabel>
                <div
                  role="button"
                  tabIndex={0}
                  title="Drop a file here, or click to choose one"
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void takeFile(f);
                  }}
                  className="shrink-0 text-center cursor-pointer truncate"
                  style={{
                    margin: '0 16px', padding: 14, borderRadius: 8, fontSize: 11.5,
                    border: `1px dashed ${dragging ? LOGGERS : CARD_EDGE}`,
                    background: dragging ? PICKED : 'transparent',
                    color: dropped ? LABEL : QUIET,
                  }}
                >
                  {dropped ?? 'BcblClient.java · a .log sample · a list of message templates'}
                </div>
                <input ref={fileRef} type="file" className="hidden"
                       onChange={e => { const f = e.target.files?.[0]; if (f) void takeFile(f); e.target.value = ''; }} />
                <div className="flex-1" />
                <NoteBox style={{ margin: '12px 16px 14px' }}>
                  The log never carries the <Code>{'{}'}</Code> &mdash; it carries the value. Daakia keeps the fixed
                  text around each hole and names the hole after the argument, so the line is found however the value
                  changes, and the value itself becomes a field you can filter and group by.
                </NoteBox>
              </>
            )}

            {tab === 'learn' && (
              <>
                <div className="flex items-center shrink-0" style={{ gap: 8, padding: '10px 16px 6px' }}>
                  <SectionLabel>{learnFrom ? `SHAPES IN ${(dropped ?? 'THE DROPPED FILE').toUpperCase()}` : 'SHAPES IN THIS POD’S LAST 2 HOURS'}</SectionLabel>
                  <div className="flex-1" />
                  {learnFrom && (
                    <BoardButton tone="quiet" onClick={() => { setLearnFrom(undefined); setDropped(undefined); }}>
                      Use this pod instead
                    </BoardButton>
                  )}
                </div>
                <div className="shrink-0" style={{ padding: '0 16px 8px' }}>
                  <SearchInputView value={learnQuery} onChange={setLearnQuery} placeholder="Filter" aria-label="Filter the shapes"
                                   size="lg" height={28}
                                   style={{ background: CARD, border: `1px solid ${EDGE}`, borderRadius: 6, paddingLeft: 10, paddingRight: 10 }} />
                </div>
                <div className="flex-1 min-h-0 overflow-auto"
                     style={{ margin: '0 16px', border: `1px solid ${EDGE}`, borderRadius: 8, background: CARD }}>
                  {shapes.length === 0 && (
                    <div style={{ padding: 12, fontSize: 11.5, color: QUIET }}>
                      No lines to learn from — open the Logs tab and fetch some, or drop a .log file on the Paste tab.
                    </div>
                  )}
                  {shapes
                    .filter(s => !learnQuery.trim() || s.pattern.template.toLowerCase().includes(learnQuery.trim().toLowerCase()))
                    .map(s => (
                      <label key={s.pattern.template} className="flex items-center cursor-pointer"
                             style={{ gap: 10, padding: '7px 11px', borderBottom: `1px solid ${DIVIDER}` }}>
                        <Tick checked={learnPicked.has(s.pattern.template)}
                              ariaLabel={`Keep ${s.pattern.template}`}
                              onChange={() => setLearnPicked(prev => {
                                const next = new Set(prev);
                                if (next.has(s.pattern.template)) next.delete(s.pattern.template);
                                else next.add(s.pattern.template);
                                return next;
                              })} />
                        <span className="flex-1 min-w-0 truncate font-mono" style={{ fontSize: 11.5 }} title={s.sample}>
                          <HolePills template={s.pattern.template} />
                        </span>
                        <span className="font-mono" style={{ fontSize: 11.5, color: QUIET }}>{s.count.toLocaleString()}</span>
                        <BoardButton tone="quiet" title="Name the holes yourself"
                                     onClick={e => { e.preventDefault(); setHandTemplate(s.pattern.template); setTab('hand'); }}>
                          Edit
                        </BoardButton>
                      </label>
                    ))}
                </div>
                <NoteBox style={{ margin: '12px 16px 14px' }}>
                  Every id and number in a line becomes a hole, and lines with the same shape are one pattern. The
                  holes are named value1, value2 — Edit gives them names that mean something.
                </NoteBox>
              </>
            )}

            {tab === 'hand' && (
              <>
                <SectionLabel style={{ padding: '10px 16px 6px' }}>THE MESSAGE, WITH ITS HOLES NAMED</SectionLabel>
                <div className="flex items-center shrink-0" style={{ gap: 8, padding: '0 16px' }}>
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
                  <Picker lead="Level" value={handLevel} onChange={setHandLevel}
                          options={['none', 'error', 'warn', 'info', 'debug', 'trace']
                            .map(l => ({ value: l, label: l === 'none' ? 'not set' : l.toUpperCase() }))} />
                </div>
                <div className="flex-1" />
                <NoteBox style={{ margin: '12px 16px 14px' }}>
                  Write the fixed words as they appear in the log, and put a name in braces where the value goes:
                  {' '}<Code>{'order {orderId} rejected: {reason}'}</Code>. A bare <Code>{'{}'}</Code> or <Code>%s</Code> works
                  too, and is named arg1, arg2.
                </NoteBox>
              </>
            )}
          </div>

          {/* ── Right: WHAT THAT MATCHES ── */}
          <div className="flex flex-col flex-1 min-w-0 min-h-0">
            <div className="flex items-center shrink-0" style={{ gap: 8, padding: '10px 16px 6px' }}>
              <SectionLabel>WHAT THAT MATCHES</SectionLabel>
              <span className="truncate" style={{ fontSize: 11, color: QUIET }}>tested against the last 2 hours on this pod</span>
              <div className="flex-1" />
              {markAllTick}
            </div>

            <div className="flex flex-col min-h-0 overflow-hidden"
                 style={{ flex: '0 1 auto', margin: '0 16px', border: `1px solid ${EDGE}`, borderRadius: 8, background: CARD }}>
              <div className="grid shrink-0"
                   style={{ ...HEAD_TYPE, fontSize: 10, gridTemplateColumns: GRID, gap: 10, padding: '7px 11px', borderBottom: `1px solid ${EDGE}` }}>
                <div /><div>PATTERN &amp; FIELDS</div><div>LEVEL</div><div style={{ textAlign: 'right' }}>MATCHES 2H</div>
              </div>
              <div className="min-h-0 overflow-auto">
                {tested.length === 0 && (
                  <div style={{ padding: '12px 11px', fontSize: 11.5, color: QUIET }}>
                    {tab === 'paste' ? 'Paste logger calls on the left.' : tab === 'learn' ? 'Tick the shapes to keep.' : 'Write a template on the left.'}
                  </div>
                )}
                {tested.map((t, i) => {
                  const note = noteFor(t);
                  const existing = existingTemplates.has(t.key);
                  return (
                    <div key={t.key}
                         onClick={() => setSelected(t.key)}
                         className="grid items-start cursor-pointer"
                         style={{
                           gridTemplateColumns: GRID, gap: 10, padding: '9px 11px',
                           borderBottom: i === tested.length - 1 ? 'none' : `1px solid ${DIVIDER}`,
                           background: selected === t.key ? PICKED_ROW : 'transparent',
                           opacity: existing ? 0.5 : 1,
                         }}>
                      <span className="inline-flex" style={{ marginTop: 2 }}>
                        <Tick checked={!off.has(t.key) && !existing} disabled={existing}
                              ariaLabel={`Add ${t.pattern.template}`}
                              onChange={() => setOff(prev => {
                                const next = new Set(prev);
                                if (next.has(t.key)) next.delete(t.key); else next.add(t.key);
                                return next;
                              })} />
                      </span>
                      <div className="min-w-0">
                        <div className="font-mono truncate" style={{ fontSize: 12 }} title={t.pattern.template}>
                          <HolePills template={t.pattern.template} />
                        </div>
                        <div className="truncate" style={{ marginTop: 4, fontSize: 11, color: note.warn && !existing ? AMBER : QUIET }}>
                          {existing ? 'already in the catalogue' : note.text}
                          {t.pattern.logger && !existing ? <span style={{ color: QUIET }}> · {shortName(t.pattern.logger)}</span> : null}
                        </div>
                      </div>
                      <div><LevelPill level={t.pattern.level} /></div>
                      <div className="text-right font-mono" style={{ fontSize: 12, color: t.count ? GREEN : AMBER }}>
                        {t.count.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {current && (
              <>
                <SectionLabel style={{ padding: '12px 16px 6px' }}>A LINE IT MATCHED</SectionLabel>
                <div className="shrink-0 font-mono truncate"
                     title={current.sample?.text}
                     style={{
                       margin: '0 16px', padding: '9px 12px', border: `1px solid ${EDGE}`, borderLeft: `2px solid ${LOGGERS}`,
                       borderRadius: 8, background: CARD, fontSize: 11.5, lineHeight: 1.7,
                       color: current.sample ? TEXT : QUIET,
                     }}>
                  {current.sample
                    ? (
                      <>
                        <span style={{ color: QUIET }}>
                          {[current.sample.ts !== undefined ? formatLogTime(current.sample.ts) : '',
                            current.sample.level.toUpperCase().padEnd(5, ' '),
                            current.sample.logger ? shortName(current.sample.logger) : ''].filter(Boolean).join(' ')}{' '}
                        </span>
                        <SampleText text={current.sample.text} pattern={current.pattern} fields={current.sample.fields} />
                      </>
                    )
                    : 'No line in the last 2 hours.'}
                </div>
                <div className="flex items-start shrink-0" style={{ gap: 8, padding: '10px 16px 0' }}>
                  <BoardButton h={26} tone="quiet" onClick={() => setShowRegex(v => !v)} aria-expanded={showRegex}
                               className="shrink-0"
                               iconLeft={showRegex ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />}>
                    Show what it matches on
                  </BoardButton>
                  <span className={`font-mono min-w-0${showRegex ? ' break-all' : ' truncate'}`}
                        title={regexSource(current.pattern)}
                        style={{ fontSize: 11, lineHeight: '26px', color: showRegex ? LABEL : QUIET }}>
                    {regexSource(current.pattern)}
                  </span>
                </div>
              </>
            )}

            <div className="flex-1" />

            {/* ── Footer, under the right column only ── */}
            <div className="flex items-center shrink-0"
                 style={{ gap: 10, marginTop: 12, padding: '14px 16px', borderTop: `1px solid ${EDGE}` }}>
              <span className="truncate" style={{ fontSize: 11.5, color: QUIET, fontVariantNumeric: 'tabular-nums' }}>
                {tested.length} pattern{tested.length === 1 ? '' : 's'} &middot; {matching} match here &middot; {tested.length - matching} silent
              </span>
              <div className="flex-1" />
              {actions}
            </div>
          </div>
        </div>
      )}
    </ModalView>
  );
}

/** A field's name inside a note, in mono teal — `reqId`. */
function Field({ children }: { children: ReactNode }) {
  return <span className="font-mono" style={{ color: HOLE }}>{children}</span>;
}

/**
 * The matched line's message with each hole's VALUE on a teal pill —
 * `A-4470` where the template says `reqId` — found left to right, so a value
 * that also appears in the fixed text is pilled where the hole put it.
 */
function SampleText({ text, pattern, fields }: { text: string; pattern: LoggerPattern; fields: Record<string, string> }) {
  const out: ReactNode[] = [];
  let at = 0;
  pattern.holes.forEach((name, i) => {
    const value = fields[name];
    if (!value) return;
    const idx = text.indexOf(value, at);
    if (idx < 0) return;
    if (idx > at) out.push(text.slice(at, idx));
    out.push(
      <span key={`h${i}`} style={{ padding: '0 5px', borderRadius: 4, color: HOLE, background: HOLE_FILL }}>{value}</span>,
    );
    at = idx + value.length;
  });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

// ── The paste box ────────────────────────────────────────────────────────────

/*
  Strings, then a name directly before `(` (a call), then any other name (a
  variable). Everything else — dots, commas, parentheses — stays text colour.
  Deliberately small: it colours what the board colours and nothing else, and
  it never has to be right about a language, only about what a logger call
  looks like.
*/
const TOKEN = /("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/g;

function highlight(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const color = m[1] ? SYN_STRING : m[2] ? SYN_CALL : SYN_VAR;
    out.push(<span key={m.index} style={{ color }}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * The board's paste box: the calls in the editor's own colours — the logger
 * and the arguments light blue, the method yellow, the message orange — on the
 * card colour at 12/21 mono.
 *
 * A textarea cannot colour its own text, so the colours are a `<pre>` drawn
 * exactly behind a transparent textarea with the same font, padding and line
 * height; the caret and the selection are the textarea's, the colour is the
 * pre's, and scrolling one scrolls the other. The box resizes from its corner
 * like any other text box.
 *
 * Long calls wrap rather than scroll sideways. Both layers wrap the same way
 * only if they are the same width, so both reserve the scrollbar's gutter —
 * the pre never shows a scrollbar, but it keeps the room one would take.
 *
 * The light theme's catch-all gives every textarea an opaque fill and a text
 * colour with `!important`, which covers the pre — so there the box is a
 * plain, readable text box without the colours, rather than a broken one.
 */
function PasteBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const pre = useRef<HTMLPreElement>(null);
  const metrics = {
    margin: 0, padding: '10px 12px', fontSize: 12, lineHeight: '21px',
    whiteSpace: 'pre-wrap' as const, overflowWrap: 'anywhere' as const, wordBreak: 'normal' as const,
    scrollbarGutter: 'stable' as const, tabSize: 4, border: 'none',
  };
  return (
    <div className="relative shrink-0 overflow-hidden"
         style={{ margin: '0 16px', height: 190, minHeight: 84, resize: 'vertical', border: `1px solid ${EDGE}`, borderRadius: 8, background: CARD }}>
      <pre ref={pre} aria-hidden className="font-mono absolute inset-0 overflow-hidden pointer-events-none"
           style={{ ...metrics, color: TEXT }}>
        {highlight(value)}{'\n '}
      </pre>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onScroll={e => { if (pre.current) pre.current.scrollTop = e.currentTarget.scrollTop; }}
        placeholder={placeholder}
        spellCheck={false}
        wrap="soft"
        aria-label="Paste logger calls"
        className="font-mono absolute inset-0 w-full h-full overflow-y-auto overflow-x-hidden"
        style={{
          ...metrics, resize: 'none', outline: 'none', background: 'transparent',
          color: 'transparent', caretColor: TEXT,
        }}
      />
    </div>
  );
}
