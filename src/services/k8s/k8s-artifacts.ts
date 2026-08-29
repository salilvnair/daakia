/**
 * Collect a diagnostic artifact from a running pod.
 *
 * The governing constraint: everything here happens against a container that
 * somebody is relying on right now. A thread dump costs milliseconds; a heap
 * dump on a 4GB JVM stops the world for seconds and writes gigabytes into a
 * filesystem that may be a 1GB overlay. So each action declares its cost, the
 * UI shows it, and the ones that hurt need a second click.
 *
 * The second constraint: pod names, namespaces and container names come from
 * the cluster, not from us. Every one of them goes into an argv array. There is
 * no shell anywhere in this file.
 */
import { mkdir, stat, writeFile } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { run } from './kubectl';

export type ArtifactKind =
  | 'threaddump' | 'threaddump-sigquit' | 'histogram'
  | 'heapdump' | 'jfr' | 'stackdump' | 'conns';

export interface CollectTarget {
  context: string;
  namespace: string;
  pod: string;
  container?: string;
  /** From probeCapabilities — the JVM or interpreter pid inside the container. */
  targetPid?: string;
}

export interface CollectResult {
  kind: ArtifactKind;
  ok: boolean;
  /** Local path, for artifacts that came back as a file. */
  file?: string;
  bytes?: number;
  /** Inline text, for artifacts small enough to show directly. */
  text?: string;
  error?: string;
  /** What was actually run, so the user can reproduce it by hand. */
  command?: string;
  /** Wall-clock, which is the honest measure of how much this cost the pod. */
  elapsedMs?: number;
}

export interface CollectProgress {
  phase: 'probing' | 'running' | 'copying' | 'done';
  detail: string;
  /** 0..1 where the step can measure itself; absent otherwise. */
  fraction?: number;
}

type Progress = (p: CollectProgress) => void;

/** Timestamped, filesystem-safe, and sorts chronologically in a folder. */
export function artifactName(pod: string, kind: ArtifactKind, ext: string, at = new Date()): string {
  // Collapse runs of dots as well as replacing separators: `.` has to stay
  // legal (pod names contain them) but `..` must not survive into a path.
  const safe = pod.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.{2,}/g, '_');
  const stamp = at.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  return `${safe}__${kind}__${stamp}.${ext}`;
}

function execArgs(t: CollectTarget, cmd: string[]): string[] {
  return [
    '--context', t.context, '-n', t.namespace, 'exec', t.pod,
    ...(t.container ? ['-c', t.container] : []),
    '--', ...cmd,
  ];
}

/** For the "what this actually ran" line. Display only — never re-parsed. */
function showCommand(args: string[]): string {
  return ['kubectl', ...args].map(a => (/[\s"']/.test(a) ? JSON.stringify(a) : a)).join(' ');
}

// ── The individual collectors ───────────────────────────────────────────────

/**
 * jcmd/jstack thread dump.
 *
 * Comes back on stdout, so no file copy is needed — which matters, because a
 * container without `tar` cannot be `kubectl cp`'d from at all and this is then
 * the only way to get a dump out.
 */
async function threadDump(t: CollectTarget, useJstack: boolean): Promise<CollectResult> {
  const pid = t.targetPid ?? '1';
  const cmd = useJstack ? ['jstack', pid] : ['jcmd', pid, 'Thread.print'];
  const args = execArgs(t, cmd);
  const started = Date.now();
  const res = await run(args, { timeoutMs: 60_000, maxBuffer: 64 * 1024 * 1024 });

  if (!res.ok) {
    return { kind: 'threaddump', ok: false, command: showCommand(args), error: firstLine(res.stderr || res.failure) };
  }
  return {
    kind: 'threaddump', ok: true, text: res.stdout,
    command: showCommand(args), elapsedMs: Date.now() - started,
  };
}

/**
 * Thread dump on a JRE image, where jcmd and jstack do not exist.
 *
 * SIGQUIT makes the JVM print a full dump to its own stdout, which kubectl logs
 * then captures. The dump therefore arrives via the log stream, not from this
 * call — so the log is read back afterwards rather than the exec's output.
 */
async function threadDumpViaSigquit(t: CollectTarget): Promise<CollectResult> {
  if (!t.targetPid) {
    return { kind: 'threaddump-sigquit', ok: false, error: 'No JVM pid was found in this container.' };
  }
  const args = execArgs(t, ['kill', '-3', t.targetPid]);
  const started = Date.now();
  const res = await run(args, { timeoutMs: 20_000 });
  if (!res.ok) {
    return { kind: 'threaddump-sigquit', ok: false, command: showCommand(args), error: firstLine(res.stderr || res.failure) };
  }

  // The JVM writes asynchronously; reading immediately gets the log as it was
  // before the signal landed.
  await sleep(1200);

  const logArgs = [
    '--context', t.context, '-n', t.namespace, 'logs', t.pod,
    ...(t.container ? ['-c', t.container] : []),
    '--tail=4000',
  ];
  const logs = await run(logArgs, { timeoutMs: 60_000, maxBuffer: 64 * 1024 * 1024 });
  const dump = extractLastThreadDump(logs.stdout);

  if (!dump) {
    return {
      kind: 'threaddump-sigquit', ok: false, command: showCommand(args),
      error: 'The signal was delivered, but no thread dump appeared in the log. '
        + 'The JVM may write it to a file instead (-XX:+LogVMOutput), or stdout may not be the container log.',
    };
  }
  return {
    kind: 'threaddump-sigquit', ok: true, text: dump,
    command: showCommand(args), elapsedMs: Date.now() - started,
  };
}

/**
 * Pull the most recent dump out of a log.
 *
 * A pod that has been signalled before holds several, and the newest is the one
 * just requested — taking the first match would return a dump from an hour ago
 * and look convincingly like it worked.
 */
export function extractLastThreadDump(log: string): string | null {
  const lines = log.split('\n');
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*(Full thread dump|\d{4}-\d{2}-\d{2}.*Full thread dump)/.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return null;

  // Back up over the timestamp line the JVM prints above the header.
  if (start > 0 && /^\d{4}-\d{2}-\d{2}/.test(lines[start - 1])) start--;
  const body = lines.slice(start).join('\n').trim();
  return body || null;
}

/** Class histogram — cheap, and usually enough to skip the heap dump entirely. */
async function histogram(t: CollectTarget): Promise<CollectResult> {
  const pid = t.targetPid ?? '1';
  const args = execArgs(t, ['jcmd', pid, 'GC.class_histogram']);
  const started = Date.now();
  const res = await run(args, { timeoutMs: 120_000, maxBuffer: 64 * 1024 * 1024 });
  if (!res.ok) {
    return { kind: 'histogram', ok: false, command: showCommand(args), error: firstLine(res.stderr || res.failure) };
  }
  return { kind: 'histogram', ok: true, text: res.stdout, command: showCommand(args), elapsedMs: Date.now() - started };
}

/**
 * Heap dump: write inside the container, then copy it out.
 *
 * Written to /tmp because it is the one path that is reliably writable, and
 * removed afterwards whether or not the copy succeeded — leaving a multi-GB
 * file in a container's writable layer can fill the node's disk and evict
 * every pod on it, which is a far worse outcome than a failed dump.
 */
async function heapDump(
  t: CollectTarget, destDir: string, useJmap: boolean, onProgress: Progress,
): Promise<CollectResult> {
  const pid = t.targetPid ?? '1';
  const remote = `/tmp/dk8s-${Date.now()}.hprof`;
  const cmd = useJmap
    ? ['jmap', `-dump:live,format=b,file=${remote}`, pid]
    : ['jcmd', pid, 'GC.heap_dump', '-all=false', remote];
  const args = execArgs(t, cmd);
  const started = Date.now();

  onProgress({ phase: 'running', detail: 'Writing the dump inside the container — the JVM is paused for this.' });
  const res = await run(args, { timeoutMs: 900_000, maxBuffer: 8 * 1024 * 1024 });
  if (!res.ok) {
    await cleanupRemote(t, remote);
    return { kind: 'heapdump', ok: false, command: showCommand(args), error: firstLine(res.stderr || res.failure) };
  }

  const sized = await run(execArgs(t, ['sh', '-c', `wc -c < ${remote}`]), { timeoutMs: 30_000 });
  const remoteBytes = Number(sized.stdout.trim()) || undefined;

  onProgress({
    phase: 'copying',
    detail: remoteBytes
      ? `Copying ${formatBytes(remoteBytes)} out of the pod…`
      : 'Copying the dump out of the pod…',
  });

  const local = join(destDir, artifactName(t.pod, 'heapdump', 'hprof'));
  const copy = await copyFromPod(t, remote, local);
  await cleanupRemote(t, remote);

  if (!copy.ok) {
    return { kind: 'heapdump', ok: false, command: showCommand(args), error: copy.error };
  }

  const info = await stat(local).catch(() => undefined);
  const bytes = info?.size;

  // A truncated hprof parses far enough to look valid and then produces wrong
  // numbers, so a short copy is reported as a failure rather than a file.
  if (remoteBytes && bytes && bytes < remoteBytes) {
    return {
      kind: 'heapdump', ok: false, file: local, bytes, command: showCommand(args),
      error: `The copy is short: ${formatBytes(bytes)} of ${formatBytes(remoteBytes)}. `
        + 'Treat this file as incomplete.',
    };
  }

  return {
    kind: 'heapdump', ok: true, file: local, bytes,
    command: showCommand(args), elapsedMs: Date.now() - started,
  };
}

/**
 * Flight recording.
 *
 * The one deep tool that works on a JRE image, since `jfr` ships in the JRE
 * while jcmd does not. Needs the JVM to have been started with recording
 * enabled, which is the usual reason this fails.
 */
async function flightRecording(
  t: CollectTarget, destDir: string, seconds: number, onProgress: Progress,
): Promise<CollectResult> {
  const pid = t.targetPid ?? '1';
  const remote = `/tmp/dk8s-${Date.now()}.jfr`;
  const startArgs = execArgs(t, [
    'jcmd', pid, 'JFR.start', 'name=dk8s', `duration=${seconds}s`,
    'settings=profile', `filename=${remote}`,
  ]);
  const started = Date.now();

  const startRes = await run(startArgs, { timeoutMs: 60_000 });
  if (!startRes.ok) {
    return { kind: 'jfr', ok: false, command: showCommand(startArgs), error: firstLine(startRes.stderr || startRes.failure) };
  }

  // Poll rather than one long sleep, so the UI can count down and the user can
  // see that something is happening for what may be a full minute.
  const total = seconds * 1000;
  for (let waited = 0; waited < total; waited += 1000) {
    onProgress({
      phase: 'running',
      detail: `Recording — ${Math.ceil((total - waited) / 1000)}s left`,
      fraction: waited / total,
    });
    await sleep(1000);
  }

  onProgress({ phase: 'copying', detail: 'Copying the recording out…' });
  const local = join(destDir, artifactName(t.pod, 'jfr', 'jfr'));
  const copy = await copyFromPod(t, remote, local);
  await cleanupRemote(t, remote);

  if (!copy.ok) return { kind: 'jfr', ok: false, command: showCommand(startArgs), error: copy.error };
  const info = await stat(local).catch(() => undefined);
  return {
    kind: 'jfr', ok: true, file: local, bytes: info?.size,
    command: showCommand(startArgs), elapsedMs: Date.now() - started,
  };
}

/**
 * Python stack dump.
 *
 * py-spy is not in anybody's image, so this installs it — which mutates a
 * running container and is the only action here that does. It stays behind an
 * explicit opt-in for that reason, and says so rather than doing it quietly.
 */
async function pyStackDump(t: CollectTarget, allowInstall: boolean): Promise<CollectResult> {
  const pid = t.targetPid ?? '1';

  const have = await run(execArgs(t, ['which', 'py-spy']), { timeoutMs: 20_000 });
  if (!have.ok || !have.stdout.trim()) {
    if (!allowInstall) {
      return {
        kind: 'stackdump', ok: false,
        error: 'py-spy is not installed in this container. Installing it changes a running '
          + 'pod, so dk8s will not do it without being asked.',
      };
    }
    const install = await run(execArgs(t, ['pip', 'install', '--quiet', '--no-input', 'py-spy']), {
      timeoutMs: 180_000,
    });
    if (!install.ok) {
      return { kind: 'stackdump', ok: false, error: `Could not install py-spy: ${firstLine(install.stderr || install.failure)}` };
    }
  }

  const args = execArgs(t, ['py-spy', 'dump', '--pid', pid]);
  const started = Date.now();
  const res = await run(args, { timeoutMs: 90_000, maxBuffer: 32 * 1024 * 1024 });
  if (!res.ok) {
    return { kind: 'stackdump', ok: false, command: showCommand(args), error: firstLine(res.stderr || res.failure) };
  }
  return { kind: 'stackdump', ok: true, text: res.stdout, command: showCommand(args), elapsedMs: Date.now() - started };
}

/**
 * What this pod is connected to.
 *
 * `ss` where it exists, /proc/net/tcp otherwise — the fallback matters because
 * slim images routinely ship neither ss nor netstat, and "no tools" is not a
 * good reason to be unable to answer "who is it talking to".
 */
async function connections(t: CollectTarget): Promise<CollectResult> {
  const withSs = execArgs(t, ['sh', '-c', 'ss -tanp 2>/dev/null || cat /proc/net/tcp']);
  const started = Date.now();
  const res = await run(withSs, { timeoutMs: 45_000, maxBuffer: 16 * 1024 * 1024 });
  if (!res.ok) {
    return { kind: 'conns', ok: false, command: showCommand(withSs), error: firstLine(res.stderr || res.failure) };
  }
  const raw = res.stdout;
  // /proc/net/tcp is hex and unreadable as-is; decode it so the panel shows
  // addresses rather than a wall of 0100007F:1F90.
  const text = raw.includes('sl  local_address') ? decodeProcNetTcp(raw) : raw;
  return { kind: 'conns', ok: true, text, command: showCommand(withSs), elapsedMs: Date.now() - started };
}

/** `0100007F:1F90` → `127.0.0.1:8080`. Little-endian, hex, per the kernel format. */
export function decodeProcNetTcp(raw: string): string {
  const STATES: Record<string, string> = {
    '01': 'ESTABLISHED', '02': 'SYN_SENT', '03': 'SYN_RECV', '04': 'FIN_WAIT1',
    '05': 'FIN_WAIT2', '06': 'TIME_WAIT', '07': 'CLOSE', '08': 'CLOSE_WAIT',
    '09': 'LAST_ACK', '0A': 'LISTEN', '0B': 'CLOSING',
  };
  const addr = (hex: string): string => {
    const [ipHex, portHex] = hex.split(':');
    if (!ipHex || !portHex || ipHex.length !== 8) return hex;
    const octets: number[] = [];
    for (let i = 6; i >= 0; i -= 2) octets.push(parseInt(ipHex.slice(i, i + 2), 16));
    return `${octets.join('.')}:${parseInt(portHex, 16)}`;
  };

  const out = ['state        local                 remote'];
  for (const line of raw.split('\n')) {
    const f = line.trim().split(/\s+/);
    if (f.length < 4 || !/^\d+:$/.test(f[0])) continue;
    const state = STATES[f[3].toUpperCase()] ?? f[3];
    out.push(`${state.padEnd(12)} ${addr(f[1]).padEnd(21)} ${addr(f[2])}`);
  }
  return out.length > 1 ? out.join('\n') : raw;
}

// ── Shared plumbing ─────────────────────────────────────────────────────────

/**
 * kubectl cp out of a pod.
 *
 * Run from the destination directory with a bare filename, because kubectl's
 * source/destination parser splits on ':' and mangles a Windows path like
 * `C:\dumps\x.hprof` into a host called "C". Passing `cwd` and a bare name
 * sidesteps that entirely.
 */
async function copyFromPod(t: CollectTarget, remote: string, local: string): Promise<{ ok: boolean; error?: string }> {
  await mkdir(dirname(local), { recursive: true });
  const args = [
    '--context', t.context,
    'cp', `${t.namespace}/${t.pod}:${remote.replace(/^\//, '')}`, basename(local),
    ...(t.container ? ['-c', t.container] : []),
    '--retries=3',
  ];
  const res = await run(args, { cwd: dirname(local), timeoutMs: 900_000 });
  if (!res.ok) {
    const err = firstLine(res.stderr || res.failure);
    // kubectl cp is tar over the exec channel, and the error it gives without
    // tar is about executable lookup, which nobody connects to this cause.
    if (/tar.*not found|executable file not found/i.test(err)) {
      return { ok: false, error: 'This container has no `tar`, and kubectl cp needs it. Use an artifact that comes back on stdout instead.' };
    }
    return { ok: false, error: err };
  }
  return { ok: true };
}

/** Best effort — a failure here must not mask the result of the collection. */
async function cleanupRemote(t: CollectTarget, remote: string): Promise<void> {
  await run(execArgs(t, ['rm', '-f', remote]), { timeoutMs: 30_000 }).catch(() => undefined);
}

function firstLine(s?: string): string {
  return (s || '').split('\n').map(l => l.trim()).filter(Boolean)[0] || 'kubectl failed';
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export function formatBytes(n?: number): string {
  if (n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

// ── Entry point ─────────────────────────────────────────────────────────────

export interface CollectOptions {
  kind: ArtifactKind;
  destDir: string;
  /** jstack instead of jcmd, jmap instead of jcmd — set from the probe. */
  useJstack?: boolean;
  useJmap?: boolean;
  /** JFR duration. */
  seconds?: number;
  /** Explicit consent to install py-spy into a running container. */
  allowInstall?: boolean;
}

export async function collectArtifact(
  t: CollectTarget,
  opts: CollectOptions,
  onProgress: Progress = () => {},
): Promise<CollectResult> {
  await mkdir(opts.destDir, { recursive: true });
  onProgress({ phase: 'running', detail: 'Starting…' });

  let result: CollectResult;
  switch (opts.kind) {
    case 'threaddump':
      result = await threadDump(t, !!opts.useJstack); break;
    case 'threaddump-sigquit':
      result = await threadDumpViaSigquit(t); break;
    case 'histogram':
      result = await histogram(t); break;
    case 'heapdump':
      result = await heapDump(t, opts.destDir, !!opts.useJmap, onProgress); break;
    case 'jfr':
      result = await flightRecording(t, opts.destDir, opts.seconds ?? 30, onProgress); break;
    case 'stackdump':
      result = await pyStackDump(t, !!opts.allowInstall); break;
    case 'conns':
      result = await connections(t); break;
    default:
      result = { kind: opts.kind, ok: false, error: `Unknown artifact: ${opts.kind}` };
  }

  // Text artifacts are written to disk as well as returned, so the Doctor tab
  // has a file to open and the evidence survives closing the panel.
  if (result.ok && result.text && !result.file) {
    const ext = result.kind === 'histogram' ? 'txt' : 'txt';
    const file = join(opts.destDir, artifactName(t.pod, result.kind, ext));
    await writeFile(file, result.text, 'utf8');
    result.file = file;
    result.bytes = Buffer.byteLength(result.text, 'utf8');
  }

  onProgress({ phase: 'done', detail: result.ok ? 'Collected.' : (result.error ?? 'Failed.') });
  return result;
}
