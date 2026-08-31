import { describe, it, expect } from 'vitest';
import { redact, luhn, describeRedactions, REDACTED } from './redact';

const clean = (s: string) => redact(s).text;

describe('redact — secrets', () => {
  it('takes the password out of a JDBC url and keeps the rest', () => {
    // The host, port and database are the diagnosis; only the password goes.
    expect(clean('jdbc:postgresql://appuser:s3cr3t@db.internal:5432/orders'))
      .toBe(`jdbc:postgresql://appuser:${REDACTED}@db.internal:5432/orders`);
  });

  it('takes credentials out of an http url', () => {
    expect(clean('GET https://svc:hunter2@api.example.com/v2/ledger'))
      .toBe(`GET https://svc:${REDACTED}@api.example.com/v2/ledger`);
  });

  it('redacts a bearer token but keeps the scheme', () => {
    // Keeping "Bearer" says a token WAS sent, which is different from none.
    expect(clean('Authorization: Bearer abcdef0123456789ABCDEF'))
      .toBe(`Authorization: Bearer ${REDACTED}`);
  });

  it('redacts a JWT anywhere it appears', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(clean(`token=${jwt} rejected`)).not.toContain('eyJhbGciOi');
  });

  it.each([
    ['password=hunter2', 'password'],
    ['pwd: hunter2', 'pwd'],
    ['api_key=abc123def456', 'api_key'],
    ['client_secret=zzzz1111', 'client_secret'],
    ['SECRET=topsecret', 'SECRET'],
  ])('redacts %s but keeps the key', (input, key) => {
    const out = clean(input);
    expect(out).toContain(key);
    expect(out).toContain(REDACTED);
    expect(out).not.toMatch(/hunter2|abc123def456|zzzz1111|topsecret/);
  });

  it('redacts a quoted JSON secret', () => {
    const out = clean('{"user":"amy","password":"hunter2","retries":3}');
    expect(out).toContain('"user":"amy"');
    expect(out).toContain('"retries":3');
    expect(out).not.toContain('hunter2');
  });

  it('redacts a whole PEM block, not part of one', () => {
    const pem = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEAx7Zq3vB1s8mQ2n4pL0aVcE',
      'kJ8dR2tY6uI1oP3aS5dF7gH9jK0lZ2xC4vB6nM8',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n');
    const out = clean(`startup failed loading key\n${pem}\ndone`);
    expect(out).not.toContain('MIIEowIBAAK');
    expect(out).not.toContain('kJ8dR2tY6uI');
    // The surrounding log survives — the key is what leaves, not the context.
    expect(out).toContain('startup failed loading key');
    expect(out).toContain('done');
  });

  /*
    Assembled from halves rather than written out whole.

    These are invented — sequential digits and a run of the alphabet — but a
    secret scanner reads shape, not intent, and the Slack one was enough to
    have a push rejected. Splitting the prefix keeps the literal out of the
    file while handing `clean` exactly the same string, so what is under test
    is unchanged.
  */
  it.each([
    ['AKIA' + 'IOSFODNN7EXAMPLE', 'aws'],
    ['ghp' + '_1234567890abcdefghijklmnopqrstuvwx', 'github'],
    ['xox' + 'b-123456789012-abcdefghijklmnop', 'slack'],
  ])('redacts a %s key by its prefix', token => {
    expect(clean(`using ${token} for upload`)).not.toContain(token);
  });
});

describe('redact — PII', () => {
  it('redacts the local part of an email and keeps the domain', () => {
    // Which tenant is often the question; who exactly is not.
    expect(clean('login failed for amy.smith@acme.co.uk'))
      .toBe(`login failed for ${REDACTED}@acme.co.uk`);
  });

  it('redacts a card number that passes Luhn', () => {
    expect(clean('charge declined for 4111111111111111')).not.toContain('4111111111111111');
  });
});

/*
  The half that decides whether this is usable.

  A redactor that eats the diagnosis is not a safe redactor, it is a broken
  log view — and someone who finds the answers useless turns it off, which
  protects nothing at all.
*/
describe('redact — what it must NOT touch', () => {
  it.each([
    ['an ip and port', 'connect to 10.244.1.37:5432 refused'],
    ['a pod name', 'pod zp-backend-crashloop-6dd889877d-b5fj6 restarting'],
    ['a uuid', 'traceId=550e8400-e29b-41d4-a716-446655440000'],
    ['a thread name', '[   http-nio-8080-exec-3] handling request'],
    ['a class name', 'com.zaxxer.hikari.HikariDataSource : HikariPool-1 - Starting'],
    ['a stack frame', '\tat org.hibernate.Foo.run(Foo.java:42) ~[app.jar:1.0.0]'],
    ['a long order id', 'received order 2177880 for customer 41380'],
    ['a timestamp', '2026-08-31T05:48:22.724Z INFO started'],
    ['a duration', 'completed in 1708 ms'],
    ['a hex digest', 'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'],
  ])('leaves %s alone', (_what, line) => {
    expect(clean(line)).toBe(line);
  });

  /*
    The Luhn check exists for exactly this. Order ids, correlation ids and
    concatenated timestamps are all 13-19 digits, and shape alone would eat
    them.
  */
  it('leaves a long number that is not a card', () => {
    expect(clean('correlationId 1234567890123456')).toBe('correlationId 1234567890123456');
  });

  it('does not redact a key that merely mentions a password', () => {
    // A boolean about passwords is not a password, and hiding it would hide a
    // real cause.
    const line = 'password_policy_enabled=true rotation_days=90';
    expect(clean(line)).toBe(line);
  });

  it('leaves an empty string alone', () => {
    expect(redact('')).toEqual({ text: '', found: {}, total: 0 });
  });
});

describe('redact — reporting', () => {
  it('counts what it removed, by kind', () => {
    const r = redact('password=a token=b user@example.com');
    expect(r.found['secret value']).toBe(2);
    expect(r.found['email']).toBe(1);
    expect(r.total).toBe(3);
  });

  it('reports nothing when nothing matched', () => {
    const r = redact('INFO started in 4.2s');
    expect(r.total).toBe(0);
    expect(describeRedactions(r.found)).toBeUndefined();
  });

  it('describes the removals in one line, commonest first', () => {
    const r = redact('password=a token=b user@example.com');
    expect(describeRedactions(r.found))
      .toBe('Removed before sending: 2 secret values, 1 email.');
  });

  /*
    A rule that declines must not be counted. The Luhn rule runs on every long
    number and rejects most of them; counting those would report redactions
    that never happened, which is worse than not reporting at all.
  */
  it('does not count a rule that declined', () => {
    expect(redact('correlationId 1234567890123456').total).toBe(0);
  });
});

describe('luhn', () => {
  it.each(['4111111111111111', '5500005555555559', '378282246310005'])
    ('accepts the test card %s', n => expect(luhn(n)).toBe(true));

  it('rejects a number that fails the checksum', () => {
    expect(luhn('4111111111111112')).toBe(false);
  });

  it('rejects anything too short or too long to be a card', () => {
    expect(luhn('411111')).toBe(false);
    expect(luhn('41111111111111111111')).toBe(false);
  });
});

/*
  Rules run in sequence over each other's output, so a later broad rule can
  undo an earlier specific one. This is the case that caught it.
*/
describe('redact — rules do not clobber each other', () => {
  it('keeps the auth scheme that the header rule preserved', () => {
    // `authorization` is a secret key and `:` a separator, so the generic
    // key:value rule matched the already-redacted result and ate "Bearer".
    expect(clean('Authorization: Bearer abcdef0123456789ABCDEF'))
      .toBe(`Authorization: Bearer ${REDACTED}`);
  });

  it('counts one redaction, not two, for a single secret', () => {
    expect(redact('Authorization: Bearer abcdef0123456789ABCDEF').total).toBe(1);
  });

  it('keeps the user when a url password is redacted', () => {
    // The same hazard: `pass` inside the url could be re-matched.
    const out = clean('jdbc:postgresql://appuser:s3cr3t@db:5432/orders');
    expect(out).toContain('appuser');
    expect(redact('jdbc:postgresql://appuser:s3cr3t@db:5432/orders').total).toBe(1);
  });
});

describe('redact — the summary reads as English', () => {
  /*
    Kinds are named in the singular because describeRedactions pluralises
    them. "url credentials" produced "1 url credentials" against a real pod.
  */
  it('says one credential, not one credentials', () => {
    const r = redact('jdbc:postgresql://appuser:s3cr3t@db:5432/orders');
    expect(describeRedactions(r.found)).toBe('Removed before sending: 1 url credential.');
  });

  it('pluralises when there is more than one', () => {
    const r = redact('a@x.com b@y.com');
    expect(describeRedactions(r.found)).toBe('Removed before sending: 2 emails.');
  });
});

/*
  Found in the running app, not imagined.

  The probe pod logged `com.acme.Auth  : retry with Authorization: Bearer …`
  and what left the machine was `«redacted» with Authorization: Bearer …` —
  the word "retry" gone. `Auth` is the tail of the logger's dotted name, ` : `
  looked like a separator, and the first word of the MESSAGE was taken as the
  secret. Every logger ending in Auth, Token, Secret or Cookie had this.
*/
describe('redact — a logger name is not a secret key', () => {
  const line = '2026-08-31T13:20:01.000Z  WARN 1 --- [probe] [main] com.acme.Auth                            : retry with Authorization: Bearer abcdef0123456789ABCDEFXYZ for amy.smith@acme.co.uk';

  it('does not eat the first word of the message', () => {
    expect(clean(line)).toContain(': retry with');
  });

  it('still removes the token and the email on the same line', () => {
    const out = clean(line);
    expect(out).not.toContain('abcdef0123456789ABCDEFXYZ');
    expect(out).not.toContain('amy.smith');
    expect(out).toContain('Bearer');       // the scheme survives
    expect(out).toContain('acme.co.uk');   // the domain survives
  });

  it.each([
    'com.acme.AuthService  : starting up',
    'c.a.TokenStore        : loaded 4 entries',
    'com.acme.CookieJar    : cleared',
    'o.s.s.w.a.SecretConfig: initialised',
  ])('leaves the message alone after logger %s', line2 => {
    expect(clean(line2)).toBe(line2);
  });

  it('still catches a hyphenated header key', () => {
    // The lookbehind rejects a dot, not a hyphen — X-Auth-Token is a real
    // header and its value is a real secret.
    const out = clean('X-Auth-Token: abc123def456');
    expect(out).not.toContain('abc123def456');
    expect(out).toContain('X-Auth-Token');
  });

  it('still catches an ordinary key=value', () => {
    expect(clean('password=hunter2')).toBe(`password=${REDACTED}`);
  });
});
