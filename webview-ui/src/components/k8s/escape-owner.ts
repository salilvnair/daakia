/**
 * Whether an Escape belongs to something other than the screen underneath.
 *
 * The pod detail and the analyzer close on Escape from a `window` listener.
 * The menus, dropdowns and dialogs on top of them close on Escape too, from a
 * `document` listener that does not stop the key — so one press shut the menu
 * and then, a moment later in the same event, the pod behind it. Rather than
 * each overlay learning to stop the key, the screen asks before it leaves:
 * while one of them is open, or the key was pressed in a field, it is theirs.
 *
 * The overlay is still in the DOM when this runs: its own handler only asked
 * React to close it, and React has not drawn that yet.
 */
const OVERLAY = [
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '.dui_modal__body',
  '.dui_popover',
  '.dui_drawer__backdrop',
  '.dui_select__menu',
  // The app's own right-click and context menus. Not the toast stack, which
  // sits at the same height and is no reason to keep the reader in place.
  '.fixed[class*="z-[9999]"]:not(.bottom-4)',
  '.fixed[class*="z-[10000]"]',
].join(',');

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;
}

export function escapeIsTaken(e: KeyboardEvent, root: ParentNode = document): boolean {
  if (e.defaultPrevented) return true;
  if (isEditable(e.target)) return true;
  return !!root.querySelector(OVERLAY);
}
