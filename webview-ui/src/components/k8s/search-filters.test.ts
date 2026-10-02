import { describe, it, expect } from 'vitest';
import { searchFilterOf, sourceKey } from './search-results';
import { buildMatcher, filterLines, keepAround } from './log-view';
import type { LogLine } from '../../store/k8s-store';

describe('the search term in the filter box', () => {
  it('keeps a regex a regex, and case where the search kept it', () => {
    expect(searchFilterOf('timeout|refused', true, false)).toBe('/timeout|refused/i');
    expect(buildMatcher(searchFilterOf('timeout|refused', true, false))!('Read TIMEOUT after 30s')).toBeTruthy();
    expect(searchFilterOf('Timeout', false, true)).toBe('/Timeout/');
    expect(buildMatcher(searchFilterOf('Timeout', false, true))!('read timeout')).toBeNull();
    expect(buildMatcher(searchFilterOf('a.b (x)', false, true))!('see a.b (x) here')).toBeTruthy();
    expect(searchFilterOf('timeout', false, false)).toBe('timeout');
    expect(searchFilterOf('', true, true)).toBe('');
  });

  it('tells a live line from an archived one with the same number', () => {
    const live = sourceKey({ pod: 'api-0', source: 'live' }, 12);
    const archived = sourceKey({ pod: 'api-0', source: 'archive', rel: 'logs/app.log.1' }, 12);
    expect(live).not.toBe(archived);
  });
});

describe('context around a hit', () => {
  const line = (seq: number, pod: string, text: string) => ({ seq, pod, level: 'info', text }) as LogLine & { pod: string };

  it('stays inside the pod the hit came from', () => {
    const lines = [line(1, 'a', 'a one'), line(2, 'a', 'a two'), line(3, 'a', 'a ERROR'), line(4, 'b', 'b one'), line(5, 'b', 'b two')];
    const shown = filterLines(lines, { query: 'ERROR', levels: [], contextLines: 2 });
    expect(shown.map(l => l.text)).toEqual(['a one', 'a two', 'a ERROR']);
  });

  it('still takes neighbours from both sides within one log', () => {
    const lines = [1, 2, 3, 4, 5].map(i => ({ seq: i, level: 'info', text: i === 3 ? 'boom' : `line ${i}` }) as LogLine);
    expect(filterLines(lines, { query: 'boom', levels: [], contextLines: 1 }).map(l => l.text)).toEqual(['line 2', 'boom', 'line 4']);
  });
});

describe('±N around the hits a page marks', () => {
  const l = (seq: number, pod: string, hit: boolean) => ({ seq, pod, level: 'info', text: `${pod} ${seq}`, context: hit ? undefined : true }) as LogLine & { pod: string; context?: boolean };
  const lines = [l(1, 'a', false), l(2, 'a', false), l(3, 'a', true), l(4, 'a', false), l(5, 'b', false), l(6, 'b', true)];
  const isHit = (x: { context?: boolean }) => !x.context;

  it('shows the hits alone at 0, and their neighbours in the same pod at ±N', () => {
    expect(keepAround(lines, isHit, 0).map(x => x.seq)).toEqual([3, 6]);
    const two = keepAround(lines, isHit, 2);
    expect(two.map(x => x.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(two.filter(x => !x.context).map(x => x.seq)).toEqual([3, 6]);
    /* a's hit does not reach into b, nor b's into a */
    expect(keepAround(lines, isHit, 1).map(x => x.seq)).toEqual([2, 3, 4, 5, 6]);
  });
});
