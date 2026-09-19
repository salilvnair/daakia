/**
 * The themes somebody made, kept where sync can reach them.
 *
 * ── Why they moved out of the webview ──
 *
 * They started in the webview's `localStorage`, which was the right call
 * while a theme was a preference about this panel: no file written, nothing
 * crossing to the extension host, and nothing to point somewhere it should
 * not go.
 *
 * Git Sync changes what a theme is. A palette somebody spent an evening on
 * is work, and work that only exists in one browser profile is work that
 * disappears with it — and cannot be shared with the person sitting next to
 * them. So the palettes live in the database with everything else that
 * syncs, and the webview keeps a copy only to paint with before the host has
 * answered.
 *
 * ── What stays local ──
 *
 * Which theme is worn, the order of the cards, and which are hidden. Those
 * are about this screen rather than about the themes, and a machine adopting
 * whatever palette another machine happened to be wearing would be a
 * surprise rather than a sync.
 */
import { getThemes, upsertTheme, deleteTheme, type ThemeKind } from '../../../storage/db';

type PostMessage = (msg: unknown) => void;

/** A palette as it travels: the record plus whatever the palette itself is. */
export interface ThemePayload {
  id: string;
  label: string;
  [key: string]: unknown;
}

function isKind(value: unknown): value is ThemeKind {
  return value === 'app' || value === 'terminal';
}

/**
 * Both kinds, parsed back into the shapes the webview stores expect.
 *
 * A row whose payload will not parse is skipped rather than thrown over:
 * one corrupt theme should cost you that theme, not the list.
 */
export function handleGetThemes(postMessage: PostMessage): void {
  postMessage({
    type: 'themes:data',
    app: readKind('app'),
    terminal: readKind('terminal'),
  });
}

function readKind(kind: ThemeKind): ThemePayload[] {
  const out: ThemePayload[] = [];
  for (const row of getThemes(kind)) {
    try {
      const parsed = JSON.parse(row.payload) as ThemePayload;
      if (parsed && typeof parsed === 'object') out.push({ ...parsed, id: row.id, label: row.label });
    } catch { /* one bad row, not a bad list */ }
  }
  return out;
}

/**
 * Save one, and hand the whole list back.
 *
 * Answering with the list rather than an acknowledgement means the webview
 * never has to guess what the database now holds — including when two panels
 * are open and the other one has been busy.
 */
export function handleSaveTheme(msg: Record<string, unknown>, postMessage: PostMessage): void {
  const kind = msg.kind;
  const theme = msg.theme as ThemePayload | undefined;
  if (!isKind(kind) || !theme?.id || !theme.label) return;

  upsertTheme(kind, {
    id: String(theme.id),
    label: String(theme.label),
    payload: JSON.stringify(theme),
  });
  handleGetThemes(postMessage);
}

export function handleDeleteTheme(msg: Record<string, unknown>, postMessage: PostMessage): void {
  const kind = msg.kind;
  const id = msg.id;
  if (!isKind(kind) || typeof id !== 'string' || !id) return;

  deleteTheme(kind, id);
  handleGetThemes(postMessage);
}
