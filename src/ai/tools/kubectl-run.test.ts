/**
 * What Daakia AI may run against a cluster, and how it is pinned to the one
 * on screen. The failures that matter here are silent: a command that runs
 * against another context, or a `delete` that runs because it was phrased
 * cleverly.
 */
import { describe, it, expect } from 'vitest';
import { tokenize, planKubectl, runKubectlTool, displayCommand, kubectlToModelText } from './kubectl-run';

const scope = { context: 'com-eastus-zp-prod', namespace: 'com-zp-prod', pods: ['zp-ui-5dff4b-hqjcc', 'zp-backend-69fd-7gpgz'] };

describe('reading the command', () => {
  it('splits words and quotes like a shell', () => {
    expect(tokenize(`get pods -l 'app=zp ui'`)).toEqual(['get', 'pods', '-l', 'app=zp ui']);
  });

  it('refuses shell syntax instead of passing it on', () => {
    for (const bad of ['get pods | grep x', 'get pods; delete pod x', 'get pods && rm -rf /', 'get $(whoami)', 'get pods > out']) {
      expect(Array.isArray(tokenize(bad)), bad).toBe(false);
    }
  });
});

describe('what runs', () => {
  it('pins a read to the context and namespace on screen', () => {
    expect(planKubectl('kubectl get pods -o wide', scope)).toEqual({
      run: true, verb: 'get', args: ['--context', 'com-eastus-zp-prod', '-n', 'com-zp-prod', 'get', 'pods', '-o', 'wide'],
    });
  });

  it('keeps a namespace the command names itself', () => {
    const p = planKubectl('get pods -A', scope);
    expect(p.run && p.args).toEqual(['--context', 'com-eastus-zp-prod', 'get', 'pods', '-A']);
  });

  it('caps logs that asked for no limit', () => {
    const p = planKubectl('logs zp-ui-5dff4b-hqjcc', scope);
    expect(p.run && p.args.at(-1)).toBe('--tail=200');
  });

  it('allows rollout status but not rollout restart', () => {
    expect(planKubectl('rollout status deploy/zp-ui', scope).run).toBe(true);
    const restart = planKubectl('rollout restart deploy/zp-ui', scope);
    expect(restart).toMatchObject({ run: false, proposal: true });
  });

  it('never runs a change — it proposes it', () => {
    for (const cmd of ['delete pod zp-ui-5dff4b-hqjcc', 'scale deploy/zp-ui --replicas=0', 'apply -f x.yaml', 'exec -it zp-ui -- sh', 'patch deploy x -p {}']) {
      expect(planKubectl(cmd, scope), cmd).toMatchObject({ run: false, proposal: true });
    }
  });

  it('refuses to point somewhere else', () => {
    for (const cmd of ['get pods --context=other', 'get pods --kubeconfig /tmp/k', 'get pods --as=admin', 'get pods --token=abc']) {
      expect(planKubectl(cmd, scope), cmd).toMatchObject({ run: false, proposal: false });
    }
  });

  it('refuses what never ends', () => {
    expect(planKubectl('logs zp-ui -f', scope).run).toBe(false);
    expect(planKubectl('get pods -w', scope).run).toBe(false);
  });

  it('does not read a secret\'s values, but does describe it', () => {
    expect(planKubectl('get secret db-creds -o yaml', scope).run).toBe(false);
    expect(planKubectl('get secrets -ojson', scope).run).toBe(false);
    expect(planKubectl('describe secret db-creds', scope).run).toBe(true);
  });
});

describe('running it', () => {
  it('runs through the given runner, masks, and links the pods it names', async () => {
    let got: string[] = [];
    const r = await runKubectlTool({ command: 'get pods', why: 'what is running' }, {
      scope,
      run: async (args) => {
        got = args;
        return { ok: true, code: 0, stderr: '', stdout: 'NAME READY\nzp-ui-5dff4b-hqjcc 1/1\ntoken=tok_live_123' };
      },
    });
    expect(got.slice(0, 4)).toEqual(['--context', 'com-eastus-zp-prod', '-n', 'com-zp-prod']);
    expect(r.ok).toBe(true);
    expect(r.output).not.toContain('tok_live_123');
    expect(r.links.map(l => l.pod)).toEqual(['zp-ui-5dff4b-hqjcc']);
    expect(r.command).toBe('kubectl --context com-eastus-zp-prod -n com-zp-prod get pods');
  });

  it('does not call the runner for a proposal, and tells the model it did not run', async () => {
    let called = false;
    const r = await runKubectlTool({ command: 'delete pod x' }, { scope, run: async () => { called = true; return { ok: true, code: 0, stdout: '', stderr: '' }; } });
    expect(called).toBe(false);
    expect(kubectlToModelText(r)).toContain('NOT RUN');
  });

  it('quotes only what needs quoting when it shows the command', () => {
    expect(displayCommand(['get', 'pods', '-l', 'app=zp ui'])).toBe("kubectl get pods -l 'app=zp ui'");
  });
});
