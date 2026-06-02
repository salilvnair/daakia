/**
 * MCP Protocol types — interfaces for Model Context Protocol
 * client, transports, server management, and capabilities.
 */

// ────────────── Transport Types ──────────────

export type McpTransport = 'stdio' | 'http';

export interface McpServerConfig {
  id: string;
  name: string;
  transport: McpTransport;
  command?: string;        // STDIO: command to spawn (e.g., 'npx', 'node')
  args?: string[];         // STDIO: command arguments
  url?: string;            // HTTP: server endpoint URL
  envVars?: Record<string, string>; // Environment variables for process
  enabled: boolean;
}

// ────────────── JSON-RPC 2.0 ──────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// ────────────── MCP Protocol Messages ──────────────

export interface McpInitializeParams {
  protocolVersion: string;
  capabilities: McpClientCapabilities;
  clientInfo: { name: string; version: string };
}

export interface McpClientCapabilities {
  roots?: { listChanged?: boolean };
  sampling?: Record<string, unknown>;
}

export interface McpServerCapabilities {
  tools?: { listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  logging?: Record<string, unknown>;
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: McpServerCapabilities;
  serverInfo: { name: string; version: string };
}

// ────────────── Tool Types ──────────────

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
}

export interface McpCallToolParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpToolResult {
  content: McpContent[];
  isError?: boolean;
}

export interface McpContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;        // base64 for images
  mimeType?: string;
  resource?: { uri: string; text?: string; blob?: string; mimeType?: string };
}

// ────────────── Prompt Types ──────────────

export interface McpPromptDef {
  name: string;
  description?: string;
  arguments?: McpPromptArgument[];
}

export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpGetPromptParams {
  name: string;
  arguments?: Record<string, string>;
}

export interface McpPromptResult {
  description?: string;
  messages: McpPromptMessage[];
}

export interface McpPromptMessage {
  role: 'user' | 'assistant';
  content: McpContent;
}

// ────────────── Resource Types ──────────────

export interface McpResourceDef {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpReadResourceParams {
  uri: string;
}

export interface McpResourceResult {
  contents: McpResourceContent[];
}

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64
}

// ────────────── Capabilities ──────────────

export interface McpCapabilities {
  tools: McpToolDef[];
  prompts: McpPromptDef[];
  resources: McpResourceDef[];
}

// ────────────── Conversation Entry ──────────────

export interface McpConversationEntry {
  id: string;
  type: 'tool-call' | 'tool-result' | 'prompt-run' | 'resource-read' | 'error';
  serverName: string;
  name: string;
  input?: string;
  output?: string;
  duration?: number;
  timestamp: number;
  success: boolean;
}

// ────────────── Settings ──────────────

export interface McpSettings {
  connectionTimeout: number;   // ms, default 15000
  requestTimeout: number;      // ms, default 30000
  autoReconnect: boolean;
  maxRetries: number;
  workingDir?: string;
}

export const DEFAULT_MCP_SETTINGS: McpSettings = {
  connectionTimeout: 15000,
  requestTimeout: 30000,
  autoReconnect: true,
  maxRetries: 3,
};
