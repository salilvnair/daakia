/**
 * AI-MCP handler — manages MCP server connections within the AI tab.
 * Multiple servers can be connected per AI tab. Their tools are injected
 * into AI function calling. Tool results are routed back to the correct MCP server.
 */
import { McpClient } from '../../../mcp/mcp-client';
import { loadEnvVars, resolveEnvString } from './env-resolver';
import type { AiToolDef } from '../../../ai/ai-types';
import type { McpToolDef } from '../../../mcp/mcp-types';

type PostMessage = (msg: unknown) => void;

// Active AI-MCP clients: key = `${tabId}:${serverId}`
const aiMcpClients = new Map<string, McpClient>();
// Cached tool lists per connection
const aiMcpTools = new Map<string, McpToolDef[]>();

function clientKey(tabId: string, serverId: string): string {
  return `${tabId}:${serverId}`;
}

/**
 * Handle ai:mcp:connect — connect to an MCP server from the AI tab.
 */
export async function handleAiMcpConnect(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const serverId = msg.serverId as string;
  const server = msg.server as {
    name: string;
    transport: 'stdio' | 'http';
    command?: string;
    args?: string[];
    url?: string;
    envVars?: Record<string, string>;
    workingDir?: string;
  };
  const envId = msg.envId as string | undefined;

  const key = clientKey(tabId, serverId);

  // Disconnect existing client for this server
  const existing = aiMcpClients.get(key);
  if (existing) {
    existing.disconnect();
    aiMcpClients.delete(key);
    aiMcpTools.delete(key);
  }

  // Resolve env
  const vars = loadEnvVars(envId);
  const resolvedCommand = server.command ? resolveEnvString(server.command, vars) : undefined;
  const resolvedUrl = server.url ? resolveEnvString(server.url, vars) : undefined;
  const resolvedEnvVars: Record<string, string> = {};
  if (server.envVars) {
    for (const [k, v] of Object.entries(server.envVars)) {
      resolvedEnvVars[k] = resolveEnvString(v, vars);
    }
  }

  const client = new McpClient({
    transport: server.transport,
    command: resolvedCommand,
    args: server.args?.length ? server.args : undefined,
    url: resolvedUrl,
    envVars: resolvedEnvVars,
    workingDir: server.workingDir || undefined,
    connectionTimeout: 15000,
    requestTimeout: 30000,
  });

  client.on('error', (err: Error) => {
    postMessage({ type: 'ai:mcp:error', tabId, serverId, error: err.message });
  });

  client.on('disconnected', () => {
    aiMcpClients.delete(key);
    aiMcpTools.delete(key);
    postMessage({ type: 'ai:mcp:disconnected', tabId, serverId });
  });

  try {
    const capabilities = await client.connect();
    aiMcpClients.set(key, client);
    aiMcpTools.set(key, capabilities.tools || []);

    postMessage({
      type: 'ai:mcp:connected',
      tabId,
      serverId,
      tools: capabilities.tools || [],
    });
  } catch (err) {
    postMessage({
      type: 'ai:mcp:error',
      tabId,
      serverId,
      error: (err as Error).message,
    });
  }
}

/**
 * Handle ai:mcp:disconnect — disconnect a specific MCP server from AI tab.
 */
export function handleAiMcpDisconnect(msg: Record<string, unknown>, postMessage: PostMessage) {
  const tabId = msg.tabId as string;
  const serverId = msg.serverId as string;
  const key = clientKey(tabId, serverId);

  const client = aiMcpClients.get(key);
  if (client) {
    client.disconnect();
    aiMcpClients.delete(key);
    aiMcpTools.delete(key);
  }
  postMessage({ type: 'ai:mcp:disconnected', tabId, serverId });
}

/**
 * Get all connected MCP tools for a given AI tab, converted to OpenAI function-calling format.
 * Called by ai-handler before sending the request to inject tools.
 */
export function getAiMcpTools(tabId: string): AiToolDef[] {
  const tools: AiToolDef[] = [];
  for (const [key, mcpTools] of aiMcpTools) {
    if (!key.startsWith(`${tabId}:`)) continue;
    for (const t of mcpTools) {
      tools.push({
        id: `mcp:${t.name}`,
        type: 'function',
        function: {
          name: t.name,
          description: t.description || '',
          parameters: t.inputSchema || { type: 'object', properties: {} },
        },
      });
    }
  }
  return tools;
}

/**
 * Call an MCP tool from AI tool_calls. Finds the right client by tool name.
 * Returns the tool result content as a string.
 */
export async function callAiMcpTool(
  tabId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ success: boolean; result?: string; error?: string }> {
  // Find which server has this tool
  for (const [key, mcpTools] of aiMcpTools) {
    if (!key.startsWith(`${tabId}:`)) continue;
    const hasTool = mcpTools.some(t => t.name === toolName);
    if (!hasTool) continue;

    const client = aiMcpClients.get(key);
    if (!client || !client.connected) {
      return { success: false, error: `MCP server disconnected` };
    }

    try {
      const result = await client.callTool(toolName, args);
      // Extract text content from MCP tool result
      const content = extractToolResultContent(result);
      return { success: true, result: content };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
  return { success: false, error: `No MCP server has tool "${toolName}"` };
}

/**
 * Cleanup all AI-MCP clients for a specific tab (tab closed).
 */
export function cleanupAiMcpClients(tabId?: string): void {
  for (const [key, client] of aiMcpClients) {
    if (!tabId || key.startsWith(`${tabId}:`)) {
      client.disconnect();
      aiMcpClients.delete(key);
      aiMcpTools.delete(key);
    }
  }
}

// ────────────── Helpers ──────────────

function extractToolResultContent(result: unknown): string {
  if (!result || typeof result !== 'object') return JSON.stringify(result);
  const r = result as { content?: Array<{ type: string; text?: string }> };
  if (Array.isArray(r.content)) {
    return r.content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text)
      .join('\n') || JSON.stringify(result);
  }
  return JSON.stringify(result);
}
