/**
 * Contexts, namespaces, and whether the cluster is actually answering.
 *
 * dk8s never runs `kubectl config use-context`. That command mutates the user's
 * global kubeconfig, so selecting a cluster in an editor tab would silently
 * repoint every terminal they have open. Instead every invocation carries
 * `--context` explicitly, and the picker only offers to change the global
 * default as a separate, opt-in action.
 */
import { run } from './kubectl';

export interface KubeContext {
  name: string;
  cluster: string;
  user: string;
  /** The context's own default namespace, if it declares one. */
  namespace?: string;
  current: boolean;
}

export interface ContextList {
  contexts: KubeContext[];
  current?: string;
  error?: string;
}

/** Read the kubeconfig's contexts. Never modifies it. */
export async function listContexts(): Promise<ContextList> {
  const current = (await run(['config', 'current-context'])).stdout.trim() || undefined;

  // -o json gives cluster/user/namespace per context; `get-contexts` alone is
  // column-formatted and would need parsing by whitespace, which breaks on
  // names containing spaces.
  const res = await run(['config', 'view', '-o', 'json']);
  if (!res.ok) {
    return { contexts: [], current, error: firstLine(res.stderr) || res.failure };
  }

  try {
    const cfg = JSON.parse(res.stdout) as {
      contexts?: { name: string; context?: { cluster?: string; user?: string; namespace?: string } }[];
    };
    const contexts = (cfg.contexts ?? []).map(c => ({
      name: c.name,
      cluster: c.context?.cluster ?? '',
      user: c.context?.user ?? '',
      namespace: c.context?.namespace,
      current: c.name === current,
    }));
    return { contexts, current };
  } catch (err) {
    return { contexts: [], current, error: `could not parse kubeconfig: ${(err as Error).message}` };
  }
}

export interface Reachability {
  reachable: boolean;
  serverVersion?: string;
  /** Verbatim, because the reason a cluster will not answer is the whole message. */
  error?: string;
}

/**
 * Ask the API server for its version.
 *
 * Short timeout on purpose: an unreachable context should fail in seconds, not
 * hang the picker. A VPN-gated cluster is the common case and the user needs to
 * be told, not left watching a spinner.
 */
export async function checkReachable(context: string): Promise<Reachability> {
  const res = await run(
    ['--context', context, 'version', '-o', 'json', '--request-timeout=8s'],
    { timeoutMs: 15_000 },
  );
  let serverVersion: string | undefined;
  try {
    serverVersion = JSON.parse(res.stdout)?.serverVersion?.gitVersion;
  } catch {
    /* a kubectl too old for -o json still reports through stderr below */
  }
  if (serverVersion) return { reachable: true, serverVersion };
  return {
    reachable: false,
    error: firstLine(res.stderr) || res.failure || `kubectl exited ${res.code}`,
  };
}

export interface NamespaceList {
  namespaces: string[];
  /** True when the cluster refused a cluster-scoped list. Not an error. */
  forbidden: boolean;
  /** The context's default, used as the fallback when listing is refused. */
  fallback?: string;
  error?: string;
}

/**
 * List namespaces, and route around the common refusal.
 *
 * `get namespaces` is a cluster-scoped read. Plenty of enterprise clusters give
 * a developer full access inside two namespaces and zero cluster-scoped rights,
 * so the very first screen 403s for exactly the users dk8s targets. That is a
 * permission to route around, not a dead end — the caller offers a text field
 * seeded with `fallback`.
 */
export async function listNamespaces(context: string): Promise<NamespaceList> {
  const res = await run(['--context', context, 'get', 'namespaces', '-o', 'name'], { timeoutMs: 20_000 });
  if (res.ok) {
    const namespaces = res.stdout
      .split('\n')
      .map(l => l.trim().replace(/^namespace\//, ''))
      .filter(Boolean);
    return { namespaces, forbidden: false };
  }

  const forbidden = /forbidden|cannot list resource/i.test(res.stderr);
  const fallback = await defaultNamespace(context);
  return {
    namespaces: [],
    forbidden,
    fallback,
    error: forbidden ? undefined : firstLine(res.stderr) || res.failure,
  };
}

/** The namespace the active context declares, or 'default'. */
export async function defaultNamespace(context: string): Promise<string> {
  const res = await run([
    '--context', context, 'config', 'view', '--minify', '-o', 'jsonpath={..namespace}',
  ]);
  return res.stdout.trim() || 'default';
}

/**
 * Does this context look like production?
 *
 * A suggestion only. It is never applied silently — a cluster called
 * `eu-live-01` matches nothing here and is absolutely production, while
 * `prod-sandbox` matches and is not. The guess saves a click; the human decides.
 */
export function looksLikeProduction(context: string, cluster: string): boolean {
  return /(^|[-_.])(prod|prd|live|production)([-_.]|$)/i.test(`${context} ${cluster}`);
}

function firstLine(s: string): string {
  return (s || '').split('\n').map(l => l.trim()).filter(Boolean)[0] ?? '';
}
