/**
 * The pod terminal's message handlers.
 *
 * Thin, like the explorer's: everything worth arguing about — the transport,
 * the shell probe, the session ceiling — lives in `pod-terminal`, where it can
 * be reasoned about without a panel around it.
 *
 * ── What crosses the boundary, and what is checked ──
 *
 * A webview message is untrusted input. Three fields here reach a cluster call:
 * the namespace, the pod and the container. They are sent as API parameters
 * rather than assembled into a shell string, so there is no command to inject
 * into — but they are still validated against the shape Kubernetes actually
 * allows, because a name that cannot exist is a sign of something wrong
 * upstream and is not worth forwarding.
 *
 * The command is never taken from a message at all. It is chosen from a fixed
 * list in `pod-terminal`, which is the one field where free text would be
 * worth attacking.
 */
import {
  openSession, write, resize, close, closeAll, detectShell,
  SHELLS, k8sModule, type Shell, type TerminalTarget, type KubeConfigHandle,
} from '../../../services/k8s/pod-terminal';

type PostMessage = (msg: Record<string, unknown>) => void;

/**
 * RFC 1123, which is what Kubernetes enforces on these names.
 *
 * Not a security boundary on its own — the values are API parameters, not
 * shell words — but a cheap one, and it keeps a malformed message from
 * becoming a confusing 404 three layers down.
 */
const DNS_NAME = /^[a-z0-9]([a-z0-9-]{0,251}[a-z0-9])?$/;

/** Session ids are ours, but they come back from the webview, so they are checked too. */
const SESSION_ID = /^t[0-9a-z]{4,32}$/;

/**
 * A directory to open the shell in, and the one field here that becomes shell
 * text rather than an API parameter.
 *
 * ── Why this needs a rule the others do not ──
 *
 * Namespace, pod and container are passed to the Kubernetes API as parameters,
 * so there is no command for them to be injected into. A starting directory is
 * different: it can only be applied by sending `cd` to the shell, which is a
 * shell word. And the value does NOT come from the user — it comes from a
 * directory listing inside the container, so a hostile image could plant a
 * filename and have it run without anyone typing it.
 *
 * ── Why single quotes, and why this shape ──
 *
 * Inside single quotes a POSIX shell interprets nothing at all — no
 * substitution, no globbing, no escapes — with exactly one exception: the
 * closing quote itself. So a path with no single quote in it is inert once
 * wrapped, and this pattern is what guarantees that. Control characters are
 * out for the same reason a newline would be: it would end the command and
 * start another one.
 *
 * Absolute only, because a relative path against an unknown working directory
 * is not a location. `--` goes in front of the quoted path so a directory
 * named like an option is still a directory.
 */
export const START_DIR = new RegExp('^/[^' + chr39() + String.fromCharCode(0) + '-' + String.fromCharCode(31) + ']{0,4095}$');
function chr39() { return String.fromCharCode(39); }

function targetOf(msg: Record<string, unknown>): TerminalTarget | undefined {
  const namespace = String(msg.namespace ?? '');
  const pod = String(msg.pod ?? '');
  const container = String(msg.container ?? '');
  if (!DNS_NAME.test(namespace) || !DNS_NAME.test(pod) || !DNS_NAME.test(container)) {
    return undefined;
  }
  return { context: String(msg.context ?? ''), namespace, pod, container };
}

/**
 * One KubeConfig, loaded once and re-read when the context changes.
 *
 * `loadFromDefault` reads files and can run a credential plugin, so doing it
 * per keystroke would be absurd; doing it once and never again would pin the
 * panel to whichever cluster was current at startup.
 */
let cached: { context: string; kc: KubeConfigHandle } | undefined;

async function configFor(context: string): Promise<KubeConfigHandle> {
  if (cached && cached.context === context) return cached.kc;
  const { KubeConfig } = await k8sModule();
  const kc = new KubeConfig();
  kc.loadFromDefault();
  if (context) kc.setCurrentContext(context);
  cached = { context, kc };
  return kc;
}

export async function handleTerminalOpen(
  msg: Record<string, unknown>, post: PostMessage,
): Promise<void> {
  const id = String(msg.id ?? '');
  if (!SESSION_ID.test(id)) return;

  /*
    A bad directory is dropped, not refused.

    The shell is the thing being asked for; landing in the container's default
    directory is a worse answer than the one requested and a much better one
    than no terminal at all. The path is echoed back so the view can say where
    it actually started.
  */
  const wanted = typeof msg.cwd === 'string' ? msg.cwd : '';
  const cwd = wanted && START_DIR.test(wanted) ? wanted : '';

  const target = targetOf(msg);
  if (!target) {
    post({ type: 'term:error', id, error: 'That pod, namespace or container name is not a valid Kubernetes name.' });
    return;
  }

  try {
    const kc = await configFor(target.context);

    /*
      Probe before opening, so "no shell" is a sentence rather than a socket
      that closes immediately. A distroless image is the common case and its
      failure mode through the raw API is an opaque status message.
    */
    const probe = await detectShell(kc, target);
    if (!probe.shell) {
      post({
        type: 'term:error', id,
        error: 'No shell in this container — it looks distroless.',
        suggestion: `kubectl -n ${target.namespace} debug -it ${target.pod} `
          + `--image=busybox --target=${target.container}`,
        suggestionLabel: 'Attach a debug container with a shell in it:',
      });
      return;
    }

    await openSession(kc, id, target, probe.shell, {
      onData: (sid, chunk) => post({ type: 'term:data', id: sid, data: chunk }),
      onExit: (sid, reason) => post({ type: 'term:exit', id: sid, reason }),
    });

    /*
      `cd` is written as input rather than folded into the exec command.

      The session runs the bare shell, and building `sh -c "cd X && exec sh"`
      would put a path inside a command string on the host — the one place it
      is worth not having one. Sent as a keystroke it goes through the same
      path a person typing it would, already quoted, and a shell that cannot
      change to the directory says so in the terminal where it can be read.
    */
    if (cwd) {
      const q = String.fromCharCode(39);
      write(id, 'cd -- ' + q + cwd + q + ' 2>/dev/null || true\r');
    }

    post({
      type: 'term:opened', id, shell: probe.shell, container: target.container,
      cwd: cwd || undefined,
      // Said only when it was asked for and refused, so silence is not a claim.
      cwdRejected: wanted && !cwd ? wanted : undefined,
    });
  } catch (err) {
    post({
      type: 'term:error', id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function handleTerminalInput(msg: Record<string, unknown>): void {
  const id = String(msg.id ?? '');
  if (!SESSION_ID.test(id)) return;
  /*
    Not logged, and deliberately.

    Everything typed into a shell goes through here, which on any real
    incident includes a password, a token, or a connection string. dk8s audits
    the ACT of opening a terminal — that is in the ui-audit trail — and never
    its contents.
  */
  write(id, String(msg.data ?? ''));
}

export function handleTerminalResize(msg: Record<string, unknown>): void {
  const id = String(msg.id ?? '');
  if (!SESSION_ID.test(id)) return;
  resize(id, Number(msg.cols), Number(msg.rows));
}

export function handleTerminalClose(msg: Record<string, unknown>): void {
  const id = String(msg.id ?? '');
  if (!SESSION_ID.test(id)) return;
  close(id);
}

/** Called when the panel goes away, so no shell outlives the window. */
export function closeAllTerminals(): void {
  closeAll();
}

export { SHELLS, type Shell };
