import { describe, it, expect, beforeEach } from 'vitest';
import { useAppThemeStore } from './app-theme-store';
import { BUILT_IN_PALETTES, type AppPalette } from '../services/theme/palette';

function custom(id: string): AppPalette {
  return { ...BUILT_IN_PALETTES[1], id, label: id, builtIn: undefined };
}

describe('the order the palettes are shown in', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppThemeStore.setState({
      custom: [], selected: BUILT_IN_PALETTES[0].id, hidden: [], order: [],
    });
  });

  const ids = () => useAppThemeStore.getState().palettes().map(p => p.id);

  it('starts as the built-ins in the order they ship', () => {
    expect(ids()).toEqual(BUILT_IN_PALETTES.map(p => p.id));
  });

  it('moves a card and remembers it', () => {
    const store = useAppThemeStore.getState();
    const before = ids();
    store.reorder(0, 2);
    expect(ids()).toEqual([before[1], before[2], before[0], ...before.slice(3)]);
    expect(localStorage.getItem('daakia.theme.v1')).toContain('"order"');
  });

  it('ignores a drag that goes nowhere or off the end', () => {
    const store = useAppThemeStore.getState();
    const before = ids();
    store.reorder(1, 1);
    store.reorder(-1, 2);
    store.reorder(0, 99);
    expect(ids()).toEqual(before);
  });

  it('puts a newly added palette at the end rather than losing it', () => {
    /*
      The order is stored as ids, so anything it does not mention has to keep
      a place — an import, or a built-in added by a later version, would
      otherwise sort to an undefined position.
    */
    const store = useAppThemeStore.getState();
    store.reorder(0, 1);
    store.add([custom('mine')]);
    expect(ids()).toContain('mine');
    expect(ids().at(-1)).toBe('mine');
  });

  it('keeps a hidden palette its place for when it comes back', () => {
    const store = useAppThemeStore.getState();
    const [first, second] = ids();
    store.reorder(0, 2);
    const arranged = ids();
    store.setHidden(second, true);
    expect(ids()).not.toContain(second);
    store.setHidden(second, false);
    expect(ids()).toEqual(arranged);
    expect(ids()[2]).toBe(first);
  });

  it('survives a deleted palette without shifting the rest', () => {
    const store = useAppThemeStore.getState();
    store.add([custom('a'), custom('b')]);
    store.reorder(useAppThemeStore.getState().palettes().length - 1, 0);
    const before = ids();
    store.remove('a');
    expect(ids()).toEqual(before.filter(id => id !== 'a'));
  });
});
