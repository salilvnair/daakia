/**
 * What a Daakia AI answer looks like on screen, kept beside what the model said.
 *
 * The chat draws an assistant message from its text, and for a dk8s answer that
 * text is an envelope — `{type: 'dk8s-search', rawText, results}` — so the card
 * can draw the lines the search found rather than trust the prose. The model's
 * history only ever needs the prose. So a saved message carries both: `content`
 * for the model, `display` for the screen, and reopening a conversation hands
 * the chat the display, card and all.
 */
import type { AiMessage } from '../../store/tabs-store';

/** The text the chat renders for an answer — an envelope the renderers recognise. */
export function displayEnvelope(content: string, dk8s?: unknown[]): string {
  return JSON.stringify(dk8s?.length
    ? { type: 'dk8s-search', rawText: content, results: dk8s }
    : { type: 'text', rawText: content });
}

/** An answer that did not come — stopped, or failed — with the question to ask again. */
export function noticeEnvelope(text: string, tone: 'stopped' | 'error', retry?: string): string {
  return JSON.stringify({ type: 'daakia-notice', tone, rawText: text, ...(retry ? { retry } : {}) });
}

/** A message the chat library can seed a conversation with. */
export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

/**
 * A saved conversation as the chat shows it.
 *
 * System and tool messages are the model's business and are not drawn. An
 * assistant message saved before `display` existed is wrapped as plain text,
 * which is what it was shown as then.
 */
export function toUiMessages(messages: AiMessage[]): UiMessage[] {
  const out: UiMessage[] = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ id: m.id, role: 'user', text: m.content });
    else if (m.role === 'assistant' && !m.toolCalls?.length) {
      out.push({ id: m.id, role: 'assistant', text: m.display ?? displayEnvelope(m.content) });
    }
  }
  return out;
}

/**
 * The history the model is sent: without what only the screen needs.
 *
 * `display` can hold a whole search result, and `reasoningContent` is a
 * thinking model's scratch from an earlier turn — DeepSeek wants it back only
 * inside the tool loop that produced it, which the host handles.
 */
export function forModel(messages: AiMessage[]): AiMessage[] {
  return messages.map(({ display: _d, reasoningContent: _r, ...m }) => m);
}
