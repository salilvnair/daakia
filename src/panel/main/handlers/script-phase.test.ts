import { describe, it, expect, vi, beforeEach } from 'vitest';

const runScript = vi.fn();
const sessions: MockSession[] = [];

class MockSession {
  breakpoints: number[] = [];
  conditions: Record<number, string> = {};
  /** What `run` will resolve with — set by whichever test made this session. */
  static result: unknown = null;
  constructor(public callbacks: Record<string, (arg: unknown) => void>, public phase: string) {
    sessions.push(this);
  }
  setBreakpoints(lines: number[]) { this.breakpoints = lines; }
  setConditions(c: Record<number, string>) { this.conditions = c; }
  run() { return Promise.resolve(MockSession.result); }
}

vi.mock('../../../services/script-runtime', () => ({ runScript: (...a: unknown[]) => runScript(...a) }));
vi.mock('../../../services/debugger', () => ({ DebugSession: MockSession }));

const { runPhase, debugFor, noScript } = await import('./script-phase');

function ctx() {
  return {
    request: { method: 'GET', url: 'http://x', headers: {}, body: '' },
    environmentVariables: {},
    collectionVariables: {},
    globalVariables: {},
  } as never;
}

function result(over: Record<string, unknown> = {}) {
  return {
    success: true, logs: [], errors: [], structuredLogs: [],
    updatedEnvironmentVars: { t: 'set-by-script' },
    updatedCollectionVars: {}, updatedGlobalVars: {}, updatedSecretVars: {},
    testResults: [], subRequests: [], duration: 1, ...over,
  };
}

describe('one pipeline for every protocol', () => {
  beforeEach(() => { runScript.mockReset(); sessions.length = 0; MockSession.result = result(); });

  it('does nothing, loudly, when there is no script', async () => {
    const out = await runPhase('   ', ctx(), 'pre-request');
    expect(out.ok).toBe(true);
    expect(runScript).not.toHaveBeenCalled();
    expect(out).toEqual(noScript(ctx()));
  });

  it('carries what the script set back to the caller', async () => {
    runScript.mockResolvedValue(result());
    const c = ctx();
    const out = await runPhase('dk.env.set("t", "set-by-script")', c, 'pre-request');
    expect(out.layers.env).toEqual({ t: 'set-by-script' });
    // In place, because the post-response phase runs against the same context.
    expect((c as { environmentVariables: unknown }).environmentVariables).toEqual({ t: 'set-by-script' });
  });

  it('keeps the variables a failing script managed to set', async () => {
    runScript.mockResolvedValue(result({ success: false, errors: ['boom'] }));
    const out = await runPhase('x', ctx(), 'pre-request');
    expect(out.ok).toBe(false);
    expect(out.layers.env).toEqual({ t: 'set-by-script' });
  });

  it('stamps the phase onto logs and sub-requests', async () => {
    runScript.mockResolvedValue(result({
      structuredLogs: [{ level: 'log', args: ['hi'], timestamp: 1 }],
      subRequests: [{ method: 'GET', url: 'http://y' }],
    }));
    const out = await runPhase('x', ctx(), 'post-response');
    expect(out.consoleLogs[0].scriptPhase).toBe('post-response');
    expect(out.subRequests[0].phase).toBe('post-response');
  });

  describe('breakpoints, for all four protocols and not just REST', () => {
    it('runs under a debug session when the phase has breakpoints', async () => {
      MockSession.result = result();
      const posted: { type: string }[] = [];
      const out = await runPhase('x', ctx(), 'pre-request', {
        lines: [3, 7], conditions: { 3: 'i > 1' },
        postMessage: (m) => posted.push(m as { type: string }), tabId: 't1',
      });

      expect(runScript).not.toHaveBeenCalled();
      expect(sessions[0].breakpoints).toEqual([3, 7]);
      expect(sessions[0].conditions).toEqual({ 3: 'i > 1' });
      expect(posted.map(p => p.type)).toEqual(['scriptDebug:started', 'scriptDebug:completed']);
      expect(out.ok).toBe(true);
      // Cleared, or the next step/stop message would reach a dead session.
      expect(globalThis.__daakiaDebugSession).toBeNull();
    });

    it('reports a stop as stopped, not as an error', async () => {
      MockSession.result = result({ success: false, errors: ['__DEBUG_STOPPED__'] });
      const out = await runPhase('x', ctx(), 'pre-request', {
        lines: [1], postMessage: () => {}, tabId: 't1',
      });
      expect(out.stopped).toBe(true);
    });

    it('runs normally when the reader set no breakpoint in THIS phase', async () => {
      runScript.mockResolvedValue(result());
      await runPhase('x', ctx(), 'pre-request', { lines: [], postMessage: () => {}, tabId: 't1' });
      expect(runScript).toHaveBeenCalled();
      expect(sessions).toHaveLength(0);
    });
  });
});

describe('reading the breakpoints off the message', () => {
  const msg = {
    debugBreakpoints: {
      preRequest: [2], postResponse: [9],
      preRequestConditions: { 2: 'a' }, postResponseConditions: { 9: 'b' },
    },
  };

  it('picks the ones belonging to the phase', () => {
    expect(debugFor(msg, 'pre-request', () => {}, 't')).toMatchObject({ lines: [2], conditions: { 2: 'a' } });
    expect(debugFor(msg, 'post-response', () => {}, 't')).toMatchObject({ lines: [9], conditions: { 9: 'b' } });
  });

  it('is undefined when that phase has none', () => {
    expect(debugFor({ debugBreakpoints: { preRequest: [1] } }, 'post-response', () => {}, 't')).toBeUndefined();
    expect(debugFor({ debugBreakpoints: { preRequest: [] } }, 'pre-request', () => {}, 't')).toBeUndefined();
    expect(debugFor({}, 'pre-request', () => {}, 't')).toBeUndefined();
  });
});
