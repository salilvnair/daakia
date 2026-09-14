/**
 * Which environment the toolbar selector shows.
 *
 * The bug this exists for: the selector fell back to `envOptions[0]` — the
 * first environment in the list — whenever the tab had not been given one of
 * its own. So the Environments panel showed `fixture-repo123` with a tick and
 * the toolbar showed `NS9 — Slim`, and both claimed to be saying the same
 * thing.
 */
import { describe, it, expect } from 'vitest';
import { selectedEnvId, GLOBAL } from './env-selector';

const options = [
  { value: 'e1', label: 'NS9 — Slim' },
  { value: 'e2', label: 'NS9 — local' },
  { value: 'e3', label: 'fixture-repo123' },
];

describe('what the selector shows', () => {
  it('is the tab’s own environment when it has one', () => {
    expect(selectedEnvId({ tabEnvId: 'e2', activeEnvId: 'e3', options })).toBe('e2');
  });

  it('is the ACTIVE environment when the tab has none', () => {
    // Not options[0]. That was the bug.
    expect(selectedEnvId({ tabEnvId: undefined, activeEnvId: 'e3', options })).toBe('e3');
  });

  it('is the active one when the tab is on the global environment', () => {
    /* Global is not a choice in this list — it always applies — so a tab
       pointing at it has not chosen anything. */
    expect(selectedEnvId({ tabEnvId: GLOBAL, activeEnvId: 'e3', options })).toBe('e3');
  });

  it('is nothing when the active environment is global', () => {
    expect(selectedEnvId({ tabEnvId: undefined, activeEnvId: GLOBAL, options })).toBe('');
  });

  it('is nothing when nothing is active', () => {
    expect(selectedEnvId({ tabEnvId: undefined, activeEnvId: null, options })).toBe('');
  });

  it('is nothing when the active environment has been deleted', () => {
    /* Showing an id that is not in the list leaves the control blank anyway;
       being explicit about it stops a stale id looking like a selection. */
    expect(selectedEnvId({ tabEnvId: undefined, activeEnvId: 'gone', options })).toBe('');
  });

  it('never silently picks the first of the list', () => {
    for (const activeEnvId of [null, GLOBAL, 'gone']) {
      expect(selectedEnvId({ tabEnvId: undefined, activeEnvId, options })).not.toBe('e1');
    }
  });
});
