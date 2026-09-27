/**
 * Driving `python3 -m pdb` inside a pod.
 *
 * ── Why pdb, and why over the exec API ──
 *
 * debugpy would give a proper DAP session, and it would also need installing
 * into the container and a port opened to reach it — a network listener in a
 * production pod, for the length of a debugging session. pdb ships with every
 * Python, speaks over stdin and stdout, and needs nothing but the exec channel
 * the pod terminal already uses (see `pod-terminal`): the user's own
 * credentials, no port, nothing listening.
 *
 * ── How it is driven ──
 *
 * pdb is a prompt: it prints `(Pdb) ` and reads one line. So a command is a
 * line written, and its answer is everything printed until the next prompt.
 * `PdbConversation` does that and nothing else; `PdbDriver` sits on top and
 * knows what the commands mean — breakpoints before the first `c`, a refresh
 * of the stack and the variables after every stop.
 *
 * No TTY. With one, pdb echoes every line we send and colours its listing,
 * and both would have to be stripped back out to parse the answer. Without
 * one the answer is plain text, which is the only form worth parsing.
 *
 * ── How values come back ──
 *
 * `p` prints a repr, and a repr of a dict is not something to parse. The
 * variables are asked for with a one-line `!print(...)` that emits JSON
 * behind a marker, so the panes read data rather than a Python literal. The
 * expression is evaluated in the paused frame, which is exactly where the
 * reader's own `p` would run.
 */
import { PassThrough, Writable } from 'stream';
import type WebSocket from 'ws';
import { k8sModule, type KubeConfigHandle, type TerminalTarget } from './pod-terminal';

export const PROMPT = '(Pdb) ';

/** Marks the lines our own queries print, so they can be found in the answer. */
export const MARK = '@@daakia:';

// ── The conversation ────────────────────────────────────────────────────────

interface Pending {
  cmd: string;
  resolve: (block: string) => void;
}

/**
 * One line out, one block back.
 *
 * Commands are queued and written one at a time: pdb reads a line only when it
 * is at its prompt, and a second line written early would be read by the
 * PROGRAM if it happened to call `input()` — which is not a hypothetical in a
 * script that asks "are you sure?".
 */
export class PdbConversation {
  private buffer = '';
  private queue: Pending[] = [];
  private current: Pending | undefined;
  private first: ((block: string) => void) | undefined;
  private started = false;
  private closed = false;

  constructor(private readonly write: (line: string) => void) {}

  /** The banner and first location, up to the first prompt. */
  ready(): Promise<string> {
    return new Promise((resolve) => { this.first = resolve; });
  }

  /** Bytes from pdb's stdout. */
  feed(chunk: string): void {
    this.buffer += chunk.replace(/\r\n/g, '\n');
    if (!this.buffer.endsWith(PROMPT)) return;
    const block = this.buffer.slice(0, -PROMPT.length);
    this.buffer = '';
    if (!this.started) {
      this.started = true;
      this.first?.(block);
      this.first = undefined;
    } else if (this.current) {
      const done = this.current;
      this.current = undefined;
      done.resolve(block);
    }
    this.pump();
  }

  /** Whatever has arrived since the last prompt — a running program's output. */
  pendingText(): string {
    return this.buffer;
  }

  get busy(): boolean {
    return !!this.current || this.queue.length > 0;
  }

  send(cmd: string): Promise<string> {
    // One line is one command. A newline inside would be a second command
    // this queue does not know about, and every answer after it would be
    // paired with the wrong question.
    const line = cmd.replace(/[\r\n]+/g, ' ').trim();
    return new Promise((resolve) => {
      if (this.closed) { resolve(''); return; }
      this.queue.push({ cmd: line, resolve });
      this.pump();
    });
  }

  /** Everything still waiting resolves empty, so no caller hangs on a dead session. */
  close(): void {
    this.closed = true;
    this.current?.resolve('');
    this.current = undefined;
    for (const q of this.queue) q.resolve('');
    this.queue = [];
    this.first?.('');
    this.first = undefined;
  }

  private pump(): void {
    if (this.closed || !this.started || this.current) return;
    const next = this.queue.shift();
    if (!next) return;
    this.current = next;
    this.write(`${next.cmd}\n`);
  }
}

// ── Reading what pdb says ───────────────────────────────────────────────────

export interface PdbLocation {
  file: string;
  line: number;
  fn: string;
  /** The `-> ` line: the source about to run. */
  source?: string;
}

/* `->value` follows on a `--Return--` stop: `> x.py(12)pool()->{'a': 1}`. */
const LOCATION = /^> (.+?)\((\d+)\)(.*?)\(\)(?:->.*)?\s*$/;

/** Where pdb stopped: the last `> file(line)fn()` in a block. */
export function parseLocation(block: string): PdbLocation | undefined {
  const lines = block.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = LOCATION.exec(lines[i]);
    if (!m) continue;
    const next = lines[i + 1] ?? '';
    return {
      file: m[1],
      line: Number(m[2]),
      fn: m[3] || '<module>',
      source: next.startsWith('-> ') ? next.slice(3) : undefined,
    };
  }
  return undefined;
}

export interface PdbFrame {
  file: string;
  line: number;
  fn: string;
  /** True for the frame pdb is in — the `>` one. */
  current: boolean;
}

/**
 * `where`, innermost first, without pdb's own frames.
 *
 * Every stack under `-m pdb` starts in bdb, runpy and an `exec` of `<string>`
 * — machinery the reader did not write and cannot step into usefully. They
 * are dropped so the call stack is the script's.
 */
export function parseWhere(block: string): PdbFrame[] {
  const frames: PdbFrame[] = [];
  for (const raw of block.split('\n')) {
    const m = /^([> ])\s*(.+?)\((\d+)\)(.*?)\(\)(?:->.*)?\s*$/.exec(raw);
    if (!m) continue;
    const file = m[2];
    if (/(^|\/)(bdb|pdb|runpy)\.py$/.test(file) || file === '<string>') continue;
    frames.push({ file, line: Number(m[3]), fn: m[4] || '<module>', current: m[1] === '>' });
  }
  return frames.reverse();
}

export interface PdbVar {
  name: string;
  type: string;
  value: string;
  /** Items in a container, -1 for anything that is not one. */
  size: number;
  children?: { name: string; type: string; value: string }[];
}

/** The JSON behind a marker line, or undefined when the query failed. */
export function parseMarked<T>(block: string, tag: string): T | undefined {
  const prefix = `${MARK}${tag}@@ `;
  for (const line of block.split('\n')) {
    const at = line.indexOf(prefix);
    if (at < 0) continue;
    try { return JSON.parse(line.slice(at + prefix.length)) as T; } catch { return undefined; }
  }
  return undefined;
}

/** pdb's own complaint about a command, e.g. `*** NameError: name 'x' is not defined`. */
export function pdbError(block: string): string | undefined {
  const line = block.split('\n').find(l => l.startsWith('*** '));
  return line?.slice(4);
}

export function parseVars(block: string, tag: 'locals' | 'globals'): PdbVar[] {
  const rows = parseMarked<unknown[]>(block, tag);
  if (!Array.isArray(rows)) return [];
  const out: PdbVar[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || typeof r[0] !== 'string') continue;
    const kids = Array.isArray(r[4]) ? (r[4] as unknown[]) : [];
    out.push({
      name: r[0],
      type: String(r[1] ?? ''),
      value: String(r[2] ?? ''),
      size: typeof r[3] === 'number' ? r[3] : -1,
      children: kids.length
        ? kids.filter(Array.isArray).map(k => {
          const c = k as unknown[];
          return { name: String(c[0]), type: String(c[1] ?? ''), value: String(c[2] ?? '') };
        })
        : undefined,
    });
  }
  return out;
}

export type StopKind = 'paused' | 'finished' | 'post-mortem';

export interface PdbStop {
  kind: StopKind;
  location?: PdbLocation;
  /** What the program printed on the way here. */
  output: string;
  /** The exception, for a post-mortem stop. */
  exception?: string;
  /** `--Return--`: paused on a function's way out, after a step out. */
  returning?: boolean;
}

/** Lines that are pdb talking, not the program. */
const CHROME = [
  /^> .+\(\d+\).*\(\)(?:->.*)?\s*$/, /^-> /, /^--Return--$/, /^--Call--$/,
  /^Breakpoint \d+ at /, /^Deleted breakpoint /, /^The program finished and will be restarted$/,
  /^Uncaught exception\. Entering post mortem debugging$/, /^Running 'cont' or 'step' will restart the program$/,
  /^Post mortem debugger finished\./, /^Restarting .+ with arguments:/, /^\*\*\* /,
];

/**
 * What a `c`, `n`, `s` or `r` came back with.
 *
 * pdb says three different things here and they need different answers: it
 * stopped somewhere (show it), the program ran off the end (end the session —
 * pdb would otherwise restart it from line 1, which nobody asked for), or it
 * died and pdb is holding the corpse for inspection (show where, and why).
 */
export function classifyStop(block: string): PdbStop {
  const lines = block.split('\n');
  const output = lines.filter(l => !CHROME.some(re => re.test(l))).join('\n').replace(/^\n+|\n+$/g, '');
  if (/The program finished and will be restarted/.test(block)) {
    return { kind: 'finished', output };
  }
  const location = parseLocation(block);
  if (/Uncaught exception\. Entering post mortem debugging/.test(block)) {
    const before = block.split(/Uncaught exception\. Entering post mortem debugging/)[0];
    const exLine = before.trimEnd().split('\n').reverse()
      .find(l => /^[A-Za-z_][\w.]*(Error|Exception|Exit|Interrupt)\b/.test(l.trim()));
    return {
      kind: 'post-mortem', location,
      output: output.replace(/Traceback \(most recent call last\):[\s\S]*$/, '').trimEnd(),
      exception: exLine?.trim() ?? 'Uncaught exception',
    };
  }
  return { kind: 'paused', location, output, returning: /^--Return--$/m.test(block) };
}

// ── The queries ─────────────────────────────────────────────────────────────

/**
 * A repr that fits in a pane.
 *
 * `reprlib` abbreviates containers the way the plan's panes read —
 * `{'status': 'UP', …}` — but also cuts strings at thirty characters, which
 * makes a URL useless. Scalars get the real repr, capped at 200.
 */
function reprOf(x: string): string {
  return `(repr(${x})[:200] if ${x} is None or isinstance(${x}, (str, bytes, int, float, bool)) else __import__('reprlib').repr(${x}))`;
}

function sizeOf(x: string): string {
  return `(len(${x}) if isinstance(${x}, (dict, list, tuple, set, frozenset)) else -1)`;
}

/**
 * One level of children for a dict or a list, so `components: dict(4)` can
 * open. One level is the budget: this runs on every stop, and walking a large
 * object graph on every step would make stepping slow in proportion to how
 * much the program holds.
 */
function childrenOf(x: string): string {
  return `([[str(ck), type(cv).__name__, ${reprOf('cv')}] for ck, cv in list(${x}.items())[:50]] if isinstance(${x}, dict)`
    + ` else [[str(ci), type(cv).__name__, ${reprOf('cv')}] for ci, cv in enumerate(list(${x})[:50])] if isinstance(${x}, (list, tuple))`
    + ' else [])';
}

/**
 * `locals()` or `globals()`, as JSON.
 *
 * The scope is read in the comprehension's OUTERMOST iterable on purpose:
 * that one expression is evaluated in the enclosing scope — the paused frame —
 * where anything inside the comprehension would see the comprehension's own.
 * Globals leave out modules, functions and classes: `json` and `def pool` are
 * the script's furniture, not its state.
 */
export function varsCommand(scope: 'locals' | 'globals'): string {
  const filter = scope === 'locals'
    ? "not k.startswith('__')"
    : "not k.startswith('__') and not callable(v) and type(v).__name__ != 'module'";
  return `!print('${MARK}${scope}@@ ' + __import__('json').dumps(`
    + `[[k, type(v).__name__, ${reprOf('v')}, ${sizeOf('v')}, ${childrenOf('v')}]`
    + ` for k, v in list(${scope}().items()) if ${filter}]))`;
}

export function watchCommand(expr: string): string {
  return `!print('${MARK}watch@@ ' + __import__('json').dumps(${reprOf(`(${expr})`)}))`;
}

// ── The driver ──────────────────────────────────────────────────────────────

export interface Watch {
  expr: string;
  value?: string;
  error?: string;
}

export interface DebugState {
  status: 'starting' | 'running' | 'paused' | 'finished' | 'ended';
  location?: PdbLocation;
  frames: PdbFrame[];
  locals: PdbVar[];
  globals: PdbVar[];
  watches: Watch[];
  exception?: string;
  returning?: boolean;
  /** Why it is paused: a breakpoint we set, or a step. */
  reason?: 'breakpoint' | 'step' | 'entry' | 'exception';
}

export interface DriverEvents {
  state: (s: DebugState) => void;
  /** The pdb transcript the Debug console shows. */
  console: (text: string) => void;
  /** What the program printed, for the Output panel. */
  output: (text: string) => void;
}

/**
 * Knows what the commands mean.
 *
 * Deliberately transport-free: it is handed a conversation, so a test can play
 * pdb's side of it line by line and check that a breakpoint is set before the
 * first `c`, that a finished program is quit rather than restarted, and that
 * every stop refreshes the panes.
 */
export class PdbDriver {
  private bps = new Set<number>();
  /** Gutter changes made while the program ran; pdb hears them at the next stop. */
  private pendingBps: number[] | undefined;
  private watches: string[] = [];
  private state: DebugState = { status: 'starting', frames: [], locals: [], globals: [], watches: [] };

  constructor(
    private readonly conv: PdbConversation,
    private readonly path: string,
    private readonly ev: DriverEvents,
  ) {}

  get status(): DebugState['status'] {
    return this.state.status;
  }

  /** Breakpoints first, then run to the first one. */
  async start(breakpoints: number[], watches: string[]): Promise<void> {
    this.watches = [...watches];
    const banner = await this.conv.ready();
    if (banner) this.ev.console(banner);
    for (const line of breakpoints) {
      const block = await this.visible(`b ${this.path}:${line}`);
      if (/^Breakpoint \d+ at /m.test(block)) this.bps.add(line);
    }
    await this.resume('c');
  }

  /** Continue, step over, step into, step out. */
  async resume(cmd: 'c' | 'n' | 's' | 'r'): Promise<void> {
    if (this.state.status === 'finished' || this.state.status === 'ended') return;
    this.emit({ status: 'running' });
    const block = await this.visible(cmd);
    await this.handleStop(block, cmd === 'c' ? 'breakpoint' : 'step');
  }

  /**
   * Back to the top, breakpoints kept.
   *
   * pdb's own `restart` re-executes the file in the same process and keeps
   * every breakpoint, which is what "restart" means in any debugger. It lands
   * on line 1, so a `c` follows to reach the first breakpoint again.
   */
  async restart(): Promise<void> {
    if (this.state.status === 'ended') return;
    this.emit({ status: 'running', exception: undefined });
    await this.visible('restart');
    await this.resume('c');
  }

  /** A line from the Debug console, as typed. */
  async console(cmd: string): Promise<void> {
    if (this.state.status === 'ended') return;
    const block = await this.visible(cmd);
    /* A typed `n` or `c` moves the program just as the toolbar does, and the
       panes must follow it. A `p` does not, and costs one refresh. */
    if (LOCATION.test(block.split('\n').find(l => LOCATION.test(l)) ?? '')
        || /The program finished and will be restarted/.test(block)) {
      await this.handleStop(block, 'step');
    } else if (this.state.status === 'paused') {
      await this.refresh();
    }
  }

  /** Bring pdb's breakpoints in line with the gutter's. */
  async setBreakpoints(lines: number[]): Promise<void> {
    if (this.state.status !== 'paused') {
      // Applied at the next stop — pdb only reads commands at its prompt.
      this.pendingBps = lines;
      return;
    }
    const want = new Set(lines);
    for (const l of [...this.bps]) {
      if (want.has(l)) continue;
      await this.conv.send(`cl ${this.path}:${l}`);
      this.bps.delete(l);
    }
    for (const l of want) {
      if (this.bps.has(l)) continue;
      const block = await this.conv.send(`b ${this.path}:${l}`);
      if (/^Breakpoint \d+ at /m.test(block)) this.bps.add(l);
    }
  }

  async setWatches(exprs: string[]): Promise<void> {
    this.watches = [...exprs];
    if (this.state.status === 'paused') this.emit({ watches: await this.evalWatches() });
  }

  /** Ask pdb to leave. The caller closes the channel either way. */
  quit(): void {
    if (this.state.status === 'paused' || this.state.status === 'finished') void this.conv.send('q');
    this.emit({ status: 'ended' });
  }

  markEnded(): void {
    if (this.state.status !== 'ended') this.emit({ status: 'ended' });
  }

  private async handleStop(block: string, why: 'breakpoint' | 'step'): Promise<void> {
    const stop = classifyStop(block);
    if (stop.output) this.ev.output(`${stop.output}\n`);
    if (stop.kind === 'finished') {
      /* pdb would restart the program from the top here. Nobody pressing
         Continue on the last line means "and again", so the session ends and
         the process with it. */
      this.emit({ status: 'finished', location: undefined, frames: [], exception: undefined });
      void this.conv.send('q');
      return;
    }
    if (this.pendingBps) {
      const lines = this.pendingBps;
      this.pendingBps = undefined;
      this.state.status = 'paused';
      await this.setBreakpoints(lines);
    }
    const onBp = !!stop.location && why === 'breakpoint' && this.bps.has(stop.location.line)
      && stop.location.file === this.path;
    this.emit({
      status: 'paused',
      location: stop.location,
      exception: stop.exception,
      returning: stop.returning,
      reason: stop.kind === 'post-mortem' ? 'exception' : onBp ? 'breakpoint' : 'step',
    });
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    const where = await this.conv.send('where');
    const locals = await this.conv.send(varsCommand('locals'));
    const globals = await this.conv.send(varsCommand('globals'));
    const watches = await this.evalWatches();
    const frames = parseWhere(where);
    this.emit({
      frames,
      locals: parseVars(locals, 'locals'),
      /* At module level locals IS globals; showing both lists the same names
         twice under two headings. */
      globals: frames[0]?.fn === '<module>' ? [] : parseVars(globals, 'globals'),
      watches,
    });
  }

  private async evalWatches(): Promise<Watch[]> {
    const out: Watch[] = [];
    for (const expr of this.watches) {
      const block = await this.conv.send(watchCommand(expr));
      const value = parseMarked<string>(block, 'watch');
      out.push(value !== undefined ? { expr, value } : { expr, error: pdbError(block) ?? 'not available' });
    }
    return out;
  }

  /** A command the reader should see in the console, with its answer. */
  private async visible(cmd: string): Promise<string> {
    this.ev.console(`${PROMPT}${cmd}\n`);
    const block = await this.conv.send(cmd);
    if (block) this.ev.console(block.endsWith('\n') ? block : `${block}\n`);
    return block;
  }

  private emit(patch: Partial<DebugState>): void {
    this.state = { ...this.state, ...patch };
    this.ev.state(this.state);
  }
}

// ── The channel ─────────────────────────────────────────────────────────────

export interface PdbChannel {
  write: (text: string) => void;
  close: () => void;
}

/**
 * pdb, over the Kubernetes exec API — the terminal's transport, without a TTY.
 *
 * stdout feeds the conversation; stderr is the program's and goes straight to
 * the console, where a traceback belongs.
 */
export async function openPdbChannel(
  kc: KubeConfigHandle,
  target: TerminalTarget,
  command: string[],
  cb: { stdout: (s: string) => void; stderr: (s: string) => void; exit: (reason: string) => void },
): Promise<PdbChannel> {
  const { Exec } = await k8sModule();
  const exec = new Exec(kc);
  const stdin = new PassThrough();
  const sink = (fn: (s: string) => void) => new Writable({
    write(chunk: Buffer, _enc, next) { fn(chunk.toString('utf8')); next(); },
  });
  let ended = false;
  const end = (reason: string) => { if (!ended) { ended = true; cb.exit(reason); } };

  const ws: WebSocket = await exec.exec(
    target.namespace, target.pod, target.container, command,
    sink(cb.stdout), sink(cb.stderr), stdin,
    /* tty */ false,
    (status) => end(status.status === 'Success' ? 'pdb exited.' : status.message ?? 'pdb ended.'),
  );
  ws.on('error', (e: Error) => end(e.message));
  ws.on('close', () => end('The connection to the pod closed.'));

  return {
    write: (text) => { if (!ended) stdin.write(text); },
    close: () => {
      try { stdin.end(); } catch { /* gone */ }
      try { ws.close(); } catch { /* gone */ }
      end('Stopped.');
    },
  };
}
