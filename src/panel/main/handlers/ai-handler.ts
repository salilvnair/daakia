/**
 * AI handler — bridges webview messages to ai-executor.
 * Handles send, cancel, and streaming responses.
 * Injects connected MCP tools and handles tool call loops.
 */
import {
  executeAiRequest, startAiRequest, cancelAiRequest, cleanupAiRequest, buildAiRequest,
} from '../../../ai/ai-executor';
import { AI_PROVIDERS } from '../../../ai/ai-providers';
import type { AiMessage, AiRequestPayload, AiSettings, AiToolDef } from '../../../ai/ai-types';
import { DEFAULT_AI_SETTINGS } from '../../../ai/ai-types';
import { loadEnvVars, resolveEnvString } from './env-resolver';
import { insertHistory, trimHistory } from '../../../storage/db';
import { getAiMcpTools, callAiMcpTool } from './ai-mcp-handler';

type PostMessage = (msg: unknown) => void;

/**
 * Handle ai:send — execute an AI completion request.
 */
export async function handleAiSend(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
  refreshHistory?: () => void,
) {
  const tabId = msg.tabId as string;
  const providerId = msg.provider as string || 'openai';
  const model = msg.model as string || '';
  const baseUrl = msg.baseUrl as string || '';
  const envId = msg.envId as string | undefined;

  // Resolve env vars
  const vars = loadEnvVars(envId);
  const resolvedUrl = resolveEnvString(baseUrl, vars);
  const resolvedModel = resolveEnvString(model, vars);

  // Build messages array from conversation + system prompts + user prompt
  const systemPrompts = (msg.systemPrompts as string[]) || [];
  const userPrompt = (msg.userPrompt as string) || '';
  const conversation = (msg.conversation as AiMessage[]) || [];
  const tools = (msg.tools as AiToolDef[]) || [];
  const rawSettings = (msg.settings as Partial<AiSettings>) || {};

  const settings: AiSettings = { ...DEFAULT_AI_SETTINGS, ...rawSettings };

  // Construct full message array: system prompts + conversation history
  const messages: AiMessage[] = [];

  // System prompts
  for (const sp of systemPrompts) {
    const resolved = resolveEnvString(sp, vars);
    if (resolved.trim()) {
      messages.push({
        id: crypto.randomUUID(),
        role: 'system',
        content: resolved,
        timestamp: Date.now(),
      });
    }
  }

  // Existing conversation history
  for (const m of conversation) {
    messages.push({ ...m, content: resolveEnvString(m.content, vars) });
  }

  // Add current user prompt (webview sends old conversation, then appends locally)
  if (userPrompt.trim()) {
    messages.push({
      id: crypto.randomUUID(),
      role: 'user',
      content: resolveEnvString(userPrompt, vars),
      timestamp: Date.now(),
    });
  }

  // Get provider info for chat endpoint
  const provider = AI_PROVIDERS.find(p => p.id === providerId);
  const chatEndpoint = provider?.chatEndpoint || '/chat/completions';

  // Merge user-defined tools with connected MCP server tools
  const mcpTools = getAiMcpTools(tabId);
  const allTools = [...tools, ...mcpTools];

  const payload: AiRequestPayload = {
    tabId,
    provider: providerId as AiRequestPayload['provider'],
    model: resolvedModel,
    baseUrl: resolvedUrl,
    chatEndpoint,
    messages,
    tools: allTools.length ? allTools : undefined,
    settings,
    authType: (msg.authType as string) || 'bearer',
    authData: (msg.authData as Record<string, string>) || {},
  };

  // Resolve auth token from env
  if (payload.authData.token) {
    payload.authData.token = resolveEnvString(payload.authData.token, vars);
  }
  if (payload.authData.keyValue) {
    payload.authData.keyValue = resolveEnvString(payload.authData.keyValue, vars);
  }

  const signal = startAiRequest(tabId);

  // Send request debug info to webview DevTools BEFORE execution
  postMessage({
    type: 'ai:debug',
    tabId,
    phase: 'request',
    data: {
      provider: providerId,
      model: resolvedModel,
      baseUrl: resolvedUrl,
      chatEndpoint,
      messageCount: messages.length,
      systemPrompts: systemPrompts.map(s => s.slice(0, 200)),
      userPrompt: userPrompt.slice(0, 500),
      toolCount: allTools.length,
      toolNames: allTools.map(t => t.function.name),
      settings,
      authType: msg.authType,
      mcpToolCount: mcpTools.length,
    },
  });

  executeAiRequest({
    payload,
    signal,
    onChunk: (chunk) => {
      postMessage({ type: 'ai:chunk', ...chunk });
    },
    onComplete: async (result) => {
      // Check if the AI response contains tool_calls that need MCP execution
      if (result.message.toolCalls?.length && mcpTools.length > 0) {
        // Execute MCP tool calls and continue the conversation
        await handleMcpToolCallLoop(tabId, payload, result, postMessage, refreshHistory);
        return;
      }

      cleanupAiRequest(tabId);
      postMessage({ type: 'ai:complete', ...result });

      // Save to history
      try {
        insertHistory({
          protocol: 'ai',
          method: providerId.toUpperCase(),
          url: `${resolvedUrl} → ${resolvedModel}`,
          status: 200,
          response_time: result.duration,
          request_data: JSON.stringify({
            aiProvider: providerId,
            aiModel: model,
            aiSystemPrompts: systemPrompts,
            aiUserPrompt: userPrompt,
            aiTools: tools,
            aiSettings: settings,
            aiConversation: conversation.slice(-5),
          }),
          response_data: JSON.stringify({
            content: result.message.content.slice(0, 500),
            tokens: result.tokens,
          }),
        });
        trimHistory(500);
        refreshHistory?.();
      } catch { /* ignore history errors */ }
    },
    onError: (error) => {
      cleanupAiRequest(tabId);
      console.error('[AI Handler Error]', tabId, error.message, error.code);
      if (error.diagnostics) {
        console.error('[AI Handler Diagnostics]', JSON.stringify(error.diagnostics, null, 2));
      }
      postMessage({ type: 'ai:error', ...error });

      // Save error to history
      try {
        insertHistory({
          protocol: 'ai',
          method: providerId.toUpperCase(),
          url: `${resolvedUrl} → ${resolvedModel}`,
          status: parseInt(error.code || '0') || 0,
          response_time: 0,
          request_data: JSON.stringify({ provider: providerId, model: resolvedModel }),
          response_data: JSON.stringify({ error: error.message, diagnostics: error.diagnostics }),
        });
        trimHistory(500);
        refreshHistory?.();
      } catch { /* ignore */ }
    },
  });
}

/**
 * Handle MCP tool call loop — when AI returns tool_calls, execute them via MCP,
 * send results back to the model, and continue until no more tool calls.
 */
async function handleMcpToolCallLoop(
  tabId: string,
  payload: AiRequestPayload,
  result: { message: AiMessage; tokens?: { prompt: number; completion: number; total: number }; duration: number },
  postMessage: PostMessage,
  refreshHistory?: () => void,
  depth = 0,
) {
  const MAX_TOOL_LOOPS = 10; // Safety limit to prevent infinite loops
  if (depth >= MAX_TOOL_LOOPS) {
    cleanupAiRequest(tabId);
    postMessage({ type: 'ai:error', tabId, message: 'Too many tool call iterations (limit: 10)', code: '429' });
    return;
  }

  const toolCalls = result.message.toolCalls || [];

  // Send the assistant message with tool_calls to the webview for display
  postMessage({ type: 'ai:toolCalls', tabId, message: result.message });

  // Execute each tool call via MCP
  const toolResults: AiMessage[] = [];
  for (const tc of toolCalls) {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* use empty */ }

    // Notify webview that tool is being executed
    postMessage({ type: 'ai:toolExecuting', tabId, toolCallId: tc.id, toolName: tc.function.name });

    const callResult = await callAiMcpTool(tabId, tc.function.name, args);

    const toolMsg: AiMessage = {
      id: crypto.randomUUID(),
      role: 'tool',
      content: callResult.success ? (callResult.result || '') : `Error: ${callResult.error}`,
      toolCallId: tc.id,
      timestamp: Date.now(),
    };
    toolResults.push(toolMsg);

    // Notify webview of tool result
    postMessage({ type: 'ai:toolResult', tabId, toolCallId: tc.id, message: toolMsg });
  }

  // Build new messages array: existing + assistant with tool_calls + tool results
  const updatedMessages = [
    ...payload.messages,
    result.message,
    ...toolResults,
  ];

  // Send follow-up request to AI with tool results
  const followUpPayload: AiRequestPayload = {
    ...payload,
    messages: updatedMessages,
  };

  executeAiRequest({
    payload: followUpPayload,
    signal: new AbortController().signal, // tool loop follow-ups are not independently cancellable
    onChunk: (chunk) => {
      postMessage({ type: 'ai:chunk', ...chunk });
    },
    onComplete: async (followUpResult) => {
      // Recurse if more tool calls
      if (followUpResult.message.toolCalls?.length) {
        await handleMcpToolCallLoop(tabId, followUpPayload, followUpResult, postMessage, refreshHistory, depth + 1);
        return;
      }
      cleanupAiRequest(tabId);
      postMessage({ type: 'ai:complete', ...followUpResult });
    },
    onError: (error) => {
      cleanupAiRequest(tabId);
      console.error('[AI MCP Follow-up Error]', tabId, error.message, error.code);
      if (error.diagnostics) {
        console.error('[AI MCP Follow-up Diagnostics]', JSON.stringify(error.diagnostics, null, 2));
      }
      postMessage({ type: 'ai:error', ...error });
    },
  });
}

/**
 * Handle ai:cancel — abort an in-progress AI request.
 */
export function handleAiCancel(msg: Record<string, unknown>, postMessage: PostMessage) {
  const tabId = msg.tabId as string;
  cancelAiRequest(tabId);
  postMessage({ type: 'ai:cancelled', tabId });
}
