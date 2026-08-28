/**
 * Heap analysis — reachability, dominator tree, retained sizes, leak suspects.
 *
 * This is the part that has to match Eclipse MAT number for number, because
 * "retained size" is the single figure people open a heap analyzer to get. The
 * algorithms are published and unglamorous; the value is in getting them exactly
 * right and then building everything else on top.
 *
 * A virtual root at index `count` owns every GC root, which turns a forest with
 * many entry points into the single-rooted flow graph the dominator algorithm
 * requires. Its own retained size is the whole live heap.
 */
import {
  FLAG_REACHABLE, KIND_CLASS, KIND_PRIMITIVE_ARRAY,
  displayClassName, type HeapIndex,
} from './heap-index';

export interface Dominators {
  /** Immediate dominator per row; `count` means the virtual root. -1 = unreachable. */
  idom: Int32Array;
  /** Retained bytes per row — the memory freed if this object were collected. */
  retained: Float64Array;
  /** Reverse-postorder position per row, -1 when unreachable. */
  rpoNum: Int32Array;
  /** Rows in reverse postorder, reachable only. */
  order: Int32Array;
  reachable: number;
  /** Total live bytes — the virtual root's retained size. */
  liveBytes: number;
}

export interface LeakSuspect {
  row: number;
  className: string;
  retainedBytes: number;
  retainedPercent: number;
  /** How many objects this one keeps alive, itself included. */
  retainedObjects: number;
  /** The class the dominated objects mostly belong to. Exact, not sampled. */
  accumulates?: { className: string; count: number };
  /**
   * When the suspect is a class object, the container beneath it that actually
   * holds the memory — the thing a developer would go and fix.
   */
  heldIn?: { className: string; retainedBytes: number };
  pathToRoot: { className: string; retainedBytes: number }[];
}

export interface HeapVerdict {
  liveBytes: number;
  liveObjects: number;
  unreachableObjects: number;
  unreachableBytes: number;
  suspects: LeakSuspect[];
  /** Largest classes by live shallow bytes. See ClassStat for why not retained. */
  topClasses: ClassStat[];
}

/**
 * Per-class totals over live instances.
 *
 * `shallowBytes` is exact and additive — every live object contributes to
 * exactly one class, so these sum to the live heap. `retainedBytes` is the sum
 * of each instance's retained size, which is the cheap approximation and can
 * exceed the live heap when instances of a class dominate each other (a linked
 * list is the obvious case). MAT's histogram column is the *union* of those
 * retained sets, which costs a traversal per class; this is not that, and the
 * UI labels it as a sum so the two are never confused.
 */
export interface ClassStat {
  classRow: number;
  className: string;
  instances: number;
  shallowBytes: number;
  retainedSumBytes: number;
}

const VIRTUAL_ROOT = (index: HeapIndex) => index.count;

/**
 * Depth-first traversal from the virtual root, yielding reverse postorder.
 *
 * Iterative rather than recursive — a 5,000-deep chain is nothing, but real
 * heaps contain linked structures deep enough to blow the JS stack, and that
 * failure would only appear on a customer's dump.
 */
function buildOrder(index: HeapIndex, rootTargets: Int32Array): {
  order: Int32Array; rpoNum: Int32Array; reachable: number;
} {
  const n = index.count;
  const root = VIRTUAL_ROOT(index);
  const seen = new Uint8Array(n + 1);
  const postorder = new Int32Array(n + 1);
  let postCount = 0;

  // Explicit stack of (node, next edge cursor).
  const stackNode = new Int32Array(n + 1);
  const stackEdge = new Uint32Array(n + 1);
  let sp = 0;

  stackNode[0] = root; stackEdge[0] = 0; seen[root] = 1; sp = 1;

  while (sp > 0) {
    const node = stackNode[sp - 1];
    const cursor = stackEdge[sp - 1];

    let start: number, end: number;
    if (node === root) { start = 0; end = rootTargets.length; }
    else { start = index.refOffset[node]; end = index.refOffset[node + 1]; }

    if (start + cursor < end) {
      stackEdge[sp - 1]++;
      const next = node === root ? rootTargets[cursor] : index.refTarget[start + cursor];
      if (next >= 0 && !seen[next]) {
        seen[next] = 1;
        stackNode[sp] = next; stackEdge[sp] = 0; sp++;
      }
    } else {
      postorder[postCount++] = node;
      sp--;
    }
  }

  // Reverse postorder = the order dominators must be computed in.
  const order = new Int32Array(postCount);
  const rpoNum = new Int32Array(n + 1).fill(-1);
  for (let i = 0; i < postCount; i++) {
    const node = postorder[postCount - 1 - i];
    order[i] = node;
    rpoNum[node] = i;
  }
  return { order, rpoNum, reachable: postCount - 1 };  // minus the virtual root
}

/** Reverse adjacency, needed because dominators are computed over predecessors. */
function buildPredecessors(index: HeapIndex, rootTargets: Int32Array): {
  predOffset: Uint32Array; predTarget: Int32Array;
} {
  const n = index.count;
  const counts = new Uint32Array(n + 1);

  for (const t of rootTargets) if (t >= 0) counts[t]++;
  for (let row = 0; row < n; row++) {
    for (let e = index.refOffset[row]; e < index.refOffset[row + 1]; e++) {
      const t = index.refTarget[e];
      if (t >= 0) counts[t]++;
    }
  }

  const predOffset = new Uint32Array(n + 2);
  let acc = 0;
  for (let i = 0; i <= n; i++) { predOffset[i] = acc; acc += counts[i]; }
  predOffset[n + 1] = acc;

  const predTarget = new Int32Array(acc);
  const cursor = new Uint32Array(n + 1);
  const root = VIRTUAL_ROOT(index);
  for (const t of rootTargets) if (t >= 0) predTarget[predOffset[t] + cursor[t]++] = root;
  for (let row = 0; row < n; row++) {
    for (let e = index.refOffset[row]; e < index.refOffset[row + 1]; e++) {
      const t = index.refTarget[e];
      if (t >= 0) predTarget[predOffset[t] + cursor[t]++] = row;
    }
  }
  return { predOffset, predTarget };
}

/**
 * Cooper–Harvey–Kennedy iterative dominators.
 *
 * Chosen over Lengauer–Tarjan deliberately: it is dramatically simpler to read
 * and to verify, and on a CSR graph the iteration count is small in practice.
 * If a real dump ever makes this the bottleneck, the swap is contained here.
 */
export function computeDominators(index: HeapIndex): Dominators {
  const n = index.count;
  const root = VIRTUAL_ROOT(index);

  // Deduplicated GC roots become the virtual root's successors.
  const rootSeen = new Uint8Array(n);
  const rootList: number[] = [];
  for (const r of index.roots) {
    if (r.objectIndex >= 0 && r.objectIndex < n && !rootSeen[r.objectIndex]) {
      rootSeen[r.objectIndex] = 1;
      rootList.push(r.objectIndex);
    }
  }
  const rootTargets = Int32Array.from(rootList);

  const { order, rpoNum, reachable } = buildOrder(index, rootTargets);
  const { predOffset, predTarget } = buildPredecessors(index, rootTargets);

  const idom = new Int32Array(n + 1).fill(-1);
  idom[root] = root;

  const intersect = (a: number, b: number): number => {
    while (a !== b) {
      while (rpoNum[a] > rpoNum[b]) a = idom[a];
      while (rpoNum[b] > rpoNum[a]) b = idom[b];
    }
    return a;
  };

  let changed = true;
  while (changed) {
    changed = false;
    // Skip order[0] — that's the virtual root, which dominates itself.
    for (let i = 1; i < order.length; i++) {
      const node = order[i];
      let newIdom = -1;
      for (let e = predOffset[node]; e < predOffset[node + 1]; e++) {
        const pred = predTarget[e];
        if (rpoNum[pred] < 0 || idom[pred] === -1) continue;   // not yet processed
        newIdom = newIdom === -1 ? pred : intersect(pred, newIdom);
      }
      if (newIdom !== -1 && idom[node] !== newIdom) {
        idom[node] = newIdom;
        changed = true;
      }
    }
  }

  // ── Retained sizes ──
  // Walking the order backwards guarantees every node is added to its dominator
  // only after its own subtree has been summed, because a dominator always
  // precedes what it dominates in reverse postorder.
  const retained = new Float64Array(n + 1);
  for (let i = 0; i < order.length; i++) {
    const node = order[i];
    retained[node] = node === root ? 0 : index.shallow[node];
  }
  for (let i = order.length - 1; i >= 1; i--) {
    const node = order[i];
    const d = idom[node];
    if (d >= 0 && d !== node) retained[d] += retained[node];
  }

  for (let i = 0; i < order.length; i++) {
    if (order[i] !== root) index.flags[order[i]] |= FLAG_REACHABLE;
  }

  return { idom, retained, rpoNum, order, reachable, liveBytes: retained[root] };
}

/**
 * Children lists of the dominator tree, derived from idom.
 *
 * Without this, walking a dominated subtree means scanning outbound references
 * and testing each target's idom, which visits far more of the graph than the
 * subtree and forces a visit cap — turning exact counts into samples.
 */
function buildDominatorChildren(index: HeapIndex, dom: Dominators): {
  childOffset: Uint32Array; childTarget: Int32Array;
} {
  const n = index.count;
  const counts = new Uint32Array(n + 2);
  for (let i = 1; i < dom.order.length; i++) {
    const d = dom.idom[dom.order[i]];
    if (d >= 0) counts[d]++;
  }
  const childOffset = new Uint32Array(n + 2);
  let acc = 0;
  for (let i = 0; i <= n; i++) { childOffset[i] = acc; acc += counts[i]; }
  childOffset[n + 1] = acc;

  const childTarget = new Int32Array(acc);
  const cursor = new Uint32Array(n + 1);
  for (let i = 1; i < dom.order.length; i++) {
    const node = dom.order[i];
    const d = dom.idom[node];
    if (d >= 0) childTarget[childOffset[d] + cursor[d]++] = node;
  }
  return { childOffset, childTarget };
}

/** Number of objects a node dominates, itself included. */
function retainedCounts(index: HeapIndex, dom: Dominators): Int32Array {
  const counts = new Int32Array(index.count + 1);
  for (let i = 0; i < dom.order.length; i++) counts[dom.order[i]] = 1;
  counts[VIRTUAL_ROOT(index)] = 0;
  for (let i = dom.order.length - 1; i >= 1; i--) {
    const node = dom.order[i];
    const d = dom.idom[node];
    if (d >= 0 && d !== node) counts[d] += counts[node];
  }
  return counts;
}

const classNameOf = (index: HeapIndex, row: number): string => {
  const c = index.classOf[row];
  return c >= 0 ? displayClassName(index.classes[c].name) : '<unknown>';
};

/** Walk dominators up to the root — why this object is still alive, readably. */
function pathToRoot(index: HeapIndex, dom: Dominators, row: number, limit = 12) {
  const path: { className: string; retainedBytes: number }[] = [];
  const root = VIRTUAL_ROOT(index);
  let cursor = dom.idom[row];
  while (cursor >= 0 && cursor !== root && path.length < limit) {
    path.push({ className: classNameOf(index, cursor), retainedBytes: dom.retained[cursor] });
    const next = dom.idom[cursor];
    if (next === cursor) break;
    cursor = next;
  }
  path.push({ className: '<GC root>', retainedBytes: dom.liveBytes });
  return path;
}

/**
 * Leak suspects: dominators holding an outsized share of the live heap.
 *
 * A raw "top N by retained size" list is nearly useless, because a big object's
 * dominator chain is also big — you get the same leak reported a dozen times at
 * decreasing sizes. Anything whose dominator already qualifies is therefore
 * dropped, leaving the highest point at which the memory accumulates.
 */
export function findLeakSuspects(
  index: HeapIndex,
  dom: Dominators,
  { minPercent = 5, limit = 10 } = {},
): LeakSuspect[] {
  const root = VIRTUAL_ROOT(index);
  const live = dom.liveBytes || 1;
  const threshold = (live * minPercent) / 100;
  const counts = retainedCounts(index, dom);

  const qualifies = new Uint8Array(index.count);
  const candidates: number[] = [];
  for (let i = 1; i < dom.order.length; i++) {
    const row = dom.order[i];
    if (row === root) continue;
    if (dom.retained[row] >= threshold) { qualifies[row] = 1; candidates.push(row); }
  }

  // Keep only accumulation points — a qualifying node whose dominator also
  // qualifies is just a link in the same chain.
  const peaks = candidates.filter(row => {
    const d = dom.idom[row];
    return d === root || d < 0 || !qualifies[d];
  });

  peaks.sort((a, b) => dom.retained[b] - dom.retained[a]);

  const { childOffset, childTarget } = buildDominatorChildren(index, dom);

  /** Exact class tally over a dominator subtree — no sampling, no visit cap. */
  const tallySubtree = (start: number) => {
    const tally = new Map<string, number>();
    const stack = [start];
    while (stack.length) {
      const node = stack.pop()!;
      if (node !== start && index.kind[node] !== KIND_CLASS) {
        const name = classNameOf(index, node);
        tally.set(name, (tally.get(name) ?? 0) + 1);
      }
      for (let e = childOffset[node]; e < childOffset[node + 1]; e++) stack.push(childTarget[e]);
    }
    let best: { className: string; count: number } | undefined;
    for (const [className, count] of tally) {
      if (!best || count > best.count) best = { className, count };
    }
    return best;
  };

  /** Largest dominated child, by retained bytes. */
  const largestChild = (row: number) => {
    let best = -1;
    for (let e = childOffset[row]; e < childOffset[row + 1]; e++) {
      const c = childTarget[e];
      if (best < 0 || dom.retained[c] > dom.retained[best]) best = c;
    }
    return best;
  };

  return peaks.slice(0, limit).map(row => {
    // A static-field leak always peaks at the class object, and "class X retains
    // 97%" tells nobody what to fix. Descend to the container underneath it so
    // the finding names the map or array that is actually growing.
    let holder = row;
    if (index.kind[row] === KIND_CLASS) {
      const child = largestChild(row);
      if (child >= 0 && dom.retained[child] >= dom.retained[row] * 0.5) holder = child;
    }

    return {
      row,
      className: classNameOf(index, row),
      retainedBytes: dom.retained[row],
      retainedPercent: (dom.retained[row] / live) * 100,
      retainedObjects: counts[row],
      accumulates: tallySubtree(row),
      heldIn: holder === row ? undefined : {
        className: classNameOf(index, holder),
        retainedBytes: dom.retained[holder],
      },
      pathToRoot: pathToRoot(index, dom, row),
    };
  });
}

/** Per-class totals across live instances. Used by the verdict and the histogram. */
export function computeClassStats(index: HeapIndex, dom: Dominators): ClassStat[] {
  const n = index.classes.length;
  const instances = new Int32Array(n);
  const shallowBytes = new Float64Array(n);
  const retainedSum = new Float64Array(n);

  for (let i = 1; i < dom.order.length; i++) {
    const row = dom.order[i];
    const c = index.classOf[row];
    if (c < 0 || index.kind[row] === KIND_CLASS) continue;
    instances[c]++;
    shallowBytes[c] += index.shallow[row];
    retainedSum[c] += dom.retained[row];
  }

  const out: ClassStat[] = [];
  for (let c = 0; c < n; c++) {
    if (instances[c] === 0) continue;
    out.push({
      classRow: c,
      className: displayClassName(index.classes[c].name),
      instances: instances[c],
      shallowBytes: shallowBytes[c],
      retainedSumBytes: retainedSum[c],
    });
  }
  return out;
}

/**
 * Live bytes grouped by package then class, for the treemap.
 *
 * Deliberately shallow, not retained: a treemap's areas have to sum to the
 * whole, and shallow bytes are the only per-object metric that partitions the
 * heap exactly. Retained sizes overlap by construction, so a retained treemap
 * would draw rectangles totalling more than the heap.
 */
export function computeTreemap(index: HeapIndex, dom: Dominators, maxLeaves = 400): {
  totalBytes: number;
  groups: { name: string; bytes: number; children: { name: string; bytes: number; instances: number }[] }[];
} {
  const stats = computeClassStats(index, dom);
  const byPackage = new Map<string, { name: string; bytes: number; children: { name: string; bytes: number; instances: number }[] }>();

  for (const s of stats) {
    const cls = s.className;
    const dot = cls.lastIndexOf('.');
    // Arrays and primitives have no package; group them so they stay visible.
    const pkg = cls.startsWith('[') ? 'arrays' : dot > 0 ? cls.slice(0, dot) : '(default)';
    let g = byPackage.get(pkg);
    if (!g) { g = { name: pkg, bytes: 0, children: [] }; byPackage.set(pkg, g); }
    g.bytes += s.shallowBytes;
    g.children.push({ name: dot > 0 && !cls.startsWith('[') ? cls.slice(dot + 1) : cls, bytes: s.shallowBytes, instances: s.instances });
  }

  const groups = [...byPackage.values()].sort((a, b) => b.bytes - a.bytes);
  // Cap the leaf count so the renderer stays smooth; the tail is rolled up
  // rather than dropped, so the areas still sum to the live heap.
  let budget = maxLeaves;
  for (const g of groups) {
    g.children.sort((a, b) => b.bytes - a.bytes);
    const keep = Math.max(1, Math.min(g.children.length, Math.floor(budget / groups.length) || 1, 40));
    if (g.children.length > keep) {
      const rest = g.children.slice(keep);
      const bytes = rest.reduce((t, c) => t + c.bytes, 0);
      const instances = rest.reduce((t, c) => t + c.instances, 0);
      g.children = g.children.slice(0, keep);
      if (bytes > 0) g.children.push({ name: `… ${rest.length} more`, bytes, instances });
    }
    budget -= g.children.length;
  }

  return { totalBytes: dom.liveBytes, groups };
}

/**
 * Children index, built once per analysis and reused.
 *
 * The retention graph expands one node at a time, so recomputing children by
 * scanning every row per click would make the graph unusable on a real dump.
 */
const childCache = new WeakMap<Dominators, { childOffset: Uint32Array; childTarget: Int32Array }>();
function childrenIndex(index: HeapIndex, dom: Dominators) {
  let c = childCache.get(dom);
  if (!c) { c = buildDominatorChildren(index, dom); childCache.set(dom, c); }
  return c;
}

/** Dominator children of a row, largest first — one level of the retention graph. */
export function dominatorChildrenOf(
  index: HeapIndex, dom: Dominators, row: number, limit = 12,
): { row: number; className: string; retainedBytes: number; shallowBytes: number; childCount: number }[] {
  const { childOffset, childTarget } = childrenIndex(index, dom);
  const target = row < 0 ? index.count : row;

  const kids: number[] = [];
  for (let e = childOffset[target]; e < childOffset[target + 1]; e++) kids.push(childTarget[e]);
  kids.sort((a, b) => dom.retained[b] - dom.retained[a]);

  return kids.slice(0, limit).map(k => ({
    row: k,
    className: classNameOf(index, k),
    retainedBytes: dom.retained[k],
    shallowBytes: index.shallow[k],
    childCount: childOffset[k + 1] - childOffset[k],
  }));
}

export function buildVerdict(index: HeapIndex, dom: Dominators): HeapVerdict {
  let unreachableObjects = 0;
  let unreachableBytes = 0;
  for (let row = 0; row < index.count; row++) {
    if (!(index.flags[row] & FLAG_REACHABLE)) {
      unreachableObjects++;
      unreachableBytes += index.shallow[row];
    }
  }

  const topClasses = computeClassStats(index, dom)
    .sort((a, b) => b.shallowBytes - a.shallowBytes)
    .slice(0, 20);

  return {
    liveBytes: dom.liveBytes,
    liveObjects: dom.reachable,
    unreachableObjects,
    unreachableBytes,
    suspects: findLeakSuspects(index, dom),
    topClasses,
  };
}

/** Convenience for callers that just want the verdict. */
export function analyzeHeap(index: HeapIndex): { dominators: Dominators; verdict: HeapVerdict } {
  const dominators = computeDominators(index);
  return { dominators, verdict: buildVerdict(index, dominators) };
}

/** Unused today but kept honest: primitive arrays never dominate anything. */
export const isLeafKind = (kind: number) => kind === KIND_PRIMITIVE_ARRAY;
