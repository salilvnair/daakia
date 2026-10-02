/**
 * What the Python tab and the Scripts screen show, worked out without React.
 *
 * Kept apart so the judgements — which runs count as failed, which lines of
 * three pods' output differ, which values sit beside the paused line — can be
 * tested as data rather than read off a screen.
 */

/** `1.4s`, `850ms`, `2m 03s` — the Output panel's footer and the Runs list. */
/**
 * The height of the tab's three top rows — the library's heading, the toolbar
 * and Run and Debug — so the line under them runs straight across.
 */
export const PY_HEADER_HEIGHT = 44;

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/** `00:07` for the debugger's session timer; hours only when there are some. */
export function sessionClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * `Python 3.11.6` → `3.11`, for the header badge.
 *
 * Major and minor only: the patch level is not what decides whether a script
 * runs, and the badge sits in a header already carrying a pod name.
 */
export function shortPythonVersion(v: string | undefined): string | undefined {
  const m = /(\d+)\.(\d+)/.exec(v ?? '');
  return m ? `${m[1]}.${m[2]}` : undefined;
}

/** `orders-api-7d9f8c4b-x2k9p` → `x2k9p`: what tells replicas apart. */
export function podShort(name: string): string {
  const parts = name.split('-');
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

/** `2d`, `5d`, `2w`, `1mo` — the library's age column. */
export function relativeAge(iso: string | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  const d = Math.floor(s / 86_400);
  if (d < 7) return `${d}d`;
  if (d < 30) return `${Math.floor(d / 7)}w`;
  if (d < 365) return `${Math.floor(d / 30)}mo`;
  return `${Math.floor(d / 365)}y`;
}

// ── The library ─────────────────────────────────────────────────────────────

export interface ScriptLike {
  id: string;
  name: string;
  folder?: string;
  source: string;
  updatedAt?: string;
}

/** Name first, then content — a search for `urlopen` should find the script that calls it. */
export function filterScripts<T extends ScriptLike>(scripts: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return scripts;
  const byName = scripts.filter(s => s.name.toLowerCase().includes(q) || (s.folder ?? '').toLowerCase().includes(q));
  const bySource = scripts.filter(s => !byName.includes(s) && s.source.toLowerCase().includes(q));
  return [...byName, ...bySource];
}

/**
 * Under their folder headings, unfiled last.
 *
 * Unfiled is last rather than first because a library that has started using
 * folders reads its headings top-down, and a heading-less block above them
 * looks like it belongs to whatever is above it.
 */
export function groupScripts<T extends ScriptLike>(scripts: T[]): { folder: string; scripts: T[] }[] {
  const by = new Map<string, T[]>();
  for (const s of scripts) {
    const f = s.folder ?? '';
    by.set(f, [...(by.get(f) ?? []), s]);
  }
  const folders = [...by.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const out = folders.map(folder => ({ folder, scripts: by.get(folder)! }));
  if (by.has('')) out.push({ folder: '', scripts: by.get('')! });
  return out;
}

// ── Runs ────────────────────────────────────────────────────────────────────

export type RunStatus = 'queued' | 'running' | 'ok' | 'failed' | 'refused' | 'stopped';

/** A finished exit code, as a status. `null` means it never produced one. */
export function statusFromExit(e: { code: number | null; refused?: string; stopped?: boolean }): RunStatus {
  if (e.refused) return 'refused';
  if (e.stopped) return 'stopped';
  return e.code === 0 ? 'ok' : 'failed';
}

export interface RunSummary {
  total: number;
  ok: number;
  failed: number;
  running: number;
  /** "2 ok · 1 failed", or "running 1 of 3". */
  label: string;
}

/**
 * The strip above a multi-pod run.
 *
 * Refused and stopped count as failed: the question the strip answers is
 * "did the script do its job on every pod", and on those pods it did not. A
 * refusal saying why is in that pod's own tab.
 */
export function summarizeRuns(runs: { status: RunStatus }[]): RunSummary {
  const total = runs.length;
  const ok = runs.filter(r => r.status === 'ok').length;
  const running = runs.filter(r => r.status === 'running' || r.status === 'queued').length;
  const failed = total - ok - running;
  const parts: string[] = [];
  if (running) parts.push(`running ${total - running} of ${total} done`);
  if (ok) parts.push(`${ok} ok`);
  if (failed) parts.push(`${failed} failed`);
  return { total, ok, failed, running, label: parts.join(' · ') || 'nothing run yet' };
}

export interface CompareRow {
  /** One cell per pod, in the order given. */
  cells: string[];
  same: boolean;
}

/**
 * Line-by-line, across pods.
 *
 * Aligned by position rather than diffed, because the same script run on
 * replicas prints the same SHAPE — the interesting difference is a value on
 * line 3, not an inserted line. Each pod's own name is folded to a
 * placeholder first: a script that prints its hostname would otherwise
 * differ on every line that matters least.
 */
export function compareOutputs(outputs: { pod: string; text: string }[], foldPodNames = true): CompareRow[] {
  const split = outputs.map(o => {
    let t = o.text.replace(/\r/g, '').replace(/\n+$/, '');
    if (foldPodNames && o.pod) t = t.split(o.pod).join('‹pod›');
    return t ? t.split('\n') : [];
  });
  const n = Math.max(0, ...split.map(l => l.length));
  const rows: CompareRow[] = [];
  for (let i = 0; i < n; i++) {
    const cells = split.map(l => l[i] ?? '');
    rows.push({ cells, same: cells.every(c => c === cells[0]) });
  }
  return rows;
}

// ── The paused line ─────────────────────────────────────────────────────────

const KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
  'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import',
  'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while',
  'with', 'yield', 'print', 'self',
]);

/**
 * The values VS Code would print after the paused line: `data = {…}`.
 *
 * Only names the line actually mentions, in the order it mentions them, and
 * only names the frame has — a name that is an attribute (`r.status`) or
 * inside a string is not a variable of this frame and would show a wrong
 * value. Capped, because a long line of names becomes a second line of text.
 */
export function inlineValues(
  line: string, vars: { name: string; value: string }[], max = 3, width = 60,
): string {
  const code = line.replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""').replace(/#.*$/, '');
  const seen: string[] = [];
  const re = /(^|[^.\w])([A-Za-z_]\w*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const name = m[2];
    if (KEYWORDS.has(name) || seen.includes(name)) continue;
    if (vars.some(v => v.name === name)) seen.push(name);
  }
  return seen.slice(0, max).map(name => {
    const v = vars.find(x => x.name === name)!.value;
    return `${name} = ${v.length > width ? `${v.slice(0, width - 1)}…` : v}`;
  }).join('  ');
}

/** Make an id the host will accept (`^[A-Za-z0-9_-]{4,64}$`). */
export function newId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** A new script's body: enough to show it works, nothing to delete. */
export const NEW_SCRIPT = [
  'import os, socket',
  '',
  '# Runs inside the pod, with the container\'s own environment.',
  'print(socket.gethostname(), os.environ.get("HOSTNAME", ""))',
  '',
].join('\n');

const PY_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
  'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

/**
 * The expression a hover at `column` (1-based, Monaco's) is over: the word
 * under the pointer and the attribute chain leading to it — hovering
 * `environ` in `os.environ.get` means `os.environ`, not `environ` alone and
 * not the call after it. Nothing inside a string or a comment, nothing that is
 * a keyword or a number.
 */
export function hoverExprAt(line: string, column: number): { expr: string; start: number; end: number } | undefined {
  const i = column - 1;
  if (i < 0 || i > line.length) return undefined;
  const isWord = (c: string | undefined) => !!c && /[A-Za-z0-9_]/.test(c);
  let ws = i;
  let we = i;
  if (!isWord(line[ws])) { if (isWord(line[ws - 1])) { ws--; we--; } else return undefined; }
  while (isWord(line[ws - 1])) ws--;
  while (isWord(line[we])) we++;
  /* Inside a comment or a string: count the quotes and the hash before it. */
  const before = line.slice(0, ws);
  let inStr: string | undefined;
  for (let k = 0; k < before.length; k++) {
    const c = before[k];
    if (inStr) { if (c === '\\') k++; else if (c === inStr) inStr = undefined; continue; }
    if (c === '#') return undefined;
    if (c === '"' || c === "'") inStr = c;
  }
  if (inStr) return undefined;
  let start = ws;
  while (start > 0 && line[start - 1] === '.' && isWord(line[start - 2])) {
    start--;
    while (isWord(line[start - 1])) start--;
  }
  const expr = line.slice(start, we);
  const head = expr.split('.')[0];
  if (/^\d/.test(head) || PY_KEYWORDS.has(line.slice(ws, we))) return undefined;
  return { expr, start: start + 1, end: we + 1 };
}

/**
 * What the ghost text is asked with: the code before the cursor and after it.
 *
 * Bounded both ways — the model needs the function it is in and the imports,
 * not a thousand lines above. Nothing is asked while a comment is being typed
 * (that is prose, and suggesting the rest of a sentence is noise), or in an
 * empty file, where there is nothing yet to go on.
 */
export function ghostPrompt(text: string, offset: number): { prefix: string; suffix: string } | undefined {
  const prefix = text.slice(Math.max(0, offset - 4000), offset);
  if (!prefix.trim()) return undefined;
  const lineStart = prefix.lastIndexOf('\n') + 1;
  if (/^\s*#/.test(prefix.slice(lineStart))) return undefined;
  return { prefix, suffix: text.slice(offset, offset + 1500) };
}

/**
 * The model's answer as text to insert at the cursor.
 *
 * Models fence code even when told not to, and often start by repeating the
 * line being typed; both are taken off. Twelve lines at most — a suggestion
 * longer than a screenful is not a suggestion.
 */
export function cleanGhost(answer: string, linePrefix: string): string {
  let t = answer.replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '');
  const typed = linePrefix.trimStart();
  if (typed && t.startsWith(typed)) t = t.slice(typed.length);
  else if (typed && t.trimStart().startsWith(typed)) t = t.trimStart().slice(typed.length);
  t = t.replace(/\s+$/, '');
  if (!t.trim()) return '';
  return t.split('\n').slice(0, 12).join('\n');
}
