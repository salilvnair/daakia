/**
 * Which command a loader is allowed to show.
 *
 * The rule exists because breaking it produced a screen that lied twice over:
 * "slow-lab did not answer" with `kubectl --context restricted-lab … top pods`
 * printed underneath as the thing it was waiting on, and — on a fresh start —
 * a finished command's error still sitting under a spinner that had only just
 * begun.
 *
 * The predicate is tested rather than the component: it is the whole of the
 * decision, and a render test would be checking React rather than this.
 */
import { describe, it, expect } from 'vitest';
import { showable, SETTLED_GRACE_MS } from './running-command-pick';

const NOW = 1_000_000;
const cmd = (over: Partial<Parameters<typeof showable>[0]['commands'][number]> = {}) => ({
  command: 'kubectl --context prod -n payments get pods -o json',
  what: 'get pods',
  context: 'prod',
  kind: 'run' as const,
  at: NOW,
  ...over,
});

const pick = (commands: ReturnType<typeof cmd>[], over: Record<string, unknown> = {}) =>
  showable({ commands, context: 'prod', now: NOW, ...over });

describe('whose command it is', () => {
  it('shows one from the cluster on screen', () => {
    expect(pick([cmd()])?.what).toBe('get pods');
  });

  it('will not show another cluster’s', () => {
    // The exact failure: the screen said slow-lab, the card said restricted-lab.
    expect(pick([cmd({ context: 'restricted-lab', what: 'top pods' })])).toBeUndefined();
  });

  it('shows a command with no context at all', () => {
    // `kubectl config get-contexts` belongs to no cluster and is still the
    // honest answer to "what is it doing" on the screen that lists them.
    expect(pick([cmd({ context: undefined, what: 'config get-contexts' })])?.what)
      .toBe('config get-contexts');
  });
});

describe('how current it has to be', () => {
  it('always shows one that is still running', () => {
    expect(pick([cmd({ ms: undefined, at: NOW - 60_000 })])).toBeDefined();
  });

  it('shows one that finished a moment ago, so a fast refusal can be read', () => {
    expect(pick([cmd({ ms: 300, at: NOW - 1_000 })])).toBeDefined();
  });

  it('drops one that finished long enough ago to belong to another screen', () => {
    expect(pick([cmd({ ms: 300, at: NOW - SETTLED_GRACE_MS - 1 })])).toBeUndefined();
  });
});

describe('a screen showing a result, not a wait', () => {
  /*
    "slow-lab did not answer" is where somebody goes before saying "but it
    works in my terminal", so the line to try in that terminal is the point of
    the screen. Its command has by definition finished — that is what makes it
    a result — so the freshness window must not apply, and for a while it did:
    the card vanished from every failure screen four seconds after the failure.
  */
  it('keeps a command however long ago it finished', () => {
    const old = cmd({ ms: 10_000, at: NOW - 10 * 60_000, what: 'version' });
    expect(pick([old], { mode: 'settled' })?.what).toBe('version');
    expect(pick([old])).toBeUndefined();          // a loader would not
  });

  it('still refuses another cluster’s', () => {
    expect(pick([cmd({ context: 'other', ms: 10 })], { mode: 'settled' })).toBeUndefined();
  });
});

describe('when a screen names what it is waiting on', () => {
  it('ignores anything else that happened to start', () => {
    const picked = pick(
      [cmd({ what: 'get pods' }), cmd({ what: 'logs api-0', ms: undefined })],
      { match: 'get pods' },
    );
    expect(picked?.what).toBe('get pods');
  });

  it('takes the newest of the ones that match', () => {
    const picked = pick([
      cmd({ what: 'get pods', at: NOW - 2_000, ms: 10 }),
      cmd({ what: 'get pods', at: NOW - 100, ms: 10 }),
    ], { match: 'get pods' });
    expect(picked?.at).toBe(NOW - 100);
  });
});
