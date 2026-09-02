import { describe, it, expect } from 'vitest';
import {
  windowOptions, windowError, localInputValue, defaultWindow, type TimeWindow,
} from './TimeWindow';

const between = (from: string, to: string, zone = 'UTC'): TimeWindow =>
  ({ kind: 'between', from, to, zone });

describe('windowOptions', () => {
  it('leaves a preset relative, so it means the same tomorrow', () => {
    expect(windowOptions({ ...defaultWindow(), kind: '1h' }))
      .toEqual({ sinceSeconds: 3600 });
  });

  it('asks for nothing at all when the window is all time', () => {
    expect(windowOptions({ ...defaultWindow(), kind: 'all' })).toEqual({});
  });

  it('resolves a between to two absolute instants', () => {
    const { fromMs, toMs } = windowOptions(between('2026-08-01T00:00', '2026-08-05T09:05'));
    expect(fromMs).toBe(Date.parse('2026-08-01T00:00:00Z'));
    expect(toMs).toBe(Date.parse('2026-08-05T09:05:00Z') + 59_999);
  });

  /*
    The reason the zone is on the window at all.

    A pod writes UTC and the person reading it is somewhere else, so the same
    wall-clock reading is two different instants. Before this it was always
    taken as the browser's zone, which meant typing a timestamp copied out of
    a UTC log selected a window hours away from the line it came from.
  */
  it('reads the same wall clock as a different instant in a different zone', () => {
    const utc = windowOptions(between('2026-08-01T00:00', '2026-08-01T01:00', 'UTC'));
    const chi = windowOptions(
      between('2026-08-01T00:00', '2026-08-01T01:00', 'America/Chicago'));
    expect(chi.fromMs! - utc.fromMs!).toBe(5 * 3600_000);   // CDT is UTC-5
  });

  it('handles a zone that is not a whole number of hours from UTC', () => {
    const { fromMs } = windowOptions(
      between('2026-08-01T00:00', '2026-08-01T01:00', 'Asia/Kolkata'));
    expect(fromMs).toBe(Date.parse('2026-07-31T18:30:00Z'));
  });

  it('uses the offset in force on the chosen day, not the one in force today', () => {
    // Chicago is UTC-5 in August and UTC-6 in January.
    const summer = windowOptions(
      between('2026-08-01T00:00', '2026-08-01T01:00', 'America/Chicago'));
    const winter = windowOptions(
      between('2026-01-15T00:00', '2026-01-15T01:00', 'America/Chicago'));
    expect(summer.fromMs).toBe(Date.parse('2026-08-01T05:00:00Z'));
    expect(winter.fromMs).toBe(Date.parse('2026-01-15T06:00:00Z'));
  });

  it('includes the whole of the end minute', () => {
    // Picking 09:05 and losing 09:05:30 is the kind of gap that gets blamed on
    // the logs rather than on the filter.
    const { toMs } = windowOptions(between('2026-08-01T00:00', '2026-08-05T09:05'));
    expect(toMs!).toBeGreaterThan(Date.parse('2026-08-05T09:05:30Z'));
    expect(toMs!).toBeLessThan(Date.parse('2026-08-05T09:06:00Z'));
  });

  it('reads the fields in the browser zone when that is what is chosen', () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { fromMs } = windowOptions(between('2026-08-01T13:45', '2026-08-02T00:00', zone));
    const d = new Date(fromMs!);
    expect([d.getHours(), d.getMinutes()]).toEqual([13, 45]);
  });
});

describe('windowError', () => {
  it('rejects a range that ends before it starts', () => {
    expect(windowError(between('2026-08-05T00:00', '2026-08-01T00:00')))
      .toMatch(/before its start/);
  });

  it('rejects a half-filled range', () => {
    expect(windowError(between('', '2026-08-05T00:00'))).toMatch(/date and time/);
  });

  it('accepts a range that starts and ends in the same minute', () => {
    expect(windowError(between('2026-08-01T00:00', '2026-08-01T00:00'))).toBeUndefined();
  });

  it('has nothing to say about the presets', () => {
    expect(windowError({ ...defaultWindow(), kind: '6h' })).toBeUndefined();
    expect(windowError({ ...defaultWindow(), kind: 'all' })).toBeUndefined();
  });
});

describe('localInputValue', () => {
  it('pads every field, because the input rejects a short one', () => {
    expect(localInputValue(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05T09:07');
  });
});
