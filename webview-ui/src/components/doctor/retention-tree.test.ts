import { describe, it, expect } from 'vitest';
import { descendantsOf, type TreeNode } from './retention-tree';

/*
    0
    ├── 1
    │   └── 3
    │       └── 4
    └── 2
    5  (a second root, unrelated)
*/
const TREE: TreeNode[] = [
  { row: 0, parent: null },
  { row: 1, parent: 0 },
  { row: 2, parent: 0 },
  { row: 3, parent: 1 },
  { row: 4, parent: 3 },
  { row: 5, parent: null },
];

describe('descendantsOf', () => {
  it('takes the whole subtree, not just the children', () => {
    /*
      The bug this exists to prevent. Collapsing node 0 while only removing 1
      and 2 leaves 3 and 4 on the canvas with no edge to anything and nothing
      left that could close them — a node you can never get rid of.
    */
    expect([...descendantsOf(0, TREE)].sort()).toEqual([1, 2, 3, 4]);
  });

  it('takes a subtree from the middle', () => {
    expect([...descendantsOf(1, TREE)].sort()).toEqual([3, 4]);
  });

  it('returns nothing for a leaf', () => {
    expect(descendantsOf(4, TREE).size).toBe(0);
  });

  it('does not touch a sibling root', () => {
    expect(descendantsOf(0, TREE).has(5)).toBe(false);
  });

  it('never includes the node itself', () => {
    // It is removed from `expanded`, not from the canvas — including it here
    // would delete the node you clicked.
    expect(descendantsOf(0, TREE).has(0)).toBe(false);
  });

  it('terminates on a parent cycle', () => {
    /*
      A dominator tree cannot contain one, so this is about what happens when
      the worker sends something malformed: a recursive walk would hang the
      webview with no error, which is worse than a wrong number.
    */
    const cyclic: TreeNode[] = [
      { row: 0, parent: 1 },
      { row: 1, parent: 0 },
    ];
    expect(() => descendantsOf(0, cyclic)).not.toThrow();
    expect([...descendantsOf(0, cyclic)]).toEqual([1]);
  });
});
