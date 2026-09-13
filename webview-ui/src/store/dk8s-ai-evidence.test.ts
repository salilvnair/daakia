/**
 * "Show what was sent" has to keep meaning it.
 *
 * The panel holds the evidence so an answer can be read against the thing that
 * produced it. The host echoes back what actually left the machine — after
 * redaction — and the panel takes that in preference to the artifact it sent.
 *
 * A follow-up carries no artifact: the model has already been shown the log, so
 * the host echoes an empty string. `?? a.evidence` did not catch that, because
 * '' is not nullish — so the first follow-up on a thread replaced two hundred
 * lines with nothing, and the disclosure expanded to an empty box.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useDk8sAiStore } from './dk8s-ai-store';

const DK8S_AI_TAB = 'dk8s-ai';
const LOG = ['line one', 'line two', 'line three'].join('\n');

function seed() {
  useDk8sAiStore.setState({
    open: true,
    activeId: 'a1',
    activeTurn: undefined,
    answers: [{
      id: 'a1',
      title: 'Summarise this log',
      promptKey: 'dk8s.log.summarise',
      evidence: LOG,
      text: '',
      streaming: true,
      startedAt: Date.now(),
      turns: [],
    }] as never,
  });
}

const evidenceOf = () => useDk8sAiStore.getState().answers[0].evidence;
const apply = (msg: Record<string, unknown>) =>
  useDk8sAiStore.getState().apply({ tabId: DK8S_AI_TAB, ...msg });

beforeEach(seed);

describe('the echo from the host', () => {
  it('replaces the artifact with what actually left', () => {
    apply({ type: 'dk8s:aiEvidence', evidence: 'line one\nline «redacted»' });
    expect(evidenceOf()).toBe('line one\nline «redacted»');
  });

  it('carries the redaction note with it', () => {
    apply({ type: 'dk8s:aiEvidence', evidence: 'x', redactionNote: '1 token removed' });
    expect(useDk8sAiStore.getState().answers[0].redactionNote).toBe('1 token removed');
  });

  it('keeps the evidence when a follow-up echoes an empty string', () => {
    apply({ type: 'dk8s:aiEvidence', evidence: '' });
    expect(evidenceOf()).toBe(LOG);
  });

  it('keeps it for whitespace too, which is the same nothing', () => {
    apply({ type: 'dk8s:aiEvidence', evidence: '   \n  ' });
    expect(evidenceOf()).toBe(LOG);
  });

  it('keeps it when the field is missing altogether', () => {
    apply({ type: 'dk8s:aiEvidence' });
    expect(evidenceOf()).toBe(LOG);
  });

  it('leaves an existing note alone rather than clearing it on an empty echo', () => {
    apply({ type: 'dk8s:aiEvidence', evidence: LOG, redactionNote: '2 keys removed' });
    apply({ type: 'dk8s:aiEvidence', evidence: '' });
    expect(useDk8sAiStore.getState().answers[0].redactionNote).toBe('2 keys removed');
  });

  it('ignores an echo aimed at another tab', () => {
    useDk8sAiStore.getState().apply({ tabId: 'some-other-tab', type: 'dk8s:aiEvidence', evidence: 'nope' });
    expect(evidenceOf()).toBe(LOG);
  });
});
