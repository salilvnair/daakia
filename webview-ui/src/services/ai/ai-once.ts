/**
 * One AI call, as a promise of its text.
 *
 * `sendAiRequest` answers with messages — chunks, then complete or error, on
 * the request's id. Ghost text and a one-question popover want the finished
 * text or a reason there is none, and a way to stop waiting when the reader
 * has typed on. This is that, and nothing more: the call still goes through
 * `sendAiRequest`, so the AI Features switch, the audit and the provider
 * settings apply exactly as they do everywhere else.
 */
import { sendAiRequest, newAiRequestId, type AiCallOptions } from './ai-client';

export interface AiOnce {
  text: Promise<string>;
  /** Stop listening; the answer, if it comes, is dropped. */
  cancel: () => void;
}

export function askOnce(options: Omit<AiCallOptions, 'requestId' | 'tabId'>, timeoutMs = 20_000): AiOnce {
  const id = newAiRequestId(String(options.stage));
  let acc = '';
  let settle: ((v: string) => void) | undefined;
  let fail: ((e: Error) => void) | undefined;
  const text = new Promise<string>((resolve, reject) => { settle = resolve; fail = reject; });
  const done = () => { window.removeEventListener('message', handler); clearTimeout(timer); };
  const handler = (evt: MessageEvent) => {
    const msg = evt.data as Record<string, unknown> | undefined;
    if (!msg || msg.tabId !== id) return;
    if (msg.type === 'ai:chunk') {
      acc += String((msg.delta as string | undefined) ?? msg.text ?? '');
      return;
    }
    if (msg.type === 'ai:complete') {
      done();
      settle?.(acc || String((msg.message as { content?: string } | undefined)?.content ?? ''));
      return;
    }
    if (msg.type === 'ai:error') {
      done();
      fail?.(new Error(String(msg.message ?? 'The model did not answer.')));
    }
  };
  const timer = setTimeout(() => { done(); fail?.(new Error('The model took too long to answer.')); }, timeoutMs);
  window.addEventListener('message', handler);
  sendAiRequest({ ...options, requestId: id });
  return {
    text,
    cancel: () => { done(); fail?.(new Error('cancelled')); },
  };
}
