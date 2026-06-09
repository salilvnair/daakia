/**
 * AI Executor — builds provider-specific HTTP requests for AI completions.
 * Supports OpenAI-compatible (OpenAI, Groq, Together, Mistral, Ollama),
 * Anthropic, Google Gemini, and Azure OpenAI formats.
 * Handles both non-streaming and streaming (SSE) responses.
 */
import * as https from 'https';
import * as http from 'http';
import type {
  AiProviderId, AiMessage, AiToolDef, AiSettings,
  AiRequestPayload, AiResponseComplete, AiStreamChunk, AiTokenUsage,
} from './ai-types';
import { AI_PROVIDERS } from './ai-providers';

// ────────────── Request Building ──────────────

interface BuiltRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * Build provider-specific HTTP request from unified payload.
 */
export function buildAiRequest(payload: AiRequestPayload): BuiltRequest {
  const provider = AI_PROVIDERS.find(p => p.id === payload.provider);
  const baseUrl = payload.baseUrl || provider?.baseUrl || '';
  const endpoint = payload.chatEndpoint || provider?.chatEndpoint || '/chat/completions';

  switch (payload.provider) {
    case 'anthropic':
      return buildAnthropicRequest(payload, baseUrl);
    case 'google':
      return buildGoogleRequest(payload, baseUrl, payload.model);
    default:
      // OpenAI-compatible: openai, groq, together, mistral, ollama, azure-openai, custom
      return buildOpenAiRequest(payload, baseUrl, endpoint);
  }
}

function buildOpenAiRequest(payload: AiRequestPayload, baseUrl: string, endpoint: string): BuiltRequest {
  const url = `${baseUrl}${endpoint}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Auth
  if (payload.authType === 'bearer' && payload.authData.token) {
    headers['Authorization'] = `Bearer ${payload.authData.token}`;
  } else if (payload.authType === 'api-key' && payload.authData.keyName && payload.authData.keyValue) {
    headers[payload.authData.keyName] = payload.authData.keyValue;
  }

  // Build messages (filter out empty)
  const messages = payload.messages
    .filter(m => m.content || m.toolCalls?.length)
    .map(m => {
      const msgExt = m as AiMessage & { imageAttachments?: Array<{ type: 'url' | 'base64'; url?: string; base64?: string; mimeType?: string }> };
      // 6D.22 — multimodal: if this user message has image attachments, build content array
      if (m.role === 'user' && msgExt.imageAttachments?.length) {
        const contentParts: unknown[] = [];
        // Text part first
        if (m.content) contentParts.push({ type: 'text', text: m.content });
        // Image parts
        for (const img of msgExt.imageAttachments) {
          if (img.type === 'url' && img.url) {
            contentParts.push({ type: 'image_url', image_url: { url: img.url } });
          } else if (img.type === 'base64' && img.base64) {
            // base64 is a data URL like "data:image/png;base64,..." — extract the base64 part
            const b64Match = img.base64.match(/^data:([^;]+);base64,(.+)$/);
            if (b64Match) {
              contentParts.push({ type: 'image_url', image_url: { url: img.base64 } });
            }
          }
        }
        return { role: m.role, content: contentParts };
      }
      const msg: Record<string, unknown> = { role: m.role, content: m.content };
      if (m.toolCalls?.length) msg.tool_calls = m.toolCalls;
      if (m.toolCallId) msg.tool_call_id = m.toolCallId;
      return msg;
    });

  const body: Record<string, unknown> = {
    model: payload.model,
    messages,
    temperature: payload.settings.temperature,
    max_tokens: payload.settings.maxTokens,
    top_p: payload.settings.topP,
    stream: payload.settings.stream,
  };

  if (payload.settings.frequencyPenalty) body.frequency_penalty = payload.settings.frequencyPenalty;
  if (payload.settings.presencePenalty) body.presence_penalty = payload.settings.presencePenalty;
  if (payload.settings.stopSequences.length) body.stop = payload.settings.stopSequences;
  if (payload.settings.responseFormat === 'json_object') body.response_format = { type: 'json_object' };
  if (payload.settings.seed != null) body.seed = payload.settings.seed;
  if (payload.tools?.length) {
    body.tools = payload.tools.map(t => ({ type: t.type, function: t.function }));
  }

  return { url, method: 'POST', headers, body: JSON.stringify(body) };
}

function buildAnthropicRequest(payload: AiRequestPayload, baseUrl: string): BuiltRequest {
  const url = `${baseUrl}/messages`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };

  // Auth — Anthropic uses x-api-key header
  if (payload.authType === 'bearer' && payload.authData.token) {
    headers['x-api-key'] = payload.authData.token;
  } else if (payload.authType === 'api-key' && payload.authData.keyValue) {
    headers[payload.authData.keyName || 'x-api-key'] = payload.authData.keyValue;
  }

  // Anthropic format: system is top-level, messages only user/assistant
  const systemMsgs = payload.messages.filter(m => m.role === 'system');
  const chatMsgs = payload.messages.filter(m => m.role !== 'system');

  const messages = chatMsgs
    .filter(m => m.content || m.toolCalls?.length)
    .map(m => {
      if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
          role: 'assistant',
          content: m.toolCalls.map(tc => ({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || '{}'),
          })),
        };
      }
      if (m.role === 'tool') {
        return {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }],
        };
      }
      return { role: m.role, content: m.content };
    });

  const body: Record<string, unknown> = {
    model: payload.model,
    messages,
    max_tokens: payload.settings.maxTokens,
    stream: payload.settings.stream,
  };

  if (systemMsgs.length) {
    body.system = systemMsgs.map(s => s.content).join('\n\n');
  }
  if (payload.settings.temperature !== 0.7) body.temperature = payload.settings.temperature;
  if (payload.settings.topP !== 1) body.top_p = payload.settings.topP;
  if (payload.settings.stopSequences.length) body.stop_sequences = payload.settings.stopSequences;
  if (payload.tools?.length) {
    body.tools = payload.tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }

  return { url, method: 'POST', headers, body: JSON.stringify(body) };
}

function buildGoogleRequest(payload: AiRequestPayload, baseUrl: string, model: string): BuiltRequest {
  const streaming = payload.settings.stream;
  const action = streaming ? 'streamGenerateContent' : 'generateContent';
  let url = `${baseUrl}/models/${model}:${action}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Google uses API key as query param or Bearer
  if (payload.authType === 'bearer' && payload.authData.token) {
    // Try as query param (standard Gemini API)
    url += `?key=${payload.authData.token}`;
  } else if (payload.authType === 'api-key' && payload.authData.keyValue) {
    url += `?key=${payload.authData.keyValue}`;
  }

  // Convert messages to Google format
  const systemMsgs = payload.messages.filter(m => m.role === 'system');
  const chatMsgs = payload.messages.filter(m => m.role !== 'system');

  const contents = chatMsgs
    .filter(m => m.content)
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const body: Record<string, unknown> = { contents };

  if (systemMsgs.length) {
    body.systemInstruction = { parts: [{ text: systemMsgs.map(s => s.content).join('\n\n') }] };
  }

  body.generationConfig = {
    temperature: payload.settings.temperature,
    maxOutputTokens: payload.settings.maxTokens,
    topP: payload.settings.topP,
  };

  if (payload.settings.stopSequences.length) {
    (body.generationConfig as Record<string, unknown>).stopSequences = payload.settings.stopSequences;
  }

  if (payload.tools?.length) {
    body.tools = [{
      functionDeclarations: payload.tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    }];
  }

  return { url, method: 'POST', headers, body: JSON.stringify(body) };
}

// ────────────── Execution ──────────────

interface ExecuteOptions {
  payload: AiRequestPayload;
  onChunk?: (chunk: AiStreamChunk) => void;
  onComplete: (result: AiResponseComplete) => void;
  onError: (error: { tabId: string; message: string; code?: string; diagnostics?: Record<string, unknown> }) => void;
  signal?: { aborted: boolean };
}

/**
 * Execute an AI request (streaming or non-streaming).
 */
export function executeAiRequest(options: ExecuteOptions): void {
  const { payload, onChunk, onComplete, onError, signal } = options;
  const request = buildAiRequest(payload);
  const startTime = Date.now();

  // Log full request details to extension host console
  console.log('[AI Request]', JSON.stringify({
    url: request.url,
    method: request.method,
    headers: sanitizeHeaders(request.headers),
    model: payload.model,
    provider: payload.provider,
    messageCount: payload.messages.length,
    toolCount: payload.tools?.length || 0,
    stream: payload.settings.stream,
  }, null, 2));

  const urlObj = new URL(request.url);
  const isHttps = urlObj.protocol === 'https:';
  const lib = isHttps ? https : http;

  const reqOptions: https.RequestOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: request.method,
    headers: request.headers,
  };

  const req = lib.request(reqOptions, (res) => {
    if (signal?.aborted) { res.destroy(); return; }

    const statusCode = res.statusCode || 0;

    if (statusCode >= 400) {
      let errorBody = '';
      res.on('data', (chunk) => { errorBody += chunk.toString(); });
      res.on('end', () => {
        let message = `HTTP ${statusCode}`;
        let parsedError: unknown;
        try {
          parsedError = JSON.parse(errorBody);
          const pe = parsedError as Record<string, unknown>;
          message = (pe.error as Record<string, string>)?.message || pe.message as string || pe.detail as string || errorBody.slice(0, 500);
        } catch {
          message = errorBody.slice(0, 500) || `HTTP ${statusCode}`;
        }

        const diagnostics = {
          request: {
            url: request.url,
            method: request.method,
            headers: sanitizeHeaders(request.headers),
            body: safeJsonParse(request.body),
          },
          response: {
            statusCode,
            statusMessage: res.statusMessage,
            headers: res.headers,
            body: parsedError || errorBody.slice(0, 2000),
          },
          meta: {
            provider: payload.provider,
            model: payload.model,
            messageCount: payload.messages.length,
            toolCount: payload.tools?.length || 0,
            stream: payload.settings.stream,
            duration: Date.now() - startTime,
          },
        };

        console.error('[AI Error]', JSON.stringify(diagnostics, null, 2));
        onError({ tabId: payload.tabId, message, code: String(statusCode), diagnostics });
      });
      return;
    }

    if (payload.settings.stream) {
      handleStreamingResponse(res, payload, startTime, onChunk, onComplete, onError, signal);
    } else {
      handleNonStreamingResponse(res, payload, startTime, onComplete, onError);
    }
  });

  req.on('error', (err) => {
    if (signal?.aborted) return;
    const diagnostics = {
      request: {
        url: request.url,
        method: request.method,
        headers: sanitizeHeaders(request.headers),
        body: safeJsonParse(request.body),
      },
      response: null,
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
        code: (err as NodeJS.ErrnoException).code,
        errno: (err as NodeJS.ErrnoException).errno,
      },
      meta: {
        provider: payload.provider,
        model: payload.model,
        messageCount: payload.messages.length,
        toolCount: payload.tools?.length || 0,
        stream: payload.settings.stream,
        duration: Date.now() - startTime,
      },
    };
    console.error('[AI Network Error]', JSON.stringify(diagnostics, null, 2));
    onError({
      tabId: payload.tabId,
      message: err.message,
      code: (err as NodeJS.ErrnoException).code || 'NETWORK_ERROR',
      diagnostics,
    });
  });

  req.write(request.body);
  req.end();
}

// ────────────── Non-Streaming ──────────────

function handleNonStreamingResponse(
  res: http.IncomingMessage,
  payload: AiRequestPayload,
  startTime: number,
  onComplete: ExecuteOptions['onComplete'],
  onError: ExecuteOptions['onError'],
) {
  let body = '';
  res.on('data', (chunk) => { body += chunk.toString(); });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      const result = parseNonStreamingResponse(parsed, payload.provider, payload.tabId, startTime);
      onComplete(result);
    } catch (err) {
      onError({ tabId: payload.tabId, message: `Failed to parse response: ${(err as Error).message}` });
    }
  });
}

function parseNonStreamingResponse(
  data: Record<string, unknown>,
  provider: AiProviderId,
  tabId: string,
  startTime: number,
): AiResponseComplete {
  let content = '';
  let toolCalls: AiMessage['toolCalls'];
  let tokens: AiTokenUsage | undefined;

  switch (provider) {
    case 'anthropic': {
      // Anthropic: { content: [{type:'text',text:'...'}], usage: {input_tokens, output_tokens} }
      const contentBlocks = data.content as { type: string; text?: string; id?: string; name?: string; input?: unknown }[];
      const textParts = contentBlocks?.filter(b => b.type === 'text').map(b => b.text || '') || [];
      content = textParts.join('');
      const toolUses = contentBlocks?.filter(b => b.type === 'tool_use') || [];
      if (toolUses.length) {
        toolCalls = toolUses.map(t => ({
          id: t.id || crypto.randomUUID(),
          type: 'function' as const,
          function: { name: t.name || '', arguments: JSON.stringify(t.input || {}) },
        }));
      }
      const usage = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;
      if (usage) {
        tokens = {
          prompt: usage.input_tokens || 0,
          completion: usage.output_tokens || 0,
          total: (usage.input_tokens || 0) + (usage.output_tokens || 0),
        };
      }
      break;
    }
    case 'google': {
      // Google: { candidates: [{ content: { parts: [{text}] } }], usageMetadata: {...} }
      const candidates = data.candidates as { content?: { parts?: { text?: string }[] } }[];
      if (candidates?.[0]?.content?.parts) {
        content = candidates[0].content.parts.map(p => p.text || '').join('');
      }
      const meta = data.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | undefined;
      if (meta) {
        tokens = {
          prompt: meta.promptTokenCount || 0,
          completion: meta.candidatesTokenCount || 0,
          total: meta.totalTokenCount || 0,
        };
      }
      break;
    }
    default: {
      // OpenAI-compatible: { choices: [{ message: { content, tool_calls } }], usage: {...} }
      const choices = data.choices as { message?: { content?: string; tool_calls?: unknown[] } }[];
      const msg = choices?.[0]?.message;
      content = msg?.content || '';
      if (msg?.tool_calls?.length) {
        toolCalls = (msg.tool_calls as { id: string; type: string; function: { name: string; arguments: string } }[]).map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        }));
      }
      const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
      if (usage) {
        tokens = {
          prompt: usage.prompt_tokens || 0,
          completion: usage.completion_tokens || 0,
          total: usage.total_tokens || 0,
        };
      }
      break;
    }
  }

  return {
    tabId,
    message: {
      id: crypto.randomUUID(),
      role: 'assistant',
      content,
      toolCalls,
      timestamp: Date.now(),
      tokens,
    },
    tokens,
    duration: Date.now() - startTime,
  };
}

// ────────────── Streaming (SSE) ──────────────

function handleStreamingResponse(
  res: http.IncomingMessage,
  payload: AiRequestPayload,
  startTime: number,
  onChunk: ExecuteOptions['onChunk'],
  onComplete: ExecuteOptions['onComplete'],
  onError: ExecuteOptions['onError'],
  signal?: { aborted: boolean },
) {
  let buffer = '';
  let fullContent = '';
  let tokens: AiTokenUsage | undefined;
  let toolCalls: AiMessage['toolCalls'];
  const provider = payload.provider;
  const tabId = payload.tabId;

  res.on('data', (chunk) => {
    if (signal?.aborted) { res.destroy(); return; }
    buffer += chunk.toString();

    // Process complete lines for SSE
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (provider === 'google') {
        // Google streams JSON array chunks, not SSE
        processGoogleStreamLine(line, tabId, onChunk, (content, tks) => {
          fullContent += content;
          if (tks) tokens = tks;
        });
      } else {
        processSSELine(line, provider, tabId, onChunk, (content, tcs, tks) => {
          fullContent += content;
          if (tcs) toolCalls = tcs;
          if (tks) tokens = tks;
        });
      }
    }
  });

  res.on('end', () => {
    // Process any remaining buffer
    if (buffer.trim()) {
      if (provider === 'google') {
        processGoogleStreamLine(buffer, tabId, onChunk, (content, tks) => {
          fullContent += content;
          if (tks) tokens = tks;
        });
      } else {
        processSSELine(buffer, provider, tabId, onChunk, (content, tcs, tks) => {
          fullContent += content;
          if (tcs) toolCalls = tcs;
          if (tks) tokens = tks;
        });
      }
    }

    onComplete({
      tabId,
      message: {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullContent,
        toolCalls,
        timestamp: Date.now(),
        tokens,
      },
      tokens,
      duration: Date.now() - startTime,
    });
  });

  res.on('error', (err) => {
    onError({ tabId, message: err.message, code: 'STREAM_ERROR' });
  });
}

function processSSELine(
  line: string,
  provider: AiProviderId,
  tabId: string,
  onChunk: ExecuteOptions['onChunk'],
  accumulate: (content: string, toolCalls?: AiMessage['toolCalls'], tokens?: AiTokenUsage) => void,
) {
  if (!line.startsWith('data: ')) return;
  const data = line.slice(6).trim();
  if (data === '[DONE]') return;

  try {
    const parsed = JSON.parse(data);

    if (provider === 'anthropic') {
      // Anthropic events: content_block_delta, message_delta, message_stop
      const type = parsed.type;
      if (type === 'content_block_delta' && parsed.delta?.text) {
        const delta = parsed.delta.text;
        accumulate(delta);
        onChunk?.({ tabId, delta });
      } else if (type === 'message_delta' && parsed.usage) {
        const usage = parsed.usage;
        accumulate('', undefined, {
          prompt: usage.input_tokens || 0,
          completion: usage.output_tokens || 0,
          total: (usage.input_tokens || 0) + (usage.output_tokens || 0),
        });
      }
    } else {
      // OpenAI-compatible: { choices: [{ delta: { content, tool_calls } }] }
      const choices = parsed.choices;
      if (choices?.[0]?.delta?.content) {
        const delta = choices[0].delta.content;
        accumulate(delta);
        onChunk?.({ tabId, delta });
      }
      if (choices?.[0]?.delta?.tool_calls) {
        // Tool calls arrive incrementally — simplified: just capture them
        const tcs = choices[0].delta.tool_calls;
        // Note: full tool call aggregation happens at completion
      }
      if (parsed.usage) {
        accumulate('', undefined, {
          prompt: parsed.usage.prompt_tokens || 0,
          completion: parsed.usage.completion_tokens || 0,
          total: parsed.usage.total_tokens || 0,
        });
      }
    }
  } catch {
    // Ignore malformed JSON lines
  }
}

function processGoogleStreamLine(
  line: string,
  tabId: string,
  onChunk: ExecuteOptions['onChunk'],
  accumulate: (content: string, tokens?: AiTokenUsage) => void,
) {
  const trimmed = line.trim();
  if (!trimmed || trimmed === '[' || trimmed === ']' || trimmed === ',') return;

  // Remove leading comma if present
  const jsonStr = trimmed.startsWith(',') ? trimmed.slice(1) : trimmed;

  try {
    const parsed = JSON.parse(jsonStr);
    const candidates = parsed.candidates;
    if (candidates?.[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.text) {
          accumulate(part.text);
          onChunk?.({ tabId, delta: part.text });
        }
      }
    }
    if (parsed.usageMetadata) {
      const meta = parsed.usageMetadata;
      accumulate('', {
        prompt: meta.promptTokenCount || 0,
        completion: meta.candidatesTokenCount || 0,
        total: meta.totalTokenCount || 0,
      });
    }
  } catch {
    // Ignore malformed lines
  }
}

// ────────────── Helpers ──────────────

/** Mask auth tokens in headers for safe logging */
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/auth|key|token|secret/i.test(key) && value.length > 8) {
      safe[key] = value.slice(0, 4) + '****' + value.slice(-4);
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

/** Safely parse JSON string for diagnostics */
function safeJsonParse(str: string): unknown {
  try { return JSON.parse(str); } catch { return str; }
}

// ────────────── Cancellation ──────────────

const activeRequests = new Map<string, { aborted: boolean }>();

export function startAiRequest(tabId: string): { aborted: boolean } {
  const signal = { aborted: false };
  activeRequests.set(tabId, signal);
  return signal;
}

export function cancelAiRequest(tabId: string): void {
  const signal = activeRequests.get(tabId);
  if (signal) {
    signal.aborted = true;
    activeRequests.delete(tabId);
  }
}

export function cleanupAiRequest(tabId: string): void {
  activeRequests.delete(tabId);
}
