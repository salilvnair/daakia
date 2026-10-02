/**
 * The builder is where a determinant is most likely to be saved wrong: a
 * grouping on a hole that a re-paste removed, a switch turned back on by an
 * edit, a question with nothing to group by. These pin the rules it saves by.
 */
import { describe, it, expect } from 'vitest';
import { emptyDraft, draftFrom, withPattern, specOf, draftAsPattern, saveBlocker } from './determinant-draft';
import { fromLoggerCall } from '../k8s/logger-pattern';
import type { CataloguePattern } from '../../store/dk8s-logger-store';

const call = fromLoggerCall('log.info("{} {} -> {} in {}ms", method, path, status, took)')!;

describe('a new draft', () => {
  it('cannot be saved until there is a pattern', () => {
    expect(saveBlocker(emptyDraft())).toMatch(/Paste the call/);
  });

  it('cannot be saved with nothing to group by', () => {
    expect(saveBlocker(withPattern(emptyDraft(), call))).toMatch(/Tick at least one/);
  });

  it('says a pattern with no holes has nothing to group by', () => {
    const none = fromLoggerCall('log.info("started")')!;
    expect(saveBlocker(withPattern(emptyDraft(), none))).toMatch(/no holes/);
  });

  it('saves once something is ticked', () => {
    const d = { ...withPattern(emptyDraft(), call), groupBy: ['path'] };
    expect(saveBlocker(d)).toBeUndefined();
  });
});

describe('a pattern changing under the draft', () => {
  it('keeps the grouping, measure and mix that still exist', () => {
    const d = { ...withPattern(emptyDraft(), call), groupBy: ['method', 'path'], measure: 'took', mix: 'status' };
    const again = fromLoggerCall('log.info("{} {} => {} took {}ms", method, path, status, took)')!;
    const next = withPattern(d, again);
    expect([next.groupBy, next.measure, next.mix]).toEqual([['method', 'path'], 'took', 'status']);
  });

  it('drops the ones that are gone rather than saving a column that never fills', () => {
    const d = { ...withPattern(emptyDraft(), call), groupBy: ['method', 'path'], measure: 'took', mix: 'status' };
    const fewer = fromLoggerCall('log.info("{} {}", method, url)')!;
    const next = withPattern(d, fewer);
    expect([next.groupBy, next.measure, next.mix]).toEqual([['method'], undefined, undefined]);
  });
});

describe('what a draft saves as', () => {
  it('trims the name, and saves no name rather than an empty one', () => {
    const d = { ...withPattern(emptyDraft(), call), groupBy: ['path'], name: '   ' };
    expect(specOf(d).name).toBeUndefined();
    expect(specOf({ ...d, name: ' API calls ' }).name).toBe('API calls');
  });

  it('previews as a catalogue pattern with the scope it will be saved under', () => {
    const d = { ...withPattern(emptyDraft('prod/pay/Deployment/payments'), call), groupBy: ['path'] };
    expect(draftAsPattern(d)).toMatchObject({ scope: 'prod/pay/Deployment/payments', summary: { groupBy: ['path'] } });
  });
});

describe('editing a saved one', () => {
  const saved: CataloguePattern = {
    ...call, id: 'p1', scope: '*', added: 1, marked: true, color: 2,
    summary: { groupBy: ['path'], measure: 'took', name: 'API calls' },
  };

  it('comes back with its name, grouping and scope', () => {
    const d = draftFrom(saved);
    expect([d.id, d.name, d.scope, d.groupBy, d.measure]).toEqual(['p1', 'API calls', '*', ['path'], 'took']);
  });

  it('keeps the columns an old summary had: first seen was always on', () => {
    expect(draftFrom(saved).show.seen).toBe(true);
  });

  it('carries only the pattern itself, never the mark or its colour', () => {
    const d = draftFrom(saved);
    expect(d.pattern).not.toHaveProperty('marked');
    expect(d.pattern).not.toHaveProperty('color');
  });
});
