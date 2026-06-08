/**
 * AI handler — bridges webview messages to ai-executor.
 * Handles send, cancel, and streaming responses.
 * Injects connected MCP tools and handles tool call loops.
 */
import {
  executeAiRequest, startAiRequest, cancelAiRequest, cleanupAiRequest, buildAiRequest,
} from '../../../ai/ai-executor';
import { executeCopilotRequest } from '../../../ai/copilot-executor';
import { AI_PROVIDERS } from '../../../ai/ai-providers';
import type { AiMessage, AiRequestPayload, AiSettings, AiToolDef } from '../../../ai/ai-types';
import { DEFAULT_AI_SETTINGS } from '../../../ai/ai-types';
import { loadEnvVars, resolveEnvString } from './env-resolver';
import { getSetting, insertAudit } from '../../../storage/db';
import { getAiMcpTools, callAiMcpTool } from './ai-mcp-handler';
import { resolveProviderAuth, autoResolveProvider, resolveProviderConfig } from '../../../services/llm/llm-provider-service';

type PostMessage = (msg: unknown) => void;

/**
 * Handle ai:send — execute an AI completion request.
 */
export async function handleAiSend(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  // Use stored default provider — user sets this in LLM Provider settings (falls back to copilot)
  const storedDefaultProvider = getSetting<string>('aiDefaultProvider') ?? 'copilot';
  const requestedProvider = (msg.provider as string) || storedDefaultProvider;
  const requestedModel = msg.model as string || '';
  const baseUrl = msg.baseUrl as string || '';
  const envId = msg.envId as string | undefined;

  // Resolve env vars
  const vars = loadEnvVars(envId);
  const resolvedUrl = resolveEnvString(baseUrl, vars);
  const resolvedModel = resolveEnvString(requestedModel, vars);

  // Auto-resolve: if requested provider has no key, fall back to Copilot → first keyed provider
  let providerId = requestedProvider;
  let effectiveModel = resolvedModel;
  let routeToCopilot = requestedProvider === 'copilot';
  let resolvedBaseUrl = resolvedUrl;
  try {
    const resolved = await autoResolveProvider(requestedProvider, resolvedModel);
    providerId = resolved.providerId;
    effectiveModel = resolved.model || resolvedModel;
    routeToCopilot = resolved.routeToCopilot;
    // Use autoResolve's baseUrl (e.g. daakia-mock user-configured URL), else fall back to
    // webview-supplied URL. If still empty, resolveProviderConfig reads user/registry config.
    resolvedBaseUrl = resolvedUrl || resolved.baseUrl || resolveProviderConfig(providerId).baseUrl;
  } catch (err) {
    // No provider available at all — surface a helpful error immediately
    postMessage({
      type: 'ai:error',
      tabId,
      message: err instanceof Error ? err.message : 'No AI provider configured',
      code: '503',
    });
    return;
  }

  // Logical stage name — callers may pass a templateKey (e.g. "mock.websocket.generate")
  // or an agent label (e.g. "REST Agent"). Defaults to 'DAAKIA_AI' for general AI chat.
  const auditStage = (msg.stage as string | undefined) || 'DAAKIA_AI';

  // Build messages array from conversation + system prompts + user prompt
  const systemPrompts = (msg.systemPrompts as string[]) || [];
  const userPrompt = (msg.userPrompt as string) || '';
  const conversation = (msg.conversation as AiMessage[]) || [];
  const tools = (msg.tools as AiToolDef[]) || [];
  const mcpServerConfigs = (msg.mcpServerConfigs as any[]) || [];
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

  // Resolve auth: always inject from OS keychain (webview never sends LLM credentials)
  const resolvedAuth = await resolveProviderAuth(
    providerId as AiRequestPayload['provider'],
    resolvedUrl,
    undefined,  // let resolveProviderAuth pick the correct authType per provider
    {},         // always empty — webview never sends LLM keys
  );

  // Resolve env vars in auth data (in case user put {{ENV_VAR}} in the key)
  if (resolvedAuth.authData.token) {
    resolvedAuth.authData.token = resolveEnvString(resolvedAuth.authData.token, vars);
  }
  if (resolvedAuth.authData.keyValue) {
    resolvedAuth.authData.keyValue = resolveEnvString(resolvedAuth.authData.keyValue as string, vars);
  }

  const payload: AiRequestPayload = {
    tabId,
    provider: providerId as AiRequestPayload['provider'],
    model: effectiveModel,
    baseUrl: resolvedBaseUrl,
    chatEndpoint,
    messages,
    tools: allTools.length ? allTools : undefined,
    settings,
    authType: resolvedAuth.authType,
    authData: resolvedAuth.authData,
  };

  const signal = startAiRequest(tabId);

  // Hard timeout — fire ai:error if the request hangs with no response at all
  const REQUEST_TIMEOUT_MS = 60_000;
  const timeoutId = setTimeout(() => {
    if (!signal.aborted) {
      cancelAiRequest(tabId);
      cleanupAiRequest(tabId);
      postMessage({ type: 'ai:error', tabId, message: 'Request timed out after 60 seconds. Check your provider URL and API key.', code: 'TIMEOUT' });
    }
  }, REQUEST_TIMEOUT_MS);

  // Send request debug info to webview DevTools BEFORE execution
  postMessage({
    type: 'ai:debug',
    tabId,
    phase: 'request',
    data: {
      provider: providerId,
      model: resolvedModel,
      baseUrl: resolvedBaseUrl,
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

  // GitHub Copilot — route through VS Code Language Model API (no HTTP)
  if (routeToCopilot) {
    executeCopilotRequest({
      payload,
      signal,
      onChunk: (chunk) => { clearTimeout(timeoutId); postMessage({ type: 'ai:chunk', ...chunk }); },
      onComplete: (result) => {
        clearTimeout(timeoutId);
        cleanupAiRequest(tabId);
        postMessage({ type: 'ai:complete', ...result });
        // AI calls are tracked in the AI Audit panel — not in HTTP request history
        try {
          insertAudit({
            conversation_id: tabId,
            stage: auditStage,
            model: 'copilot',
            // Full actual request — system prompts + conversation + user prompt are all in messages[]
            request_payload: JSON.stringify({
              provider: 'copilot',
              model: 'copilot',
              messages,         // complete message array (system + history + user)
              tools: allTools.length ? allTools : [],
              settings,
            }),
            // Full actual response
            response_payload: JSON.stringify({
              message: result.message,
              tokens: result.tokens,
              duration: result.duration,
            }),
            duration_ms: result.duration,
          });
        } catch { /* ignore audit errors */ }
      },
      onError: (error) => {
        clearTimeout(timeoutId);
        cleanupAiRequest(tabId);
        postMessage({ type: 'ai:error', ...error });
        try {
          insertAudit({
            conversation_id: tabId,
            stage: auditStage,
            model: 'copilot',
            request_payload: JSON.stringify({
              provider: 'copilot',
              model: 'copilot',
              messages,
              tools: allTools.length ? allTools : [],
              settings,
            }),
            error: error.message,
            duration_ms: 0,
          });
        } catch { /* ignore audit errors */ }
      },
    });
    return;
  }

  executeAiRequest({
    payload,
    signal,
    onChunk: (chunk) => {
      postMessage({ type: 'ai:chunk', ...chunk });
    },
    onComplete: async (result) => {
      clearTimeout(timeoutId);
      // Check if the AI response contains tool_calls that need MCP execution
      if (result.message.toolCalls?.length && mcpTools.length > 0) {
        // Execute MCP tool calls and continue the conversation
        await handleMcpToolCallLoop(tabId, payload, result, postMessage, refreshHistory);
        return;
      }

      cleanupAiRequest(tabId);
      postMessage({ type: 'ai:complete', ...result });

      // AI calls are tracked in the AI Audit panel — not in HTTP request history
      // Save to AI audit log — full actual request + full actual response, no duplication
      try {
        insertAudit({
          conversation_id: tabId,
          stage: auditStage,
          model: effectiveModel,
          // Full actual request sent to the AI API
          // messages[] contains all system prompts + conversation history + current user prompt
          // authData intentionally omitted (contains API keys)
          request_payload: JSON.stringify({
            provider: providerId,
            model: effectiveModel,
            baseUrl: resolvedBaseUrl,
            chatEndpoint,
            messages,
            tools: allTools.length ? allTools : [],
            settings,
          }),
          // Full actual response received from the AI API
          response_payload: JSON.stringify({
            message: result.message,
            tokens: result.tokens,
            duration: result.duration,
          }),
          duration_ms: result.duration,
        });
      } catch { /* ignore audit errors */ }
    },
    onError: (error) => {
      clearTimeout(timeoutId);
      cleanupAiRequest(tabId);
      console.error('[AI Handler Error]', tabId, error.message, error.code);
      if (error.diagnostics) {
        console.error('[AI Handler Diagnostics]', JSON.stringify(error.diagnostics, null, 2));
      }
      postMessage({ type: 'ai:error', ...error });

      // AI errors are tracked in the AI Audit panel — not in HTTP request history
      // Save error to AI audit log
      try {
        insertAudit({
          conversation_id: tabId,
          stage: auditStage,
          model: effectiveModel,
          request_payload: JSON.stringify({
            provider: providerId,
            model: effectiveModel,
            baseUrl: resolvedBaseUrl,
            chatEndpoint,
            messages,
            tools: allTools.length ? allTools : [],
            settings,
          }),
          // No response_payload on error — capture the error details instead
          response_payload: JSON.stringify({
            error: error.message,
            code: error.code,
            diagnostics: error.diagnostics ?? null,
          }),
          error: error.message,
          duration_ms: 0,
        });
      } catch { /* ignore audit errors */ }
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
