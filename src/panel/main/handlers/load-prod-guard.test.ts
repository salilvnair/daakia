/**
 * A load test on a local port that is really a production pod, through a
 * dk8s forward, runs only when the reader confirmed it — checked on the host.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({ workspace: {} }));
let prod: Record<string, unknown> | undefined;
vi.mock('./port-forward-handler', () => ({ prodForwardOnUrl: () => prod }));

import { handleLoadStart } from './load-handler';

describe('the Load Tester and a production forward', () => {
  it('refuses a URL that reaches production unless the run says it is meant', async () => {
    prod = { pod: 'zp-backend-6f5zb', context: 'com-eastus-zp-prod', prod: true };
    const out: Record<string, unknown>[] = [];
    await handleLoadStart({ runId: 1, url: 'http://localhost:18081/actuator/health', vus: 1, durationSeconds: 1 }, m => out.push(m as Record<string, unknown>));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: 'load:error', runId: 1 });
    expect(String(out[0].message)).toContain('com-eastus-zp-prod');
  });
});
