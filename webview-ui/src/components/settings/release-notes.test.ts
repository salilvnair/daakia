/**
 * The About screen states one fact — what you are running — and it is the fact
 * most easily allowed to go stale, because nothing breaks when it does.
 *
 * Two things can drift. The release notes can describe a version that is not
 * the one shipping, so "New in 3.0.2" sits above a build called 3.0.3. And the
 * deep link from the rail can name a section Settings has never heard of, which
 * fails by quietly landing you wherever you were last, which looks like the
 * icon not working.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { RELEASES, CURRENT_RELEASE, formatReleaseDate } from './release-notes';
import { useTabsStore } from '../../store/tabs-store';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const manifestVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

describe('release notes', () => {
  it('leads with the version that is actually shipping', () => {
    // `__APP_VERSION__` on screen comes from this manifest; the notes beside it
    // come from the file. Nothing forces them to agree except this.
    expect(CURRENT_RELEASE.version).toBe(manifestVersion);
  });

  it('is newest first', () => {
    const asNumbers = RELEASES.map(r => r.version.split('.').map(Number));
    for (let i = 1; i < asNumbers.length; i++) {
      expect(asNumbers[i - 1] > asNumbers[i]).toBe(true);
    }
  });

  it('dates run backwards with the versions', () => {
    const dates = RELEASES.map(r => r.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('gives every release a headline and at least one line', () => {
    for (const r of RELEASES) {
      expect(r.headline.trim().length, r.version).toBeGreaterThan(0);
      expect(r.lines.length, r.version).toBeGreaterThan(0);
      for (const l of r.lines) {
        expect(l.area.trim().length, `${r.version} ${l.text}`).toBeGreaterThan(0);
        expect(l.text.trim().length, `${r.version} ${l.area}`).toBeGreaterThan(0);
      }
    }
  });

  it('formats a date the way a person writes one', () => {
    expect(formatReleaseDate('2026-09-13')).toBe('13 September 2026');
    expect(formatReleaseDate('2026-01-01')).toBe('1 January 2026');
  });
});

describe('the i in the rail', () => {
  beforeEach(() => {
    useTabsStore.setState({ tabs: [], activeTabId: '', settingsTarget: undefined });
  });

  it('opens Settings and says where to land', () => {
    useTabsStore.getState().openSettingsTab('about');
    const s = useTabsStore.getState();
    expect(s.tabs.some(t => t.type === 'settings')).toBe(true);
    expect(s.settingsTarget).toBe('about');
  });

  it('leaves the section alone when the gear is what was pressed', () => {
    useTabsStore.getState().openSettingsTab();
    // No target means "wherever you were last", which is what the gear has
    // always done — a deep link must not be able to leak into it.
    expect(useTabsStore.getState().settingsTarget).toBeUndefined();
  });

  it('reuses the settings tab rather than stacking a second one', () => {
    useTabsStore.getState().openSettingsTab();
    useTabsStore.getState().openSettingsTab('about');
    const s = useTabsStore.getState();
    expect(s.tabs.filter(t => t.type === 'settings')).toHaveLength(1);
    expect(s.settingsTarget).toBe('about');
  });

  it('is cleared once read, so reopening does not jump you again', () => {
    useTabsStore.getState().openSettingsTab('about');
    useTabsStore.getState().clearSettingsTarget();
    expect(useTabsStore.getState().settingsTarget).toBeUndefined();
  });
});
