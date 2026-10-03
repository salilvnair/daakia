import { describe, it, expect } from 'vitest';
import { parsePortForward, resolveForward, roleOfPort } from './forward-proposal';
import type { PodSummary } from '../../store/k8s-store';

const pod = (name: string, over: Partial<PodSummary> = {}): PodSummary => ({
  name, namespace: 'com-zp-dev', context: 'kind-dk8s-lab', phase: 'Running', deleting: false,
  workload: { kind: 'Deployment', name: name.replace(/-[a-z0-9]+-[a-z0-9]{5}$/, '') },
  ...over,
} as unknown as PodSummary);

describe('parsePortForward', () => {
  it('reads a pod, its ports and its namespace', () => {
    expect(parsePortForward('kubectl -n com-zp-dev port-forward pod/zp-backend-79879f65f7-6f5zb 8080:8080 18081:8081')).toEqual({
      kind: 'pod', name: 'zp-backend-79879f65f7-6f5zb', namespace: 'com-zp-dev', context: undefined,
      ports: [{ local: 8080, remote: 8080 }, { local: 18081, remote: 8081 }],
    });
  });

  it('takes a bare name as a pod, a lone port as both sides, and :port as any local port', () => {
    expect(parsePortForward('kubectl port-forward api-0 8080 :9090')).toMatchObject({
      kind: 'pod', name: 'api-0', ports: [{ local: 8080, remote: 8080 }, { local: 0, remote: 9090 }],
    });
  });

  it('knows deploy/ and svc/, and the --flag=value spelling', () => {
    expect(parsePortForward('kubectl port-forward deployment/zp-backend 8080:8080 --namespace=com-zp-dev')).toMatchObject({ kind: 'deploy', name: 'zp-backend', namespace: 'com-zp-dev' });
    expect(parsePortForward('kubectl port-forward svc/zp-backend 8080:80')).toMatchObject({ kind: 'svc', ports: [{ local: 8080, remote: 80 }] });
  });

  it('is nothing for another command, a flag it does not know, or a port that is not one', () => {
    expect(parsePortForward('kubectl get pods')).toBeUndefined();
    expect(parsePortForward('kubectl port-forward pod/a 8080:8080 --pod-running-timeout=1m')).toBeUndefined();
    expect(parsePortForward('kubectl port-forward pod/a 99999:8080')).toBeUndefined();
    expect(parsePortForward('kubectl port-forward pod/a')).toBeUndefined();
    expect(parsePortForward('kubectl port-forward job/a 8080')).toBeUndefined();
  });
});

describe('resolveForward', () => {
  const pods = [
    pod('zp-backend-79879f65f7-6f5zb'),
    pod('zp-backend-79879f65f7-7gpgz', { phase: 'Pending' }),
    pod('postgres-65b74df64b-6zsnn'),
  ];

  it('finds the watched pod and fills in its cluster, workload and port roles', () => {
    const r = resolveForward(parsePortForward('kubectl port-forward pod/postgres-65b74df64b-6zsnn 15432:5432')!, pods);
    expect(r).toMatchObject({
      ok: true,
      req: { context: 'kind-dk8s-lab', namespace: 'com-zp-dev', pod: 'postgres-65b74df64b-6zsnn', ports: [{ local: 15432, remote: 5432, role: 'postgres' }] },
    });
  });

  it('lands a deployment on a running pod of it', () => {
    const r = resolveForward(parsePortForward('kubectl port-forward deploy/zp-backend 8080:8080')!, pods);
    expect(r.ok && r.req.pod).toBe('zp-backend-79879f65f7-6f5zb');
  });

  it('forwards a Service through a pod of the workload it is named for', () => {
    const r = resolveForward(parsePortForward('kubectl port-forward svc/zp-backend 8080:80')!, pods);
    expect(r).toMatchObject({ ok: true, req: { service: 'zp-backend', pod: 'zp-backend-79879f65f7-6f5zb' }, who: 'svc/zp-backend' });
  });

  it('says so, rather than offering a button, for a pod dk8s is not watching', () => {
    const r = resolveForward(parsePortForward('kubectl port-forward pod/elsewhere-0 8080')!, pods);
    expect(r).toEqual({ ok: false, reason: 'elsewhere-0 is not one of the pods dk8s is watching.' });
  });

  it('asks for -n when the name is in two namespaces', () => {
    const twice = [pod('api-0'), pod('api-0', { namespace: 'com-zp-qa' })];
    expect(resolveForward(parsePortForward('kubectl port-forward api-0 8080')!, twice).ok).toBe(false);
    expect(resolveForward(parsePortForward('kubectl -n com-zp-qa port-forward api-0 8080')!, twice)).toMatchObject({ ok: true, req: { namespace: 'com-zp-qa' } });
  });

  it('a local port left to kubectl becomes the remote one, for the dialog to check', () => {
    const r = resolveForward(parsePortForward('kubectl port-forward pod/postgres-65b74df64b-6zsnn :5432')!, pods);
    expect(r.ok && r.req.ports[0].local).toBe(5432);
  });
});

describe('roleOfPort', () => {
  it('names the ports the host would', () => {
    expect([5005, 5432, 6379, 8104, 12345].map(roleOfPort)).toEqual(['debug', 'postgres', 'redis', 'http', '']);
  });
});
