/** MCP protocol + multi-server event messages. Extracted verbatim from the App message handler. */
import { useTabsStore } from '../../store/tabs-store';
import { useDevToolsStore } from '../../store/devtools-store';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleMcpMessages(msg: any): boolean {
  switch (msg.type as string) {
        // ─── MCP Protocol Messages ────────────────────────────────────────
        case 'mcp:connected': {
          const { tabId, capabilities, serverInfo } = msg;
          useTabsStore.getState().updateTab(tabId, {
            mcpConnected: true,
            mcpCapabilities: capabilities,
            loading: false,
            mcpConnectionError: undefined,
          });
          useDevToolsStore.getState().addLog({
            timestamp: Date.now(), level: 'info',
            args: [`[MCP] Connected to ${(serverInfo as { name?: string })?.name || 'server'}`, capabilities],
          });
          break;
        }
        case 'mcp:disconnected': {
          const { tabId } = msg;
          useTabsStore.getState().updateTab(tabId, {
            mcpConnected: false,
            loading: false,
          });
          useDevToolsStore.getState().addLog({
            timestamp: Date.now(), level: 'info', args: ['[MCP] Disconnected'],
          });
          break;
        }
        case 'mcp:connectFailed': {
          const { tabId, message: failMsg } = msg;
          useTabsStore.getState().updateTab(tabId, { loading: false, mcpConnectionError: (failMsg as string) || 'Connection failed' });
          useDevToolsStore.getState().addLog({
            timestamp: Date.now(), level: 'error', args: ['[MCP] Connection failed'],
          });
          break;
        }
        case 'mcp:error': {
          const { tabId, message: errMsg } = msg;
          useDevToolsStore.getState().addLog({
            timestamp: Date.now(), level: 'error', args: [`[MCP] Error: ${errMsg}`],
          });
          const mcpTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (mcpTab) {
            const conv = [...(mcpTab.mcpConversation || [])];
            conv.push({
              id: crypto.randomUUID(),
              type: 'error',
              serverName: '',
              name: 'Error',
              output: errMsg as string,
              timestamp: Date.now(),
              success: false,
            });
            useTabsStore.getState().updateTab(tabId, { mcpConversation: conv });
          }
          break;
        }
        case 'mcp:toolResult': {
          const { tabId, success, toolName, result, error, duration } = msg;
          const mcpTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (mcpTab) {
            const conv = [...(mcpTab.mcpConversation || [])];
            conv.push({
              id: crypto.randomUUID(),
              type: 'tool-call',
              serverName: '',
              name: toolName as string || '',
              output: success ? JSON.stringify(result, null, 2) : (error as string),
              duration: duration as number,
              timestamp: Date.now(),
              success: success as boolean,
            });
            useTabsStore.getState().updateTab(tabId, { mcpConversation: conv });
          }
          useDevToolsStore.getState().addLog({
            timestamp: Date.now(),
            level: success ? 'info' : 'error',
            args: [`[MCP] Tool: ${toolName}`, success ? result : error],
          });
          useDevToolsStore.getState().addNetworkEntry({
            method: 'MCP',
            url: `tool/${toolName}`,
            status: success ? 200 : 500,
            statusText: success ? 'OK' : 'Error',
            duration: duration as number || 0,
            size: success ? JSON.stringify(result).length : 0,
            timestamp: Date.now(),
            requestHeaders: { 'X-MCP-Tool': toolName as string },
            responseHeaders: {},
            requestBody: undefined,
            responseBody: success ? JSON.stringify(result, null, 2) : (error as string),
            contentType: 'application/json',
          });
          break;
        }
        case 'mcp:promptResult': {
          const { tabId, success, promptName, result, error, duration } = msg;
          const mcpTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (mcpTab) {
            const conv = [...(mcpTab.mcpConversation || [])];
            conv.push({
              id: crypto.randomUUID(),
              type: 'prompt-run',
              serverName: '',
              name: promptName as string || '',
              output: success ? JSON.stringify(result, null, 2) : (error as string),
              duration: duration as number,
              timestamp: Date.now(),
              success: success as boolean,
            });
            useTabsStore.getState().updateTab(tabId, { mcpConversation: conv });
          }
          break;
        }
        case 'mcp:resourceResult': {
          const { tabId, success, uri, result, error, duration } = msg;
          const mcpTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (mcpTab) {
            const conv = [...(mcpTab.mcpConversation || [])];
            conv.push({
              id: crypto.randomUUID(),
              type: 'resource-read',
              serverName: '',
              name: uri as string || '',
              output: success ? JSON.stringify(result, null, 2) : (error as string),
              duration: duration as number,
              timestamp: Date.now(),
              success: success as boolean,
            });
            useTabsStore.getState().updateTab(tabId, { mcpConversation: conv });
          }
          break;
        }

        // ─── MCP Multi-Server Events (6E.18) ─────────────────────────────
        case 'mcp:serverConnecting': {
          const { tabId, serverId } = msg;
          const msTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (msTab) {
            const states = { ...(msTab.mcpServerStates || {}) };
            states[serverId as string] = { ...states[serverId as string], connecting: true, connected: false };
            useTabsStore.getState().updateTab(tabId, { mcpServerStates: states });
          }
          break;
        }
        case 'mcp:serverConnected': {
          const { tabId, serverId, capabilities } = msg;
          const msTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (msTab) {
            const states = { ...(msTab.mcpServerStates || {}) };
            states[serverId as string] = { connected: true, connecting: false, tools: (capabilities as any)?.tools || [] };
            useTabsStore.getState().updateTab(tabId, { mcpServerStates: states });
          }
          break;
        }
        case 'mcp:serverDisconnected': {
          const { tabId, serverId } = msg;
          const msTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (msTab) {
            const states = { ...(msTab.mcpServerStates || {}) };
            states[serverId as string] = { connected: false, connecting: false, tools: [] };
            useTabsStore.getState().updateTab(tabId, { mcpServerStates: states });
          }
          break;
        }
        case 'mcp:serverConnectFailed': {
          const { tabId, serverId, message } = msg;
          const msTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (msTab) {
            const states = { ...(msTab.mcpServerStates || {}) };
            states[serverId as string] = { connected: false, connecting: false, tools: [], error: message as string };
            useTabsStore.getState().updateTab(tabId, { mcpServerStates: states });
          }
          break;
        }
        case 'mcp:serverError': {
          const { tabId, serverId, message } = msg;
          const msTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (msTab) {
            const states = { ...(msTab.mcpServerStates || {}) };
            states[serverId as string] = { ...states[serverId as string], error: message as string };
            useTabsStore.getState().updateTab(tabId, { mcpServerStates: states });
          }
          break;
        }
        case 'mcp:capabilitiesUpdated': {
          const { tabId, capabilities } = msg;
          useTabsStore.getState().updateTab(tabId, { mcpCapabilities: capabilities as any });
          break;
        }

    default:
      return false;
  }
  return true;
}
