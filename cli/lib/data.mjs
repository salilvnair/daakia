/**
 * Data files — one run of the collection per row.
 *
 * "Run this login flow against fifty accounts from a CSV" is the canonical
 * Postman Runner demo, and it could not be expressed here at all: the runner
 * took a collection and an environment and ran each request exactly once.
 * A row becomes a layer of variables on top of the environment, so
 * `{{email}}` in a request body resolves per iteration with nothing else
 * changing.
 */

/**
 * CSV, in the subset a data file actually uses.
 *
 * Quoted fields, embedded commas, doubled quotes to escape a quote, and CRLF
 * — that is what a spreadsheet exports. Anything richer (multi-line records
 * are supported here; a custom delimiter is not) belongs in a JSON file,
 * which this module also reads.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let started = false;

  const endField = () => { row.push(field); field = ''; started = false; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && !started) { quoted = true; started = true; continue; }
    if (c === ',') { endField(); continue; }
    if (c === '\r') continue;
    if (c === '\n') { endRow(); continue; }
    field += c;
    started = true;
  }
  // A file that does not end in a newline still has a last row.
  if (field !== '' || row.length > 0) endRow();

  return rows.filter(r => r.some(cell => cell !== ''));
}

/**
 * A data file as rows of variables.
 *
 * JSON is taken as an array of objects. CSV takes its first row as the header
 * — which is what every tool that writes one produces, and the only reading
 * that lets a request say `{{email}}`.
 */
export function parseDataFile(text, filename = '') {
  const trimmed = text.trim();
  const looksJson = filename.toLowerCase().endsWith('.json')
    || trimmed.startsWith('[') || trimmed.startsWith('{');

  if (looksJson) {
    const parsed = JSON.parse(trimmed);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map(row => {
      const out = {};
      for (const [k, v] of Object.entries(row ?? {})) {
        out[k] = v === null || v === undefined ? '' : String(v);
      }
      return out;
    });
  }

  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).map(cells => {
    const out = {};
    header.forEach((key, i) => { if (key) out[key] = cells[i] ?? ''; });
    return out;
  });
}

/**
 * `--env-var key=value`, as CI passes a secret in.
 *
 * Only the first `=` splits, because a value is very often a URL or a token
 * with `=` in it.
 */
export function parseEnvVar(pair) {
  const eq = pair.indexOf('=');
  if (eq <= 0) return null;
  return { key: pair.slice(0, eq).trim(), value: pair.slice(eq + 1) };
}

/**
 * Does this request's path run under the named folder?
 *
 * Matched on whole path segments rather than as a substring: `--folder auth`
 * should run the `auth` folder, not every request whose name happens to
 * contain "auth". The request's own name is excluded — it is the last
 * segment, and a folder filter that matched request names would be `--filter`
 * under another name.
 */
export function inFolder(requestPath, folder) {
  const want = folder.trim().toLowerCase();
  if (!want) return true;
  const segments = requestPath.split(' / ').map(s => s.trim().toLowerCase());
  return segments.slice(0, -1).includes(want);
}
