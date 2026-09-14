import { describe, it, expect } from 'vitest';
import { forbiddenReason, readCanI, ACCESS_RULE } from './k8s-access';

describe('forbiddenReason', () => {
  it('reads the real message the API server sends for a denied exec', () => {
    const s = 'Error from server (Forbidden): pods "zp-backend-7f9455548d-xm6kc" is forbidden: '
      + 'User "salil@corp.com" cannot create resource "pods/exec" in API group "" '
      + 'in the namespace "zp-platform"';
    expect(forbiddenReason(s)).toBe('Your account cannot create pods/exec in zp-platform.');
  });

  it('reads a denied get', () => {
    const s = 'Error from server (Forbidden): pods "x" is forbidden: User "u" cannot get '
      + 'resource "pods" in API group "" in the namespace "prod"';
    expect(forbiddenReason(s)).toBe('Your account cannot get pods in prod.');
  });

  it('names an expired credential as something to refresh', () => {
    expect(forbiddenReason('error: You must be logged in to the server (Unauthorized)'))
      .toMatch(/expired/);
  });

  it('says nothing for an error that is not about permission', () => {
    // A missing pod must not be reported as an access problem.
    expect(forbiddenReason('Error from server (NotFound): pods "gone" not found')).toBeUndefined();
    expect(forbiddenReason('')).toBeUndefined();
    expect(forbiddenReason('dial tcp: i/o timeout')).toBeUndefined();
  });

  it('has a rule for every action, phrased so it can be pasted to an admin', () => {
    expect(ACCESS_RULE.exec).toBe('create on pods/exec');
    expect(ACCESS_RULE.logs).toBe('get on pods/log');
    for (const v of Object.values(ACCESS_RULE)) {
      expect(v).toMatch(/^(get|list|create|delete|patch|watch) on /);
    }
  });
});

describe('reading auth can-i', () => {
  it('takes exit 0 as yes', () => {
    expect(readCanI({ ok: true })).toBe(true);
  });

  it('takes a silent non-zero as no', () => {
    // `--quiet` prints nothing for a real refusal. That is the only "no".
    expect(readCanI({ ok: false, stderr: '' })).toBe(false);
    expect(readCanI({ ok: false })).toBe(false);
    expect(readCanI({ ok: false, stderr: ' 	 ' })).toBe(false);
  });

  it('takes anything it said as could-not-tell, not as a refusal', () => {
    /*
      The bug this replaced: every one of these exits 1, and every one of them
      was read as "your account cannot do this" — so a cluster where the user
      was an admin showed a padlock and told them to go and ask for a role they
      already had.
    */
    const talked = [
      'error: You must be logged in to the server (Unauthorized)',
      'Error from server (Forbidden): selfsubjectaccessreviews.authorization.k8s.io is forbidden',
      'error: unknown command "can-i"',
      'Unable to connect to the server: dial tcp: i/o timeout',
      'error: current-context is not set',
      'E0914 02:11:04.118203 exec: executable kubelogin not found',
      'Error: webhook authorizer does not support user impersonation',
      /* Observed on a real cluster: kubectl cannot resolve the resource
         because discovery failed or is restricted, warns, and exits 1. The
         account's actual permission on pods/log is untouched by any of
         that — and the old code called it a refusal. */
      "Warning: the server doesn't have a resource type 'pods'",
    ];
    for (const stderr of talked) {
      expect(readCanI({ ok: false, stderr }), stderr).toBeUndefined();
    }
  });

  it('treats a spawn failure as could-not-tell', () => {
    expect(readCanI({ ok: false, failure: 'spawn kubectl ENOENT' })).toBeUndefined();
    expect(readCanI({ ok: false, failure: 'Command failed: timed out' })).toBeUndefined();
  });
});
