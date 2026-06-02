/**
 * MCP handler — bridges webview messages to mcp-client.
 * Handles connect, disconnect, callTool, getPrompt, readResource.
 */
import { McpClient } from '../../../mcp/mcp-client';
import { loadEnvVars, resolveEnvString } from './env-resolver';
import { insertHistory, trimHistory } from '../../../storage/db';

type PostMessage = (msg: unknown) => void;

// Active MCP clients per tab
const activeClients = new Map<string, McpClient>();

/**
 * Handle mcp:connect — establish connection to an MCP server.
 */
export async function handleMcpConnect(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const transport = (msg.transport as 'stdio' | 'http') || 'stdio';
  const command = msg.command as string || '';
  const args = (msg.args as string[]) || [];
  const url = msg.url as string || '';
  const envVars = (msg.envVars as Record<string, string>) || {};
  const settings = (msg.settings as Record<string, unknown>) || {};
  const envId = msg.envId as string | undefined;

  // Resolve environment variables
  const vars = loadEnvVars(envId);
  const resolvedCommand = resolveEnvString(command, vars);
  const resolvedUrl = resolveEnvString(url, vars);
  const resolvedEnvVars: Record<string, string> = {};
  for (const [k, v] of Object.entries(envVars)) {
    resolvedEnvVars[k] = resolveEnvString(v, vars);
  }

  // Disconnect existing client for this tab
  const existing = activeClients.get(tabId);
  if (existing) {
    existing.disconnect();
    activeClients.delete(tabId);
  }

  const client = new McpClient({
    transport,
    command: resolvedCommand || undefined,
    args: args.length > 0 ? args : undefined,
    url: resolvedUrl || undefined,
    envVars: resolvedEnvVars,
    workingDir: settings.workingDir as string | undefined,
    connectionTimeout: (settings.connectionTimeout as number) || 15000,
    requestTimeout: (settings.requestTimeout as number) || 30000,
  });

  client.on('error', (err: Error) => {
    postMessage({
      type: 'mcp:error',
      tabId,
      message: err.message,
    });
  });

  client.on('disconnected', () => {
    activeClients.delete(tabId);
    postMessage({
      type: 'mcp:disconnected',
      tabId,
    });
  });

  try {
    const capabilities = await client.connect();
    activeClients.set(tabId, client);

    postMessage({
      type: 'mcp:connected',
      tabId,
      capabilities,
      serverInfo: client.serverInfo,
    });
  } catch (err) {
    console.error('[MCP Connect Error]', { tabId, error: (err as Error).message, stack: (err as Error).stack });
    postMessage({
      type: 'mcp:error',
      tabId,
      message: (err as Error).message,
    });
    postMessage({
      type: 'mcp:connectFailed',
      tabId,
    });
  }
}

/**
 * Handle mcp:disconnect — close connection to an MCP server.
 */
export function handleMcpDisconnect(msg: Record<string, unknown>, postMessage: PostMessage) {
  const tabId = msg.tabId as string;
  const client = activeClients.get(tabId);
  if (client) {
    client.disconnect();
    activeClients.delete(tabId);
  }
  postMessage({ type: 'mcp:disconnected', tabId });
}

/**
 * Handle mcp:callTool — invoke a tool on the connected server.
 */
export async function handleMcpCallTool(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
  refreshHistory?: () => void,
) {
  const tabId = msg.tabId as string;
  const toolName = msg.toolName as string;
  const args = (msg.arguments as Record<string, unknown>) || {};
  const client = activeClients.get(tabId);

  if (!client || !client.connected) {
    postMessage({ type: 'mcp:toolResult', tabId, success: false, error: 'Not connected' });
    return;
  }

  const startTime = Date.now();

  try {
    const result = await client.callTool(toolName, args);
    const duration = Date.now() - startTime;

    postMessage({
      type: 'mcp:toolResult',
      tabId,
      success: true,
      toolName,
      result,
      duration,
    });

    // Save to history
    try {
      insertHistory({
        protocol: 'mcp',
        method: 'TOOL',
        url: `${toolName}`,
        status: 200,
        response_time: duration,
        request_data: JSON.stringify({
          toolName,
          arguments: args,
          mcpTransport: msg.transport || 'stdio',
          mcpCommand: msg.command || '',
          mcpArgs: msg.mcpArgs || [],
          mcpServerConfigs: msg.mcpServerConfigs || [],
        }),
        response_data: JSON.stringify(result).slice(0, 4000),
      });
      trimHistory(500);
      refreshHistory?.();
    } catch { /* ignore */ }
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error('[MCP Tool Call Error]', { tabId, toolName, error: (err as Error).message, stack: (err as Error).stack, duration });
    postMessage({
      type: 'mcp:toolResult',
      tabId,
      success: false,
      toolName,
      error: (err as Error).message,
      duration,
    });
  }
}

/**
 * Handle mcp:getPrompt — get a prompt template from the server.
 */
export async function handleMcpGetPrompt(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const promptName = msg.promptName as string;
  const args = (msg.arguments as Record<string, unknown>) || {};
  const client = activeClients.get(tabId);

  if (!client || !client.connected) {
    postMessage({ type: 'mcp:promptResult', tabId, success: false, error: 'Not connected' });
    return;
  }

  const startTime = Date.now();

  try {
    const result = await client.getPrompt(promptName, args);
    postMessage({
      type: 'mcp:promptResult',
      tabId,
      success: true,
      promptName,
      result,
      duration: Date.now() - startTime,
    });
  } catch (err) {
    postMessage({
      type: 'mcp:promptResult',
      tabId,
      success: false,
      promptName,
      error: (err as Error).message,
      duration: Date.now() - startTime,
    });
  }
}

/**
 * Handle mcp:readResource — read a resource from the server.
 */
export async function handleMcpReadResource(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
) {
  const tabId = msg.tabId as string;
  const uri = msg.uri as string;
  const client = activeClients.get(tabId);

  if (!client || !client.connected) {
    postMessage({ type: 'mcp:resourceResult', tabId, success: false, error: 'Not connected' });
    return;
  }

  const startTime = Date.now();

  try {
    const result = await client.readResource(uri);
    postMessage({
      type: 'mcp:resourceResult',
      tabId,
      success: true,
      uri,
      result,
      duration: Date.now() - startTime,
    });
  } catch (err) {
    postMessage({
      type: 'mcp:resourceResult',
      tabId,
      success: false,
      uri,
      error: (err as Error).message,
      duration: Date.now() - startTime,
    });
  }
}

/**
 * Cleanup all active MCP clients (called on panel dispose).
 */
export function cleanupAllMcpClients(): void {
  for (const [, client] of activeClients) {
    client.disconnect();
  }
  activeClients.clear();
}
