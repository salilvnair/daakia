import { describe, it, expect } from 'vitest';
import { isRollup, toBarRows } from './heap-bars';

const GROUPS = [
  {
    name: 'arrays',
    children: [
      { name: '[B', bytes: 200_000_000, instances: 21_987 },
      { name: '… 196 more', bytes: 422_000, instances: 5_297 },
    ],
  },
  {
    name: 'java.lang',
    children: [
      { name: 'java.lang.String', bytes: 284_000, instances: 20_808 },
      { name: '[Ljava.lang.Object;', bytes: 427_000, instances: 3_931 },
    ],
  },
];

describe('toBarRows', () => {
  it('flattens every package into one list, largest first', () => {
    const rows = toBarRows(GROUPS);
    expect(rows.map(r => r.className)).toEqual([
      '[B', '[Ljava.lang.Object;', '… 196 more', 'java.lang.String',
    ]);
  });

  it('keeps the package, which a flattened name loses', () => {
    // `… 196 more` means nothing without it, and two packages can each have one.
    const rollup = toBarRows(GROUPS).find(r => isRollup(r.className));
    expect(rollup?.group).toBe('arrays');
  });

  it('carries the instance count through', () => {
    expect(toBarRows(GROUPS)[0].instances).toBe(21_987);
  });
});

describe('isRollup', () => {
  it('recognises the aggregate row the treemap query emits', () => {
    /*
      The bug this prevents: rendered as a row it looks like a class, and
      clicking it would narrow the object set to the literal string
      "… 196 more", which matches nothing — an empty view with no hint that
      the click was meaningless.
    */
    expect(isRollup('… 196 more')).toBe(true);
    expect(isRollup('… 2 more')).toBe(true);
  });

  it('does not catch a real class', () => {
    expect(isRollup('java.lang.String')).toBe(false);
    expect(isRollup('[B')).toBe(false);
    // A class whose name merely contains the word.
    expect(isRollup('com.acme.LoadMoreHandler')).toBe(false);
  });
});
