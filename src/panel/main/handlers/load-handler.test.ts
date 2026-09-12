/**
 * The numbers a load test prints are the whole product, so they are tested.
 *
 * The panel this replaces ran `setTimeout(80 + Math.random() * 400)` and
 * reported the result as the endpoint's p95. Nothing here can drift back into
 * that: these pin the statistics against hand-worked examples, and the ramp
 * against the shape every load tool draws.
 */
import { describe, it, expect } from 'vitest';
import {
  percentileSorted, summarise, evaluateThresholds, targetAt, stagesDuration,
} from './load-handler';

describe('percentiles', () => {
  const sorted = Array.from({ length: 100 }, (_, i) => i + 1); // 1…100

  it('picks the nearest rank, the way load tools report it', () => {
    expect(percentileSorted(sorted, 50)).toBe(50);
    expect(percentileSorted(sorted, 95)).toBe(95);
    expect(percentileSorted(sorted, 99)).toBe(99);
    expect(percentileSorted(sorted, 100)).toBe(100);
  });

  it('does not fall off either end', () => {
    expect(percentileSorted([], 95)).toBe(0);
    expect(percentileSorted([7], 1)).toBe(7);
    expect(percentileSorted([7], 99)).toBe(7);
  });

  /* p95 of ten samples is the tenth-from-sorted at rank 9.5 → 10th value.
     Off-by-one here is the difference between "we are fine" and "we are not". */
  it('rounds the rank up, so p95 of ten samples is the tenth', () => {
    expect(percentileSorted([1, 2, 3, 4, 5, 6, 7, 8, 9, 500], 95)).toBe(500);
    expect(percentileSorted([1, 2, 3, 4, 5, 6, 7, 8, 9, 500], 90)).toBe(9);
  });
});

describe('summary', () => {
  const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  it('reports what was measured', () => {
    const s = summarise(latencies, 2, { '200': 8, '500': 2 }, 4096, 5000, 10);
    expect(s.count).toBe(10);
    expect(s.min).toBe(10);
    expect(s.max).toBe(100);
    expect(s.avg).toBe(55);
    expect(s.p50).toBe(50);
    expect(s.errors).toBe(2);
    expect(s.errorRatePct).toBe(20);
    expect(s.rps).toBe(2); // 10 requests in 5 seconds
    expect(s.bytes).toBe(4096);
  });

  it('has an answer for a run that sent nothing', () => {
    const s = summarise([], 0, {}, 0, 1000, 0);
    expect(s).toMatchObject({ count: 0, avg: 0, p95: 0, rps: 0, errorRatePct: 0 });
  });

  /* Past the sample cap the kept latencies are a subset, so the rate has to
     come from the real count or a long run would report a fraction of it. */
  it('takes throughput from the request count, not the kept samples', () => {
    const s = summarise([5, 5, 5], 0, {}, 0, 1000, 900);
    expect(s.rps).toBe(900);
    expect(s.count).toBe(900);
  });

  it('does not mutate the caller’s samples', () => {
    const input = [3, 1, 2];
    summarise(input, 0, {}, 0, 1000, 3);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe('thresholds', () => {
  const s = summarise([100, 200, 300, 400, 500], 1, {}, 0, 1000, 5);

  it('passes what is within target and fails what is not', () => {
    const [p95, err] = evaluateThresholds(s, { p95Ms: 600, errorRatePct: 10 });
    expect(p95).toMatchObject({ passed: true, actual: 500 });
    expect(err).toMatchObject({ passed: false, actual: 20 });
  });

  it('reads a throughput floor the other way round', () => {
    expect(evaluateThresholds(s, { minRps: 100 })[0].passed).toBe(false);
    expect(evaluateThresholds(s, { minRps: 1 })[0].passed).toBe(true);
  });

  it('reports nothing when nothing was asked for', () => {
    expect(evaluateThresholds(s, {})).toEqual([]);
  });
});

describe('ramp', () => {
  const stages = [
    { target: 100, seconds: 10 },  // ramp up
    { target: 100, seconds: 20 },  // hold
    { target: 0, seconds: 10 },    // ramp down
  ];

  it('interpolates between stage targets', () => {
    expect(targetAt(0, stages)).toBe(0);
    expect(targetAt(5, stages)).toBe(50);
    expect(targetAt(10, stages)).toBe(100);
  });

  it('holds through a flat stage', () => {
    expect(targetAt(20, stages)).toBe(100);
    expect(targetAt(29.9, stages)).toBeCloseTo(100, 0);
  });

  it('comes back down', () => {
    expect(targetAt(35, stages)).toBe(50);
    expect(targetAt(40, stages)).toBe(0);
  });

  it('holds the last target past the end rather than snapping to zero', () => {
    expect(targetAt(999, [{ target: 50, seconds: 10 }])).toBe(50);
  });

  it('adds the stages up', () => {
    expect(stagesDuration(stages)).toBe(40);
    expect(stagesDuration([])).toBe(0);
  });
});
