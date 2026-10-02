// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { setFilterProvider, clearFilterProvider, getFilterMenu, type FilterMenu } from './filter-provider';

const menu = (id: string): FilterMenu => ({ groups: [{ id, label: id, options: [] }] });

describe('Filter By with logs side by side', () => {
  it('asks the pane that was right-clicked, not the one mounted last', () => {
    const left = document.createElement('div');
    const right = document.createElement('div');
    const line = document.createElement('span');
    left.appendChild(line);
    const fromLeft = () => menu('left');
    const fromRight = () => menu('right');
    setFilterProvider(fromLeft, left);
    setFilterProvider(fromRight, right);

    expect(getFilterMenu(line)?.groups[0].id).toBe('left');
    expect(getFilterMenu(right)?.groups[0].id).toBe('right');
    /* Nowhere in particular: the newest view, as before. */
    expect(getFilterMenu()?.groups[0].id).toBe('right');

    clearFilterProvider(fromRight);
    expect(getFilterMenu(right)?.groups[0].id).toBe('left');
    clearFilterProvider(fromLeft);
    expect(getFilterMenu(line)).toBeNull();
  });

  it('takes the innermost view when one sits inside another', () => {
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    const line = document.createElement('span');
    outer.appendChild(inner);
    inner.appendChild(line);
    const a = () => menu('inner');
    const b = () => menu('outer');
    setFilterProvider(a, inner);
    setFilterProvider(b, outer);
    expect(getFilterMenu(line)?.groups[0].id).toBe('inner');
    clearFilterProvider(a);
    clearFilterProvider(b);
  });
});
