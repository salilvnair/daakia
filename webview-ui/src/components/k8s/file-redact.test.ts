import { describe, it, expect } from 'vitest';
import { redactLines, copyText } from './file-redact';

const PROPS = [
  '# written by the config map, do not edit in place',
  'spring.datasource.url=jdbc:postgresql://orders-db:5432/orders',
  'spring.datasource.username=order_rw',
  'spring.datasource.password=hunter2-the-real-one',
  'app.export.retain-days=30',
].join('\n');

describe('redactLines', () => {
  const lines = redactLines(PROPS);

  it('masks the value of a key that names a secret', () => {
    const pw = lines.find(l => l.text.includes('datasource.password'))!;
    expect(pw.secretFrom).toBeDefined();
    // The key and the `=` stay visible: hiding those would leave a row you
    // cannot identify, and the key is not the secret.
    expect(pw.text.slice(0, pw.secretFrom)).toBe('spring.datasource.password=');
  });

  it('leaves everything else alone', () => {
    for (const l of lines) {
      if (l.text.includes('password')) continue;
      expect(l.secretFrom, l.text).toBeUndefined();
    }
  });

  it('does not mask a username, which is not a credential', () => {
    // Over-masking trains people to reveal everything, which defeats it.
    const u = lines.find(l => l.text.includes('username'))!;
    expect(u.secretFrom).toBeUndefined();
  });

  it('leaves a comment that merely mentions a password visible', () => {
    /*
      A comment is documentation, not a credential, and it has no assignment.
      Masking prose is how a viewer becomes annoying enough that people turn
      the feature off.
    */
    const out = redactLines('# the password is rotated weekly by the job');
    expect(out[0].secretFrom).toBeUndefined();
  });

  it('recognises the spellings that actually appear', () => {
    const cases = [
      'db.passwd=x', 'API_KEY=x', 'api-key: x', 'clientSecret=x',
      'AUTH_KEY=x', 'private_key=x', 'credential=x', 'token: x',
    ];
    for (const c of cases) {
      expect(redactLines(c)[0].secretFrom, c).toBeDefined();
    }
  });

  it('does not claim a credential where the value is empty', () => {
    // `password=` with nothing after it means none is set, and masking it
    // would assert one exists.
    expect(redactLines('password=')[0].secretFrom).toBeUndefined();
    expect(redactLines('password=   ')[0].secretFrom).toBeUndefined();
  });

  it('handles a YAML-style colon as well as an equals', () => {
    expect(redactLines('  password: s3cret')[0].secretFrom).toBeDefined();
  });

  it('numbers lines from one, so they match the gutter', () => {
    expect(lines.map(l => l.n)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('copyText — takes what is on screen', () => {
  const lines = redactLines(PROPS);

  it('copies a masked value masked', () => {
    /*
      The rule that makes masking safe to have. If the clipboard carried the
      real value while the screen showed dots, pasting into a ticket would leak
      exactly what the masking was for.
    */
    const out = copyText(lines, new Set());
    expect(out).not.toContain('hunter2-the-real-one');
    expect(out).toContain('spring.datasource.password=••••••••');
  });

  it('copies a revealed value in full', () => {
    // Revealing is the deliberate act; after it, copy has not stopped meaning
    // "what I can see".
    const pw = lines.find(l => l.text.includes('password'))!;
    const out = copyText(lines, new Set([pw.n]));
    expect(out).toContain('hunter2-the-real-one');
  });

  it('leaves every other line byte-identical', () => {
    const out = copyText(lines, new Set()).split('\n');
    expect(out[0]).toBe('# written by the config map, do not edit in place');
    expect(out[1]).toBe('spring.datasource.url=jdbc:postgresql://orders-db:5432/orders');
    expect(out[4]).toBe('app.export.retain-days=30');
  });

  it('round-trips a file with no secrets unchanged', () => {
    const plain = 'a=1\nb=2\n\nc=3';
    expect(copyText(redactLines(plain), new Set())).toBe(plain);
  });
});
