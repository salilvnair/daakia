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
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ButtonView, TextInputView, CheckboxView, ChipView, IconSize,
} from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { fromAnyCall, reasonOff } from './logger-calls';
import { compilePattern, matchPattern, type LoggerPattern } from './logger-pattern';
import { shortName, LEVEL_COLOR } from './logger-catalogue';
import type { ProjectReadMsg, ScanHitMsg } from './add-loggers';
import type { LogLine } from '../../store/k8s-store';
import { FolderOpenIcon, RefreshIcon, ChevronDownIcon, ChevronRightIcon } from '../../icons';
import { LOGGERS, LOGGERS_SOFT } from './tone';
import { PatternTemplate as Template } from './PatternTemplate';

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

const GRID = '52px minmax(0, 1fr) 140px 64px 70px';

export function ScanRepoPane({ window: lines, existingTemplates, into, onChosen }: {
  /** The buffer's lines in the window, for SEEN 2H. */
  window: LogLine[];
  existingTemplates: Set<string>;
  /** The logger chosen in "into", when the scan should file everything there. */
  into?: string;
  onChosen: (patterns: LoggerPattern[]) => void;
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

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex-1 min-w-0">
          <TextInputView
            value={folder}
            onChange={e => setFolder(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && folder.trim()) scan(folder); }}
            placeholder="The repository's folder — type a path, or choose one"
            size="md"
            accentColor={LOGGERS}
            prefixIcon={<FolderOpenIcon size={IconSize.action} color="var(--color-text-muted)" />}
            width="fullWidth"
            style={{ fontFamily: 'var(--font-mono, monospace)' }}
          />
        </div>
        <ButtonView size="md" variant="secondary" accentColor={LOGGERS} disabled={busy || !folder.trim()}
                    onClick={() => scan(folder)} iconLeft={<RefreshIcon size={IconSize.action} />}>
          {read ? 'Rescan' : 'Scan'}
        </ButtonView>
        <ButtonView size="md" variant="secondary" disabled={busy} onClick={() => scan('')}>
          Choose a folder&hellip;
        </ButtonView>
      </div>

      {error && <span className="text-[11.5px]" style={{ color: 'var(--color-error)' }}>{error}</span>}

      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {busy ? 'Scanning…' : read ? 'found' : 'Nothing scanned yet.'}
        </span>
        {(['java', 'python', 'node', 'go'] as Lang[]).filter(l => langCounts.has(l)).map(l => {
          const active = !langsOff.has(l);
          return (
            <ChipView key={l} size="sm" label={`${LANG_LABEL[l]}  ${langCounts.get(l)}`} active={active}
                      color={active ? LOGGERS : undefined} bg={active ? LOGGERS_SOFT : undefined}
                      onClick={() => setLangsOff(s => toggleSet(s, l))} />
          );
        })}
        <div className="flex-1" />
        <CheckboxView checked={skipDebug} onChange={setSkipDebug} size="sm" accentColor={LOGGERS} label="Skip DEBUG and TRACE" />
        <CheckboxView checked={skipTests} onChange={setSkipTests} size="sm" accentColor={LOGGERS} label="Skip tests" />
      </div>

      <div className="flex flex-1 min-h-0 gap-3">
        {/* ── WHERE THEY ARE ── */}
        <div className="flex flex-col shrink-0 min-h-0 rounded-md overflow-hidden"
             style={{ width: 250, border: '1px solid var(--color-surface-border)' }}>
          <div className="px-3 py-1.5 text-[10px] font-bold shrink-0"
               style={{ letterSpacing: '0.05em', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-surface-border)' }}>
            WHERE THEY ARE
          </div>
          <div className="flex-1 min-h-0 overflow-auto py-1">
            {tree.map(g => {
              const open = !collapsed.has(g.group);
              return (
                <div key={g.group}>
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <button type="button" className="flex border-none bg-transparent cursor-pointer p-0"
                            onClick={() => setCollapsed(s => toggleSet(s, g.group))}
                            aria-label={open ? 'Fold' : 'Open'}>
                      {open ? <ChevronDownIcon size={IconSize.inline} /> : <ChevronRightIcon size={IconSize.inline} />}
                    </button>
                    <CheckboxView checked={!groupsOff.has(g.group)} size="sm" accentColor={LOGGERS}
                                  onChange={() => setGroupsOff(s => toggleSet(s, g.group))} />
                    <span className="flex-1 min-w-0 truncate font-mono text-[11.5px]" title={g.group}>{g.group}</span>
                    <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{g.count}</span>
                  </div>
                  {open && g.files.map(([file, n]) => (
                    <div key={file} className="flex items-center gap-1.5 py-0.5" style={{ paddingLeft: 30, paddingRight: 8 }}>
                      <CheckboxView checked={!groupsOff.has(g.group) && !filesOff.has(`${g.group}|${file}`)}
                                    disabled={groupsOff.has(g.group)}
                                    size="sm" accentColor={LOGGERS}
                                    onChange={() => setFilesOff(s => toggleSet(s, `${g.group}|${file}`))} />
                      <span className="flex-1 min-w-0 truncate font-mono text-[11px]" title={file}
                            style={{ color: 'var(--color-text-secondary)' }}>{file}</span>
                      <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{n}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="px-3 py-2 text-[10.5px] leading-relaxed shrink-0"
               style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-surface-border)' }}>
            The repository is read where it sits. Nothing is sent anywhere, and nothing is written to it.
          </div>
        </div>

        {/* ── EXTRACTED PATTERNS ── */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 rounded-md overflow-hidden"
             style={{ border: '1px solid var(--color-surface-border)' }}>
          <div className="flex items-center gap-2 px-3 py-1.5 shrink-0"
               style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
            <span className="text-[10px] font-bold" style={{ letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
              EXTRACTED PATTERNS
            </span>
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>toggle any one off and it is not added</span>
            <div className="flex-1" />
            <ButtonView size="xs" variant="secondary" onClick={() => setAll(true)} disabled={!shown.length}>All on</ButtonView>
            <ButtonView size="xs" variant="secondary" onClick={() => setAll(false)} disabled={!shown.length}>All off</ButtonView>
          </div>
          <div className="grid gap-3 px-3 py-1 shrink-0 text-[10px] font-bold"
               style={{ gridTemplateColumns: GRID, letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
            <div>EXTRACT</div><div>PATTERN</div><div>LOGGER</div><div>LEVEL</div><div style={{ textAlign: 'right' }}>SEEN 2H</div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {read && shown.length === 0 && (
              <div className="px-3 py-3 text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
                No logger calls here. If the source is somewhere else in the tree, point at that folder.
              </div>
            )}
            {shown.map(c => {
              const active = isOn(c);
              const lv = c.pattern.level?.toUpperCase();
              const n = seen.get(c.key);
              return (
                <div key={c.key} className="grid gap-3 items-center px-3 py-1"
                     style={{ gridTemplateColumns: GRID, opacity: c.existing ? 0.5 : 1 }}
                     title={`${c.hit.file}:${c.hit.line}\n${c.hit.code}`}>
                  <CheckboxView checked={active} disabled={c.existing} size="sm" accentColor={LOGGERS}
                                onChange={v => setOverride(prev => new Map(prev).set(c.key, v))} />
                  <div className="min-w-0 truncate font-mono text-[11.5px]">
                    {c.pattern.glued
                      ? <span style={{ color: 'var(--color-text-muted)' }}>{c.hit.code.replace(/^[^(]*\(|\)$/g, '')} — {c.reason}</span>
                      : <Template template={c.pattern.template} dim={!active} />}
                    {c.pattern.objectFields?.length ? (
                      <span style={{ color: 'var(--color-text-muted)' }}> · fields {c.pattern.objectFields.join(', ')}</span>
                    ) : null}
                    {c.existing && <span style={{ color: 'var(--color-text-muted)' }}> · already in the catalogue</span>}
                  </div>
                  <div className="truncate font-mono text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    {c.pattern.logger ? shortName(c.pattern.logger) : '—'}
                  </div>
                  <div className="text-[10.5px] font-bold" style={{ color: lv ? LEVEL_COLOR[lv] : 'var(--color-text-muted)' }}>{lv ?? '—'}</div>
                  <div className="text-right font-mono text-[11.5px]"
                       style={{ color: n ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                    {n === undefined || c.reason === 'DEBUG' || c.reason === 'TRACE' || c.pattern.glued ? '—' : n.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── The two notes ── */}
        <div className="flex flex-col gap-3 shrink-0" style={{ width: 230 }}>
          <div className="px-3 py-2.5 rounded-md text-[11px] leading-relaxed"
               style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}>
            <div className="text-[10px] font-bold mb-1.5" style={{ letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
              WHAT EACH LANGUAGE GIVES
            </div>
            <div className="flex flex-col gap-1.5 font-mono text-[10.5px]" style={{ color: 'var(--color-text-secondary)' }}>
              <span>Java log.info("&hellip;{'{}'}&hellip;", reqId) &rarr; hole named reqId</span>
              <span>Python log.info("&hellip;%s", req_id) / f-string &rarr; req_id</span>
              <span>Node log.info({'{ orderId }'}, "&hellip;") &rarr; field orderId</span>
              <span>Go slog.Info("&hellip;", "order", id) &rarr; field order</span>
            </div>
          </div>
          <div className="px-3 py-2.5 rounded-md text-[11px] leading-relaxed"
               style={{ background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--color-warning) 24%, transparent)',
                        color: 'var(--color-text-secondary)' }}>
            <div className="text-[10px] font-bold mb-1.5" style={{ letterSpacing: '0.05em', color: 'var(--color-warning)' }}>
              LEFT OFF BY DEFAULT
            </div>
            DEBUG and TRACE, tests, and any message glued together from strings — that one has no fixed shape to
            match on. Turn any of them on.
          </div>
        </div>
      </div>

      <div className="text-[11.5px] shrink-0" style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {read
          ? `${candidates.length.toLocaleString()} found · ${on.length.toLocaleString()} on · ${leftOff.toLocaleString()} left off · ${already.toLocaleString()} already in the catalogue`
          : 'Point it at the service’s source — Java, Kotlin, Python, JavaScript, TypeScript and Go are read; build output and dependencies are not.'}
      </div>
    </div>
  );
}
