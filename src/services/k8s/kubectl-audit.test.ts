/**
 * The audit's promise is narrow and has to hold in both directions: the line
 * must be the line that ran — pasteable, unchanged — and a credential must
 * never reach it.
 *
 * Over-redaction fails the same promise. A row whose namespace or pod name has
 * been starred out cannot answer the question the audit exists for, and the
 * screen it feeds is the one people open when dk8s and their terminal
 * disagree.
 */
import { describe, it, expect } from 'vitest';
import { commandLine, describeArgs, kubectlEvent } from './kubectl-audit';

describe('the command line', () => {
  it('is the line you would type', () => {
    expect(commandLine('kubectl', ['--context', 'prod', '-n', 'payments', 'get', 'pods', '-o', 'json']))
      .toBe('kubectl --context prod -n payments get pods -o json');
  });

  it('names the binary, not the path it was found at', () => {
    // `/opt/homebrew/bin/kubectl get pods` is noise; where the binary lives is
    // the setup screen's business, and it says so there.
    expect(commandLine('/opt/homebrew/bin/kubectl', ['--context', 'c', 'get', 'pods']))
      .toBe('kubectl --context c get pods');
    expect(commandLine('C:\\Program Files\\Docker\\kubectl.exe', ['--context', 'c', 'get', 'pods']))
      .toBe('kubectl.exe --context c get pods');
  });

  it('quotes only what a shell would need quoted', () => {
    expect(commandLine('kubectl', ['--context', 'c', 'exec', 'pod', '--', 'sh', '-c', 'ls /var/log']))
      .toBe('kubectl --context c exec pod -- sh -c "ls /var/log"');
  });
});

describe('what is masked', () => {
  it('masks the value behind a credential flag', () => {
    const line = commandLine('kubectl', ['--context', 'c', '--token', 'sha256~AbCdEf123456', 'get', 'pods']);
    expect(line).not.toContain('sha256~AbCdEf123456');
    expect(line).toContain('--token ******');
  });

  it('masks it in the --flag=value spelling too', () => {
    const line = commandLine('kubectl', ['--context', 'c', '--password=hunter2', 'get', 'pods']);
    expect(line).not.toContain('hunter2');
    expect(line).toContain('--password=******');
  });

  it('masks a credential that arrived somewhere no flag list anticipated', () => {
    // A JWT is secret by construction wherever it appears.
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const line = commandLine('kubectl', ['--context', 'c', `--server=https://api?token=${jwt}`, 'get', 'pods']);
    expect(line).not.toContain(jwt);
  });
});

describe('what is deliberately left alone', () => {
  it('keeps the context, the namespace and the pod name', () => {
    /*
      These are the diagnosis. The bug this whole feature was built for — a
      permission check asking the wrong namespace — is invisible in a log that
      masks the namespace.
    */
    const line = commandLine('kubectl', [
      '--context', 'prod-eu', '-n', 'payments',
      'logs', 'ledger-api-7d9c4b8f6-x2mzq', '--tail', '200',
    ]);
    expect(line).toContain('prod-eu');
    expect(line).toContain('payments');
    expect(line).toContain('ledger-api-7d9c4b8f6-x2mzq');
  });

  it('keeps a plain server URL, which is not a secret', () => {
    const line = commandLine('kubectl', ['--context', 'c', '--server=https://api.cluster.internal:6443', 'get', 'pods']);
    expect(line).toContain('https://api.cluster.internal:6443');
  });
});

describe('the summary of an argv', () => {
  it('is the verb and the resource, without the flag values', () => {
    expect(describeArgs(['--context', 'prod', '-n', 'payments', 'get', 'pods', '-o', 'json']))
      .toBe('get pods');
    expect(describeArgs(['--context', 'prod', '-n', 'ns', 'auth', 'can-i', 'get', 'pods/log', '--quiet']))
      .toBe('auth can-i get');
  });
});

describe('the event', () => {
  it('carries the context and namespace as their own fields', () => {
    const e = kubectlEvent('kubectl', ['--context', 'prod', '-n', 'payments', 'get', 'pods'],
      { ok: true, code: 0, bytes: 2048 }, 412);
    expect(e.context).toBe('prod');
    expect(e.namespace).toBe('payments');
    expect(e.ms).toBe(412);
    expect(e.ok).toBe(true);
    expect(e.kind).toBe('run');
  });

  it('reads --namespace as well as -n', () => {
    const e = kubectlEvent('kubectl', ['--context', 'c', '--namespace', 'kube-system', 'get', 'pods'], {}, 1);
    expect(e.namespace).toBe('kube-system');
  });

  it('keeps the first line of what the cluster said, masked', () => {
    const e = kubectlEvent('kubectl', ['--context', 'c', 'get', 'pods'], {
      ok: false, code: 1,
      stderr: 'Error from server (Forbidden): pods is forbidden: User "u" cannot list resource "pods"\nmore detail',
    }, 88);
    expect(e.said).toBe('Error from server (Forbidden): pods is forbidden: User "u" cannot list resource "pods"');
  });

  it('has no output in it, at any size', () => {
    // Sizes, never contents: `get -o json` is somebody's whole pod spec.
    const e = kubectlEvent('kubectl', ['--context', 'c', 'get', 'pods'], { ok: true, bytes: 1_000_000 }, 10);
    expect(JSON.stringify(e)).not.toContain('apiVersion');
    expect(e.bytes).toBe(1_000_000);
  });

  it('marks a stream as one, with no duration to report yet', () => {
    const e = kubectlEvent('kubectl', ['--context', 'c', '-n', 'n', 'get', 'pods', '--watch'], {}, undefined, 'stream');
    expect(e.kind).toBe('stream');
    expect(e.ms).toBeUndefined();
  });
});
