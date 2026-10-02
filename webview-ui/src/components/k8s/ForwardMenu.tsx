/**
 * The ⋯ on a forward — what to do with the address once it is up, from the
 * plan's "use it" menu: a request tab on it, an environment variable that
 * follows it, the pod's OpenAPI as a collection, the actuator, the debugger;
 * the address copied in the shape the next tool wants; save it, restart it.
 *
 * On a running forward only — a stopped one has nothing to use.
 */
import { useRef, useState } from 'react';
import { ContextMenuView, IconSize, ModalView, type ContextMenuItem } from '@salilvnair/dui';
import { usePortForwardStore, type ForwardInfo, type ForwardPort } from '../../store/dk8s-port-forward-store';
import { useTabsStore, type Protocol, type RequestTab } from '../../store/tabs-store';
import { useEnvStore, GLOBAL_ENV_ID } from '../../store/env-store';
import { useToastStore } from '../../store/toast-store';
import { tidySeparators } from '../shared/menus/ContextMenu';
import {
  PlusIcon, VariableIcon, DownloadIcon, GaugeIcon, BugIcon, CopyIcon, StarIcon, RestartIcon,
  RestApiIcon, GraphQLIcon, WebSocketIcon, GrpcIcon,
} from '../../icons';
import { snippetsFor, connectionUrl, targetName } from './forward-snippets';
import { useBindings, bindingsFor, bind, unbind, suggestKey, type Binding } from './forward-bindings';
import { SaveToSetDialog } from './SaveToSet';
import { ActuatorDialog } from './ActuatorDialog';
import { PF, tint, PfButton } from './pf-ui';

const toast = (type: 'success' | 'error' | 'info', message: string) =>
  useToastStore.getState().addToast({ type, message, duration: type === 'error' ? 9000 : 5000 });

/** The port a request goes to: the HTTP one, else the actuator, else the first. */
export function webPort(f: ForwardInfo): ForwardPort | undefined {
  return f.ports.find(p => p.role === 'http' || !p.role) ?? f.ports.find(p => p.role === 'actuator' || p.role === 'metrics');
}

/**
 * A request tab on the forward. Through `{{variable}}` when the port is bound
 * to one — so the tab keeps working when the forward comes back elsewhere.
 */
export function openRequestHere(f: ForwardInfo, p: ForwardPort, protocol: Protocol, bound?: Binding): void {
  const s = useTabsStore.getState();
  const http = bound ? `{{${bound.key}}}` : connectionUrl(p);
  const partial: Partial<RequestTab> = { protocol, name: `${targetName(f)} :${p.local}` };
  if (protocol === 'rest') Object.assign(partial, { url: `${http}/` });
  else if (protocol === 'graphql') Object.assign(partial, { url: `${http}/graphql`, bodyMode: 'graphql', bodyRaw: 'query {\n  __typename\n}' });
  else if (protocol === 'websocket') Object.assign(partial, { url: `ws://localhost:${p.local}/`, authData: { rt_protocol: 'websocket', ws_format: 'json' } });
  else if (protocol === 'grpc') Object.assign(partial, { url: `localhost:${p.local}`, grpcMessage: '{\n  \n}' });
  if (bound && bound.envId !== GLOBAL_ENV_ID) partial.envId = bound.envId;
  s.addTab(partial);
  /* Brings the protocol's rail button along — addTab alone leaves the old one lit. */
  s.setActiveTab(useTabsStore.getState().activeTabId);
}

export function ForwardMenuButton({ f }: { f: ForwardInfo }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'bind' | 'actuator' | 'save' | null>(null);
  const bindings = useBindings();
  const web = webPort(f);
  const grpc = f.ports.find(p => p.role === 'grpc');
  const debug = f.ports.find(p => p.role === 'debug');
  const up = f.state === 'forwarding';
  const bound = web ? bindingsFor(bindings, f, web)[0] : undefined;
  const { restart, openApi, attach } = usePortForwardStore.getState();
  const act = (fn: () => void) => () => { setOpen(false); fn(); };
  const icon = (I: typeof PlusIcon) => <I size={IconSize.action} />;

  const request: ContextMenuItem[] = [
    ...(web ? [
      { id: 'rest', label: 'REST', icon: icon(RestApiIcon), description: bound ? `{{${bound.key}}}/` : `${connectionUrl(web)}/`, onClick: act(() => openRequestHere(f, web, 'rest', bound)) },
      { id: 'graphql', label: 'GraphQL', icon: icon(GraphQLIcon), description: '/graphql', onClick: act(() => openRequestHere(f, web, 'graphql', bound)) },
      { id: 'ws', label: 'WebSocket', icon: icon(WebSocketIcon), description: `ws://localhost:${web.local}/`, onClick: act(() => openRequestHere(f, web, 'websocket')) },
    ] : []),
    ...(grpc || web ? [{ id: 'grpc', label: 'gRPC', icon: icon(GrpcIcon), description: `localhost:${(grpc ?? web)!.local}`, onClick: act(() => openRequestHere(f, (grpc ?? web)!, 'grpc')) }] : []),
  ];

  const importSpec = async () => {
    toast('info', `Looking for an OpenAPI document on ${targetName(f)}…`);
    const r = await openApi(f);
    if (r.ok) toast('success', `Imported "${r.name}" — ${r.count} request${r.count === 1 ? '' : 's'} from ${r.path}${r.pointed ? `, pointed at localhost:${r.port}` : ''}.`);
    else toast('error', r.error ?? 'No OpenAPI document found.');
  };

  const attachAs = (kind: 'java' | 'python') => async () => {
    if (!debug) return;
    const r = await attach(f, debug.local, kind);
    if (r.ok) toast('success', `Debugger attached — ${r.name}.`);
    else toast('error', r.error ?? 'The debugger did not attach.');
  };

  const snippets = snippetsFor(f);
  const items: ContextMenuItem[] = tidySeparators<ContextMenuItem>([
    ...(request.length ? [{ id: 'req', label: 'New request here', icon: icon(PlusIcon), children: request }] : []),
    ...(web ? [{
      id: 'bind', label: bound ? `Bound to {{${bound.key}}}` : 'Bind to an environment variable…', icon: icon(VariableIcon),
      description: bound ? envName(bound.envId) : undefined, onClick: act(() => setDialog('bind')),
    }] : []),
    ...(web ? [{ id: 'openapi', label: 'Import its OpenAPI as a collection', icon: icon(DownloadIcon), onClick: act(() => void importSpec()) }] : []),
    ...(web ? [{ id: 'actuator', label: 'Actuator: health · info · metrics', icon: icon(GaugeIcon), onClick: act(() => setDialog('actuator')) }] : []),
    ...(debug ? [{
      id: 'attach', label: 'Attach VS Code debugger', icon: icon(BugIcon), shortcut: `:${debug.local}`,
      children: [
        { id: 'java', label: 'Java (JDWP)', description: debug.remote === 5678 ? undefined : 'likely', onClick: act(() => void attachAs('java')()) },
        { id: 'python', label: 'Python (debugpy)', description: debug.remote === 5678 ? 'likely' : undefined, onClick: act(() => void attachAs('python')()) },
      ],
    }] : []),
    { id: 's1', label: '', separator: true },
    {
      id: 'copy', label: 'Copy as', icon: icon(CopyIcon),
      children: snippets.map(s => ({
        id: s.id, label: s.label, description: s.hint,
        onClick: act(() => { void navigator.clipboard?.writeText(s.text); toast('success', `Copied the ${s.label.toLowerCase()}.`); }),
      })),
    },
    { id: 's2', label: '', separator: true },
    { id: 'save', label: 'Save to a set…', icon: icon(StarIcon), onClick: act(() => setDialog('save')) },
    { id: 'restart', label: 'Restart the tunnel', icon: icon(RestartIcon), description: 'same local port', disabled: !up && f.state !== 'reconnecting', onClick: act(() => restart(f.id)) },
  ]);

  return (
    <>
      <PfButton ref={btn} tone="ghost" aria-label="Use this forward" aria-haspopup="menu" title="Use it — a request tab, a variable, the actuator, the debugger, copy as…"
                onClick={() => setOpen(o => !o)} style={{ padding: '0 8px', letterSpacing: 1 }}>⋯</PfButton>
      <ContextMenuView open={open} anchorEl={btn.current} align="right" width={290} onClose={() => setOpen(false)} items={items} />
      {dialog === 'save' && (
        <SaveToSetDialog onClose={() => setDialog(null)}
                         item={{ context: f.context, namespace: f.namespace, pod: f.pod, workload: f.workload, service: f.service, ports: f.ports }} />
      )}
      {dialog === 'bind' && web && <BindDialog f={f} p={web} bound={bound} onClose={() => setDialog(null)} />}
      {dialog === 'actuator' && <ActuatorDialog f={f} onClose={() => setDialog(null)} />}
    </>
  );
}

const envName = (id: string) => useEnvStore.getState().environments.find(e => e.id === id)?.name ?? id;

/** Bind the forward's address to `{{key}}` in an environment — kept in step as the forward moves. */
function BindDialog({ f, p, bound, onClose }: { f: ForwardInfo; p: ForwardPort; bound?: Binding; onClose: () => void }) {
  const envs = useEnvStore(s => s.environments);
  const active = useEnvStore(s => s.activeEnvId);
  const [envId, setEnvId] = useState(bound?.envId ?? active ?? GLOBAL_ENV_ID);
  const [key, setKey] = useState(bound?.key ?? suggestKey(f, p));
  const ok = /^[A-Za-z_][\w.-]{0,60}$/.test(key) && envs.some(e => e.id === envId);
  const taken = envs.find(e => e.id === envId)?.variables.some(v => v.key === key && (!bound || bound.key !== key));

  return (
    <ModalView open onClose={onClose} size="sm" title="Bind to an environment variable"
               footerLeft={bound ? <PfButton tone="stop" onClick={() => { unbind(bound); onClose(); }}>Unbind</PfButton> : undefined}
               footerRight={
                 <div style={{ display: 'flex', gap: 8 }}>
                   <PfButton onClick={onClose}>Cancel</PfButton>
                   <PfButton tone="solid" disabled={!ok} onClick={() => { if (bound) unbind(bound); bind(f, p, envId, key); onClose(); }}>Bind</PfButton>
                 </div>
               }>
      <div className="flex flex-col" style={{ gap: 12, fontSize: 12.5, color: PF.mu }}>
        <p style={{ margin: 0 }}>
          <b style={{ color: PF.tx, fontFamily: PF.mono }}>{`{{${key || '…'}}}`}</b> becomes <b style={{ color: PF.tx, fontFamily: PF.mono }}>{connectionUrl(p)}</b> —
          and follows this forward when it comes back on another local port, so saved requests that use it go through the tunnel unchanged.
        </p>
        <label className="flex flex-col" style={{ gap: 4 }}>
          <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase' }}>Environment</span>
          <select value={envId} onChange={e => setEnvId(e.target.value)} className="outline-none"
                  style={{ padding: '5px 8px', borderRadius: 7, fontSize: 12.5, color: PF.tx, border: `1px solid ${PF.bd}`, background: PF.well }}>
            {envs.map(e => <option key={e.id} value={e.id}>{e.name}{e.id === active ? ' (active)' : ''}</option>)}
          </select>
        </label>
        <label className="flex flex-col" style={{ gap: 4 }}>
          <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase' }}>Variable</span>
          <input value={key} onChange={e => setKey(e.target.value.trim().slice(0, 60))} aria-label="Variable name" className="outline-none"
                 style={{ padding: '5px 8px', borderRadius: 7, fontSize: 12.5, fontFamily: PF.mono, color: PF.tx, border: `1px solid ${ok ? PF.bd : tint(PF.er, 60)}`, background: PF.well }} />
        </label>
        {taken && <span style={{ color: PF.wa, fontSize: 11.5 }}>{key} already exists there — binding sets its value to this forward.</span>}
      </div>
    </ModalView>
  );
}
