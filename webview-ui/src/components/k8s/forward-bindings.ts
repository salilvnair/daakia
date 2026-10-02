/**
 * A forward bound to an environment variable: `{{zp_backend}}` in "dev" is
 * `http://localhost:8080` while that forward is up, and follows it when it
 * comes back on another local port — so every saved request that says
 * `{{zp_backend}}/api/…` goes through the tunnel without being edited.
 *
 * A binding names what it forwards (the Service, else the workload, else the
 * pod) and the remote port, not a forward id: forwards come and go, the
 * binding outlives them. Kept per machine — the address is this machine's.
 */
import { useMemo } from 'react';
import { useUiStateStore } from '../../store/ui-state-store';
import { useEnvStore, type EnvVariable } from '../../store/env-store';
import type { ForwardInfo, ForwardPort } from '../../store/dk8s-port-forward-store';
import { connectionUrl, targetName } from './forward-snippets';

export const PF_BINDINGS_PREF = 'dk8s.pf.bindings';

export interface Binding {
  envId: string;
  key: string;
  context: string;
  namespace: string;
  service?: string;
  workload?: string;
  pod?: string;
  remote: number;
}

export function parseBindings(raw: string | undefined): Binding[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter(b => b && typeof b.key === 'string' && typeof b.envId === 'string' && Number.isInteger(b.remote)) : [];
  } catch { return []; }
}

export function useBindings(): Binding[] {
  const raw = useUiStateStore(s => s.prefs[PF_BINDINGS_PREF]);
  return useMemo(() => parseBindings(raw), [raw]);
}

const saveBindings = (b: Binding[]) => useUiStateStore.getState().setPref(PF_BINDINGS_PREF, JSON.stringify(b));

/** What a binding holds on to: the Service, else the workload, else the pod. */
function targetOf(f: Pick<ForwardInfo, 'service' | 'workload' | 'pod'>): Pick<Binding, 'service' | 'workload' | 'pod'> {
  return f.service ? { service: f.service } : f.workload ? { workload: f.workload.name } : { pod: f.pod };
}

export function bindingMatches(b: Binding, f: ForwardInfo, p: ForwardPort): boolean {
  if (b.context !== f.context || b.namespace !== f.namespace || b.remote !== p.remote) return false;
  if (b.service) return f.service === b.service;
  if (f.service) return false;
  return b.workload ? f.workload?.name === b.workload : f.pod === b.pod;
}

/** The bindings that apply to one port of a forward. */
export function bindingsFor(bindings: Binding[], f: ForwardInfo, p: ForwardPort): Binding[] {
  return bindings.filter(b => bindingMatches(b, f, p));
}

/** `zp-backend` → `zp_backend`; an actuator port gets `_management`. */
export function suggestKey(f: ForwardInfo, p: ForwardPort): string {
  const base = targetName(f).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'service';
  return p.role === 'actuator' ? `${base}_management` : f.ports.filter(o => o.role === p.role).length > 1 ? `${base}_${p.remote}` : base;
}

/** Set `key` in an environment, adding it if it is not there. */
export function setEnvVar(envId: string, key: string, value: string): boolean {
  const env = useEnvStore.getState();
  const target = env.environments.find(e => e.id === envId);
  if (!target) return false;
  const has = target.variables.find(v => v.key === key);
  if (has && has.currentValue === value) return true;
  const next: EnvVariable[] = has
    ? target.variables.map(v => (v.key === key ? { ...v, currentValue: value } : v))
    : [...target.variables, { id: crypto.randomUUID(), key, initialValue: value, currentValue: value, isSecret: false }];
  env.updateVariables(envId, next);
  return true;
}

/** Bind a forward's port to `{{key}}` in an environment, and set it now. One binding per variable. */
export function bind(f: ForwardInfo, p: ForwardPort, envId: string, key: string): void {
  const b: Binding = { envId, key, context: f.context, namespace: f.namespace, ...targetOf(f), remote: p.remote };
  const rest = parseBindings(useUiStateStore.getState().prefs[PF_BINDINGS_PREF]).filter(o => !(o.envId === envId && o.key === key));
  saveBindings([...rest, b]);
  setEnvVar(envId, key, connectionUrl(p));
}

export function unbind(b: Binding): void {
  saveBindings(parseBindings(useUiStateStore.getState().prefs[PF_BINDINGS_PREF]).filter(o => !(o.envId === b.envId && o.key === b.key)));
}

/**
 * Keep every bound variable on its forward's current address. Run on each
 * forward list: a forward that came back on another local port moves its
 * variables with it. A variable whose forward is down is left as it was.
 */
export function syncBindings(forwards: ForwardInfo[]): void {
  const bindings = parseBindings(useUiStateStore.getState().prefs[PF_BINDINGS_PREF]);
  if (!bindings.length) return;
  for (const b of bindings) {
    for (const f of forwards) {
      if (f.state !== 'forwarding') continue;
      const p = f.ports.find(x => bindingMatches(b, f, x));
      if (p) { setEnvVar(b.envId, b.key, connectionUrl(p)); break; }
    }
  }
}
