/**
 * Centralized color tokens for Daakia — single source of truth.
 * Inspired by SwiftUI: each semantic color has a `light` and `dark` variant.
 *
 * Usage:
 *   import { colors, METHOD_COLORS, TOAST_TYPE_CONFIG } from '../colors/daakia-colors';
 *   style={{ color: METHOD_COLORS.GET }}
 *
 * To change a color globally: edit it here and everything updates.
 * Theme detection uses the `data-theme` attribute on <html> or prefers-color-scheme.
 */

// ─── Theme Detection ─────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark';

export function getTheme(): ThemeMode {
  if (typeof document !== 'undefined') {
    const html = document.documentElement;
    if (html.getAttribute('data-theme') === 'light') return 'light';
    if (html.classList.contains('vscode-light')) return 'light';
  }
  return 'dark';
}

/** Get the current value for a semantic color pair */
function themed(pair: { light: string; dark: string }): string {
  return getTheme() === 'light' ? pair.light : pair.dark;
}

// ─── Semantic Color Pairs (light / dark) ─────────────────────────────────────

export const palette = {
  // Status
  success:  { light: '#16a34a', dark: '#22c55e' },
  error:    { light: '#dc2626', dark: '#ef4444' },
  warning:  { light: '#d97706', dark: '#f59e0b' },
  info:     { light: '#4f46e5', dark: '#6366f1' },

  // HTTP Methods
  methodGet:     { light: '#16a34a', dark: '#22c55e' },
  methodPost:    { light: '#d97706', dark: '#f59e0b' },
  methodPut:     { light: '#2563eb', dark: '#3b82f6' },
  methodPatch:   { light: '#7c3aed', dark: '#a78bfa' },
  methodDelete:  { light: '#dc2626', dark: '#ef4444' },
  methodHead:    { light: '#0891b2', dark: '#06b6d4' },
  methodOptions: { light: '#db2777', dark: '#ec4899' },

  // Sidebar accent
  collections:   { light: '#9333ea', dark: '#a855f7' },
  history:       { light: '#0d9488', dark: '#2dd4bf' },
  environments:  { light: '#16a34a', dark: '#4ade80' },

  // Protocol accents
  protocolRest:      { light: '#4f46e5', dark: '#6366f1' },
  protocolGraphQL:   { light: '#c2185b', dark: '#E535AB' },
  protocolWebSocket: { light: '#2e7d32', dark: '#4caf50' },

  // Misc semantic
  mockServer:      { light: '#b45309', dark: '#eab308' },
  mockServerMuted: { light: '#92400e', dark: '#d4a017' },
  tryButton:       { light: '#4f46e5', dark: '#6366f1' },
  muted:           { light: '#6b7280', dark: '#6b7280' },
  mutedFallback:   { light: '#9ca3af', dark: '#9ca3af' },
  severeSlow:      { light: '#c2410c', dark: '#f97316' },
  criticalSlow:    { light: '#dc2626', dark: '#ef4444' },

  // Context menu icon colors
  ctxRename:       { light: '#0891b2', dark: '#22d3ee' },
  ctxDuplicate:    { light: '#7c3aed', dark: '#a78bfa' },
  ctxPin:          { light: '#d97706', dark: '#fbbf24' },
  ctxClose:        { light: '#dc2626', dark: '#ef4444' },
  ctxCloseBatch:   { light: '#ea580c', dark: '#fb923c' },
  ctxCloseSaved:   { light: '#16a34a', dark: '#4ade80' },
  ctxCloseAll:     { light: '#be123c', dark: '#f43f5e' },

  // Text on colored bg
  white: { light: '#ffffff', dark: '#ffffff' },
} as const;

// ─── Computed Color Values (call these at render time for theme-awareness) ───

/** Get all colors resolved for current theme */
export function resolveColors() {
  return {
    success: themed(palette.success),
    error: themed(palette.error),
    warning: themed(palette.warning),
    info: themed(palette.info),
    methodGet: themed(palette.methodGet),
    methodPost: themed(palette.methodPost),
    methodPut: themed(palette.methodPut),
    methodPatch: themed(palette.methodPatch),
    methodDelete: themed(palette.methodDelete),
    methodHead: themed(palette.methodHead),
    methodOptions: themed(palette.methodOptions),
    collections: themed(palette.collections),
    history: themed(palette.history),
    environments: themed(palette.environments),
    protocolRest: themed(palette.protocolRest),
    protocolGraphQL: themed(palette.protocolGraphQL),
    protocolWebSocket: themed(palette.protocolWebSocket),
    mockServer: themed(palette.mockServer),
    mockServerMuted: themed(palette.mockServerMuted),
    tryButton: themed(palette.tryButton),
    muted: themed(palette.muted),
    mutedFallback: themed(palette.mutedFallback),
    severeSlow: themed(palette.severeSlow),
    criticalSlow: themed(palette.criticalSlow),
  } as const;
}

// ─── HTTP Method Color Map ───────────────────────────────────────────────────

export type HttpMethodKey = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/** Method colors resolved for the current theme. Call at render time. */
export function getMethodColors(): Record<HttpMethodKey, string> {
  return {
    GET: themed(palette.methodGet),
    POST: themed(palette.methodPost),
    PUT: themed(palette.methodPut),
    PATCH: themed(palette.methodPatch),
    DELETE: themed(palette.methodDelete),
    HEAD: themed(palette.methodHead),
    OPTIONS: themed(palette.methodOptions),
  };
}

/**
 * Static METHOD_COLORS for dark-mode only contexts (VS Code extensions are almost always dark).
 * Prefer `getMethodColors()` for full theme support.
 */
export const METHOD_COLORS: Record<string, string> = {
  GET: palette.methodGet.dark,
  POST: palette.methodPost.dark,
  PUT: palette.methodPut.dark,
  PATCH: palette.methodPatch.dark,
  DELETE: palette.methodDelete.dark,
  HEAD: palette.methodHead.dark,
  OPTIONS: palette.methodOptions.dark,
  // Protocol labels (shown in collections sidebar)
  WS: palette.protocolWebSocket.dark,
  SSE: '#f59e0b',
  SIO: '#14b8a6',
  MQTT: '#8b5cf6',
  GQL: palette.protocolGraphQL.dark,
  GRPC: '#00b8b5',
  gRPC: '#00b8b5',
  SOAP: '#f97171',
  // AI & MCP protocol labels
  TOOL: '#3b82f6',  // MCP tool call — blue badge
  AI: '#a855f7',    // AI protocol — purple
  MCP: '#6366f1',   // MCP protocol — indigo
  // AI Provider labels (history badges)
  OPENAI: '#10a37f',       // OpenAI green
  ANTHROPIC: '#d97706',    // Anthropic amber/orange
  GOOGLE: '#4285f4',       // Google blue
  OLLAMA: '#ffffff',       // Ollama white
  GROQ: '#f97316',         // Groq orange
  TOGETHER: '#6366f1',     // Together indigo
  MISTRAL: '#ff7000',      // Mistral orange
  XAI: '#1d9bf0',          // xAI blue
  DEEPSEEK: '#0ea5e9',     // DeepSeek sky blue
  'AZURE-OPENAI': '#0078d4', // Azure blue
  CUSTOM: '#a855f7',       // Custom purple
};

// ─── Toast Type Config ───────────────────────────────────────────────────────

export interface ToastTypeStyle {
  border: string;
  bg: string;
  icon: string;
}

export function getToastTypeConfig(): Record<string, ToastTypeStyle> {
  const c = resolveColors();
  return {
    success: { border: c.success, bg: hexToRgba(c.success, 0.08), icon: '✓' },
    error:   { border: c.error,   bg: hexToRgba(c.error, 0.08),   icon: '✕' },
    info:    { border: c.info,    bg: hexToRgba(c.info, 0.08),    icon: 'ℹ' },
    warning: { border: c.warning, bg: hexToRgba(c.warning, 0.08), icon: '⚠' },
  };
}

// ─── Response Time Colors ────────────────────────────────────────────────────

/** Returns appropriate color for response time thresholds */
export function getResponseTimeColor(ms: number): string {
  const c = resolveColors();
  if (ms < 200) return c.success;
  if (ms < 500) return c.warning;
  if (ms < 1000) return c.severeSlow;
  return c.criticalSlow;
}

// ─── Protocol Accent ─────────────────────────────────────────────────────────

export function getProtocolAccent(protocol: 'rest' | 'graphql' | 'websocket' | 'grpc' | 'soap' | 'ai' | 'mcp'): string {
  switch (protocol) {
    case 'graphql': return themed(palette.protocolGraphQL);
    case 'websocket': return themed(palette.protocolWebSocket);
    case 'grpc': return 'var(--color-protocol-grpc)';
    case 'soap': return 'var(--color-protocol-soap)';
    case 'ai': return 'var(--color-protocol-ai)';
    case 'mcp': return 'var(--color-protocol-mcp)';
    default: return themed(palette.protocolRest);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert hex (#rrggbb) to rgba string */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Get a 20% opacity bg for method pill badges */
export function methodBg(method: string): string {
  const color = METHOD_COLORS[method] || palette.muted.dark;
  return `${color}20`;
}

// ─── Mock Server Protocol Colors ─────────────────────────────────────────────

export type MockServerProtocol = 'rest' | 'graphql' | 'websocket' | 'sse' | 'socketio' | 'mqtt' | 'grpc' | 'soap';

export const MOCK_PROTOCOL_COLORS: Record<MockServerProtocol, string> = {
  rest: palette.protocolRest.dark,
  graphql: palette.protocolGraphQL.dark,
  websocket: palette.protocolWebSocket.dark,
  sse: '#f59e0b',
  socketio: '#14b8a6',
  mqtt: '#8b5cf6',
  grpc: '#00b8b5',
  soap: '#f97171',
};

export function getMockProtocolColor(protocol: MockServerProtocol): string {
  switch (protocol) {
    case 'graphql': return themed(palette.protocolGraphQL);
    case 'websocket': return themed(palette.protocolWebSocket);
    case 'sse': return 'var(--color-protocol-sse)';
    case 'socketio': return 'var(--color-protocol-socketio)';
    case 'mqtt': return 'var(--color-protocol-mqtt)';
    case 'grpc': return 'var(--color-protocol-grpc)';
    case 'soap': return 'var(--color-protocol-soap)';
    default: return themed(palette.protocolRest);
  }
}

export function getMockProtocolBg(protocol: MockServerProtocol): string {
  return hexToRgba(MOCK_PROTOCOL_COLORS[protocol], 0.12);
}

export function getMockProtocolLabel(protocol: MockServerProtocol): string {
  switch (protocol) {
    case 'graphql': return 'GraphQL';
    case 'websocket': return 'WebSocket';
    case 'sse': return 'SSE';
    case 'socketio': return 'Socket.IO';
    case 'mqtt': return 'MQTT';
    case 'grpc': return 'gRPC';
    case 'soap': return 'SOAP';
    default: return 'REST';
  }
}
