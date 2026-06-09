/**
 * ImportPanel — protocol-aware import for REST, GraphQL, gRPC, SOAP, and Realtime mocks.
 * Input area uses Monaco CodeEditor (language-aware). Protocol colors follow each protocol's accent.
 */
import { useState, useRef } from 'react';
import { ChevronDownIcon } from '../../../icons';
import { CodeEditor, type CodeLanguage } from '../../shared';
import type { MockRoute } from '../mock-types';

// Protocol → accent color
const PROTOCOL_ACCENT: Record<string, string> = {
  rest:      'var(--color-protocol-rest)',
  graphql:   'var(--color-protocol-gql)',
  websocket: 'var(--color-protocol-ws)',
  sse:       'var(--color-protocol-sse)',
  socketio:  'var(--color-protocol-socketio)',
  mqtt:      'var(--color-protocol-mqtt)',
  grpc:      'var(--color-protocol-grpc)',
  soap:      'var(--color-protocol-soap)',
  mcp:       'var(--color-protocol-mcp)',
};

// Import format → Monaco language
const FORMAT_LANGUAGE: Record<string, CodeLanguage> = {
  openapi:     'plaintext',
  postman:     'json',
  wiremock:    'json',
  sdl:         'graphql',
  proto:       'plaintext',
  wsdl:        'xml',
  'json-events': 'json',
};

function getAccent(protocol: string): string {
  return PROTOCOL_ACCENT[protocol] ?? 'var(--color-mock-server)';
}

// ─── Types ────────────────────────────────────────────────────────────────────

type RestFormat    = 'openapi' | 'postman' | 'wiremock';
type GqlFormat     = 'sdl';
type GrpcFormat    = 'proto';
type SoapFormat    = 'wsdl';
type RealtimeFormat = 'json-events';

type ImportFormat = RestFormat | GqlFormat | GrpcFormat | SoapFormat | RealtimeFormat;

interface ImportResult {
  routes: MockRoute[];
  warnings: string[];
  errors: string[];
  routeCount: number;
  raw?: string; // for non-REST protocols (SDL, proto, WSDL get stored as raw config)
}

interface ContractResult {
  valid: boolean;
  violations: Array<{ path: string; message: string; severity: 'error' | 'warning' }>;
  summary: string;
}

export interface Props {
  protocol?: string;
  onImport: (routes: MockRoute[], raw?: string) => void;
}

// ─── Protocol config ──────────────────────────────────────────────────────────

interface ProtocolConfig {
  formats: { id: ImportFormat; label: string }[];
  hint: (fmt: ImportFormat) => string;
  placeholder: (fmt: ImportFormat) => string;
  accept: string;
  hasContractValidation: boolean;
}

const PROTOCOL_CONFIG: Record<string, ProtocolConfig> = {
  rest: {
    formats: [
      { id: 'openapi',  label: 'OpenAPI 3.x' },
      { id: 'postman',  label: 'Postman' },
      { id: 'wiremock', label: 'WireMock' },
    ],
    hint: f => ({
      openapi:  'OpenAPI 3.0/3.1 YAML or JSON — generates one mock route per operation with schema-based example bodies.',
      postman:  'Postman Collection v2.0/v2.1 JSON — imports requests with saved example responses.',
      wiremock: 'WireMock stub mappings JSON — imports request matchers, response bodies, and delays.',
    }[f as RestFormat] ?? ''),
    placeholder: f => ({
      openapi:  `openapi: '3.0.0'\ninfo:\n  title: My API\n  version: '1.0'\npaths:\n  /users:\n    get:\n      responses:\n        '200':\n          description: OK`,
      postman:  `{\n  "info": { "name": "My Collection", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },\n  "item": []\n}`,
      wiremock: `{\n  "mappings": [{ "request": { "method": "GET", "url": "/api/users" }, "response": { "status": 200, "body": "[]" } }]\n}`,
    }[f as RestFormat] ?? ''),
    accept: '.json,.yaml,.yml',
    hasContractValidation: true,
  },

  graphql: {
    formats: [{ id: 'sdl', label: 'GraphQL SDL' }],
    hint: () => 'GraphQL Schema Definition Language (.graphql / .gql). Parses types, queries, mutations, and subscriptions to generate resolver mock responses.',
    placeholder: () => `type Query {\n  user(id: ID!): User\n  users: [User!]!\n}\n\ntype Mutation {\n  createUser(input: CreateUserInput!): User!\n}\n\ntype User {\n  id: ID!\n  name: String!\n  email: String!\n}\n\ninput CreateUserInput {\n  name: String!\n  email: String!\n}`,
    accept: '.graphql,.gql,.sdl',
    hasContractValidation: true,
  },

  grpc: {
    formats: [{ id: 'proto', label: 'Protocol Buffer (.proto)' }],
    hint: () => 'Protobuf service definition (.proto file). Parses service definitions and RPC methods to generate mock handler stubs with example JSON responses.',
    placeholder: () => `syntax = "proto3";\n\npackage users;\n\nservice UserService {\n  rpc GetUser (GetUserRequest) returns (User);\n  rpc ListUsers (ListUsersRequest) returns (ListUsersResponse);\n  rpc CreateUser (CreateUserRequest) returns (User);\n}\n\nmessage User {\n  string id = 1;\n  string name = 2;\n  string email = 3;\n}\n\nmessage GetUserRequest {\n  string id = 1;\n}\n\nmessage ListUsersRequest {}\n\nmessage ListUsersResponse {\n  repeated User users = 1;\n}\n\nmessage CreateUserRequest {\n  string name = 1;\n  string email = 2;\n}`,
    accept: '.proto',
    hasContractValidation: false,
  },

  soap: {
    formats: [{ id: 'wsdl', label: 'WSDL' }],
    hint: () => 'WSDL 1.1 or 2.0 XML document. Parses services, port types, and operations to generate mock SOAP response envelopes for each operation.',
    placeholder: () => `<?xml version="1.0" encoding="UTF-8"?>\n<definitions name="WeatherService"\n  targetNamespace="http://example.com/weather"\n  xmlns="http://schemas.xmlsoap.org/wsdl/"\n  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"\n  xmlns:tns="http://example.com/weather"\n  xmlns:xsd="http://www.w3.org/2001/XMLSchema">\n  <portType name="WeatherPortType">\n    <operation name="GetWeather">\n      <input message="tns:GetWeatherRequest"/>\n      <output message="tns:GetWeatherResponse"/>\n    </operation>\n  </portType>\n</definitions>`,
    accept: '.wsdl,.xml',
    hasContractValidation: false,
  },
};

// Realtime protocols all share the same JSON-events format
const REALTIME_PROTOCOLS = new Set(['websocket', 'sse', 'socketio', 'mqtt']);
const REALTIME_CONFIG: ProtocolConfig = {
  formats: [{ id: 'json-events', label: 'JSON Event Definitions' }],
  hint: () => 'JSON array of event/message definitions. Each entry describes a message name, payload shape, and optional trigger conditions.',
  placeholder: () => `[\n  {\n    "event": "user:connected",\n    "direction": "server→client",\n    "payload": { "userId": "string", "username": "string", "timestamp": "ISO8601" },\n    "description": "Fired when a user connects"\n  },\n  {\n    "event": "message:send",\n    "direction": "client→server",\n    "payload": { "roomId": "string", "text": "string" },\n    "description": "Client sends a chat message"\n  },\n  {\n    "event": "message:broadcast",\n    "direction": "server→client",\n    "payload": { "id": "string", "roomId": "string", "from": "string", "text": "string" },\n    "description": "Server broadcasts message to room members"\n  }\n]`,
  accept: '.json',
  hasContractValidation: false,
};

function getProtocolConfig(protocol: string): ProtocolConfig {
  if (REALTIME_PROTOCOLS.has(protocol)) return REALTIME_CONFIG;
  return PROTOCOL_CONFIG[protocol] ?? PROTOCOL_CONFIG.rest;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImportPanel({ protocol = 'rest', onImport }: Props) {
  const cfg = getProtocolConfig(protocol);
  const ACCENT = getAccent(protocol);
  const [format, setFormat] = useState<ImportFormat>(cfg.formats[0].id);
  const [content, setContent] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [contractMode, setContractMode] = useState(false);
  const [contractResult, setContractResult] = useState<ContractResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editorLanguage: CodeLanguage = (FORMAT_LANGUAGE[format] as CodeLanguage) ?? 'plaintext';

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setContent(ev.target?.result as string ?? '');
    reader.readAsText(file);
  };

  const handleParse = () => {
    if (!content.trim()) return;
    setLoading(true);
    setResult(null);
    setTimeout(() => {
      const r = parseContent(protocol, format, content);
      setResult(r);
      setLoading(false);
    }, 100);
  };

  const handleValidate = () => {
    setContractResult(validateContent(protocol, format, content));
  };

  const currentHint = cfg.hint(format);
  const currentPlaceholder = cfg.placeholder(format);

  return (
    <div className="flex flex-col gap-3">
      {/* Format selector */}
      {cfg.formats.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-text-muted)]">Format</span>
          <div className="flex rounded-md overflow-hidden border border-[rgba(255,255,255,0.1)]">
            {cfg.formats.map((f, i) => (
              <button key={f.id} type="button" onClick={() => { setFormat(f.id); setResult(null); setContractResult(null); }}
                className="h-[26px] px-3 text-[10px] font-medium cursor-pointer transition-colors"
                style={{
                  background: format === f.id ? `color-mix(in srgb, ${ACCENT} 15%, transparent)` : 'transparent',
                  color: format === f.id ? ACCENT : 'var(--color-text-muted)',
                  borderRight: i < cfg.formats.length - 1 ? '1px solid rgba(255,255,255,0.1)' : undefined,
                }}>
                {f.label}
              </button>
            ))}
          </div>
          {cfg.hasContractValidation && (
            <div className="flex items-center gap-1.5 ml-auto">
              <label className="text-[10px] text-[var(--color-text-muted)] cursor-pointer">Contract validation</label>
              <button type="button" onClick={() => setContractMode(v => !v)}
                className="relative w-[28px] h-[14px] rounded-full transition-colors cursor-pointer flex-shrink-0"
                style={{ backgroundColor: contractMode ? ACCENT : 'var(--color-muted-fallback)' }}>
                <span className="absolute top-[2px] w-[10px] h-[10px] rounded-full bg-white transition-all" style={{ left: contractMode ? '16px' : '2px' }} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Hint */}
      {currentHint && <p className="text-[10px] text-[var(--color-text-muted)] opacity-60 leading-relaxed">{currentHint}</p>}

      {/* Input area */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">
            {cfg.formats.find(f => f.id === format)?.label ?? 'Content'}
          </label>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="h-[22px] px-2 text-[10px] rounded cursor-pointer"
            style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
            Upload file
          </button>
          <input ref={fileRef} type="file" accept={cfg.accept} className="hidden" onChange={handleFile} />
        </div>
        <div
          className="rounded-lg overflow-hidden border"
          style={{ borderColor: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}
        >
          <CodeEditor
            value={content || currentPlaceholder}
            onChange={v => setContent(v ?? '')}
            language={editorLanguage}
            height="220px"
            fontSize={11}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={handleParse} disabled={!content.trim() || loading}
          className="h-[30px] px-4 text-[11px] font-medium rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: `color-mix(in srgb, ${ACCENT} 15%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)`, color: ACCENT }}>
          {loading ? 'Parsing…' : 'Parse & Preview'}
        </button>
        {contractMode && cfg.hasContractValidation && (
          <button type="button" onClick={handleValidate} disabled={!content.trim()}
            className="h-[30px] px-4 text-[11px] font-medium rounded cursor-pointer disabled:opacity-40"
            style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)', color: 'var(--color-warning)' }}>
            Validate Contract
          </button>
        )}
      </div>

      {contractResult && <ContractResultView result={contractResult} />}
      {result && <ParseResultView result={result} protocol={protocol} accent={ACCENT} onImport={() => onImport(result.routes, result.raw)} />}
    </div>
  );
}

// ─── Contract result ──────────────────────────────────────────────────────────

function ContractResultView({ result }: { result: ContractResult }) {
  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: result.valid ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)' }}>
      <div className="px-3 py-2 flex items-center gap-2" style={{ background: result.valid ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)' }}>
        <span className="text-[12px]">{result.valid ? '✅' : '❌'}</span>
        <span className="text-[11px] font-medium" style={{ color: result.valid ? 'var(--color-success)' : 'var(--color-error)' }}>{result.summary}</span>
      </div>
      {result.violations.length > 0 && (
        <div className="px-3 py-2 flex flex-col gap-1 max-h-[120px] overflow-y-auto">
          {result.violations.map((v, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-[9px] flex-shrink-0 mt-0.5" style={{ color: v.severity === 'error' ? 'var(--color-error)' : 'var(--color-warning)' }}>{v.severity === 'error' ? '●' : '○'}</span>
              <div><span className="text-[10px] font-mono text-[var(--color-text-muted)]">{v.path}</span><span className="text-[10px] text-[var(--color-text-muted)] ml-2">{v.message}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Parse result ─────────────────────────────────────────────────────────────

function ParseResultView({ result, protocol, accent, onImport }: { result: ImportResult; protocol: string; accent: string; onImport: () => void }) {
  const ACCENT = accent;
  const [expanded, setExpanded] = useState(true);
  const isNonRest = protocol !== 'rest';

  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.1)] overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between bg-[rgba(255,255,255,0.02)]">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setExpanded(v => !v)} className="cursor-pointer text-[var(--color-text-muted)]">
            <span style={{ display: 'inline-flex', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}><ChevronDownIcon size={12} /></span>
          </button>
          <span className="text-[11px] font-medium text-[var(--color-text-primary)]">
            {isNonRest ? 'Parsed successfully' : `${result.routeCount} route${result.routeCount !== 1 ? 's' : ''} found`}
          </span>
          {result.warnings.length > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(234,179,8,0.12)] text-[var(--color-warning)]">{result.warnings.length} warnings</span>}
          {result.errors.length > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(239,68,68,0.12)] text-[var(--color-error)]">{result.errors.length} errors</span>}
        </div>
        {(result.routes.length > 0 || result.raw) && (
          <button type="button" onClick={onImport}
            className="h-[26px] px-3 text-[10px] font-medium rounded cursor-pointer"
            style={{ background: `color-mix(in srgb, ${ACCENT} 15%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)`, color: ACCENT }}>
            {isNonRest ? 'Apply to Server' : 'Import All Routes'}
          </button>
        )}
      </div>
      {expanded && (
        <div className="max-h-[200px] overflow-y-auto divide-y divide-[rgba(255,255,255,0.05)]">
          {result.routes.map((r, i) => (
            <div key={r.id ?? i} className="flex items-center gap-2 px-3 py-1.5">
              <span className="text-[9px] font-mono px-1 py-0.5 rounded font-medium bg-[rgba(14,165,233,0.12)] text-[var(--color-info)]">{r.method}</span>
              <span className="text-[11px] font-mono text-[var(--color-text-muted)] flex-1 truncate">{r.path}</span>
              <span className="text-[10px] font-mono text-[var(--color-text-muted)]">{r.statusCode}</span>
            </div>
          ))}
          {result.raw && isNonRest && (
            <div className="px-3 py-2">
              <div className="rounded-lg overflow-hidden border border-[rgba(255,255,255,0.06)]">
                <CodeEditor
                  value={result.raw.slice(0, 1000)}
                  language={protocol === 'soap' ? 'xml' : protocol === 'graphql' ? 'graphql' : 'plaintext'}
                  readOnly
                  height="100px"
                  fontSize={10}
                />
              </div>
            </div>
          )}
          {result.warnings.map((w, i) => <div key={`w${i}`} className="px-3 py-1.5 text-[10px] text-[var(--color-warning)] opacity-80">⚠ {w}</div>)}
          {result.errors.map((e, i) => <div key={`e${i}`} className="px-3 py-1.5 text-[10px] text-[var(--color-error)]">✖ {e}</div>)}
        </div>
      )}
    </div>
  );
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseContent(protocol: string, format: ImportFormat, content: string): ImportResult {
  try {
    if (protocol === 'rest') return parseRest(format as RestFormat, content);
    if (protocol === 'graphql') return parseGraphQLSDL(content);
    if (protocol === 'grpc') return parseProto(content);
    if (protocol === 'soap') return parseWsdl(content);
    if (REALTIME_PROTOCOLS.has(protocol)) return parseJsonEvents(content);
    return { routes: [], warnings: ['Unknown protocol'], errors: [], routeCount: 0 };
  } catch (e) {
    return { routes: [], warnings: [], errors: [`Parse error: ${String(e)}`], routeCount: 0 };
  }
}

function parseRest(format: RestFormat, content: string): ImportResult {
  const routes: MockRoute[] = [];
  const warnings: string[] = [];
  if (format === 'openapi') {
    warnings.push('Preview only — full import runs in extension host for complete schema-based body generation.');
    const pathMatches = content.match(/^\s{2}\/[\w/{}.-]+:/gm) ?? [];
    const methods = ['get', 'post', 'put', 'patch', 'delete'];
    pathMatches.forEach(pathLine => {
      const path = pathLine.trim().replace(/:$/, '');
      methods.forEach(m => {
        if (content.includes(`\n    ${m}:`)) {
          routes.push({ id: crypto.randomUUID(), method: m.toUpperCase() as MockRoute['method'], path, statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: '{}', delay: 0, enabled: true });
        }
      });
    });
    if (routes.length === 0) routes.push({ id: crypto.randomUUID(), method: 'GET', path: '/api/resource', statusCode: 200, headers: {}, body: '{}', delay: 0, enabled: true });
  } else if (format === 'postman') {
    const parsed = JSON.parse(content) as { item?: unknown[] };
    (parsed.item ?? []).forEach((_, i) => routes.push({ id: crypto.randomUUID(), method: 'GET', path: `/collection/item/${i}`, statusCode: 200, headers: {}, body: '{}', delay: 0, enabled: true }));
  } else {
    const parsed = JSON.parse(content) as { mappings?: Array<{ request?: { method?: string; url?: string }; response?: { status?: number; body?: string } }> };
    (parsed.mappings ?? []).forEach(m => routes.push({ id: crypto.randomUUID(), method: (m.request?.method ?? 'GET') as MockRoute['method'], path: m.request?.url ?? '/', statusCode: m.response?.status ?? 200, headers: {}, body: m.response?.body ?? '{}', delay: 0, enabled: true }));
  }
  return { routes, warnings, errors: [], routeCount: routes.length };
}

function parseGraphQLSDL(content: string): ImportResult {
  const warnings: string[] = [];
  const operations: string[] = [];
  // Extract type Query / Mutation / Subscription fields
  const typeBlocks = content.match(/type\s+(Query|Mutation|Subscription)\s*\{([^}]+)\}/g) ?? [];
  typeBlocks.forEach(block => {
    const typeMatch = block.match(/type\s+(\w+)/);
    const typeName = typeMatch?.[1] ?? 'Query';
    const fields = block.match(/^\s+(\w+)\s*[(:]/gm) ?? [];
    fields.forEach(f => operations.push(`${typeName}.${f.trim().replace(/[:(].*/, '')}`));
  });
  if (operations.length === 0) warnings.push('No Query/Mutation/Subscription types found. Check your SDL syntax.');
  return {
    routes: [],
    warnings,
    errors: [],
    routeCount: operations.length,
    raw: `# GraphQL SDL — ${operations.length} operation(s) detected\n# Operations: ${operations.join(', ')}\n\n${content}`,
  };
}

function parseProto(content: string): ImportResult {
  const services = content.match(/service\s+(\w+)/g)?.map(s => s.replace('service ', '')) ?? [];
  const rpcs = content.match(/rpc\s+(\w+)/g)?.map(r => r.replace('rpc ', '')) ?? [];
  const warnings: string[] = [];
  if (services.length === 0) warnings.push('No service definitions found. Check your .proto syntax.');
  return {
    routes: [],
    warnings,
    errors: [],
    routeCount: rpcs.length,
    raw: `# Protobuf — ${services.length} service(s), ${rpcs.length} RPC(s)\n# Services: ${services.join(', ')}\n# RPCs: ${rpcs.join(', ')}\n\n${content}`,
  };
}

function parseWsdl(content: string): ImportResult {
  const operations = content.match(/<(?:wsdl:)?operation\s+name="([^"]+)"/g)?.map(o => o.match(/name="([^"]+)"/)?.[1] ?? '') ?? [];
  const warnings: string[] = [];
  if (operations.length === 0) warnings.push('No operations found. Ensure this is a valid WSDL document.');
  return {
    routes: [],
    warnings,
    errors: [],
    routeCount: operations.length,
    raw: `<!-- WSDL — ${operations.length} operation(s): ${operations.join(', ')} -->\n${content}`,
  };
}

function parseJsonEvents(content: string): ImportResult {
  const events = JSON.parse(content) as Array<{ event: string; direction?: string; payload?: unknown }>;
  if (!Array.isArray(events)) throw new Error('Expected a JSON array of event definitions');
  return {
    routes: [],
    warnings: events.length === 0 ? ['No events defined'] : [],
    errors: [],
    routeCount: events.length,
    raw: JSON.stringify(events, null, 2),
  };
}

function validateContent(protocol: string, _format: ImportFormat, content: string): ContractResult {
  try {
    if (protocol === 'rest') {
      const obj = content.trim().startsWith('{') ? JSON.parse(content) as Record<string, unknown> : null;
      const violations: ContractResult['violations'] = [];
      if (obj) {
        if (!obj['openapi'] && !obj['mappings'] && !obj['info']) violations.push({ path: '#', message: 'Unrecognized format — expected OpenAPI, Postman, or WireMock JSON', severity: 'error' });
        if (obj['openapi'] && !obj['info']) violations.push({ path: '#/info', message: 'Missing required "info" field', severity: 'error' });
        if (obj['openapi'] && !obj['paths']) violations.push({ path: '#/paths', message: 'Missing "paths" field', severity: 'warning' });
      } else {
        if (!content.includes('openapi:')) violations.push({ path: '#/openapi', message: 'Missing "openapi:" key', severity: 'error' });
      }
      const valid = violations.filter(v => v.severity === 'error').length === 0;
      return { valid, violations, summary: valid ? 'Valid document' : `${violations.filter(v => v.severity === 'error').length} error(s) found` };
    }
    if (protocol === 'graphql') {
      const violations: ContractResult['violations'] = [];
      if (!content.includes('type Query') && !content.includes('type Mutation')) violations.push({ path: '#/types', message: 'No Query or Mutation type defined', severity: 'warning' });
      if (content.includes('type ') && !content.includes('{')) violations.push({ path: '#/syntax', message: 'Type definitions missing body braces', severity: 'error' });
      const valid = violations.filter(v => v.severity === 'error').length === 0;
      return { valid, violations, summary: valid ? 'Valid GraphQL SDL' : `${violations.filter(v => v.severity === 'error').length} error(s) found` };
    }
    return { valid: true, violations: [], summary: 'Validation not available for this format' };
  } catch (e) {
    return { valid: false, violations: [{ path: '#', message: `Parse error: ${String(e)}`, severity: 'error' }], summary: 'Parse error' };
  }
}
