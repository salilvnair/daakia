/**
 * Copilot Executor — routes AI requests through VS Code's Language Model API.
 * Uses the user's active GitHub Copilot subscription (no API key needed).
 *
 * Based on dmcr_copilot pattern: vscode.lm.selectChatModels() + model.sendRequest()
 */
import * as vscode from 'vscode';
import type { AiRequestPayload, AiStreamChunk, AiResponseComplete } from './ai-types';

type AiSignal = { aborted: boolean };
type AiError = { tabId: string; message: string; code?: string };

interface CopilotExecuteOptions {
  payload: AiRequestPayload;
  signal: AiSignal;
  onChunk: (chunk: AiStreamChunk) => void;
  onComplete: (result: AiResponseComplete) => void;
  onError: (error: AiError) => void;
}

/** Fetch available Copilot models via VS Code LM API */
export async function getCopilotModels(): Promise<Array<{ id: string; name: string; family: string }>> {
  try {
    const models = await vscode.lm.selectChatModels({});
    const seen = new Set<string>();
    const result: Array<{ id: string; name: string; family: string }> = [];
    for (const m of models) {
      const key = m.family || m.id;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ id: key, name: m.name, family: m.family || m.id });
    }
    return result;
  } catch {
    return [];
  }
}

/** Execute an AI request via VS Code's Copilot LM API */
export async function executeCopilotRequest(opts: CopilotExecuteOptions): Promise<void> {
  const { payload, signal, onChunk, onComplete, onError } = opts;
  const tabId = payload.tabId;
  const t0 = Date.now();

  // Resolve model family — 'auto' means let Copilot pick
  const family = payload.model === 'auto' ? undefined : payload.model;

  let model: vscode.LanguageModelChat | undefined;
  try {
    const filter: vscode.LanguageModelChatSelector = { vendor: 'copilot' };
    if (family) filter.family = family;
    const [found] = await vscode.lm.selectChatModels(filter);
    model = found;
  } catch (err) {
    onError({ tabId, message: `Failed to select Copilot model: ${err instanceof Error ? err.message : String(err)}`, code: '503' });
    return;
  }

  if (!model) {
    onError({
      tabId,
      message: 'No GitHub Copilot model available. Make sure you are signed into GitHub Copilot in VS Code.',
      code: '503',
    });
    return;
  }

  // Convert Daakia messages → VS Code LanguageModelChatMessage
  const vsMessages: vscode.LanguageModelChatMessage[] = [];
  for (const m of payload.messages) {
    if (m.role === 'system' || m.role === 'assistant') {
      vsMessages.push(vscode.LanguageModelChatMessage.Assistant(m.content || ''));
    } else if (m.role === 'user') {
      vsMessages.push(vscode.LanguageModelChatMessage.User(m.content || ''));
    }
    // Skip 'tool' role — not supported by Copilot LM API
  }

  if (vsMessages.length === 0) {
    onError({ tabId, message: 'No messages to send', code: '400' });
    return;
  }

  // VS Code CancellationToken — poll signal.aborted to cancel
  const cts = new vscode.CancellationTokenSource();
  const cancelCheck = setInterval(() => { if (signal.aborted) cts.cancel(); }, 200);

  let accumulated = '';
  try {
    const response = await model.sendRequest(
      vsMessages,
      { modelOptions: { temperature: payload.settings.temperature ?? 0.5 } },
      cts.token,
    );

    for await (const part of response.text) {
      if (signal.aborted) break;
      accumulated += part;
      onChunk({ tabId, delta: part });
    }

    onComplete({
      tabId,
      message: {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: accumulated,
        timestamp: Date.now(),
      },
      duration: Date.now() - t0,
    });
  } catch (err) {
    if (signal.aborted) return; // cancelled — don't fire onError
    const message = err instanceof vscode.LanguageModelError
      ? `Copilot error [${err.code}]: ${err.message}`
      : err instanceof Error ? err.message : String(err);
    onError({ tabId, message, code: err instanceof vscode.LanguageModelError ? err.code : '500' });
  } finally {
    clearInterval(cancelCheck);
    cts.dispose();
  }
}
