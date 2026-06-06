/**
 * @daakia Chat Participant handler.
 * Registers with VS Code Chat API and routes commands to specialized agents.
 * All system prompts and follow-up definitions live in prompt-template.ts.
 */
import * as vscode from 'vscode';
import {
  AGENT_SYSTEM_PROMPTS,
  FOLLOWUPS,
  buildHelpText,
} from './prompt-template';
import { classifyIntent } from './master-agent';

// ─── Helpers ───

function stripMention(text: string): string {
  return text.replace(/^@daakia\s*/i, '').trim();
}

function buildMessages(
  systemPrompt: string,
  history: readonly vscode.ChatRequestTurn[] | readonly vscode.ChatResponseTurn[],
  userText: string,
): vscode.LanguageModelChatMessage[] {
  const msgs: vscode.LanguageModelChatMessage[] = [
    vscode.LanguageModelChatMessage.User(`System: ${systemPrompt}`),
  ];

  // Include recent history (last 6 turns to stay within token budget)
  const recentHistory = [...history].slice(-6);
  for (const turn of recentHistory) {
    if (turn instanceof vscode.ChatRequestTurn) {
      msgs.push(vscode.LanguageModelChatMessage.User(turn.prompt));
    } else if (turn instanceof vscode.ChatResponseTurn) {
      const text = turn.response
        .filter(p => p instanceof vscode.ChatResponseMarkdownPart)
        .map(p => (p as vscode.ChatResponseMarkdownPart).value.value)
        .join('');
      if (text) {
        msgs.push(vscode.LanguageModelChatMessage.Assistant(text));
      }
    }
  }

  msgs.push(vscode.LanguageModelChatMessage.User(userText));
  return msgs;
}

function getCommandDefaultPrompt(command: string): string {
  const defaults: Record<string, string> = {
    request: 'Help me build an API request',
    mock:    'Help me create a mock endpoint',
    test:    'Help me write test assertions',
    curl:    'Convert this cURL command',
    explain: 'Explain this HTTP concept',
  };
  return defaults[command] ?? 'Help me with my API';
}

async function selectModel(): Promise<vscode.LanguageModelChat | undefined> {
  for (const selector of [
    { vendor: 'copilot', family: 'gpt-4o' },
    { family: 'gpt-4o' },
  ]) {
    try {
      const [model] = await vscode.lm.selectChatModels(selector);
      if (model) return model;
    } catch { /* try next */ }
  }
  return undefined;
}

// ─── Main handler factory ───

export function createDaakiaChatHandler(_opts: { extensionUri: vscode.Uri }): vscode.ChatRequestHandler {
  return async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<vscode.ChatResult> => {
    const rawText = stripMention(request.prompt ?? '').trim();
    // If user typed a /command, use it; otherwise run master agent to classify intent
    const command = request.command
      ? request.command
      : await classifyIntent(rawText, token);

    // Empty prompt — show help
    if (!rawText && command === 'general') {
      stream.markdown(buildHelpText());
      return { metadata: { daakia_followups: FOLLOWUPS.general } };
    }

    const systemPrompt = AGENT_SYSTEM_PROMPTS[command] ?? AGENT_SYSTEM_PROMPTS.general;
    const userText = rawText || getCommandDefaultPrompt(command);

    const model = await selectModel();

    if (!model) {
      stream.markdown([
        '⚠️ **No AI model available.**',
        '',
        'Daakia\'s chat participant requires GitHub Copilot or another VS Code language model.',
        'Please sign in to GitHub Copilot and try again.',
        '',
        'Alternatively, use the **Daakia AI panel** directly (open Daakia → switch to AI tab),',
        'which supports custom providers (OpenAI, Anthropic, Gemini, Ollama, and more).',
      ].join('\n'));
      return {};
    }

    const msgs = buildMessages(systemPrompt, context.history, userText);

    try {
      const response = await model.sendRequest(msgs, {}, token);

      for await (const chunk of response.text) {
        if (token.isCancellationRequested) break;
        stream.markdown(chunk);
      }

      if (command === 'request' || command === 'curl' || command === 'soap' || command === 'graphql') {
        stream.button({
          command: 'daakia.openPanel',
          title: '$(rocket) Open in Daakia',
          tooltip: 'Open Daakia API client to build this request',
        });
      }

    } catch (err) {
      if (err instanceof vscode.LanguageModelError) {
        if (err.code === vscode.LanguageModelError.Blocked().code) {
          stream.markdown('🚫 This request was blocked by the content policy.');
          return {};
        }
        if (err.code === vscode.LanguageModelError.NotFound().code) {
          stream.markdown('⚠️ The selected AI model is not available. Please try again.');
          return {};
        }
        if (err.code === vscode.LanguageModelError.NoPermissions().code) {
          stream.markdown('🔒 No permission to use this model. Please check your Copilot subscription.');
          return {};
        }
      }
      stream.markdown(`❌ An error occurred: ${err instanceof Error ? err.message : String(err)}`);
      return {};
    }

    const followups = FOLLOWUPS[command] ?? FOLLOWUPS.general;
    return { metadata: { daakia_followups: followups } };
  };
}
