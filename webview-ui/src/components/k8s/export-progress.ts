/**
 * Saying how far an export has got.
 *
 * Two units, because there are two halves. kubectl hands a live log over in
 * one piece, so that half can only be counted in pods. An archived volume is
 * read a chunk at a time and is the half that takes minutes — so while it is
 * running the bar measures bytes, and a byte total is what tells the screen
 * which half it is looking at.
 */
import type { ExportState } from '../../store/k8s-store';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/**
 * `1.4 GB`, `812 MB`, `0 B`.
 *
 * One decimal above a megabyte and none below: `1.4 GB` is worth reading and
 * `812.3 MB` is three characters of noise on a number that moves every frame.
 */
export function bytesLabel(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const decimals = unit >= 3 ? 1 : 0;
  return `${value.toFixed(decimals)} ${UNITS[unit]}`;
}

/**
 * How full the bar is, 0–100.
 *
 * Bytes when the archived half is running, pods otherwise. Clamped, because a
 * gzip that expands past the size its directory entry claimed would otherwise
 * push the bar off the end of its track.
 */
export function exportPercent(state: ExportState | undefined): number {
  if (!state) return 0;
  const total = state.totalBytes ?? 0;
  if (total > 0) return clamp(((state.bytes ?? 0) / total) * 100);
  return clamp((state.done / Math.max(1, state.total)) * 100);
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
