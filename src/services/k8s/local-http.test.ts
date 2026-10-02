import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AddressInfo } from 'net';
import { callLocal, downloadLocal } from './local-http';

let server: http.Server;
let port = 0;
let lastBody = '';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      if (req.url === '/actuator/health') { res.setHeader('Content-Type', 'application/json'); res.end('{"status":"UP"}'); return; }
      if (req.url === '/actuator/loggers/com.x' && req.method === 'POST') { lastBody = body; res.statusCode = 204; res.end(); return; }
      if (req.url === '/big') { res.end('x'.repeat(5000)); return; }
      if (req.url === '/actuator/heapdump') { res.end(Buffer.alloc(3000, 7)); return; }
      if (req.url === '/slow') return; // never answers
      res.statusCode = 404; res.end('nope');
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => { server.close(); });

describe('calling a forwarded port', () => {
  it('reads a JSON answer', async () => {
    const r = await callLocal({ port, path: '/actuator/health' });
    expect(r).toMatchObject({ status: 200, body: '{"status":"UP"}' });
    expect(r.contentType).toContain('json');
  });

  it('posts JSON — how a logger level is set', async () => {
    const r = await callLocal({ port, path: '/actuator/loggers/com.x', method: 'POST', json: { configuredLevel: 'DEBUG' } });
    expect(r.status).toBe(204);
    expect(JSON.parse(lastBody)).toEqual({ configuredLevel: 'DEBUG' });
  });

  it('cuts a long answer and says so', async () => {
    const r = await callLocal({ port, path: '/big', maxBytes: 1000 });
    expect(r.body).toHaveLength(1000);
    expect(r.truncated).toBe(true);
  });

  it('says when nothing answers, without throwing', async () => {
    expect((await callLocal({ port, path: '/slow', timeoutMs: 200 })).error).toMatch(/No answer/);
    const closed = await callLocal({ port: 1, path: '/' });
    expect(closed.status).toBe(0);
    expect(closed.error).toBeTruthy();
  });

  it('streams a heap dump to a file, and keeps an error page out of it', async () => {
    const dest = path.join(os.tmpdir(), `daakia-heap-${process.pid}.hprof`);
    const ok = await downloadLocal({ port, path: '/actuator/heapdump', dest });
    expect(ok).toMatchObject({ status: 200, bytes: 3000 });
    expect(fs.statSync(dest).size).toBe(3000);
    fs.unlinkSync(dest);
    const missing = await downloadLocal({ port, path: '/nothing', dest });
    expect(missing).toMatchObject({ status: 404, body: 'nope' });
    expect(fs.existsSync(dest)).toBe(false);
  });
});
