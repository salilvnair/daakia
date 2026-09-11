import { describe, it, expect } from 'vitest';
import {
  CONDENSE_MS, condense, strandKey, threadOf, weave,
  type ThreadComment, type ThreadEvent,
} from './thread';

const c = (createdAt: string, body = 'x'): ThreadComment => ({ createdAt, body });
const e = (at: string, text = 'did a thing'): ThreadEvent => ({ kind: 'label', at, text });

/** What the thread reads as, top to bottom. */
const order = (s: ReturnType<typeof weave>) =>
  s.map(x => (x.kind === 'comment'
    ? `c:${x.comment.body}`
    : `e:${x.events.map(e => e.text).join(' + ')}`));

describe('weave', () => {
  it('puts an event that happened before a comment before it', () => {
    const out = weave([c('2026-09-09T12:00:00Z', 'after')], [e('2026-09-09T11:00:00Z', 'before')]);
    expect(order(out)).toEqual(['e:before', 'c:after']);
  });

  it('and one that happened after, after — which is what was wrong', () => {
    const out = weave([c('2026-09-09T10:00:00Z', 'first')], [e('2026-09-09T11:00:00Z', 'later')]);
    expect(order(out)).toEqual(['c:first', 'e:later']);
  });

  it('interleaves a real thread rather than grouping by type', () => {
    const out = weave(
      [c('2026-09-09T10:30:00Z', 'why'), c('2026-09-09T12:30:00Z', 'fixed')],
      [e('2026-09-09T10:00:00Z', 'labelled'), e('2026-09-09T11:00:00Z', 'assigned')],
    );
    expect(order(out)).toEqual(['e:labelled', 'c:why', 'e:assigned', 'c:fixed']);
  });

  it('keeps an undated item where it was instead of sending it to the top', () => {
    const out = weave([], [
      e('2026-09-09T10:00:00Z', 'first'),
      { kind: 'label', text: 'no timestamp' },
      e('2026-09-09T12:00:00Z', 'third'),
    ]);
    expect(order(out)).toEqual(['e:first', 'e:no timestamp', 'e:third']);
  });

  it('does not let an undated first event outrank a dated comment wrongly', () => {
    /* Nothing before it to inherit from, so it sorts to 0 and leads — which is
       the honest answer when GitHub told us nothing about when it happened. */
    const out = weave([c('2026-09-09T10:00:00Z', 'said')], [{ kind: 'label', text: 'unknown' }]);
    expect(order(out)).toEqual(['e:unknown', 'c:said']);
  });

  it('puts the event first on an exact tie', () => {
    const t = '2026-09-09T10:00:00Z';
    expect(order(weave([c(t, 'said')], [e(t, 'labelled')]))).toEqual(['e:labelled', 'c:said']);
  });

  it('keeps two events that tie in the order GitHub sent them', () => {
    const t = '2026-09-09T10:00:00Z';
    const out = weave([], [e(t, 'one'), e(t, 'two'), e(t, 'three')]);
    expect(order(out)).toEqual(['e:one', 'e:two', 'e:three']);
  });

  it('survives a timestamp that is not a date', () => {
    const out = weave([], [e('2026-09-09T10:00:00Z', 'ok'), { kind: 'label', at: 'later', text: 'junk' }]);
    expect(order(out)).toEqual(['e:ok', 'e:junk']);
  });

  it('handles either list being empty', () => {
    expect(weave([], [])).toEqual([]);
    expect(order(weave([c('2026-09-09T10:00:00Z', 'only')], []))).toEqual(['c:only']);
    expect(order(weave([], [e('2026-09-09T10:00:00Z', 'only')]))).toEqual(['e:only']);
  });

  it('loses nothing', () => {
    const out = weave([c('2026-09-09T10:00:00Z'), c('2026-09-09T11:00:00Z')],
                      [e('2026-09-09T10:30:00Z')]);
    expect(out).toHaveLength(3);
  });
});

describe('strandKey', () => {
  it('tells two comments posted in the same second apart', () => {
    const out = weave([c('2026-09-09T10:00:00Z', 'one'), c('2026-09-09T10:00:00Z', 'two')], []);
    expect(new Set(out.map(strandKey)).size).toBe(2);
  });

  it('tells a comment from an event', () => {
    const t = '2026-09-09T10:00:00Z';
    const out = weave([c(t)], [e(t)]);
    expect(new Set(out.map(strandKey)).size).toBe(2);
  });
});

/*
  Condensing, which is what github.com does and dkgh did not: one person's
  label add and label remove a minute apart are one row there and were two
  rows here.
*/
const ev = (at: string, text: string, actor = 'sal', kind = 'label'): ThreadEvent =>
  ({ kind, actor, at, text });

describe('condense', () => {
  it('merges one person’s two label changes into a row', () => {
    const out = threadOf([], [
      ev('2026-09-09T10:00:00Z', 'added'),
      ev('2026-09-09T10:00:30Z', 'removed'),
    ]);
    expect(order(out)).toEqual(['e:added + removed']);
  });

  it('keeps two different people apart', () => {
    const out = threadOf([], [
      ev('2026-09-09T10:00:00Z', 'added', 'sal'),
      ev('2026-09-09T10:00:30Z', 'removed', 'octocat'),
    ]);
    expect(order(out)).toEqual(['e:added', 'e:removed']);
  });

  it('keeps two different kinds apart — they share no verb', () => {
    const out = threadOf([], [
      ev('2026-09-09T10:00:00Z', 'added', 'sal', 'label'),
      ev('2026-09-09T10:00:30Z', 'moved', 'sal', 'project'),
    ]);
    expect(order(out)).toEqual(['e:added', 'e:moved']);
  });

  it('does not merge across a comment — somebody spoke in between', () => {
    const out = threadOf(
      [c('2026-09-09T10:00:15Z', 'why')],
      [ev('2026-09-09T10:00:00Z', 'added'), ev('2026-09-09T10:00:30Z', 'removed')],
    );
    expect(order(out)).toEqual(['e:added', 'c:why', 'e:removed']);
  });

  it('does not merge two visits an hour apart', () => {
    const out = threadOf([], [
      ev('2026-09-09T10:00:00Z', 'added'),
      ev('2026-09-09T11:00:00Z', 'removed'),
    ]);
    expect(order(out)).toEqual(['e:added', 'e:removed']);
  });

  it('merges a run of more than two', () => {
    const out = threadOf([], [
      ev('2026-09-09T10:00:00Z', 'one'),
      ev('2026-09-09T10:00:10Z', 'two'),
      ev('2026-09-09T10:00:20Z', 'three'),
    ]);
    expect(order(out)).toEqual(['e:one + two + three']);
  });

  it('takes the time of the latest event in the row', () => {
    const out = threadOf([], [
      ev('2026-09-09T10:00:00Z', 'added'),
      ev('2026-09-09T10:05:00Z', 'removed'),
    ]);
    expect(out[0].at).toBe(Date.parse('2026-09-09T10:05:00Z'));
  });

  it('loses no event, however it groups them', () => {
    const events = [
      ev('2026-09-09T10:00:00Z', 'a'), ev('2026-09-09T10:00:10Z', 'b'),
      ev('2026-09-09T12:00:00Z', 'c', 'octocat'),
    ];
    const out = threadOf([], events);
    const flat = out.flatMap(s => (s.kind === 'event' ? s.events : []));
    expect(flat).toHaveLength(3);
  });

  it('leaves comments exactly as they were', () => {
    const out = condense(weave([c('2026-09-09T10:00:00Z', 'one'),
                                c('2026-09-09T10:00:05Z', 'two')], []));
    expect(order(out)).toEqual(['c:one', 'c:two']);
  });

  it('has a window long enough for a triage sitting', () => {
    expect(CONDENSE_MS).toBeGreaterThanOrEqual(5 * 60_000);
  });
});
