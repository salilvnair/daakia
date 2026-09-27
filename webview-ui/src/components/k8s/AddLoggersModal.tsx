/**
 * Add loggers — so the catalogue lists them before they ever fire.
 *
 * Four sources, one table:
 *
 *   A project folder   logback-spring.xml's <logger>s, application-<profile>.yaml's
 *                      logging.level, and every class with a logger in it
 *   From this pod      the logback file in the container (or its jar), and
 *                      Spring Actuator's /actuator/loggers — one read-only exec
 *   Paste a list       whatever shape the list is in
 *   One by one         a name and a level
 *
 * ── Why the project is the default ──
 *
 * A class with @Slf4j is a logger named after the class whether or not
 * logback mentions it — which is most of them, and exactly the ones a tester
 * has never heard of. The configuration names a handful of packages; the
 * source names every logger the application has. The profile select exists
 * because the same logger is DEBUG in dev and WARN in prod, and switching it
 * re-reads every level in the table.
 *
 * The project is read where it sits, and nothing is written to it.
 *
 * ── Drawn to the board ──
 *
 * The dialog is the Add loggers board piece for piece: the purple header band
 * with the subtitle on the title's line, the sources as tabs with the chosen
 * one open onto the rule below, the folder as a purple chip beside "Choose a
 * folder…" and a green chip naming the build, the source chips with their
 * counts, the filter row, a table in a well with LEVEL pills and the two
 * source columns, the note, and a footer with the two checkboxes and the
 * purple button. The folder chip is also where a path is typed — Enter reads
 * it — so the one control the board draws does both jobs.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ModalView, TextInputView, MultilineInputView, SearchInputView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useK8sStore } from '../../store/k8s-store';
import {
  useLoggersFor, addLoggers, addPatterns, rememberProject, useCatalogue, projectFor,
} from '../../store/dk8s-logger-store';
import {
  projectCandidates, projectGroups, podCandidates, pasteCandidates, viewCandidates, patternsForLoggers,
  type LoggerCandidate, type ProjectReadMsg, type PodLoggersMsg, type CandidateGroup,
} from './add-loggers';
import { isLibrary } from './logger-catalogue';
import {
  FolderFlatIcon, PodHexIcon, ClipboardIcon, PlusIcon, SpinnerIcon, LoggerLinesIcon,
} from '../../icons';
import { LOGGERS, HOLE } from './tone';
import {
  PANEL, EDGE, DIVIDER, TEXT, LABEL, QUIET, GREEN, AMBER, RED, PICKED, tint,
} from './loggers-tone';
import {
  DialogHead, BoardTabs, Tick, LevelPill, NoteBox, Code, Picker, BoardButton, HEAD_TYPE,
} from './loggers-parts';
import { logUiEvent } from '../../store/ui-audit-store';

type Source = 'project' | 'pod' | 'paste' | 'hand';

/** The board's table: tick · LOGGER · LEVEL · WHERE IT CAME FROM · PATTERNS IN SOURCE. */
const GRID = '34px minmax(0, 1fr) 78px minmax(120px, 210px) 120px';
/** The gutter the board keeps down both sides of the dialog. */
const GUTTER = 18;

export function AddLoggersModal({ scope, onClose }: { scope: string; onClose: () => void }) {
  const detail = useK8sStore(s => s.detail);
  const logContainer = useK8sStore(s => s.logContainer);
  const stored = useLoggersFor(scope);
  const catalogue = useCatalogue();
  const link = projectFor(catalogue, scope);
  const existing = useMemo(() => new Set(stored.map(l => l.name)), [stored]);

  const [source, setSource] = useState<Source>('project');

  // ── A project folder ──
  const [folder, setFolder] = useState(link?.folder ?? '');
  const [project, setProject] = useState<ProjectReadMsg | undefined>();
  const [profile, setProfile] = useState(link?.profile ?? 'default');
  const [groupsOff, setGroupsOff] = useState<Set<CandidateGroup>>(() => new Set());
  const [takePatterns, setTakePatterns] = useState(link?.patterns ?? true);
  const [rescan, setRescan] = useState(link?.rescan ?? false);

  // ── From this pod ──
  const [pod, setPod] = useState<PodLoggersMsg | undefined>();

  // ── Paste / one by one ──
  const [paste, setPaste] = useState('');
  const [handName, setHandName] = useState('');
  const [handLevel, setHandLevel] = useState('INFO');
  const [handList, setHandList] = useState<LoggerCandidate[]>([]);

  // ── The table's switches ──
  const [query, setQuery] = useState('');
  const [onlyNew, setOnlyNew] = useState(true);
  const [skipLibrary, setSkipLibrary] = useState(link?.skipLibrary ?? true);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [command, setCommand] = useState<string | undefined>();
  const reqRef = useRef('');

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || msg.reqId !== reqRef.current) return;
      if (msg.type === 'dk8s:projectRead') {
        setBusy(false);
        if (msg.cancelled) return;
        if (msg.error) { setError(String(msg.error)); return; }
        const read = msg as ProjectReadMsg;
        setProject(read);
        setFolder(read.folder);
        setError(undefined);
        /* The profile the pod is most likely running: the one somebody chose
           before, else prod, else whatever the project names first. */
        setProfile(p => (read.profiles.includes(p) ? p : read.profiles[0] ?? 'default'));
      } else if (msg.type === 'dk8s:podLoggers') {
        setBusy(false);
        setCommand(msg.command);
        if (msg.error) { setError(String(msg.error)); setPod(undefined); return; }
        setError(undefined);
        setPod(msg as PodLoggersMsg);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const readProject = (path: string) => {
    reqRef.current = `project-${Date.now()}`;
    setBusy(true);
    setError(undefined);
    postMsg({ type: 'dk8s:readProject', reqId: reqRef.current, folder: path.trim() });
  };

  const readPod = () => {
    if (!detail) return;
    reqRef.current = `pod-${Date.now()}`;
    setBusy(true);
    setError(undefined);
    logUiEvent('dk8s.loggers_read_pod', {
      context: detail.context, namespace: detail.namespace, pod: detail.name, container: logContainer,
    });
    postMsg({
      type: 'dk8s:readPodLoggers', reqId: reqRef.current,
      context: detail.context, namespace: detail.namespace, pod: detail.name,
      container: logContainer ?? detail.containers[0]?.name,
    });
  };

  /* Every source reduced to the same rows. */
  const candidates = useMemo<LoggerCandidate[]>(() => {
    switch (source) {
      case 'project': return project ? projectCandidates(project, profile, existing) : [];
      case 'pod': return pod ? podCandidates(pod, profile, existing) : [];
      case 'paste': return pasteCandidates(paste, existing);
      case 'hand': return handList.map(c => ({ ...c, existing: existing.has(c.name) }));
    }
    return [];
  }, [source, project, pod, paste, handList, profile, existing]);

  const groups = useMemo(
    () => (source === 'project' && project ? projectGroups(project, candidates, profile) : []),
    [source, project, candidates, profile],
  );
  const activeGroups = useMemo(
    () => (groups.length ? new Set(groups.map(g => g.id).filter(g => !groupsOff.has(g))) : undefined),
    [groups, groupsOff],
  );
  const view = useMemo(
    () => viewCandidates(candidates, { groups: activeGroups, skipLibrary, onlyNew, query }),
    [candidates, activeGroups, skipLibrary, onlyNew, query],
  );

  /* A new read picks everything new that is showing; the reader unticks
     what they disagree with and presses Add once. */
  useEffect(() => {
    setPicked(new Set(candidates.filter(c => !c.existing && (!skipLibrary || !c.library)).map(c => c.name)));
    // Only when the candidates themselves change, not on every switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates]);

  const chosen = view.shown.filter(c => picked.has(c.name) && !c.existing);
  const allPicked = view.shown.length > 0 && view.shown.every(c => picked.has(c.name) || c.existing);

  const togglePick = (name: string) => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const profiles = source === 'project'
    ? project?.profiles ?? []
    : source === 'pod' && pod
      ? [...new Set(pod.files.flatMap(f => f.loggers.map(l => l.profile)).filter((p): p is string => !!p)
        .flatMap(p => p.split(/[|,&]/).map(s => s.trim().replace(/^!/, ''))).filter(Boolean)), 'default']
      : [];

  const add = () => {
    const res = addLoggers(chosen.map(c => ({ name: c.name, level: c.level, source: c.source, origin: c.from })), scope);
    let patternCount = 0;
    if (source === 'project' && project) {
      if (takePatterns) patternCount = addPatterns(patternsForLoggers(project.hits, new Set(chosen.map(c => c.name))), scope);
      rememberProject({
        scope, folder: project.folder, fingerprint: project.fingerprint, rescan,
        profile, skipLibrary, patterns: takePatterns,
      });
    }
    logUiEvent('dk8s.loggers_add', { source, added: res.added, patterns: patternCount });
    onClose();
  };

  const addHand = () => {
    const name = handName.trim();
    if (!name) return;
    setHandList(prev => prev.some(c => c.name === name) ? prev : [...prev, {
      name, level: handLevel === 'none' ? undefined : handLevel, source: 'hand', from: 'typed',
      groups: ['hand'], library: isLibrary(name), patterns: 0, existing: existing.has(name),
    }]);
    setPicked(prev => new Set(prev).add(name));
    setHandName('');
  };

  /* The folder typed is not the folder read: offer to read it. */
  const unread = !!folder.trim() && folder.trim() !== project?.folder;
  const classes = groups.find(g => g.id === 'classes')?.count;

  const profilePicker = profiles.length > 0 && (
    <>
      <span style={{ fontSize: 11.5, color: QUIET }}>Profile</span>
      <Picker value={profile} onChange={setProfile} height={30} fill={PANEL} radius={7}
              options={profiles.map(p => ({ value: p, label: p }))} />
    </>
  );

  return (
    <ModalView
      open
      onClose={onClose}
      size="xxl"
      height="84vh"
      elevated
      noPadding
      showCloseIcon={false}
      bodyStyle={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'hidden' }}
    >
      <DialogHead
        height={52}
        padX={GUTTER}
        icon={<LoggerLinesIcon size={16} color={LOGGERS} />}
        title="Add loggers"
        subtitle="so the catalogue lists them before they ever fire"
        onClose={onClose}
      />

      {/* ── The sources, as tabs ── */}
      <div className="shrink-0" style={{ padding: `12px ${GUTTER}px 0` }}>
        <BoardTabs
          value={source}
          onChange={v => { setSource(v); setError(undefined); setQuery(''); }}
          options={[
            { value: 'project', label: 'A project folder', icon: <FolderFlatIcon size={13} /> },
            { value: 'pod', label: 'From this pod', icon: <PodHexIcon size={13} /> },
            { value: 'paste', label: 'Paste a list', icon: <ClipboardIcon size={13} /> },
            { value: 'hand', label: 'One by one', icon: <PlusIcon size={13} /> },
          ]}
        />
      </div>

      {/* ── The source ── */}
      <div className="flex flex-col shrink-0"
           style={{ gap: 10, padding: `12px ${GUTTER}px`, borderTop: `1px solid ${EDGE}` }}>
        {source === 'project' && (
          <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
            {/* The folder chip, which is also where a path is typed. */}
            <label className="inline-flex items-center min-w-0"
                   title="The project's folder — type a path and press Enter, or choose one"
                   style={{
                     gap: 8, height: 30, padding: '0 11px', borderRadius: 7,
                     border: `1px solid ${folder.trim() ? LOGGERS : EDGE}`,
                     background: folder.trim() ? PICKED : 'none',
                     maxWidth: 460,
                   }}>
              <FolderFlatIcon size={13} color={LOGGERS} className="shrink-0" />
              <input
                value={folder}
                onChange={e => setFolder(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && folder.trim()) readProject(folder); }}
                placeholder="type a path, or choose one"
                spellCheck={false}
                aria-label="The project's folder"
                className="font-mono min-w-0"
                style={{
                  width: `${Math.max(folder.length, 26) + 1}ch`, maxWidth: '100%',
                  border: 'none', outline: 'none', background: 'transparent', padding: 0,
                  fontSize: 11.5, color: TEXT,
                }}
              />
            </label>
            {unread && (
              <BoardButton h={30} tone="quiet" disabled={busy} onClick={() => readProject(folder)}
                           style={{ padding: '0 11px', fontSize: 11.5 }}>
                Read
              </BoardButton>
            )}
            <BoardButton h={30} tone="quiet" disabled={busy} onClick={() => readProject('')}
                         style={{ padding: '0 11px', fontSize: 11.5 }}>
              Choose a folder&hellip;
            </BoardButton>
            {busy ? (
              <span className="inline-flex items-center" style={{ gap: 6, fontSize: 11.5, color: QUIET }}>
                <SpinnerIcon size={12} /> Reading the project…
              </span>
            ) : project ? (
              <>
                <span className="whitespace-nowrap"
                      title={`${project.filesRead.toLocaleString()} files read`}
                      style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, color: GREEN, background: tint(GREEN, 14) }}>
                  {project.build}
                </span>
                {project.stoppedAt && (
                  <span style={{ fontSize: 11, color: AMBER }}>
                    stopped at the {project.stoppedAt === 'files' ? 'file' : 'call'} limit — choose a subfolder for the rest
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize: 11.5, color: QUIET }}>Nothing read yet.</span>
            )}
            <div className="flex-1" />
            {profilePicker}
          </div>
        )}

        {source === 'pod' && (
          <>
            <div className="flex items-center" style={{ gap: 10 }}>
              <span className="flex-1" style={{ fontSize: 11.5, lineHeight: 1.6, color: LABEL }}>
                Reads the logback file out of {detail ? <Code>{detail.name}</Code> : 'the pod'} — from the image's
                config folders or from inside the jar — and asks Spring Actuator on localhost which loggers are
                set and at what level. One exec that only reads; nothing is written in the container.
              </span>
              <BoardButton h={30} disabled={busy || !detail} onClick={readPod}
                           style={{ padding: '0 11px', fontSize: 11.5, border: `1px solid ${LOGGERS}`, background: PICKED }}
                           iconLeft={busy ? <SpinnerIcon size={13} /> : <PodHexIcon size={13} color={LOGGERS} />}>
                {busy ? 'Reading…' : pod ? 'Read again' : 'Read this pod'}
              </BoardButton>
            </div>
            {pod && (
              <div className="flex items-center" style={{ gap: 10, fontSize: 11.5, color: QUIET }}>
                <span className="truncate">
                  {pod.files.length ? `${pod.files.map(f => f.path).join(', ')}` : 'no logback file found'}
                  {' · '}
                  {pod.actuator ? `Actuator on :${pod.actuator.port}` : 'no Actuator answered'}
                </span>
                <div className="flex-1" />
                {profiles.length > 1 && profilePicker}
              </div>
            )}
            {command && (
              <code className="truncate" style={{ fontSize: 10.5, color: QUIET }} title={command}>{command}</code>
            )}
          </>
        )}

        {source === 'paste' && (
          <>
            <MultilineInputView
              value={paste}
              onChange={e => setPaste(e.target.value)}
              rows={5}
              resize="vertical"
              accentColor={LOGGERS}
              placeholder={'com.acme.orders.OrderService\ncom.acme.payments INFO\nlogging.level.org.hibernate.SQL: DEBUG\n<logger name="com.acme.audit" level="WARN"/>'}
              style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, background: PANEL, borderColor: EDGE, borderRadius: 8 }}
            />
            <span style={{ fontSize: 11.5, color: QUIET }}>
              One per line — a name, a name and a level, a properties or YAML line, a logback &lt;logger&gt;.
            </span>
          </>
        )}

        {source === 'hand' && (
          <div className="flex items-center" style={{ gap: 10 }}>
            <div className="flex-1 min-w-0">
              <TextInputView
                value={handName}
                onChange={e => setHandName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addHand(); }}
                placeholder="com.acme.orders.OrderService"
                size="md"
                accentColor={LOGGERS}
                width="fullWidth"
                style={{ fontFamily: 'var(--font-mono, monospace)' }}
              />
            </div>
            <Picker lead="Level" value={handLevel} onChange={setHandLevel} fill={PANEL}
                    options={['none', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'OFF']
                      .map(l => ({ value: l, label: l === 'none' ? 'not set' : l }))} />
            <BoardButton h={28} disabled={!handName.trim()} onClick={addHand}
                         iconLeft={<PlusIcon size={12} color={LOGGERS} strokeWidth={2.4} />}>
              Add to the list
            </BoardButton>
          </div>
        )}
      </div>

      {/* ── Read from the project: one chip per source, with its count ── */}
      {groups.length > 0 && (
        <div className="flex flex-wrap items-center shrink-0" style={{ gap: 8, padding: `0 ${GUTTER}px 12px` }}>
          <span style={{ fontSize: 12, color: LABEL }}>Read from the project:</span>
          {groups.map(g => {
            const on = !groupsOff.has(g.id);
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={on}
                title={on ? 'Leave these out' : 'Take these too'}
                onClick={() => setGroupsOff(prev => {
                  const next = new Set(prev);
                  if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                  return next;
                })}
                className="inline-flex items-center font-mono cursor-pointer"
                style={{
                  gap: 7, height: 27, padding: '0 10px', borderRadius: 6, fontSize: 11,
                  border: `1px solid ${on ? LOGGERS : EDGE}`,
                  background: on ? PICKED : 'none',
                  color: on ? TEXT : LABEL,
                }}
              >
                {g.label}
                <span className="font-sans" style={{ color: on ? LOGGERS : QUIET }}>{g.count.toLocaleString()}</span>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="shrink-0"
             style={{
               margin: `0 ${GUTTER}px 10px`, padding: '8px 12px', borderRadius: 8, fontSize: 11.5,
               color: RED, background: tint(RED, 10), border: `1px solid ${tint(RED, 28)}`,
             }}>
          {error}
        </div>
      )}

      {/* ── The switches ── */}
      <div className="flex items-center flex-wrap shrink-0" style={{ gap: 10, padding: `0 ${GUTTER}px 10px` }}>
        <div style={{ width: 240 }}>
          <SearchInputView
            value={query}
            onChange={setQuery}
            placeholder="Filter"
            aria-label="Filter what was found"
            size="lg"
            height={28}
            style={{ background: PANEL, border: `1px solid ${EDGE}`, borderRadius: 6, paddingLeft: 10, paddingRight: 10 }}
          />
        </div>
        <Tick
          checked={allPicked}
          indeterminate={!allPicked && view.shown.some(c => picked.has(c.name))}
          onChange={on => setPicked(prev => {
            const next = new Set(prev);
            for (const c of view.shown) { if (on) next.add(c.name); else next.delete(c.name); }
            return next;
          })}
          label="Select all"
        />
        <Tick checked={onlyNew} onChange={setOnlyNew} color={LABEL} label="Only ones not in the catalogue" />
        <Tick checked={skipLibrary} onChange={setSkipLibrary} color={LABEL} label="Skip library packages" />
        <div className="flex-1" />
        <span style={{ fontSize: 11.5, color: QUIET, fontVariantNumeric: 'tabular-nums' }}>
          {view.found.toLocaleString()} found &middot; {view.fresh.toLocaleString()} new &middot; {view.already.toLocaleString()} already there
        </span>
      </div>

      {/* ── The table, in a well ── */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden"
           style={{ margin: `0 ${GUTTER}px`, border: `1px solid ${EDGE}`, borderRadius: 8, background: PANEL }}>
        <div className="grid shrink-0"
             style={{ ...HEAD_TYPE, gridTemplateColumns: GRID, gap: 10, padding: '8px 12px', borderBottom: `1px solid ${EDGE}` }}>
          <div /><div>LOGGER</div><div>LEVEL</div><div>WHERE IT CAME FROM</div><div>PATTERNS IN SOURCE</div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {view.shown.length === 0 && (
            <div style={{ padding: '14px 12px', fontSize: 11.5, color: QUIET }}>
              {candidates.length === 0
                ? source === 'project' ? 'Read a project to list its loggers.'
                  : source === 'pod' ? 'Read the pod to list the loggers it declares.'
                    : source === 'paste' ? 'Paste a list above.' : 'Add a logger above.'
                : 'Nothing left after the switches above.'}
            </div>
          )}
          {view.shown.map((c, i) => {
            /* A library row is drawn quiet, name and origin both — the board's
               org.springframework.web and org.hibernate.SQL. */
            const quiet = c.library;
            return (
              <label key={c.name}
                     className="grid items-center cursor-pointer"
                     style={{
                       gridTemplateColumns: GRID, gap: 10, padding: '7px 12px',
                       borderBottom: i === view.shown.length - 1 ? 'none' : `1px solid ${DIVIDER}`,
                       opacity: c.existing ? 0.55 : 1,
                     }}>
                <Tick checked={picked.has(c.name) || c.existing} disabled={c.existing}
                      onChange={() => togglePick(c.name)} ariaLabel={`Add ${c.name}`} />
                <span className="font-mono truncate" title={c.name}
                      style={{ fontSize: 12, color: quiet ? QUIET : TEXT }}>
                  {c.name}
                </span>
                <span style={{ justifySelf: 'start' }}><LevelPill level={c.level} /></span>
                <span className="font-mono truncate" title={c.from}
                      style={{ fontSize: 11, color: quiet ? QUIET : LABEL }}>
                  {c.from}{c.existing ? ' · already there' : ''}
                </span>
                <span style={{ fontSize: 11.5, color: c.patterns ? HOLE : QUIET }}>
                  {c.patterns ? `${c.patterns.toLocaleString()} found` : <>&mdash;</>}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {source === 'project' && (
        <NoteBox background={PANEL} style={{ margin: `12px ${GUTTER}px 0` }}>
          A class with <Code>@Slf4j</Code> or <Code>LoggerFactory.getLogger(X.class)</Code> is a logger named after
          the class, whether or not logback mentions it{classes ? <> &mdash; which is most of the {classes.toLocaleString()}</> : null}.
          The levels come from the profile above; switch it and the levels change.
          {' '}<span style={{ color: QUIET }}>The project is read where it sits, and nothing is written to it.</span>
        </NoteBox>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center shrink-0"
           style={{ gap: 10, marginTop: 12, padding: `14px ${GUTTER}px`, borderTop: `1px solid ${EDGE}` }}>
        {source === 'project' && (
          <>
            <Tick checked={takePatterns} onChange={setTakePatterns} label="Also take the message patterns" />
            <Tick checked={rescan} onChange={setRescan} color={LABEL} label="Rescan when the project changes" />
          </>
        )}
        <div className="flex-1" />
        <BoardButton h={30} onClick={onClose}>Cancel</BoardButton>
        <BoardButton h={30} tone="primary" disabled={!chosen.length} onClick={add}>
          {`Add ${chosen.length.toLocaleString()} logger${chosen.length === 1 ? '' : 's'}`}
        </BoardButton>
      </div>
    </ModalView>
  );
}
