import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { openSource, parseSymbol } from './open-source';

/*
  Resolved against this repository, so the expectations are ground truth rather
  than a recorded output. `OrderLoad.java` is the graded workload beside the
  JFR fixtures, and the profiler's own findings point into it.
*/
const ROOT = join(__dirname, '../..');

describe('parseSymbol', () => {
  it('reads the shapes a caller will actually paste', () => {
    // Each of these is copied from a different dk8s view.
    expect(parseSymbol('com.acme.Order')).toMatchObject({ simpleName: 'Order' });
    expect(parseSymbol('com.acme.Order.submit')).toMatchObject({ simpleName: 'Order', method: 'submit' });
    expect(parseSymbol('Order.submit:42')).toMatchObject({ simpleName: 'Order', method: 'submit', line: 42 });
    expect(parseSymbol('com.acme.Order.submit(Order.java:42)')).toMatchObject({
      simpleName: 'Order', method: 'submit', line: 42,
    });
  });

  it('tells a method from a package by its case, which is all there is to go on', () => {
    expect(parseSymbol('com.acme.order.Order').method).toBeUndefined();
    expect(parseSymbol('com.acme.Order.submit').method).toBe('submit');
  });

  it('unwraps the JVM descriptor forms', () => {
    expect(parseSymbol('com/acme/Order')).toMatchObject({ simpleName: 'Order' });
    expect(parseSymbol('Lcom/acme/Order;')).toMatchObject({ simpleName: 'Order' });
    expect(parseSymbol('com.acme.Order$Item')).toMatchObject({ simpleName: 'Order' });
  });
});

describe('openSource', () => {
  it('takes a line straight from an allocation site', () => {
    // What the allocation view actually prints.
    const { hits } = openSource(ROOT, 'OrderLoad.validateSlow:92');
    expect(hits[0].relative).toMatch(/OrderLoad\.java$/);
    expect(hits[0].line).toBe(92);
    expect(hits[0].preview).toContain('report +=');
  });

  it('finds the declaration when only a method is named', () => {
    /*
      The case that makes this worth having. A hot spot row says
      `OrderLoad$LedgerCache.post` with no line, and the answer is the line the
      method is declared on — which no other tool in the chain can produce.
    */
    const { hits } = openSource(ROOT, 'OrderLoad.enrich');
    expect(hits[0].line).toBeGreaterThan(0);
    expect(hits[0].preview).toContain('enrich');
  });

  it('says a runtime class has no source rather than searching for one', () => {
    const { hits, note } = openSource(ROOT, 'java.util.ArrayList');
    expect(hits).toEqual([]);
    expect(note).toMatch(/runtime class/);
  });

  it('says so when nothing matches, instead of returning an empty answer', () => {
    const { hits, note } = openSource(ROOT, 'com.acme.NoSuchThing');
    expect(hits).toEqual([]);
    expect(note).toMatch(/No file named NoSuchThing/);
  });

  it('reports when the file was found but the method was not', () => {
    // Better than a bare file: it says which half of the question failed.
    const { note } = openSource(ROOT, 'OrderLoad.methodThatIsNotThere');
    expect(note).toMatch(/not a declaration of methodThatIsNotThere/);
  });

  it('refuses a symbol with no class in it', () => {
    expect(openSource(ROOT, '   ').note).toMatch(/looks like a class name/);
  });
});
