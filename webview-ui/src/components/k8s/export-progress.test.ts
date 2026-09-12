/**
 * Which unit the bar is in, and what the number beside it says.
 *
 * The rule: bytes while an archived volume is being read, pods otherwise.
 * A pod count is the wrong unit when one pod's volume *is* the export — it
 * reads "0 of 1" for as long as it takes, which is the same picture as a hang.
 */
import { describe, it, expect } from 'vitest';
import { bytesLabel, exportPercent } from './export-progress';
import type { ExportState } from '../../store/k8s-store';

const running = (extra: Partial<ExportState> = {}): ExportState =>
  ({ phase: 'running', done: 0, total: 1, ...extra });

describe('bytesLabel', () => {
  it('picks the unit the number is comfortable in', () => {
    expect(bytesLabel(512)).toBe('512 B');
    expect(bytesLabel(2048)).toBe('2 KB');
    expect(bytesLabel(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('gives a gigabyte one decimal, because 1.4 is worth reading', () => {
    expect(bytesLabel(1.4 * 1024 * 1024 * 1024)).toBe('1.4 GB');
  });

  it('gives megabytes none, because 812.3 is noise on a number that moves', () => {
    expect(bytesLabel(812.3 * 1024 * 1024)).toBe('812 MB');
  });

  it('says 0 B rather than NaN for nothing', () => {
    expect(bytesLabel(0)).toBe('0 B');
    expect(bytesLabel(-1)).toBe('0 B');
    expect(bytesLabel(Number.NaN)).toBe('0 B');
  });

  it('does not run off the end of the unit table', () => {
    expect(bytesLabel(5 * 1024 ** 5)).toContain('TB');
  });
});

describe('exportPercent', () => {
  it('counts pods when no volume is being read', () => {
    expect(exportPercent(running({ done: 1, total: 4 }))).toBe(25);
  });

  it('switches to bytes the moment a byte total arrives', () => {
    expect(exportPercent(running({
      done: 0, total: 1, bytes: 500, totalBytes: 1000,
    }))).toBe(50);
  });

  it('is zero before anything has started', () => {
    expect(exportPercent(undefined)).toBe(0);
    expect(exportPercent(running({ done: 0, total: 0 }))).toBe(0);
  });

  it('clamps, so a gzip bigger than its directory entry cannot overshoot', () => {
    expect(exportPercent(running({ bytes: 2000, totalBytes: 1000 }))).toBe(100);
  });

  it('never goes negative', () => {
    expect(exportPercent(running({ bytes: -5, totalBytes: 1000 }))).toBe(0);
  });
});
