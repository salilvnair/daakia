/**
 * The log view's filter, run on the host over a whole downloaded log.
 *
 * A downloaded log can be a gigabyte — millions of lines the webview cannot
 * hold — so "show me thread X" has to be answered here, over the file, and
 * only the lines that survive sent to the view. The view then applies its own
 * filter to those same lines; for that to be a no-op rather than a second
 * opinion, this must mean exactly what the view means:
 *
 * - `/regex/flags` in the box is a regex; anything else, or a regex that does
 *   not compile, is a case-insensitive substring — tested on the raw line.
 * - Level chips: empty means every level.
 * - Field filters: includes OR'd within a field and AND'd across fields;
 *   excludes win; `*` is a wildcard. A continuation (a stack frame) follows
 *   the event above it rather than being judged on its own.
 * - Blank lines are never shown.
 * - With context, a hit keeps that many surviving lines either side of it.
 *
 * It is a port of `webview-ui/src/components/k8s/log-view.ts` (`buildMatcher`,
 * `matchesFieldFilters`, `filterLines`), and `log-filter.test.ts` runs both
 * over the same lines and requires the same answer — the two cannot drift
 * without a test failing.
 *
 * Unlike `filterLines`, this is fed one line at a time: a file is read in
 * chunks, and holding every candidate until the end to work out context is the
 * memory this exists to avoid. Context is resolved with a small look-back ring
 * and a look-ahead counter instead.
 */
import type { LogLine } from './k8s-log-stream';

export interface HostFieldFilter {
  field: string;
  value: string;
  mode: 'include' | 'exclude';
}

export interface HostFilterSpec {
  query: string;
  levels: string[];
  fields?: HostFieldFilter[];
  contextLines?: number;
}

/** True when the spec would keep every line — no filtering needed at all. */
export function isEmptySpec(spec: HostFilterSpec): boolean {
  return !spec.query.trim() && !spec.levels.length && !(spec.fields?.length);
}

/** The query box as a test on the raw line. Same rules as the view's buildMatcher. */
export function buildTest(query: string): ((text: string) => boolean) | null {
  const q = query.trim();
  if (!q) return null;
  const asRegex = /^\/(.+)\/([gimsu]*)$/.exec(q);
  if (asRegex) {
    try {
      const re = new RegExp(asRegex[1], asRegex[2].replace('g', ''));
      return (text: string) => re.test(text);
    } catch { /* a half-typed regex is still a search — fall through */ }
  }
  const needle = q.toLowerCase();
  return (text: string) => text.toLowerCase().includes(needle);
}

function wildcard(value: string): (v: string) => boolean {
  if (!value.includes('*')) {
    const lower = value.toLowerCase();
    return v => v.toLowerCase() === lower;
  }
  const re = new RegExp(
    '^' + value.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$',
    'i',
  );
  return v => re.test(v);
}

function valueOf(line: Pick<LogLine, 'thread' | 'logger' | 'app' | 'fields'>, field: string): string | undefined {
  if (field === 'thread' || field === 'logger' || field === 'app') return line[field];
  return line.fields?.[field];
}

export function matchesFieldFilters(
  line: Pick<LogLine, 'thread' | 'logger' | 'app' | 'fields'>,
  filters: HostFieldFilter[],
): boolean {
  if (!filters.length) return true;
  for (const f of filters) {
    if (f.mode !== 'exclude') continue;
    const v = valueOf(line, f.field);
    if (v && wildcard(f.value)(v)) return false;
  }
  const includes = filters.filter(f => f.mode === 'include');
  if (!includes.length) return true;
  const byField = new Map<string, HostFieldFilter[]>();
  for (const f of includes) byField.set(f.field, [...(byField.get(f.field) ?? []), f]);
  for (const [field, list] of byField) {
    const v = valueOf(line, field);
    if (!v) return false;
    if (!list.some(f => wildcard(f.value)(v))) return false;
  }
  return true;
}

/**
 * Fed lines in order; reports the index of every line the view would keep.
 *
 * `push` may report several indices at once — a hit releases the context held
 * before it — and `finish` has nothing to add, because a line after the last
 * hit is only ever kept while the look-ahead is still counting.
 */
export class LineSelector {
  private readonly test: ((text: string) => boolean) | null;
  private readonly levels: Set<string> | null;
  private readonly fields: HostFieldFilter[];
  private readonly context: number;
  private keepingEvent: boolean;
  /** Surviving non-hits since the last kept line, newest last, at most `context`. */
  private readonly back: number[] = [];
  private ahead = 0;

  constructor(spec: HostFilterSpec) {
    this.test = buildTest(spec.query);
    this.levels = spec.levels.length ? new Set(spec.levels) : null;
    this.fields = spec.fields ?? [];
    this.context = this.test ? Math.max(0, Math.round(spec.contextLines ?? 0)) : 0;
    this.keepingEvent = !this.fields.some(f => f.mode === 'include');
  }

  push(index: number, line: LogLine, out: number[]): void {
    if (!line.text.trim()) return;
    if (this.levels && !this.levels.has(line.level)) return;
    if (this.fields.length) {
      if (line.continuation) {
        if (!this.keepingEvent) return;
      } else {
        this.keepingEvent = matchesFieldFilters(line, this.fields);
        if (!this.keepingEvent) return;
      }
    }
    if (!this.test) { out.push(index); return; }
    if (this.test(line.text)) {
      out.push(...this.back);
      this.back.length = 0;
      out.push(index);
      this.ahead = this.context;
      return;
    }
    if (this.ahead > 0) { out.push(index); this.ahead--; return; }
    if (this.context > 0) {
      this.back.push(index);
      if (this.back.length > this.context) this.back.shift();
    }
  }
}
