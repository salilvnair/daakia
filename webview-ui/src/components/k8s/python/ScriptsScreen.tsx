/**
 * dk8s Scripts — one script, several pods.
 *
 * The pod tab inherits its pod; this screen picks them. The common question
 * it answers is "is this true on every replica", which is a question about
 * several pods at once: the same `check_db.py` against three `orders-api`
 * pods, one output tab each, and a strip that says how many were fine.
 *
 * Debug attaches to the first selected pod only. pdb is one process with one
 * prompt; stepping three of them in lockstep is not debugging, it is three
 * debuggers fighting over one set of buttons.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ButtonView, SelectInputView, TextInputView, SplitPanelView, EmptyStateView, BadgeChipView,
  PopoverView, CheckboxView, UnderlineTabsView, IconSize,
} from '@salilvnair/dui';
import { PlayIcon, BugIcon, PythonIcon, CodeIcon, ChevronRightIcon } from '../../../icons';
import { postMsg } from '../../../vscode';
import { useK8sStore } from '../../../store/k8s-store';
import { useWorkspaceStore } from '../../../store/workspace-store';
import { usePyStore, ensurePyListener, targetKey, type PyTarget } from '../../../store/dk8s-python-store';
import { ScriptLibrary } from './ScriptLibrary';
import { ScriptHeader } from './ScriptHeader';
import { PyEditor } from './PyEditor';
import { OutputPane, ConsolePane } from './PyBottomPanel';
import { PyDebugPanes } from './PyDebugPanes';
import { DebugBar } from './PythonTab';
import { newId, podShort, summarizeRuns, compareOutputs } from './py-view';
import { ACCENT, ACCENT_SOFT, OK, BAD, WARN, MUTED } from '../tone';

interface PickablePod {
  name: string;
  app: string;
  phase: string;
  containers?: string[];
}

export function ScriptsScreen() {
  const contexts = useK8sStore(s => s.contexts);
  const currentContext = useK8sStore(s => s.context);
  const targets = useK8sStore(s => s.targets);
  const workspace = useWorkspaceStore(s => s.workspaces.find(w => w.id === s.activeId));

  const script = usePyStore(s => s.scripts.find(x => x.id === s.selectedId));
  const selectedId = usePyStore(s => s.selectedId);
  const loaded = usePyStore(s => s.loaded);
  const probes = usePyStore(s => s.probes);
  const probe = usePyStore(s => s.probe);
  const runsById = usePyStore(s => s.runs);
  const runMany = usePyStore(s => s.runMany);
  const startDebug = usePyStore(s => s.startDebug);
  const debug = usePyStore(s => s.debug);
  const args = usePyStore(s => (s.selectedId ? s.args[s.selectedId] : undefined) ?? '');
  const setArgs = usePyStore(s => s.setArgs);
  const newScript = usePyStore(s => s.newScript);
  const save = usePyStore(s => s.save);

  // One session for as long as the screen is mounted — see PythonTab.
  const sessionId = useRef(newId('s')).current;
  useEffect(() => {
    ensurePyListener();
    return () => usePyStore.getState().endSession(sessionId);
  }, [sessionId]);

  // ── Where ────────────────────────────────────────────────────────────────
  const [context, setContext] = useState<string>(currentContext ?? contexts[0]?.name ?? '');
  const [namespace, setNamespace] = useState<string>(targets[0]?.namespace ?? '');
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [pods, setPods] = useState<PickablePod[]>([]);
  const [podsError, setPodsError] = useState<string>();
  const [picked, setPicked] = useState<string[]>([]);
  const [container, setContainer] = useState<string>('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!context && (currentContext || contexts[0]?.name)) setContext(currentContext ?? contexts[0].name);
  }, [context, currentContext, contexts]);

  useEffect(() => {
    if (!context) return;
    postMsg({ type: 'py:pods', context, namespace });
  }, [context, namespace]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const m = e.data as Record<string, unknown>;
      if (m?.type !== 'py:pods' || m.context !== context) return;
      const ns = (m.namespaces as string[]) ?? [];
      setNamespaces(ns);
      if (!namespace && ns.length) { setNamespace(ns.includes('default') ? 'default' : ns[0]); return; }
      if (m.namespace !== namespace) return;
      const list = (m.pods as PickablePod[]) ?? [];
      setPods(list);
      setPodsError(m.podsError as string | undefined);
      // A pod that is gone is dropped from the selection rather than run against.
      setPicked(p => p.filter(n => list.some(x => x.name === n)));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [context, namespace]);

  const pickedPods = pods.filter(p => picked.includes(p.name));
  /* "First" is the first one ticked, not the first in the list: it is the pod
     somebody chose to start with, and Debug on first means that one. */
  const firstPod = pods.find(p => p.name === picked[0]);
  const containers = firstPod?.containers ?? [];
  const pyTargets: PyTarget[] = useMemo(
    () => picked.map(pod => ({ context, namespace, pod, container: container || undefined })),
    [picked, context, namespace, container],
  );

  // ── python3, everywhere selected ────────────────────────────────────────
  const checkAll = useCallback((force?: boolean) => {
    for (const t of pyTargets) probe(t, force);
  }, [pyTargets, probe]);
  useEffect(() => { checkAll(false); }, [checkAll]);
  const found = pyTargets.map(t => probes[targetKey(t)]);
  const checking = found.some(p => !p || p.busy);
  const withPy = found.filter(p => p?.verdict?.ok).length;
  const pyLabel = !pyTargets.length ? 'no pods selected'
    : checking ? 'checking python3…'
      : withPy === pyTargets.length
        ? pyTargets.length === 1 ? 'it has python3' : `all ${countWord(pyTargets.length)} have python3`
        : `${withPy} of ${pyTargets.length} have python3`;
  const pyTone = !pyTargets.length || checking ? MUTED : withPy === pyTargets.length ? OK : WARN;

  // ── Runs ─────────────────────────────────────────────────────────────────
  const [batchId, setBatchId] = useState<string>();
  const batch = usePyStore(s => s.batches.find(b => b.id === batchId));
  const batchRuns = (batch?.runIds ?? []).map(id => runsById[id]).filter(Boolean);
  const summary = summarizeRuns(batchRuns);
  const [podTab, setPodTab] = useState<string>();
  const [view, setView] = useState<'output' | 'compare' | 'console'>('output');
  const running = batchRuns.some(r => r.status === 'running');
  const shownRun = batchRuns.find(r => r.runId === podTab) ?? batchRuns[0];

  const myDebug = debug && debug.sessionId === sessionId ? debug : undefined;
  const debugLive = !!myDebug && !myDebug.ended;

  const onRunAll = () => {
    if (!selectedId || !pyTargets.length) return;
    const b = runMany(pyTargets, sessionId, selectedId);
    setBatchId(b.id);
    setPodTab(b.runIds[0]);
    setView('output');
  };

  const onDebugFirst = () => {
    const first = firstPod;
    if (!selectedId || !first) return;
    startDebug({
      context, namespace, pod: first.name,
      container: container || first.containers?.[0],
    }, sessionId, selectedId);
    setView('console');
  };

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

  const firstBlocked = !!firstPod && probes[targetKey(pyTargets[0])]?.verdict?.ok === false;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Title ── */}
      <div className="flex items-center gap-2.5 px-3.5 flex-shrink-0"
           style={{ height: 38, borderBottom: '1px solid var(--color-surface-border)' }}>
        <CodeIcon size={IconSize.row} color={ACCENT} />
        <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Scripts</span>
        <span className="text-[11.5px]" style={{ color: MUTED }}>run Python inside pods</span>
        <span className="flex-1" />
        <span className="text-[11px]" style={{ color: MUTED }}>workspace</span>
        <BadgeChipView tone={ACCENT} size="xs">{workspace?.name ?? 'My Workspace'}</BadgeChipView>
      </div>

      {/* ── Which pods ── */}
      <div className="flex items-center gap-2 px-3.5 flex-shrink-0 flex-wrap"
           style={{ minHeight: 46, borderBottom: '1px solid var(--color-surface-border)' }}>
        <span className="text-[11.5px]" style={{ color: MUTED }}>Context</span>
        <SelectInputView size="sm" width={160} value={context}
                         options={contexts.map(c => ({ value: c.name, label: c.name }))}
                         onChange={(v) => { setContext(v); setNamespace(''); setPods([]); setPicked([]); }} />
        <span className="text-[11.5px]" style={{ color: MUTED }}>Namespace</span>
        <SelectInputView size="sm" width={150} value={namespace} placeholder="namespace"
                         options={namespaces.map(n => ({ value: n, label: n }))}
                         onChange={(v) => { setNamespace(v); setPods([]); setPicked([]); }} />
        <span className="text-[11.5px]" style={{ color: MUTED }}>Pods</span>
        <span ref={pickerRef} className="inline-flex">
          <ButtonView size="sm" variant="secondary" onClick={() => setPickerOpen(true)}
                      iconRight={<ChevronRightIcon size={IconSize.inline} style={{ transform: 'rotate(90deg)' }} />}>
            <span className="font-mono">{firstPod?.app ?? (pods.length ? 'choose pods' : 'no pods')}</span>
            {picked.length > 0 && (
              <BadgeChipView tone={ACCENT} size="2xs" style={{ marginLeft: 6 }}>{picked.length} selected</BadgeChipView>
            )}
          </ButtonView>
        </span>
        <PopoverView open={pickerOpen} onClose={() => setPickerOpen(false)} anchorEl={pickerRef.current} placement="bottom">
          <PodChecklist pods={pods} picked={picked} onChange={setPicked} error={podsError} />
        </PopoverView>
        {containers.length > 1 && (
          <>
            <span className="text-[11.5px]" style={{ color: MUTED }}>Container</span>
            <SelectInputView size="sm" width={140} value={container}
                             options={[{ value: '', label: 'default' }, ...containers.map(c => ({ value: c, label: c }))]}
                             onChange={setContainer} />
          </>
        )}
        <span className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full"
              style={{ color: 'var(--color-text-secondary)', background: 'var(--color-surface-hover)' }}
              title={found.filter(p => p?.verdict && !p.verdict.ok).map(p => p!.verdict!.reason).join('\n') || undefined}>
          <span style={{ width: 6, height: 6, borderRadius: 6, background: pyTone }} />
          {pyLabel}
        </span>
        <ButtonView size="xs" variant="ghost" disabled={!pyTargets.length || checking} onClick={() => checkAll(true)}
                    title="Ask every selected pod for its python3 again">
          Check python3
        </ButtonView>
        <span className="flex-1" />
        <ButtonView size="sm" variant="primary" accentColor={ACCENT}
                    iconLeft={<PlayIcon size={IconSize.action} />}
                    disabled={!script || !pyTargets.length || running}
                    loading={running}
                    onClick={onRunAll}>
          {pyTargets.length ? `Run on ${pyTargets.length} ${pyTargets.length === 1 ? 'pod' : 'pods'}` : 'Run on pods'}
        </ButtonView>
        <ButtonView size="sm" variant="secondary"
                    iconLeft={<BugIcon size={IconSize.action} color={WARN} />}
                    disabled={!script || !firstPod || firstBlocked || (!!debug && !debug.ended)}
                    title={firstPod ? `pdb in ${firstPod.name}` : 'Select a pod first'}
                    onClick={onDebugFirst}>
          Debug on first
        </ButtonView>
      </div>

      <div className="flex flex-1 min-h-0">
        <ScriptLibrary heading="LIBRARY" width={236}
                       footer="Scripts belong to the workspace and travel with Git Sync, like collections." />

        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          {!script ? (
            <div className="flex-1 grid place-items-center">
              <EmptyStateView
                variant="medallion"
                icon={<PythonIcon size={IconSize.medallion} />}
                title={loaded ? 'Pick or write a script' : 'Loading the library'}
                message="Choose the pods above, then run the script on all of them at once — one output tab per pod."
                accentColor={ACCENT}
                action={loaded ? { label: 'New script', onClick: () => newScript() } : undefined}
              />
            </div>
          ) : (
            <>
              <ScriptHeader scriptId={script.id} />
              {debugLive && (
                <div className="flex items-center gap-2 px-3 flex-shrink-0"
                     style={{ minHeight: 40, borderBottom: '1px solid var(--color-surface-border)' }}>
                  <DebugBar />
                </div>
              )}
              <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0"
                   style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                <span className="text-[11px]" style={{ color: MUTED }}>Args</span>
                <TextInputView size="xs" value={args} placeholder="--pool --json" aria-label="Script arguments"
                               onChange={(e) => selectedId && setArgs(selectedId, e.target.value)}
                               inputStyle={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
                               style={{ width: 240 }} />
              </div>
              <div className="flex-1 min-h-0">
                <SplitPanelView
                  direction="vertical" defaultSplit={60} minFirst={120} minSecond={120} accentColor={ACCENT}
                  first={<PyEditor scriptId={script.id} />}
                  second={(
                    <div className="flex flex-col h-full min-h-0" style={{ borderTop: '1px solid var(--color-surface-border)' }}>
                      <div className="flex items-center gap-2 px-2.5 flex-shrink-0"
                           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                        <UnderlineTabsView
                          accentColor={ACCENT} rule={false}
                          activeId={view === 'output' ? (shownRun?.runId ?? '') : view}
                          onChange={(id) => {
                            if (id === 'compare' || id === 'console') setView(id);
                            else { setView('output'); setPodTab(id); }
                          }}
                          tabs={[
                            ...batchRuns.map(r => ({
                              id: r.runId,
                              label: podShort(r.target.pod),
                              icon: <span style={{
                                width: 6, height: 6, borderRadius: 6, display: 'inline-block',
                                background: r.status === 'ok' ? OK : r.status === 'running' ? ACCENT : BAD,
                              }} />,
                            })),
                            ...(batchRuns.length > 1 ? [{ id: 'compare', label: 'Compare' }] : []),
                            ...(myDebug ? [{ id: 'console', label: 'Debug console' }] : []),
                          ]}
                        />
                        <span className="flex-1" />
                        {batchRuns.length > 0 && (
                          <span className="flex items-center gap-2 text-[11px]">
                            {summary.running > 0 && <span style={{ color: ACCENT }}>running</span>}
                            {summary.ok > 0 && <span style={{ color: 'var(--color-text-secondary)' }}>{summary.ok} ok</span>}
                            {summary.failed > 0 && <span style={{ color: BAD }}>{summary.failed} failed</span>}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-h-0">
                        {view === 'console' ? <ConsolePane />
                          : view === 'compare' ? <ComparePane runs={batchRuns} />
                            : batchRuns.length === 0 && !myDebug
                              ? <OutputPane />
                              : shownRun ? <OutputPane run={shownRun} />
                                : <OutputPane debugOutput={myDebug?.output ?? ''} />}
                      </div>
                    </div>
                  )}
                />
              </div>
            </>
          )}
        </div>

        {myDebug && (
          <div className="flex flex-col flex-shrink-0 min-h-0 overflow-auto"
               style={{ width: 290, borderLeft: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
            <PyDebugPanes scriptId={script?.id} scriptName={script?.name ?? ''} />
            <div className="flex-1" />
            <div className="px-3 py-2.5 text-[10.5px] leading-relaxed"
                 style={{ borderTop: '1px solid var(--color-surface-border)', color: MUTED }}>
              pdb in <code>{myDebug.target.pod}</code>. Ending the session kills the process and removes the copy.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function countWord(n: number): string {
  return ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
}

/** Which pods: grouped by app, running first — a script against a pod that is not up fails at the exec. */
function PodChecklist({ pods, picked, onChange, error }: {
  pods: PickablePod[]; picked: string[]; onChange: (p: string[]) => void; error?: string;
}) {
  const running = pods.filter(p => p.phase === 'Running');
  const toggle = (name: string) => onChange(picked.includes(name) ? picked.filter(n => n !== name) : [...picked, name]);
  const apps = [...new Set(running.map(p => p.app))];
  return (
    <div className="flex flex-col gap-1 p-2.5 overflow-auto" style={{ maxHeight: 360, minWidth: 300 }}>
      {error && <span className="text-[11px]" style={{ color: BAD }}>{error}</span>}
      {!error && running.length === 0 && (
        <span className="text-[11px]" style={{ color: MUTED }}>No running pods in this namespace.</span>
      )}
      {apps.map(app => {
        const mine = running.filter(p => p.app === app);
        const all = mine.every(p => picked.includes(p.name));
        return (
          <div key={app} className="flex flex-col">
            <div className="flex items-center gap-2 py-1"
                 style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
              <CheckboxView size="xs" checked={all} indeterminate={!all && mine.some(p => picked.includes(p.name))}
                            onChange={() => onChange(all
                              ? picked.filter(n => !mine.some(p => p.name === n))
                              : [...new Set([...picked, ...mine.map(p => p.name)])])}
                            label={app} />
              <span className="text-[10.5px]" style={{ color: MUTED }}>{mine.length}</span>
            </div>
            {mine.map(p => (
              <div key={p.name} className="pl-5 py-0.5 rounded"
                   style={{ background: picked.includes(p.name) ? ACCENT_SOFT : undefined }}>
                <CheckboxView size="xs" checked={picked.includes(p.name)} onChange={() => toggle(p.name)} label={p.name} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The outputs, side by side, with the lines that differ marked.
 *
 * Each pod's own name is folded before comparing (see compareOutputs), so
 * the rows that light up are the ones where the pods actually disagree.
 */
function ComparePane({ runs }: { runs: { runId: string; target: PyTarget; chunks: { stream: string; text: string }[] }[] }) {
  const rows = compareOutputs(runs.map(r => ({
    pod: r.target.pod,
    text: r.chunks.filter(c => c.stream !== 'meta').map(c => c.text).join(''),
  })));
  const differing = rows.filter(r => !r.same).length;
  return (
    <div className="h-full overflow-auto">
      <div className="px-3.5 py-1.5 text-[11px]" style={{ color: MUTED }}>
        {rows.length === 0 ? 'Nothing printed yet.'
          : differing === 0 ? 'Every pod printed the same thing.'
            : `${differing} of ${rows.length} lines differ between pods.`}
      </div>
      <table className="font-mono" style={{ fontSize: 11.5, borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            {runs.map(r => (
              <th key={r.runId} className="text-left px-3 py-1"
                  style={{ color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-surface-border)', fontWeight: 600 }}>
                {podShort(r.target.pod)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: row.same ? undefined : 'color-mix(in srgb, var(--color-warning) 9%, transparent)' }}>
              {row.cells.map((c, j) => (
                <td key={j} className="px-3 py-0.5 align-top"
                    style={{ color: row.same ? MUTED : 'var(--color-text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
