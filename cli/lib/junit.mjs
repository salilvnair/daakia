/**
 * JUnit XML — the one report format CI actually renders.
 *
 * `--json` was the only machine-readable output, which every CI system will
 * happily store as an artifact and none of them will display. GitHub Actions,
 * GitLab and Jenkins all read JUnit XML and turn it into a test report with
 * per-case timings and a failure message you can click. It is about fifty
 * lines to produce, and without it a green run is a wall of log text.
 *
 * Kept as its own module so the format can be tested without running requests.
 */

/**
 * XML text escaping.
 *
 * A failing request's error message is arbitrary text — a URL with an `&`, a
 * body fragment with a `<` — and one unescaped character makes the whole
 * report unparseable, which reads in CI as "the runner crashed" rather than
 * "a test failed".
 */
export function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Control characters are not representable in XML 1.0 at all, and a
    // response body echoed into an error message can carry them.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** Seconds, as JUnit wants them. */
function secs(ms) {
  return (ms / 1000).toFixed(3);
}

/**
 * One `<testcase>` per request.
 *
 * `classname` is the folder path and `name` the request, because that is how
 * every JUnit viewer groups: the classname becomes the tree, the name the
 * leaf. Splitting on the last ` / ` gives that for free from the names the
 * runner already builds.
 */
function testcase(result) {
  const parts = String(result.name ?? '').split(' / ');
  const name = parts.pop() ?? 'request';
  const classname = parts.join('.') || 'daakia';
  const head = `    <testcase classname="${xmlEscape(classname)}" name="${xmlEscape(name)}" time="${secs(result.ms ?? 0)}"`;
  if (result.passed) return `${head}/>`;

  const message = result.error
    ? `${result.method ?? ''} ${result.url ?? ''} — ${result.error}`.trim()
    : `${result.method ?? ''} ${result.url ?? ''} — HTTP ${result.status} ${result.statusText ?? ''}`.trim();
  const type = result.error ? 'error' : 'failure';
  return `${head}>\n      <failure type="${type}" message="${xmlEscape(message)}">${xmlEscape(message)}</failure>\n    </testcase>`;
}

/**
 * A full report.
 *
 * One `<testsuite>` per iteration when a data file drove several, so a CI
 * report says "row 3 failed" rather than showing the same request name four
 * times with no way to tell them apart.
 */
export function toJUnitXml(results, { name = 'daakia', timestamp = new Date().toISOString() } = {}) {
  const byIteration = new Map();
  for (const r of results) {
    const key = r.iteration ?? 0;
    if (!byIteration.has(key)) byIteration.set(key, []);
    byIteration.get(key).push(r);
  }

  const total = results.length;
  const failed = results.filter(r => !r.passed).length;
  const time = results.reduce((a, r) => a + (r.ms ?? 0), 0);

  const suites = [...byIteration.entries()].map(([iteration, rows]) => {
    const suiteName = byIteration.size > 1 ? `${name} (iteration ${iteration + 1})` : name;
    const suiteFailed = rows.filter(r => !r.passed).length;
    const suiteTime = rows.reduce((a, r) => a + (r.ms ?? 0), 0);
    return `  <testsuite name="${xmlEscape(suiteName)}" tests="${rows.length}" failures="${suiteFailed}"`
      + ` errors="0" skipped="0" time="${secs(suiteTime)}" timestamp="${xmlEscape(timestamp)}">\n`
      + rows.map(testcase).join('\n')
      + `\n  </testsuite>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<testsuites name="${xmlEscape(name)}" tests="${total}" failures="${failed}" errors="0" time="${secs(time)}">\n`
    + suites.join('\n')
    + `\n</testsuites>\n`;
}
