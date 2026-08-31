/**
 * Facets over fields a format named.
 *
 * The previous version of this file tested a pile of heuristics that read
 * structure out of raw text. Those heuristics are gone — see the header of
 * log-facets.ts — but the cases they were written for are still the cases that
 * matter, so they are kept here pointed at the new input: lines that already
 * carry the fields a host-side format parsed.
 *
 * The garbage values named in the "does not invent" block are real. They came
 * out of the running app, and every one of them is a jar tag from inside a
 * Spring Boot stack frame.
 */
import { describe, it, expect } from 'vitest';
import { buildFacets, filterTermFor, FACET_LABEL } from './log-facets';

/** A parsed event, as the host now delivers it. */
const ev = (thread?: string, logger?: string, app?: string) => ({ thread, logger, app });

/** A continuation — a stack frame — which carries no fields at all. */
const frame = () => ({});

describe('buildFacets', () => {
  const lines = [
    ev('dk8s-traffic', 'com.zapper.zp.ledger.LedgerClient', 'zp-backend'),
    ev('dk8s-traffic', 'com.zapper.zp.order.OrderController', 'zp-backend'),
    ev('http-nio-8080-exec-3', 'com.zapper.zp.ledger.LedgerClient', 'zp-backend'),
  ];

  it('groups values and counts them', () => {
    const threads = buildFacets(lines).find(f => f.field === 'thread');
    expect(threads?.values).toEqual([
      { value: 'dk8s-traffic', count: 2 },
      { value: 'http-nio-8080-exec-3', count: 1 },
    ]);
  });

  it('puts the loudest value first', () => {
    const loggers = buildFacets(lines).find(f => f.field === 'logger');
    expect(loggers?.values[0]).toEqual({ value: 'com.zapper.zp.ledger.LedgerClient', count: 2 });
  });

  it('reports how many events the counts came from', () => {
    // So the UI can say "of 3 shown" rather than implying a total.
    expect(buildFacets(lines)[0]!.scanned).toBe(3);
  });

  /*
    One value means the filter cannot change what is on screen. Every line here
    carries the same application name.
  */
  it('drops a field that has only one value', () => {
    expect(buildFacets(lines).map(f => f.field)).not.toContain('app');
  });

  it('keeps a field once a second value appears', () => {
    const mixed = [...lines, ev('dk8s-traffic', 'com.zapper.zp.ledger.LedgerClient', 'zp-ledger')];
    expect(buildFacets(mixed).map(f => f.field)).toContain('app');
  });

  it('labels each field for the menu', () => {
    expect(buildFacets(lines).map(f => f.label))
      .toEqual([FACET_LABEL.thread, FACET_LABEL.logger]);
  });

  it('caps how many values a submenu can offer', () => {
    const many = Array.from({ length: 200 }, (_, i) => ev(`pool-thread-${i}`, 'com.acme.Foo'));
    expect(buildFacets(many, 20).find(f => f.field === 'thread')!.values).toHaveLength(20);
  });

  it('does not throw on an empty buffer', () => {
    expect(buildFacets([])).toEqual([]);
  });
});

describe('buildFacets — it does not invent', () => {
  /*
    THE regression. These values appeared in the live Thread name submenu when
    this module read raw text:

        hibernate-core-6.6.4.Final.jar!/:6.6.4.Final, na:na, app.jar:1.0.0

    They are jar tags inside stack frames. A frame now carries no fields, so
    there is nothing left for them to come from.
  */
  it('offers nothing from lines that carry no fields', () => {
    expect(buildFacets([frame(), frame(), frame()])).toEqual([]);
  });

  it('ignores frames mixed in among real events', () => {
    const mixed = [
      ev('main', 'com.example.Foo'),
      frame(),                          // ~[app.jar:1.0.0]
      frame(),                          // ~[na:na]
      ev('worker-1', 'com.example.Foo'),
      frame(),                          // ~[hibernate-core-6.6.4.Final.jar!/:6.6.4.Final]
    ];
    const threads = buildFacets(mixed).find(f => f.field === 'thread');
    expect(threads?.values.map(v => v.value)).toEqual(['main', 'worker-1']);
    expect(threads?.scanned).toBe(2);
  });

  /*
    With no format configured no line carries fields, so the menu is empty.
    That is the intended outcome: it is precisely the state in which the old
    code guessed hardest and was wrong most.
  */
  it('offers nothing at all when no format is configured', () => {
    expect(buildFacets(Array.from({ length: 50 }, () => ({})))).toEqual([]);
  });

  it('counts a field only on the lines that actually carried it', () => {
    // A pattern may name a logger but not a thread; the thread filter must not
    // appear on the strength of a field nothing supplies.
    const loggerOnly = [ev(undefined, 'com.a.A'), ev(undefined, 'com.b.B')];
    expect(buildFacets(loggerOnly).map(f => f.field)).toEqual(['logger']);
  });
});

describe('filterTermFor', () => {
  /*
    A thread called `main` appears inside `domain`, `remaining`, and any
    message containing the word. The brackets are already in the line, so
    matching them is both more precise and still a plain substring search.
  */
  it('brackets a thread name so it cannot match inside a word', () => {
    expect(filterTermFor('thread', 'main')).toBe('[main]');
  });

  it('leaves a logger alone — it is already distinctive', () => {
    expect(filterTermFor('logger', 'com.example.Foo')).toBe('com.example.Foo');
  });
});
