/**
 * How far back the Commands screen reads.
 *
 * A stored preference is a string that came out of SQLite, so every way it can
 * be absent or wrong has to land somewhere sensible — the screen has no other
 * way to decide how much to ask for.
 */
import { describe, it, expect } from 'vitest';
import { commandAuditLimit, DEFAULT_COMMAND_AUDIT_LIMIT } from './CommandAuditLimit';

describe('the limit', () => {
  it('is the stored number when there is one', () => {
    expect(commandAuditLimit('1000')).toBe(1000);
  });

  it('falls back when nothing was ever chosen', () => {
    expect(commandAuditLimit(undefined)).toBe(DEFAULT_COMMAND_AUDIT_LIMIT);
  });

  it('falls back on anything that is not a number', () => {
    expect(commandAuditLimit('')).toBe(DEFAULT_COMMAND_AUDIT_LIMIT);
    expect(commandAuditLimit('lots')).toBe(DEFAULT_COMMAND_AUDIT_LIMIT);
  });

  it('will not read nothing, or the whole table', () => {
    /*
      A zero renders an empty screen that looks broken, and an unbounded read
      is the pause this setting exists to avoid — the audit holds every kubectl
      dk8s has ever run.
    */
    expect(commandAuditLimit('0')).toBe(50);
    expect(commandAuditLimit('-10')).toBe(50);
    expect(commandAuditLimit('999999')).toBe(5000);
  });
});
