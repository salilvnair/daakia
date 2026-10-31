import { describe, it, expect, beforeEach } from 'vitest';
import { snoozeEnd, snoozeInsights, insightsSnoozed, _resetSnooze } from './history-dismissals';

describe('snoozing the History suggestions', () => {
  beforeEach(() => _resetSnooze());

  it('hides for the rest of today, up to local midnight', () => {
    const at = new Date(2026, 9, 20, 15, 30).getTime();
    expect(snoozeEnd('today', at)).toBe(new Date(2026, 9, 21, 0, 0).getTime());
    snoozeInsights('today', at);
    expect(insightsSnoozed(at + 60_000)).toBe(true);
    expect(insightsSnoozed(new Date(2026, 9, 21, 0, 1).getTime())).toBe(false);
  });

  it('hides for seven days', () => {
    const at = Date.UTC(2026, 9, 20);
    snoozeInsights('week', at);
    expect(insightsSnoozed(at + 6 * 86_400_000)).toBe(true);
    expect(insightsSnoozed(at + 7 * 86_400_000 + 1)).toBe(false);
  });

  it('hides until Daakia opens again, with nothing stored', () => {
    snoozeInsights('session');
    expect(insightsSnoozed()).toBe(true);
    expect(localStorage.getItem('daakia.history.insights.snoozedUntil')).toBeNull();
  });
});
