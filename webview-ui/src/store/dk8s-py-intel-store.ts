/**
 * IntelliSense answers from the container, for the Python editor.
 *
 * The host asks the pod's own python3 to parse the script and list what its
 * imports really hold (pod-pyintel). This keeps the answers: the latest
 * diagnostics per script, which drive the squiggles, and — per container — the
 * members of every module seen so far, which drive completion and hover.
 * Members are kept apart from the diagnostics and outside React state: they
 * are read when the editor asks, never rendered, and `os` alone is three
 * hundred rows that do not change between keystrokes.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import { newId } from '../components/k8s/python/py-view';
import type { PyTarget } from './dk8s-python-store';

export type IntelKind = 'module' | 'class' | 'function' | 'variable' | 'keyword';
/** name, kind, signature, first line of the docs (a value's type, for a variable). */
export type IntelMember = [string, IntelKind, string, string];

export interface IntelDiagnostic {
  line: number;
  col: number;
  endCol: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface ScriptIntel {
  diagnostics: IntelDiagnostic[];
  /** The script's names for modules: `np` → `numpy`. */
  aliases: Record<string, string>;
  defined: string[];
  version?: string;
  /** Why there is no answer, when there is not one. */
  error?: string;
  /** Which container answered. */
  key: string;
}

export function intelKey(t: PyTarget): string {
  return `${t.context}/${t.namespace}/${t.pod}/${t.container ?? ''}`;
}

/* Per container: module chain → members, and the builtins. */
const modules = new Map<string, Map<string, IntelMember[]>>();
const builtins = new Map<string, IntelMember[]>();

export function membersOf(key: string, chain: string): IntelMember[] | undefined {
  return modules.get(key)?.get(chain);
}

export function builtinsOf(key: string): IntelMember[] {
  return builtins.get(key) ?? [];
}

interface State {
  byScript: Record<string, ScriptIntel>;
  analyze: (t: PyTarget, scriptId: string, source: string) => void;
}

/* The request each script is waiting on; an older answer is dropped. */
const latest = new Map<string, string>();

export const usePyIntelStore = create<State>(() => ({
  byScript: {},
  analyze: (t, scriptId, source) => {
    const reqId = newId('in-');
    latest.set(scriptId, reqId);
    const key = intelKey(t);
    postMsg({
      type: 'py:intel', reqId, scriptId, source,
      context: t.context, namespace: t.namespace, pod: t.pod, container: t.container,
      known: [...(modules.get(key)?.keys() ?? [])],
    });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('message', (evt: MessageEvent) => {
    const m = evt.data as Record<string, unknown> | undefined;
    if (!m || m.type !== 'py:intel') return;
    const scriptId = String(m.scriptId ?? '');
    if (latest.get(scriptId) !== m.reqId) return;
    const key = String(m.key ?? '');
    if (typeof m.error === 'string') {
      usePyIntelStore.setState(s => ({
        byScript: { ...s.byScript, [scriptId]: { diagnostics: [], aliases: {}, defined: [], error: m.error as string, key } },
      }));
      return;
    }
    const mods = modules.get(key) ?? new Map<string, IntelMember[]>();
    for (const [chain, list] of Object.entries((m.modules as Record<string, IntelMember[]>) ?? {})) {
      if (Array.isArray(list)) mods.set(chain, list);
    }
    modules.set(key, mods);
    if (Array.isArray(m.names) && m.names.length) builtins.set(key, m.names as IntelMember[]);
    usePyIntelStore.setState(s => ({
      byScript: {
        ...s.byScript,
        [scriptId]: {
          diagnostics: Array.isArray(m.diagnostics) ? m.diagnostics as IntelDiagnostic[] : [],
          aliases: (m.aliases as Record<string, string>) ?? {},
          defined: Array.isArray(m.defined) ? m.defined as string[] : [],
          version: m.version as string | undefined,
          key,
        },
      },
    }));
  });
}

/**
 * The module a dotted chain names, by the script's own aliases: `np.linalg`
 * with `np` → `numpy` is `numpy.linalg`. Undefined when the chain does not
 * start at an imported module.
 */
export function chainModule(chain: string, aliases: Record<string, string>): string | undefined {
  const [head, ...rest] = chain.split('.');
  const mod = aliases[head];
  if (!mod) return undefined;
  return [mod, ...rest].join('.');
}
