/**
 * Each Daakia AI tab's chat handle, for the parts of the tab that are not
 * inside the chat — the landing, the / palette, a card's follow-ups.
 *
 * ConvEngineChat fills a tab's `current` while it is mounted (its
 * `actionsRef`), and empties it when it unmounts, so a stale handle is never
 * called. `prefill` and `send` act on the Daakia AI tab on screen — the one
 * whose landing, palette or card was just clicked.
 */
import type { ConvEngineChatActionsHandle } from '@salilvnair/convengine-chat';
import { useTabsStore } from '../../store/tabs-store';

type Handle = { current: ConvEngineChatActionsHandle | null };
const handles = new Map<string, Handle>();

/** The ref a tab's chat fills — the same object for the life of the tab. */
export function chatActionsFor(tabId: string): Handle {
  let h = handles.get(tabId);
  if (!h) { h = { current: null }; handles.set(tabId, h); }
  return h;
}

function onScreen(): ConvEngineChatActionsHandle | null {
  const { activeTabId, tabs } = useTabsStore.getState();
  const tab = tabs.find(t => t.id === activeTabId && t.type === 'daakia-ai');
  return tab ? handles.get(tab.id)?.current ?? null : null;
}

/** Put text in the composer for the user to finish. False when no chat is mounted. */
export function prefill(text: string): boolean {
  const h = onScreen();
  if (!h) return false;
  h.prefillInput(text);
  return true;
}

/** Send text as the user. False when no chat is mounted. */
export function send(text: string): boolean {
  const h = onScreen();
  if (!h) return false;
  h.submit(text);
  return true;
}

/** Whether a template still has a `{placeholder}` for the user to fill. */
export function hasPlaceholder(text: string): boolean {
  return /\{\w+\}/.test(text);
}
