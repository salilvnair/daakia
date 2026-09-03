import { describe, it, expect } from 'vitest';
import {
  parsePackageFilter, baseTypeOf, matchesPackages, filterByPackages,
} from './heap-filter';

describe('parsePackageFilter', () => {
  it('splits on commas, the form JProfiler documents', () => {
    expect(parsePackageFilter('com.zapper,org.hibernate'))
      .toEqual(['com.zapper', 'org.hibernate']);
  });

  it('tolerates the spacing people actually type', () => {
    expect(parsePackageFilter('  com.zapper ,  org.hibernate,'))
      .toEqual(['com.zapper', 'org.hibernate']);
  });

  it('splits on whitespace too, so a pasted list works', () => {
    expect(parsePackageFilter('com.zapper\norg.hibernate io.netty'))
      .toEqual(['com.zapper', 'org.hibernate', 'io.netty']);
  });

  it('is empty for nothing, rather than a prefix that matches everything', () => {
    expect(parsePackageFilter('')).toEqual([]);
    expect(parsePackageFilter('   ')).toEqual([]);
    expect(parsePackageFilter(undefined)).toEqual([]);
    expect(parsePackageFilter(',,')).toEqual([]);
  });
});

describe('baseTypeOf', () => {
  it('leaves a plain class alone', () => {
    expect(baseTypeOf('com.zapper.Order')).toBe('com.zapper.Order');
  });

  it('unwraps an object array to its element type', () => {
    expect(baseTypeOf('[Lcom.zapper.Order;')).toBe('com.zapper.Order');
  });

  it('unwraps nested arrays', () => {
    expect(baseTypeOf('[[Lcom.zapper.Order;')).toBe('com.zapper.Order');
  });

  it('reduces a primitive array to nothing, because it has no package', () => {
    expect(baseTypeOf('[B')).toBe('');
    expect(baseTypeOf('[[I')).toBe('');
  });

  it('does not mistake a one-letter class for a primitive descriptor', () => {
    // A real class named `B` is `B`, not the descriptor for byte[] — the
    // descriptor form only appears after a `[`.
    expect(baseTypeOf('B')).toBe('');
  });
});

describe('matchesPackages', () => {
  const F = ['com.zapper'];

  it('matches the package and everything under it', () => {
    expect(matchesPackages('com.zapper.Order', F)).toBe(true);
    expect(matchesPackages('com.zapper.order.LedgerClient', F)).toBe(true);
  });

  it('matches an inner class of something under the filter', () => {
    expect(matchesPackages('com.zapper.Order$Item', F)).toBe(true);
  });

  it('matches the prefix itself, if a class is named exactly that', () => {
    expect(matchesPackages('com.zapper', F)).toBe(true);
  });

  it('stops at a package boundary rather than matching on letters', () => {
    // The bug a bare startsWith would give you: a different organisation.
    expect(matchesPackages('com.zapperx.Thing', F)).toBe(false);
    expect(matchesPackages('com.zappering.Thing', F)).toBe(false);
  });

  it('matches arrays of a filtered class — the backing store of a leak', () => {
    expect(matchesPackages('[Lcom.zapper.Order;', F)).toBe(true);
    expect(matchesPackages('[[Lcom.zapper.Order;', F)).toBe(true);
  });

  it('excludes the noise every Java heap is topped by', () => {
    expect(matchesPackages('byte[]', F)).toBe(false);
    expect(matchesPackages('[B', F)).toBe(false);
    expect(matchesPackages('java.lang.String', F)).toBe(false);
    expect(matchesPackages('java.util.HashMap$Node', F)).toBe(false);
  });

  it('accepts a class matching any one of several prefixes', () => {
    const multi = ['com.zapper', 'org.hibernate'];
    expect(matchesPackages('org.hibernate.engine.StatefulPersistenceContext', multi)).toBe(true);
    expect(matchesPackages('com.zapper.Order', multi)).toBe(true);
    expect(matchesPackages('io.netty.buffer.PoolChunk', multi)).toBe(false);
  });

  it('matches everything when no filter is set, so an empty box hides nothing', () => {
    expect(matchesPackages('java.lang.String', [])).toBe(true);
    expect(matchesPackages('[B', [])).toBe(true);
  });

  it('narrows as the prefix gets longer', () => {
    expect(matchesPackages('com.zapper.order.Ledger', ['com'])).toBe(true);
    expect(matchesPackages('com.zapper.order.Ledger', ['com.zapper.order'])).toBe(true);
    expect(matchesPackages('com.zapper.order.Ledger', ['com.zapper.billing'])).toBe(false);
  });
});

describe('filterByPackages', () => {
  const rows = [
    { className: 'com.zapper.Order', bytes: 10 },
    { className: '[B', bytes: 99 },
    { className: 'java.lang.String', bytes: 50 },
    { className: '[Lcom.zapper.Order;', bytes: 20 },
  ];

  it('keeps only what the filter admits', () => {
    expect(filterByPackages(rows, ['com.zapper'], r => r.className).map(r => r.bytes))
      .toEqual([10, 20]);
  });

  it('returns the same array when there is no filter, not a copy', () => {
    expect(filterByPackages(rows, [], r => r.className)).toBe(rows);
  });
});

describe('narrowing to one class', () => {
  it('matches a primitive array by its exact name', () => {
    /*
      `baseTypeOf('[B')` is empty — a byte array has no package, which is right
      for package filtering and wrong for "narrow to this class". The biggest
      row in most heaps is `[B`, and clicking it produced an empty list.
    */
    expect(matchesPackages('[B', ['[B'])).toBe(true);
    expect(matchesPackages('[I', ['[B'])).toBe(false);
  });

  it('still refuses a primitive array under a package filter', () => {
    // A byte array is not in com.acme, and saying it is would be worse.
    expect(matchesPackages('[B', ['com.acme'])).toBe(false);
  });

  it('leaves ordinary package matching alone', () => {
    expect(matchesPackages('com.acme.Order', ['com.acme'])).toBe(true);
    expect(matchesPackages('com.acmex.Order', ['com.acme'])).toBe(false);
  });
});
