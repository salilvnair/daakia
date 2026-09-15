/**
 * Turning stored strings into a scan's options.
 *
 * Every one of these can arrive missing or blank, and the failure mode is
 * never an error — it is a scan that walks no files, or one that runs no
 * detectors and reports an empty repository. So the fallbacks are the tests.
 */
import { describe, it, expect } from 'vitest';
import {
  maxFiles, ignoreDirs, detectors, storeDetectors, detectorFilter, flag,
  scanPreferences, DEFAULT_MAX_FILES, DETECTOR_IDS,
  SCAN_MAX_FILES_KEY, SCAN_IGNORE_KEY, SCAN_DETECTORS_KEY,
  SCAN_CREATE_ENV_KEY, SCAN_PICK_INTERNAL_KEY,
} from './scan-settings';

describe('the file cap', () => {
  it('falls back when nothing is stored', () => {
    expect(maxFiles(undefined)).toBe(DEFAULT_MAX_FILES);
  });

  it('falls back on blank rather than clamping to zero', () => {
    /* `Number('')` is 0, and a cap of zero walks nothing at all. */
    expect(maxFiles('')).toBe(DEFAULT_MAX_FILES);
    expect(maxFiles('   ')).toBe(DEFAULT_MAX_FILES);
  });

  it('falls back on nonsense', () => {
    expect(maxFiles('lots')).toBe(DEFAULT_MAX_FILES);
  });

  it('takes a real number', () => {
    expect(maxFiles('5000')).toBe(5000);
  });

  it('keeps it within a range where it is still a cap', () => {
    expect(maxFiles('1')).toBe(100);
    expect(maxFiles('999999')).toBe(50000);
  });
});

describe('the ignore list', () => {
  it('is empty when nothing is stored', () => {
    expect(ignoreDirs(undefined)).toEqual([]);
  });

  it('takes commas or newlines, because people paste both', () => {
    expect(ignoreDirs('fixtures, testdata\ngenerated')).toEqual(['fixtures', 'testdata', 'generated']);
  });

  it('is names, not paths — the walk compares a directory to its own name', () => {
    expect(ignoreDirs('./fixtures/, src/generated')).toEqual(['fixtures', 'src/generated']);
  });

  it('drops blanks and repeats', () => {
    expect(ignoreDirs('a,,a,\n b ')).toEqual(['a', 'b']);
  });
});

describe('which detectors run', () => {
  it('is all of them when nothing is stored', () => {
    expect(detectors(undefined)).toEqual(DETECTOR_IDS);
    expect(detectorFilter(undefined)).toBeUndefined();
  });

  it('is all of them when every one is unticked', () => {
    /* Nothing enabled would find nothing. A scan that silently returns empty
       is worse than one that ignores an impossible instruction. */
    expect(detectors('')).toEqual(DETECTOR_IDS);
  });

  it('keeps a chosen few', () => {
    expect(detectors('spring,flask')).toEqual(['spring', 'flask']);
    expect(detectorFilter('spring,flask')).toEqual(['spring', 'flask']);
  });

  it('ignores an id that no longer names a detector', () => {
    expect(detectors('spring,sinatra')).toEqual(['spring']);
  });

  it('stores all of them as blank, so a detector added later ships enabled', () => {
    expect(storeDetectors([...DETECTOR_IDS])).toBe('');
    expect(storeDetectors(['spring'])).toBe('spring');
  });
});

describe('a stored on/off', () => {
  it('is the default when absent, not off', () => {
    expect(flag(undefined, true)).toBe(true);
    expect(flag(undefined, false)).toBe(false);
  });

  it('reads what was actually stored', () => {
    expect(flag('off', true)).toBe(false);
    expect(flag('on', false)).toBe(true);
  });
});

describe('everything together', () => {
  it('is usable defaults from an empty store', () => {
    expect(scanPreferences({})).toEqual({
      maxFiles: DEFAULT_MAX_FILES,
      ignore: [],
      only: undefined,
      createEnvironment: true,
      selectInternal: false,
    });
  });

  it('carries what was set', () => {
    expect(scanPreferences({
      [SCAN_MAX_FILES_KEY]: '5000',
      [SCAN_IGNORE_KEY]: 'fixtures',
      [SCAN_DETECTORS_KEY]: 'spring',
      [SCAN_CREATE_ENV_KEY]: 'off',
      [SCAN_PICK_INTERNAL_KEY]: 'on',
    })).toEqual({
      maxFiles: 5000,
      ignore: ['fixtures'],
      only: ['spring'],
      createEnvironment: false,
      selectInternal: true,
    });
  });
});
