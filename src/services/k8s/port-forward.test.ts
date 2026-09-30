import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import {
  parseForwardLine, portRole, declaredPorts, servicesFor, isProdContext, forwardArgs,
  createForwardManager, nextFreePort,
} from './port-forward';

describe('reading kubectl port-forward', () => {
  it('reads the lines that change a forward', () => {
    expect(parseForwardLine('Forwarding from 127.0.0.1:18081 -> 8081')).toEqual({ kind: 'bound', local: 18081, remote: 8081 });
    expect(parseForwardLine('Forwarding from [::1]:8080 -> 8080')).toEqual({ kind: 'bound', local: 8080, remote: 8080 });
    expect(parseForwardLine('Handling connection for 8080')).toEqual({ kind: 'conn', local: 8080 });
    expect(parseForwardLine('Unable to listen on port 8080: Listeners failed to create').kind).toBe('portTaken');
    expect(parseForwardLine('error: error upgrading connection: pods "x" is forbidden: User "u" cannot create resource "pods/portforward"').kind).toBe('forbidden');
    expect(parseForwardLine('error: unable to forward port because pod is not running. Current status=Pending').kind).toBe('notRunning');
    expect(parseForwardLine('E0928 12:00:01 portforward.go:413] lost connection to pod').kind).toBe('lost');
    expect(parseForwardLine('E0928 an error occurred forwarding 8080 -> 8080: connect: connection refused').kind).toBe('connError');
  });

  it('always binds to this machine only', () => {
    expect(forwardArgs({ context: 'c', namespace: 'n', pod: 'p', ports: [{ local: 18081, remote: 8081 }] }))
      .toEqual(['--context', 'c', '-n', 'n', 'port-forward', 'pod/p', '18081:8081', '--address', '127.0.0.1']);
  });
});

describe('what a port is for', () => {
  it('reads the name first, then the number', () => {
    expect(portRole('management', 8081)).toBe('actuator');
    expect(portRole('jdwp', 9999)).toBe('debug');
    expect(portRole(undefined, 5005)).toBe('debug');
    expect(portRole(undefined, 5432)).toBe('postgres');
    expect(portRole('http', 8080)).toBe('http');
    expect(portRole(undefined, 12345)).toBe('');
    expect(portRole(undefined, 8104)).toBe('http');
  });
});

const POD = {
  metadata: { labels: { app: 'zp-backend', tier: 'api' } },
  spec: { containers: [{ name: 'app', ports: [{ name: 'http', containerPort: 8080 }, { name: 'management', containerPort: 8081 }] }] },
};

describe('the pod spec', () => {
  it('lists declared ports with a role', () => {
    expect(declaredPorts(POD)).toEqual([
      { container: 'app', name: 'http', port: 8080, protocol: 'TCP', role: 'http' },
      { container: 'app', name: 'management', port: 8081, protocol: 'TCP', role: 'actuator' },
    ]);
  });

  it('finds the Services that select it and resolves named target ports', () => {
    const svcs = [
      { metadata: { name: 'zp-backend' }, spec: { type: 'ClusterIP', selector: { app: 'zp-backend' }, ports: [{ port: 80, targetPort: 'http' }] } },
      { metadata: { name: 'other' }, spec: { selector: { app: 'zp-ui' }, ports: [{ port: 80, targetPort: 3000 }] } },
      { metadata: { name: 'external' }, spec: { type: 'ExternalName', ports: [{ port: 443 }] } },
    ];
    expect(servicesFor(POD, svcs)).toEqual([
      { service: 'zp-backend', type: 'ClusterIP', port: 80, name: undefined, targetPort: 'http', containerPort: 8080 },
    ]);
  });
});

describe('production contexts', () => {
  it('matches *prod* by default, case-insensitively', () => {
    expect(isProdContext('com-eastus-zp-prod')).toBe(true);
    expect(isProdContext('PROD-west')).toBe(true);
    expect(isProdContext('docker-desktop')).toBe(false);
    expect(isProdContext('kind-dk8s-lab', ['kind-*'])).toBe(true);
  });
});

describe('picking a local port', () => {
  it('keeps the asked-for port when free, else the next free one', async () => {
    const taken = new Set([8080, 8081]);
    const free = async (p: number) => !taken.has(p);
    expect(await nextFreePort(9000, free)).toBe(9000);
    expect(await nextFreePort(8080, free)).toBe(8082);
    expect(await nextFreePort(8082, free, [8082])).toBe(8083);
  });
});

function fakeProc() {
  const p = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; exitCode: number | null; kill: () => void; killed: boolean };
  p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.exitCode = null; p.killed = false;
  p.kill = () => { p.killed = true; p.exitCode = 0; p.emit('exit', 0); };
  return p;
}
const flush = () => new Promise(r => setTimeout(r, 0));

describe('a forward, start to finish', () => {
  it('goes connecting → forwarding, counts connections, and stops on idle', async () => {
    let t = 1000;
    const proc = fakeProc();
    const m = createForwardManager({ spawn: async () => proc as unknown as ChildProcess, now: () => t, idleMs: 60_000 });
    const f = m.start({ context: 'kind-dk8s-lab', namespace: 'n', pod: 'p', ports: [{ local: 8080, remote: 8080 }, { local: 18081, remote: 8081 }] });
    expect(f.state).toBe('connecting');
    await flush();
    proc.stdout.emit('data', 'Forwarding from 127.0.0.1:8080 -> 8080\n');
    expect(m.list()[0].state).toBe('connecting');
    proc.stdout.emit('data', 'Forwarding from 127.0.0.1:18081 -> 8081\nHandling connection for 8080\n');
    expect(m.list()[0].state).toBe('forwarding');
    expect(m.list()[0].connections).toBe(1);
    t += 61_000; m.tick();
    expect(m.list()[0]).toMatchObject({ state: 'stopped', stopReason: 'idle' });
    expect(proc.killed).toBe(true);
    m.dispose();
  });

  it('marks production and stops it at the limit even when busy', async () => {
    let t = 0;
    const proc = fakeProc();
    const m = createForwardManager({ spawn: async () => proc as unknown as ChildProcess, now: () => t, prodLimitMs: 3_600_000, idleMs: 10 ** 9 });
    m.start({ context: 'com-eastus-zp-prod', namespace: 'n', pod: 'p', ports: [{ local: 8080, remote: 8080 }] });
    await flush();
    proc.stdout.emit('data', 'Forwarding from 127.0.0.1:8080 -> 8080\n');
    expect(m.list()[0].prod).toBe(true);
    t = 3_600_000; proc.stdout.emit('data', 'Handling connection for 8080\n'); m.tick();
    expect(m.list()[0]).toMatchObject({ state: 'stopped', stopReason: 'limit' });
    m.dispose();
  });

  it('fails with the reason kubectl gave', async () => {
    const proc = fakeProc();
    const m = createForwardManager({ spawn: async () => proc as unknown as ChildProcess });
    m.start({ context: 'c', namespace: 'n', pod: 'p', ports: [{ local: 8080, remote: 8080 }] });
    await flush();
    proc.stderr.emit('data', 'error: error upgrading connection: pods "p" is forbidden: cannot create resource "pods/portforward"\n');
    expect(m.list()[0].state).toBe('failed');
    expect(m.list()[0].error).toMatch(/pods\/portforward/);
    m.dispose();
  });

  it('kills every running forward on dispose', async () => {
    const procs = [fakeProc(), fakeProc()];
    let i = 0;
    const m = createForwardManager({ spawn: async () => procs[i++] as unknown as ChildProcess });
    m.start({ context: 'c', namespace: 'n', pod: 'a', ports: [{ local: 1, remote: 1 }] });
    m.start({ context: 'c', namespace: 'n', pod: 'b', ports: [{ local: 2, remote: 2 }] });
    await flush();
    m.dispose();
    expect(procs.every(p => p.killed)).toBe(true);
  });
});
