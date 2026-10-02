/**
 * What part of the log a question is about — read off the question itself.
 *
 * "what is in the last 100 lines", "what went wrong in the last 10 minutes",
 * "anything new since yesterday", "errors between 09:30 and 10:00": the
 * question says how much to read, the way it would say it to a person, and
 * that is turned into what `kubectl logs` is given — `--tail`, `--since`,
 * `--since-time` — rather than a window picked from a menu beside it.
 *
 * `parseScope` handles the phrasings people use most, instantly and with no
 * model. What it does not recognise goes to the `dk8s.log.askScope` prompt
 * (`scopeFromPlan` reads its answer); a question that names no time at all
 * reads the default, `DEFAULT_SCOPE_MINUTES` back from now.
 */

export type AskScope =
  /** The newest `n` lines — `kubectl logs --tail n`. */
  | { kind: 'tail'; n: number; label: string }
  /** The first `n` lines the container wrote. */
  | { kind: 'head'; n: number; label: string }
  /** From a moment to another (or to now) — `--since-time`. */
  | { kind: 'range'; fromMs: number; toMs?: number; label: string }
  /** Since the container last started. */
  | { kind: 'restart'; label: string }
  /** Everything the container still has. */
  | { kind: 'all'; label: string };

/** A question that names no time reads this far back. */
export const DEFAULT_SCOPE_MINUTES = 30;

/** The most lines any one question fetches — a guard, not a window. */
export const MAX_SCOPE_LINES = 20_000;

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90, hundred: 100,
  couple: 2, few: 3, half: 0.5,
};

const UNIT_MS: [RegExp, number, string][] = [
  [/^(s|secs?|seconds?)$/, 1_000, 'second'],
  [/^(m|mins?|minutes?)$/, 60_000, 'minute'],
  [/^(h|hrs?|hours?)$/, 3_600_000, 'hour'],
  [/^(d|days?)$/, 86_400_000, 'day'],
  [/^(w|wks?|weeks?)$/, 604_800_000, 'week'],
];

function unitOf(word: string): { ms: number; name: string } | undefined {
  for (const [re, ms, name] of UNIT_MS) if (re.test(word)) return { ms, name };
  return undefined;
}

function numberOf(word: string | undefined): number | undefined {
  if (word === undefined || word === '') return 1;
  const n = Number(word.replace(/,/g, ''));
  if (Number.isFinite(n)) return n;
  return WORD_NUMBERS[word];
}

const plural = (n: number, name: string) => `${n === 0.5 ? 'half an' : n} ${name}${n === 1 || n === 0.5 ? '' : 's'}`;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "09:30", "9pm", "21:05" today; a time still to come today means yesterday's. */
function clockToday(h: number, m: number, ampm: string | undefined, now: number): number | undefined {
  let hour = h;
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (hour > 23 || m > 59) return undefined;
  const d = new Date(now);
  d.setHours(hour, m, 0, 0);
  return d.getTime() > now ? d.getTime() - 86_400_000 : d.getTime();
}

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const CLOCK = String.raw`(\d{1,2})(?::(\d{2}))?\s*(am|pm)?`;

/**
 * The scope a question states, or undefined when it states none this can
 * read — then the model is asked (`dk8s.log.askScope`).
 */
export function parseScope(question: string, now = Date.now()): AskScope | undefined {
  const q = ` ${question.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ')} `;

  /* Lines: "last 100 lines", "the latest 500 log lines", "tail 200", "100 lines". */
  let m = q.match(/\b(?:first|earliest|oldest|top)\s+(\d[\d,]*|[a-z]+)\s+(?:log\s+)?lines?\b/);
  if (m) {
    const n = numberOf(m[1]);
    if (n && n >= 1) return { kind: 'head', n: Math.min(Math.round(n), MAX_SCOPE_LINES), label: `first ${plural(Math.round(n), 'line')}` };
  }
  m = q.match(/\b(?:last|latest|recent|final|newest|tail|bottom)\s+(\d[\d,]*|[a-z]+)\s+(?:log\s+)?lines?\b/)
    ?? q.match(/\btail\s+(\d[\d,]*)\b/)
    ?? q.match(/\b(\d[\d,]*)\s+(?:log\s+)?lines\b/);
  if (m) {
    const n = numberOf(m[1]);
    if (n && n >= 1) return { kind: 'tail', n: Math.min(Math.round(n), MAX_SCOPE_LINES), label: `last ${plural(Math.round(n), 'line')}` };
  }

  /* Restart. */
  if (/\bsince (?:the |it )?(?:last )?(?:re)?start(?:ed)?\b|\bsince (?:the )?(?:last )?(?:crash|boot)\b/.test(q)) {
    return { kind: 'restart', label: 'since the last restart' };
  }

  /* Everything. */
  if (/\b(?:all (?:the |of the )?logs?|whole log|entire log|everything (?:it|the pod|the container) (?:has|wrote)|all of it)\b/.test(q)) {
    return { kind: 'all', label: 'everything the container has' };
  }

  /* A span back from now: "last 10 minutes", "past hour", "in the last 2h", "10 minutes ago". */
  if (/\b(?:last|past) half (?:an )?hour\b|\bhalf an hour ago\b/.test(q)) {
    return { kind: 'range', fromMs: now - 1_800_000, label: 'last 30 minutes' };
  }
  m = q.match(/\b(?:last|past|previous|recent|within the last|in the last|over the last|during the last)\s+(?:(\d+(?:\.\d+)?|[a-z]+)\s*)?(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|wks?|weeks?)\b/)
    ?? q.match(/\b(\d+(?:\.\d+)?|[a-z]+)\s*(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|wks?|weeks?)\s+ago\b/);
  if (m) {
    const unit = unitOf(m[2]);
    const n = numberOf(m[1]);
    if (unit && n && n > 0) {
      const ms = n * unit.ms;
      return { kind: 'range', fromMs: now - ms, label: `last ${plural(n, unit.name)}` };
    }
  }

  /* Between two clock times: "between 09:30 and 10:00", "from 9am to 11am". */
  m = q.match(new RegExp(String.raw`\b(?:between|from)\s+${CLOCK}\s+(?:and|to|-|until|till)\s+${CLOCK}\b`));
  if (m) {
    const from = clockToday(Number(m[1]), Number(m[2] ?? 0), m[3], now);
    const toRaw = clockToday(Number(m[4]), Number(m[5] ?? 0), m[6], now);
    if (from !== undefined && toRaw !== undefined) {
      const to = toRaw < from ? toRaw + 86_400_000 : toRaw;
      return { kind: 'range', fromMs: from, toMs: Math.min(to, now), label: `${hhmm(from)} – ${hhmm(to)}` };
    }
  }

  /* Since a clock time: "since 09:30", "after 2pm". */
  m = q.match(new RegExp(String.raw`\b(?:since|after|from)\s+${CLOCK}\b`));
  if (m && (m[2] !== undefined || m[3] !== undefined)) {
    const from = clockToday(Number(m[1]), Number(m[2] ?? 0), m[3], now);
    if (from !== undefined) return { kind: 'range', fromMs: from, label: `since ${hhmm(from)}` };
  }

  /* Days. */
  const today = startOfDay(now);
  if (/\bsince yesterday\b/.test(q)) return { kind: 'range', fromMs: today - 86_400_000, label: 'since yesterday' };
  if (/\byesterday\b/.test(q)) return { kind: 'range', fromMs: today - 86_400_000, toMs: today, label: 'yesterday' };
  if (/\bthis morning\b/.test(q)) return { kind: 'range', fromMs: today, toMs: Math.min(now, today + 12 * 3_600_000), label: 'this morning' };
  if (/\b(?:today|so far today|since midnight)\b/.test(q)) return { kind: 'range', fromMs: today, label: 'today' };

  return undefined;
}

/**
 * The model's plan, as `dk8s.log.askScope` answers it, turned into a scope.
 * Undefined when it names nothing — the question had no time in it.
 */
export function scopeFromPlan(text: string, now = Date.now()): AskScope | undefined {
  let plan: Record<string, unknown>;
  try {
    const body = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    plan = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
  const time = (v: unknown) => {
    if (typeof v !== 'string' || !v.trim()) return undefined;
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : undefined;
  };
  const label = typeof plan.label === 'string' && plan.label.trim() ? plan.label.trim().slice(0, 60) : undefined;

  const tail = num(plan.tail);
  if (tail) return { kind: 'tail', n: Math.min(Math.round(tail), MAX_SCOPE_LINES), label: label ?? `last ${plural(Math.round(tail), 'line')}` };
  const head = num(plan.head);
  if (head) return { kind: 'head', n: Math.min(Math.round(head), MAX_SCOPE_LINES), label: label ?? `first ${plural(Math.round(head), 'line')}` };
  const from = time(plan.from);
  const to = time(plan.to);
  if (from !== undefined && from < now) {
    return { kind: 'range', fromMs: from, toMs: to !== undefined && to > from ? Math.min(to, now) : undefined, label: label ?? `since ${hhmm(from)}` };
  }
  const minutes = num(plan.sinceMinutes);
  if (minutes) return { kind: 'range', fromMs: now - minutes * 60_000, label: label ?? `last ${plural(minutes, 'minute')}` };
  return undefined;
}

/** What a question with no time in it reads. */
export function defaultScope(now = Date.now()): AskScope {
  return { kind: 'range', fromMs: now - DEFAULT_SCOPE_MINUTES * 60_000, label: `last ${DEFAULT_SCOPE_MINUTES} minutes` };
}

interface Stamped { ts?: number }

/** The lines of a buffer the scope covers, in order. */
export function linesInScope<T extends Stamped>(buffer: T[], scope: AskScope): T[] {
  switch (scope.kind) {
    case 'tail': return buffer.slice(-scope.n);
    case 'head': return buffer.slice(0, scope.n);
    case 'restart':
    case 'all': return buffer;
    case 'range': {
      const start = buffer.findIndex(l => l.ts !== undefined && l.ts >= scope.fromMs);
      if (start < 0) return [];
      if (scope.toMs === undefined) return buffer.slice(start);
      let end = buffer.length;
      for (let i = start; i < buffer.length; i++) {
        const ts = buffer[i].ts;
        if (ts !== undefined && ts > scope.toMs) { end = i; break; }
      }
      return buffer.slice(start, end);
    }
  }
}

/**
 * Whether what is already loaded answers the scope, so nothing is fetched.
 * `fetched` is how the Logs tab last read: its direction and its window.
 */
export function bufferCovers<T extends Stamped>(
  buffer: T[], scope: AskScope,
  fetched: { direction: 'last' | 'first' | 'between'; since: string; tail: number; truncated?: boolean },
): boolean {
  if (!buffer.length) return false;
  switch (scope.kind) {
    case 'tail': return fetched.direction === 'last' && buffer.length >= scope.n;
    case 'head': return fetched.direction === 'first' && buffer.length >= scope.n;
    case 'restart': return fetched.direction === 'last' && fetched.since === 'restart';
    case 'all': return fetched.direction === 'last' && fetched.since === 'all' && buffer.length < fetched.tail;
    case 'range': {
      const first = buffer.find(l => l.ts !== undefined)?.ts;
      if (first === undefined || first > scope.fromMs) return false;
      /* It starts early enough; it must also run on to the end of the scope. */
      if (fetched.direction === 'first') return false;
      return true;
    }
  }
}
