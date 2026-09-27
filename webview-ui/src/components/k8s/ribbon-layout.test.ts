/**
 * The ribbon is read at a glance, so the failures that matter are the ones a
 * glance cannot catch: an error that is not drawn, a you-are-here box outside
 * the pane, a hover card cut off by the edge. Each is pinned here at the
 * heights a split actually produces — not only at the one a full window has.
 */
import { describe, it, expect } from 'vitest';
import {
  bandCount, bandPx, bandAt, markerBox, hoverCardPlacement,
  BAND_FLOOR_PX, MARKER_MIN_PX,
} from './ribbon-layout';
import { densityBuckets, timeBuckets, ribbonTicks, COMPACT_RIBBON_PX } from './log-view';
import type { LogLine } from '../../store/k8s-store';

/** Heights a pane's track really has: a full window, halves, thirds, a grid quarter. */
const HEIGHTS = [900, 640, 420, 310, 240, 190, COMPACT_RIBBON_PX];

const quiet = (n: number, errorAt: number): LogLine[] =>
  Array.from({ length: n }, (_, i) => ({
    seq: i, ts: 1_000_000 + i * 10, level: i === errorAt ? 'error' : 'info', text: `line ${i}`,
  }));

describe('the band floor', () => {
  it('never draws a band thinner than three pixels, at any height a pane has', () => {
    for (const h of HEIGHTS) {
      expect(bandPx(h, bandCount(h))).toBeGreaterThanOrEqual(BAND_FLOOR_PX);
    }
  });

  it('never asks for more bands than the track can hold', () => {
    for (const h of HEIGHTS) {
      const n = bandCount(h);
      expect(n * BAND_FLOOR_PX + (n - 1)).toBeLessThanOrEqual(h);
    }
  });

  it('keeps a lone error in 5,000 quiet lines, in its own colour', () => {
    const lines = quiet(5000, 3217);
    for (const h of HEIGHTS) {
      const buckets = densityBuckets(lines, bandCount(h));
      const withError = buckets.filter(b => b.worst === 'error');
      expect(withError).toHaveLength(1);
      expect(withError[0].errors).toBe(1);
    }
  });

  it('keeps it on a shared clock too, where bands are slices of time', () => {
    const lines = quiet(5000, 4999);
    const range = { from: 1_000_000, to: 1_000_000 + 4999 * 10 };
    for (const h of HEIGHTS) {
      const buckets = timeBuckets(lines, bandCount(h), range);
      expect(buckets.filter(b => b.worst === 'error')).toHaveLength(1);
    }
  });

  it('keeps it in compact mode as a tick', () => {
    const ticks = ribbonTicks(quiet(5000, 12), 150);
    expect(ticks).toEqual([expect.objectContaining({ level: 'error', count: 1 })]);
  });
});

describe('finding the band under the pointer', () => {
  it('maps the top, the middle and the bottom of the track', () => {
    expect(bandAt(0, 400, 40)).toBe(0);
    expect(bandAt(200, 400, 40)).toBe(20);
    expect(bandAt(400, 400, 40)).toBe(39);
  });

  it('clamps a pointer just outside the track rather than naming no band', () => {
    expect(bandAt(-3, 400, 40)).toBe(0);
    expect(bandAt(420, 400, 40)).toBe(39);
  });
});

describe('the you-are-here box', () => {
  it('is never thinner than six pixels, even for two screens in a long log', () => {
    const box = markerBox({ trackPx: 190, scrollTop: 0, contentHeight: 200_000, viewportHeight: 180 });
    expect(box.height).toBe(MARKER_MIN_PX);
  });

  it('is never taller than the track it sits in', () => {
    const box = markerBox({ trackPx: 120, scrollTop: 0, contentHeight: 130, viewportHeight: 125 });
    expect(box.height).toBeLessThanOrEqual(120);
  });

  it('lands its bottom on the track bottom at the end of the log, not past it', () => {
    for (const h of HEIGHTS) {
      const box = markerBox({ trackPx: h, scrollTop: 50_000 - 300, contentHeight: 50_000, viewportHeight: 300 });
      expect(box.top + box.height).toBeCloseTo(h, 5);
    }
  });

  it('follows the clock, not the scroll, when the split shares one', () => {
    const box = markerBox({
      trackPx: 200, scrollTop: 0, contentHeight: 10_000, viewportHeight: 300,
      range: { from: 0, to: 1000 }, viewTimes: { from: 500, to: 600 },
    });
    expect(box.top).toBeCloseTo(100);
    expect(box.height).toBeCloseTo(20);
  });

  it('stays inside the track when the screen is past the end of the clock', () => {
    const box = markerBox({
      trackPx: 200, scrollTop: 0, contentHeight: 10_000, viewportHeight: 300,
      range: { from: 0, to: 1000 }, viewTimes: { from: 1200, to: 1300 },
    });
    expect(box.top + box.height).toBeLessThanOrEqual(200);
    expect(box.height).toBe(MARKER_MIN_PX);
  });
});

describe('the hover card', () => {
  const base = { columnPx: 400, cardHeight: 60, cardWidth: 200 };

  it('opens to the left of a ribbon on the right edge of its pane', () => {
    const c = hoverCardPlacement({ ...base, pointerY: 100, roomLeft: 600, roomRight: 0 });
    expect(c.side).toBe('left');
    expect(c.maxWidth).toBe(200);
  });

  it('flips to the right when only the right has room', () => {
    const c = hoverCardPlacement({ ...base, pointerY: 100, roomLeft: 40, roomRight: 500 });
    expect(c.side).toBe('right');
  });

  it('narrows to the room there is when neither side fits it', () => {
    const c = hoverCardPlacement({ ...base, pointerY: 100, roomLeft: 150, roomRight: 20 });
    expect(c.side).toBe('left');
    expect(c.maxWidth).toBe(144);
  });

  it('opens below the pointer in the top half and above it in the bottom half', () => {
    const top = hoverCardPlacement({ ...base, pointerY: 50, roomLeft: 600, roomRight: 0 });
    const bottom = hoverCardPlacement({ ...base, pointerY: 380, roomLeft: 600, roomRight: 0 });
    expect(top.top).toBeGreaterThan(50);
    expect(bottom.top + 60).toBeLessThan(380);
  });

  it('never leaves the pane, however short the pane is', () => {
    for (const columnPx of [400, 190, 90, 50]) {
      for (const pointerY of [0, columnPx / 3, columnPx / 2 + 1, columnPx]) {
        const c = hoverCardPlacement({ ...base, columnPx, pointerY, roomLeft: 600, roomRight: 0 });
        expect(c.top).toBeGreaterThanOrEqual(0);
        if (columnPx >= 60) expect(c.top + 60).toBeLessThanOrEqual(columnPx);
      }
    }
  });
});
