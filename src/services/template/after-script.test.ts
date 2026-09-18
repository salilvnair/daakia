import { describe, it, expect } from 'vitest';
import { afterScript } from './after-script';
import { requestContext } from './request-context';
import { renderTemplate } from './render';

const REQ = {
  method: 'POST',
  url: 'https://api.example.com/v2/orders?page=2',
  headers: [{ key: 'Content-Type', value: 'application/json' }, { key: 'Cookie', value: 'sid=abc; theme=dark' }],
  body: '{"orderId":"A-17","customer":{"id":99}}',
};

describe('the last pass before a request goes out', () => {
  const finish = afterScript({ env: { 'bearer-token': 'tok', host: 'api.example.com' } }, REQ);

  it('resolves a variable the script just set', () => {
    expect(finish.str('Bearer {{bearer-token}}')).toBe('Bearer tok');
  });

  it('runs a helper the variable pass left alone', () => {
    expect(finish.str('{{randomInt 5 5}}')).toBe('5');
  });

  it('runs a dollar-prefixed dynamic variable, which nothing on this path used to', () => {
    // {{$randomUUID}} in a header went onto the wire as those literal
    // characters — the registry existed, but only the mock server could reach it.
    expect(finish.str('{{$randomUUID}}')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reads the request it is about to send', () => {
    expect(finish.str("{{jsonPath request.body '$.orderId'}}")).toBe('A-17');
    expect(finish.str('{{request.method}} {{request.path}}')).toBe('POST /v2/orders');
    expect(finish.str('{{request.query.page}}')).toBe('2');
    expect(finish.str('{{request.headers.Content-Type}}')).toBe('application/json');
    expect(finish.str('{{request.cookies.theme}}')).toBe('dark');
  });

  it('does both passes in one go, variables first', () => {
    // The helper's argument is itself a variable, so the ordering is load
    // bearing: resolve it late and `upper` uppercases the word "host".
    expect(finish.str("{{upper '{{host}}'}}")).toBe('API.EXAMPLE.COM');
  });

  describe('what it refuses to swallow', () => {
    it('leaves an unknown variable visible', () => {
      /*
        The engine's mock-side behaviour is to return '' for anything it does
        not recognise, which would turn `Bearer {{nope}}` into `Bearer ` — a
        401 nobody can explain. On a request it stays readable.
      */
      expect(finish.str('Bearer {{nope}}')).toBe('Bearer {{nope}}');
    });

    it('leaves an unknown helper visible too', () => {
      expect(finish.str('{{noSuchHelper 1 2}}')).toBe('{{noSuchHelper 1 2}}');
      expect(finish.str('{{$noSuchDynamic}}')).toBe('{{$noSuchDynamic}}');
    });

    it('still returns empty for a lookup that genuinely found nothing', () => {
      // A header that is not on the request is absent, not unknown.
      expect(finish.str('{{request.headers.X-Missing}}')).toBe('');
    });
  });

  describe('every field of a request, not just the body', () => {
    it('does key/value rows', () => {
      expect(finish.rows([{ key: 'X-{{host}}', value: 'Bearer {{bearer-token}}' }]))
        .toEqual([{ key: 'X-api.example.com', value: 'Bearer tok' }]);
      expect(finish.rows(undefined)).toBeUndefined();
    });

    it('does auth data, and leaves non-strings alone', () => {
      expect(finish.fields({ token: '{{bearer-token}}', addTo: 'header', enabled: true }))
        .toEqual({ token: 'tok', addTo: 'header', enabled: true });
      expect(finish.fields(undefined)).toBeUndefined();
    });

    it('passes undefined through rather than turning it into a string', () => {
      expect(finish.str(undefined)).toBeUndefined();
    });
  });

  it('reads one request, not a half-rendered one', () => {
    /*
      The context is built once, from the request as the script left it. If it
      were rebuilt per field, a header rendered early would change what a
      later header reads — a rule nobody could hold in their head.
    */
    const f = afterScript({}, { method: 'GET', url: 'http://x/a', headers: [{ key: 'A', value: '1' }] });
    expect(f.rows([{ key: 'B', value: '{{request.headers.A}}' }]))
      .toEqual([{ key: 'B', value: '1' }]);
  });
});

describe('the request a template is allowed to read', () => {
  it('copes with a URL that is not a URL yet', () => {
    // `new URL()` rejects both of these, and a request must not fall over
    // because a template mentioned a query string it never used.
    expect(() => requestContext({ method: 'GET', url: 'localhost:8080/api' })).not.toThrow();
    expect(requestContext({ method: 'GET', url: '{{host}}/orders' }).path).toBe('/orders');
  });

  it('fills the port in when the scheme implies it', () => {
    expect(requestContext({ method: 'GET', url: 'https://a.test/x' }).port).toBe(443);
    expect(requestContext({ method: 'GET', url: 'http://a.test:8080/x' }).port).toBe(8080);
  });

  it('leaves pathParams and state empty, because an outgoing request has none', () => {
    const ctx = requestContext({ method: 'GET', url: 'http://a.test/x' });
    expect(ctx.pathParams).toEqual({});
    expect(ctx.stateVars).toBeUndefined();
  });

  it('parses a JSON body once and skips one that is not JSON', () => {
    expect(requestContext({ method: 'POST', url: 'http://a/x', body: '{"a":1}' }).parsedBody).toEqual({ a: 1 });
    expect(requestContext({ method: 'POST', url: 'http://a/x', body: '<soap:Envelope/>' }).parsedBody).toBeUndefined();
  });

  it('drops headers the reader has unticked', () => {
    const ctx = requestContext({
      method: 'GET', url: 'http://a/x',
      headers: [{ key: 'On', value: '1' }, { key: 'Off', value: '2', enabled: false }],
    });
    expect(ctx.headers).toEqual({ On: '1' });
  });
});

describe('the helpers that were missing', () => {
  const ctx = requestContext({ method: 'GET', url: 'http://a/x' });
  const render = (s: string) => renderTemplate(s, ctx, { keepUnknown: true });

  it('picks a date inside the window it was given', () => {
    const before = Date.now();
    const iso = render("{{randomDate '-30d' 'now'}}");
    const at = Date.parse(iso);
    expect(at).toBeGreaterThanOrEqual(before - 31 * 86400000);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it('takes a format, and the window either way round', () => {
    expect(render("{{randomDate '-1d' 'now' format='yyyy-MM-dd'}}")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(render("{{randomDate 'now' '-1d'}}")).not.toBe('');
  });

  it('accepts an absolute date as an end of the range', () => {
    // A zero-width window pins the answer exactly, which is the only way to
    // assert a random helper without a seed.
    expect(render("{{randomDate '2020-01-01T00:00:00Z' '2020-01-01T00:00:00Z'}}"))
      .toBe('2020-01-01T00:00:00.000Z');
  });

  it('formats a pattern in local time and the named formats in UTC', () => {
    /*
      Inherited from the mock engine, and correct: somebody writing
      `HH:mm:ss` into a header wants the clock on their wall, while ISO and
      EPOCH are wire formats and are UTC by definition. Stated here because
      the two can name different days for the same instant.
    */
    const at = new Date('2020-01-01T00:00:00Z').getTime();
    const local = new Date(at);
    const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    expect(render("{{randomDate '2020-01-01T00:00:00Z' '2020-01-01T00:00:00Z' format='yyyy-MM-dd'}}"))
      .toBe(expected);
  });

  it('understands both spellings of a date pattern', () => {
    /*
      Java — and therefore WireMock's documentation, and therefore anybody
      arriving from WireMock — writes `yyyy-MM-dd`. This engine was written
      with `YYYY-MM-DD`. Taking one and emitting the literal letters for the
      other reads as the feature being broken.
    */
    expect(render("{{now format='yyyy-MM-dd'}}")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(render("{{now format='YYYY-MM-DD'}}")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(render("{{now format='EPOCH'}}")).toMatch(/^\d{10}$/);
    expect(render("{{now format='epoch'}}")).toMatch(/^\d{10}$/);
  });
});

describe('what the mock server still gets', () => {
  const ctx = requestContext({ method: 'GET', url: 'http://a/x' });

  it('keeps blanking unknown expressions, so a mock body stays valid JSON', () => {
    // The opposite of the request path, and deliberately so.
    expect(renderTemplate('{"v":"{{nope}}"}', ctx)).toBe('{"v":""}');
  });
});
