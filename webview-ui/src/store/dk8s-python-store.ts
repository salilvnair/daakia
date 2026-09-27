/**
 * Python in a pod — the library, the runs and the one debugger.
 *
 * One store for both places a script is run from: the pod detail's Python tab
 * and the dk8s Scripts screen. They share the library (it is the same list),
 * the gutter (a breakpoint set on one screen is still there on the other) and
 * the debugger (there is one pdb at a time, and the header of the pod it runs
 * in says so whichever screen started it).
 *
 * What lives on the host: the scripts themselves (the workspace's, carried by
 * Git Sync), and every decision about a pod — which interpreter, where the
 * copy goes, whether Python 2 is refused. What lives here is what the reader
 * is doing: unsaved edits, breakpoints, watch expressions, runs in progress.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import { logUiEvent } from './ui-audit-store';
import { newId, statusFromExit, type RunStatus, NEW_SCRIPT } from '../components/k8s/python/py-view';

export interface PyScript {
  id: string;
  name: string;
  folder?: string;
  source: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PyTarget {
  context: string;
  namespace: string;
  pod: string;
  /** Absent means kubectl's default container. */
  container?: string;
}

export const targetKey = (t: PyTarget) => `${t.context}/${t.namespace}/${t.pod}/${t.container ?? ''}`;

export interface PyVerdict {
  ok: boolean;
  interpreter?: 'python3' | 'python';
  version?: { major: number; minor: number; text: string };
  reason: string;
}

/** The host's answer to "what can this container do with a script". */
export interface PyProbe {
  busy: boolean;
  verdict?: PyVerdict;
  base?: string;
  writableDirs: string[];
  python3Version?: string;
  pythonVersion?: string;
  execAllowed?: boolean;
  unreachable?: string;
}

export interface PyProblem {
  line: number;
  message: string;
  fn?: string;
}

export interface PyRun {
  runId: string;
  sessionId: string;
  target: PyTarget;
  scriptId?: string;
  scriptName: string;
  args: string;
  status: RunStatus;
  /** Echoed commands, stdout and stderr, in arrival order. */
  chunks: { stream: 'stdout' | 'stderr' | 'meta'; text: string }[];
  code?: number | null;
  durationMs?: number;
  startedAt: number;
  path?: string;
  base?: string;
  mode?: 'file' | 'stdin';
  command?: string;
  removed?: string;
  refused?: string;
  failedAt?: string;
  problems: PyProblem[];
  version?: string;
}

export interface PyVar {
  name: string;
  type: string;
  value: string;
  size: number;
  children?: { name: string; type: string; value: string }[];
}

export interface PyDebugState {
  status: 'starting' | 'running' | 'paused' | 'finished' | 'ended';
  location?: { file: string; line: number; fn: string; source?: string };
  frames: { file: string; line: number; fn: string; current: boolean }[];
  locals: PyVar[];
  globals: PyVar[];
  watches: { expr: string; value?: string; error?: string }[];
  exception?: string;
  returning?: boolean;
  reason?: 'breakpoint' | 'step' | 'entry' | 'exception';
}

export interface PyDebug {
  debugId: string;
  sessionId: string;
  target: PyTarget;
  scriptId?: string;
  scriptName: string;
  path?: string;
  command?: string;
  version?: string;
  startedAt: number;
  state: PyDebugState;
  console: string;
  output: string;
  /** Set once the host says the session is over, with why. */
  ended?: string;
  failed?: boolean;
  removed?: string;
}

/** A run of one script across several pods, from the Scripts screen. */
export interface PyBatch {
  id: string;
  scriptName: string;
  runIds: string[];
  startedAt: number;
}

/** What one run keeps of its output. A script that prints forever is not an archive. */
const MAX_RUN_TEXT = 512 * 1024;
/** And the debug console, which is a transcript, not a log. */
const MAX_CONSOLE = 256 * 1024;

const clip = (s: string, max: number) => (s.length > max ? s.slice(s.length - max) : s);

interface PyState {
  scripts: PyScript[];
  loaded: boolean;
  selectedId?: string;
  /** Unsaved edits, by script id. */
  drafts: Record<string, { source?: string; name?: string; folder?: string }>;
  breakpoints: Record<string, number[]>;
  disabledBreakpoints: Record<string, number[]>;
  watches: string[];
  args: Record<string, string>;
  probes: Record<string, PyProbe>;
  runs: Record<string, PyRun>;
  /** Newest last. */
  runOrder: string[];
  batches: PyBatch[];
  debug?: PyDebug;
  /** A New or Save as whose reply should select the script it made. */
  pendingSelect?: string;

  loadScripts: () => void;
  select: (id: string | undefined) => void;
  newScript: (folder?: string) => void;
  editSource: (id: string, source: string) => void;
  rename: (id: string, name: string) => void;
  setFolder: (id: string, folder: string) => void;
  save: (id: string) => void;
  saveAs: (id: string, name: string) => void;
  remove: (id: string) => void;
  sourceOf: (id: string | undefined) => string;
  isDirty: (id: string | undefined) => boolean;

  toggleBreakpoint: (id: string, line: number) => void;
  toggleBreakpointEnabled: (id: string, line: number) => void;
  removeBreakpoint: (id: string, line: number) => void;
  clearBreakpoints: () => void;
  addWatch: (expr: string) => void;
  removeWatch: (expr: string) => void;
  setArgs: (id: string, args: string) => void;

  probe: (t: PyTarget, force?: boolean) => void;
  /** `batched` when runMany is the caller, which audits the batch once. */
  run: (t: PyTarget, sessionId: string, scriptId: string, batched?: boolean) => string;
  runMany: (targets: PyTarget[], sessionId: string, scriptId: string) => PyBatch;
  stop: (runId: string) => void;
  clearRuns: (filter: (r: PyRun) => boolean) => void;

  startDebug: (t: PyTarget, sessionId: string, scriptId: string) => void;
  debugCmd: (cmd: 'continue' | 'next' | 'step' | 'return' | 'restart') => void;
  debugConsole: (line: string) => void;
  stopDebug: () => void;
  dismissDebug: () => void;
  endSession: (sessionId: string) => void;

  apply: (msg: Record<string, unknown>) => void;
}

function enabledLines(s: Pick<PyState, 'breakpoints' | 'disabledBreakpoints'>, id: string | undefined): number[] {
  if (!id) return [];
  const off = s.disabledBreakpoints[id] ?? [];
  return (s.breakpoints[id] ?? []).filter(l => !off.includes(l)).sort((a, b) => a - b);
}

export const usePyStore = create<PyState>((set, get) => ({
  scripts: [],
  loaded: false,
  drafts: {},
  breakpoints: {},
  disabledBreakpoints: {},
  watches: [],
  args: {},
  probes: {},
  runs: {},
  runOrder: [],
  batches: [],

  loadScripts: () => postMsg({ type: 'py:scripts:list' }),
  select: (selectedId) => set({ selectedId }),

  newScript: (folder) => {
    const clientId = newId('n');
    set({ pendingSelect: clientId });
    /* Saved straight away rather than held as an unsaved row: a script that
       exists only in this webview is lost to a reload, and the library is the
       workspace's — it should show what the workspace has. */
    postMsg({
      type: 'py:scripts:save', clientId,
      script: { name: uniqueName(get().scripts, 'untitled.py'), folder, source: NEW_SCRIPT },
    });
  },

  editSource: (id, source) => set(s => ({ drafts: { ...s.drafts, [id]: { ...s.drafts[id], source } } })),
  rename: (id, name) => set(s => ({ drafts: { ...s.drafts, [id]: { ...s.drafts[id], name } } })),
  setFolder: (id, folder) => set(s => ({ drafts: { ...s.drafts, [id]: { ...s.drafts[id], folder } } })),

  save: (id) => {
    const s = get();
    const script = s.scripts.find(x => x.id === id);
    if (!script) return;
    const d = s.drafts[id] ?? {};
    postMsg({
      type: 'py:scripts:save',
      script: {
        id, name: d.name ?? script.name, folder: d.folder ?? script.folder,
        source: d.source ?? script.source,
      },
    });
    set(st => {
      const drafts = { ...st.drafts };
      delete drafts[id];
      return { drafts };
    });
  },

  saveAs: (id, name) => {
    const s = get();
    const script = s.scripts.find(x => x.id === id);
    if (!script || !name.trim()) return;
    const clientId = newId('n');
    const d = s.drafts[id] ?? {};
    set({ pendingSelect: clientId });
    postMsg({
      type: 'py:scripts:save', clientId,
      script: { name, folder: d.folder ?? script.folder, source: d.source ?? script.source },
    });
    // The original keeps what it had; the edits went to the copy.
    set(st => {
      const drafts = { ...st.drafts };
      delete drafts[id];
      return { drafts };
    });
  },

  remove: (id) => {
    postMsg({ type: 'py:scripts:delete', id });
    set(s => ({ selectedId: s.selectedId === id ? undefined : s.selectedId }));
  },

  sourceOf: (id) => {
    if (!id) return '';
    const s = get();
    return s.drafts[id]?.source ?? s.scripts.find(x => x.id === id)?.source ?? '';
  },

  isDirty: (id) => {
    if (!id) return false;
    const s = get();
    const d = s.drafts[id];
    const script = s.scripts.find(x => x.id === id);
    if (!d || !script) return false;
    return (d.source !== undefined && d.source !== script.source)
      || (d.name !== undefined && d.name !== script.name)
      || (d.folder !== undefined && (d.folder || undefined) !== script.folder);
  },

  toggleBreakpoint: (id, line) => {
    set(s => {
      const cur = s.breakpoints[id] ?? [];
      const next = cur.includes(line) ? cur.filter(l => l !== line) : [...cur, line].sort((a, b) => a - b);
      const off = (s.disabledBreakpoints[id] ?? []).filter(l => next.includes(l));
      return {
        breakpoints: { ...s.breakpoints, [id]: next },
        disabledBreakpoints: { ...s.disabledBreakpoints, [id]: off },
      };
    });
    syncDebugBreakpoints();
  },
  toggleBreakpointEnabled: (id, line) => {
    set(s => {
      const off = s.disabledBreakpoints[id] ?? [];
      return {
        disabledBreakpoints: {
          ...s.disabledBreakpoints,
          [id]: off.includes(line) ? off.filter(l => l !== line) : [...off, line],
        },
      };
    });
    syncDebugBreakpoints();
  },
  removeBreakpoint: (id, line) => {
    set(s => ({
      breakpoints: { ...s.breakpoints, [id]: (s.breakpoints[id] ?? []).filter(l => l !== line) },
      disabledBreakpoints: { ...s.disabledBreakpoints, [id]: (s.disabledBreakpoints[id] ?? []).filter(l => l !== line) },
    }));
    syncDebugBreakpoints();
  },
  clearBreakpoints: () => {
    set({ breakpoints: {}, disabledBreakpoints: {} });
    syncDebugBreakpoints();
  },

  addWatch: (expr) => {
    const e = expr.trim();
    if (!e || get().watches.includes(e)) return;
    set(s => ({ watches: [...s.watches, e] }));
    syncDebugWatches();
  },
  removeWatch: (expr) => {
    set(s => ({ watches: s.watches.filter(w => w !== expr) }));
    syncDebugWatches();
  },
  setArgs: (id, args) => set(s => ({ args: { ...s.args, [id]: args } })),

  probe: (t, force) => {
    const key = targetKey(t);
    const cur = get().probes[key];
    if (cur && !force && (cur.busy || cur.verdict)) return;
    set(s => ({ probes: { ...s.probes, [key]: { busy: true, writableDirs: cur?.writableDirs ?? [] } } }));
    postMsg({ type: 'py:probe', ...t });
  },

  run: (t, sessionId, scriptId, batched) => {
    const s = get();
    if (!batched) logUiEvent('dk8s.python_run', { pods: 1 });
    const script = s.scripts.find(x => x.id === scriptId);
    const runId = newId('r');
    const name = s.drafts[scriptId]?.name ?? script?.name ?? 'script.py';
    const args = s.args[scriptId] ?? '';
    const r: PyRun = {
      runId, sessionId, target: t, scriptId, scriptName: name, args,
      status: 'running', chunks: [], startedAt: Date.now(), problems: [],
    };
    set(st => ({ runs: { ...st.runs, [runId]: r }, runOrder: [...st.runOrder, runId] }));
    postMsg({
      type: 'py:run', runId, sessionId, ...t,
      scriptName: name, source: s.sourceOf(scriptId), args,
    });
    return runId;
  },

  runMany: (targets, sessionId, scriptId) => {
    const runIds = targets.map(t => get().run(t, sessionId, scriptId, true));
    logUiEvent('dk8s.python_run', { pods: targets.length });
    const script = get().scripts.find(x => x.id === scriptId);
    const batch: PyBatch = { id: newId('b'), scriptName: script?.name ?? 'script.py', runIds, startedAt: Date.now() };
    set(s => ({ batches: [...s.batches.slice(-19), batch] }));
    return batch;
  },

  stop: (runId) => postMsg({ type: 'py:stop', runId }),

  clearRuns: (filter) => set(s => {
    const runs = { ...s.runs };
    for (const id of Object.keys(runs)) if (filter(runs[id]) && runs[id].status !== 'running') delete runs[id];
    return { runs, runOrder: s.runOrder.filter(id => runs[id]) };
  }),

  startDebug: (t, sessionId, scriptId) => {
    const s = get();
    if (s.debug && !s.debug.ended) return;
    const script = s.scripts.find(x => x.id === scriptId);
    const debugId = newId('d');
    const name = s.drafts[scriptId]?.name ?? script?.name ?? 'script.py';
    logUiEvent('dk8s.python_debug', { breakpoints: enabledLines(s, scriptId).length });
    set({
      debug: {
        debugId, sessionId, target: t, scriptId, scriptName: name, startedAt: Date.now(),
        state: { status: 'starting', frames: [], locals: [], globals: [], watches: [] },
        console: '', output: '',
      },
    });
    postMsg({
      type: 'py:debug:start', debugId, sessionId, ...t,
      scriptName: name, source: s.sourceOf(scriptId), args: s.args[scriptId] ?? '',
      breakpoints: enabledLines(s, scriptId), watches: s.watches,
    });
  },

  debugCmd: (cmd) => {
    const d = get().debug;
    if (!d || d.ended) return;
    postMsg({ type: 'py:debug:cmd', debugId: d.debugId, cmd });
  },

  debugConsole: (line) => {
    const d = get().debug;
    if (!d || d.ended || !line.trim()) return;
    postMsg({ type: 'py:debug:console', debugId: d.debugId, line });
  },

  stopDebug: () => {
    const d = get().debug;
    if (!d || d.ended) return;
    postMsg({ type: 'py:debug:stop', debugId: d.debugId });
  },

  dismissDebug: () => set(s => (s.debug?.ended ? { debug: undefined } : {})),

  endSession: (sessionId) => {
    const d = get().debug;
    if (d && d.sessionId === sessionId && !d.ended) get().stopDebug();
    for (const id of get().runOrder) {
      const r = get().runs[id];
      if (r?.sessionId === sessionId && r.status === 'running') get().stop(id);
    }
    postMsg({ type: 'py:endSession', sessionId });
  },

  apply: (msg) => {
    const type = String(msg.type ?? '');
    switch (type) {
      case 'py:scripts': {
        const scripts = (msg.scripts as PyScript[]) ?? [];
        const pending = get().pendingSelect;
        const pick = pending && msg.clientId === pending ? String(msg.savedId ?? '') : undefined;
        set(s => ({
          scripts,
          loaded: true,
          pendingSelect: pick ? undefined : s.pendingSelect,
          selectedId: pick || (s.selectedId && scripts.some(x => x.id === s.selectedId)
            ? s.selectedId : scripts[0]?.id),
        }));
        break;
      }
      case 'py:probed': {
        const key = String(msg.key ?? '');
        set(s => ({
          probes: {
            ...s.probes,
            [key]: {
              busy: false,
              verdict: msg.verdict as PyVerdict,
              base: msg.base as string | undefined,
              writableDirs: (msg.writableDirs as string[]) ?? [],
              python3Version: msg.python3Version as string | undefined,
              pythonVersion: msg.pythonVersion as string | undefined,
              execAllowed: msg.execAllowed as boolean | undefined,
              unreachable: msg.unreachable as string | undefined,
            },
          },
        }));
        break;
      }
      case 'py:runStarted':
        patchRun(String(msg.runId), {
          path: msg.path as string | undefined,
          base: msg.base as string | undefined,
          mode: msg.mode as 'file' | 'stdin',
          command: msg.command as string,
          version: msg.version as string | undefined,
        });
        break;
      case 'py:runOutput': {
        const id = String(msg.runId);
        const r = get().runs[id];
        if (!r) break;
        const text = String(msg.text ?? '');
        const chunks = [...r.chunks, { stream: msg.stream as 'stdout' | 'stderr' | 'meta', text }];
        // Oldest dropped first: the end of a long output is where it failed.
        let total = chunks.reduce((n, c) => n + c.text.length, 0);
        while (total > MAX_RUN_TEXT && chunks.length > 1) total -= chunks.shift()!.text.length;
        patchRun(id, { chunks });
        break;
      }
      case 'py:runExit': {
        const id = String(msg.runId);
        const code = (msg.code as number | null | undefined) ?? null;
        patchRun(id, {
          status: statusFromExit({ code, refused: msg.refused as string | undefined, stopped: !!msg.stopped }),
          code,
          durationMs: msg.durationMs as number | undefined,
          removed: msg.removed as string | undefined,
          refused: msg.refused as string | undefined,
          failedAt: msg.failedAt as string | undefined,
          problems: (msg.problems as PyProblem[]) ?? [],
        });
        break;
      }
      case 'py:debug:started':
        patchDebug(String(msg.debugId), {
          path: msg.path as string, command: msg.command as string, version: msg.version as string | undefined,
        });
        break;
      case 'py:debug:state':
        patchDebug(String(msg.debugId), { state: msg.state as PyDebugState, path: msg.path as string });
        break;
      case 'py:debug:console': {
        const d = get().debug;
        if (!d || d.debugId !== msg.debugId) break;
        patchDebug(d.debugId, { console: clip(d.console + String(msg.text ?? ''), MAX_CONSOLE) });
        break;
      }
      case 'py:debug:output': {
        const d = get().debug;
        if (!d || d.debugId !== msg.debugId) break;
        patchDebug(d.debugId, { output: clip(d.output + String(msg.text ?? ''), MAX_RUN_TEXT) });
        break;
      }
      case 'py:debug:ended': {
        const d = get().debug;
        if (!d || d.debugId !== msg.debugId) break;
        patchDebug(d.debugId, {
          ended: String(msg.reason ?? 'ended'),
          failed: !!msg.failed,
          removed: msg.removed as string | undefined,
          state: { ...d.state, status: d.state.status === 'finished' ? 'finished' : 'ended' },
        });
        break;
      }
    }
  },
}));

function patchRun(id: string, patch: Partial<PyRun>): void {
  usePyStore.setState(s => (s.runs[id] ? { runs: { ...s.runs, [id]: { ...s.runs[id], ...patch } } } : {}));
}

function patchDebug(id: string, patch: Partial<PyDebug>): void {
  usePyStore.setState(s => (s.debug?.debugId === id ? { debug: { ...s.debug, ...patch } } : {}));
}

/** The gutter is the truth; a live pdb is told whenever it changes. */
function syncDebugBreakpoints(): void {
  const s = usePyStore.getState();
  const d = s.debug;
  if (!d || d.ended) return;
  postMsg({ type: 'py:debug:breakpoints', debugId: d.debugId, lines: enabledLines(s, d.scriptId) });
}

function syncDebugWatches(): void {
  const s = usePyStore.getState();
  const d = s.debug;
  if (!d || d.ended) return;
  postMsg({ type: 'py:debug:watches', debugId: d.debugId, exprs: s.watches });
}

export function enabledBreakpoints(id: string | undefined): number[] {
  return enabledLines(usePyStore.getState(), id);
}

/** `untitled.py`, then `untitled-2.py` — a New that collides is a New that overwrote. */
export function uniqueName(scripts: { name: string }[], want: string): string {
  if (!scripts.some(s => s.name === want)) return want;
  const stem = want.replace(/\.py$/, '');
  for (let i = 2; i < 1000; i++) {
    const n = `${stem}-${i}.py`;
    if (!scripts.some(s => s.name === n)) return n;
  }
  return `${stem}-${Date.now()}.py`;
}

/*
  One listener for the whole webview, installed on first use.

  The pod tab and the Scripts screen both need these replies, and either can
  be the first mounted; a listener per component would apply every reply
  twice while both are.
*/
let listening = false;
export function ensurePyListener(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('message', (e: MessageEvent) => {
    const m = e.data as Record<string, unknown> | undefined;
    if (!m || typeof m.type !== 'string' || !m.type.startsWith('py:')) return;
    usePyStore.getState().apply(m);
  });
  /* A workspace switch changes which library is the library. */
  window.addEventListener('message', (e: MessageEvent) => {
    const m = e.data as Record<string, unknown> | undefined;
    if (m?.type === 'workspacesData' && usePyStore.getState().loaded) usePyStore.getState().loadScripts();
  });
}
