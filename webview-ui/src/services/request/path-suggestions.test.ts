/**
 * Path completions, from the response on screen.
 *
 * A chaining path is otherwise written by reading the JSON in another tab and
 * typing what you saw — which is how `data.user.id` becomes `data.users.id`
 * and the rule silently extracts nothing for the rest of its life.
 */
import { describe, it, expect } from 'vitest';
import { pathSuggestions } from './chaining';

const BODY = JSON.stringify({
  data: {
    token: 'abc',
    user: { id: 7, email: 'ada@x.io' },
    users: [{ id: 1, email: 'a@x.io' }, { id: 2, email: 'b@x.io' }],
  },
  meta: { count: 2 },
});

const labels = (text: string, body = BODY) => pathSuggestions(body, text).map(s => s.label);
const values = (text: string, body = BODY) => pathSuggestions(body, text).map(s => s.value);

describe('what it offers', () => {
  it('offers the root keys for an empty path', () => {
    expect(labels('')).toEqual(['data', 'meta']);
  });

  it('offers the keys inside a path that ends with a dot', () => {
    expect(labels('data.')).toEqual(['token', 'user', 'users']);
  });

  it('filters by what is being typed', () => {
    expect(labels('data.us')).toEqual(['user', 'users']);
    expect(labels('data.use')).toEqual(['user', 'users']);
    expect(labels('data.user.e')).toEqual(['email']);
  });

  it('is case-insensitive about the fragment', () => {
    expect(labels('data.TOK')).toEqual(['token']);
  });

  /* The whole replacement text, so the caller sets the value and is done —
     no cursor arithmetic to get wrong. */
  it('returns the full path each choice produces', () => {
    expect(values('data.us')).toEqual(['data.user', 'data.users']);
    expect(values('data.')).toEqual(['data.token', 'data.user', 'data.users']);
    expect(values('')).toEqual(['data', 'meta']);
  });
});

describe('arrays', () => {
  it('offers indices for an array', () => {
    expect(labels('data.users[')).toEqual(['[0]', '[1]']);
  });

  it('narrows the indices as one is typed', () => {
    expect(labels('data.users[1')).toEqual(['[1]']);
  });

  /* No stray dot: `data.users.[0]` is not valid and not what anyone means. */
  it('joins an index straight onto the path', () => {
    expect(values('data.users[')).toEqual(['data.users[0]', 'data.users[1]']);
  });

  it('offers the element keys after a closed index', () => {
    expect(labels('data.users[0].')).toEqual(['id', 'email']);
    expect(values('data.users[0].')).toEqual(['data.users[0].id', 'data.users[0].email']);
  });

  it('works on a response whose root is an array', () => {
    const arr = JSON.stringify([{ id: 1, email: 'a@x.io' }]);
    expect(labels('[', arr)).toEqual(['[0]']);
    expect(labels('[0].', arr)).toEqual(['id', 'email']);
  });

  it('has nothing to offer for an index into an object', () => {
    expect(labels('data[')).toEqual([]);
  });
});

describe('what it says about each choice', () => {
  it('previews a scalar, an object and an array differently', () => {
    const byLabel = Object.fromEntries(pathSuggestions(BODY, 'data.').map(s => [s.label, s.preview]));
    expect(byLabel.token).toBe('abc');
    expect(byLabel.user).toBe('{2 keys}');
    expect(byLabel.users).toBe('array(2)');
  });

  it('truncates a long value rather than filling the row', () => {
    const long = JSON.stringify({ note: 'x'.repeat(200) });
    expect(pathSuggestions(long, '')[0]!.preview.length).toBeLessThan(40);
  });
});

describe('when it should stay quiet', () => {
  it('has nothing for a body that is not JSON', () => {
    expect(pathSuggestions('<html>', '')).toEqual([]);
    expect(pathSuggestions('', '')).toEqual([]);
  });

  it('has nothing for a scalar body', () => {
    expect(pathSuggestions('42', '')).toEqual([]);
  });

  it('has nothing for a path that leads nowhere', () => {
    expect(pathSuggestions(BODY, 'nope.')).toEqual([]);
    expect(pathSuggestions(BODY, 'data.token.')).toEqual([]);
  });

  /* An object with three hundred keys is a map, not a shape; listing them all
     is a scroll, not a suggestion. */
  it('caps a very wide object', () => {
    const wide = JSON.stringify(Object.fromEntries(
      Array.from({ length: 300 }, (_, i) => [`k${i}`, i]),
    ));
    expect(pathSuggestions(wide, '').length).toBeLessThanOrEqual(40);
  });
});
