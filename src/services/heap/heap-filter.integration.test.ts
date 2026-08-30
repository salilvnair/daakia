/**
 * The package filter, against a real 47 MB heap dump.
 *
 * The unit tests pin the matcher's edges. This pins the thing the feature is
 * actually for: that pointing it at your own package removes the JDK from the
 * class list and keeps your classes, on a dump produced by a real JVM rather
 * than by a fixture builder's idea of one.
 *
 * Skipped when the dump has not been generated — see
 * src/test/fixtures/heap/README.md. It is a build artifact, not a checked-in
 * file, and a missing fixture should not read as a failing filter.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { parseHprof } from './hprof-parser';
import { analyzeHeap, computeClassStats, computeTreemap } from './heap-analysis';
import { parsePackageFilter, filterByPackages } from './heap-filter';

const DUMP = resolve(__dirname, '../../test/fixtures/heap/out/leak.hprof');
const APP = 'com.daakia';

describe.skipIf(!existsSync(DUMP))('package filter on the fixture dump', () => {
  const index = parseHprof(DUMP);
  const { dominators } = analyzeHeap(index);
  const all = computeClassStats(index, dominators);
  const prefixes = parsePackageFilter(APP);
  const mine = filterByPackages(all, prefixes, c => c.className);

  it('parses a dump with the JDK noise every heap has', () => {
    const names = all.map(c => c.className);
    expect(names).toContain('[B');
    expect(names).toContain('java.lang.String');
    expect(names).toContain('java.util.HashMap$Node');
  });

  it('narrows to the application, and to nothing else', () => {
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.length).toBeLessThan(all.length);
    for (const c of mine) {
      expect(c.className).toMatch(/^(\[+L)?com\.daakia/);
    }
  });

  it('drops the classes that top every Java heap', () => {
    const names = mine.map(c => c.className);
    expect(names).not.toContain('[B');
    expect(names).not.toContain('java.lang.String');
    expect(names).not.toContain('java.util.HashMap$Node');
    // The one that a bare startsWith would also have dropped correctly, but
    // that an over-eager "strip the array prefix and keep everything" would not.
    expect(names).not.toContain('[Ljava.util.HashMap$Node;');
  });

  it('keeps the planted leak class, which is the point of filtering', () => {
    expect(mine.some(c => c.className.includes('LeakedEntry'))).toBe(true);
  });

  it('keeps arrays OF application classes — a leak lives in its backing store', () => {
    const arrays = all.filter(c => /^\[+Lcom\.daakia/.test(c.className));
    // If the fixture has any, the filter must keep every one.
    for (const a of arrays) {
      expect(mine.map(c => c.className)).toContain(a.className);
    }
  });

  it('filters the treemap to the same set, so the two views agree', () => {
    const full = computeTreemap(index, dominators, 400, []);
    const filtered = computeTreemap(index, dominators, 400, prefixes);

    expect(filtered.totalBytes).toBeLessThan(full.totalBytes);
    expect(filtered.groups.length).toBeGreaterThan(0);
    for (const g of filtered.groups) {
      // Groups are package names; every one must be under the filter.
      expect(g.name === 'arrays' || g.name.startsWith(APP)).toBe(true);
    }
  });

  it('an empty filter changes nothing at all', () => {
    expect(filterByPackages(all, parsePackageFilter(''), c => c.className)).toBe(all);
  });
});
