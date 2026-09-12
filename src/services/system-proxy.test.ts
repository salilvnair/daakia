import { describe, it, expect } from 'vitest';
import {
  parseHostPort, parseWindowsProxyServer, parseWindowsOverride, decodeConnectionFlags,
} from './system-proxy';
import {
  parsePacResult, shExpMatch, isPlainHostName, dnsDomainIs, localHostOrDomainIs,
  isInNet, dnsDomainLevels, evaluatePac, wpadCandidates,
} from './pac';

describe('parseHostPort', () => {
  it('takes a bare host:port, a URL, and a host on its own', () => {
    expect(parseHostPort('proxy.corp:3128')).toEqual({ host: 'proxy.corp', port: 3128 });
    expect(parseHostPort('http://proxy.corp:8080')).toEqual({ host: 'proxy.corp', port: 8080 });
    expect(parseHostPort('proxy.corp')).toEqual({ host: 'proxy.corp', port: 80 });
    expect(parseHostPort('https://proxy.corp')).toEqual({ host: 'proxy.corp', port: 443 });
  });

  it('drops credentials from the host rather than smuggling them in', () => {
    expect(parseHostPort('http://user:pass@proxy.corp:3128'))
      .toEqual({ host: 'proxy.corp', port: 3128 });
  });

  it('returns nothing for junk', () => {
    expect(parseHostPort('')).toBeUndefined();
    expect(parseHostPort('   ')).toBeUndefined();
  });
});

describe('parseWindowsProxyServer', () => {
  it('treats a bare value as the proxy for everything', () => {
    expect(parseWindowsProxyServer('proxy.corp:8080')).toEqual({
      http: { host: 'proxy.corp', port: 8080 },
      https: { host: 'proxy.corp', port: 8080 },
    });
  });

  it('splits the per-scheme form', () => {
    // Reading this as a hostname is how a machine ends up resolving "http=a".
    const r = parseWindowsProxyServer('http=a.corp:80;https=b.corp:443;ftp=c.corp:21');
    expect(r.http).toEqual({ host: 'a.corp', port: 80 });
    expect(r.https).toEqual({ host: 'b.corp', port: 443 });
  });

  it('uses the http entry for https when only http is named', () => {
    const r = parseWindowsProxyServer('http=a.corp:80');
    expect(r.https).toEqual({ host: 'a.corp', port: 80 });
  });
});

describe('parseWindowsOverride', () => {
  it('splits on semicolons and expands <local>', () => {
    expect(parseWindowsOverride('*.corp;10.*;<local>'))
      .toEqual(['*.corp', '10.*', 'localhost', '127.0.0.1', '::1']);
  });
  it('survives an empty value', () => {
    expect(parseWindowsOverride('')).toEqual([]);
  });
});

describe('decodeConnectionFlags', () => {
  it('reads the three modes out of the flags byte', () => {
    // 9 = 0x01 | 0x08 — what a machine with only "Automatically detect
    // settings" turned on actually stores.
    expect(decodeConnectionFlags(9)).toEqual({ manual: false, pac: false, wpad: true });
    expect(decodeConnectionFlags(0x03)).toEqual({ manual: true, pac: false, wpad: false });
    expect(decodeConnectionFlags(0x05)).toEqual({ manual: false, pac: true, wpad: false });
    expect(decodeConnectionFlags(0x0f)).toEqual({ manual: true, pac: true, wpad: true });
  });
});

describe('PAC helpers', () => {
  it('shExpMatch globs, and does not let a dot match anything', () => {
    expect(shExpMatch('www.corp.com', '*.corp.com')).toBe(true);
    expect(shExpMatch('www.corp.com', '*.other.com')).toBe(false);
    // A regex-unescaped '.' would make this true.
    expect(shExpMatch('wwwXcorp.com', 'www.corp.com')).toBe(false);
  });

  it('isPlainHostName is the intranet short-name test', () => {
    expect(isPlainHostName('wiki')).toBe(true);
    expect(isPlainHostName('wiki.corp.com')).toBe(false);
  });

  it('dnsDomainIs and localHostOrDomainIs', () => {
    expect(dnsDomainIs('www.corp.com', '.corp.com')).toBe(true);
    expect(dnsDomainIs('www.other.com', '.corp.com')).toBe(false);
    expect(localHostOrDomainIs('www', 'www.corp.com')).toBe(true);
    expect(localHostOrDomainIs('other', 'www.corp.com')).toBe(false);
  });

  it('isInNet does real masking', () => {
    expect(isInNet('10.1.2.3', '10.0.0.0', '255.0.0.0')).toBe(true);
    expect(isInNet('11.1.2.3', '10.0.0.0', '255.0.0.0')).toBe(false);
    expect(isInNet('192.168.1.9', '192.168.1.0', '255.255.255.0')).toBe(true);
    // 255.255.255.255 would overflow a signed shift if built carelessly.
    expect(isInNet('255.255.255.255', '255.255.255.255', '255.255.255.255')).toBe(true);
    expect(isInNet('not-an-ip', '10.0.0.0', '255.0.0.0')).toBe(false);
  });

  it('dnsDomainLevels counts dots', () => {
    expect(dnsDomainLevels('a.b.c')).toBe(2);
    expect(dnsDomainLevels('a')).toBe(0);
  });
});

describe('parsePacResult', () => {
  it('reads a preference list in order', () => {
    const r = parsePacResult('PROXY a.corp:8080; PROXY b.corp:8080; DIRECT');
    expect(r.proxies).toEqual([
      { host: 'a.corp', port: 8080, type: 'http' },
      { host: 'b.corp', port: 8080, type: 'http' },
    ]);
    expect(r.direct).toBe(true);
  });

  it('marks SOCKS as SOCKS rather than pretending it is HTTP', () => {
    const r = parsePacResult('SOCKS5 s.corp:1080');
    expect(r.proxies).toEqual([{ host: 's.corp', port: 1080, type: 'socks' }]);
  });

  it('handles DIRECT alone, and junk', () => {
    expect(parsePacResult('DIRECT')).toMatchObject({ direct: true, proxies: [] });
    expect(parsePacResult('')).toMatchObject({ direct: false, proxies: [] });
    expect(parsePacResult('NONSENSE')).toMatchObject({ direct: false, proxies: [] });
  });
});

describe('evaluatePac', () => {
  const script = `
    function FindProxyForURL(url, host) {
      if (isPlainHostName(host)) return "DIRECT";
      if (shExpMatch(host, "*.internal.corp")) return "DIRECT";
      if (isInNet(dnsResolve(host) || "0.0.0.0", "10.0.0.0", "255.0.0.0")) return "DIRECT";
      return "PROXY gateway.corp:3128; DIRECT";
    }`;

  it('runs a realistic script and follows each branch', () => {
    expect(evaluatePac(script, 'http://wiki/', 'wiki').direct).toBe(true);
    expect(evaluatePac(script, 'http://a.internal.corp/', 'a.internal.corp').direct).toBe(true);
    const out = evaluatePac(script, 'https://api.example.com/v1', 'api.example.com');
    expect(out.proxies[0]).toEqual({ host: 'gateway.corp', port: 3128, type: 'http' });
  });

  it('uses the address handed in for dnsResolve', () => {
    const r = evaluatePac(script, 'http://svc.example.com/', 'svc.example.com', {
      resolved: { 'svc.example.com': '10.4.5.6' },
    });
    expect(r.direct).toBe(true);
    expect(r.proxies).toEqual([]);
  });

  it('cannot reach anything outside the sandbox', () => {
    // The script is untrusted input from the network.
    const probe = `function FindProxyForURL(u, h) {
      return (typeof process === "undefined" && typeof require === "undefined")
        ? "DIRECT" : "PROXY leaked:1";
    }`;
    expect(evaluatePac(probe, 'http://x/', 'x').direct).toBe(true);
  });

  it('stops a runaway script instead of hanging the host', () => {
    const spin = 'function FindProxyForURL(u, h) { while (true) {} }';
    expect(() => evaluatePac(spin, 'http://x/', 'x', { timeoutMs: 150 })).toThrow();
  });
});

describe('wpadCandidates', () => {
  it('walks up the domain, and always tries the bare name first', () => {
    expect(wpadCandidates('box.eng.corp.example.com')).toEqual([
      'http://wpad/wpad.dat',
      'http://wpad.eng.corp.example.com/wpad.dat',
      'http://wpad.corp.example.com/wpad.dat',
      'http://wpad.example.com/wpad.dat',
    ]);
  });

  it('does not invent a domain for an unqualified hostname', () => {
    expect(wpadCandidates('laptop')).toEqual(['http://wpad/wpad.dat']);
  });
});
