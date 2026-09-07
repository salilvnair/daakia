/**
 * The diff view guessed the language from the first character — `{` was JSON,
 * `<` was XML, and everything else was plaintext. Since "Compare with
 * clipboard" reaches every editor in the app, a pre-request script opened
 * there in monochrome, which reads as broken rather than as unrecognised.
 *
 * A wrong guess is worse than none, so these check both directions: the thing
 * is recognised, and it is not mistaken for its neighbours.
 */
import { describe, it, expect } from 'vitest';
import { detectLanguage } from './detect-language';

describe('what it recognises', () => {
  it('knows JSON because it parses', () => {
    expect(detectLanguage('{"users":[{"id":1}]}')).toBe('json');
    expect(detectLanguage('[1, 2, 3]')).toBe('json');
  });

  /* A response that was cut off mid-stream is still best read as JSON. */
  it('keeps JSON that did not finish arriving', () => {
    expect(detectLanguage('{"users":[{"id":1,"name":"Ada"}')).toBe('json');
  });

  it('separates HTML from XML', () => {
    expect(detectLanguage('<!DOCTYPE html><html><body>hi</body></html>')).toBe('html');
    expect(detectLanguage('<soap:Envelope><soap:Body/></soap:Envelope>')).toBe('xml');
  });

  /* The case that prompted this: a dk.* script in the diff pane. */
  it('knows a Daakia script', () => {
    const script = [
      'const d = dk.response.json();',
      "dk.test('rows accepted', function () {",
      '  dk.expect(d.rows_accepted).toBeGreaterThan(0);',
      '});',
    ].join('\n');
    expect(detectLanguage(script)).toBe('javascript');
  });

  it('tells TypeScript from JavaScript by its annotations', () => {
    expect(detectLanguage('interface User { id: number }\nconst a: string = "x";\nexport const b = 1;'))
      .toBe('typescript');
  });

  it('knows YAML', () => {
    expect(detectLanguage('apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ledger-api'))
      .toBe('yaml');
  });

  it('knows SQL whichever case it is written in', () => {
    expect(detectLanguage('SELECT id, name FROM users WHERE active = 1')).toBe('sql');
    expect(detectLanguage('select id from users join orders on orders.user_id = users.id')).toBe('sql');
  });

  it('knows a GraphQL document', () => {
    expect(detectLanguage('query GetUsers($limit: Int!) {\n  users(limit: $limit) { id name }\n}'))
      .toBe('graphql');
  });

  it('knows markdown', () => {
    expect(detectLanguage('# Title\n\nSome prose.\n\n- one\n- two')).toBe('markdown');
  });
});

describe('what it refuses to guess', () => {
  it('leaves prose alone', () => {
    expect(detectLanguage('the quick brown fox jumped over the lazy dog')).toBe('plaintext');
  });

  it('has an answer for nothing at all', () => {
    expect(detectLanguage('')).toBe('plaintext');
    expect(detectLanguage('   \n\t  ')).toBe('plaintext');
  });

  /* One keyword is a coincidence — "select the item from the list" is English,
     not SQL, and colouring it as SQL is the wrong-guess failure. */
  it('does not call a sentence SQL for using one of its words', () => {
    expect(detectLanguage('select the item you want')).toBe('plaintext');
  });

  it('does not call a bare word YAML for having a colon in it', () => {
    expect(detectLanguage('note: this is a sentence with a colon')).not.toBe('plaintext');
    expect(detectLanguage('Result: 42 items were returned in total.')).not.toBe('json');
  });
});
