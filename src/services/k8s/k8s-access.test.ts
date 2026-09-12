import { describe, it, expect } from 'vitest';
import { forbiddenReason, ACCESS_RULE } from './k8s-access';

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
