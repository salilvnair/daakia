/**
 * Write a request's documentation from the request itself.
 *
 * ── Why there is nothing to type ──
 *
 * Every other AI button in the app asks for a description first, because it is
 * generating something that does not exist yet. This one is describing
 * something that does: the method, the URL, the headers, the body, and
 * whatever responses have been saved from it. Asking "what should the docs
 * say?" would be asking the user to write the docs.
 *
 * ── What it is told not to do ──
 *
 * Invent. A generated page that lists a `page_size` parameter the endpoint
 * does not take is worse than no page at all, because it reads exactly like
 * the true parts around it. The prompt says to document what the evidence
 * shows and to prefer "appears to" over a confident wrong claim.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AIButtonView } from '@salilvnair/dui';
import type { RequestTab } from '../../store/tabs-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { useToastStore } from '../../store/toast-store';
import { sendAiRequest, newAiRequestId } from '../../services/ai/ai-client';

/** Fences around the whole answer, which the model adds despite being asked not to. */
function stripOuterFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:\w+)?\s*/, '').replace(/\s*```$/, '').trim();
}

/** The saved responses, as much as is useful to a writer. */
function describeExamples(tab: RequestTab): string {
  const examples = tab.examples ?? [];
  if (examples.length === 0) return '(none saved)';
  return examples.slice(0, 4)
    .map(e => `${e.status} — ${e.name} — ${e.body.slice(0, 600)}`)
    .join('\n');
}

export function AiDocsGenerate({ tab, onApply }: { tab: RequestTab; onApply: (markdown: string) => void }) {
  const [loading, setLoading] = useState(false);
  const requestId = useRef('');
  const accumulated = useRef('');
  const resolve = useAiPromptTemplatesStore(s => s.resolve);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (!requestId.current || msg?.tabId !== requestId.current) return;

      /*
        The names and shapes the host actually sends — `ai:complete`, not
        `ai:done`, and the text under `delta` then `message.content`. Guessing
        them is how a button ends up looking alive and doing nothing, which is
        the bug this app has already had twice.
      */
      if (msg.type === 'ai:chunk') {
        accumulated.current += (msg.delta as string) || (msg.text as string) || '';
      } else if (msg.type === 'ai:complete') {
        const payload = msg.message as { content?: string } | undefined;
        const text = stripOuterFence(accumulated.current || payload?.content || '');
        setLoading(false);
        requestId.current = '';
        if (text) onApply(text);
        else useToastStore.getState().addToast({ type: 'warning', message: 'The model returned nothing to write.' });
      } else if (msg.type === 'ai:error') {
        setLoading(false);
        requestId.current = '';
        useToastStore.getState().addToast({
          type: 'error',
          message: (msg.message as string) || 'Could not generate the docs — check the AI provider settings.',
        });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onApply]);

  const generate = useCallback(() => {
    setLoading(true);
    accumulated.current = '';
    const id = newAiRequestId('rest.docs.generate');
    requestId.current = id;

    const headers = (tab.headers ?? [])
      .filter(h => h.enabled && h.key)
      .map(h => `${h.key}: ${h.value}`)
      .join('\n') || '(none)';

    sendAiRequest({
      requestId: id,
      stage: 'rest.docs.generate',
      screen: 'REST · Docs',
      systemPrompts: [resolve('rest.docs.generate.system')],
      userPrompt: resolve('rest.docs.generate', {
        method: tab.method || 'GET',
        url: tab.url || '(no URL yet)',
        headers,
        body: (tab.bodyRaw || '').slice(0, 1200) || '(none)',
        examples: describeExamples(tab),
      }),
      settings: { temperature: 0.3, maxTokens: 1200 },
      context: { authType: tab.authType, authData: tab.authData, envId: tab.envId },
    });
  }, [tab, resolve]);

  return (
    <AIButtonView
      action="generate"
      label="Write with AI"
      size="sm"
      loading={loading}
      onClick={generate}
    />
  );
}
