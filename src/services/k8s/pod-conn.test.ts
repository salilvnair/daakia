import { describe, it, expect } from 'vitest';
import { checkConnRequest, connArgs, parseConn, CONN_CHECK } from './pod-conn';

describe('a connectivity test request', () => {
  it('takes an http(s) URL, an optional proxy, and a timeout kept between 1 and 60 seconds', () => {
    expect(checkConnRequest({ url: ' https://api.example.com/health ' })).toEqual({ url: 'https://api.example.com/health', timeoutSeconds: 10 });
    expect(checkConnRequest({ url: 'http://a/', proxy: 'http://proxy:3128', timeoutSeconds: 500 })).toEqual({ url: 'http://a/', proxy: 'http://proxy:3128', timeoutSeconds: 60 });
  });

  it('says what is wrong with anything else', () => {
    expect(checkConnRequest({ url: 'ftp://a/' })).toEqual({ error: 'The URL has to start with http:// or https://.' });
    expect(checkConnRequest({ url: 'http://a b/' })).toEqual({ error: 'That URL does not look right.' });
    expect(checkConnRequest({ url: 'http://a/', proxy: 'socks5://p:1080' })).toEqual({ error: 'The proxy has to start with http:// or https://.' });
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
