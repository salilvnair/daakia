/**
 * Ask the log: what is sent, and how the answer comes back to the lines.
 *
 * The promise on the board is "evidence, not a summary you must trust". Two
 * halves make it true and both are here:
 *
 *   - Every line that goes out is NUMBERED, and the number is the line's
 *     place in the window. The model is told to cite those numbers, so every
 *     claim it makes names lines this screen can open.
 *   - The answer comes back as JSON, and a claim is only drawn with the lines
 *     it cites. A step that cites a number that was never sent is dropped
 *     rather than drawn with a broken link — the one thing worse than no
 *     citation is a citation that points at nothing.
 *
 * ── When a window is bigger than a request ──
 *
 * A busy pod writes thousands of lines in ten minutes. Sending the first N
 * would answer a question about 14:00 with 14:00–14:01. So the lines that
 * matter to the question go first — every line carrying an id the question
 * names, with its neighbours; every WARN and ERROR — and the rest is sampled
 * evenly across the window. The numbers stay the window's, not the sample's,
 * and a note says how many were left out, so the model cannot claim that
 * something happened "nowhere else".
 */
import type { LogLine } from '../../store/k8s-store';
import { formatLogTime } from './log-view';
import { shortName, type CatalogueRow } from './logger-catalogue';

export type AskWindow = '10m' | '30m' | '1h' | '2h' | 'all';

const ASK_SPAN: Record<AskWindow, number | undefined> = {
  '10m': 600_000, '30m': 1_800_000, '1h': 3_600_000, '2h': 7_200_000, all: undefined,
};

export const ASK_WINDOW_NAME: Record<AskWindow, string> = {
  '10m': 'last 10 minutes', '30m': 'last 30 minutes', '1h': 'last hour', '2h': 'last 2 hours', all: 'everything held',
};

export interface AskWindowLines {
  /** Events and their continuation lines, in order. */
  lines: LogLine[];
  from?: number;
  to?: number;
}

/**
 * The window, ending at the newest line held — not at now.
 *
 * A pod that went quiet an hour ago has nothing in "the last ten minutes" by
 * the clock, and the question somebody asks of it is about its last ten
 * minutes of talking. The label shows the clock times, so it is plain which
 * ten minutes were read.
 */
export function askWindowLines(buffer: LogLine[], win: AskWindow): AskWindowLines {
  const stamped = buffer.filter(l => l.ts !== undefined);
  if (!stamped.length) return { lines: buffer };
  const to = stamped[stamped.length - 1].ts!;
  const span = ASK_SPAN[win];
  const from = span === undefined ? stamped[0].ts! : to - span;
  const start = buffer.findIndex(l => l.ts !== undefined && l.ts >= from);
  return { lines: start < 0 ? [] : buffer.slice(start), from: Math.max(from, stamped[0].ts!), to };
}

/** "14:00 – 14:10 today", the way the window button reads. */
export function windowRange(from: number | undefined, to: number | undefined, now = Date.now()): string {
  if (from === undefined || to === undefined) return 'the whole buffer';
  const hm = (ts: number) => formatLogTime(ts).slice(0, 5);
  const day = new Date(to).toDateString() === new Date(now).toDateString()
    ? 'today'
    : new Date(to).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${hm(from)} – ${hm(to)} ${day}`;
}

export interface Evidence {
  /** What goes into THE LINES block. */
  text: string;
  /** Window number → the line it names. Only numbers that were sent. */
  numbered: Map<number, LogLine>;
  /** Events in the window. */
  total: number;
  /** Events sent. */
  sent: number;
  /** Distinct loggers the sent lines name. */
  loggers: string[];
}

/** The ids a question names — `A-4470`, a uuid, a long number, a quoted string. */
export function questionTokens(question: string): string[] {
  const out = new Set<string>();
  for (const m of question.matchAll(/"([^"]{3,})"|'([^']{3,})'/g)) out.add((m[1] ?? m[2]).toLowerCase());
  for (const m of question.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi)) out.add(m[0].toLowerCase());
  for (const m of question.matchAll(/\b[A-Za-z]{1,8}[-_]\d{2,}\b|\b\d{4,}\b/g)) out.add(m[0].toLowerCase());
  return [...out];
}

const MAX_FRAMES = 6;

/**
 * Number the window and choose what to send.
 *
 * An event is one line and the continuation lines under it (a stack trace);
 * it gets one number, and up to six of its frames go with it indented — the
 * top of a trace is what says what failed.
 */
export function buildEvidence(
  window: LogLine[], question: string,
  opts: { maxEvents?: number; maxChars?: number } = {},
): Evidence {
  const maxEvents = opts.maxEvents ?? 1200;
  const maxChars = opts.maxChars ?? 120_000;

  const events: { n: number; line: LogLine; frames: LogLine[] }[] = [];
  for (const line of window) {
    if (line.continuation && events.length) { events[events.length - 1].frames.push(line); continue; }
    events.push({ n: events.length + 1, line, frames: [] });
  }

  const render = (e: typeof events[number]): string => {
    const l = e.line;
    const head = [
      `[${e.n}]`,
      l.ts !== undefined ? formatLogTime(l.ts) : undefined,
      l.level !== 'other' ? l.level.toUpperCase() : undefined,
      l.logger ? shortName(l.logger) : undefined,
      (l.message ?? l.text).slice(0, 600),
    ].filter(Boolean).join(' ');
    const frames = e.frames.slice(0, MAX_FRAMES).map(f => `    ${f.text.trim().slice(0, 240)}`);
    if (e.frames.length > MAX_FRAMES) frames.push(`    … ${e.frames.length - MAX_FRAMES} more frames`);
    return [head, ...frames].join('\n');
  };

  let chosen = events;
  let note = '';
  const full = events.map(render);
  const fullChars = full.reduce((n, s) => n + s.length + 1, 0);

  if (events.length > maxEvents || fullChars > maxChars) {
    const keep = new Set<number>();
    const tokens = questionTokens(question);
    events.forEach((e, i) => {
      const text = (e.line.message ?? e.line.text).toLowerCase();
      if (tokens.some(t => text.includes(t))) {
        for (let k = Math.max(0, i - 2); k <= Math.min(events.length - 1, i + 2); k++) keep.add(k);
      }
    });
    events.forEach((e, i) => { if (e.line.level === 'error' || e.line.level === 'warn') keep.add(i); });

    /* What is left is sampled evenly, so the whole window is represented. */
    const budget = Math.max(0, maxEvents - keep.size);
    const rest = events.map((_, i) => i).filter(i => !keep.has(i));
    const step = rest.length > budget && budget > 0 ? rest.length / budget : 1;
    if (budget > 0) for (let k = 0; k < rest.length && keep.size < maxEvents; k += step) keep.add(rest[Math.floor(k)]);

    chosen = [...keep].sort((a, b) => a - b).slice(0, maxEvents).map(i => events[i]);
    /* And the character budget, trimmed from the sampled middle rather than
       from the lines the question asked about. */
    let chars = chosen.reduce((n, e) => n + render(e).length + 1, 0);
    while (chars > maxChars && chosen.length > 1) {
      const drop = chosen.findIndex(e => e.line.level !== 'error' && e.line.level !== 'warn'
        && !tokens.some(t => (e.line.message ?? e.line.text).toLowerCase().includes(t)));
      const at = drop >= 0 ? drop : chosen.length - 1;
      chars -= render(chosen[at]).length + 1;
      chosen = chosen.filter((_, i) => i !== at);
    }
    note = `(${events.length - chosen.length} of ${events.length} lines left out to fit: kept every line `
      + `naming ${tokens.length ? tokens.join(', ') : 'nothing the question named'} with two either side, `
      + 'every WARN and ERROR, and an even sample of the rest. Numbers are the window\'s own.)';
  }

  const numbered = new Map<number, LogLine>();
  const loggers = new Set<string>();
  for (const e of chosen) {
    numbered.set(e.n, e.line);
    if (e.line.logger) loggers.add(e.line.logger);
  }
  const body = chosen.map(render).join('\n');
  return {
    text: note ? `${note}\n${body}` : body,
    numbered,
    total: events.length,
    sent: chosen.length,
    loggers: [...loggers],
  };
}

/**
 * WHAT THIS APPLICATION CAN SAY, as the model reads it.
 *
 * Silent ones first: they are what "which loggers went quiet" is asking
 * about and the only thing here the lines cannot show.
 */
export function catalogueBlock(rows: CatalogueRow[], limit = 150): string {
  const named = rows.filter(r => r.key);
  if (!named.length) return '';
  const sorted = [...named].sort((a, b) => (a.events === 0 ? -1 : 0) - (b.events === 0 ? -1 : 0) || b.events - a.events);
  const lines = sorted.slice(0, limit).map(r => {
    const bits = [
      r.name,
      r.level ? `level ${r.level}` : undefined,
      `${r.events} line${r.events === 1 ? '' : 's'} in this window`,
      r.events === 0 && r.everSeen ? 'wrote earlier in the buffer, quiet in this window' : undefined,
      r.events === 0 && !r.everSeen && r.sources.some(s => s !== 'seen') ? 'declared, never seen in the buffer' : undefined,
    ].filter(Boolean).join(' · ');
    const patterns = r.patterns.slice(0, 12).map(p =>
      `    pattern "${p.pattern.template}" · ${p.count} in window${p.pattern.marked ? ' · marked by the tester' : ''}`);
    return [bits, ...patterns].join('\n');
  });
  if (sorted.length > limit) lines.push(`(${sorted.length - limit} more loggers not listed)`);
  return lines.join('\n');
}

/** The window block. */
export function windowBlock(win: AskWindow, from: number | undefined, to: number | undefined, ev: Evidence): string {
  const iso = (ts?: number) => (ts === undefined ? '?' : new Date(ts).toISOString());
  return [
    `${ASK_WINDOW_NAME[win]} of what the pod has written: ${iso(from)} to ${iso(to)}`,
    `${ev.total} lines in the window, ${ev.sent} sent below`,
  ].join('\n');
}

// ── The answer ─────────────────────────────────────────────────────────────

export interface AnswerPara { text: string; cites: number[] }
export interface AnswerStep { lines: number[]; time?: string; text: string; logger?: string }
export interface AnswerAggregate { text: string; lines: number[] }

export interface AskAnswer {
  answer: AnswerPara[];
  steps: AnswerStep[];
  aggregates: AnswerAggregate[];
  followUps: string[];
  loggers: string[];
}

const nums = (v: unknown): number[] =>
  Array.isArray(v) ? v.map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0) : [];
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * The model's JSON, or undefined when it did not send any.
 *
 * Forgiving about the wrapper — a code fence, a sentence before the brace —
 * because models add them however firmly they are asked not to. Strict about
 * the citations: numbers that were not sent are removed, and a step left with
 * none is dropped.
 */
export function parseAnswer(raw: string, sent: Map<number, unknown>): AskAnswer | undefined {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }
  const valid = (ns: number[]) => ns.filter(n => sent.has(n));

  const answer = (Array.isArray(body.answer) ? body.answer : typeof body.answer === 'string' ? [{ text: body.answer }] : [])
    .map((p: unknown) => {
      const o = (typeof p === 'string' ? { text: p } : p) as Record<string, unknown>;
      return { text: str(o?.text), cites: valid(nums(o?.cites)) };
    })
    .filter((p: AnswerPara) => p.text);

  const steps = (Array.isArray(body.steps) ? body.steps : [])
    .map((s: Record<string, unknown>) => ({
      lines: valid(nums(s?.lines ?? (s?.line !== undefined ? [s.line] : []))),
      time: str(s?.time) || undefined,
      text: str(s?.text),
      logger: str(s?.logger) || undefined,
    }))
    .filter((s: AnswerStep) => s.text && s.lines.length > 0);

  const aggregates = (Array.isArray(body.aggregates) ? body.aggregates : [])
    .map((a: Record<string, unknown>) => ({ text: str(a?.text), lines: valid(nums(a?.lines)) }))
    .filter((a: AnswerAggregate) => a.text);

  const followUps = (Array.isArray(body.followUps) ? body.followUps : []).map(str).filter(Boolean).slice(0, 3);
  const loggers = (Array.isArray(body.loggers) ? body.loggers : []).map(str).filter(Boolean);

  if (!answer.length && !steps.length) return undefined;
  return { answer, steps, aggregates, followUps, loggers };
}

/** `[1, 2, 3, 5]` → `1–3, 5`. */
export function citeLabel(ns: number[]): string {
  const sorted = [...new Set(ns)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(j > i ? `${sorted[i]}–${sorted[j]}` : String(sorted[i]));
    i = j;
  }
  return out.join(', ');
}

/** Every line number the answer cites, in order, once. */
export function citedLines(a: AskAnswer): number[] {
  const all = [
    ...a.answer.flatMap(p => p.cites),
    ...a.steps.flatMap(s => s.lines),
  ];
  return [...new Set(all)].sort((x, y) => x - y);
}

/** The answer as text, for Copy — sentences, then the steps with their times. */
export function answerText(a: AskAnswer, numbered: Map<number, LogLine>): string {
  const paras = a.answer.map(p => `${p.text}${p.cites.length ? ` [${citeLabel(p.cites)}]` : ''}`);
  const steps = a.steps.map((s, i) => `${i + 1}. ${s.time ?? ''} ${s.text}${s.logger ? ` (${s.logger})` : ''} [${citeLabel(s.lines)}]`.replace(/\s+/g, ' '));
  const lines = citedLines(a).map(n => {
    const l = numbered.get(n);
    return l ? `[${n}] ${l.ts !== undefined ? formatLogTime(l.ts) : ''} ${l.text}`.trim() : '';
  }).filter(Boolean);
  return [...paras, '', 'In order:', ...steps, '', 'The lines behind it:', ...lines].join('\n');
}

/**
 * A filter that shows exactly the cited lines — "Open all in Logs".
 *
 * The Logs filter takes `/regex/`, so the lines go as an alternation of their
 * own opening text. Sixty characters is enough to tell lines apart and short
 * enough that a hundred of them is still a filter the box can hold.
 */
export function filterForLines(lines: LogLine[]): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const parts = [...new Set(lines.map(l => esc((l.message ?? l.text).trim().slice(0, 60))).filter(Boolean))];
  return parts.length ? `/${parts.join('|')}/` : '';
}

/**
 * The "try" chips: one question that always makes sense, an id to follow if
 * the marks have filled a hole with one, and the two the catalogue answers.
 */
export function suggestions(opts: { idField?: string; idValue?: string; win: AskWindow }): string[] {
  return [
    `what went wrong in the ${ASK_WINDOW_NAME[opts.win]}`,
    ...(opts.idField && opts.idValue ? [`${opts.idField} ${opts.idValue}`] : []),
    'which loggers went quiet',
    'anything new since yesterday',
  ];
}
