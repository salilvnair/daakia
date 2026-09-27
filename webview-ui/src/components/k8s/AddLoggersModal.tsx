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
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ModalView, ButtonView, TextInputView, SelectInputView, SegmentedControlView, CheckboxView,
  ChipView, FilterInputView, MultilineInputView, IconSize,
} from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useK8sStore } from '../../store/k8s-store';
import {
  useLoggersFor, addLoggers, addPatterns, rememberProject, useCatalogue, projectFor,
} from '../../store/dk8s-logger-store';
import {
  projectCandidates, projectGroups, podCandidates, pasteCandidates, viewCandidates, patternsForLoggers,
  type LoggerCandidate, type ProjectReadMsg, type PodLoggersMsg, type CandidateGroup,
} from './add-loggers';
import { LEVEL_COLOR, isLibrary } from './logger-catalogue';
import {
  FolderOpenIcon, ServerIcon, ClipboardCompareIcon, PencilIcon, InfoCircleIcon, PlusIcon, SpinnerIcon,
} from '../../icons';
import { LOGGERS, LOGGERS_SOFT, LOGGERS_INK } from './tone';
import { logUiEvent } from '../../store/ui-audit-store';

type Source = 'project' | 'pod' | 'paste' | 'hand';

const SIZE = 'md';
const GRID = '28px minmax(0, 1.6fr) 72px minmax(0, 1.2fr) 120px';

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

  return (
    <ModalView
      open
      onClose={onClose}
      size="xxl"
      height="84vh"
      headerColor={LOGGERS}
      headerIcon={<PlusIcon size={IconSize.row} color={LOGGERS} />}
      title="Add loggers"
      subtitle="so the catalogue lists them before they ever fire"
      bodyStyle={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: 12 }}
      footerLeft={source === 'project' ? (
        <div className="flex items-center gap-4">
          <CheckboxView checked={takePatterns} onChange={setTakePatterns} size="sm" accentColor={LOGGERS}
                        label="Also take the message patterns" />
          <CheckboxView checked={rescan} onChange={setRescan} size="sm" accentColor={LOGGERS}
                        label="Rescan when the project changes" />
        </div>
      ) : undefined}
      footerRight={
        <div className="flex items-center gap-2">
          <ButtonView label="Cancel" size="sm" variant="secondary" onClick={onClose} />
          <ButtonView
            size="sm" variant="primary" accentColor={LOGGERS}
            disabled={!chosen.length}
            onClick={add}
            style={chosen.length ? { background: LOGGERS, borderColor: LOGGERS, color: LOGGERS_INK, fontWeight: 600 } : undefined}
          >
            {`Add ${chosen.length.toLocaleString()} logger${chosen.length === 1 ? '' : 's'}`}
          </ButtonView>
        </div>
      }
    >
      <SegmentedControlView
        value={source}
        onChange={v => { setSource(v as Source); setError(undefined); setQuery(''); }}
        size={SIZE}
        variant="rounded"
        accentColor={LOGGERS}
        options={[
          { value: 'project', label: 'A project folder', icon: <FolderOpenIcon size={IconSize.action} /> },
          { value: 'pod', label: 'From this pod', icon: <ServerIcon size={IconSize.action} /> },
          { value: 'paste', label: 'Paste a list', icon: <ClipboardCompareIcon size={IconSize.action} /> },
          { value: 'hand', label: 'One by one', icon: <PencilIcon size={IconSize.action} /> },
        ]}
      />

      {/* ── The source ── */}
      {source === 'project' && (
        <div className="flex flex-col gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <TextInputView
                value={folder}
                onChange={e => setFolder(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && folder.trim()) readProject(folder); }}
                placeholder="The project's folder — type a path, or choose one"
                size={SIZE}
                accentColor={LOGGERS}
                prefixIcon={<FolderOpenIcon size={IconSize.action} color="var(--color-text-muted)" />}
                style={{ fontFamily: 'var(--font-mono, monospace)' }}
                width="fullWidth"
              />
            </div>
            <ButtonView size={SIZE} variant="secondary" accentColor={LOGGERS} disabled={busy || !folder.trim()}
                        onClick={() => readProject(folder)}>
              Read
            </ButtonView>
            <ButtonView size={SIZE} variant="secondary" disabled={busy} onClick={() => readProject('')}>
              Choose a folder&hellip;
            </ButtonView>
          </div>
          <div className="flex items-center gap-2 min-h-[28px]">
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
              {busy ? 'Reading the project…' : project
                ? [project.build, `${project.filesRead.toLocaleString()} files read`,
                  project.stoppedAt ? `stopped at the ${project.stoppedAt === 'files' ? 'file' : 'call'} limit — choose a subfolder for the rest` : '']
                  .filter(Boolean).join(' · ')
                : 'Nothing read yet.'}
            </span>
            <div className="flex-1" />
            {profiles.length > 0 && (
              <>
                <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>Profile</span>
                <SelectInputView value={profile} onChange={setProfile} size={SIZE} accentColor={LOGGERS}
                                 options={profiles.map(p => ({ value: p, label: p }))} />
              </>
            )}
          </div>
          {groups.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11.5px]" style={{ color: 'var(--color-text-secondary)' }}>Read from the project:</span>
              {groups.map(g => {
                const on = !groupsOff.has(g.id);
                return (
                  <ChipView
                    key={g.id}
                    label={`${g.label}  ${g.count}`}
                    active={on}
                    color={on ? LOGGERS : undefined}
                    bg={on ? LOGGERS_SOFT : undefined}
                    size="sm"
                    title={on ? 'Leave these out' : 'Take these too'}
                    onClick={() => setGroupsOff(prev => {
                      const next = new Set(prev);
                      if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                      return next;
                    })}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {source === 'pod' && (
        <div className="flex flex-col gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] leading-relaxed flex-1" style={{ color: 'var(--color-text-secondary)' }}>
              Reads the logback file out of {detail ? <code>{detail.name}</code> : 'the pod'} — from the image's
              config folders or from inside the jar — and asks Spring Actuator on localhost which loggers are
              set and at what level. One exec that only reads; nothing is written in the container.
            </span>
            <ButtonView size={SIZE} variant="secondary" accentColor={LOGGERS} color={LOGGERS}
                        disabled={busy || !detail} onClick={readPod}
                        iconLeft={busy ? <SpinnerIcon size={IconSize.action} /> : <ServerIcon size={IconSize.action} />}>
              {busy ? 'Reading…' : pod ? 'Read again' : 'Read this pod'}
            </ButtonView>
          </div>
          {pod && (
            <div className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
              <span className="truncate">
                {pod.files.length ? `${pod.files.map(f => f.path).join(', ')}` : 'no logback file found'}
                {' · '}
                {pod.actuator ? `Actuator on :${pod.actuator.port}` : 'no Actuator answered'}
              </span>
              <div className="flex-1" />
              {profiles.length > 1 && (
                <>
                  <span>Profile</span>
                  <SelectInputView value={profile} onChange={setProfile} size={SIZE} accentColor={LOGGERS}
                                   options={profiles.map(p => ({ value: p, label: p }))} />
                </>
              )}
            </div>
          )}
          {command && (
            <code className="text-[10.5px] truncate" style={{ color: 'var(--color-text-muted)' }} title={command}>{command}</code>
          )}
        </div>
      )}

      {source === 'paste' && (
        <div className="flex flex-col gap-1.5 shrink-0">
          <MultilineInputView
            value={paste}
            onChange={e => setPaste(e.target.value)}
            rows={5}
            resize="vertical"
            accentColor={LOGGERS}
            placeholder={'com.acme.orders.OrderService\ncom.acme.payments INFO\nlogging.level.org.hibernate.SQL: DEBUG\n<logger name="com.acme.audit" level="WARN"/>'}
            style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5 }}
          />
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            One per line — a name, a name and a level, a properties or YAML line, a logback &lt;logger&gt;.
          </span>
        </div>
      )}

      {source === 'hand' && (
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex-1 min-w-0">
            <TextInputView
              value={handName}
              onChange={e => setHandName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addHand(); }}
              placeholder="com.acme.orders.OrderService"
              size={SIZE}
              accentColor={LOGGERS}
              width="fullWidth"
              style={{ fontFamily: 'var(--font-mono, monospace)' }}
            />
          </div>
          <SelectInputView value={handLevel} onChange={setHandLevel} size={SIZE} accentColor={LOGGERS}
                           options={['none', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'OFF']
                             .map(l => ({ value: l, label: l === 'none' ? 'no level' : l }))} />
          <ButtonView size={SIZE} variant="secondary" accentColor={LOGGERS} color={LOGGERS}
                      disabled={!handName.trim()} onClick={addHand}
                      iconLeft={<PlusIcon size={IconSize.action} />}>
            Add to the list
          </ButtonView>
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded-md text-[11.5px] shrink-0"
             style={{
               color: 'var(--color-error)',
               background: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
               border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
             }}>
          {error}
        </div>
      )}

      {/* ── The switches ── */}
      <div className="flex items-center gap-4 shrink-0 flex-wrap">
        <div style={{ width: 220 }}>
          <FilterInputView value={query} onChange={setQuery} placeholder="Filter" size="sm" accentColor={LOGGERS} />
        </div>
        <CheckboxView
          checked={allPicked}
          indeterminate={!allPicked && view.shown.some(c => picked.has(c.name))}
          onChange={on => setPicked(prev => {
            const next = new Set(prev);
            for (const c of view.shown) { if (on) next.add(c.name); else next.delete(c.name); }
            return next;
          })}
          size="sm" accentColor={LOGGERS} label="Select all"
        />
        <CheckboxView checked={onlyNew} onChange={setOnlyNew} size="sm" accentColor={LOGGERS}
                      label="Only ones not in the catalogue" />
        <CheckboxView checked={skipLibrary} onChange={setSkipLibrary} size="sm" accentColor={LOGGERS}
                      label="Skip library packages" />
        <div className="flex-1" />
        <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {view.found.toLocaleString()} found · {view.fresh.toLocaleString()} new · {view.already.toLocaleString()} already there
        </span>
      </div>

      {/* ── The table ── */}
      <div className="flex flex-col flex-1 min-h-0 rounded-md overflow-hidden"
           style={{ border: '1px solid var(--color-surface-border)' }}>
        <div className="grid gap-3 px-3 py-1.5 shrink-0 text-[10px] font-bold"
             style={{ gridTemplateColumns: GRID, letterSpacing: '0.05em', color: 'var(--color-text-muted)',
                      borderBottom: '1px solid var(--color-surface-border)' }}>
          <div /><div>LOGGER</div><div>LEVEL</div><div>WHERE IT CAME FROM</div><div>PATTERNS IN SOURCE</div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {view.shown.length === 0 && (
            <div className="px-3 py-4 text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
              {candidates.length === 0
                ? source === 'project' ? 'Read a project to list its loggers.'
                  : source === 'pod' ? 'Read the pod to list the loggers it declares.'
                    : source === 'paste' ? 'Paste a list above.' : 'Add a logger above.'
                : 'Nothing left after the switches above.'}
            </div>
          )}
          {view.shown.map(c => (
            <label key={c.name}
                   className="grid gap-3 items-center px-3 py-1.5 cursor-pointer"
                   style={{ gridTemplateColumns: GRID, borderBottom: '1px solid var(--color-surface-border)',
                            opacity: c.existing ? 0.55 : 1 }}>
              <CheckboxView checked={picked.has(c.name) || c.existing} disabled={c.existing}
                            onChange={() => togglePick(c.name)} size="sm" accentColor={LOGGERS} />
              <span className="font-mono text-[12px] truncate" title={c.name}
                    style={{ color: c.library ? 'var(--color-text-secondary)' : 'var(--color-text-primary)' }}>
                {c.name}
              </span>
              <span className="text-[10.5px] font-bold" style={{ color: c.level ? LEVEL_COLOR[c.level] : 'var(--color-text-muted)' }}>
                {c.level ?? '—'}
              </span>
              <span className="text-[11px] truncate font-mono" title={c.from} style={{ color: 'var(--color-text-secondary)' }}>
                {c.from}{c.existing ? ' · already there' : ''}
              </span>
              <span className="text-[11px]" style={{ color: c.patterns ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
                {c.patterns ? `${c.patterns} found` : '—'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {source === 'project' && (
        <div className="flex items-start gap-2 text-[11px] leading-relaxed shrink-0" style={{ color: 'var(--color-text-muted)' }}>
          <InfoCircleIcon size={IconSize.action} color={LOGGERS} />
          <span>
            A class with @Slf4j or LoggerFactory.getLogger(X.class) is a logger named after the class, whether or
            not logback mentions it. The levels come from the profile above; switch it and the levels change.
            The project is read where it sits, and nothing is written to it.
          </span>
        </div>
      )}
    </ModalView>
  );
}
