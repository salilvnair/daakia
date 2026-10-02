/**
 * An answer streamed on Ask the log's own id lands in its run, is parsed into
 * steps with their lines, and nothing on another id touches it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useDk8sAskLogStore, ASK_LOG_TAB } from './dk8s-ask-log-store';
import type { LogLine } from './k8s-store';

const line = (seq: number, text: string): LogLine => ({ seq, ts: 1000 + seq, level: 'info', text });

function seed() {
  useDk8sAskLogStore.setState({
    activeId: 'r1',
    runs: [{
      id: 'r1', question: 'orderId A-1', window: '10m', scope: 's',
      numbered: new Map([[1, line(1, 'Order A-1 accepted')], [2, line(2, 'Order A-1 rejected')]]),
      total: 2, sent: 2, loggersTouched: [], loggersKnown: 0, startedAt: Date.now(), text: '', streaming: true,
    }],
  });
}

const run = () => useDk8sAskLogStore.getState().runs[0];
const apply = (msg: Record<string, unknown>) => useDk8sAskLogStore.getState().apply({ tabId: ASK_LOG_TAB, ...msg });

describe('the ask-the-log stream', () => {
  beforeEach(seed);

  it('assembles chunks and parses the answer on complete', () => {
    const body = JSON.stringify({
      answer: [{ text: 'A-1 was accepted, then rejected.', cites: [1, 2] }],
      steps: [{ lines: [1], text: 'accepted' }, { lines: [2], text: 'rejected' }],
    });
    apply({ type: 'ai:chunk', delta: body.slice(0, 20) });
    apply({ type: 'ai:chunk', delta: body.slice(20) });
    apply({ type: 'ai:complete', message: {} });
    expect(run().streaming).toBe(false);
    expect(run().answer?.steps.map(s => s.text)).toEqual(['accepted', 'rejected']);
    expect(useDk8sAskLogStore.getState().activeId).toBeUndefined();
  });

  it('ignores the side panel’s stream', () => {
    useDk8sAskLogStore.getState().apply({ tabId: 'dk8s-ai', type: 'ai:chunk', delta: 'nope' });
    expect(run().text).toBe('');
  });

  it('keeps prose as prose when there is no JSON', () => {
    apply({ type: 'ai:complete', message: { content: 'I could not tell.' } });
    expect(run().text).toBe('I could not tell.');
    expect(run().answer).toBeUndefined();
  });

  it('records an error and the redaction note', () => {
    apply({ type: 'dk8s:askLogEvidence', redactionNote: '2 tokens' });
    apply({ type: 'dk8s:askLogError', error: 'There are no lines in this window to read.' });
    expect(run().redactionNote).toBe('2 tokens');
    expect(run().error).toContain('no lines');
  });
});
