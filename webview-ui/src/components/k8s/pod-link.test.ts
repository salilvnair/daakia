import { describe, it, expect } from 'vitest';
import {
  podLogLink, podLogLinkForOs, parsePodLink, looksLikePodLink, findLinkedLine,
} from './pod-link';

const TARGET = {
  context: 'kind-dk8s-prod',
  namespace: 'orders',
  pod: 'orders-api-668fdd75-frlf6',
  container: 'orders-api',
  ts: 1789649274082,
  text: 'upstream timeout on request 22338',
};

describe('a link to a pod and a line', () => {
  it('survives a round trip', () => {
    expect(parsePodLink(podLogLink(TARGET))).toEqual(TARGET);
  });

  it('reads the same target in either spelling', () => {
    // Somebody sent one form or the other; the reader should not have to care.
    expect(parsePodLink(podLogLinkForOs(TARGET))).toEqual(parsePodLink(podLogLink(TARGET)));
  });

  it('survives the characters that live in log lines', () => {
    const awkward = {
      ...TARGET,
      pod: 'a+b',
      text: 'GET /v1/orders?id=7&x=1 "quoted" 100% #hash',
    };
    expect(parsePodLink(podLogLink(awkward))).toEqual(awkward);
  });

  it('keeps the link short by carrying only the start of a long line', () => {
    const long = { ...TARGET, text: 'x'.repeat(400) };
    const back = parsePodLink(podLogLink(long))!;
    expect(back.text!.length).toBe(160);
    expect(long.text.startsWith(back.text!)).toBe(true);
  });

  it('works for a pod with no line in mind', () => {
    const bare = { context: 'c', namespace: 'n', pod: 'p' };
    expect(parsePodLink(podLogLink(bare))).toEqual({
      ...bare, container: undefined, ts: undefined, text: undefined,
    });
  });

  describe('what it refuses', () => {
    it('ignores anything that is not ours', () => {
      for (const s of ['', 'orders-api', 'https://example.com/x', 'daakia', 'vscode://other/x']) {
        expect(parsePodLink(s)).toBeUndefined();
        expect(looksLikePodLink(s)).toBe(false);
      }
    });

    it('ignores a route it does not know', () => {
      // Guessing at an unknown route opens the wrong screen, which is worse
      // than doing nothing.
      expect(parsePodLink('daakia://dk8s/something?ns=n&pod=p')).toBeUndefined();
    });

    it('refuses a target with no address', () => {
      // "Some pod called this, in whichever namespace" is how somebody ends up
      // reading production while they think they are in the lab.
      expect(parsePodLink('daakia://dk8s/logs?ns=orders')).toBeUndefined();
      expect(parsePodLink('daakia://dk8s/logs?pod=api')).toBeUndefined();
    });

    it('recognises the shape before it parses', () => {
      expect(looksLikePodLink(`  ${podLogLink(TARGET)}  `)).toBe(true);
    });
  });
});

describe('finding the line again', () => {
  const lines = [
    { ts: 100, text: 'request 1 served' },
    { ts: 200, text: 'upstream timeout on request 22338 in orders-api' },
    { ts: 300, text: 'request 2 served' },
    { ts: 400, text: 'upstream timeout on request 22338 in orders-api' },
  ];

  it('picks the one line that carries the text', () => {
    const hit = findLinkedLine(lines, { ...TARGET, ts: undefined, text: 'request 2 served' });
    expect(hit?.ts).toBe(300);
  });

  it('uses the timestamp to choose between repeats', () => {
    // The same message all afternoon: the time decides which one was meant.
    expect(findLinkedLine(lines, { ...TARGET, ts: 390 })?.ts).toBe(400);
    expect(findLinkedLine(lines, { ...TARGET, ts: 150 })?.ts).toBe(200);
  });

  it('falls back to the nearest line in time when the text is gone', () => {
    const hit = findLinkedLine(lines, { ...TARGET, ts: 310, text: 'a line that rotated away' });
    expect(hit?.ts).toBe(300);
  });

  it('has nothing to say about an empty log', () => {
    expect(findLinkedLine([], TARGET)).toBeUndefined();
  });

  it('needs something to go on', () => {
    expect(findLinkedLine(lines, { context: 'c', namespace: 'n', pod: 'p' })).toBeUndefined();
  });
});
