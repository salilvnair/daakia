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

/**
 * Open a Daakia AI tab with this text in its composer, for the reader to send.
 *
 * From a screen that is not the AI tab — a Follow, a Window — the chat is not
 * mounted yet when the tab opens, so the text waits for it. Prefilled, never
 * sent: the reader adds the question, the lines are only what it is about.
 */
export function openWith(text: string, title?: string): void {
  useTabsStore.getState().openDaakiaAiTab(title ? { title } : undefined);
  let tries = 0;
  const attempt = () => {
    if (prefill(text) || ++tries > 40) return;
    setTimeout(attempt, 100);
  };
  setTimeout(attempt, 50);
}
