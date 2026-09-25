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
}

const ALL_SHAPES: PayloadShape[] = ['json', 'xml', 'kv'];
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
  };
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
