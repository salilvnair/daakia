import { describe, it, expect } from 'vitest';
import { resolveVars, resolveRows, resolveFields, hasUnresolved } from './resolve-vars';

describe('resolving what the script set', () => {
  it('fills in a variable a pre-request script created', () => {
    /*
      The bug. The webview rendered the request before the script ran, so
      `{{bearer-token}}` arrived unresolved — and could only be filled in
      here, after the script had set it.
    */
    expect(resolveVars('Bearer {{bearer-token}}', { env: { 'bearer-token': 'abc123' } }))
      .toBe('Bearer abc123');
  });

  it('handles the names people actually use', () => {
    // Hyphens and dots, which a lazier pattern would miss while appearing to
    // work for everything else.
    const layers = { env: { 'bearer-token': 'a', 'auth.token': 'b', plain: 'c' } };
    expect(resolveVars('{{bearer-token}}/{{auth.token}}/{{plain}}', layers)).toBe('a/b/c');
  });

  it('resolves the ${var} form too', () => {
    expect(resolveVars('${token}', { env: { token: 'x' } })).toBe('x');
  });

  describe('where it looks', () => {
    const all = {
      collection: { who: 'collection' },
      env: { who: 'env' },
      secret: { who: 'secret' },
      global: { who: 'global' },
    };

    it('takes the collection first', () => {
      expect(resolveVars('{{who}}', all)).toBe('collection');
    });

    it('then the environment', () => {
      expect(resolveVars('{{who}}', { ...all, collection: {} })).toBe('env');
    });

    it('then a secret, because that is where dk.env.get looks', () => {
      expect(resolveVars('{{who}}', { secret: all.secret, global: all.global })).toBe('secret');
    });

    it('and global last', () => {
      expect(resolveVars('{{who}}', { global: all.global })).toBe('global');
    });

    it('finds a secret set by dk.env.secret', () => {
      expect(resolveVars('{{t}}', { secret: { t: 's3cr3t' } })).toBe('s3cr3t');
    });

    it('finds one set by dk.globals.set', () => {
      expect(resolveVars('{{t}}', { global: { t: 'g' } })).toBe('g');
    });
  });

  describe('what it leaves alone', () => {
    it('leaves an unknown variable as it found it', () => {
      /*
        A request that sends the literal {{bearer-token}} fails in a way
        somebody can read. One that sends an empty Authorization header fails
        in a way nobody can.
      */
      expect(resolveVars('Bearer {{nope}}', { env: {} })).toBe('Bearer {{nope}}');
    });

    it('falls through an empty value, the way the webview does', () => {
      /*
        Arguably wrong — a cleared token is not an unset one — but it is what
        `resolveWithEnv` does (`if (found && found.value)`), and these two
        resolve the same request. Two resolvers that disagree about one
        variable is a worse bug than either behaviour on its own, so this
        matches rather than improves. Change both together or neither.
      */
      expect(resolveVars('{{t}}', { env: { t: '' }, global: { t: 'fallback' } })).toBe('fallback');
    });

    it('honours the escape syntax', () => {
      expect(resolveVars('$daakia_{t}_$', { env: { t: 'x' } })).toBe('{{t}}');
      expect(resolveVars('$daakia_$t$_$', { env: { t: 'x' } })).toBe('${t}');
    });

    it('leaves a string with nothing in it untouched', () => {
      expect(resolveVars('plain text', { env: { t: 'x' } })).toBe('plain text');
      expect(resolveVars('', { env: {} })).toBe('');
    });
  });

  describe('across a whole request', () => {
    const layers = { env: { host: 'api.example.com', 'bearer-token': 'tok' } };

    it('resolves headers, key and value', () => {
      expect(resolveRows([
        { key: 'Authorization', value: 'Bearer {{bearer-token}}', enabled: true },
        { key: 'X-{{host}}', value: 'v', enabled: true },
      ], layers)).toEqual([
        { key: 'Authorization', value: 'Bearer tok', enabled: true },
        { key: 'X-api.example.com', value: 'v', enabled: true },
      ]);
    });

    it('resolves the fields of auth data and leaves non-strings alone', () => {
      expect(resolveFields({ token: '{{bearer-token}}', addTo: 'header', enabled: true }, layers))
        .toEqual({ token: 'tok', addTo: 'header', enabled: true });
    });

    it('copes with nothing to do', () => {
      expect(resolveRows(undefined, layers)).toBeUndefined();
      expect(resolveFields(undefined, layers)).toBeUndefined();
    });
  });

  describe('spotting one that is still open', () => {
    it('knows a template from a value', () => {
      expect(hasUnresolved('Bearer {{t}}')).toBe(true);
      expect(hasUnresolved('Bearer abc')).toBe(false);
      expect(hasUnresolved(undefined)).toBe(false);
    });

    it('gives the same answer twice', () => {
      // A module-level regex with /g carries lastIndex between calls, which
      // makes every second answer wrong.
      expect(hasUnresolved('{{t}}')).toBe(true);
      expect(hasUnresolved('{{t}}')).toBe(true);
    });
  });
});
