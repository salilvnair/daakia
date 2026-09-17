/**
 * Turning a log of calls into "why is this slow".
 *
 * The numbers here are the ones somebody sends when their cluster is behind a
 * VPN and mine is not, so each has to mean exactly what it says.
 */
import { describe, it, expect } from 'vitest';
import { timings, overall, median, ms } from './command-timings';

describe('the middle call', () => {
  it('is the middle one', () => {
    expect(median([90, 100, 110])).toBe(100);
  });

  it('is not dragged by one cold start', () => {
    /*
      The reason this is a median. A first call that paid for a credential
      plugin costs seconds; the mean would then report a number no call ever
      took, and the honest answer — "it usually costs 90ms" — would be gone.
    */
    expect(median([90, 95, 100, 105, 14_000])).toBe(100);
  });

  it('is nothing when there was nothing', () => {
    expect(median([])).toBe(0);
  });
});

describe('grouping calls by what they were', () => {
  it('reports how often, how long and how bad', () => {
    const [row] = timings([
      { what: 'get pods', ms: 90, ok: true },
      { what: 'get pods', ms: 110, ok: true },
      { what: 'get pods', ms: 400, ok: true },
    ]);
    expect(row).toMatchObject({
      what: 'get pods', calls: 3, median: 110, worst: 400, total: 600, failed: 0,
    });
  });

  it('orders by total, not by the worst single call', () => {
    /*
      The order things are worth fixing in. Forty calls at 90ms is three and a
      half seconds of somebody's afternoon; one call at 400ms is not, however
      much worse that one call looks.
    */
    const rows = timings([
      ...Array.from({ length: 40 }, () => ({ what: 'top pods', ms: 90 })),
      { what: 'get namespaces', ms: 400 },
    ]);
    expect(rows.map(r => r.what)).toEqual(['top pods', 'get namespaces']);
  });

  it('leaves streams out rather than counting them as instant', () => {
    /* `logs --follow` ends when the reader closes it. Calling that 0ms would
       make following a pod the fastest thing dk8s does. */
    const rows = timings([
      { what: 'logs', ms: undefined },
      { what: 'get pods', ms: 90 },
    ]);
    expect(rows.map(r => r.what)).toEqual(['get pods']);
  });

  it('counts the failures, which are usually the slow ones', () => {
    const [row] = timings([
      { what: 'auth can-i', ms: 30_000, ok: false },
      { what: 'auth can-i', ms: 120, ok: true },
    ]);
    expect(row.failed).toBe(1);
    expect(row.worst).toBe(30_000);
  });

  it('marks a verb nobody asked for as background', () => {
    /* `top pods` polls on a timer. Its cost is real and it is not a wait
       anybody is sitting through, so the two are told apart. */
    expect(timings([
      { what: 'top pods', ms: 90, source: 'poll' },
      { what: 'top pods', ms: 95, source: 'poll' },
    ])[0].background).toBe(true);
    expect(timings([
      { what: 'get pods', ms: 90, source: 'poll' },
      { what: 'get pods', ms: 95, source: 'user' },
    ])[0].background).toBe(false);
  });
});

describe('the whole picture', () => {
  it('adds up every finished call', () => {
    expect(overall(timings([
      { what: 'get pods', ms: 100 },
      { what: 'logs', ms: undefined },
      { what: 'get namespaces', ms: 250 },
    ]))).toEqual({ calls: 2, total: 350 });
  });
});

describe('a duration a person can read', () => {
  it('stays in milliseconds while that is the useful unit', () => {
    expect(ms(97)).toBe('97ms');
    expect(ms(999)).toBe('999ms');
  });

  it('turns into seconds once it is a wait', () => {
    expect(ms(1_400)).toBe('1.4s');
    expect(ms(38_000)).toBe('38s');
  });
});
