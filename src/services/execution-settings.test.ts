import { describe, it, expect } from 'vitest';
import {
  resolveExecutionSettings, applyQueryEncoding, countOverrides, hasOverrides,
  type ExecutionSettings,
} from './execution-settings';
import { DEFAULT_PROXY } from './proxy-config';

const proxy = (host: string) => ({ ...DEFAULT_PROXY, mode: 'manual' as const, host, port: 3128 });

describe('resolveExecutionSettings', () => {
  it('falls back to the shipped defaults when nothing is set', () => {
    const r = resolveExecutionSettings();
    expect(r.timeout).toBe(0);
    expect(r.followRedirects).toBe(true);
    expect(r.sslVerification).toBe(true);
    expect(r.encoding).toBe('enable');
    expect(r.from.timeout).toBe('default');
  });

  it('lets the request win over the collection, and the collection over global', () => {
    const r = resolveExecutionSettings(
      { timeout: 5_000, followRedirects: false },
      { timeout: 30_000 },
      { timeout: 60_000 },
    );
    expect(r.timeout).toBe(60_000);
    expect(r.from.timeout).toBe('request');
    // Untouched by the two inner levels, so it still comes from global.
    expect(r.followRedirects).toBe(false);
    expect(r.from.followRedirects).toBe('global');
  });

  it('inherits per field, so pinning one setting does not freeze the rest', () => {
    // The whole reason overrides are per field. A request that pins a timeout
    // must still follow a proxy that is changed globally afterwards.
    const req: ExecutionSettings = { timeout: 60_000 };
    const before = resolveExecutionSettings({ proxy: proxy('old.corp') }, undefined, req);
    const after = resolveExecutionSettings({ proxy: proxy('new.corp') }, undefined, req);
    expect(before.proxy?.host).toBe('old.corp');
    expect(after.proxy?.host).toBe('new.corp');
    expect(after.timeout).toBe(60_000);
  });

  it('treats 0 and false as real values, not as absent', () => {
    // `timeout: 0` means "no timeout". A `||` chain would silently replace it
    // with the global value, which is the opposite of what was asked for.
    const r = resolveExecutionSettings(
      { timeout: 30_000, followRedirects: true, sslVerification: true },
      undefined,
      { timeout: 0, followRedirects: false, sslVerification: false },
    );
    expect(r.timeout).toBe(0);
    expect(r.followRedirects).toBe(false);
    expect(r.sslVerification).toBe(false);
    expect(r.from.timeout).toBe('request');
  });

  it('treats null as absent, since JSON round-trips can produce it', () => {
    const r = resolveExecutionSettings(
      { timeout: 30_000 },
      { timeout: null as unknown as number },
    );
    expect(r.timeout).toBe(30_000);
    expect(r.from.timeout).toBe('global');
  });

  it('ignores a proxy object with no mode, but honours mode "none"', () => {
    const blank = resolveExecutionSettings(
      { proxy: proxy('corp') }, { proxy: {} as never },
    );
    expect(blank.proxy?.host).toBe('corp');

    // Explicitly opting one request out of the corporate proxy.
    const off = resolveExecutionSettings(
      { proxy: proxy('corp') }, undefined, { proxy: { ...DEFAULT_PROXY, mode: 'none' } },
    );
    expect(off.proxy?.mode).toBe('none');
    expect(off.from.proxy).toBe('request');
  });

  it('counts what a level pins', () => {
    expect(countOverrides(undefined)).toBe(0);
    expect(hasOverrides({})).toBe(false);
    expect(countOverrides({ timeout: 0, sslVerification: false })).toBe(2);
    expect(countOverrides({ proxy: {} as never })).toBe(0);
    expect(countOverrides({ proxy: proxy('c') })).toBe(1);
  });
});

describe('applyQueryEncoding', () => {
  it('leaves a URL with no query alone', () => {
    expect(applyQueryEncoding('https://api.test/v1/users', 'enable'))
      .toBe('https://api.test/v1/users');
  });

  it('encodes reserved characters in values', () => {
    expect(applyQueryEncoding('https://api.test/s?q=a,b&t=x:y', 'enable'))
      .toBe('https://api.test/s?q=a%2Cb&t=x%3Ay');
  });

  it('sends values exactly as typed when disabled', () => {
    // The escape hatch: APIs that 404 on %2C and want a literal comma.
    expect(applyQueryEncoding('https://api.test/s?ids=1,2,3', 'disable'))
      .toBe('https://api.test/s?ids=1,2,3');
  });

  it('does not double-encode under auto', () => {
    // The bug `auto` exists for: %20 must not become %2520.
    expect(applyQueryEncoding('https://api.test/s?q=hello%20world', 'auto'))
      .toBe('https://api.test/s?q=hello%20world');
    expect(applyQueryEncoding('https://api.test/s?q=hello world', 'auto'))
      .toBe('https://api.test/s?q=hello%20world');
  });

  it('never touches the path', () => {
    // Re-encoding a path can change which resource is addressed.
    expect(applyQueryEncoding('https://api.test/a b/c?q=d e', 'enable'))
      .toBe('https://api.test/a b/c?q=d%20e');
  });

  it('keeps the fragment out of it', () => {
    expect(applyQueryEncoding('https://api.test/s?q=a b#frag ment', 'enable'))
      .toBe('https://api.test/s?q=a%20b#frag ment');
  });

  it('survives a stray percent that is not an escape', () => {
    // decodeURIComponent throws on '%zz'; the value must still go out.
    expect(applyQueryEncoding('https://api.test/s?q=100%', 'enable'))
      .toBe('https://api.test/s?q=100%25');
  });

  it('handles a key with no value, and an empty pair', () => {
    expect(applyQueryEncoding('https://api.test/s?flag&&q=1', 'enable'))
      .toBe('https://api.test/s?flag&&q=1');
  });
});
