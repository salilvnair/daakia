/**
 * What a monitor will accept.
 *
 * Both of these guard the same mistake from different sides: a rule that looks
 * saved but can never run. The URL that started this was the literal string
 * `http`, which was non-empty and therefore fine by the old check.
 */
import { describe, it, expect } from 'vitest';
import { checkMonitorUrl } from './monitor-url';
import {
  checkInterval, formatInterval, toValueUnit, readIntervalSeconds,
  MIN_INTERVAL_SECONDS,
} from './interval';

describe('a URL a monitor can actually check', () => {
  it('rejects the bare word that started this', () => {
    expect(checkMonitorUrl('http').error).toBeTruthy();
  });

  it('names the fix when the scheme is missing', () => {
    /* "Invalid URL" does not tell somebody the fix is four characters at the
       front, and a bare host is the most common thing people type. */
    expect(checkMonitorUrl('api.example.com/health').error).toMatch(/http:\/\/ or https:\/\//);
  });

  it('rejects an empty box', () => {
    expect(checkMonitorUrl('   ').error).toBe('A URL is required.');
  });

  it('rejects a scheme that cannot be polled', () => {
    expect(checkMonitorUrl('ftp://files.example.com').error).toMatch(/ftp/);
    expect(checkMonitorUrl('file:///etc/passwd').error).toBeTruthy();
    expect(checkMonitorUrl('javascript:alert(1)').error).toBeTruthy();
  });

  it('accepts an ordinary https endpoint with no complaint', () => {
    const r = checkMonitorUrl('https://api.example.com/health');
    expect(r.error).toBeNull();
    expect(r.warning).toBeUndefined();
  });

  it('accepts plain http but says what it costs', () => {
    const r = checkMonitorUrl('http://api.example.com/health');
    expect(r.error).toBeNull();
    expect(r.warning).toMatch(/unencrypted/);
  });

  it('does not nag about http on localhost', () => {
    expect(checkMonitorUrl('http://localhost:8080/health').warning).toBeUndefined();
    expect(checkMonitorUrl('http://127.0.0.1:3000/up').warning).toBeUndefined();
  });

  it('ignores surrounding whitespace, which paste leaves behind', () => {
    expect(checkMonitorUrl('  https://api.example.com/health  ').error).toBeNull();
  });
});

describe('how often it runs', () => {
  it("refuses to poll somebody else's service every second", () => {
    expect(checkInterval(1, 's').error).toBeTruthy();
    expect(checkInterval(9, 's').error).toBeTruthy();
    expect(checkInterval(MIN_INTERVAL_SECONDS, 's').error).toBeNull();
  });

  it('reports the problem instead of quietly clamping', () => {
    /* A value rounded up in silence is a monitor running at a rate its owner
       did not choose and cannot see. */
    const r = checkInterval(2, 's');
    expect(r.error).toBeTruthy();
    expect(r.seconds).toBe(2);
  });

  it('converts each unit', () => {
    expect(checkInterval(30, 's').seconds).toBe(30);
    expect(checkInterval(5, 'm').seconds).toBe(300);
    expect(checkInterval(2, 'h').seconds).toBe(7200);
  });

  it('rejects fractions and nonsense', () => {
    expect(checkInterval(1.5, 'm').error).toBe('Whole numbers only.');
    expect(checkInterval(NaN, 'm').error).toBeTruthy();
    expect(checkInterval(0, 'm').error).toBeTruthy();
    expect(checkInterval(-5, 'm').error).toBeTruthy();
  });

  it('stops at a day', () => {
    expect(checkInterval(24, 'h').error).toBeNull();
    expect(checkInterval(25, 'h').error).toBeTruthy();
  });
});

describe('reading an interval back', () => {
  it('shows the shortest form that is still exact', () => {
    expect(formatInterval(90)).toBe('90s');
    expect(formatInterval(120)).toBe('2m');
    expect(formatInterval(3600)).toBe('1h');
    expect(formatInterval(5400)).toBe('90m');
  });

  it('round-trips through the custom control', () => {
    for (const s of [30, 90, 300, 3600, 7200]) {
      const { value, unit } = toValueUnit(s);
      expect(checkInterval(value, unit).seconds).toBe(s);
    }
  });
});

describe('rules written by an older build', () => {
  it('migrates whole minutes to seconds', () => {
    expect(readIntervalSeconds({ intervalMinutes: 5 })).toBe(300);
    expect(readIntervalSeconds({ intervalMinutes: 60 })).toBe(3600);
  });

  it('prefers seconds when both are present', () => {
    expect(readIntervalSeconds({ intervalSeconds: 45, intervalMinutes: 5 })).toBe(45);
  });

  it('falls back to five minutes rather than to zero', () => {
    /* Zero would be a timer that never fires, or one that fires forever. */
    expect(readIntervalSeconds({})).toBe(300);
    expect(readIntervalSeconds({ intervalMinutes: 0 })).toBe(300);
  });
});
