/**
 * Graded against `under-load.jfr`, which came off a workload with known faults
 * — six workers contending on one monitor, 256 KB per order, a quadratic
 * string builder on the hot path. The shape of its call tree is therefore a
 * fact about a program whose source sits beside it, not a recorded expectation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JfrChunk } from './jfr-chunk';
import { readCpuSamples, hotSpots } from './jfr-cpu';
import { callTree, callGraph, cpuSamplesFor, type CallNode } from './jfr-calltree';

const chunks = JfrChunk.parseAll(
  readFileSync(join(__dirname, '../../../test/fixtures/jfr/under-load.jfr')));
const samples = readCpuSamples(chunks);

function walk(nodes: CallNode[], visit: (n: CallNode, depth: number) => void, depth = 0) {
  for (const n of nodes) { visit(n, depth); walk(n.children, visit, depth + 1); }
}

describe('callTree', () => {
  const roots = callTree(samples);

  it('builds from the entry point down, not upside down', () => {
    /*
      The failure this catches is silent: JFR writes frames innermost first, so
      folding them in the given order produces a tree rooted at JDK internals
      with `run` as a leaf. It still renders, and every number in it is wrong.
    */
    expect(roots.length).toBeGreaterThan(0);
    const rootNames = roots.map(r => r.methodName);
    expect(rootNames).toContain('run');

    // ...and the application's own frames are below the root, not above it.
    let sawNested = false;
    walk(roots, (n, d) => { if (d > 0 && /OrderLoad/.test(n.className)) sawNested = true; });
    expect(sawNested).toBe(true);
  });

  it('counts a parent as at least the sum of its children', () => {
    walk(roots, n => {
      const kids = n.children.reduce((a, c) => a + c.total, 0);
      expect(n.total, n.method).toBeGreaterThanOrEqual(kids);
      // The difference is exactly the samples that stopped here.
      expect(n.total - kids, n.method).toBe(n.self);
    });
  });

  it('agrees with the hot spots table about the total', () => {
    // Two views disagreeing about how many samples exist is worse than either
    // being absent, so they share one filter.
    const counted = roots.reduce((a, r) => a + r.total, 0);
    expect(counted).toBe(cpuSamplesFor(samples).length);
  });

  it('separates the same method under different callers', () => {
    const paths = new Set<string>();
    walk(roots, n => paths.add(n.id));
    // Every node id is a full path, so no two rows collapse.
    let count = 0;
    walk(roots, () => count++);
    expect(paths.size).toBe(count);
  });

  it('honours the idle filter the same way hot spots does', () => {
    const withIdle = callTree(samples, { includeIdle: true })
      .reduce((a, r) => a + r.total, 0);
    const without = callTree(samples).reduce((a, r) => a + r.total, 0);
    expect(withIdle).toBeGreaterThanOrEqual(without);
  });
});

describe('callGraph', () => {
  const graph = callGraph(samples);

  it('never reports more samples through a node than exist', () => {
    /*
      A recursive method appears many times on one stack. Counting each
      occurrence gives a node a total larger than the recording — a percentage
      over 100, which is how you find out the number is wrong.
    */
    const total = cpuSamplesFor(samples).length;
    for (const n of graph) expect(n.total, n.method).toBeLessThanOrEqual(total);
  });

  it('links callers and callees consistently', () => {
    const byMethod = new Map(graph.map(n => [n.method, n]));
    for (const n of graph) {
      for (const e of n.callees) {
        const callee = byMethod.get(e.method);
        // The edge may point outside the limited set, but when both ends are
        // present each must know about the other.
        if (callee) expect(callee.callers.map(c => c.method), `${n.method} -> ${e.method}`)
          .toContain(n.method);
      }
    }
  });

  it('agrees with hot spots on self time', () => {
    const hs = hotSpots(samples);
    const top = hs[0];
    const node = graph.find(n => n.method === top.method);
    expect(node, top.method).toBeDefined();
    expect(node!.self).toBe(top.self);
  });

  it('is bounded, because a graph of every method is not a graph', () => {
    expect(callGraph(samples, { limit: 10 })).toHaveLength(10);
  });
});
