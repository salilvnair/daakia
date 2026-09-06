/**
 * The CI runner's report and its data files.
 *
 * `daakia-run` grew three things a pipeline needs: a JUnit report, a folder
 * to target, and a data file to iterate over. All three are pure functions
 * over text, which is the half worth pinning — a report CI cannot parse and a
 * CSV read one column short both fail silently, as a green run.
 *
 * The `.mjs` modules are the ones the shipped script imports; there is no
 * build step between these tests and what runs in CI.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain ESM JavaScript, shipped as-is with the CLI.
import { toJUnitXml, xmlEscape } from '../../cli/lib/junit.mjs';
// @ts-expect-error — same.
import { parseCsv, parseDataFile, parseEnvVar, inFolder } from '../../cli/lib/data.mjs';

interface Result {
  name: string; method: string; url: string; status: number; statusText: string;
  ms: number; passed: boolean; error?: string | null; iteration?: number;
}

const ok = (name: string, extra: Partial<Result> = {}): Result => ({
  name, method: 'GET', url: 'https://x.test/a', status: 200, statusText: 'OK',
  ms: 120, passed: true, error: null, ...extra,
});

describe('JUnit XML', () => {
  it('reports totals a CI runner reads off the root element', () => {
    const xml: string = toJUnitXml([ok('Api / Smoke / login'), ok('Api / Smoke / me', { passed: false, status: 500 })]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toMatch(/<testsuites [^>]*tests="2"/);
    expect(xml).toMatch(/<testsuites [^>]*failures="1"/);
  });

  /* classname becomes the tree and name the leaf in every JUnit viewer, so
     the folder path has to go in the former and the request in the latter. */
  it('splits the folder path from the request name', () => {
    const xml: string = toJUnitXml([ok('Api / Smoke / login')]);
    expect(xml).toContain('classname="Api.Smoke"');
    expect(xml).toContain('name="login"');
  });

  it('carries the status into the failure message', () => {
    const xml: string = toJUnitXml([ok('a / b', { passed: false, status: 503, statusText: 'Service Unavailable' })]);
    expect(xml).toContain('<failure');
    expect(xml).toContain('HTTP 503 Service Unavailable');
  });

  it('reports a transport error as an error, not a plain failure', () => {
    const xml: string = toJUnitXml([ok('a / b', { passed: false, status: 0, error: 'ECONNREFUSED' })]);
    expect(xml).toContain('type="error"');
    expect(xml).toContain('ECONNREFUSED');
  });

  /* One unescaped `&` from a query string makes the whole report unparseable,
     which CI shows as "the runner crashed" rather than "a test failed". */
  it('escapes what a URL and an error message can contain', () => {
    const xml: string = toJUnitXml([ok('a / b', {
      passed: false, url: 'https://x.test/s?a=1&b=<2>', error: 'said "no" & left',
    })]);
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;');
  });

  it('strips control characters XML cannot represent', () => {
    expect(xmlEscape('a\u0000b\u001Fc')).toBe('abc');
  });

  /* A data-driven run repeats every request name, so without a suite per
     iteration a CI report cannot say which row failed. */
  it('gives each iteration its own suite', () => {
    const xml: string = toJUnitXml([
      ok('a / b', { iteration: 0 }),
      ok('a / b', { iteration: 1, passed: false }),
    ]);
    expect(xml).toContain('iteration 1');
    expect(xml).toContain('iteration 2');
    expect((xml.match(/<testsuite /g) ?? [])).toHaveLength(2);
  });

  it('reports time in seconds', () => {
    expect(toJUnitXml([ok('a / b', { ms: 1500 })])).toContain('time="1.500"');
  });
});

describe('data files', () => {
  it('reads a CSV with its header as variable names', () => {
    expect(parseDataFile('email,plan\nada@x.io,pro\nlinus@x.io,free\n', 'rows.csv')).toEqual([
      { email: 'ada@x.io', plan: 'pro' },
      { email: 'linus@x.io', plan: 'free' },
    ]);
  });

  /* What a spreadsheet exports: quoted fields, commas inside them, doubled
     quotes, CRLF. */
  it('reads what a spreadsheet actually writes', () => {
    const rows = parseCsv('name,note\r\n"Ada, L.","said ""hi"""\r\n');
    expect(rows).toEqual([['name', 'note'], ['Ada, L.', 'said "hi"']]);
  });

  it('reads a JSON array of objects', () => {
    expect(parseDataFile('[{"id":1,"ok":true}]', 'rows.json')).toEqual([{ id: '1', ok: 'true' }]);
  });

  it('has no rows for a header with nothing under it', () => {
    expect(parseDataFile('email,plan\n', 'rows.csv')).toEqual([]);
  });
});

describe('the call-site overrides', () => {
  it('splits an env-var on its first equals, because values contain more', () => {
    expect(parseEnvVar('baseUrl=https://staging.x.test/?a=1'))
      .toEqual({ key: 'baseUrl', value: 'https://staging.x.test/?a=1' });
  });

  it('rejects a pair with no key', () => {
    expect(parseEnvVar('=novalue')).toBeNull();
  });

  it('matches a folder on whole segments', () => {
    expect(inFolder('Api / Smoke / login', 'smoke')).toBe(true);
    expect(inFolder('Api / Smoke / login', 'Api')).toBe(true);
  });

  /* A folder filter that matched request names would be `--filter` under
     another name — and would quietly run things the folder does not hold. */
  it('does not match the request name, or half a segment', () => {
    expect(inFolder('Api / Smoke / login', 'login')).toBe(false);
    expect(inFolder('Api / Smoke / login', 'smo')).toBe(false);
  });
});
