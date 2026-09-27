/**
 * The pod's Python tab: write a script, run it in this pod, step through it.
 *
 * It inherits everything the pod detail already knows — the pod, the context,
 * and the container the other tabs are pointed at — so running `check_db.py`
 * against the replica you are looking at is one click, not a form.
 *
 * ── What happens on Run ──
 *
 * The host copies the script into the pod (`/tmp/daakia/<name>.py`, or the
 * next writable directory when /tmp is read-only), runs it with the
 * container's own python3 and environment, streams the output back, and
 * removes the file. When the tab closes, the folder goes too. The command is
 * echoed first in the Output panel, so what ran is never a mystery.
 *
 * ── And on Debug ──
 *
 * The same copy, run under `python3 -m pdb` over the exec channel the
 * Terminal uses. Breakpoints come from the gutter; every stop refreshes the
 * variables, the watches and the stack on the right.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ButtonView, IconButtonView, SelectInputView, TextInputView, SplitPanelView, EmptyStateView, BadgeChipView, IconSize,
} from '@salilvnair/dui';
import { PlayIcon, BugIcon, PythonIcon, StopSquareIcon, CloseIcon } from '../../../icons';
import { useK8sStore } from '../../../store/k8s-store';
import {
  usePyStore, ensurePyListener, targetKey, type PyTarget,
} from '../../../store/dk8s-python-store';
import { ScriptLibrary } from './ScriptLibrary';
import { ScriptTitle, ScriptSave, ScriptMenu } from './ScriptHeader';
import { RunSetup } from './RunSetup';
import { AskPyAi } from './AskPyAi';
import { GhostToggle } from './ghost-toggle';
import { usePythonMenu } from './py-menu';
import { PyEditor } from './PyEditor';
import { PyBottomPanel, type BottomTab } from './PyBottomPanel';
import { PyDebugPanes, DebugToolbar } from './PyDebugPanes';
import { ThisPodPanel } from './ThisPodPanel';
import { NoPython } from './NoPython';
import { newId, PY_HEADER_HEIGHT } from './py-view';
import { ACCENT, WARN, MUTED, BAD } from '../tone';

/** Run's colour: the same green as Send and Run elsewhere in Daakia. */
const RUN = 'var(--color-success)';

/** `/tmp/daakia/check_db.py` — what the host's `podFileName` will make of a name. */
export function plannedPath(base: string | undefined, name: string): string | undefined {
  if (!base) return undefined;
  const stem = (name.split('/').pop() ?? '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[.-]+/, '')
    .slice(0, 64).replace(/\.py$/i, '');
  return `${base.replace(/\/+$/, '')}/daakia/${stem || 'script'}.py`;
}

export function PythonTab() {
  const detail = useK8sStore(s => s.detail);
  const logContainer = useK8sStore(s => s.logContainer);
  const setLogContainer = useK8sStore(s => s.setLogContainer);
  const access = useK8sStore(s => s.access);

  const selectedId = usePyStore(s => s.selectedId);
  const script = usePyStore(s => s.scripts.find(x => x.id === s.selectedId));
  const loaded = usePyStore(s => s.loaded);
  const probes = usePyStore(s => s.probes);
  const probe = usePyStore(s => s.probe);
  const runsById = usePyStore(s => s.runs);
  const runOrder = usePyStore(s => s.runOrder);
  const run = usePyStore(s => s.run);
  const stop = usePyStore(s => s.stop);
  const startDebug = usePyStore(s => s.startDebug);
  const debug = usePyStore(s => s.debug);
  const dismissDebug = usePyStore(s => s.dismissDebug);
  const args = usePyStore(s => (s.selectedId ? s.args[s.selectedId] : undefined) ?? '');
  const setArgs = usePyStore(s => s.setArgs);
  const newScript = usePyStore(s => s.newScript);
  const save = usePyStore(s => s.save);
  const draftName = usePyStore(s => (s.selectedId ? s.drafts[s.selectedId]?.name : undefined));

  /*
    One session per visit to the tab.

    The host remembers which folders this session created and removes them
    when it ends — on unmount, which is leaving the tab, closing the pod or
    closing the panel. A fresh id per mount means a return visit is a new
    session rather than a claim on a folder that is already gone.
  */
  const sessionId = useRef(newId('s')).current;
  useEffect(() => {
    ensurePyListener();
    return () => usePyStore.getState().endSession(sessionId);
  }, [sessionId]);

  const container = logContainer ?? detail?.containers[0]?.name;
  const target: PyTarget | undefined = useMemo(() => (detail?.context ? {
    context: detail.context, namespace: detail.namespace, pod: detail.name, container,
  } : undefined), [detail?.context, detail?.namespace, detail?.name, container]);
  const key = target ? targetKey(target) : '';
  const pyProbe = probes[key];

  useEffect(() => { if (target && access.exec) probe(target); }, [key, access.exec]); // eslint-disable-line react-hooks/exhaustive-deps

  const myRuns = useMemo(
    () => runOrder.map(id => runsById[id]).filter(r => r && r.sessionId === sessionId),
    [runOrder, runsById, sessionId],
  );
  const [shownRunId, setShownRunId] = useState<string>();
  const shown = (shownRunId && runsById[shownRunId]) || myRuns[myRuns.length - 1];
  const running = myRuns.some(r => r.status === 'running');

  const myDebug = debug && debug.sessionId === sessionId ? debug : undefined;
  const debugLive = !!myDebug && !myDebug.ended;
  const [tab, setTab] = useState<BottomTab>('output');
  const [reveal, setReveal] = useState<{ line: number; n: number }>();

  const verdict = pyProbe?.verdict;
  const blocked = !verdict?.ok;
  const noFile = verdict?.ok && !pyProbe?.base;
  const name = draftName ?? script?.name ?? '';

  const onRun = useCallback(() => {
    if (!target || !selectedId) return;
    setShownRunId(run(target, sessionId, selectedId));
    setTab('output');
  }, [target, selectedId, run, sessionId]);

  const onDebug = useCallback(() => {
    if (!target || !selectedId) return;
    /* The exec API needs a container by name; the pod's first is what
       kubectl would have picked anyway. */
    startDebug({ ...target, container: target.container ?? detail?.containers[0]?.name }, sessionId, selectedId);
    setTab('console');
  }, [target, selectedId, startDebug, sessionId, detail]);

  // Ctrl+S saves the open script — the one key every editor has taught.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && selectedId) {
        e.preventDefault();
        save(selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, save]);

  /* Right-click anywhere on the tab: what can be done with what is under the pointer. */
  const menu = usePythonMenu({
    scriptId: script?.id,
    onRun, onDebug,
    canRun: !!script && !blocked && !running,
    canDebug: !!script && !blocked && !noFile && !running && !(debug && !debug.ended),
    output: () => (shown ? shown.chunks.map(c => c.text).join('') : ''),
    onClearOutput: () => usePyStore.getState().clearRuns(r => r.sessionId === sessionId),
  });

  if (!detail || !target) return null;

  const containers = detail.containers.map(c => c.name);
  const path = shown?.path ?? plannedPath(pyProbe?.base, name);

  /* The container has said it cannot run a script: the tab is that answer,
     not an editor whose every button is greyed out. A session already
     debugging keeps its screen. */
  if (verdict && !verdict.ok && pyProbe && !pyProbe.busy && !debugLive) {
    return (
      <NoPython
        reason={verdict.reason}
        container={container}
        containers={containers}
        onContainer={(c) => useK8sStore.getState().setLogContainer(c)}
        onCheck={() => probe(target, true)}
        checking={pyProbe.busy}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0" data-context-menu="python" onContextMenu={menu.onContextMenu}>
      {menu.element}
      <ScriptLibrary heading="SCRIPTS" footer="Saved in this workspace — Git Sync carries them." />

      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/*
          One row: what is open on the left; how it runs, Debug and Run on the
          right. Container, arguments and the path in the pod live in the
          "runs in" chip's popover, and the file verbs behind the ⋯ — a second
          row of inputs for things set once per script was the clutter.
          The debug bar takes the row while a session is live.
        */}
        <div className="flex items-center gap-2 px-3 flex-shrink-0 min-w-0"
             style={{ height: PY_HEADER_HEIGHT, borderBottom: '1px solid var(--color-surface-border)' }}>
          {debugLive ? (
            <DebugBar />
          ) : (
            <>
              {script
                ? <><ScriptTitle scriptId={script.id} /><ScriptSave scriptId={script.id} /></>
                : <span className="text-[12px] px-2" style={{ color: MUTED }}>No script open</span>}
              <span className="flex-1" />
              {myDebug?.ended && (
                <span className="flex items-center gap-1 shrink-0" title={myDebug.ended}>
                  <BadgeChipView tone={myDebug.failed ? BAD : MUTED} size="xs">
                    debug {myDebug.failed ? 'failed' : 'ended'}
                  </BadgeChipView>
                  <IconButtonView size="xs" icon={<CloseIcon size={IconSize.inline} />}
                                  tooltip="Dismiss" aria-label="Dismiss debug session" onClick={dismissDebug} />
                </span>
              )}
              {script && (
                <RunSetup
                  container={container}
                  containers={containers}
                  onContainer={setLogContainer}
                  args={args}
                  onArgs={(a) => selectedId && setArgs(selectedId, a)}
                  onEnter={() => { if (!blocked && !running) onRun(); }}
                  path={path}
                  copied={!!shown?.path}
                  tmpReadOnly={!!pyProbe?.base && pyProbe.base !== '/tmp'}
                  streamed={!path && !!pyProbe?.verdict?.ok}
                />
              )}
              <AskPyAi scriptId={script?.id} target={blocked ? undefined : target}
                       pythonVersion={verdict?.version?.text} lastRun={shown} />
              <GhostToggle />
              <ButtonView
                size="md" variant="secondary"
                iconLeft={<BugIcon size={IconSize.action} color={WARN} />}
                disabled={!script || blocked || !!noFile || running || (!!debug && !debug.ended)}
                onClick={onDebug}
                title={noFile ? 'pdb needs a file, and nothing in this container is writable'
                  : debug && !debug.ended ? 'A debugger is already running — stop it first'
                    : 'Run under pdb, stopping at the gutter’s breakpoints'}
              >
                Debug
              </ButtonView>
              {running && shown ? (
                <ButtonView size="md" variant="secondary" accentColor={BAD} color={BAD}
                            iconLeft={<StopSquareIcon size={IconSize.action} />}
                            onClick={() => stop(shown.runId)}>
                  Stop
                </ButtonView>
              ) : (
                /* Green like every other Run and Send in Daakia, tinted rather than filled. */
                <ButtonView
                  size="md" variant="secondary" accentColor={RUN} color={RUN}
                  iconLeft={<PlayIcon size={IconSize.action} />}
                  disabled={!script || blocked}
                  onClick={onRun}
                  title={blocked ? verdict?.reason ?? 'Checking this container…' : 'Copy into the pod and run it'}
                >
                  Run
                </ButtonView>
              )}
              {script && <ScriptMenu scriptId={script.id} />}
            </>
          )}
        </div>

        {blocked && pyProbe && !pyProbe.busy && verdict && (
          <div className="px-3 py-2 text-[11.5px] flex-shrink-0"
               style={{
                 color: BAD, borderBottom: '1px solid var(--color-surface-border)',
                 background: 'color-mix(in srgb, var(--color-error) 7%, transparent)',
               }}>
            {verdict.reason}
          </div>
        )}

        {!script ? (
          <div className="flex-1 grid place-items-center">
            <EmptyStateView
              variant="medallion"
              icon={<PythonIcon size={IconSize.medallion} />}
              title={loaded ? 'No script open' : 'Loading the library'}
              message="A script runs inside this pod with the container's own python3, environment and network — the same view of the world the service has."
              accentColor={ACCENT}
              action={loaded ? { label: 'New script', onClick: () => newScript() } : undefined}
            />
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0">
              <SplitPanelView
                direction="vertical"
                defaultSplit={62}
                minFirst={120}
                minSecond={90}
                accentColor={ACCENT}
                first={<PyEditor scriptId={script.id} reveal={reveal}
                                 target={blocked ? undefined : target} pythonVersion={verdict?.version?.text} />}
                second={(
                  <div className="h-full" data-py-output>
                  <PyBottomPanel
                    runs={myRuns}
                    run={shown}
                    showDebug={!!myDebug}
                    tab={tab}
                    onTab={setTab}
                    onJump={(line) => setReveal({ line, n: Date.now() })}
                    onPickRun={setShownRunId}
                  />
                  </div>
                )}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Run and Debug, and what this pod can do ── */}
      <div className="flex flex-col flex-shrink-0 min-h-0 overflow-auto"
           style={{ width: 290, borderLeft: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
        <PyDebugPanes scriptId={script?.id} scriptName={name} />
        <div className="flex-1" />
        {debugLive ? (
          <div className="text-[11px]"
               style={{ padding: '10px 12px', lineHeight: 1.6, borderTop: '1px solid var(--color-surface-border)', color: MUTED }}>
            Ending the session kills the process and removes{' '}
            <span className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>{pyProbe?.base ?? '/tmp'}/daakia/</span> from the pod.
          </div>
        ) : (
          <ThisPodPanel probe={pyProbe} execAllowed={access.exec} onRefresh={() => probe(target, true)} />
        )}
      </div>
    </div>
  );
}

/**
 * "Paused on breakpoint · line 12 — pool()" and the controls, in place of the
 * Run toolbar — the two are never wanted at once, and the toolbar's place is
 * where the eye already goes for "what can I do now".
 */
export function DebugBar() {
  const debug = usePyStore(s => s.debug);
  if (!debug) return null;
  const st = debug.state;
  const where = st.location;
  const label = st.status === 'paused'
    ? st.reason === 'exception' ? 'Stopped on an uncaught exception'
      : st.reason === 'breakpoint' ? 'Paused on breakpoint' : 'Paused'
    : st.status === 'finished' ? 'Finished' : st.status === 'starting' ? 'Starting pdb…' : 'Running…';
  return (
    <>
      <span className="flex items-center gap-2 text-[12px]">
        <span style={{
          width: 8, height: 8, borderRadius: 8,
          background: st.status === 'paused' ? WARN : ACCENT,
        }} />
        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{label}</span>
        {st.status === 'paused' && where && (
          <span className="font-mono" style={{ color: MUTED }}>
            line {where.line} &mdash; {where.fn}(){st.returning ? ' · returning' : ''}
          </span>
        )}
        {st.exception && <span style={{ color: BAD }}>{st.exception}</span>}
      </span>
      <span className="flex-1" />
      <DebugToolbar />
    </>
  );
}
