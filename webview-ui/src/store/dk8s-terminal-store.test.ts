/**
 * The rules that are easy to state and easy to get wrong: six on the strip,
 * built-ins that cannot be overwritten, and a store that does not trust what
 * comes back out of localStorage.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TERMINAL_PALETTES, terminalThemeTemplate } from '@salilvnair/dui';
import { useDk8sTerminalStore, MAX_SELECTED, DEFAULT_PREFS } from './dk8s-terminal-store';

const S = () => useDk8sTerminalStore.getState();

/** A fresh store, the way a reload would give one. */
function reset() {
  localStorage.clear();
  const ids = TERMINAL_PALETTES.map(t => t.id);
  useDk8sTerminalStore.setState({
    custom: [], hidden: [], order: [...ids], selected: ids.slice(0, MAX_SELECTED),
    active: ids[0], prefs: { ...DEFAULT_PREFS },
  });
}

const theme = (id: string) => ({ ...terminalThemeTemplate(id, id), id });

describe('the strip holds six', () => {
  beforeEach(reset);

  it('starts with the six built-ins on it', () => {
    expect(S().selected).toHaveLength(MAX_SELECTED);
    expect(S().strip()).toHaveLength(MAX_SELECTED);
  });

  it('refuses a seventh, and says why', () => {
    S().importThemes([theme('extra-one')]);
    const r = S().toggleSelected('extra-one');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain(String(MAX_SELECTED));
    expect(S().selected).toHaveLength(MAX_SELECTED);
  });

  it('takes the seventh once room is made', () => {
    S().importThemes([theme('extra-one')]);
    const spare = S().selected.find(id => id !== S().active)!;
    expect(S().toggleSelected(spare).ok).toBe(true);
    expect(S().toggleSelected('extra-one').ok).toBe(true);
    expect(S().selected).toContain('extra-one');
    expect(S().selected).toHaveLength(MAX_SELECTED);
  });

  it('will not remove the theme in use, which is the way back', () => {
    const r = S().toggleSelected(S().active);
    expect(r.ok).toBe(false);
    expect(S().selected).toContain(S().active);
  });

  it('keeps storing themes past the cap on selection', () => {
    for (let i = 0; i < 12; i++) S().importThemes([theme(`stored-${i}`)]);
    expect(S().themes().length).toBe(TERMINAL_PALETTES.length + 12);
    expect(S().strip()).toHaveLength(MAX_SELECTED);
  });
});

describe('importing', () => {
  beforeEach(reset);

  it('will not let a file overwrite a built-in', () => {
    const r = S().importThemes([{ ...terminalThemeTemplate(), id: TERMINAL_PALETTES[0].id }]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('built-in');
    expect(S().theme(TERMINAL_PALETTES[0].id).label).toBe(TERMINAL_PALETTES[0].label);
  });

  it('refuses a theme carrying something that is not a colour', () => {
    const bad = terminalThemeTemplate('bad-one');
    const r = S().importThemes([{ ...bad, dark: { ...bad.dark, red: 'red; background: url(x)' } }]);
    expect(r.ok).toBe(false);
    expect(S().themes().map(t => t.id)).not.toContain('bad-one');
  });

  it('replaces a custom theme with the same id rather than duplicating it', () => {
    S().importThemes([theme('mine')]);
    const r = S().importThemes([{ ...theme('mine'), label: 'Renamed' }]);
    expect(r).toMatchObject({ ok: true, added: 0, replaced: 1 });
    expect(S().themes().filter(t => t.id === 'mine')).toHaveLength(1);
    expect(S().theme('mine').label).toBe('Renamed');
  });

  it('puts a new theme at the end of the order, not the front', () => {
    S().importThemes([theme('last-one')]);
    expect(S().order[S().order.length - 1]).toBe('last-one');
  });
});

describe('removing', () => {
  beforeEach(reset);

  it('hides a built-in rather than losing it', () => {
    // Removing one takes it out of the list...
    const id = TERMINAL_PALETTES[1].id;
    S().removeTheme(id);
    expect(S().themes().map(t => t.id)).not.toContain(id);
    expect(S().hidden).toContain(id);
    // ...but it ships with the build, so Reset is enough to get it back.
    S().resetAll();
    expect(S().themes().map(t => t.id)).toContain(id);
    expect(S().hidden).toHaveLength(0);
  });

  it('moves off a built-in that was in use when it is hidden', () => {
    const id = S().active;
    S().removeTheme(id);
    expect(S().active).not.toBe(id);
    expect(S().themes().map(t => t.id)).not.toContain(id);
  });

  it('refuses to remove the last one, so the list cannot be emptied', () => {
    for (const t of [...S().themes()]) S().removeTheme(t.id);
    // One theme survives, it is on the strip, and it is the one in use — the
    // three things that have to stay true for the picker to still work.
    expect(S().themes()).toHaveLength(1);
    expect(S().selected.length).toBeGreaterThan(0);
    expect(S().themes().map(t => t.id)).toContain(S().active);
  });

  it('moves off a custom theme that was in use', () => {
    S().importThemes([theme('doomed')]);
    const spare = S().selected.find(id => id !== S().active)!;
    S().toggleSelected(spare);
    S().toggleSelected('doomed');
    S().setActive('doomed');
    S().removeTheme('doomed');
    expect(S().active).not.toBe('doomed');
    expect(S().theme().id).not.toBe('doomed');
  });
});

describe('reordering', () => {
  beforeEach(reset);

  it('moves one and leaves the rest in order', () => {
    const before = [...S().order];
    S().reorder(0, 3);
    const after = S().order;
    expect(after[3]).toBe(before[0]);
    expect([...after].sort()).toEqual([...before].sort());
  });

  it('ignores an index that is not there', () => {
    const before = [...S().order];
    S().reorder(-1, 2);
    S().reorder(0, 99);
    expect(S().order).toEqual(before);
  });
});

describe('preferences', () => {
  beforeEach(reset);

  it('clamps what a control should never have sent', () => {
    S().setPref('scrollback', 5_000_000);
    expect(S().prefs.scrollback).toBeLessThanOrEqual(50_000);
    S().setPref('fontSize', 0);
    expect(S().prefs.fontSize).toBeGreaterThanOrEqual(8);
  });

  it('refuses a font stack that could close the declaration', () => {
    S().setPref('fontFamily', 'monospace; position: fixed');
    expect(S().prefs.fontFamily).toBe(DEFAULT_PREFS.fontFamily);
  });

  it('survives a round trip through storage', () => {
    S().setPref('fontSize', 15);
    S().setPref('copyOnSelect', true);
    const raw = localStorage.getItem('dk8s.terminal.v1');
    expect(raw).toBeTruthy();
    const back = JSON.parse(raw!) as { prefs: { fontSize: number; copyOnSelect: boolean } };
    expect(back.prefs.fontSize).toBe(15);
    expect(back.prefs.copyOnSelect).toBe(true);
  });
});
