/**
 * A port somebody typed is not a port we may quietly swap.
 *
 * With no request, `startMockServer` walks the range looking for a free port
 * and retries a few times because check-then-bind is racy. Neither of those is
 * right for a fixed port: retrying a busy port binds the same busy port five
 * times and then reports `EADDRINUSE`, which reads as a bug rather than as
 * "8080 is taken by something else".
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as net from 'net';
import { startMockServer, stopMockServer } from './mock-server-manager';
import type { MockServerConfig } from './mock-types';

function config(id: string, requestedPort?: number): MockServerConfig {
  return {
    id, name: id, description: '', protocol: 'rest', routes: [], requestedPort,
  } as MockServerConfig;
}

/** Hold a port the way another process would. */
function occupy(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

const started: string[] = [];
const held: net.Server[] = [];

afterEach(async () => {
  for (const id of started.splice(0)) await stopMockServer(id);
  for (const srv of held.splice(0)) await new Promise(r => srv.close(() => r(null)));
});

describe('a mock server with a port of its own', () => {
  it('listens on exactly the port it was given', async () => {
    const { port } = await startMockServer(config('fixed-ok', 8791));
    started.push('fixed-ok');
    expect(port).toBe(8791);
  });

  it('says which port is taken, rather than reporting EADDRINUSE', async () => {
    held.push(await occupy(8792));
    await expect(startMockServer(config('fixed-busy', 8792)))
      .rejects.toThrow(/8792 is already in use/);
  });

  it('names the way out, because the reader has three of them', async () => {
    held.push(await occupy(8793));
    await expect(startMockServer(config('fixed-busy-2', 8793)))
      .rejects.toThrow(/turn the fixed-port setting off/);
  });

  it('does not silently fall back to a free port', async () => {
    held.push(await occupy(8794));
    await expect(startMockServer(config('fixed-no-fallback', 8794))).rejects.toThrow();
  });

  it('still finds one for a server that asked for nothing', async () => {
    const { port } = await startMockServer(config('auto'));
    started.push('auto');
    expect(port).toBeGreaterThan(0);
  });
});
