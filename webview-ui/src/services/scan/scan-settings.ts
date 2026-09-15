/**
 * What Settings → Code Scan decides, and how a stored string becomes it.
 *
 * ── Why resolution is a function and not a read ──
 *
 * Every preference is stored as a string, and every one of them can be
 * missing, blank, or left over from a build that spelled it differently. A
 * screen that reads `prefs[key]` directly gets `undefined` and renders nothing;
 * a scan that reads it directly gets `Number('') === 0` and walks no files at
 * all. So each setting has one function that turns whatever is stored into a
 * value the scanner can be handed, the screen shows the same resolved value,
 * and neither of them interprets the raw string.
 *
 * None of this narrows what a scan can FIND. The cap is a stop, the ignore
 * list is directories, and the detector list is which parsers run — a setting
 * that quietly dropped endpoints from a result would make the review screen a
 * lie, so there is no such setting here.
 */

import { DETECTOR_IDS, DETECTOR_LABELS, type DetectorId } from '@daakia/api-detector';

export { DETECTOR_IDS, DETECTOR_LABELS };
export type { DetectorId };

export const SCAN_MAX_FILES_KEY = 'scan.maxFiles';
export const SCAN_IGNORE_KEY = 'scan.ignore';
export const SCAN_DETECTORS_KEY = 'scan.detectors';
export const SCAN_CREATE_ENV_KEY = 'scan.createEnvironment';
export const SCAN_PICK_INTERNAL_KEY = 'scan.selectInternal';

/**
 * How many files a scan opens before it stops.
 *
 * The same default the scanner carries. A repository nobody meant to scan is
 * the usual reason a scan runs long — a home directory, a mono-repo, a
 * `node_modules` the ignore list missed — and the cap is what makes that a
 * pause rather than a hang. The result says when it was hit, so raising it is
 * an answer to something the screen told you rather than a guess.
 */
export const DEFAULT_MAX_FILES = 2000;

/** The choices offered. Below 500 a real service does not fit; above 10000 the cap stops being one. */
export const MAX_FILES_CHOICES = ['500', '1000', '2000', '5000', '10000'] as const;
export type MaxFilesChoice = typeof MAX_FILES_CHOICES[number];

export function maxFiles(stored: string | undefined): number {
  /* `Number('')` is 0, and a cap of zero walks nothing — a blank preference
     has to fall back rather than clamp. */
  if (stored === undefined || stored.trim() === '') return DEFAULT_MAX_FILES;
  const n = Number(stored);
  if (!Number.isFinite(n)) return DEFAULT_MAX_FILES;
  return Math.min(50000, Math.max(100, Math.round(n)));
}

/**
 * Extra directory names to skip, on top of the ones that are always skipped.
 *
 * Names, not paths: the walk compares each directory's own name, so `build`
 * skips every `build` in the tree. Separated by commas or newlines because
 * people paste both.
 */
export function ignoreDirs(stored: string | undefined): string[] {
  return [...new Set(
    (stored ?? '')
      .split(/[\n,]/)
      .map(s => s.trim().replace(/^[./\\]+|[/\\]+$/g, ''))
      .filter(Boolean),
  )];
}

/**
 * Which detectors run.
 *
 * Empty means all of them, which is both the default and what somebody who
 * has never opened this page should get. Turning one off is for a repository
 * where a parser is wrong about something — not a speed setting: a detector
 * that does not recognise a repository costs nothing to have enabled.
 *
 * Unticking every one would find nothing, so that is read as "all" too: a
 * scan that silently returns empty is worse than one that ignores an
 * impossible instruction.
 */
export function detectors(stored: string | undefined): DetectorId[] {
  const ids = (stored ?? '')
    .split(',')
    .map(s => s.trim())
    .filter((s): s is DetectorId => (DETECTOR_IDS as string[]).includes(s));
  return ids.length ? ids : [...DETECTOR_IDS];
}

/** Store a set of detectors. All of them is stored as blank, so a new one ships enabled. */
export function storeDetectors(ids: DetectorId[]): string {
  return ids.length === DETECTOR_IDS.length ? '' : ids.join(',');
}

/** `only` for the scanner: absent when every detector is wanted. */
export function detectorFilter(stored: string | undefined): DetectorId[] | undefined {
  const ids = detectors(stored);
  return ids.length === DETECTOR_IDS.length ? undefined : ids;
}

/** A stored on/off, where absent means the default rather than off. */
export function flag(stored: string | undefined, fallback: boolean): boolean {
  if (stored === 'on') return true;
  if (stored === 'off') return false;
  return fallback;
}

export const asFlag = (on: boolean): string => (on ? 'on' : 'off');

/** Everything a scan needs from Settings, resolved together. */
export interface ScanPreferences {
  maxFiles: number;
  ignore: string[];
  only?: DetectorId[];
  /** Tick "create an environment" when the destination step opens. */
  createEnvironment: boolean;
  /** Tick internal and actuator endpoints on the review screen. */
  selectInternal: boolean;
}

export function scanPreferences(prefs: Record<string, string>): ScanPreferences {
  return {
    maxFiles: maxFiles(prefs[SCAN_MAX_FILES_KEY]),
    ignore: ignoreDirs(prefs[SCAN_IGNORE_KEY]),
    only: detectorFilter(prefs[SCAN_DETECTORS_KEY]),
    createEnvironment: flag(prefs[SCAN_CREATE_ENV_KEY], true),
    selectInternal: flag(prefs[SCAN_PICK_INTERNAL_KEY], false),
  };
}
