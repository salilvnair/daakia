/**
 * MCP Client — full Model Context Protocol implementation.
 * Manages connection lifecycle, capability discovery, and all MCP operations
 * (tools, prompts, resources) over JSON-RPC 2.0.
 */
import { EventEmitter } from 'events';
import { McpStdioTransport } from './mcp-stdio-transport';
import { McpHttpTransport } from './mcp-http-transport';
import type {
  McpToolDef, McpPromptDef, McpResourceDef, McpCapabilities,
} from './mcp-types';

interface McpClientOptions {
  transport: 'stdio' | 'http';
  command?: string;       // STDIO
  args?: string[];        // STDIO
  url?: string;           // HTTP
  envVars?: Record<string, string>;
  workingDir?: string;
  connectionTimeout?: number;
  requestTimeout?: number;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class McpClient extends EventEmitter {
  private _transport: McpStdioTransport | McpHttpTransport | null = null;
  private _nextId = 1;
  private _pending = new Map<number, { resolve: (val: unknown) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }>();
  private _connected = false;
  private _capabilities: McpCapabilities = { tools: [], prompts: [], resources: [] };
  private _serverInfo: { name?: string; version?: string } = {};
  private _options: McpClientOptions;

  constructor(options: McpClientOptions) {
    super();
    this._options = options;
  }

  get connected(): boolean { return this._connected; }
  get capabilities(): McpCapabilities { return this._capabilities; }
  get serverInfo(): { name?: string; version?: string } { return this._serverInfo; }

  /**
   * Connect to the MCP server and perform initialization handshake.
   */
  async connect(): Promise<McpCapabilities> {
    const timeout = this._options.connectionTimeout || 15000;

    // Create transport
    if (this._options.transport === 'stdio') {
      if (!this._options.command) throw new Error('STDIO transport requires a command');
      let cmd: string;
      let args: string[];
      if (this._options.args && this._options.args.length > 0) {
        // Explicit args provided — use command as-is
        cmd = this._options.command;
        args = this._options.args;
      } else {
        // No explicit args — split command by whitespace
        const parts = this._options.command.split(/\s+/);
        cmd = parts[0];
        args = parts.slice(1);
      }
      this._transport = new McpStdioTransport(cmd, args, this._options.envVars || {}, this._options.workingDir);
    } else {
      if (!this._options.url) throw new Error('HTTP transport requires a URL');
      this._transport = new McpHttpTransport(this._options.url);
    }

    // Wire events
    this._transport.on('message', (msg: Record<string, unknown>) => this._onMessage(msg));
    this._transport.on('error', (err: Error) => this.emit('error', err));
    this._transport.on('close', () => {
      this._connected = false;
      this.emit('disconnected');
    });

    // Start transport
    await Promise.race([
      this._transport.start(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), timeout)),
    ]);

    this._connected = true;

    // MCP Initialize handshake
    const initResult = await this._request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'Daakia', version: '0.1.0' },
    }) as { serverInfo?: { name?: string; version?: string }; capabilities?: Record<string, unknown> };

    this._serverInfo = initResult?.serverInfo || {};

    // Send initialized notification
    this._notify('notifications/initialized', {});

    // Discover capabilities
    await this._discoverCapabilities();

    this.emit('connected', this._capabilities);
    return this._capabilities;
  }

  /**
   * Disconnect from the MCP server.
   */
  disconnect(): void {
    this._connected = false;
    // Reject all pending requests
    for (const [id, pending] of this._pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Disconnected'));
    }
    this._pending.clear();
    this._transport?.close();
    this._transport = null;
    this.emit('disconnected');
  }

  /**
   * Call a tool on the MCP server.
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return this._request('tools/call', { name, arguments: args });
  }

  /**
   * Get a prompt from the MCP server.
   */
  async getPrompt(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return this._request('prompts/get', { name, arguments: args });
  }

  /**
   * Read a resource from the MCP server.
   */
  async readResource(uri: string): Promise<unknown> {
    return this._request('resources/read', { uri });
  }

  /**
   * Refresh capabilities from the server.
   */
  async refreshCapabilities(): Promise<McpCapabilities> {
    await this._discoverCapabilities();
    return this._capabilities;
  }

  // ────────────── Private ──────────────

  private async _discoverCapabilities(): Promise<void> {
    // List tools
    try {
      const toolsResult = await this._request('tools/list', {}) as { tools?: McpToolDef[] };
      this._capabilities.tools = toolsResult?.tools || [];
    } catch { this._capabilities.tools = []; }

    // List prompts
    try {
      const promptsResult = await this._request('prompts/list', {}) as { prompts?: McpPromptDef[] };
      this._capabilities.prompts = promptsResult?.prompts || [];
    } catch { this._capabilities.prompts = []; }

    // List resources
    try {
      const resourcesResult = await this._request('resources/list', {}) as { resources?: McpResourceDef[] };
      this._capabilities.resources = resourcesResult?.resources || [];
    } catch { this._capabilities.resources = []; }
  }

  private _request(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this._transport || !this._connected) {
        return reject(new Error('Not connected'));
      }

      const id = this._nextId++;
      const timeout = this._options.requestTimeout || 30000;

      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeout);

      this._pending.set(id, { resolve, reject, timer });

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      try {
        this._transport.send(request);
      } catch (err) {
        this._pending.delete(id);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  private _notify(method: string, params: Record<string, unknown>): void {
    if (!this._transport || !this._connected) return;
    this._transport.send({ jsonrpc: '2.0', method, params });
  }

  private _onMessage(msg: Record<string, unknown>): void {
    // JSON-RPC response
    if ('id' in msg && msg.id != null) {
      const id = msg.id as number;
      const pending = this._pending.get(id);
      if (pending) {
        this._pending.delete(id);
        clearTimeout(pending.timer);
        if (msg.error) {
          const err = msg.error as { code: number; message: string };
          pending.reject(new Error(`MCP Error ${err.code}: ${err.message}`));
        } else {
          pending.resolve(msg.result);
        }
      }
    }

    // JSON-RPC notification (server-initiated)
    if ('method' in msg && !('id' in msg)) {
      this.emit('notification', { method: msg.method, params: msg.params });
    }
  }
}
