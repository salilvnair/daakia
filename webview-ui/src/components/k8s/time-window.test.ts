import { describe, it, expect } from 'vitest';
import {
  windowOptions, windowError, localInputValue, defaultWindow, type TimeWindow,
} from './TimeWindow';

const between = (from: string, to: string): TimeWindow => ({ kind: 'between', from, to });

describe('windowOptions', () => {
  it('leaves a preset relative, so it means the same tomorrow', () => {
    expect(windowOptions({ ...defaultWindow(), kind: '1h' }))
      .toEqual({ sinceSeconds: 3600 });
  });

  it('asks for nothing at all when the window is all time', () => {
    expect(windowOptions({ ...defaultWindow(), kind: 'all' })).toEqual({});
  });

  /*
    These two fields are the reader's own clock, so they resolve through the
    device's zone. The zone the LOG is in is a separate thing entirely and is
    configured beside the mounts — see `log-time.test.ts` on the host, which is
    where a zoneless log line gets turned into an instant.
  */
  it('resolves a between to two absolute instants on the device clock', () => {
    const { fromMs, toMs } = windowOptions(between('2026-08-01T00:00', '2026-08-05T09:05'));
    expect(fromMs).toBe(new Date(2026, 7, 1, 0, 0).getTime());
    expect(toMs).toBe(new Date(2026, 7, 5, 9, 5).getTime() + 59_999);
  });

  it('includes the whole of the end minute', () => {
    // Picking 09:05 and losing 09:05:30 is the kind of gap that gets blamed on
    // the logs rather than on the filter.
    const { toMs } = windowOptions(between('2026-08-01T00:00', '2026-08-05T09:05'));
    expect(toMs!).toBeGreaterThan(new Date(2026, 7, 5, 9, 5, 30).getTime());
    expect(toMs!).toBeLessThan(new Date(2026, 7, 5, 9, 6).getTime());
  });

  it('reads the fields as the device’s own time, the way they are displayed', () => {
    const { fromMs } = windowOptions(between('2026-08-01T13:45', '2026-08-02T00:00'));
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
