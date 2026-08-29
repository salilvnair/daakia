/**
 * What runtime is a pod, and what can we actually do to it?
 *
 * Two questions, deliberately separate. The first is cheap and answerable from
 * the pod spec we already have. The second costs an exec and is only asked for
 * a pod the user opened.
 *
 * The capability probe is not defensive programming — it is the whole feature.
 * Probing the real cluster before writing any of this found that zp-backend
 * runs on eclipse-temurin:21-jre, which ships java, jfr and keytool and NO
 * jcmd, jstack, jmap or python3. A design that assumes those exist does not
 * work on the most common production Java image there is.
 */
import { run } from './kubectl';

export type PodRuntime = 'java' | 'python' | 'node' | 'go' | 'dotnet' | 'unknown';

export interface RuntimeTag {
  runtime: PodRuntime;
  confidence: number;
  detectedFrom: 'image' | 'command' | 'env' | 'probe' | 'label' | 'user';
}

/**
 * A pod name carries a generated suffix that changes on every rollout, so a tag
 * stored against it is gone at the next deploy. The owning workload is stable,
 * so that is what tags key on: tag once, correct forever.
 */
export function workloadKey(ctx: string, namespace: string, pod: PodLike): string {
  const owner = pod.metadata?.ownerReferences?.[0];
  if (owner) {
    // Pod -> ReplicaSet -> Deployment: strip the ReplicaSet's pod-template hash
    // so both replicas of one Deployment land on the same key.
    const kind = owner.kind === 'ReplicaSet' ? 'Deployment' : owner.kind;
    const name = owner.kind === 'ReplicaSet' ? owner.name.replace(/-[a-z0-9]{6,10}$/, '') : owner.name;
    return `${ctx}/${namespace}/${kind}/${name}`;
  }
  // No owner (a bare pod): strip the hash-looking tail and hope.
  const bare = (pod.metadata?.name ?? '').replace(/-[a-z0-9]{5,10}(-[a-z0-9]{5})?$/, '');
  return `${ctx}/${namespace}/Pod/${bare}`;
}

export interface PodLike {
  metadata?: {
    name?: string;
    labels?: Record<string, string>;
    ownerReferences?: { kind: string; name: string }[];
  };
  spec?: {
    containers?: {
      name?: string;
      image?: string;
      command?: string[];
      args?: string[];
      env?: { name?: string; value?: string }[];
    }[];
  };
}

const IMAGE_RULES: [RegExp, PodRuntime][] = [
  [/openjdk|eclipse-temurin|amazoncorretto|\bjre\b|\bjdk\b|liberica|zulu|graalvm/i, 'java'],
  [/python|gunicorn|uvicorn|conda/i, 'python'],
  [/\bnode\b|nodejs/i, 'node'],
  [/golang|\bgo\b/i, 'go'],
  [/dotnet|aspnet/i, 'dotnet'],
];

const COMMAND_RULES: [RegExp, PodRuntime][] = [
  [/\bjava\b|-jar\b|-XX:|-Xmx/, 'java'],
  [/gunicorn|uvicorn|\bpython3?\b/, 'python'],
  [/\bnode\b|npm\b|yarn\b/, 'node'],
  [/dotnet\b/, 'dotnet'],
];

/**
 * Cheap classification from the spec alone. No API call, no exec.
 * Returns 'unknown' rather than guessing when nothing matches.
 */
export function classifyFromSpec(pod: PodLike): RuntimeTag {
  const label = pod.metadata?.labels?.['dk8s.daakia/runtime'];
  if (label && isRuntime(label)) {
    return { runtime: label, confidence: 1, detectedFrom: 'label' };
  }

  const container = pod.spec?.containers?.[0];
  const image = container?.image ?? '';
  for (const [re, runtime] of IMAGE_RULES) {
    if (re.test(image)) return { runtime, confidence: 0.9, detectedFrom: 'image' };
  }

  const cmd = [...(container?.command ?? []), ...(container?.args ?? [])].join(' ');
  for (const [re, runtime] of COMMAND_RULES) {
    if (re.test(cmd)) return { runtime, confidence: 0.85, detectedFrom: 'command' };
  }

  const env = container?.env ?? [];
  if (env.some(e => /^JAVA_|^JDK_/.test(e.name ?? ''))) {
    return { runtime: 'java', confidence: 0.8, detectedFrom: 'env' };
  }
  if (env.some(e => /^PYTHON/.test(e.name ?? ''))) {
    return { runtime: 'python', confidence: 0.8, detectedFrom: 'env' };
  }

  return { runtime: 'unknown', confidence: 0, detectedFrom: 'image' };
}

function isRuntime(v: string): v is PodRuntime {
  return ['java', 'python', 'node', 'go', 'dotnet', 'unknown'].includes(v);
}

// ── Capabilities ────────────────────────────────────────────────────────────

export interface PodCapabilities {
  /** A shell we can actually exec, or null on a distroless image. */
  shell: string | null;
  /** `tar` — kubectl cp is tar over the exec channel and fails without it. */
  tar: boolean;
  python3: boolean;
  /** JDK diagnostic tools. Absent on every *-jre image. */
  jcmd: boolean;
  jstack: boolean;
  jmap: boolean;
  /** Ships in the JRE, so usually present even when jcmd is not. */
  jfr: boolean;
  /** PID of the JVM or interpreter, when we could find one. */
  targetPid?: string;
  /**
   * CAP_SYS_PTRACE is held.
   *
   * Kubernetes drops it by default. Without it nothing can read another
   * process's memory, which is exactly what py-spy and every other sampling
   * profiler needs — so an action depending on it must not be offered.
   */
  ptrace?: boolean;
  /** Probe could not run at all (no shell, RBAC, pod not running). */
  unreachable?: string;
}

const SHELLS = ['bash', 'sh', 'ash', 'busybox'];

/**
 * One exec, not eight. Every question is answered by a single shell script so
 * a probe costs one round trip; asking separately would be eight for a pod the
 * user merely clicked on.
 */
const PROBE_SCRIPT = [
  'for s in bash sh ash busybox; do command -v $s >/dev/null 2>&1 && echo "shell=$s" && break; done',
  'for b in tar python3 jcmd jstack jmap jfr; do command -v $b >/dev/null 2>&1 && echo "bin=$b"; done',
  // The JVM/interpreter pid, without ps — which slim images also lack.
  'for p in /proc/[0-9]*; do',
  '  e=$(readlink "$p/exe" 2>/dev/null) || continue;',
  '  case "$e" in */java) echo "pid=java:${p#/proc/}"; break;; */python3*|*/python) echo "pid=python:${p#/proc/}"; break;; esac;',
  'done',
  // CAP_SYS_PTRACE, bit 19 of the effective capability mask. Kubernetes
  // drops it by default, and without it py-spy attaches and then fails with
  // "Failed to copy Py_Version symbol" — a message that tells the reader
  // nothing at all. Worse, by then py-spy has already been pip-installed
  // into a running container. Knowing this up front is the difference
  // between a greyed-out button carrying a reason and a pointless mutation
  // of a live pod.
  'c=$(grep -i "^CapEff:" /proc/self/status 2>/dev/null | tr -d "[:space:]" | cut -d: -f2);',
  'if [ -n "$c" ]; then',
  '  d=$(printf "%d" "0x$c" 2>/dev/null || echo 0);',
  '  if [ "$(( d / 524288 % 2 ))" -eq 1 ]; then echo "cap=ptrace"; fi;',
  'fi',
  // The script's exit status is its last command's, and a capability check
  // that legitimately finds nothing exits 1. Without this the whole probe
  // reads as a failed exec and EVERY pod is reported unreachable.
  'true',
].join('\n');

/**
 * Why an exec failed.
 *
 * "This image has no shell" and "this container is not running" both come back
 * as a failed exec, and conflating them produces a confident wrong answer:
 * telling someone to attach a debug container to a CrashLoopBackOff pod sends
 * them down a path that cannot work, when what they need is the previous run's
 * log. Only kubectl's executable-lookup phrasing actually means the binary is
 * missing; "container not found" and "unable to upgrade connection" mean the
 * container is gone.
 *
 * Shared by the capability probe and the shell handler so there is one copy of
 * this judgement rather than two that can drift apart.
 */
export function execFailureKind(stderr: string): 'missing-binary' | 'not-running' {
  return /executable file not found|no such file or directory/i.test(stderr)
    ? 'missing-binary'
    : 'not-running';
}

export async function probeCapabilities(
  ctx: string,
  namespace: string,
  pod: string,
  container?: string,
): Promise<PodCapabilities> {
  const caps: PodCapabilities = {
    shell: null, tar: false, python3: false,
    jcmd: false, jstack: false, jmap: false, jfr: false,
  };

  // Try each shell until one execs. A distroless pod fails all of them, and
  // that is a finding rather than an error.
  for (const sh of SHELLS) {
    const args = [
      '--context', ctx, '-n', namespace, 'exec', pod,
      ...(container ? ['-c', container] : []),
      '--', sh, '-c', PROBE_SCRIPT,
    ];
    const r = await run(args, { timeoutMs: 20_000 });
    if (!r.ok) {
      // Distinguish "this shell is absent" from "this container cannot be
      // exec'd into at all". Both used to match /not found/ — so a crashlooping
      // pod was reported as distroless, which is a confident wrong answer and
      // worse than no answer. Only the executable-lookup phrasing means "try
      // the next shell".
      if (execFailureKind(r.stderr) === 'missing-binary') continue;
      caps.unreachable = firstLine(r.stderr) || r.failure || `exit ${r.code}`;
      return caps;
    }
    for (const line of r.stdout.split('\n')) {
      const t = line.trim();
      if (t.startsWith('shell=')) caps.shell = t.slice(6);
      else if (t.startsWith('bin=')) {
        const b = t.slice(4);
        if (b === 'tar') caps.tar = true;
        else if (b === 'python3') caps.python3 = true;
        else if (b === 'jcmd') caps.jcmd = true;
        else if (b === 'jstack') caps.jstack = true;
        else if (b === 'jmap') caps.jmap = true;
        else if (b === 'jfr') caps.jfr = true;
      } else if (t.startsWith('pid=')) {
        caps.targetPid = t.slice(4).split(':')[1];
      } else if (t === 'cap=ptrace') {
        caps.ptrace = true;
      }
    }
    if (!caps.shell) caps.shell = sh;
    return caps;
  }

  caps.unreachable = 'no shell in this container (distroless?)';
  return caps;
}

// ── Which actions are actually offerable ────────────────────────────────────

export type ActionId =
  | 'threaddump' | 'threaddump-sigquit' | 'heapdump' | 'histogram'
  | 'jfr' | 'stackdump' | 'conns' | 'logs';

export interface ActionAvailability {
  id: ActionId;
  label: string;
  available: boolean;
  /** Why it is offered, or why it is not. Shown either way — never hidden. */
  reason: string;
  disruptive?: boolean;
  mutatesPod?: boolean;
}

/**
 * The ladder from §16 of the plan, resolved against what this pod really has.
 *
 * A disabled action with a reason teaches the user something. A hidden one
 * makes the tool look broken, so nothing is ever hidden here.
 */
export function availableActions(runtime: PodRuntime, caps: PodCapabilities): ActionAvailability[] {
  const out: ActionAvailability[] = [];
  const A = (a: ActionAvailability) => out.push(a);

  if (caps.unreachable) {
    A({ id: 'logs', label: 'Logs', available: true, reason: 'logs come from the API server, not the container' });
    return out;
  }

  if (runtime === 'java') {
    A({
      id: 'threaddump', label: 'Thread dump (jcmd)',
      available: caps.jcmd || caps.jstack,
      reason: caps.jcmd ? 'jcmd is present'
        : caps.jstack ? 'jstack is present'
        : 'no jcmd or jstack — this is a JRE image',
    });
    A({
      id: 'threaddump-sigquit', label: 'Thread dump (SIGQUIT to logs)',
      available: !!caps.targetPid,
      reason: caps.targetPid
        ? `kill -3 ${caps.targetPid}; the JVM writes the dump to stdout and kubectl logs captures it`
        : 'could not find the JVM pid',
    });
    A({
      id: 'histogram', label: 'Class histogram',
      available: caps.jcmd,
      reason: caps.jcmd ? 'brief pause, try this before a heap dump' : 'needs jcmd',
    });
    A({
      id: 'heapdump', label: 'Heap dump',
      available: caps.jcmd || caps.jmap,
      reason: caps.jcmd || caps.jmap ? 'writes a .hprof' : 'needs jcmd or jmap — offer to copy jattach',
      disruptive: true,
    });
    A({
      id: 'jfr', label: 'Flight recording',
      available: caps.jfr && !!caps.targetPid,
      reason: caps.jfr ? 'jfr ships in the JRE, so this works where jcmd does not' : 'no jfr binary',
    });
  }

  if (runtime === 'python') {
    A({
      id: 'stackdump', label: 'Stack dump (py-spy)',
      // Both are needed. Offering this with python3 but no ptrace installs
      // py-spy into a live container and then fails anyway — the worst of
      // both outcomes, and exactly what the fixture did before this probe.
      available: caps.python3 && caps.ptrace === true,
      reason: !caps.python3
        ? 'no python3 in this container'
        : caps.ptrace
          ? 'py-spy is installed on demand — off by default, it mutates the pod'
          : 'this container does not hold CAP_SYS_PTRACE, so nothing can read the '
            + 'interpreter' + String.fromCharCode(8217) + 's memory. Kubernetes drops that '
            + 'capability by default; add SYS_PTRACE to the securityContext to allow it.',
      mutatesPod: true,
    });
    A({
      id: 'conns', label: 'Connection snapshot',
      available: caps.python3 || !!caps.shell,
      reason: 'reads /proc; ss is used when present',
    });
  }

  A({ id: 'logs', label: 'Logs', available: true, reason: 'always available via the API server' });
  return out;
}

function firstLine(s: string): string {
  return (s || '').split('\n').map(l => l.trim()).filter(Boolean)[0] ?? '';
}
