/**
 * Scan the repository — every logger call in the source, as patterns.
 *
 * The Add patterns page's second tab. It replaces the old scan dialog, and
 * reads the project through the same host walk Add loggers uses, so a call
 * arrives already filed under the logger it writes through.
 *
 * ── Why some arrive switched off ──
 *
 * A Spring Boot service has several hundred calls, and adding all of them
 * makes a catalogue nobody reads. DEBUG and TRACE, tests, and any message
 * glued together from strings start off — the last because it has no fixed
 * shape to match on once somebody edits either half. Everything else starts
 * on; the reader turns off what they disagree with and presses Add once.
 *
 * The counts are the useful part: "566 found · 441 on · 125 left off · 96
 * already in the catalogue" is the honest summary of what a scan means.
 *
 * ── Drawn to the board ──
 *
 * The Scan the repository board is a whole page: the folder and Rescan in the
 * header band, the languages found as round chips with their colour squares,
 * a 300px WHERE THEY ARE rail on the card colour, the EXTRACTED PATTERNS table
 * with a switch per call, the two notes, and a footer that holds the counts
 * and the Add button under the table only. Here it is a tab of Add patterns,
 * so the header band is Add patterns' own: the folder chip and Rescan are
 * portalled into it (`headSlot`), and the footer's buttons are handed in
 * (`actions`) so they sit where the board puts them.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { postMsg } from '../../vscode';
import { fromAnyCall, reasonOff } from './logger-calls';
import { compilePattern, matchPattern, type LoggerPattern } from './logger-pattern';
import { shortName } from './logger-catalogue';
import type { ProjectReadMsg, ScanHitMsg } from './add-loggers';
import type { LogLine } from '../../store/k8s-store';
import { FolderFlatIcon } from '../../icons';
import { LOGGERS, HOLE } from './tone';
import {
  PANEL, CARD, EDGE, DIVIDER, TEXT, LABEL, QUIET, GREEN, AMBER, RED, LANG_SWATCH, tint,
} from './loggers-tone';
import { Tick, LevelPill, SectionLabel, HolePills, BoardButton, HEAD_TYPE } from './loggers-parts';

type Lang = ScanHitMsg['language'];

const LANG_LABEL: Record<Lang, string> = {
  java: 'Java · SLF4J', python: 'Python · logging', node: 'Node · pino, winston', go: 'Go · slog',
};

interface ScanCandidate {
  key: string;
  hit: ScanHitMsg;
  pattern: LoggerPattern;
  reason?: string;
  /** Which WHERE THEY ARE group it is under. */
  group: string;
  /** The file, relative to its group. */
  file: string;
  existing: boolean;
}

/** `src/main/java/com/acme/bcbl/BcblClient.java` → group `src/main/java`, file `bcbl/BcblClient.java`. */
function placeOf(path: string, language: Lang): { group: string; file: string } {
  const p = path.replace(/\\/g, '/');
  const root = /^(.*?\/(?:java|kotlin|scala|groovy))\//.exec(p);
  if (root && language === 'java') {
    const rest = p.slice(root[1].length + 1).split('/');
    return { group: root[1], file: rest.slice(-2).join('/') };
  }
  const parts = p.split('/');
  if (parts.length === 1) return { group: '.', file: parts[0] };
  return { group: `${parts[0]}/ (${language})`, file: parts.slice(1).slice(-2).join('/') };
}

/** The board's table: EXTRACT 52 · PATTERN · LOGGER 150 · LEVEL 66 · SEEN 2H 74. */
const GRID = '52px minmax(0, 1fr) minmax(90px, 150px) 66px 74px';
/** The rail's rows: tick 26 · name · count 42. */
const RAIL_GRID = '26px minmax(0, 1fr) 42px';

export function ScanRepoPane({ window: lines, existingTemplates, into, onChosen, headSlot, extra, actions }: {
  /** The buffer's lines in the window, for SEEN 2H. */
  window: LogLine[];
  existingTemplates: Set<string>;
  /** The logger chosen in "into", when the scan should file everything there. */
  into?: string;
  onChosen: (patterns: LoggerPattern[]) => void;
  /** Where the folder chip and Rescan go — the dialog's header band. Inline at the top without one. */
  headSlot?: HTMLElement | null;
  /** Beside All on / All off: the dialog's "Mark all after adding". */
  extra?: ReactNode;
  /** The footer's buttons, right of the counts. */
  actions?: ReactNode;
}) {
  const [folder, setFolder] = useState('');
  const [read, setRead] = useState<ProjectReadMsg | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [langsOff, setLangsOff] = useState<Set<Lang>>(() => new Set());
  const [skipDebug, setSkipDebug] = useState(true);
  const [skipTests, setSkipTests] = useState(true);
  const [groupsOff, setGroupsOff] = useState<Set<string>>(() => new Set());
  const [filesOff, setFilesOff] = useState<Set<string>>(() => new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  /** Per-call choices that differ from the default. */
  const [override, setOverride] = useState<Map<string, boolean>>(() => new Map());
  const reqRef = useRef('');

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type !== 'dk8s:projectRead' || msg.reqId !== reqRef.current) return;
      setBusy(false);
      if (msg.cancelled) return;
      if (msg.error) { setError(String(msg.error)); return; }
      setError(undefined);
      setRead(msg as ProjectReadMsg);
      setFolder(msg.folder);
      setOverride(new Map());
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const scan = (path: string) => {
    reqRef.current = `scan-${Date.now()}`;
    setBusy(true);
    setError(undefined);
    postMsg({ type: 'dk8s:readProject', reqId: reqRef.current, folder: path.trim() });
  };

  /* Every call that parses, once per message. A call the parser will not
     take is a call the catalogue cannot use, so it is not counted as found. */
  const candidates = useMemo<ScanCandidate[]>(() => {
    if (!read) return [];
    const seen = new Set<string>();
    const out: ScanCandidate[] = [];
    for (const hit of read.hits) {
      const pattern = fromAnyCall(hit.code);
      if (!pattern || seen.has(pattern.template)) continue;
      seen.add(pattern.template);
      const place = placeOf(hit.file, hit.language);
      out.push({
        key: `${hit.file}:${hit.line}`, hit,
        pattern: { ...pattern, logger: into ?? hit.logger ?? pattern.logger, source: 'scan' },
        reason: reasonOff(pattern, hit.test),
        group: place.group, file: place.file,
        existing: existingTemplates.has(pattern.template),
      });
    }
    return out;
  }, [read, existingTemplates, into]);

  const langCounts = useMemo(() => {
    const m = new Map<Lang, number>();
    for (const c of candidates) m.set(c.hit.language, (m.get(c.hit.language) ?? 0) + 1);
    return m;
  }, [candidates]);

  const inScope = (c: ScanCandidate) =>
    !langsOff.has(c.hit.language) && !groupsOff.has(c.group) && !filesOff.has(`${c.group}|${c.file}`)
    && (!skipTests || !c.hit.test);

  const defaultOn = (c: ScanCandidate) => {
    if (!c.reason) return true;
    if (c.reason === 'test source') return !skipTests;
    if (c.reason === 'DEBUG' || c.reason === 'TRACE') return !skipDebug;
    return false;
  };
  const isOn = (c: ScanCandidate) => !c.existing && inScope(c) && (override.get(c.key) ?? defaultOn(c));

  const shown = candidates.filter(inScope);
  const on = shown.filter(isOn);

  /* SEEN 2H — each shown pattern against the window. The needle check in
     `matchPattern` keeps this to a substring test for nearly every line. */
  const seen = useMemo(() => {
    const counts = new Map<string, number>();
    if (!lines.length) return counts;
    for (const c of shown.slice(0, 800)) {
      const compiled = compilePattern(c.pattern);
      let n = 0;
      for (const l of lines) if (!l.continuation && matchPattern(compiled, l.message ?? l.text)) n++;
      counts.set(c.key, n);
    }
    return counts;
    // `shown` is derived every render; its content is what the deps describe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, lines, langsOff, groupsOff, filesOff, skipTests]);

  useEffect(() => {
    onChosen(on.map(c => c.pattern));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, override, langsOff, groupsOff, filesOff, skipDebug, skipTests]);

  /* WHERE THEY ARE: groups, then files, each with a count and a switch. */
  const tree = useMemo(() => {
    const groups = new Map<string, Map<string, number>>();
    for (const c of candidates) {
      if (langsOff.has(c.hit.language) || (skipTests && c.hit.test)) continue;
      const files = groups.get(c.group) ?? new Map<string, number>();
      files.set(c.file, (files.get(c.file) ?? 0) + 1);
      groups.set(c.group, files);
    }
    return [...groups.entries()].map(([group, files]) => ({
      group,
      count: [...files.values()].reduce((a, b) => a + b, 0),
      files: [...files.entries()].sort((a, b) => b[1] - a[1]),
    }));
  }, [candidates, langsOff, skipTests]);

  const setAll = (value: boolean) => setOverride(prev => {
    const next = new Map(prev);
    for (const c of shown) next.set(c.key, value);
    return next;
  });

  const toggleSet = <T,>(set: Set<T>, v: T): Set<T> => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    return next;
  };

  const leftOff = shown.filter(c => !c.existing && !isOn(c)).length;
  const already = shown.filter(c => c.existing).length;

  /* The header band's folder chip — also where a path is typed; Enter scans
     it — and Rescan. Before the first scan the chip's folder icon, and a
     "Choose a folder…" beside it, open the host's folder picker. */
  const folderControls = (
    <span className="inline-flex items-center" style={{ gap: 10 }}>
      <label className="inline-flex items-center min-w-0"
             title="The repository's folder — type a path and press Enter, or choose one"
             style={{
               gap: 7, height: 27, padding: '0 10px', borderRadius: 6, maxWidth: 360,
               border: `1px solid ${EDGE}`, background: CARD,
             }}>
        <button type="button" onClick={() => scan('')} disabled={busy} title="Choose a folder…"
                aria-label="Choose a folder"
                className="inline-flex shrink-0 cursor-pointer"
                style={{ border: 'none', background: 'none', padding: 0, color: QUIET }}>
          <FolderFlatIcon size={12} />
        </button>
        <input
          value={folder}
          onChange={e => setFolder(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && folder.trim()) scan(folder); }}
          placeholder="the repository's folder"
          spellCheck={false}
          aria-label="The repository's folder"
          className="font-mono min-w-0"
          style={{
            width: `${Math.max(folder.length, 22) + 1}ch`, maxWidth: '100%',
            border: 'none', outline: 'none', background: 'transparent', padding: 0, fontSize: 11.5, color: TEXT,
          }}
        />
      </label>
      {!read && (
        <BoardButton h={27} tone="quiet" disabled={busy} onClick={() => scan('')} style={{ padding: '0 11px' }}>
          Choose a folder&hellip;
        </BoardButton>
      )}
      <BoardButton h={27} tone="quiet" disabled={busy || !folder.trim()} onClick={() => scan(folder)}
                   style={{ padding: '0 11px' }}>
        {busy ? 'Scanning…' : read ? 'Rescan' : 'Scan'}
      </BoardButton>
    </span>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {headSlot ? createPortal(folderControls, headSlot) : (
        <div className="flex items-center shrink-0" style={{ padding: '10px 16px 0' }}>{folderControls}</div>
      )}

      {/* ── found: the languages, and the two defaults ── */}
      <div className="flex items-center flex-wrap shrink-0"
           style={{ gap: 8, padding: '11px 16px', borderBottom: `1px solid ${EDGE}` }}>
        <span style={{ fontSize: 11.5, color: QUIET }}>
          {busy ? 'Scanning…' : read ? 'found' : 'Nothing scanned yet.'}
        </span>
        {(['java', 'python', 'node', 'go'] as Lang[]).filter(l => langCounts.has(l)).map(l => {
          const active = !langsOff.has(l);
          return (
            <button key={l} type="button" aria-pressed={active}
                    onClick={() => setLangsOff(s => toggleSet(s, l))}
                    title={active ? 'Leave these out' : 'Take these too'}
                    className="inline-flex items-center cursor-pointer"
                    style={{
                      gap: 7, height: 27, padding: '0 11px', borderRadius: 999, fontSize: 12,
                      border: `1px solid ${active ? LOGGERS : EDGE}`,
                      background: active ? tint(LOGGERS, 14) : 'none',
                      color: active ? TEXT : LABEL,
                    }}>
              <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: 2, background: LANG_SWATCH[l] }} />
              {LANG_LABEL[l]}
              <span style={{ color: active ? LABEL : QUIET }}>{langCounts.get(l)!.toLocaleString()}</span>
            </button>
          );
        })}
        <div className="flex-1" />
        <Tick checked={skipDebug} onChange={setSkipDebug} color={LABEL} fontSize={11.5} label="Skip DEBUG and TRACE" />
        <Tick checked={skipTests} onChange={setSkipTests} color={LABEL} fontSize={11.5} label="Skip tests" />
      </div>

      {error && (
        <div className="shrink-0" style={{ padding: '8px 16px', fontSize: 11.5, color: RED, borderBottom: `1px solid ${EDGE}` }}>
          {error}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* ── WHERE THEY ARE ── */}
        <div className="flex flex-col shrink-0 min-h-0"
             style={{ width: 300, maxWidth: '32%', borderRight: `1px solid ${EDGE}`, background: CARD }}>
          <SectionLabel style={{ padding: '11px 14px 7px' }}>WHERE THEY ARE</SectionLabel>
          <div className="flex-1 min-h-0 overflow-auto" style={{ padding: '0 8px' }}>
            {tree.map((g, gi) => {
              const open = !collapsed.has(g.group);
              const groupOn = !groupsOff.has(g.group);
              return (
                <div key={g.group} style={{ marginTop: gi ? 4 : 0 }}>
                  <div className="grid items-center" style={{ gridTemplateColumns: RAIL_GRID, gap: 6, padding: '5px 6px', borderRadius: 6 }}>
                    <Tick checked={groupOn} onChange={() => setGroupsOff(s => toggleSet(s, g.group))}
                          ariaLabel={`All of ${g.group}`} />
                    {/* The name folds and unfolds its files. */}
                    <button type="button" onClick={() => setCollapsed(s => toggleSet(s, g.group))}
                            aria-expanded={open} title={open ? 'Fold' : 'Show its files'}
                            className="font-mono truncate text-left cursor-pointer"
                            style={{ border: 'none', background: 'none', padding: 0, fontSize: 11.5, color: groupOn ? TEXT : QUIET }}>
                      {g.group}
                    </button>
                    <span className="text-right" style={{ fontSize: 11, color: QUIET }}>{g.count.toLocaleString()}</span>
                  </div>
                  {open && g.files.map(([file, n]) => {
                    const fileOn = groupOn && !filesOff.has(`${g.group}|${file}`);
                    return (
                      <div key={file} className="grid items-center"
                           style={{ gridTemplateColumns: RAIL_GRID, gap: 6, padding: '5px 6px 5px 22px' }}>
                        <Tick checked={fileOn} disabled={!groupOn} ariaLabel={file}
                              onChange={() => setFilesOff(s => toggleSet(s, `${g.group}|${file}`))} />
                        <span className="font-mono truncate" title={file}
                              style={{ fontSize: 11.5, color: fileOn ? LABEL : QUIET }}>{file}</span>
                        <span className="text-right" style={{ fontSize: 11, color: QUIET }}>{n.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="shrink-0"
               style={{ padding: '11px 14px', borderTop: `1px solid ${EDGE}`, fontSize: 11, lineHeight: 1.6, color: QUIET }}>
            The repository is read where it sits. Nothing is sent anywhere, and nothing is written to it.
          </div>
        </div>

        {/* ── EXTRACTED PATTERNS ── */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <div className="flex items-center shrink-0" style={{ gap: 10, padding: '10px 16px 8px' }}>
            <SectionLabel>EXTRACTED PATTERNS</SectionLabel>
            <span className="truncate" style={{ fontSize: 11, color: QUIET }}>toggle any one off and it is not added</span>
            <div className="flex-1" />
            {extra}
            <BoardButton tone="quiet" onClick={() => setAll(true)} disabled={!shown.length}>All on</BoardButton>
            <BoardButton tone="quiet" onClick={() => setAll(false)} disabled={!shown.length}>All off</BoardButton>
          </div>

          <div className="flex flex-col min-h-0 overflow-hidden"
               style={{ flex: '0 1 auto', margin: '0 16px', border: `1px solid ${EDGE}`, borderRadius: 8, background: CARD }}>
            <div className="grid shrink-0"
                 style={{ ...HEAD_TYPE, fontSize: 10, gridTemplateColumns: GRID, gap: 10, padding: '7px 12px', borderBottom: `1px solid ${EDGE}` }}>
              <div>EXTRACT</div><div>PATTERN</div><div>LOGGER</div><div>LEVEL</div><div style={{ textAlign: 'right' }}>SEEN 2H</div>
            </div>
            <div className="min-h-0 overflow-auto">
              {shown.length === 0 && (
                <div style={{ padding: '12px', fontSize: 11.5, color: QUIET }}>
                  {read
                    ? 'No logger calls here. If the source is somewhere else in the tree, point at that folder.'
                    : 'Point it at the service’s source — Java, Kotlin, Python, JavaScript, TypeScript and Go are read; build output and dependencies are not.'}
                </div>
              )}
              {shown.map((c, i) => {
                const active = isOn(c);
                const lv = c.pattern.level?.toUpperCase();
                const n = seen.get(c.key);
                const noCount = n === undefined || c.reason === 'DEBUG' || c.reason === 'TRACE' || c.pattern.glued;
                return (
                  <div key={c.key} className="grid items-center"
                       style={{
                         gridTemplateColumns: GRID, gap: 10, padding: '9px 12px',
                         borderBottom: i === shown.length - 1 ? 'none' : `1px solid ${DIVIDER}`,
                         opacity: active ? 1 : 0.55,
                       }}
                       title={`${c.hit.file}:${c.hit.line}\n${c.hit.code}`}>
                    <Switch on={active} disabled={c.existing}
                            label={`Extract ${c.pattern.template}`}
                            onChange={v => setOverride(prev => new Map(prev).set(c.key, v))} />
                    <div className="min-w-0 truncate font-mono" style={{ fontSize: 11.5 }}>
                      {c.pattern.glued
                        ? (
                          <span style={{ color: QUIET }}>
                            {c.hit.code.replace(/^[^(]*\(|\)$/g, '')}
                            {' '}<span style={{ color: AMBER }}>&mdash; {c.reason}</span>
                          </span>
                        )
                        : <HolePills template={c.pattern.template} dim={!active} padX={4} />}
                      {c.pattern.objectFields?.length ? (
                        <span style={{ color: QUIET }}> · fields <span style={{ color: HOLE }}>{c.pattern.objectFields.join(', ')}</span></span>
                      ) : null}
                      {c.existing && <span style={{ color: QUIET }}> · already in the catalogue</span>}
                    </div>
                    <div className="truncate font-mono" style={{ fontSize: 11, color: active ? LABEL : QUIET }}>
                      {c.pattern.logger ? shortName(c.pattern.logger) : '—'}
                    </div>
                    <div><LevelPill level={lv} small /></div>
                    <div className="text-right font-mono" style={{ fontSize: 11.5, color: !noCount && n ? GREEN : QUIET }}>
                      {noCount ? <>&mdash;</> : n.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── The two notes ── */}
          <div className="flex shrink-0" style={{ gap: 10, margin: '12px 16px 0' }}>
            <div className="flex-1 min-w-0"
                 style={{ padding: '9px 11px', border: `1px solid ${EDGE}`, borderRadius: 8, background: CARD }}>
              <SectionLabel style={{ display: 'block', marginBottom: 5 }}>WHAT EACH LANGUAGE GIVES</SectionLabel>
              <div className="font-mono" style={{ fontSize: 11, lineHeight: 1.8, color: LABEL }}>
                <div className="truncate">Java <span style={{ color: QUIET }}>log.info("&hellip;{'{}'}&hellip;", reqId)</span> &rarr; hole named <span style={{ color: HOLE }}>reqId</span></div>
                <div className="truncate">Python <span style={{ color: QUIET }}>log.info("&hellip;%s", req_id)</span> / f-string &rarr; <span style={{ color: HOLE }}>req_id</span></div>
                <div className="truncate">Node <span style={{ color: QUIET }}>log.info({'{ orderId }'}, "&hellip;")</span> &rarr; field <span style={{ color: HOLE }}>orderId</span></div>
              </div>
            </div>
            <div className="shrink-0"
                 style={{ width: 330, maxWidth: '45%', padding: '9px 11px', border: `1px solid ${EDGE}`, borderRadius: 8, background: CARD }}>
              <SectionLabel style={{ display: 'block', marginBottom: 5 }}>LEFT OFF BY DEFAULT</SectionLabel>
              <div style={{ fontSize: 11, lineHeight: 1.7, color: LABEL }}>
                DEBUG and TRACE, tests, and any message glued together from strings &mdash; that one has no fixed
                shape to match on. Turn any of them on.
              </div>
            </div>
          </div>

          <div className="flex-1" />

          {/* ── Footer, under the table only ── */}
          <div className="flex items-center shrink-0"
               style={{ gap: 10, padding: '14px 16px', borderTop: `1px solid ${EDGE}` }}>
            <span className="truncate" style={{ fontSize: 11.5, color: QUIET, fontVariantNumeric: 'tabular-nums' }}>
              {read
                ? `${candidates.length.toLocaleString()} found · ${on.length.toLocaleString()} on · ${leftOff.toLocaleString()} left off · ${already.toLocaleString()} already in the catalogue`
                : 'Nothing scanned yet.'}
            </span>
            <div className="flex-1" />
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The board's EXTRACT switch: a 34×19 track, purple with the knob right when
 * the call will be added, the edge grey with a grey knob left when it will
 * not.
 */
function Switch({ on, onChange, disabled, label }: {
  on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="inline-flex items-center"
      style={{
        width: 34, height: 19, padding: 2, borderRadius: 999, border: 'none',
        background: on ? LOGGERS : EDGE, cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span style={{
        width: 15, height: 15, borderRadius: '50%', marginLeft: on ? 15 : 0,
        background: on ? PANEL : QUIET, transition: 'margin-left 120ms',
      }} />
    </button>
  );
}
