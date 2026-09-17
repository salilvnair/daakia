/**
 * How long dk8s actually takes, grouped by what it was doing.
 *
 * ── Why a rollup and not just the log ──
 *
 * The command log already records every call with its duration, which is the
 * right shape for "what did it run just then" and the wrong one for "why is
 * this slow". Answering that means reading two hundred rows and doing
 * arithmetic — and the arithmetic is the answer: one call at 400ms is a
 * cluster across a VPN, forty at 90ms is dk8s asking too often, and the log
 * shows both as a wall of rows that look the same.
 *
 * So the calls are grouped by verb and reported as a median, a worst case and
 * a count. The median rather than the mean because one cold start with a
 * credential plugin behind it drags an average somewhere no call ever was.
 *
 * ── What this is for ──
 *
 * Sending a number. "get pods takes 14 seconds here and 90ms on my laptop" is
 * a fact somebody can act on; "dk8s is slow" is not, and until this existed
 * that was the only thing either of us had.
 */

export interface TimedCall {
  /** The verb, as the audit names it: `get pods`, `logs`, `auth can-i`. */
  what: string;
  /** Milliseconds. Absent for a stream, which has no end to measure. */
  ms?: number;
  /** `user` for something somebody pressed, `poll` for the background. */
  source?: 'user' | 'poll';
  ok?: boolean;
}

export interface Timing {
  what: string;
  calls: number;
  /** The middle call. What it usually costs. */
  median: number;
  /** The worst one. What it costs when something is wrong. */
  worst: number;
  /** Everything this verb spent, together — the number that adds up to a wait. */
  total: number;
  /** Calls that failed, which are usually the slow ones. */
  failed: number;
  /** True when every call came from the background rather than from a person. */
  background: boolean;
}

/** The middle value, taking the lower of the two for an even count. */
export function median(ns: number[]): number {
  if (!ns.length) return 0;
  const sorted = [...ns].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * Group finished calls by verb, slowest total first.
 *
 * Ordered by TOTAL rather than by the worst single call, because that is the
 * order in which they are worth fixing: a verb that costs 90ms and runs forty
 * times is three and a half seconds of somebody's afternoon, and a verb that
 * cost 400ms once is not.
 *
 * Streams are left out. `kubectl logs --follow` has no duration — it ends when
 * the reader closes it — and counting it as 0 would make following a pod look
 * like the fastest thing dk8s does.
 */
export function timings(calls: TimedCall[]): Timing[] {
  const byWhat = new Map<string, TimedCall[]>();
  for (const c of calls) {
    if (c.ms === undefined) continue;
    const list = byWhat.get(c.what);
    if (list) list.push(c); else byWhat.set(c.what, [c]);
  }

  const out: Timing[] = [];
  for (const [what, list] of byWhat) {
    const ms = list.map(c => c.ms as number);
    out.push({
      what,
      calls: list.length,
      median: median(ms),
      worst: Math.max(...ms),
      total: ms.reduce((a, b) => a + b, 0),
      failed: list.filter(c => c.ok === false).length,
      background: list.every(c => c.source === 'poll'),
    });
  }

  return out.sort((a, b) => b.total - a.total);
}

/** Every finished call, however long it all took. */
export function overall(rows: Timing[]): { calls: number; total: number } {
  return {
    calls: rows.reduce((n, r) => n + r.calls, 0),
    total: rows.reduce((n, r) => n + r.total, 0),
  };
}

/** A duration a person can read at a glance. */
export function ms(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}s`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}
