/**
 * A node inside ConvEngineChat's own DOM to portal into.
 *
 * The library has no slot for a landing screen or a progress box, and the
 * places those belong — its landing area, its "thinking" row — are where a
 * reader's eye already is. This finds the element by its class, adds one
 * child of ours to it, and keeps following it as the library re-renders; when
 * the library drops the element, the slot goes with it.
 */
import { useEffect, useState } from 'react';

export function useLibrarySlot(
  root: HTMLElement | null,
  selector: string,
  slotClass: string,
  active = true,
  /** Where our child goes: after the library's children, or before them. */
  where: 'append' | 'prepend' = 'append',
): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!root || !active) { setSlot(null); return; }
    const find = () => {
      const all = root.querySelectorAll(selector);
      const host = all[all.length - 1] as HTMLElement | undefined;
      if (!host) { setSlot(null); return; }
      let el = host.querySelector(`:scope > .${slotClass}`) as HTMLElement | null;
      if (!el) {
        el = document.createElement('div');
        el.className = slotClass;
        if (where === 'prepend') host.prepend(el); else host.appendChild(el);
      }
      setSlot(prev => (prev === el ? prev : el));
    };
    find();
    const mo = new MutationObserver(find);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [root, selector, slotClass, active, where]);
  return slot;
}
