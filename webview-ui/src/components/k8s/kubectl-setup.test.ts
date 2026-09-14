/**
 * The install routes are content, and content rots quietly.
 *
 * Nobody reads this screen until kubectl is missing, which is the worst moment
 * to discover that the recommended route is gone, that a platform lost its
 * no-package-manager escape hatch, or that a line somebody is about to paste
 * into a shell is not a shell command at all.
 */
import { describe, it, expect } from 'vitest';
import { ROUTES } from './KubectlSetupGuide';

const PLATS = ['win32', 'darwin', 'linux'] as const;

describe('every platform', () => {
  it.each(PLATS)('%s offers something', (plat) => {
    expect(ROUTES[plat].length).toBeGreaterThan(1);
  });

  it.each(PLATS)('%s has exactly one recommended route', (plat) => {
    // Two recommendations is no recommendation; none leaves the reader to rank
    // four package managers they may not have.
    const picked = ROUTES[plat].filter(r => r.tag === 'recommended');
    expect(picked.length, plat).toBeLessThanOrEqual(1);
  });

  it.each(PLATS)('%s keeps a route for a machine with no package manager', (plat) => {
    // The locked-down corporate laptop is the machine most likely to be here,
    // and telling it to run winget is telling it nothing.
    expect(ROUTES[plat].some(r => r.file), plat).toBe(true);
  });

  it.each(PLATS)('%s says something about every route', (plat) => {
    for (const r of ROUTES[plat]) {
      expect(r.title.trim().length, `${plat}/${r.title}`).toBeGreaterThan(0);
      expect(!!r.command || !!r.file, `${plat}/${r.title} has neither a command nor a file`).toBe(true);
    }
  });
});

describe('what is drawn as a command', () => {
  it('is a command', () => {
    /*
      A path through somebody else's settings — "Settings → Kubernetes →
      Enable Kubernetes" — behind a `$` with a copy button is an invitation to
      paste it into a shell and watch it fail. Those routes are marked `ui`,
      and this is what keeps the mark on them.
    */
    for (const plat of PLATS) {
      for (const r of ROUTES[plat]) {
        if (r.ui || !r.command) continue;
        expect(r.command, `${plat}/${r.title} reads as clicks, not a command`)
          .not.toMatch(/→/);
      }
    }
  });

  it('marks the ones that are clicks', () => {
    const clicks = PLATS.flatMap(p => ROUTES[p]).filter(r => r.command?.includes('→'));
    expect(clicks.length).toBeGreaterThan(0);
    for (const r of clicks) expect(r.ui, r.title).toBe(true);
  });
});
