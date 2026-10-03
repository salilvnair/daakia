import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({ workspace: {} }));
const probed: string[] = [];
vi.mock('./http-probe', async (orig) => ({
  ...(await orig<typeof import('./http-probe')>()),
  probe: async (p: { url: string }) => { probed.push(p.url); return { status: 200, statusText: 'OK', ms: 1, bytes: 0, redirects: 0 }; },
}));
vi.mock('./port-forward-handler', () => ({
  prodForwardRefusal: (url: string) => (url.includes(':18081') ? 'Not sent: production' : undefined),
}));

import { handleBulkRun } from './bulk-handler';

describe('the Bulk URL Tester and a production forward', () => {
  it('reports that URL as not sent and runs the others', async () => {
    const out: Record<string, unknown>[] = [];
    await handleBulkRun({ runId: 1, urls: 'http://localhost:18081/actuator/health\nhttp://localhost:8080/ok', concurrency: 1 }, m => out.push(m as Record<string, unknown>));
    expect(probed).toEqual(['http://localhost:8080/ok']);
    expect(out.find(m => m.type === 'bulk:result' && m.statusText === 'Not sent')).toMatchObject({ error: 'Not sent: production' });
  });

  it('sends it when the run says so', async () => {
    probed.length = 0;
    await handleBulkRun({ runId: 2, urls: 'http://localhost:18081/actuator/health', concurrency: 1, prodConfirmed: true }, () => {});
    expect(probed).toEqual(['http://localhost:18081/actuator/health']);
  });
});
