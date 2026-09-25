/**
 * The open chat's imperative handle, for the parts of the tab that are not
 * inside the chat — the landing, the / palette, a card's follow-ups.
 *
 * ConvEngineChat fills `current` while it is mounted (its `actionsRef`), and
 * empties it when it unmounts, so a stale handle is never called.
 */
import type { ConvEngineChatActionsHandle } from '@salilvnair/convengine-chat';

export const chatActions: { current: ConvEngineChatActionsHandle | null } = { current: null };

/** Put text in the composer for the user to finish. False when no chat is mounted. */
export function prefill(text: string): boolean {
  if (!chatActions.current) return false;
  chatActions.current.prefillInput(text);
  return true;
}

/** Send text as the user. False when no chat is mounted. */
export function send(text: string): boolean {
  if (!chatActions.current) return false;
  chatActions.current.submit(text);
  return true;
}

/** Whether a template still has a `{placeholder}` for the user to fill. */
export function hasPlaceholder(text: string): boolean {
  return /\{\w+\}/.test(text);
}
