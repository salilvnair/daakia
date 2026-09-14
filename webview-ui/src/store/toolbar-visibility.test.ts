/**
 * Two things this must never get wrong.
 *
 * A stored answer is obeyed — somebody who turned an icon on does not find it
 * off after an upgrade. And "nothing stored" is not an answer: `prefs` arrives
 * from the database a moment after the first render, so unknown has to resolve
 * to the surface's default rather than to hidden, or the rail blinks on every
 * launch and dk8s looks like a feature that was removed.
 */
import { describe, it, expect } from 'vitest';
import { showsOnToolbar, toolbarPrefKey } from './toolbar-visibility';

describe('the defaults', () => {
  it('keeps dk8s on the rail for a fresh install', () => {
    expect(showsOnToolbar(undefined, 'dk8s')).toBe(true);
  });

  it('keeps dkgh off it', () => {
    // An issue tracker is a place you go deliberately, and most installs are
    // here for the API client. It is one switch away in Settings → DKGH.
    expect(showsOnToolbar(undefined, 'dkgh')).toBe(false);
  });
});

describe('a stored answer', () => {
  it('is obeyed, whichever way it goes', () => {
    expect(showsOnToolbar('no', 'dk8s')).toBe(false);
    expect(showsOnToolbar('yes', 'dkgh')).toBe(true);
  });

  it('falls back to the default when it says nothing recognisable', () => {
    // Empty is what an un-hydrated pref looks like; "maybe" is what a pref
    // from some future version might. Neither is a decision.
    for (const odd of ['', 'maybe', 'true']) {
      expect(showsOnToolbar(odd, 'dk8s')).toBe(true);
      expect(showsOnToolbar(odd, 'dkgh')).toBe(false);
    }
  });
});

describe('toolbarPrefKey', () => {
  it('keys the two surfaces apart', () => {
    expect(toolbarPrefKey('dk8s')).toBe('toolbar.show.dk8s');
    expect(toolbarPrefKey('dkgh')).toBe('toolbar.show.dkgh');
  });
});
