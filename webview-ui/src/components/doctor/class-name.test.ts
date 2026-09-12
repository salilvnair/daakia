import { describe, it, expect } from 'vitest';
import { decodeClassName, fullClassName } from './class-name';

describe('decodeClassName', () => {
  it('splits a plain class into package and name', () => {
    const d = decodeClassName('java.util.HashMap');
    expect(d.packageName).toBe('java.util');
    expect(d.simpleName).toBe('HashMap');
    expect(d.arrayDepth).toBe(0);
  });

  /*
    The rows that prompted this. A histogram whose top line reads `[B` has
    told the reader nothing at all.
  */
  it('names a primitive array the way a person would', () => {
    expect(decodeClassName('[B').simpleName).toBe('byte[]');
    expect(decodeClassName('[C').simpleName).toBe('char[]');
    expect(decodeClassName('[I').simpleName).toBe('int[]');
    expect(decodeClassName('[J').simpleName).toBe('long[]');
    expect(decodeClassName('[Z').simpleName).toBe('boolean[]');
    expect(decodeClassName('[D').simpleName).toBe('double[]');
    expect(decodeClassName('[F').simpleName).toBe('float[]');
    expect(decodeClassName('[S').simpleName).toBe('short[]');
  });

  it('marks a primitive array as having no package', () => {
    const d = decodeClassName('[B');
    expect(d.primitive).toBe(true);
    expect(d.packageName).toBe('');
  });

  it('unwraps an object array to its element type', () => {
    const d = decodeClassName('[Ljava.lang.Object;');
    expect(d.packageName).toBe('java.lang');
    expect(d.simpleName).toBe('Object[]');
    expect(d.primitive).toBe(false);
  });

  it('handles nested arrays', () => {
    expect(decodeClassName('[[I').simpleName).toBe('int[][]');
    expect(decodeClassName('[[Ljava.lang.String;').simpleName).toBe('String[][]');
  });

  /*
    The worst row in the screenshot:
    `[Ljava.util.concurrent.ConcurrentHashMap$Node;`
    The part that matters is four characters long and sits in the middle.
  */
  it('reads a nested class as a person writes it', () => {
    const d = decodeClassName('[Ljava.util.concurrent.ConcurrentHashMap$Node;');
    expect(d.packageName).toBe('java.util.concurrent');
    expect(d.simpleName).toBe('ConcurrentHashMap.Node[]');
  });

  it('handles a nested class that is not an array', () => {
    const d = decodeClassName('java.util.HashMap$Node');
    expect(d.packageName).toBe('java.util');
    expect(d.simpleName).toBe('HashMap.Node');
  });

  it('handles doubly nested classes', () => {
    expect(decodeClassName('a.b.Outer$Mid$Inner').simpleName).toBe('Outer.Mid.Inner');
  });

  it('copes with a class in the default package', () => {
    const d = decodeClassName('Leak');
    expect(d.packageName).toBe('');
    expect(d.simpleName).toBe('Leak');
  });

  it('keeps the raw name, because that is still the identity', () => {
    // Clicking a row queries the engine, which knows the descriptor form.
    expect(decodeClassName('[B').raw).toBe('[B');
    expect(decodeClassName('[Ljava.lang.Object;').raw).toBe('[Ljava.lang.Object;');
  });

  it('does not mistake a one-letter class for a primitive', () => {
    // `B` with no leading bracket is a class named B, not a byte.
    const d = decodeClassName('B');
    expect(d.primitive).toBe(false);
    expect(d.simpleName).toBe('B');
  });

  it('leaves an already-readable name alone', () => {
    expect(decodeClassName('java.lang.String').simpleName).toBe('String');
  });
});

describe('fullClassName', () => {
  it('rejoins for a tooltip', () => {
    expect(fullClassName('[Ljava.util.concurrent.ConcurrentHashMap$Node;'))
      .toBe('java.util.concurrent.ConcurrentHashMap.Node[]');
    expect(fullClassName('[B')).toBe('byte[]');
    expect(fullClassName('Leak')).toBe('Leak');
  });
});
