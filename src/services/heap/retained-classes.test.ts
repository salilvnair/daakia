/**
 * `retainedClassesOf`, against the fixture dump.
 *
 * The invariant that makes this view trustworthy: what an object retains, by
 * class, must sum to what the dominator tree says it retains. If those two
 * numbers disagree the view is not a breakdown of anything — it is a second
 * opinion, and the reader has no way to tell which one is wrong.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { parseHprof } from './hprof-parser';
import { analyzeHeap, retainedClassesOf, dominatorChildrenOf } from './heap-analysis';

const DUMP = resolve(__dirname, '../../test/fixtures/heap/out/leak.hprof');

describe.skipIf(!existsSync(DUMP))('retainedClassesOf', () => {
  const index = parseHprof(DUMP);
  const { dominators, verdict } = analyzeHeap(index);
  const suspect = verdict.suspects[0];

  it('has a leak suspect to work from', () => {
    expect(suspect).toBeDefined();
    expect(suspect.retainedBytes).toBeGreaterThan(0);
  });

  it('breaks a suspect down into the classes it keeps alive', () => {
    const out = retainedClassesOf(index, dominators, suspect.row);
    expect(out.rows.length).toBeGreaterThan(0);
    expect(out.totalObjects).toBeGreaterThan(0);
    for (const r of out.rows) {
      expect(r.instances).toBeGreaterThan(0);
      expect(r.bytes).toBeGreaterThanOrEqual(0);
    }
  });

  it('sums to the retained size the dominator tree reports', () => {
    const out = retainedClassesOf(index, dominators, suspect.row, 100_000);
    // Retained size includes the object itself; the breakdown is what it
    // holds, so the two differ by exactly that object's shallow size.
    const own = index.shallow[suspect.row];
    expect(out.totalBytes + own).toBe(dominators.retained[suspect.row]);
  });

  it('counts every dominated object exactly once', () => {
    const out = retainedClassesOf(index, dominators, suspect.row, 100_000);
    const summed = out.rows.reduce((t, r) => t + r.instances, 0);
    expect(summed).toBe(out.totalObjects);
  });

  it('is sorted by bytes, because that is the question being asked', () => {
    const out = retainedClassesOf(index, dominators, suspect.row, 100_000);
    for (let i = 1; i < out.rows.length; i++) {
      expect(out.rows[i - 1].bytes).toBeGreaterThanOrEqual(out.rows[i].bytes);
    }
  });

  it('caps the list without losing the totals', () => {
    const full = retainedClassesOf(index, dominators, suspect.row, 100_000);
    const capped = retainedClassesOf(index, dominators, suspect.row, 3);
    expect(capped.rows.length).toBeLessThanOrEqual(3);
    // The totals describe the whole set, not the visible rows — otherwise a
    // limit would silently change what the percentages mean.
    expect(capped.totalBytes).toBe(full.totalBytes);
    expect(capped.totalObjects).toBe(full.totalObjects);
  });

  it('names the accumulated class the verdict already identified', () => {
    // The verdict computes `accumulates` separately. If this view disagreed
    // with it, one of the two would be lying to the reader.
    if (!suspect.accumulates) return;
    const out = retainedClassesOf(index, dominators, suspect.row, 100_000);
    const names = out.rows.map(r => r.className);
    expect(names).toContain(suspect.accumulates.className);
  });

  it('returns the whole live heap for the virtual root', () => {
    const out = retainedClassesOf(index, dominators, -1, 100_000);
    expect(out.totalObjects).toBe(dominators.reachable);
  });

  it('returns nothing for a leaf, rather than throwing', () => {
    // Find something that dominates nothing at all.
    const kids = dominatorChildrenOf(index, dominators, suspect.row, 1000);
    const leaf = kids.find(k => k.childCount === 0);
    if (!leaf) return;
    const out = retainedClassesOf(index, dominators, leaf.row);
    expect(out.rows).toEqual([]);
    expect(out.totalObjects).toBe(0);
    expect(out.totalBytes).toBe(0);
  });
});
