/**
 * Letting the model ask a second question.
 *
 * The evidence pack is a ~370,000:1 reduction of the heap, and it is decided
 * before the model has seen anything. That is fine for "what is wrong with
 * this heap" and useless for "and what is inside the thing that is wrong",
 * because by then the interesting rows have already been summarised away.
 *
 * JProfiler's MCP solves this by letting the model call `get_heap_data` again
 * with a different view and an object id. This is the same idea over the index
 * we already hold: the model emits query lines, the engine answers them, and
 * the conversation continues with real numbers rather than a guess.
 *
 * A text protocol rather than tool-calling, because the provider is whatever
 * the user configured — Copilot, an OpenAI-compatible endpoint, a local model
 * — and not all of them have tools. A line of text works everywhere, and it is
 * parseable without a model, which is what makes the rules below testable.
 *
 * Everything the model can ask for is a whitelisted view over data the engine
 * already computes. There is no path from a model's output to an arbitrary
 * query, a file, or a command.
 */

/** The views a model may ask for. Names match JProfiler's where they overlap. */
export type DrillKind =
  | 'classes'          // class histogram, optionally filtered by package
  | 'biggest'          // biggest objects by retained size
  | 'retained'         // what one object keeps alive, by class
  | 'children'         // what one object dominates, one level down
  | 'path'             // the path from a GC root down to one object
  | 'inspections';     // the rule pack's findings

export interface DrillRequest {
  kind: DrillKind;
  /** Object row, for the views that take one. */
  row?: number;
  /** Package filter, for the views that take one. */
  filter?: string;
  /** The line it was parsed from, for reporting a refusal back. */
  raw: string;
}

/**
 * At most this many per round.
 *
 * A model that asks for twelve views at once has not understood the data well
 * enough for the twelfth to be worth running, and each one costs a walk over
 * the dominator tree. Extra requests are dropped rather than truncating the
 * round, so the model still gets an answer to the ones it cared about most —
 * which, in practice, are the ones it asked for first.
 */
export const MAX_PER_ROUND = 4;

/**
 * How many times the loop may go round.
 *
 * Three is enough for the shape a real investigation takes: look at the
 * biggest objects, open the one that dominates, ask what it holds. Beyond that
 * a model is usually re-asking rather than narrowing, and every round is
 * another full-context request.
 */
export const MAX_ROUNDS = 3;

const KINDS: DrillKind[] = ['classes', 'biggest', 'retained', 'children', 'path', 'inspections'];

/** Views that need an object to talk about. */
const NEEDS_ROW = new Set<DrillKind>(['retained', 'children', 'path']);

/**
 * Pull the query lines out of whatever the model wrote.
 *
 * Deliberately tolerant about the surroundings and strict about the content.
 * Models wrap things in code fences, prefix them with bullets, and bold them;
 * none of that changes the meaning, and rejecting a request over a backtick
 * would make the feature look broken. What is NOT tolerated is an unknown
 * view, a missing object id, or an id that is not a number — those are refused
 * by name so the model can correct itself on the next round.
 */
export function parseDrillRequests(text: string): {
  requests: DrillRequest[];
  refused: { raw: string; reason: string }[];
} {
  const requests: DrillRequest[] = [];
  const refused: { raw: string; reason: string }[] = [];

  for (const line of text.split('\n')) {
    // Strip fences, bullets, bold and leading whitespace before matching.
    const cleaned = line
      .replace(/^[\s>*\-+.\d)]*/, '')
      .replace(/[`*_]/g, '')
      .trim();

    const m = /^QUERY\s+(\w+)\s*(.*)$/i.exec(cleaned);
    if (!m) continue;

    const kind = m[1].toLowerCase() as DrillKind;
    const arg = m[2].trim();

    if (!KINDS.includes(kind)) {
      refused.push({ raw: cleaned, reason: `no such view: ${m[1]}` });
      continue;
    }

    if (NEEDS_ROW.has(kind)) {
      // Matched as digits, not coerced. `Number('')` is 0, and 0 is a real
      // object — so a missing id would have become a confident answer about
      // whichever object happened to be first in the heap.
      const token = arg.split(/\s+/)[0] ?? '';
      const row = /^\d+$/.test(token) ? Number(token) : NaN;
      if (!Number.isInteger(row) || row < 0) {
        refused.push({ raw: cleaned, reason: `${kind} needs an object id, got "${arg}"` });
        continue;
      }
      requests.push({ kind, row, raw: cleaned });
      continue;
    }

    requests.push({ kind, filter: arg || undefined, raw: cleaned });
  }

  // Same view, same argument, twice in one round is one query.
  const seen = new Set<string>();
  const unique = requests.filter(r => {
    const key = `${r.kind}:${r.row ?? ''}:${r.filter ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const kept = unique.slice(0, MAX_PER_ROUND);
  for (const dropped of unique.slice(MAX_PER_ROUND)) {
    refused.push({ raw: dropped.raw, reason: `only ${MAX_PER_ROUND} views per round` });
  }

  return { requests: kept, refused };
}

/** The worker query a request turns into. Nothing else is reachable. */
export function queryFor(req: DrillRequest): Record<string, unknown> {
  switch (req.kind) {
    case 'classes':
      return { type: 'histogram', sort: 'retained', limit: 25, packageFilter: req.filter };
    case 'biggest':
      return { type: 'children', row: -1, limit: 15 };
    case 'children':
      return { type: 'children', row: req.row, limit: 15 };
    case 'retained':
      return { type: 'retainedClasses', row: req.row, limit: 20 };
    case 'path':
      // The path is carried on the verdict, so the caller answers this from
      // the analysis rather than from a fresh walk.
      return { type: 'evidence' };
    case 'inspections':
      return { type: 'rules' };
  }
}

function bytes(n: number): string {
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * Turn a result into something worth spending context on.
 *
 * Tables, not JSON. The same numbers as JSON cost roughly twice the tokens in
 * braces and quotes that carry no meaning, and the model has to be told the
 * schema either way. Object ids are included because they are what the next
 * round's query will name — a view the model cannot drill into is a dead end.
 */
export function formatDrillResult(req: DrillRequest, data: unknown): string {
  const d = data as Record<string, any>;

  if (req.kind === 'classes') {
    const rows = (d.rows ?? []) as { className: string; instances: number; retainedSumBytes: number; shallowBytes: number }[];
    if (!rows.length) return `QUERY classes${req.filter ? ` ${req.filter}` : ''} — nothing matched.`;
    const head = `classes${req.filter ? ` under ${req.filter}` : ''} — ${d.total} total, top ${rows.length} by retained`;
    const body = rows.map(r =>
      `  ${bytes(r.retainedSumBytes)}  ${String(r.instances).padStart(8)} inst  ${r.className}`);
    return [head, ...body].join('\n');
  }

  if (req.kind === 'biggest' || req.kind === 'children') {
    const kids = (d.children ?? []) as { row: number; className: string; retainedBytes: number; childCount: number }[];
    if (!kids.length) return `${req.kind} — this object dominates nothing.`;
    const head = req.kind === 'biggest'
      ? 'biggest objects by retained size'
      : `what object ${req.row} dominates, one level down`;
    const body = kids.map(k =>
      `  id=${k.row}  ${bytes(k.retainedBytes)}  ${k.childCount} children  ${k.className}`);
    return [head, ...body].join('\n');
  }

  if (req.kind === 'retained') {
    const rows = (d.rows ?? []) as { className: string; instances: number; bytes: number }[];
    if (!rows.length) return `object ${req.row} retains nothing — it is a leaf.`;
    const head = `object ${req.row} retains ${bytes(d.totalBytes)} across `
      + `${d.totalObjects.toLocaleString()} objects:`;
    const body = rows.map(r => {
      const share = d.totalBytes > 0 ? Math.round((r.bytes / d.totalBytes) * 100) : 0;
      return `  ${bytes(r.bytes)}  ${String(share).padStart(3)}%  `
        + `${String(r.instances).padStart(8)} inst  ${r.className}`;
    });
    return [head, ...body].join('\n');
  }

  if (req.kind === 'inspections') {
    const findings = (d.findings ?? []) as { title: string; severity: string; detail: string }[];
    if (!findings.length) return 'inspections — no rule fired on this heap.';
    return ['inspections:', ...findings.map(f => `  [${f.severity}] ${f.title} — ${f.detail}`)].join('\n');
  }

  return String(data);
}

/**
 * What the engine sends back when it will not answer.
 *
 * Named refusals rather than silence: a model that asked for a view that does
 * not exist will otherwise assume the answer was empty and reason from
 * nothing, which is the failure mode that produces confident wrong answers.
 */
export function formatRefusals(refused: { raw: string; reason: string }[]): string {
  if (!refused.length) return '';
  return ['not run:', ...refused.map(r => `  ${r.raw} — ${r.reason}`)].join('\n');
}
