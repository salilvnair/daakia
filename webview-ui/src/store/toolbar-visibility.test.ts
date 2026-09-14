/**
 * A switch that hides an icon has one way to go badly wrong: defaulting to
 * hidden. Every existing install has nothing stored, and `prefs` arrives from
 * the database a moment after the first render — so "nothing stored" and "not
 * loaded yet" both have to mean shown, or the rail blinks on every launch and
 * an upgrade looks like a feature being removed.
 */
import { describe, it, expect } from 'vitest';
import { showsOnToolbar, toolbarPrefKey } from './toolbar-visibility';

describe('showsOnToolbar', () => {
  it('shows when nothing is stored', () => {
    expect(showsOnToolbar(undefined)).toBe(true);
  });

  it('shows when the stored value says yes', () => {
    expect(showsOnToolbar('yes')).toBe(true);
  });

  it('hides only on an explicit no', () => {
    expect(showsOnToolbar('no')).toBe(false);
  });

  it('shows on anything it does not recognise', () => {
    // A pref written by a future version, or corrupted. The safe reading of an
    // unknown value is the one that leaves the feature reachable.
    expect(showsOnToolbar('')).toBe(true);
    expect(showsOnToolbar('maybe')).toBe(true);
  });
});

describe('toolbarPrefKey', () => {
  it('keys the two surfaces apart', () => {
    expect(toolbarPrefKey('dk8s')).toBe('toolbar.show.dk8s');
    expect(toolbarPrefKey('dkgh')).toBe('toolbar.show.dkgh');
  });
});
