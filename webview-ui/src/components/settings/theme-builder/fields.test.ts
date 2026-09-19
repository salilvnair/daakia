import { describe, it, expect } from 'vitest';
import { TERMINAL_PALETTES, TERMINAL_ANSI_KEYS } from '@salilvnair/dui';
import {
  fieldsFor, idFromLabel, appToDraft, terminalToDraft, draftToApp, draftToTerminal,
} from './fields';
import { BUILT_IN_PALETTES, SEED_KEYS } from '../../../services/theme/palette';

describe('one builder, two kinds of theme', () => {
  it('offers every colour each kind actually has', () => {
    /*
      The guard against a builder that quietly edits twelve of thirteen: the
      field list is generated from the same key list the palette is validated
      against, so a seed added later cannot be left out of the UI.
    */
    expect(fieldsFor('app').map(f => f.key)).toEqual([...SEED_KEYS]);
    expect(fieldsFor('terminal').map(f => f.key)).toEqual([...TERMINAL_ANSI_KEYS]);
  });

  it('groups them, and every field lands in a group', () => {
    for (const kind of ['app', 'terminal'] as const) {
      for (const f of fieldsFor(kind)) {
        expect(f.group, `${kind}.${f.key}`).toBeTruthy();
        expect(f.label, `${kind}.${f.key}`).toBeTruthy();
      }
    }
  });

  it('names a terminal colour the way a person would', () => {
    const labels = Object.fromEntries(fieldsFor('terminal').map(f => [f.key, f.label]));
    expect(labels.brightBlack).toBe('Bright Black');
    expect(labels.selectionBackground).toBe('Selection Background');
  });
});

describe('converting at the edges', () => {
  it('round-trips an app palette', () => {
    const p = BUILT_IN_PALETTES[1];
    const back = draftToApp(appToDraft(p));
    expect(back.dark).toEqual(p.dark);
    expect(back.light).toEqual(p.light);
    expect(back.label).toBe(p.label);
  });

  it('round-trips a terminal palette', () => {
    const p = TERMINAL_PALETTES[0];
    const back = draftToTerminal(terminalToDraft(p));
    expect(back.dark).toEqual(p.dark);
    expect(back.light).toEqual(p.light);
  });

  it('carries the derived flag both ways, and drops it when absent', () => {
    // It is the one piece of provenance a theme has; losing it in the builder
    // would turn "computed" into "designed" on the first save.
    const derived = { ...BUILT_IN_PALETTES[1], lightDerived: true };
    expect(draftToApp(appToDraft(derived)).lightDerived).toBe(true);
    expect(draftToApp(appToDraft(BUILT_IN_PALETTES[1])).lightDerived).toBeUndefined();
  });
});

describe('naming a new theme', () => {
  it('makes an id from the name', () => {
    expect(idFromLabel('My Theme', [])).toBe('my-theme');
    expect(idFromLabel('  Tokyo Night!  ', [])).toBe('tokyo-night');
  });

  it('steps around an id already in use', () => {
    expect(idFromLabel('Mine', ['mine'])).toBe('mine-2');
    expect(idFromLabel('Mine', ['mine', 'mine-2'])).toBe('mine-3');
  });

  it('always produces something', () => {
    // A name of only punctuation still has to save.
    expect(idFromLabel('***', [])).toBe('theme');
    expect(idFromLabel('', [])).toBe('theme');
  });
});
