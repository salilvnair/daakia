import { describe, it, expect } from 'vitest';
import { parseLogTime, zonedToUtcMs } from './log-time';

/*
  These are the cases that made the bug invisible: every one of them looks
  correct on its own, and only the pairing of a log and a reader in different
  zones shows the error.
*/

describe('parseLogTime', () => {
  it('reads a zoneless line in the log’s configured zone', () => {
    expect(parseLogTime('2026-08-30 06:32:25 INFO up', 'UTC'))
      .toBe(Date.parse('2026-08-30T06:32:25Z'));
  });

  it('reads the same line differently when the log is in another zone', () => {
    // The whole point: a server on CST writing 06:32:25 means 11:32:25 UTC.
    expect(parseLogTime('2026-08-30 06:32:25 INFO up', 'America/Chicago'))
      .toBe(Date.parse('2026-08-30T11:32:25Z'));
  });

  it('takes an explicit offset as written and ignores the setting', () => {
    // A line that names its own zone is already unambiguous; the configured
    // zone must not be allowed to shift it.
    const withZ = parseLogTime('2026-08-30T06:32:25Z INFO up', 'Asia/Kolkata');
    expect(withZ).toBe(Date.parse('2026-08-30T06:32:25Z'));
    const withOffset = parseLogTime('2026-08-30T06:32:25+05:30 INFO up', 'UTC');
    expect(withOffset).toBe(Date.parse('2026-08-30T01:02:25Z'));
  });

  it('keeps sub-second precision', () => {
    expect(parseLogTime('2026-08-30 06:32:25.123 INFO up', 'UTC'))
      .toBe(Date.parse('2026-08-30T06:32:25.123Z'));
  });

  it('accepts a comma as the decimal separator, as some frameworks write it', () => {
    expect(parseLogTime('2026-08-30 06:32:25,123 INFO up', 'UTC'))
      .toBe(Date.parse('2026-08-30T06:32:25.123Z'));
  });

  it('has nothing to say about a line with no timestamp', () => {
    expect(parseLogTime('\tat com.acme.Thing.run(Thing.java:42)', 'UTC')).toBeUndefined();
    expect(parseLogTime('Caused by: java.lang.IllegalStateException', 'UTC')).toBeUndefined();
  });

  it('defaults to UTC, which is what a container writes unless told otherwise', () => {
    expect(parseLogTime('2026-08-30 06:32:25 INFO up'))
      .toBe(Date.parse('2026-08-30T06:32:25Z'));
  });
});

describe('zonedToUtcMs', () => {
  it('uses the offset in force on the day, not the one in force today', () => {
    // Chicago is UTC-5 in August and UTC-6 in January.
    expect(zonedToUtcMs('2026-08-01 00:00:00', 'America/Chicago'))
      .toBe(Date.parse('2026-08-01T05:00:00Z'));
    expect(zonedToUtcMs('2026-01-15 00:00:00', 'America/Chicago'))
      .toBe(Date.parse('2026-01-15T06:00:00Z'));
  });

  it('handles a zone that is not a whole number of hours from UTC', () => {
    expect(zonedToUtcMs('2026-08-01 00:00:00', 'Asia/Kolkata'))
      .toBe(Date.parse('2026-07-31T18:30:00Z'));
  });
});
