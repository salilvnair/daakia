/**
 * How 15D words a number that is still moving.
 *
 * The projection is rounded hard on purpose. A figure accurate to the second
 * visibly disagrees with itself every page, and "about a minute" is the claim
 * the arithmetic can actually support.
 */
import { describe, it, expect } from 'vitest';
import { group, leftToGo } from './GhHarvest';

describe('group', () => {
  it('separates thousands, so a four-figure count is readable at a glance', () => {
    expect(group(2140)).toBe('2,140');
    expect(group(1320)).toBe('1,320');
  });

  it('leaves small numbers alone', () => {
    expect(group(7)).toBe('7');
  });
});

describe('leftToGo', () => {
  it('rounds seconds to ten, because the estimate is not worth more', () => {
    expect(leftToGo(38)).toBe('about 40 seconds left');
    expect(leftToGo(42)).toBe('about 40 seconds left');
  });

  it('switches to minutes past a minute and a half', () => {
    expect(leftToGo(75)).toBe('about 80 seconds left');
    expect(leftToGo(120)).toBe('about 2 minutes left');
  });

  it('says one minute in the singular, rather than rounding 90s up to two', () => {
    expect(leftToGo(90)).toBe('about 1 minute left');
    expect(leftToGo(119)).toBe('about 1 minute left');
  });

  it('says nothing rather than "0 seconds left"', () => {
    expect(leftToGo(0)).toBe('');
    expect(leftToGo(undefined)).toBe('');
    expect(leftToGo(-4)).toBe('');
  });
});
