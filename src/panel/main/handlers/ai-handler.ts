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
import type { AiMessage, AiRequestPayload, AiSettings, AiToolDef, AiStreamChunk, AiResponseComplete } from '../../../ai/ai-types';
import { DEFAULT_AI_SETTINGS } from '../../../ai/ai-types';
import { loadEnvVars, resolveEnvString } from './env-resolver';
import {
  getSetting, insertAudit, insertHistory,
  upsertAiConversation, getAiConversations, getAiConversationById,
  deleteAiConversation, clearAiConversations,
} from '../../../storage/db';
import { getAiMcpTools, callAiMcpTool } from './ai-mcp-handler';
import { DK8S_SEARCH_TOOL, runDk8sSearch, toModelText, type Dk8sSearchArgs, type Dk8sSearchResult } from '../../../ai/tools/dk8s-search';
import { KUBECTL_RUN_TOOL, runKubectlTool, kubectlToModelText, type KubectlRunResult } from '../../../ai/tools/kubectl-run';
import { run as runKubectl } from '../../../services/k8s/kubectl';
import { DAAKIA_DOCS_TOOL, runDaakiaDocs, type DocsResult } from '../../../ai/tools/daakia-docs';
import { watchedPodTargets, archiveSearcher } from './k8s-handler';
import { searchLogs, type SearchTarget } from '../../../services/k8s/k8s-log-search';
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
    const message = err instanceof Error ? err.message : 'No AI provider configured';
    postMessage({ type: 'ai:error', tabId, message, code: '503', stage: msg.stage });
    /*
      And record it.

      Every other failure on this path writes an audit row; this one returned
      before reaching them, so the most common failure of all — no provider
      configured, no key — was the one that left no trace in the AI footprint.
      A button that does nothing and logs nothing is indistinguishable from a
      button that was never pressed.
    */
    try {
      insertAudit({
        conversation_id: tabId,
        stage: (msg.stage as string | undefined) || 'DAAKIA_AI',
        model: requestedModel || '(unresolved)',
        request_payload: JSON.stringify({
          provider: requestedProvider || '(none)',
          userPrompt: (msg.userPrompt as string | undefined)?.slice(0, 2000),
        }),
        response_payload: JSON.stringify({ error: message, code: '503' }),
        duration_ms: 0,
      });
    } catch { /* an audit failure must not mask the error it is recording */ }
    return;
  }

  /*
    Who will actually answer. The screen shows the model it asked for, and the
    two differ more often than they look: a provider with no key falls through
    to the next that has one, and a key from the environment brings its own
    model. Said before the call, so the header is right while it thinks.
  */
  postMessage({ type: 'ai:resolved', tabId, provider: providerId, model: effectiveModel });

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
  // 6D.22 — multimodal image attachments
  const images = (msg.images as Array<{ id: string; type: 'url' | 'base64'; url?: string; base64?: string; mimeType?: string }>) || [];

  /*
    The Daakia AI conversation can search the pods dk8s is watching.

    Offered only from that screen and only when something is being watched:
    a tool the model can call but that has nothing to search is a tool it will
    call and then apologise for. Non-streaming when it is offered, because the
    executor drops tool calls from a stream — and the Daakia AI screen shows
    the answer whole anyway, so nothing a reader sees is lost.
  */
  const dk8sTargets = targetsFrom(msg.dk8sTargets);
  const offersDk8s = (msg.screen === 'Daakia AI' || msg.stage === 'ai.chat')
    && msg.dk8s !== false            // the header chip, turned off
    && dk8sTargets.length > 0;
  if (offersDk8s) dk8sTargetsByTab.set(tabId, dk8sTargets);
  /* The manual is offered to every Daakia AI conversation, dk8s or not: "how
     do I … in Daakia" is answered from it instead of from a feature list. */
  const offersDocs = msg.screen === 'Daakia AI' || msg.stage === 'ai.chat';
  const offersTools = offersDk8s || offersDocs;
  const settings: AiSettings = {
    ...DEFAULT_AI_SETTINGS, ...rawSettings,
    ...(offersTools ? { stream: false } : {}),
  };
  /*
    Room for a thinking model to think AND answer. DeepSeek's reasoning counts
    against max_tokens, so at the chat's 1024 an answer over a search result
    came back cut mid-sentence (finish_reason "length") — or, when the
    reasoning took it all, empty, and the card showed with no answer above it.
  */
  if (offersTools) settings.maxTokens = Math.max(settings.maxTokens || 0, 8192);

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

  // Add current user prompt — with optional image attachments (6D.22 multimodal)
  if (userPrompt.trim() || images.length > 0) {
    const resolvedPrompt = resolveEnvString(userPrompt, vars);
    // Build multimodal content if images are present
    // For providers that support it (OpenAI, Anthropic, Google), the executor
    // will receive images via the imageAttachments field and inject into the request body.
    messages.push({
      id: crypto.randomUUID(),
      role: 'user',
      content: resolvedPrompt,
      timestamp: Date.now(),
      // Pass images as extra metadata for executor to build multimodal content
      ...(images.length > 0 ? { imageAttachments: images } : {}),
    } as AiMessage & { imageAttachments?: typeof images });
  }

  // Get provider info for chat endpoint
  const provider = AI_PROVIDERS.find(p => p.id === providerId);
  const chatEndpoint = provider?.chatEndpoint || '/chat/completions';

  // Merge user-defined tools with connected MCP server tools
  const mcpTools = getAiMcpTools(tabId);
  const allTools = [
    ...tools, ...mcpTools,
    ...(offersDk8s ? [DK8S_SEARCH_TOOL, KUBECTL_RUN_TOOL] : []),
    ...(offersDocs ? [DAAKIA_DOCS_TOOL] : []),
  ];

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
  stoppedTabs.delete(tabId);
  /* A new question starts clean: a search from a stopped answer that finished
     late would otherwise be handed to this one's card as if it had run for it. */
  dk8sResults.delete(tabId);

  // Hard timeout — fire ai:error if the request hangs with no response at all
  const REQUEST_TIMEOUT_MS = 60_000;
  const timeoutId = setTimeout(() => {
    if (!signal.aborted) {
      cancelAiRequest(tabId);
      cleanupAiRequest(tabId);
      postMessage({ type: 'ai:error', tabId, stage: auditStage, message: 'Request timed out after 60 seconds. Check your provider URL and API key.', code: 'TIMEOUT' });
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
        /* `tabId` last: it is the only field that says which request this
           belongs to, and a spread that happened to carry an undefined one
           would silently unaddress the error again. */
        postMessage({ type: 'ai:error', stage: auditStage, ...error, tabId });
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
      if (result.message.toolCalls?.length && (mcpTools.length > 0 || offersTools)) {
        // Execute MCP tool calls and continue the conversation
        await handleMcpToolCallLoop(tabId, payload, result, postMessage, auditStage);
        return;
      }

      if (signal.aborted || stoppedTabs.has(tabId)) return;
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

      // 6D.18 — Record AI invocation in history panel (protocol='ai')
      try {
        const userMsg = messages.slice().reverse().find(m => m.role === 'user');
        const promptPreview = (userMsg?.content || '').slice(0, 200);
        const responsePreview = (result.message.content || '').slice(0, 200);
        insertHistory({
          request_id: tabId,
          method: providerId,                           // "openai", "anthropic", etc.
          url: resolvedBaseUrl || effectiveModel,       // API base URL — falls back to model name for providers with no URL (e.g. Copilot)
          status: 200,
          status_text: `${result.tokens?.total ?? 0} tokens`,
          response_time: result.duration,
          response_size: result.tokens?.total ?? (result.message.content?.length ?? 0),
          request_data: JSON.stringify({ provider: providerId, model: effectiveModel, promptPreview, toolCount: allTools.length, settings }),
          response_data: JSON.stringify({ body: responsePreview, contentType: 'text/plain', tokens: result.tokens }),
          protocol: 'ai',
        });
      } catch { /* ignore history errors */ }
    },
    onError: (error) => {
      clearTimeout(timeoutId);
      cleanupAiRequest(tabId);
      console.error('[AI Handler Error]', tabId, error.message, error.code);
      if (error.diagnostics) {
        console.error('[AI Handler Diagnostics]', JSON.stringify(error.diagnostics, null, 2));
      }
      /* `tabId` last: it is the only field that says which request this
           belongs to, and a spread that happened to carry an undefined one
           would silently unaddress the error again. */
        postMessage({ type: 'ai:error', stage: auditStage, ...error, tabId });

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
/*
  Tabs whose answer was stopped from the composer.

  The tool loop outlives the first request: its follow-up calls went out with a
  signal of their own, so Stop cancelled a request that had already finished
  and the answer arrived anyway, after the thread had said "stopped". The loop
  checks this before each tool, before each follow-up and before it answers.
  A new send clears it.
*/
const stoppedTabs = new Set<string>();

async function handleMcpToolCallLoop(
  tabId: string,
  payload: AiRequestPayload,
  result: { message: AiMessage; tokens?: { prompt: number; completion: number; total: number }; duration: number },
  postMessage: PostMessage,
  /** Which feature this call belongs to, so a failure here is not filed as generic AI. */
  auditStage: string,
  depth = 0,
) {
  const MAX_TOOL_LOOPS = 10; // Safety limit to prevent infinite loops
  if (depth >= MAX_TOOL_LOOPS) {
    cleanupAiRequest(tabId);
    postMessage({ type: 'ai:error', tabId, stage: auditStage, message: 'Too many tool call iterations (limit: 10)', code: '429' });
    return;
  }

  if (stoppedTabs.has(tabId)) { dk8sResults.delete(tabId); return; }
  const toolCalls = result.message.toolCalls || [];

  // Send the assistant message with tool_calls to the webview for display
  postMessage({ type: 'ai:toolCalls', tabId, message: result.message });

  // Execute each tool call via MCP
  const toolResults: AiMessage[] = [];
  for (const tc of toolCalls) {
    if (stoppedTabs.has(tabId)) { dk8sResults.delete(tabId); return; }
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* use empty */ }

    // Notify webview that tool is being executed
    postMessage({ type: 'ai:toolExecuting', tabId, toolCallId: tc.id, toolName: tc.function.name });

    const callResult = tc.function.name === DK8S_SEARCH_TOOL.function.name
      ? await runDk8sForConversation(tabId, tc.id, args as unknown as Dk8sSearchArgs, postMessage)
      : tc.function.name === KUBECTL_RUN_TOOL.function.name
      ? await runKubectlForConversation(tabId, tc.id, args as { command?: string; why?: string }, postMessage)
      : tc.function.name === DAAKIA_DOCS_TOOL.function.name
      ? runDocsForConversation(tabId, tc.id, String((args as { query?: unknown }).query ?? ''), postMessage)
      : await callAiMcpTool(tabId, tc.function.name, args);

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

  /* Stopped while a tool ran: no follow-up, and its results go nowhere. */
  if (stoppedTabs.has(tabId)) { dk8sResults.delete(tabId); return; }

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
    /* Stopped from the composer: the follow-up is abandoned where it stands. */
    signal: { get aborted() { return stoppedTabs.has(tabId); } },
    onChunk: (chunk) => {
      postMessage({ type: 'ai:chunk', ...chunk });
    },
    onComplete: async (followUpResult) => {
      // Recurse if more tool calls
      if (followUpResult.message.toolCalls?.length) {
        await handleMcpToolCallLoop(tabId, followUpPayload, followUpResult, postMessage, auditStage, depth + 1);
        return;
      }
      if (stoppedTabs.has(tabId)) { dk8sResults.delete(tabId); return; }
      cleanupAiRequest(tabId);
      postMessage({ type: 'ai:complete', ...followUpResult, dk8s: takeDk8sResults(tabId) });
    },
    onError: (error) => {
      cleanupAiRequest(tabId);
      dk8sResults.delete(tabId);
      console.error('[AI MCP Follow-up Error]', tabId, error.message, error.code);
      if (error.diagnostics) {
        console.error('[AI MCP Follow-up Diagnostics]', JSON.stringify(error.diagnostics, null, 2));
      }
      /* `tabId` last: it is the only field that says which request this
           belongs to, and a spread that happened to carry an undefined one
           would silently unaddress the error again. */
        postMessage({ type: 'ai:error', stage: auditStage, ...error, tabId });
    },
  });
}

/*
  Structured results of the searches a conversation ran, until its answer
  lands. The model gets text it can cite; the card the user sees is drawn from
  these, so nothing the model writes can put a line on screen that the search
  did not find.
*/
/** What each answer's tools returned, in order — searches and kubectl runs — for the cards. */
const dk8sResults = new Map<string, (Dk8sSearchResult | KubectlRunResult | DocsResult)[]>();
/** The pods each conversation's request may search, for the tool loop to use. */
const dk8sTargetsByTab = new Map<string, SearchTarget[]>();

/**
 * The pods the webview says are on screen, else the ones this host watches.
 *
 * Only well-formed names get through: these become `kubectl logs` arguments.
 * spawn passes them as separate argv entries, so nothing here is a shell
 * string — the check is to turn a malformed message into "no pods" rather
 * than into a kubectl error the model then has to explain.
 */
function targetsFrom(raw: unknown): SearchTarget[] {
  const NAME = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,252}$/;
  if (Array.isArray(raw) && raw.length) {
    const out: SearchTarget[] = [];
    for (const t of raw as Record<string, unknown>[]) {
      const context = String(t?.context ?? ''), namespace = String(t?.namespace ?? ''), pod = String(t?.pod ?? '');
      if (!NAME.test(context) || !NAME.test(namespace) || !NAME.test(pod)) continue;
      const containers = Array.isArray(t.containers)
        ? (t.containers as unknown[]).map(String).filter(c => NAME.test(c)) : undefined;
      out.push({
        context, namespace, pod,
        containers: containers?.length ? containers : undefined,
        workload: typeof t.workload === 'string' && NAME.test(t.workload) ? t.workload : undefined,
      });
    }
    if (out.length) return out.slice(0, 200);
  }
  return watchedPodTargets();
}

function takeDk8sResults(tabId: string): (Dk8sSearchResult | KubectlRunResult | DocsResult)[] | undefined {
  const results = dk8sResults.get(tabId);
  dk8sResults.delete(tabId);
  return results?.length ? results : undefined;
}

/** One look in the Daakia manual; the sections it used go under the answer as its sources. */
function runDocsForConversation(
  tabId: string,
  toolCallId: string,
  query: string,
  postMessage: PostMessage,
): { success: boolean; result?: string; error?: string } {
  postMessage({ type: 'ai:docsLookup', tabId, toolCallId, query });
  const { result, text } = runDaakiaDocs(query);
  dk8sResults.set(tabId, [...(dk8sResults.get(tabId) ?? []), result]);
  return { success: true, result: text };
}

/**
 * One `kubectl_run` for a conversation: pinned to the context and namespace
 * the user is watching, recorded in the Commands audit like every dk8s call,
 * and kept for the answer's card.
 */
async function runKubectlForConversation(
  tabId: string,
  toolCallId: string,
  args: { command?: string; why?: string },
  postMessage: PostMessage,
): Promise<{ success: boolean; result?: string; error?: string }> {
  const targets = dk8sTargetsByTab.get(tabId) ?? watchedPodTargets();
  if (!targets.length) return { success: false, error: 'No pods are being watched in dk8s, so there is no cluster to ask.' };
  /* The namespace most of the watched pods are in — the one on screen. */
  const counts = new Map<string, number>();
  for (const t of targets) counts.set(t.namespace, (counts.get(t.namespace) ?? 0) + 1);
  const namespace = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const context = targets.find(t => t.namespace === namespace)!.context;
  postMessage({ type: 'ai:kubectlRunStarted', tabId, toolCallId, command: args.command ?? '', why: args.why });
  try {
    const result = await runKubectlTool(args, {
      scope: { context, namespace, pods: targets.filter(t => t.namespace === namespace).map(t => t.pod) },
      run: (a, o) => runKubectl(a, o),
    });
    dk8sResults.set(tabId, [...(dk8sResults.get(tabId) ?? []), result]);
    postMessage({ type: 'ai:kubectlRunResult', tabId, toolCallId, result });
    return { success: true, result: kubectlToModelText(result) };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

async function runDk8sForConversation(
  tabId: string,
  toolCallId: string,
  args: Dk8sSearchArgs,
  postMessage: PostMessage,
): Promise<{ success: boolean; result?: string; error?: string }> {
  /* The plain-text first beat: what is being searched, before any of it is
     back. The screen shows this until the answer and its card replace it. */
  const targets = dk8sTargetsByTab.get(tabId) ?? watchedPodTargets();
  const archive = archiveSearcher();
  postMessage({
    type: 'ai:dk8sSearchStarted', tabId, toolCallId,
    query: args.query, pods: targets.length, archive: !!archive && args.archive !== false,
    around: Math.max(1, Math.min(500, Math.round(args.around ?? 20))),
    namespaces: [...new Set(targets.map(t => t.namespace))],
  });
  try {
    const result = await runDk8sSearch(args, {
      targets, searchLogs, searchArchive: archive,
      onPhase: phase => postMessage({ type: 'ai:dk8sSearchPhase', tabId, toolCallId, ...phase }),
    });
    /*
      Citations continue across the searches of one answer. Each search numbers
      its own lines from [1], so an answer drawn from two searches had two
      [1]s — the model could not say which it meant, and neither could the
      reader. The second search starts after the first one's last number.
    */
    const prior = dk8sResults.get(tabId) ?? [];
    const offset = prior.reduce((top, r) => 'groups' in r
      ? Math.max(top, ...r.groups.flatMap(g => g.lines.map(l => l.n ?? 0))) : top, 0);
    if (offset) for (const g of result.groups) for (const l of g.lines) if (l.n) l.n += offset;
    dk8sResults.set(tabId, [...prior, result]);
    postMessage({ type: 'ai:dk8sSearchResult', tabId, toolCallId, result });
    return { success: true, result: toModelText(result) };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Handle ai:cancel — abort an in-progress AI request.
 */
export function handleAiCancel(msg: Record<string, unknown>, postMessage: PostMessage) {
  const tabId = msg.tabId as string;
  cancelAiRequest(tabId);
  stoppedTabs.add(tabId);
  postMessage({ type: 'ai:cancelled', tabId });
}

/**
 * Handle ai:saveConversation — persist a full conversation to SQLite.
 * msg: { id, title, provider, model, messages: AiMessage[], tokenTotal? }
 */
export function handleAiSaveConversation(msg: Record<string, unknown>, postMessage: PostMessage) {
  try {
    const id = (msg.id as string) || crypto.randomUUID();
    const messages = msg.messages as AiMessage[];
    const tokenTotal = (msg.tokenTotal as number) || messages.reduce((sum, m) => sum + (m.tokens?.total || 0), 0);

    // Auto-generate title from first user message if not provided
    let title = (msg.title as string) || 'Untitled Conversation';
    if (!msg.title) {
      const firstUser = messages.find(m => m.role === 'user');
      if (firstUser?.content) {
        title = firstUser.content.trim().slice(0, 60) + (firstUser.content.length > 60 ? '…' : '');
      }
    }

    upsertAiConversation({
      id,
      title,
      provider: (msg.provider as string) || '',
      model: (msg.model as string) || '',
      messages: JSON.stringify(messages),
      message_count: messages.length,
      token_total: tokenTotal,
    });

    postMessage({ type: 'ai:conversationSaved', id, title });
  } catch (err) {
    postMessage({ type: 'ai:conversationSaveError', error: (err as Error).message });
  }
}

/**
 * Handle ai:loadConversations — fetch conversation list (no messages content, metadata only).
 * msg: { limit? }
 */
export function handleAiLoadConversations(_msg: Record<string, unknown>, postMessage: PostMessage) {
  try {
    const rows = getAiConversations(50);
    postMessage({ type: 'ai:conversations', conversations: rows });
  } catch (err) {
    postMessage({ type: 'ai:conversations', conversations: [], error: (err as Error).message });
  }
}

/**
 * Handle ai:loadConversation — fetch a single conversation with full messages.
 * msg: { id }
 */
export function handleAiLoadConversation(msg: Record<string, unknown>, postMessage: PostMessage) {
  try {
    const id = msg.id as string;
    const row = getAiConversationById(id);
    if (!row) {
      postMessage({ type: 'ai:conversation', conversation: null, error: 'Not found' });
      return;
    }
    const messages = JSON.parse(row.messages || '[]') as AiMessage[];
    postMessage({ type: 'ai:conversation', conversation: { ...row, messages } });
  } catch (err) {
    postMessage({ type: 'ai:conversation', conversation: null, error: (err as Error).message });
  }
}

/**
 * Handle ai:deleteConversation — delete a saved conversation.
 * msg: { id }
 */
export function handleAiDeleteConversation(msg: Record<string, unknown>, postMessage: PostMessage) {
  const id = msg.id as string;
  deleteAiConversation(id);
  postMessage({ type: 'ai:conversationDeleted', id });
}

/**
 * Handle ai:clearConversations — delete all saved conversations.
 */
export function handleAiClearConversations(_msg: Record<string, unknown>, postMessage: PostMessage) {
  clearAiConversations();
  postMessage({ type: 'ai:conversationsCleared' });
}

/**
 * Legacy streaming contract — handleAiChat / handleAiStream / handleAiStreamRequest.
 *
 * 31 AI modals (webview-ui/src/components/ai/*) were built against an `aiChat`/
 * `aiStream`/`aiStreamRequest` postMsg contract, listening for `aiStream:chunk` /
 * `aiStream:done` / `aiStream:error` (or, for the single aiStreamRequest caller,
 * `aiStreamChunk`/`aiStreamDone`/`aiStreamError` correlated by requestId) — but
 * MainPanel.ts never had a `case` for any of these three message types, so every
 * one of those features silently hung forever (found via
 * scripts/audit-ai-message-contracts.mjs). Rather than editing all 31 webview
 * files onto the `ai:send` contract, this reuses the exact same proven
 * provider-resolution/execution engine as handleAiSend (autoResolveProvider,
 * resolveProviderAuth, executeAiRequest/executeCopilotRequest) and re-emits its
 * output under the event names these components already correctly listen for.
 */
async function runLegacyAiStream(
  systemPrompt: string,
  userMessage: string,
  stage: string,
  postMessage: PostMessage,
  events: { chunk: string; done: string; error: string },
  extra: Record<string, unknown> = {},
) {
  const tabId = (extra.requestId as string) || crypto.randomUUID();
  const storedDefaultProvider = getSetting<string>('aiDefaultProvider') ?? 'copilot';

  let providerId = storedDefaultProvider;
  let effectiveModel = '';
  let routeToCopilot = providerId === 'copilot';
  let resolvedBaseUrl = '';
  try {
    const resolved = await autoResolveProvider(storedDefaultProvider, '');
    providerId = resolved.providerId;
    effectiveModel = resolved.model || '';
    routeToCopilot = resolved.routeToCopilot;
    resolvedBaseUrl = resolved.baseUrl || resolveProviderConfig(providerId).baseUrl;
  } catch (err) {
    postMessage({ type: events.error, error: err instanceof Error ? err.message : 'No AI provider configured', ...extra });
    return;
  }

  const provider = AI_PROVIDERS.find(p => p.id === providerId);
  const chatEndpoint = provider?.chatEndpoint || '/chat/completions';
  const resolvedAuth = await resolveProviderAuth(providerId as AiRequestPayload['provider'], resolvedBaseUrl, undefined, {});

  const messages: AiMessage[] = [];
  if (systemPrompt.trim()) {
    messages.push({ id: crypto.randomUUID(), role: 'system', content: systemPrompt, timestamp: Date.now() });
  }
  messages.push({ id: crypto.randomUUID(), role: 'user', content: userMessage, timestamp: Date.now() });

  const payload: AiRequestPayload = {
    tabId,
    provider: providerId as AiRequestPayload['provider'],
    model: effectiveModel,
    baseUrl: resolvedBaseUrl,
    chatEndpoint,
    messages,
    settings: DEFAULT_AI_SETTINGS,
    authType: resolvedAuth.authType,
    authData: resolvedAuth.authData,
  };

  const signal = startAiRequest(tabId);
  const REQUEST_TIMEOUT_MS = 60_000;
  const timeoutId = setTimeout(() => {
    if (!signal.aborted) {
      cancelAiRequest(tabId);
      cleanupAiRequest(tabId);
      postMessage({ type: events.error, error: 'Request timed out after 60 seconds. Check your provider URL and API key.', ...extra });
    }
  }, REQUEST_TIMEOUT_MS);

  const onChunk = (chunk: AiStreamChunk) => {
    postMessage({ type: events.chunk, chunk: chunk.delta, ...extra });
  };

  const onComplete = (result: AiResponseComplete) => {
    clearTimeout(timeoutId);
    cleanupAiRequest(tabId);
    postMessage({ type: events.done, ...extra });
    try {
      insertAudit({
        conversation_id: tabId,
        stage,
        model: effectiveModel || 'copilot',
        request_payload: JSON.stringify({ provider: providerId, model: effectiveModel, messages }),
        response_payload: JSON.stringify({ message: result.message, tokens: result.tokens, duration: result.duration }),
        duration_ms: result.duration,
      });
    } catch { /* ignore audit errors */ }
  };

  const onError = (error: { message: string }) => {
    clearTimeout(timeoutId);
    cleanupAiRequest(tabId);
    postMessage({ type: events.error, error: error.message, ...extra });
    try {
      insertAudit({
        conversation_id: tabId,
        stage,
        model: effectiveModel || 'copilot',
        request_payload: JSON.stringify({ provider: providerId, model: effectiveModel, messages }),
        error: error.message,
        duration_ms: 0,
      });
    } catch { /* ignore audit errors */ }
  };

  if (routeToCopilot) {
    executeCopilotRequest({ payload, signal, onChunk, onComplete, onError });
  } else {
    executeAiRequest({ payload, signal, onChunk, onComplete, onError });
  }
}

const LEGACY_COLON_EVENTS = { chunk: 'aiStream:chunk', done: 'aiStream:done', error: 'aiStream:error' };

/**
 * Handle aiChat — 17 AI modals (AiGqlQueryBuilderModal, AiSecurityAuditModal, etc.)
 * msg: { tabId, messages: [{ role: 'user', content }], systemPrompt? }
 */
export async function handleAiChat(msg: Record<string, unknown>, postMessage: PostMessage) {
  const messages = (msg.messages as Array<{ role: string; content: string }>) || [];
  const userMessage = messages.length ? messages[messages.length - 1].content : '';
  const systemPrompt = (msg.systemPrompt as string) || '';
  await runLegacyAiStream(systemPrompt, userMessage, 'aiChat', postMessage, LEGACY_COLON_EVENTS);
}

/**
 * Handle aiStream — 13 AI modals (AiSequenceComposerModal, AiChaosEngineeringModal, etc.)
 * msg: { payload: { systemPrompt, userMessage, templateKey } }
 */
export async function handleAiStream(msg: Record<string, unknown>, postMessage: PostMessage) {
  const payload = (msg.payload as { systemPrompt?: string; userMessage?: string; templateKey?: string }) || {};
  await runLegacyAiStream(payload.systemPrompt || '', payload.userMessage || '', payload.templateKey || 'aiStream', postMessage, LEGACY_COLON_EVENTS);
}

/**
 * Handle aiStreamRequest — 1 AI modal (AiPerfAnomalyModal), correlated by requestId
 * with its own (no-colon) event names.
 * msg: { requestId, systemPrompt, userPrompt }
 */
export async function handleAiStreamRequest(msg: Record<string, unknown>, postMessage: PostMessage) {
  const requestId = msg.requestId as string;
  const systemPrompt = (msg.systemPrompt as string) || '';
  const userMessage = (msg.userPrompt as string) || '';
  await runLegacyAiStream(systemPrompt, userMessage, 'aiStreamRequest', postMessage, {
    chunk: 'aiStreamChunk', done: 'aiStreamDone', error: 'aiStreamError',
  }, { requestId });
}
