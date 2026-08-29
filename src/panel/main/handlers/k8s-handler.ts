/**
 * dk8s handler — the extension-host side of the Kubernetes tab.
 *
 * Every message is a question about a cluster; none of them mutate one. The
 * only write dk8s ever performs is the detach-before-dump flow, which is not
 * part of M1.
 *
 * Selections are persisted through the settings store rather than webview
 * localStorage, because the host is what runs kubectl and it needs to know the
 * context without asking the UI for it on every call.
 */
import { probeEnvironment, setKubectlPath } from '../../../services/k8s/kubectl';
import {
  listContexts, checkReachable, listNamespaces, defaultNamespace, looksLikeProduction,
} from '../../../services/k8s/kube-context';
import { getSetting, setSetting } from '../../../storage/db';

type PostMessage = (msg: unknown) => void;

/** Persisted across sessions so the tab reopens where the user left it. */
export interface Dk8sState {
  context?: string;
  namespace?: string;
  /** context name -> sensitivity, set by the user and never inferred silently. */
  sensitivity?: Record<string, 'normal' | 'production'>;
  kubectlPath?: string;
}

function state(): Dk8sState {
  return getSetting<Dk8sState>('dk8s') ?? {};
}

function saveState(patch: Partial<Dk8sState>): Dk8sState {
  const next = { ...state(), ...patch };
  setSetting('dk8s', next);
  return next;
}

/**
 * Probe the environment: is kubectl here, is a context selected, does the
 * cluster answer. Everything the first-run screen needs in one round trip, so
 * the UI never has to render a half-known state.
 */
export async function handleDk8sProbe(postMessage: PostMessage): Promise<void> {
  const saved = state();
  if (saved.kubectlPath) setKubectlPath(saved.kubectlPath);

  const env = await probeEnvironment();
  if (!env.present) {
    postMessage({ type: 'dk8s:env', env, contexts: [], platform: process.platform });
    return;
  }

  const list = await listContexts();
  // Prefer what the user chose here before falling back to the kubeconfig's
  // current-context: dk8s never changes the global default, so the two can
  // legitimately differ and ours wins inside the tab.
  const chosen = saved.context && list.contexts.some(c => c.name === saved.context)
    ? saved.context
    : list.current;

  let reachable;
  let namespace = saved.namespace;
  if (chosen) {
    reachable = await checkReachable(chosen);
    if (!namespace) namespace = await defaultNamespace(chosen);
  }

  postMessage({
    type: 'dk8s:env',
    env,
    platform: process.platform,
    contexts: list.contexts,
    contextError: list.error,
    context: chosen,
    namespace,
    reachable,
    sensitivity: saved.sensitivity ?? {},
    // A context the user has not classified yet needs the one-time prompt.
    needsSensitivity: chosen ? !(saved.sensitivity ?? {})[chosen] : false,
    sensitivityGuess: chosen
      ? looksLikeProduction(chosen, list.contexts.find(c => c.name === chosen)?.cluster ?? '')
      : false,
  });
}

/** Select a context for this tab. Does NOT touch the global kubeconfig. */
export async function handleDk8sUseContext(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const context = String(msg.context ?? '');
  if (!context) return;

  const reachable = await checkReachable(context);
  const namespace = reachable.reachable ? await defaultNamespace(context) : undefined;
  saveState({ context, namespace });

  postMessage({ type: 'dk8s:contextSet', context, namespace, reachable });

  if (reachable.reachable) {
    await handleDk8sNamespaces({ context }, postMessage);
  }
}

export async function handleDk8sNamespaces(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const context = String(msg.context ?? state().context ?? '');
  if (!context) return;
  const result = await listNamespaces(context);
  postMessage({ type: 'dk8s:namespaces', context, ...result });
}

export function handleDk8sSetNamespace(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  const namespace = String(msg.namespace ?? '');
  if (!namespace) return;
  saveState({ namespace });
  postMessage({ type: 'dk8s:namespaceSet', namespace });
}

/** Record the user's answer to "is this production?". Never inferred. */
export function handleDk8sSetSensitivity(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): void {
  const context = String(msg.context ?? '');
  const level = msg.level === 'production' ? 'production' : 'normal';
  if (!context) return;
  const sensitivity = { ...(state().sensitivity ?? {}), [context]: level } as Record<string, 'normal' | 'production'>;
  saveState({ sensitivity });
  postMessage({ type: 'dk8s:sensitivitySet', context, level });
}

/** Explicit kubectl path, for when it is installed somewhere unusual. */
export async function handleDk8sSetKubectlPath(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const path = String(msg.path ?? '').trim();
  setKubectlPath(path || undefined);
  saveState({ kubectlPath: path || undefined });
  await handleDk8sProbe(postMessage);
}
