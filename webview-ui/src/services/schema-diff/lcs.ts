/**
 * Line diff by longest common subsequence.
 *
 * ── Why LCS and not a line-by-line walk ──
 *
 * Two DDL dumps of the same table usually differ by an inserted column, and a
 * positional comparison reports every line after the insertion as changed —
 * which is technically true and useless. LCS finds the longest run of lines
 * both sides agree on and marks only what is genuinely outside it, so one
 * added column reads as one added line.
 *
 * ── The size guard ──
 *
 * The table is O(n·m) in memory. A pair of 5,000-line dumps is 25 million
 * cells, which is a webview freeze rather than a diff. Past the cap the two
 * sides are emitted whole — every line of the left as removed, every line of
 * the right as added — which is honest about being a fallback rather than
 * quietly returning a wrong-but-plausible diff.
 */

export type DiffOp = 'same' | 'add' | 'remove';

export interface DiffLine {
  op: DiffOp;
  /** 1-based line number on the source side, or null for an added line. */
  sourceLine: number | null;
  /** 1-based line number on the target side, or null for a removed line. */
  targetLine: number | null;
  text: string;
}

/** Beyond this many cells the table is not worth building. */
const MAX_CELLS = 4_000_000;

/**
 * Compare two texts line by line.
 *
 * Trailing whitespace is ignored when deciding whether two lines match — a
 * dump that differs only in trailing spaces is not a schema change — but the
 * text returned is the original, so the diff shows what is actually there.
 */
export function diffLines(source: string, target: string): DiffLine[] {
  const a = source.length === 0 ? [] : source.replace(/\r\n/g, '\n').split('\n');
  const b = target.length === 0 ? [] : target.replace(/\r\n/g, '\n').split('\n');

  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return b.map((text, i) => ({ op: 'add' as const, sourceLine: null, targetLine: i + 1, text }));
  if (b.length === 0) return a.map((text, i) => ({ op: 'remove' as const, sourceLine: i + 1, targetLine: null, text }));

  if (a.length * b.length > MAX_CELLS) {
    return [
      ...a.map((text, i) => ({ op: 'remove' as const, sourceLine: i + 1, targetLine: null, text })),
      ...b.map((text, i) => ({ op: 'add' as const, sourceLine: null, targetLine: i + 1, text })),
    ];
  }

  const key = (s: string) => s.replace(/\s+$/, '');

  /* One flat Int32Array rather than an array of arrays: at a few million cells
     the per-row object overhead is most of the allocation. */
  const w = b.length + 1;
  const table = new Int32Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * w + j] = key(a[i]) === key(b[j])
        ? table[(i + 1) * w + (j + 1)] + 1
        : Math.max(table[(i + 1) * w + j], table[i * w + (j + 1)]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (key(a[i]) === key(b[j])) {
      out.push({ op: 'same', sourceLine: i + 1, targetLine: j + 1, text: a[i] });
      i++; j++;
    } else if (table[(i + 1) * w + j] >= table[i * w + (j + 1)]) {
      out.push({ op: 'remove', sourceLine: i + 1, targetLine: null, text: a[i] });
      i++;
    } else {
      out.push({ op: 'add', sourceLine: null, targetLine: j + 1, text: b[j] });
      j++;
    }
  }
  while (i < a.length) { out.push({ op: 'remove', sourceLine: i + 1, targetLine: null, text: a[i] }); i++; }
  while (j < b.length) { out.push({ op: 'add', sourceLine: null, targetLine: j + 1, text: b[j] }); j++; }

  return out;
}

export interface DiffTally {
  added: number;
  removed: number;
  same: number;
}

export function tally(lines: DiffLine[]): DiffTally {
  const t: DiffTally = { added: 0, removed: 0, same: 0 };
  for (const l of lines) {
    if (l.op === 'add') t.added++;
    else if (l.op === 'remove') t.removed++;
    else t.same++;
  }
  return t;
}
