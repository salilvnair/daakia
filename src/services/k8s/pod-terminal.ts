/**
 * An interactive shell in a pod, over the Kubernetes exec API.
 *
 * ── Why not `kubectl exec` in a subprocess ──
 *
 * Because a terminal needs a PTY on the client side, and spawning kubectl with
 * piped stdio does not have one: kubectl refuses `-t`, so there is no prompt
 * echo, no window-size negotiation, no job control, and anything full-screen —
 * `top`, `vi`, `less` — renders as garbage. It is the shortcut that produces a
 * terminal which looks right and misbehaves.
 *
 * ── Why not `kubectl proxy` ──
 *
 * It works, and it was the first thing tried: proxy on an ephemeral port, then
 * a WebSocket to `v4.channel.k8s.io`. It gives a real PTY and kubectl handles
 * every kind of auth, including cloud credential plugins.
 *
 * It also opens an UNAUTHENTICATED local port carrying the user's full cluster
 * privileges. Anything else running on the machine can use it, with no
 * credential of its own, for as long as it is open. It cannot be narrowed
 * either: `--reject-paths` is deny-only and Go's RE2 has no negative lookahead,
 * so there is no way to say "allow exec on this one pod and nothing else". For
 * a developer tool that many people run against production, that is not an
 * acceptable thing to leave listening.
 *
 * ── What this does instead ──
 *
 * The official client opens the WebSocket to the API server directly, carrying
 * the user's own kubeconfig credentials — certs, tokens, and exec credential
 * plugins alike. No port is opened, nothing is listening, and the connection
 * has exactly the permissions the user already had.
 */
import { PassThrough, Writable } from 'stream';
import type WebSocket from 'ws';

/**
 * The client's KubeConfig, held opaquely.
 *
 * Importing its type would drag the CommonJS/ESM boundary into every file that
 * touches it — the package is ESM, this extension is not, and a type-only
 * import across that line needs a resolution-mode attribute that half the
 * toolchain has an opinion about. Nothing here inspects the object; it is
 * created by the module and handed straight back to it, so an opaque handle
 * says exactly as much as is true.
 */
export type KubeConfigHandle = { readonly __kubeconfig: unique symbol } | object;

/*
  Loaded on first use, not at require time.

  `@kubernetes/client-node` v2 is ESM and this extension is CommonJS, so a
  static import cannot be expressed here — but the lazy load is what we would
  want regardless: it reads kubeconfig files and can run a credential plugin,
  and an extension that does that on activation pays for a terminal nobody has
  opened yet.
*/
interface ExecLike {
  exec(
    namespace: string, pod: string, container: string, command: string[],
    stdout: Writable | null, stderr: Writable | null, stdin: PassThrough | null,
    tty: boolean, statusCallback?: (s: { status?: string; message?: string }) => void,
  ): Promise<WebSocket>;
}

interface KubeConfigLike {
  loadFromDefault(): void;
  setCurrentContext(c: string): void;
}

/**
 * Only the two constructors this file uses.
 *
 * Written out rather than taken from `typeof import(...)`, which TypeScript
 * refuses to resolve from a CommonJS file without a resolution-mode attribute.
 * The surface used here is two classes and one method, so naming it costs
 * little and keeps the module boundary from leaking into the build config.
 */
interface K8sModule {
  Exec: new (kc: unknown) => ExecLike;
  KubeConfig: new () => KubeConfigLike;
}

let modPromise: Promise<K8sModule> | undefined;
export function k8sModule(): Promise<K8sModule> {
  return (modPromise ??= import('@kubernetes/client-node') as unknown as Promise<K8sModule>);
}

/**
 * The shells worth trying, in order, and the ONLY commands this module runs.
 *
 * A fixed list rather than anything derived from a message: the command is the
 * one field where a value crossing from the webview would be worth attacking,
 * and there is no reason for it ever to be free text.
 */
export const SHELLS = ['bash', 'sh', 'ash'] as const;
export type Shell = typeof SHELLS[number];

/**
 * A ceiling on live sessions.
 *
 * Each one holds a socket to the API server and a PTY inside a container. A
 * leak here is not a slow UI, it is processes accumulating in someone's
 * production pod, so the count is bounded and the oldest is not silently
 * evicted — opening past the cap fails loudly instead.
 */
const MAX_SESSIONS = 8;

export interface TerminalTarget {
  context: string;
  namespace: string;
  pod: string;
  container: string;
}

interface Session {
  id: string;
  ws: WebSocket;
  stdin: PassThrough;
  target: TerminalTarget;
  shell: Shell;
  closed: boolean;
}

const sessions = new Map<string, Session>();

/** v4.channel.k8s.io: the first byte of every frame says which stream it is. */
const CH_STDIN = 0;
const CH_RESIZE = 4;

export interface TerminalCallbacks {
  /** Bytes from the pod, already decoded. */
  onData: (id: string, chunk: string) => void;
  /** The session ended, with a reason worth showing. */
  onExit: (id: string, reason: string) => void;
}

/**
 * Which shell this container actually has.
 *
 * Tried in order over the same exec API rather than by running `which` through
 * a second mechanism: if a shell cannot be started here, it cannot be started
 * for the terminal either, and probing by the same route means the probe
 * cannot succeed where the real thing would fail.
 */
export async function detectShell(
  kc: KubeConfigHandle, t: TerminalTarget,
): Promise<{ shell?: Shell; error?: string }> {
  const { Exec } = await k8sModule();
  const exec = new Exec(kc);
  let lastError = '';

  for (const shell of SHELLS) {
    const ok = await new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (v: boolean) => { if (!settled) { settled = true; resolve(v); } };
      const sink = new Writable({ write(_c, _e, cb) { cb(); } });

      exec.exec(
        t.namespace, t.pod, t.container, [shell, '-c', 'exit 0'],
        sink, sink, null, false,
        (status) => done(status.status === 'Success'),
      ).then(
        (ws) => { ws.on('error', (e: Error) => { lastError = e.message; done(false); }); },
        (e: Error) => { lastError = e?.message ?? String(e); done(false); },
      );

      // A container that is starting can leave exec hanging. The probe is not
      // the place to wait it out — the caller has a better message for it.
      setTimeout(() => done(false), 8000);
    });
    if (ok) return { shell };
  }

  return { error: lastError || 'No shell in this container.' };
}

export async function openSession(
  kc: KubeConfigHandle,
  id: string,
  target: TerminalTarget,
  shell: Shell,
  cb: TerminalCallbacks,
): Promise<void> {
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error(
      `${MAX_SESSIONS} terminals are already open. Close one before opening another — `
      + 'each holds a shell process inside a container.',
    );
  }
  if (sessions.has(id)) throw new Error(`Terminal ${id} is already open.`);

  const { Exec } = await k8sModule();
  const exec = new Exec(kc);
  const stdin = new PassThrough();

  /*
    stdout and stderr both go to the same place, deliberately.

    A TTY session multiplexes them into one stream at the far end anyway — that
    is what a terminal IS — and splitting them here would interleave them
    wrongly, which shows up as a prompt printed after the output it preceded.
  */
  const toWebview = new Writable({
    write(chunk: Buffer, _enc, next) {
      cb.onData(id, chunk.toString('utf8'));
      next();
    },
  });

  const ws = await exec.exec(
    target.namespace, target.pod, target.container, [shell],
    toWebview, toWebview, stdin,
    /* tty */ true,
    (status) => {
      const s = sessions.get(id);
      if (s) s.closed = true;
      sessions.delete(id);
      cb.onExit(id, status.status === 'Success'
        ? 'The shell exited.'
        : status.message ?? 'The shell ended.');
    },
  );

  ws.on('error', (e: Error) => {
    sessions.delete(id);
    cb.onExit(id, e.message);
  });
  ws.on('close', () => {
    if (!sessions.has(id)) return;
    sessions.delete(id);
    cb.onExit(id, 'The connection to the pod closed.');
  });

  sessions.set(id, { id, ws, stdin, target, shell, closed: false });
}

/** Keystrokes, straight through. */
export function write(id: string, data: string): void {
  const s = sessions.get(id);
  if (!s || s.closed) return;
  s.stdin.write(data);
}

/**
 * Tell the far end how big the window is.
 *
 * Channel 4 with `{Width, Height}` — the capitalised names are the API's, not
 * a slip. Without this the remote shell believes it is 80x24 forever, so
 * anything full-screen draws to the wrong size and wrapped lines break in the
 * wrong column, which is the most common way an embedded terminal looks
 * subtly broken.
 */
export function resize(id: string, cols: number, rows: number): void {
  const s = sessions.get(id);
  if (!s || s.closed) return;
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 1 || rows < 1) return;
  const payload = JSON.stringify({ Width: Math.floor(cols), Height: Math.floor(rows) });
  s.ws.send(Buffer.concat([Buffer.from([CH_RESIZE]), Buffer.from(payload)]));
}

export function close(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  s.closed = true;
  try { s.stdin.end(); } catch { /* already gone */ }
  try { s.ws.close(); } catch { /* already gone */ }
}

/**
 * Every session, closed.
 *
 * Called when the panel goes away and when the extension deactivates. A shell
 * that outlives the window that opened it is a process nobody can see and
 * nobody will close.
 */
export function closeAll(): void {
  for (const id of [...sessions.keys()]) close(id);
}

export function sessionCount(): number {
  return sessions.size;
}

/** Exported for the write path, which needs the channel byte. */
export const STDIN_CHANNEL = CH_STDIN;
