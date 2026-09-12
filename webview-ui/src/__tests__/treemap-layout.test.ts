/** Geometry tests — a treemap whose areas drift from its values misleads silently. */
import { describe, it, expect } from 'vitest';
import { squarify, type Tile } from '../components/doctor/treemap-layout';

function lay(values: number[], w = 800, h = 500): Tile[] {
  const out: Tile[] = [];
  squarify(values.map((v, i) => ({ name: `c${i}`, value: v })), 0, 0, w, h, 'g', out);
  return out;
}

describe('squarify', () => {
  it('emits one tile per item', () => {
    expect(lay([5, 3, 2, 1]).length).toBe(4);
  });

  it('fills the rectangle exactly — areas sum to the container', () => {
    const w = 800, h = 500;
    const area = lay([50, 25, 15, 7, 3], w, h).reduce((t, r) => t + r.w * r.h, 0);
    expect(area).toBeCloseTo(w * h, 3);
  });

  it('makes area proportional to value', () => {
    const values = [40, 30, 20, 10];
    const w = 600, h = 400;
    const tiles = lay(values, w, h);
    const total = values.reduce((a, b) => a + b, 0);
    for (const t of tiles) {
      const expected = (t.value / total) * w * h;
      expect(t.w * t.h).toBeCloseTo(expected, 3);
    }
  });

  it('produces no overlapping tiles', () => {
    const tiles = lay([9, 8, 7, 6, 5, 4, 3, 2, 1]);
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const a = tiles[i], b = tiles[j];
        const overlap =
          a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 &&
          a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
        expect(overlap).toBe(false);
      }
    }
  });

  it('keeps every tile inside the container', () => {
    const w = 300, h = 200;
    for (const t of lay([12, 7, 5, 3, 1], w, h)) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-6);
      expect(t.y).toBeGreaterThanOrEqual(-1e-6);
      expect(t.x + t.w).toBeLessThanOrEqual(w + 1e-6);
      expect(t.y + t.h).toBeLessThanOrEqual(h + 1e-6);
    }
  });

  it('beats slice-and-dice on aspect ratio, which is the whole point', () => {
    // 40 equal values across a wide box: naive slicing gives 20:1 slivers.
    const tiles = lay(new Array(40).fill(1), 800, 500);
    const worst = Math.max(...tiles.map(t => Math.max(t.w / t.h, t.h / t.w)));
    expect(worst).toBeLessThan(4);
  });

  it('handles the degenerate inputs a real dump produces', () => {
    expect(lay([])).toEqual([]);              // a package with no classes
    expect(lay([0, 0])).toEqual([]);          // classes with no live bytes
    expect(lay([1], 0, 100)).toEqual([]);     // a container collapsed to zero width
    expect(lay([1]).length).toBe(1);          // a single class fills its package
  });

  it('gives a lone item the whole rectangle', () => {
    const [t] = lay([42], 120, 80);
    expect(t.w).toBeCloseTo(120, 6);
    expect(t.h).toBeCloseTo(80, 6);
  });
});
