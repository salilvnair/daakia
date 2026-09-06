/**
 * Starred requests: what gets remembered, and where they land.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { toggleStar, isStarred, starFirst } from './starred';
import { useUiStateStore } from '../../store/ui-state-store';
import type { CollectionTreeNode } from './tree-helpers';

const KEY = 'collections.starred';
const raw = () => useUiStateStore.getState().prefs[KEY];

const req = (id: string, name = id) => ({ id, name, method: 'GET', url: '' } as never);
const node = (id: string, requests: unknown[], children: unknown[] = []): CollectionTreeNode =>
  ({ id, name: id, requests, children, parent_id: null } as never);

beforeEach(() => useUiStateStore.setState({ prefs: {} }));

describe('remembering', () => {
  it('stars, and unstars the same id', () => {
    toggleStar('r1');
    expect(isStarred('r1')).toBe(true);
    toggleStar('r1');
    expect(isStarred('r1')).toBe(false);
  });

  it('keeps the newest star first', () => {
    toggleStar('r1');
    toggleStar('r2');
    expect(JSON.parse(raw()!)).toEqual(['r2', 'r1']);
  });

  /* The pref is a string from SQLite; a truncated or hand-edited value must
     not take the sidebar down on its first render. */
  it('survives a malformed pref', () => {
    useUiStateStore.setState({ prefs: { [KEY]: '{not json' } });
    expect(isStarred('r1')).toBe(false);
    toggleStar('r1');
    expect(JSON.parse(raw()!)).toEqual(['r1']);
  });

  it('caps the list and drops the oldest rather than refusing the click', () => {
    for (let i = 0; i < 205; i++) toggleStar(`r${i}`);
    const ids: string[] = JSON.parse(raw()!);
    expect(ids).toHaveLength(200);
    expect(ids[0]).toBe('r204');
    expect(ids).not.toContain('r0');
  });
});

describe('ordering', () => {
  const tree = [node('c1', [req('a'), req('b'), req('c')])];

  it('floats a starred request to the top of its folder', () => {
    const out = starFirst(tree, new Set(['c']));
    expect(out[0]!.requests.map((r: { id: string }) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('keeps the relative order of everything else', () => {
    const out = starFirst([node('c1', [req('a'), req('b'), req('c'), req('d')])], new Set(['c', 'a']));
    expect(out[0]!.requests.map((r: { id: string }) => r.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('reaches into nested folders', () => {
    const nested = [node('c1', [req('a')], [node('f1', [req('x'), req('y')])])];
    const out = starFirst(nested, new Set(['y']));
    expect(out[0]!.children[0]!.requests.map((r: { id: string }) => r.id)).toEqual(['y', 'x']);
  });

  /* Nothing starred is the common case; returning the same array keeps the
     tree's identity stable so React is not handed a new object every render. */
  it('returns the tree untouched when nothing is starred', () => {
    expect(starFirst(tree, new Set())).toBe(tree);
  });
});
