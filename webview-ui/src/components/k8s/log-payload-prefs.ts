/**
 * What the Logs tab does with the machine half of a line.
 *
 * Read from prefs rather than held in the store: these are settings somebody
 * chose once, not state a pod produces, and every one of them has an answer
 * that is right when nothing has been chosen at all.
 *
 * The master switch is first among them and means it: off, `payloadPrefs`
 * reports no shapes and the log view never parses anything, which is also the
 * answer for a pod whose lines are all sentences and a reader who wants them
 * left alone.
 */
import { useUiStateStore } from '../../store/ui-state-store';
import type { PayloadShape } from './log-payload';

export const PAYLOAD_DRAW_PREF = 'dk8s.logs.payload.draw';
export const PAYLOAD_SHAPES_PREF = 'dk8s.logs.payload.shapes';
export const PAYLOAD_MODE_PREF = 'dk8s.logs.payload.mode';
export const PAYLOAD_DEPTH_PREF = 'dk8s.logs.payload.depth';
export const PAYLOAD_MAX_PREF = 'dk8s.logs.payload.maxKb';
export const PAYLOAD_SECRETS_PREF = 'dk8s.logs.payload.hideSecrets';
export const PAYLOAD_COLLAPSED_PREF = 'dk8s.logs.payload.collapsed';
export const PAYLOAD_REMEMBER_PREF = 'dk8s.logs.payload.remember';
export const PAYLOAD_KEEP_RAW_PREF = 'dk8s.logs.payload.keepRaw';
/** The loggers whose payloads were left open, kept when "remember" is on. */
export const PAYLOAD_OPEN_LOGGERS_PREF = 'dk8s.logs.payload.openLoggers';
export const TRACE_APP_FIRST_PREF = 'dk8s.logs.trace.appFirst';
/** Package prefixes that are the reader's own code, comma-separated. */
export const TRACE_HOME_PREF = 'dk8s.logs.trace.homePackages';

export type PayloadMode = 'tree' | 'pretty' | 'raw';

export interface PayloadPrefs {
  /** The master switch. Off, nothing below it applies. */
  draw: boolean;
  /** Which shapes are claimed. Empty when `draw` is off. */
  shapes: PayloadShape[];
  /** How a payload opens, before the reader touches that line. */
  mode: PayloadMode;
  /** Levels of a tree open to begin with. */
  depth: number;
  /** Longest line worth parsing, in characters. */
  maxChars: number;
  /** Hide values on token-looking keys until asked. */
  hideSecrets: boolean;
  /** A payload is a chip until clicked; off, it is drawn open. */
  collapsed: boolean;
  /** Opening a payload opens that logger's payloads, and it is kept. */
  remember: boolean;
  /** Raw stays one click away on every payload. */
  keepRaw: boolean;
  /** An opened stack trace lists the reader's own frames before the framework's. */
  appFirst: boolean;
  /** Package prefixes that are the reader's own, for "3 of yours". */
  homePackages: string[];
}

const ALL_SHAPES: PayloadShape[] = ['json', 'xml', 'kv', 'yaml'];
const MODES: PayloadMode[] = ['tree', 'pretty', 'raw'];

/** On unless it was turned off — the convention the other log prefs use. */
function on(prefs: Record<string, string>, key: string): boolean {
  return prefs[key] !== 'off';
}

export function payloadPrefs(prefs: Record<string, string>): PayloadPrefs {
  const draw = on(prefs, PAYLOAD_DRAW_PREF);
  const stored = prefs[PAYLOAD_SHAPES_PREF];

  /*
    An empty string is a real answer — every shape unticked — and has to survive
    the round trip, so "not set" and "set to nothing" are told apart by
    `undefined` rather than by falsiness.
  */
  const shapes = stored === undefined
    ? ALL_SHAPES
    : stored.split(',').map(s => s.trim()).filter((s): s is PayloadShape =>
      (ALL_SHAPES as string[]).includes(s));

  const mode = MODES.find(m => m === prefs[PAYLOAD_MODE_PREF]) ?? 'tree';
  const depth = clamp(parseInt(prefs[PAYLOAD_DEPTH_PREF] ?? '', 10), 1, 12, 2);
  const maxKb = clamp(parseInt(prefs[PAYLOAD_MAX_PREF] ?? '', 10), 1, 4096, 256);

  return {
    draw,
    shapes: draw ? shapes : [],
    mode,
    depth,
    maxChars: maxKb * 1024,
    hideSecrets: on(prefs, PAYLOAD_SECRETS_PREF),
    collapsed: on(prefs, PAYLOAD_COLLAPSED_PREF),
    remember: on(prefs, PAYLOAD_REMEMBER_PREF),
    keepRaw: on(prefs, PAYLOAD_KEEP_RAW_PREF),
    appFirst: on(prefs, TRACE_APP_FIRST_PREF),
    homePackages: homePackages(prefs[TRACE_HOME_PREF]),
  };
}

/** `com.acme, org.acme.` → `['com.acme.', 'org.acme.']` — a prefix ends at a dot, so `com.ac` never claims `com.acme`. */
export function homePackages(raw: string | undefined): string[] {
  return (raw ?? '').split(/[\s,]+/).map(p => p.trim().replace(/\.*$/, '')).filter(Boolean).map(p => `${p}.`);
}

/** The loggers whose payloads open by themselves. */
export function openLoggers(prefs: Record<string, string>): Set<string> {
  try {
    const v = JSON.parse(prefs[PAYLOAD_OPEN_LOGGERS_PREF] ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch { return new Set(); }
}

export function setOpenLogger(logger: string, open: boolean): void {
  const cur = openLoggers(useUiStateStore.getState().prefs);
  if (open) cur.add(logger); else cur.delete(logger);
  useUiStateStore.getState().setPref(PAYLOAD_OPEN_LOGGERS_PREF, JSON.stringify([...cur].slice(-200)));
}

/**
 * Every rendering setting back to how it came — the payload switch and its
 * choices, stack-trace folding and ordering. Your packages and the loggers you
 * left open are kept: those are facts about your code, not preferences.
 */
export const RENDERING_DEFAULTS: Record<string, string> = {
  [PAYLOAD_DRAW_PREF]: 'on',
  [PAYLOAD_SHAPES_PREF]: ALL_SHAPES.join(','),
  [PAYLOAD_MODE_PREF]: 'tree',
  [PAYLOAD_DEPTH_PREF]: '2',
  [PAYLOAD_MAX_PREF]: '256',
  [PAYLOAD_SECRETS_PREF]: 'on',
  [PAYLOAD_COLLAPSED_PREF]: 'on',
  [PAYLOAD_REMEMBER_PREF]: 'on',
  [PAYLOAD_KEEP_RAW_PREF]: 'on',
  [TRACE_APP_FIRST_PREF]: 'on',
  'dk8s.logs.fold': 'on',
};

export function resetRenderingPrefs(): void {
  const set = useUiStateStore.getState().setPref;
  for (const [k, v] of Object.entries(RENDERING_DEFAULTS)) set(k, v);
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function usePayloadPrefs(): PayloadPrefs {
  return payloadPrefs(useUiStateStore(s => s.prefs));
}

export function setPayloadPref(key: string, value: string): void {
  useUiStateStore.getState().setPref(key, value);
}

/** Shapes as they are stored: a list, so an empty one means none. */
export function shapesText(shapes: PayloadShape[]): string {
  return shapes.join(',');
}
