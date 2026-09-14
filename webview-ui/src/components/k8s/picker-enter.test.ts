/**
 * Enter in the namespace box.
 *
 * The case that matters most is the one that had no keyboard path at all: a
 * cluster that will not list its namespaces, where typing the name is the only
 * way in.
 */
import { describe, it, expect } from 'vitest';
import { enterIntent } from './picker-enter';

const offer = (context: string, namespaces: string[], pinned: string[] = []) =>
  ({ context, namespaces, pinned });

describe('one cluster', () => {
  it('adds a name the cluster would not list', () => {
    // The restricted-account case: `get namespaces` was refused, so the list
    // is empty and the typed name is all there is.
    expect(enterIntent('checkout', [offer('restricted-lab', [])]))
      .toEqual({ kind: 'add', context: 'restricted-lab' });
  });

  it('ticks a name the cluster did list', () => {
    expect(enterIntent('orders', [offer('prod', ['checkout', 'orders'])]))
      .toEqual({ kind: 'tick', context: 'prod', namespace: 'orders' });
  });

  it('answers with the cluster spelling, not the typed one', () => {
    expect(enterIntent('KUBE-SYSTEM', [offer('prod', ['kube-system'])]))
      .toEqual({ kind: 'tick', context: 'prod', namespace: 'kube-system' });
  });

  it('ticks something already pinned rather than pinning it twice', () => {
    expect(enterIntent('checkout', [offer('lab', [], ['checkout'])]))
      .toEqual({ kind: 'tick', context: 'lab', namespace: 'checkout' });
  });

  it('does nothing on an empty box', () => {
    expect(enterIntent('   ', [offer('prod', ['checkout'])])).toEqual({ kind: 'none' });
  });

  it('will not guess from a prefix', () => {
    /* "kube" narrows the list to three rows. Enter picking one of them would be
       a coin toss dressed up as a shortcut. */
    expect(enterIntent('kube', [offer('prod', ['kube-system', 'kube-public', 'kube-node-lease'])]))
      .toEqual({ kind: 'none' });
  });

  it('will not pin a half-typed name', () => {
    /*
      The first version of this did. "kube" matches nothing exactly, so it fell
      through to the add case and would have pinned a namespace called `kube`
      and started a watch on it — from somebody pressing Enter in the middle of
      filtering. A box that is still narrowing a list is not a box that has
      been finished.
    */
    expect(enterIntent('check', [offer('prod', ['checkout'])])).toEqual({ kind: 'none' });
  });
});

describe('several clusters', () => {
  it('ticks when exactly one of them has the name', () => {
    expect(enterIntent('checkout', [offer('a', ['checkout']), offer('b', ['orders'])]))
      .toEqual({ kind: 'tick', context: 'a', namespace: 'checkout' });
  });

  it('leaves it to the buttons when two clusters have the name', () => {
    // Enter cannot say WHERE, and adding to both would start a watch on a
    // namespace somebody did not ask for.
    expect(enterIntent('checkout', [offer('a', ['checkout']), offer('b', ['checkout'])]))
      .toEqual({ kind: 'none' });
  });

  it('leaves it to the buttons when neither has it', () => {
    expect(enterIntent('newns', [offer('a', ['checkout']), offer('b', ['orders'])]))
      .toEqual({ kind: 'none' });
  });

  it('adds when only one cluster is on screen to add to', () => {
    expect(enterIntent('newns', [offer('only', ['checkout'])]))
      .toEqual({ kind: 'add', context: 'only' });
  });
});
