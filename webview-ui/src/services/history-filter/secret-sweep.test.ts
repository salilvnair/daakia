import { describe, it, expect } from 'vitest';
import {
  MIN_SECRET_LENGTH, collectSecrets, describeFinding, sweepSecrets,
  type EnvLike, type SecretValue,
} from './secret-sweep';
import type { HistoryRowLike } from './history-facts';

const TOKEN = 'sk_live_9f3a2b71c4d8';

let seq = 0;
function row(patch: Partial<HistoryRowLike> & { request?: object; response?: object } = {}): HistoryRowLike {
  const { request, response, ...rest } = patch;
  return {
    id: ++seq,
    method: 'GET',
    url: 'https://api.acme.test/orders',
    status: 200,
    created_at: '2026-09-19T10:00:00Z',
    request_data: JSON.stringify(request ?? {}),
    response_data: response ? JSON.stringify(response) : undefined,
    ...rest,
  };
}

const secrets: SecretValue[] = [{ name: 'apiToken', source: 'Staging', value: TOKEN }];

describe('which values are swept for', () => {
  const env = (variables: EnvLike['variables']): EnvLike[] => [{ name: 'Staging', variables }];

  it('takes the ones marked secret, and leaves the rest alone', () => {
    const out = collectSecrets(env([
      { key: 'apiToken', currentValue: TOKEN, isSecret: true },
      { key: 'baseUrl', currentValue: 'https://api.acme.test', isSecret: false },
    ]));
    expect(out.map(s => s.name)).toEqual(['apiToken']);
    expect(out[0].source).toBe('Staging');
  });

  it('takes both values, because the old one is the one lying in old rows', () => {
    const out = collectSecrets(env([
      { key: 'apiToken', initialValue: 'initial_value_one', currentValue: TOKEN, isSecret: true },
    ]));
    expect(out.map(s => s.value).sort()).toEqual([TOKEN, 'initial_value_one'].sort());
  });

  it('skips a secret too short to mean anything', () => {
    /*
      A "secret" of `dev` matches half the table, and a sweep that cries wolf
      four hundred times is one nobody reads again.
    */
    const out = collectSecrets(env([{ key: 's', currentValue: 'dev', isSecret: true }]));
    expect(out).toEqual([]);
    expect('dev'.length).toBeLessThan(MIN_SECRET_LENGTH);
  });

  it('skips placeholder words however they are marked', () => {
    const out = collectSecrets(env([
      { key: 'a', currentValue: 'changeme', isSecret: true },
      { key: 'b', currentValue: 'localhost', isSecret: true },
    ]));
    expect(out).toEqual([]);
  });

  it('does not report the same value twice for one variable', () => {
    const out = collectSecrets(env([
      { key: 'apiToken', initialValue: TOKEN, currentValue: TOKEN, isSecret: true },
    ]));
    expect(out).toHaveLength(1);
  });
});

describe('where a secret is a finding', () => {
  it('finds one in a query string, which is the one that actually leaks', () => {
    const rows = [row({ url: `https://api.acme.test/orders?token=${TOKEN}` })];
    const out = sweepSecrets(rows, secrets);
    expect(out).toHaveLength(1);
    expect(out[0].byPlace).toEqual([{ place: 'query', count: 1 }]);
  });

  it('finds one echoed back in a response body', () => {
    const rows = [row({ response: { body: `{"you sent":"${TOKEN}"}` } })];
    expect(sweepSecrets(rows, secrets)[0].byPlace).toEqual([{ place: 'response', count: 1 }]);
  });

  it('finds one in a request body and in an ordinary header', () => {
    const rows = [
      row({ request: { body: `{"client_secret":"${TOKEN}"}` } }),
      row({ request: { headers: [{ key: 'X-Debug-Token', value: TOKEN, enabled: true }] } }),
    ];
    const places = sweepSecrets(rows, secrets)[0].byPlace.map(p => p.place);
    expect(places).toContain('body');
    expect(places).toContain('header');
  });

  it('says which ordinary header, since that is what you have to go and fix', () => {
    const rows = [row({ request: { headers: { 'x-debug-token': TOKEN } } })];
    expect(sweepSecrets(rows, secrets)[0].hits[0].detail).toBe('x-debug-token');
  });

  it('ignores the Authorization header, which is where it belongs', () => {
    /*
      Reporting those would mean reporting every authorised request ever sent,
      and the report would be the whole table.
    */
    const rows = [row({ request: { headers: { authorization: `Bearer ${TOKEN}` } } })];
    expect(sweepSecrets(rows, secrets)).toEqual([]);
  });

  it('ignores the auth fields, for the same reason', () => {
    const rows = [row({ request: { authType: 'bearer', authData: { token: TOKEN } } })];
    expect(sweepSecrets(rows, secrets)).toEqual([]);
  });

  it('is case-sensitive, because a lowercased copy is a different credential', () => {
    const rows = [row({ url: `https://api.acme.test/x?t=${TOKEN.toUpperCase()}` })];
    expect(sweepSecrets(rows, secrets)).toEqual([]);
  });

  it('does not match the query value against the path', () => {
    // The path half of the URL is not the query half.
    const rows = [row({ url: `https://api.acme.test/${TOKEN}/orders` })];
    expect(sweepSecrets(rows, secrets)).toEqual([]);
  });

  it('never carries the value out, only the name', () => {
    const rows = [row({ url: `https://api.acme.test/x?t=${TOKEN}` })];
    const finding = sweepSecrets(rows, secrets)[0];
    expect(JSON.stringify({ ...finding, hits: finding.hits.map(h => ({ ...h, url: '' })) }))
      .not.toContain(TOKEN);
    expect(finding.name).toBe('apiToken');
  });
});

describe('how findings are ranked and counted', () => {
  it('puts a query-string leak above one echoed in a body', () => {
    const rows = [
      row({ response: { body: TOKEN } }),
      row({ response: { body: TOKEN } }),
      row({ url: `https://a.test/x?t=${'x'.repeat(0)}${'other_secret_value'}` }),
    ];
    const two: SecretValue[] = [
      { name: 'echoed', source: 'Staging', value: TOKEN },
      { name: 'inUrl', source: 'Staging', value: 'other_secret_value' },
    ];
    expect(sweepSecrets(rows, two).map(f => f.name)).toEqual(['inUrl', 'echoed']);
  });

  it('groups every hit under the variable, and counts runs not hits', () => {
    const rows = [
      /* One run with the token in the query AND echoed back is one run, two
         hits — the sentence counts runs, because that is what you go and look
         at. */
      row({ url: `https://a.test/x?t=${TOKEN}`, response: { body: TOKEN } }),
    ];
    const finding = sweepSecrets(rows, secrets)[0];
    expect(finding.hits).toHaveLength(2);
    expect(describeFinding(finding)).toBe('1 run sent apiToken somewhere odd');
  });

  it('stays quiet about a finding somebody has said is fine', () => {
    const rows = [row({ url: `https://a.test/x?t=${TOKEN}` })];
    const key = sweepSecrets(rows, secrets)[0].key;
    expect(sweepSecrets(rows, secrets, { dismissed: new Set([key]) })).toEqual([]);
  });

  it('says nothing when there are no secrets to look for', () => {
    expect(sweepSecrets([row()], [])).toEqual([]);
  });

  it('survives a row whose stored data will not parse', () => {
    const broken: HistoryRowLike = { ...row(), request_data: '{not json' };
    expect(() => sweepSecrets([broken], secrets)).not.toThrow();
  });
});
