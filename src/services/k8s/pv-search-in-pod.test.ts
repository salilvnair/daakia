/**
 * Turning grep's output back into search results.
 *
 * The fragile part is not the grep — it is the reassembly. `grep -C` hands
 * back a flat list of lines from several files, marked only by a line number,
 * and a result needs them grouped, ordered, and joined to the hit they belong
 * to. Every case here is a shape the live archive in `pvfix` produced.
 */
import { describe, it, expect } from 'vitest';
import { groupByFile, neighbours, levelFor, rootsFor, cutoffFor } from './pv-search-in-pod';
import type { PvMatch as GrepLine } from './pv-in-pod';
import type { PvLogConfig } from './pv-logs';
import type { SearchOptions } from './k8s-log-search';

const ROOT = '/prodapp-prod-pvc/prodapp_prod_logs';
const LIVE = `${ROOT}/prodapp.log`;
const OLD = `${ROOT}/archive/prodapp-2026-09-14.log`;

function line(file: string, n: number, text: string, context = false): GrepLine {
  return { file, rel: file.slice(ROOT.length + 1), line: n, text, ...(context ? { context } : {}) };
}

describe('grouping grep output by file', () => {
  it('keeps two files apart', () => {
    const by = groupByFile([line(LIVE, 4, 'a'), line(OLD, 9, 'b')]);
    expect([...by.keys()]).toEqual([LIVE, OLD]);
    expect(by.get(LIVE)!.get(4)!.text).toBe('a');
  });

  it('prefers the hit when a line arrives twice', () => {
    /* With overlapping context windows grep prints the same line as somebody
       else's neighbour and as a hit of its own. Keeping the neighbour copy
       would drop the match. */
    const by = groupByFile([line(LIVE, 7, 'boom', true), line(LIVE, 7, 'boom')]);
    expect(by.get(LIVE)!.get(7)!.context).toBeUndefined();
  });

  it('does not let the hit be overwritten by a later context copy', () => {
    const by = groupByFile([line(LIVE, 7, 'boom'), line(LIVE, 7, 'boom', true)]);
    expect(by.get(LIVE)!.get(7)!.context).toBeUndefined();
  });
});

describe('the lines either side of a hit', () => {
  const file = groupByFile([
    line(LIVE, 8, 'eight', true),
    line(LIVE, 9, 'nine', true),
    line(LIVE, 10, 'HIT'),
    line(LIVE, 11, 'eleven', true),
    line(LIVE, 12, 'twelve', true),
  ]).get(LIVE)!;

  it('reads upward in reading order, not in the order it walked', () => {
    expect(neighbours(file, 10, 2, -1)).toEqual(['eight', 'nine']);
  });

  it('reads downward', () => {
    expect(neighbours(file, 10, 2, 1)).toEqual(['eleven', 'twelve']);
  });

  it('gives back only what grep actually returned', () => {
    expect(neighbours(file, 10, 5, -1)).toEqual(['eight', 'nine']);
  });

  it('stops at a gap rather than stepping over it', () => {
    /* Lines shown as consecutive have to be consecutive. Skipping the hole
       would present line 6 as if it sat directly above line 10. */
    const sparse = groupByFile([
      line(LIVE, 6, 'six', true),
      line(LIVE, 9, 'nine', true),
      line(LIVE, 10, 'HIT'),
    ]).get(LIVE)!;
    expect(neighbours(sparse, 10, 3, -1)).toEqual(['nine']);
  });

  it('is empty when no context was asked for', () => {
    expect(neighbours(file, 10, 0, -1)).toEqual([]);
  });
});

describe('the level of a line on its own', () => {
  it('takes the level the line declares', () => {
    expect(levelFor('2026-09-14 ERROR boom', [])).toBe('error');
    expect(levelFor('2026-09-14 WARN careful', [])).toBe('warn');
  });

  it('gives a stack frame the level of the event above it', () => {
    /* A matched frame reported at no level at all is the difference between
       seeing an error and seeing grey text. */
    expect(levelFor('\tat com.acme.Checkout.pay(Checkout.java:42)',
      ['2026-09-14 ERROR boom'])).toBe('error');
  });

  it('takes the nearest level above, not the first', () => {
    expect(levelFor('\tat com.acme.X.y(X.java:1)',
      ['2026-09-14 ERROR first', '2026-09-14 WARN nearer'])).toBe('warn');
  });

  it('calls a bare frame an error when nothing above declared anything', () => {
    // A trace is what continuation lines nearly always are.
    expect(levelFor('\tat com.acme.X.y(X.java:1)', ['no level here'])).toBe('error');
  });

  it('leaves an ordinary timestamped line alone', () => {
    expect(levelFor('2026-09-14 06:32:25 something happened',
      ['2026-09-14 ERROR boom'])).toBe('other');
  });
});

describe('which roots a pod is asked about', () => {
  const cfg = (mounts: { path: string; namespace?: string }[]): PvLogConfig =>
    ({ enabled: true, mounts } as PvLogConfig);
  const ref = { namespace: 'pvfix', pod: 'prodapp-bc8f7bf84-mhz5f', context: 'kind-dk8s-prod' };

  it('takes the configured paths', () => {
    expect(rootsFor(cfg([{ path: ROOT }]), ref)).toEqual([ROOT]);
  });

  it('refuses a path that is not one inside a container', () => {
    /* The bug the whole in-pod move came from: a Windows path here used to be
       resolved against this machine and searched. */
    expect(rootsFor(cfg([{ path: 'C:\\logs' }, { path: 'logs' }]), ref)).toEqual([]);
  });

  it('asks about each path once, however many rows name it', () => {
    expect(rootsFor(cfg([{ path: ROOT }, { path: `${ROOT}/` }]), ref)).toEqual([ROOT]);
  });

  it('leaves out a mount scoped to another namespace', () => {
    expect(rootsFor(cfg([{ path: ROOT, namespace: 'orders' }]), ref)).toEqual([]);
  });
});

describe('the lower edge of the window', () => {
  const opts = (o: Partial<SearchOptions>) => o as SearchOptions;

  it('is the absolute start when one was given', () => {
    expect(cutoffFor(opts({ fromMs: 1_700_000_000_000 }))).toBe(1_700_000_000_000);
  });

  it('prefers the absolute start over a preset', () => {
    // "Between the 1st and the 5th" has to beat "last 6 hours".
    expect(cutoffFor(opts({ fromMs: 42, sinceSeconds: 3600 }))).toBe(42);
  });

  it('is nothing at all when neither was given', () => {
    expect(cutoffFor(opts({}))).toBeUndefined();
    expect(cutoffFor(opts({ sinceSeconds: 0 }))).toBeUndefined();
  });
});
