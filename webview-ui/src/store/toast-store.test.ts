/**
 * Toasts: one card per thing that happened, however many times it happened.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useToastStore, defaultDuration, MAX_TOASTS } from './toast-store';

const toasts = () => useToastStore.getState().toasts;
beforeEach(() => useToastStore.getState().clearToasts());

describe('toasts', () => {
  it('counts the same toast instead of stacking it, and restarts its timer', () => {
    const add = useToastStore.getState().addToast;
    const id = add({ type: 'success', message: 'Request saved' });
    expect(add({ type: 'success', message: 'Request saved' })).toBe(id);
    add({ type: 'success', message: 'Request saved' });
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]).toMatchObject({ count: 3, rev: 2 });
  });

  it('keeps a different title or type apart', () => {
    const add = useToastStore.getState().addToast;
    add({ type: 'success', message: 'x' });
    add({ type: 'error', message: 'x' });
    add({ type: 'success', title: 'Saved', message: 'x' });
    expect(toasts()).toHaveLength(3);
  });

  it(`shows at most ${MAX_TOASTS}, dropping the oldest`, () => {
    for (let i = 0; i < MAX_TOASTS + 2; i++) useToastStore.getState().addToast({ type: 'info', message: `n${i}` });
    expect(toasts().map(t => t.message)).toEqual(['n2', 'n3', 'n4', 'n5', 'n6']);
  });

  it('an error stays until dismissed; a warning gets longer than a success', () => {
    expect(defaultDuration('error')).toBe(0);
    expect(defaultDuration('warning')).toBeGreaterThan(defaultDuration('success'));
  });
});
