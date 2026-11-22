import { describe, it, expect } from 'vitest';
import { checkConnRequest, connArgs, parseConn, CONN_CHECK } from './pod-conn';

describe('a connectivity test request', () => {
  it('takes an http(s) URL, an optional proxy, and a timeout kept between 1 and 60 seconds', () => {
    expect(checkConnRequest({ url: ' https://api.example.com/health ' })).toEqual({ kind: 'http', url: 'https://api.example.com/health', timeoutSeconds: 10 });
    expect(checkConnRequest({ url: 'http://a/', proxy: 'http://proxy:3128', timeoutSeconds: 500 })).toEqual({ kind: 'http', url: 'http://a/', proxy: 'http://proxy:3128', timeoutSeconds: 60 });
  });

  it('says what is wrong with anything else', () => {
    expect(checkConnRequest({ url: 'ftp://a/' })).toEqual({ error: 'The URL has to start with http:// or https://.' });
    expect(checkConnRequest({ url: 'http://a b/' })).toEqual({ error: 'That URL does not look right.' });
    expect(checkConnRequest({ url: 'http://a/', proxy: 'socks5://p:1080' })).toEqual({ error: 'The proxy has to start with http:// or https://.' });
  });
});

describe('more than a GET', () => {
  it('sends any method, with headers and a body', () => {
    expect(checkConnRequest({ url: 'https://a/orders', method: 'post', headers: [{ key: 'Content-Type', value: 'application/json' }, { key: '', value: 'x' }], body: '{"id":1}' }))
      .toEqual({ kind: 'http', url: 'https://a/orders', timeoutSeconds: 10, method: 'POST', headers: [{ key: 'Content-Type', value: 'application/json' }], body: '{"id":1}' });
  });

  it('refuses a header that could split the request', () => {
    expect(checkConnRequest({ url: 'http://a/', headers: [{ key: 'X-A', value: 'v\r\nEvil: 1' }] })).toEqual({ error: 'The value of X-A has a line break in it.' });
    expect(checkConnRequest({ url: 'http://a/', headers: [{ key: 'Bad Name', value: 'v' }] })).toEqual({ error: '"Bad Name" is not a header name.' });
    expect(checkConnRequest({ url: 'http://a/', method: 'TRACE' })).toEqual({ error: 'TRACE is not a method this test can send.' });
  });

  it('skips certificate checks only for https', () => {
    expect(checkConnRequest({ url: 'https://a/', insecure: true })).toMatchObject({ insecure: true });
    expect(checkConnRequest({ url: 'http://a/', insecure: true })).not.toHaveProperty('insecure');
  });

  it('opens a TCP connection to host:port, or a URL with a known port', () => {
    expect(checkConnRequest({ kind: 'tcp', url: 'postgres.db.svc:5432' })).toEqual({ kind: 'tcp', url: 'postgres.db.svc:5432', timeoutSeconds: 10 });
    expect(checkConnRequest({ kind: 'tcp', url: 'redis://cache:6379', tls: true, insecure: true })).toMatchObject({ kind: 'tcp', tls: true, insecure: true });
    expect(checkConnRequest({ kind: 'tcp', url: 'postgres://db/app' })).toMatchObject({ kind: 'tcp' });
    expect(checkConnRequest({ kind: 'tcp', url: 'db.svc' })).toEqual({ error: 'Add a port: host:port.' });
    expect(checkConnRequest({ kind: 'tcp', url: 'db:70000' })).toEqual({ error: 'The port has to be between 1 and 65535.' });
    expect(checkConnRequest({ kind: 'tcp', url: '[::1]:443' })).toMatchObject({ kind: 'tcp' });
  });

  it('only resolves a name for a DNS lookup', () => {
    expect(checkConnRequest({ kind: 'dns', url: 'kubernetes.default.svc' })).toEqual({ kind: 'dns', url: 'kubernetes.default.svc', timeoutSeconds: 10 });
    expect(checkConnRequest({ kind: 'dns', url: 'not a host' })).toEqual({ error: 'That host does not look right.' });
  });
});

describe('running it', () => {
  it('never puts the URL or the proxy on the command line', () => {
    const args = connArgs({ context: 'c', namespace: 'n', pod: 'p' }, 'python3');
    expect(args).toEqual(['--context', 'c', '-n', 'n', 'exec', '-i', 'p', '--', 'python3', '-c', CONN_CHECK]);
  });

  it('reads the one line of JSON the check prints, or why there is none', () => {
    const ok = '{"url":"http://a/","dns":{"ok":true,"ms":3},"tcp":{"ok":true,"ms":1},"http":{"ok":true,"status":200},"ok":true}';
    expect(parseConn(`noise\n${ok}\n`)).toMatchObject({ ok: true, http: { status: 200 } });
    expect(parseConn('{"fatal":"python 3 is needed"}')).toEqual({ error: 'python 3 is needed' });
    expect(parseConn('', 'error: unable to upgrade connection: container not found')).toEqual({ error: 'error: unable to upgrade connection: container not found' });
  });
});
