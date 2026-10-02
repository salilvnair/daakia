import { describe, it, expect } from 'vitest';
import { tidySeparators } from './ContextMenu';

type Row = { id: string; separator?: boolean };
const sep = (id: string): Row => ({ id, separator: true });
const item = (id: string): Row => ({ id });

describe('tidySeparators — only between groups', () => {
  it('drops a separator that would open the menu', () => {
    expect(tidySeparators([sep('a'), item('filter'), sep('b'), item('close')]).map(i => i.id))
      .toEqual(['filter', 'b', 'close']);
  });
  it('drops doubles and a trailing one', () => {
    expect(tidySeparators([item('x'), sep('a'), sep('b'), item('y'), sep('c')]).map(i => i.id))
      .toEqual(['x', 'a', 'y']);
  });
});
