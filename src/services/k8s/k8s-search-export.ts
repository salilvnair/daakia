/**
 * Writing a search's hits to disk.
 *
 * The results dialog only ever holds a slice. A search that reports "2,429
 * hits (showing first 200)" is telling the truth about the count and showing
 * 1/12th of it, because keeping ten thousand matched lines per pod in the
 * webview is how you make the dialog unusable. That is the right trade for
 * reading on screen and the wrong one the moment you want the evidence in an
 * editor.
 *
 * So this runs the search AGAIN with the caps lifted and streams straight to a
 * file. Nothing is held in the webview, and the file is the whole answer rather
 * than the first page of it.
 *
 * The re-run is deliberate rather than a shortcut. Reusing the displayed
 * matches would produce a file that silently stops at 200 lines with no mark
 * where it was cut — a truncated log that looks complete is worse than no file.
 */
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { searchLogs, type SearchTarget, type SearchOptions, type SearchMatch } from './k8s-log-search';
import { searchPvForPod } from './pv-search';
import type { PvLogConfig } from './pv-logs';
import type { ExportResult } from './k8s-logs';

/** The context sizes an export offers, in lines either side of a hit. */
export const EXPORT_CONTEXT_CHOICES = [0, 10, 100, 200, 1000, 5000, 10000];

/**
 * No cap.
 *
 * The on-screen search caps hard because every stored match costs webview
 * memory; here each one is written and dropped. The number is a backstop
 * against a query like `.` on a gigabyte of log, not a display budget.
 */
const EXPORT_MAX_PER_POD = 5_000_000;

function safe(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_');
}

/**
 * `<pod>__search__<stamp>.log`, so it sorts beside the pod's other artifacts.
 *
 * The archived half takes `__search-archive__`. A pod can have both, and one
 * name for two files means one of them does not exist.
 */
export function searchFileName(pod: string, stamp: string, archive = false): string {
  return `${safe(pod)}__search${archive ? '-archive' : ''}__${stamp}.log`;
}

/**
 * One hit and its surroundings, as text.
 *
 * The line number leads because that is what makes the file navigable back to
 * the original — a matched line with no number is evidence you cannot go and
 * check. Context lines are marked with a dash and the hit with a colon, the
 * shape `grep -C` produces, so existing habits and tooling still work.
 */
function renderMatch(m: SearchMatch, contextLines: number): string {
  const out: string[] = [];
  const first = m.line - m.before.length;

  if (contextLines > 0) {
    m.before.forEach((t, i) => out.push(`${first + i}-${t}`));
  }
  out.push(`${m.line}:${m.text}`);
  if (contextLines > 0) {
    m.after.forEach((t, i) => out.push(`${m.line + 1 + i}-${t}`));
  }
  return out.join('\n');
}

export interface SearchExportOptions extends Omit<SearchOptions, 'maxMatchesPerPod' | 'maxMatchesTotal'> {
  /** One file per pod, or everything in one. */
  combine: boolean;
  /**
   * The archive configuration, when one is set up.
   *
   * Without it the export searched only what `kubectl logs` returns, while the
   * results on screen included the archived half — so exporting a search that
   * reported 11,500 hits wrote a file containing 5,000 of them, with nothing
   * saying the rest had been dropped. The screen and the file have to agree.
   */
  pv?: PvLogConfig;
}

/**
 * Run the search and write it out.
 *
 * Progress is reported per pod rather than per match: a pod is the unit the
 * dialog already counts in, and a callback per match on a ten-thousand-hit
 * search would cost more than the search.
 */
export async function exportSearchResults(
  targets: SearchTarget[],
  opts: SearchExportOptions,
  destDir: string,
  stamp: string,
  onProgress?: (done: number, total: number, pod: string) => void,
): Promise<ExportResult[]> {
  await mkdir(destDir, { recursive: true });

  const search: SearchOptions = {
    ...opts,
    maxMatchesPerPod: EXPORT_MAX_PER_POD,
    maxMatchesTotal: EXPORT_MAX_PER_POD,
  };

  /*
    Keyed by pod AND source.

    A pod that has both live and archived logs produces two result sets, and a
    map keyed on the pod name alone kept whichever arrived last. That was never
    reached in practice only because the archive was not searched here at all;
    now that it is, the key has to carry the difference.
  */
  type Group = { matches: SearchMatch[]; scanned: number; matched: number; archive: boolean };
  const perPod = new Map<string, Group>();

  await new Promise<void>(resolve => {
    let done = 0;
    searchLogs(targets, search, {
      onPodDone: (result, matches) => {
        perPod.set(`live:${result.pod}`, {
          matches, scanned: result.scanned, matched: result.matched, archive: false,
        });
        onProgress?.(++done, targets.length, result.pod);
      },
      onProgress: () => { /* per-pod granularity is enough — see above. */ },
      onFinished: () => resolve(),
    });
  });

  /*
    The archived half, searched the same way the screen searches it.

    Sequential rather than concurrent: these are file reads on one volume, and
    a fan-out over a mounted share is slower than walking it in order, not
    faster.
  */
  if (opts.pv?.enabled) {
    const signal = { cancelled: false };
    for (const t of targets) {
      try {
        const out = await searchPvForPod(
          opts.pv,
          { namespace: t.namespace, pod: t.pod, context: t.context, workload: t.workload },
          search, signal,
        );
        if (out.matches.length) {
          perPod.set(`archive:${t.pod}`, {
            matches: out.matches as unknown as SearchMatch[],
            scanned: out.result.scanned,
            matched: out.result.matched,
            archive: true,
          });
        }
      } catch { /* one unreadable volume must not lose the rest of the export */ }
    }
  }

  const header = (pod: string, ns: string, s: { scanned: number; matched: number },
                  archive = false) => [
    `# ${pod}  (${ns})${archive ? '  [archive]' : ''}`,
    `# query: ${opts.regex ? `/${opts.query}/` : opts.query}`
      + `${opts.caseSensitive ? '  case-sensitive' : ''}`
      + `${opts.regex ? '  regex' : ''}`,
    `# ${s.matched.toLocaleString()} match${s.matched === 1 ? '' : 'es'}`
      + ` in ${s.scanned.toLocaleString()} lines scanned`
      + `, ±${opts.contextLines} lines of context`,
    '',
  ].join('\n');

  const results: ExportResult[] = [];

  /*
    Combined into one file, or one per pod.

    Combined is the default for a cross-pod search because the question that
    prompted it — "which of these twenty-eight pods is doing this" — is
    answered by reading them together, and twenty-eight files is not reading
    them together.
  */
  if (opts.combine) {
    const parts: string[] = [];
    let lines = 0;
    for (const t of targets) {
      // Live first, then the archive: reading forward in time is how the
      // question is usually asked, and it matches the order on screen.
      for (const key of [`live:${t.pod}`, `archive:${t.pod}`]) {
        const got = perPod.get(key);
        if (!got?.matches.length) continue;
        parts.push(header(t.pod, t.namespace, got, got.archive));
        parts.push(got.matches.map(m => renderMatch(m, opts.contextLines)).join('\n--\n'));
        parts.push('');
        lines += got.matches.length;
      }
    }
    const body = parts.join('\n');
    const file = join(destDir, `search__${stamp}.log`);
    await writeFile(file, body ? body + '\n' : '', 'utf8');
    results.push({
      pod: `${targets.length} pods`, namespace: '',
      file, lines, bytes: Buffer.byteLength(body, 'utf8'),
      empty: lines === 0,
    });
    return results;
  }

  /*
    One file per pod, per source.

    A pod with both halves gets two, because they are two different searches
    over two different bodies of text — and writing them to one name meant the
    second silently replaced the first. The archive file says so in its name,
    so the pair is legible in a directory listing.
  */
  const wanted: { t: SearchTarget; key: string; archive: boolean }[] = [];
  for (const t of targets) {
    wanted.push({ t, key: `live:${t.pod}`, archive: false });
    if (perPod.has(`archive:${t.pod}`)) {
      wanted.push({ t, key: `archive:${t.pod}`, archive: true });
    }
  }

  for (const { t, key, archive } of wanted) {
    const got = perPod.get(key);
    const result: ExportResult = { pod: t.pod, namespace: t.namespace };
    try {
      const matches = got?.matches ?? [];
      const body = matches.length
        ? header(t.pod, t.namespace, got!, archive)
          + matches.map(m => renderMatch(m, opts.contextLines)).join('\n--\n')
        : '';
      const file = join(destDir, searchFileName(t.pod, stamp, archive));
      await writeFile(file, body ? body + '\n' : '', 'utf8');
      result.file = file;
      result.lines = matches.length;
      result.bytes = Buffer.byteLength(body, 'utf8');
      // A pod that matched nothing still gets a file. "This pod was searched
      // and had none" is a result, and an absent file cannot say it.
      if (!matches.length) result.empty = true;
    } catch (err) {
      result.error = (err as Error).message;
    }
    results.push(result);
  }

  return results;
}
