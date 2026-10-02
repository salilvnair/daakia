/**
 * What a search hit knows, read the way the Logs tab reads a line.
 *
 * A search used to send back each hit as text, a level and a time — so the
 * results page had no thread, no logger and no MDC, and "Follow this thread
 * across the pods" had nothing exact to follow. The pod's own log format is
 * resolved once per pod (the same choice the Logs tab makes: a saved rule,
 * else a probe, else detection) and every hit and its context lines are parsed
 * with it here, where the format already lives.
 *
 * Only what the format names is carried — the same rule as the stream: nothing
 * is sniffed out of free text.
 */
import type { CompiledFormat } from './log-format';

export interface LineParse {
  thread?: string;
  logger?: string;
  app?: string;
  /** The message with the parsed prefix taken off. */
  message?: string;
  /** MDC and structured extras the format carried. */
  fields?: Record<string, string>;
}

/** One line's fields, or undefined when the format does not read it (a stack frame, a continuation). */
export function parseOf(compiled: CompiledFormat | undefined, text: string): LineParse | undefined {
  if (!compiled) return undefined;
  const p = compiled.parse(text);
  if (!p) return undefined;
  const out: LineParse = {};
  if (p.thread) out.thread = p.thread;
  if (p.logger) out.logger = p.logger;
  if (p.app) out.app = p.app;
  if (p.message && p.message !== text) out.message = p.message;
  if (p.fields && Object.keys(p.fields).length) out.fields = p.fields;
  return Object.keys(out).length ? out : undefined;
}

export interface ParsedHit {
  parse?: LineParse;
  /** Parallel to `before` / `after`: null where a context line has nothing the format reads. */
  beforeParse?: (LineParse | null)[];
  afterParse?: (LineParse | null)[];
}

/**
 * A hit with its fields added. Arrays are only attached when at least one
 * context line parsed, so a pod whose format reads nothing costs nothing extra
 * on the way to the webview.
 */
export function withParse<T extends { text: string; before: string[]; after: string[] }>(
  m: T, compiled: CompiledFormat | undefined,
): T & ParsedHit {
  if (!compiled) return m;
  const out: T & ParsedHit = { ...m };
  const own = parseOf(compiled, m.text);
  if (own) out.parse = own;
  const side = (lines: string[]) => {
    const parsed = lines.map(t => parseOf(compiled, t) ?? null);
    return parsed.some(Boolean) ? parsed : undefined;
  };
  const b = side(m.before);
  const a = side(m.after);
  if (b) out.beforeParse = b;
  if (a) out.afterParse = a;
  return out;
}

/** The lines a pod's format is chosen from: its hits and their neighbours, up to a sample's worth. */
export function sampleOf(matches: { text: string; before: string[]; after: string[] }[], max = 200): string[] {
  const out: string[] = [];
  for (const m of matches) {
    for (const t of [...m.before, m.text, ...m.after]) {
      out.push(t);
      if (out.length >= max) return out;
    }
  }
  return out;
}
