/**
 * Letting somebody choose the port.
 *
 * The field is typed into by hand, which means it spends most of its life
 * holding something that is not yet a port. What `wantedPort` must never do is
 * let one of those reach `listen()` — `listen(NaN)` binds a random port and
 * reports success, which is the worst possible answer to "start it on 8080".
 */
import { describe, it, expect } from 'vitest';
import { wantedPort } from './mock-server-manager';

describe('wantedPort', () => {
  it('takes a port', () => {
    expect(wantedPort(8080)).toBe(8080);
    expect(wantedPort('8080')).toBe(8080);
    expect(wantedPort(' 3000 ')).toBe(3000);
  });

  it('takes the ends of the range', () => {
    expect(wantedPort(1024)).toBe(1024);
    expect(wantedPort(65535)).toBe(65535);
  });

  it('refuses a privileged port, which needs root everywhere this runs', () => {
    expect(wantedPort(80)).toBeUndefined();
    expect(wantedPort(1023)).toBeUndefined();
  });

  it('refuses 0, which means "any" and is the opposite of asking', () => {
    expect(wantedPort(0)).toBeUndefined();
  });

  it('refuses a port past the end of the range', () => {
    expect(wantedPort(65536)).toBeUndefined();
    expect(wantedPort(99999)).toBeUndefined();
  });

  it('refuses the half-typed states a text box spends its life in', () => {
    expect(wantedPort('')).toBeUndefined();
    expect(wantedPort('   ')).toBeUndefined();
    expect(wantedPort('80a')).toBeUndefined();
    expect(wantedPort(undefined)).toBeUndefined();
    expect(wantedPort(null)).toBeUndefined();
  });

  it('refuses NaN and Infinity by name, because listen() does not', () => {
    expect(wantedPort(NaN)).toBeUndefined();
    expect(wantedPort(Infinity)).toBeUndefined();
    expect(wantedPort('NaN')).toBeUndefined();
  });

  it('refuses a fraction — a port is an integer', () => {
    expect(wantedPort(8080.5)).toBeUndefined();
  });

  it('refuses a negative', () => {
    expect(wantedPort(-8080)).toBeUndefined();
  });
});
