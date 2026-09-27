import { describe, expect, it } from 'vitest';
import { bandFill } from './ribbon-layout';

describe('bandFill — a block drawn in the share each level has', () => {
  it('an empty block is a faint slot', () => {
    expect(bandFill({ count: 0 })).toBe('var(--color-surface-border)');
  });

  it('a calm block has no red in it', () => {
    expect(bandFill({ count: 25, errors: 0, warns: 0 })).not.toContain('linear-gradient');
  });

  it('one error among twenty-five lines is a sliver, not a red block', () => {
    const fill = bandFill({ count: 25, errors: 1, warns: 0 });
    expect(fill).toMatch(/0 15%/);
    expect(fill).toMatch(/15% 100%\)$/);
  });

  it('a block that is mostly errors is mostly red', () => {
    expect(bandFill({ count: 10, errors: 8, warns: 1 })).toMatch(/0 80%/);
  });
});
