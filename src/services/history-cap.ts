/**
 * How many history entries are kept — asked once, answered in one place.
 *
 * ── Why this exists ──
 *
 * Twelve call sites trimmed history and they did not agree. Eight passed a
 * hard-coded `500`; four read `maxHistoryEntries` off the wrong level of the
 * settings object and fell back to `100`. The setting in the manifest was
 * honoured by exactly one of them — the REST send — so raising it did nothing
 * the moment you sent a GraphQL query, and a single WebSocket message cut the
 * table to a hundred rows.
 *
 * That was survivable while History was a list you scrolled. It is not
 * survivable now that History is searched: a filter is only as good as the rows
 * it can see, and rows deleted by whichever protocol happened to send last are
 * rows no filter will ever find.
 *
 * ── The number ──
 *
 * Two thousand, matching `daakia.maxHistoryEntries` in the manifest. The stored
 * setting wins where the user has set one; the workspace config is consulted
 * next, which under the browser build's shim always returns the default and so
 * gives both builds the same answer.
 */
import * as vscode from 'vscode';
import { getSetting } from '../storage/db';

export const DEFAULT_HISTORY_CAP = 2000;

export function historyCap(): number {
  const stored = (getSetting<Record<string, unknown>>('general') ?? {}).maxHistoryEntries;
  const n = typeof stored === 'string' ? Number(stored) : stored;
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) return Math.floor(n);
  return vscode.workspace.getConfiguration('daakia')
    .get<number>('maxHistoryEntries', DEFAULT_HISTORY_CAP) || DEFAULT_HISTORY_CAP;
}
