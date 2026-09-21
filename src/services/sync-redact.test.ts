import { describe, it, expect } from 'vitest';
import { redactHistoryRow, redactUrl, REDACTED } from './sync-redact';

/* History goes into a repository anyone on the team can clone. These pin what
   must never be in the file, and what must survive so the row is still useful. */

describe('redactUrl', () => {
  it('redacts credential query parameters and keeps the rest', () => {
    expect(redactUrl('https://a.test/x?api_key=abc&page=2#top')).toBe(`https://a.test/x?api_key=${REDACTED}&page=2#top`);
    expect(redactUrl('https://a.test/x?access_token=abc')).toBe(`https://a.test/x?access_token=${REDACTED}`);
  });

  it('leaves a URL with no query alone', () => {
    expect(redactUrl('https://a.test/x')).toBe('https://a.test/x');
  });
});

describe('redactHistoryRow', () => {
  const row = (request: unknown, response?: unknown) => redactHistoryRow({
    url: 'https://a.test/',
    request_data: JSON.stringify(request),
    response_data: response === undefined ? undefined : JSON.stringify(response),
  });

  it('redacts credential headers in both shapes', () => {
    const list = JSON.parse(row({ headers: [{ key: 'Authorization', value: 'Bearer x' }, { key: 'Accept', value: 'json' }] }).request_data!);
    expect(list.headers).toEqual([{ key: 'Authorization', value: REDACTED }, { key: 'Accept', value: 'json' }]);

    const record = JSON.parse(row({ headers: { Cookie: 'sid=1', 'X-Api-Key': 'k', Accept: 'json' } }).request_data!);
    expect(record.headers).toEqual({ Cookie: REDACTED, 'X-Api-Key': REDACTED, Accept: 'json' });
  });

  it('redacts the auth tab except the fields that name the scheme', () => {
    const out = JSON.parse(row({ authType: 'bearer', authData: { type: 'bearer', token: 'abc', username: 'me', password: 'pw', addTo: 'header' } }).request_data!);
    expect(out.authType).toBe('bearer');
    expect(out.authData).toEqual({ type: 'bearer', token: REDACTED, username: REDACTED, password: REDACTED, addTo: 'header' });
  });

  it('redacts secret variables only', () => {
    const out = JSON.parse(row({ variables: [{ key: 'base', value: 'https://x' }, { key: 'pw', value: 'p', isSecret: true }] }).request_data!);
    expect(out.variables[0].value).toBe('https://x');
    expect(out.variables[1].value).toBe(REDACTED);
  });

  it('redacts Set-Cookie on the response and keeps the body', () => {
    const out = JSON.parse(row({}, { headers: { 'set-cookie': 'sid=1', 'content-type': 'json' }, body: '{"ok":true}' }).response_data!);
    expect(out.headers).toEqual({ 'set-cookie': REDACTED, 'content-type': 'json' });
    expect(out.body).toBe('{"ok":true}');
  });

  it('passes through data that is not JSON', () => {
    expect(redactHistoryRow({ url: 'x', request_data: 'not json' }).request_data).toBe('not json');
  });
});
