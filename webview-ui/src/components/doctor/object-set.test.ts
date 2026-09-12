import { describe, it, expect } from 'vitest';
import {
  emptySet, filterOf, narrow, backTo, packageStep, classStep, searchStep, isNarrowed,
} from './object-set';

describe('the object set', () => {
  it('starts at everything', () => {
    const s = emptySet();
    expect(filterOf(s)).toBe('');
    expect(isNarrowed(s)).toBe(false);
    expect(s[0].label).toBe('all objects');
  });

  it('applies the last step, not all of them at once', () => {
    /*
      Narrowing from `com.acme` to `com.acme.order.Cart` is a move to a smaller
      set, not a search for something matching both. Concatenating would make
      the second step match nothing, which reads as "there is nothing here"
      rather than "that is not what the step meant".
    */
    const s = narrow(narrow(emptySet(), packageStep('com.acme')), classStep('com.acme.order.Cart'));
    expect(filterOf(s)).toBe('com.acme.order.Cart');
  });

  it('keeps the steps that got you there', () => {
    const s = narrow(narrow(emptySet(), packageStep('com.acme')), classStep('com.acme.Cart'));
    expect(s.map(x => x.label)).toEqual(['all objects', 'package com.acme', 'class Cart']);
  });

  it('goes back to any step, dropping what came after', () => {
    const s = narrow(narrow(emptySet(), packageStep('com.acme')), classStep('com.acme.Cart'));
    const back = backTo(s, 1);
    expect(back).toHaveLength(2);
    expect(filterOf(back)).toBe('com.acme');
  });

  it('treats going back to the root as a reset', () => {
    const s = narrow(emptySet(), classStep('com.acme.Cart'));
    expect(filterOf(backTo(s, 0))).toBe('');
    expect(isNarrowed(backTo(s, 0))).toBe(false);
  });

  it('does not stack a step that repeats the one in effect', () => {
    // Clicking the same class twice is not two decisions.
    const once = narrow(emptySet(), classStep('com.acme.Cart'));
    expect(narrow(once, classStep('com.acme.Cart'))).toBe(once);
  });

  it('names a class by its simple name and filters by its full one', () => {
    // The label is for reading; the filter has to match inner classes too,
    // which is the set someone means when they click `Leak`.
    const step = classStep('com.acme.order.Leak');
    expect(step.label).toBe('class Leak');
    expect(step.filter).toBe('com.acme.order.Leak');
  });

  it('ignores an empty step when working out the filter', () => {
    // Clearing the box should fall back to the step before it, not to nothing.
    const s = narrow(narrow(emptySet(), classStep('com.acme.Cart')), packageStep(''));
    expect(filterOf(s)).toBe('com.acme.Cart');
  });

  it('carries a search as a step like any other', () => {
    const s = narrow(emptySet(), searchStep('byte['));
    expect(filterOf(s)).toBe('byte[');
    expect(s[1].label).toContain('byte[');
  });
});
