/**
 * Several passes over a collection, reported as one run.
 *
 * Split out of the runner because the runner needs a database and an editor
 * to do anything at all, and this is arithmetic: what a "total" means when
 * the collection ran fifty times is the part worth pinning down, and it is
 * the part nobody will look at again until it is wrong.
 */
import type { RunResult } from './collection-runner';

/**
 * Sum the passes, keep every result, and say how many passes there were.
 *
 * Totals are of the whole run, not of one pass: fifty rows over four requests
 * is two hundred requests, and reporting four would be reporting the shape of
 * the collection rather than what happened. `results` stays in order — pass
 * one's four, then pass two's four — because that is the order they ran in
 * and the order the progress list already showed them in.
 */
export function mergeRuns(passes: RunResult[], fallback: RunResult): RunResult {
  const first = passes[0];
  if (!first) return { ...fallback, iterations: 0 };

  const sum = (pick: (r: RunResult) => number) => passes.reduce((a, r) => a + pick(r), 0);
  return {
    ...first,
    iterations: passes.length,
    total: sum(r => r.total),
    passed: sum(r => r.passed),
    failed: sum(r => r.failed),
    skipped: sum(r => r.skipped),
    totalTests: sum(r => r.totalTests),
    passedTests: sum(r => r.passedTests),
    failedTests: sum(r => r.failedTests),
    results: passes.flatMap(r => r.results),
    duration: sum(r => r.duration),
  };
}

/**
 * How many passes a config asks for.
 *
 * A data file's row count wins over `iterations` rather than multiplying with
 * it: two numbers that can disagree about how many times something ran is a
 * bug report waiting to be written. Without a file, at least one — a run of
 * zero iterations is not a thing anyone means.
 */
export function passCount(iterations: number | undefined, rows: unknown[] | undefined): number {
  if (rows && rows.length > 0) return rows.length;
  return Math.max(1, iterations ?? 1);
}
