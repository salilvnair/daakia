/**
 * Bin handler — webview-facing bridge for services/bin.ts.
 */
import {
  getTrashEntries, getTrashCounts, restoreEntry, restoreGroup,
  permanentlyDelete, permanentlyDeleteGroup, emptyBin, type TrashCategory,
} from '../../../services/bin';

type PostMessage = (msg: unknown) => void;

export function handleBinGetEntries(msg: { category?: TrashCategory }, post: PostMessage): void {
  post({
    type: 'bin:entriesData',
    entries: getTrashEntries(msg.category),
    counts: getTrashCounts(),
  });
}

export function handleBinRestore(msg: { id: string }, post: PostMessage): { ok: boolean } {
  const ok = restoreEntry(msg.id);
  handleBinGetEntries({}, post);
  return { ok };
}

export function handleBinRestoreGroup(msg: { groupId: string }, post: PostMessage): { count: number } {
  const count = restoreGroup(msg.groupId);
  handleBinGetEntries({}, post);
  return { count };
}

export function handleBinPermanentlyDelete(msg: { id: string }, post: PostMessage): void {
  permanentlyDelete(msg.id);
  handleBinGetEntries({}, post);
}

export function handleBinPermanentlyDeleteGroup(msg: { groupId: string }, post: PostMessage): void {
  permanentlyDeleteGroup(msg.groupId);
  handleBinGetEntries({}, post);
}

export function handleBinEmpty(msg: { category?: TrashCategory }, post: PostMessage): void {
  emptyBin(msg.category);
  handleBinGetEntries({}, post);
}
