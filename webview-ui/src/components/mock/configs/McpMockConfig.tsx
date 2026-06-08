/**
 * McpMockConfig — UI for managing MCP mock server tools.
 *
 * Layout:
 *   • Built-in tools   — always-visible bubble chips; click to expand a read-only detail card.
 *   • Custom tools     — bubble chips below built-ins; click to edit; trash to delete.
 *   • "Add Custom Tool" — opens a new draft card; Save/Cancel to commit.
 */
import { useState, useCallback } from 'react';
import type { MockServer, McpMockTool } from '../mock-types';
import { createDefaultMcpTool } from '../mock-types';
import { PlusIcon, TrashIcon, CloseIcon } from '../../../icons';
import { ConfirmDialog } from '../../shared';

interface Props {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
}

const MCP_COLOR = 'var(--color-protocol-mcp)';
const CHIP_STYLE = { backgroundColor: 'rgba(99,102,241,0.12)', color: 'var(--color-protocol-mcp)', border: '1px solid rgba(99,102,241,0.22)' };

// ─── Compact built-in tool metadata (display only) ────────────────────────────
// Full responses are served by the extension host's mock-mcp-server.ts.

interface BuiltInToolMeta {
  name: string;
  description: string;
  delay: number;
  responsePreview: string;
  inputFields: string[];
}

const BUILT_IN_TOOL_META: BuiltInToolMeta[] = [
  { name: 'analyze_endpoint',            description: 'Analyzes a REST API endpoint and returns its purpose, common params, and response patterns.', delay: 300, responsePreview: 'Returns REST pattern, HTTP semantics, common query params, suggested headers, and expected status codes.', inputFields: ['method (string, required)', 'url (string, required)', 'description (string, optional)'] },
  { name: 'generate_json_schema',         description: 'Generates a JSON Schema (draft-07) from a sample JSON object.', delay: 400, responsePreview: 'Returns a full draft-07 schema with types, formats, required fields, and additionalProperties: false.', inputFields: ['sample (string, required)', 'title (string, optional)', 'strict (boolean, optional)'] },
  { name: 'explain_response',             description: 'Explains an API response JSON in plain English.', delay: 350, responsePreview: 'Returns field explanations, status meaning, response patterns, and implementation recommendations.', inputFields: ['response (string, required)', 'statusCode (integer, optional)'] },
  { name: 'suggest_headers',             description: 'Suggests appropriate HTTP headers for a given request type.', delay: 250, responsePreview: 'Returns a curated list of headers with name, value template, and purpose for the given method/context.', inputFields: ['method (string, required)', 'hasAuth (boolean, optional)', 'contentType (string, optional)'] },
  { name: 'create_test_case',            description: 'Creates a test case for an API endpoint.', delay: 450, responsePreview: 'Returns a Jest test with happy path, auth failure, not-found, and validation error cases.', inputFields: ['method (string, required)', 'url (string, required)', 'statusCode (integer, optional)'] },
  { name: 'validate_openapi',            description: 'Validates an OpenAPI specification and reports issues.', delay: 400, responsePreview: 'Returns validation result with errors, warnings, and actionable fix suggestions.', inputFields: ['spec (string, required)', 'version (string, optional, default: 3.0)'] },
  { name: 'generate_curl',               description: 'Generates a cURL command for a given endpoint.', delay: 200, responsePreview: 'Returns a ready-to-run cURL command with headers, body, and useful flags.', inputFields: ['method (string, required)', 'url (string, required)', 'headers (object, optional)', 'body (string, optional)'] },
  { name: 'check_auth_config',           description: 'Checks authentication configuration and identifies issues.', delay: 350, responsePreview: 'Returns auth type detected, issues found, and corrected configuration.', inputFields: ['headers (object, required)', 'authType (string, optional)'] },
  { name: 'parse_error_response',        description: 'Parses an error response and provides human-readable explanation.', delay: 300, responsePreview: 'Returns status code meaning, field-level errors, root cause, and fix suggestions.', inputFields: ['statusCode (integer, required)', 'body (string, required)'] },
  { name: 'suggest_environment_vars',    description: 'Suggests environment variables for an API integration.', delay: 350, responsePreview: 'Returns a .env template with all required variables, security notes, and Daakia usage guide.', inputFields: ['baseUrl (string, required)', 'authType (string, optional)', 'serviceName (string, optional)'] },
  { name: 'document_endpoint',           description: 'Documents an API endpoint in OpenAPI format.', delay: 500, responsePreview: 'Returns an OpenAPI path object with request body, responses, and rate limit info.', inputFields: ['method (string, required)', 'url (string, required)', 'description (string, optional)'] },
  { name: 'transform_data',              description: 'Provides a JavaScript function to transform API data.', delay: 300, responsePreview: 'Returns a JS transform function with camelCase conversion, date formatting, and bulk mapping.', inputFields: ['inputSample (string, required)', 'targetFormat (string, optional)'] },
  { name: 'mock_response_generator',     description: 'Generates a realistic mock response for an API endpoint.', delay: 250, responsePreview: 'Returns a plausible JSON response body with realistic values matching common REST patterns.', inputFields: ['method (string, required)', 'url (string, required)', 'statusCode (integer, optional, default: 200)'] },
  { name: 'performance_audit',           description: 'Audits API performance and suggests optimizations.', delay: 400, responsePreview: 'Returns caching strategy, pagination tips, parallel request pattern, and rate-limit backoff code.', inputFields: ['url (string, required)', 'method (string, optional)', 'avgResponseMs (integer, optional)'] },
  { name: 'generate_postman_collection', description: 'Generates a Postman collection from endpoint info.', delay: 450, responsePreview: 'Returns a Postman 2.1 collection JSON with auth, variables, and example requests.', inputFields: ['endpoints (array, required)', 'collectionName (string, optional)', 'baseUrl (string, optional)'] },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Read-only card for a built-in tool */
function BuiltInToolCard({ meta, onClose }: { meta: BuiltInToolMeta; onClose: () => void }) {
  return (
    <div
      className="rounded-lg border overflow-hidden mt-2"
      style={{ borderColor: 'rgba(99,102,241,0.25)', backgroundColor: 'rgba(99,102,241,0.04)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgba(99,102,241,0.15)]">
        <div className="w-3 h-3 rounded-sm flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--color-protocol-mcp)' }}>
          <span className="text-[7px] text-white font-bold">M</span>
        </div>
        <code className="text-[11px] font-semibold flex-1 font-mono" style={{ color: MCP_COLOR }}>{meta.name}</code>
        <span className="text-[9px] text-[var(--color-text-muted)] mr-2">Built-in · read-only</span>
        <button type="button" onClick={onClose} className="opacity-50 hover:opacity-100 cursor-pointer transition-opacity">
          <CloseIcon size={11} />
        </button>
      </div>
      {/* Fields */}
      <div className="px-3 py-2.5 flex flex-col gap-2.5">
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)] mb-0.5">Description</div>
          <p className="text-[10px] text-[var(--color-text-primary)]">{meta.description}</p>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">Input fields</div>
          <div className="flex flex-wrap gap-1">
            {meta.inputFields.map(f => (
              <span key={f} className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={CHIP_STYLE}>{f}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)]">Delay</span>
          <span className="text-[11px] font-mono" style={{ color: MCP_COLOR }}>{meta.delay} ms</span>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">Response</div>
          <p className="text-[10px] text-[var(--color-text-muted)] italic leading-relaxed">{meta.responsePreview}</p>
        </div>
      </div>
    </div>
  );
}

/** Editable card for a custom tool */
function CustomToolCard({
  tool,
  onSave,
  onCancel,
  onDelete,
}: {
  tool: McpMockTool;
  onSave: (t: McpMockTool) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<McpMockTool>({ ...tool });

  return (
    <div
      className="rounded-lg border overflow-hidden mt-2"
      style={{ borderColor: 'rgba(99,102,241,0.3)', backgroundColor: 'rgba(99,102,241,0.05)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgba(99,102,241,0.15)]">
        <input
          type="text"
          value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value.replace(/[^a-z0-9_]/g, '_') }))}
          placeholder="tool_name (snake_case)"
          className="flex-1 bg-transparent text-[12px] font-semibold font-mono focus:outline-none text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
        />
        <button
          type="button"
          onClick={onDelete}
          title="Delete tool"
          className="p-1 rounded cursor-pointer hover:bg-[rgba(239,68,68,0.12)] transition-colors"
        >
          <TrashIcon size={12} className="text-[var(--color-error)]" />
        </button>
      </div>

      {/* Fields */}
      <div className="px-3 py-2.5 flex flex-col gap-2.5">
        {/* Description */}
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">Description</div>
          <input
            type="text"
            value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            placeholder="What this tool does..."
            className="w-full h-[26px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-md px-2 text-[11px] focus:outline-none focus:border-[var(--color-protocol-mcp)] text-[var(--color-text-primary)]"
          />
        </div>

        {/* Delay */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)] flex-shrink-0">Delay</span>
          <input
            type="number"
            value={draft.delay}
            onChange={e => setDraft(d => ({ ...d, delay: Math.max(0, parseInt(e.target.value) || 0) }))}
            className="w-20 h-[24px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded px-2 text-[11px] focus:outline-none text-[var(--color-text-primary)]"
          />
          <span className="text-[9px] text-[var(--color-text-muted)]">ms</span>
        </div>

        {/* Input Schema */}
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">Input Schema (JSON Schema)</div>
          <textarea
            value={draft.inputSchema}
            onChange={e => setDraft(d => ({ ...d, inputSchema: e.target.value }))}
            rows={4}
            className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-[10px] font-mono focus:outline-none focus:border-[var(--color-protocol-mcp)] text-[var(--color-text-primary)] resize-y"
            placeholder={'{\n  "type": "object",\n  "properties": {}\n}'}
          />
        </div>

        {/* Response */}
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">Tool response (JSON)</div>
          <textarea
            value={draft.response}
            onChange={e => setDraft(d => ({ ...d, response: e.target.value }))}
            rows={4}
            className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1.5 text-[10px] font-mono focus:outline-none focus:border-[var(--color-protocol-mcp)] text-[var(--color-text-primary)] resize-y"
            placeholder="{ }"
          />
        </div>

        {/* Save / Cancel */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={!draft.name.trim()}
            className="px-3 py-1 text-[11px] rounded font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'rgba(99,102,241,0.18)', color: MCP_COLOR, border: '1px solid rgba(99,102,241,0.3)' }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 text-[11px] rounded cursor-pointer transition-colors opacity-60 hover:opacity-100"
            style={{ color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function McpMockConfig({ server, onUpdate }: Props) {
  const tools = server.mcpTools || [];

  const [expandedBuiltIn, setExpandedBuiltIn] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);

  const toggleBuiltIn = (name: string) => {
    setExpandedBuiltIn(prev => (prev === name ? null : name));
  };

  const handleSaveNew = useCallback((draft: McpMockTool) => {
    onUpdate({ mcpTools: [...tools, draft] });
    setAddingNew(false);
  }, [tools, onUpdate]);

  const handleSaveEdit = useCallback((updated: McpMockTool) => {
    onUpdate({ mcpTools: tools.map(t => t.id === updated.id ? updated : t) });
    setEditingId(null);
  }, [tools, onUpdate]);

  const handleDelete = useCallback((id: string) => {
    onUpdate({ mcpTools: tools.filter(t => t.id !== id) });
    setEditingId(null);
  }, [tools, onUpdate]);

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div
        className="rounded-lg px-3 py-2.5 flex gap-2 items-start text-[11px]"
        style={{ backgroundColor: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}
      >
        <div className="w-3 h-3 rounded-sm mt-0.5 flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--color-protocol-mcp)' }}>
          <span className="text-[7px] text-white font-bold">M</span>
        </div>
        <div className="text-[var(--color-text-muted)]">
          <span style={{ color: MCP_COLOR }} className="font-semibold">MCP HTTP server</span> at <code className="font-mono text-[10px]">POST /mcp</code>.
          Connect via Claude or Daakia MCP tab. Supports <code className="font-mono text-[10px]">tools/list</code> and <code className="font-mono text-[10px]">tools/call</code>.
          {tools.length === 0 && <span> Using <strong style={{ color: MCP_COLOR }}>15 built-in tools</strong>.</span>}
        </div>
      </div>

      {/* Endpoint info */}
      <div className="flex gap-4 text-[11px]">
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)]">Endpoint</span>
          <code className="font-mono text-[11px]" style={{ color: MCP_COLOR }}>POST /mcp</code>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)]">Protocol</span>
          <code className="font-mono text-[11px] text-[var(--color-text-primary)]">JSON-RPC 2.0</code>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)]">MCP Version</span>
          <code className="font-mono text-[11px] text-[var(--color-text-primary)]">2024-11-05</code>
        </div>
      </div>

      {/* ── Built-in tools (always visible) ── */}
      <div className="flex flex-col gap-2">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Built-in Tools (active)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {BUILT_IN_TOOL_META.map(meta => (
            <button
              key={meta.name}
              type="button"
              onClick={() => toggleBuiltIn(meta.name)}
              className="text-[9px] px-2 py-0.5 rounded font-mono cursor-pointer transition-all"
              style={{
                ...CHIP_STYLE,
                opacity: expandedBuiltIn === meta.name ? 1 : 0.75,
                fontWeight: expandedBuiltIn === meta.name ? 600 : 400,
                boxShadow: expandedBuiltIn === meta.name ? '0 0 0 1px rgba(99,102,241,0.5)' : 'none',
              }}
            >
              {meta.name}
            </button>
          ))}
        </div>

        {/* Expanded built-in tool card */}
        {expandedBuiltIn && (() => {
          const meta = BUILT_IN_TOOL_META.find(m => m.name === expandedBuiltIn);
          return meta ? <BuiltInToolCard meta={meta} onClose={() => setExpandedBuiltIn(null)} /> : null;
        })()}
      </div>

      {/* ── Custom tools ── */}
      {(tools.length > 0 || addingNew) && (
        <div className="flex flex-col gap-2">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Custom Tools ({tools.length})
          </div>

          {/* Custom tool bubbles */}
          {tools.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tools.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setEditingId(prev => (prev === t.id ? null : t.id));
                    setAddingNew(false);
                  }}
                  className="text-[9px] px-2 py-0.5 rounded font-mono cursor-pointer transition-all"
                  style={{
                    ...CHIP_STYLE,
                    opacity: editingId === t.id ? 1 : 0.75,
                    fontWeight: editingId === t.id ? 600 : 400,
                    boxShadow: editingId === t.id ? '0 0 0 1px rgba(99,102,241,0.5)' : 'none',
                  }}
                >
                  {t.name || 'untitled_tool'}
                </button>
              ))}
            </div>
          )}

          {/* Edit card for existing tool */}
          {editingId && (() => {
            const t = tools.find(tc => tc.id === editingId);
            return t ? (
              <CustomToolCard
                tool={t}
                onSave={handleSaveEdit}
                onCancel={() => setEditingId(null)}
                onDelete={() => handleDelete(t.id)}
              />
            ) : null;
          })()}

          {/* New tool draft card */}
          {addingNew && (
            <CustomToolCard
              tool={{ ...createDefaultMcpTool(), id: `new-${Date.now()}` }}
              onSave={handleSaveNew}
              onCancel={() => setAddingNew(false)}
              onDelete={() => setAddingNew(false)}
            />
          )}
        </div>
      )}

      {/* Add button row */}
      {!addingNew && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => { setAddingNew(true); setEditingId(null); }}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md cursor-pointer transition-colors self-start border"
            style={{ color: MCP_COLOR, borderColor: `color-mix(in srgb, ${MCP_COLOR} 30%, transparent)`, background: 'transparent' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = `color-mix(in srgb, ${MCP_COLOR} 10%, transparent)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <PlusIcon size={12} />
            Add Custom Tool
          </button>
          {tools.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDeleteAll(true)}
              title="Delete All Custom Tools"
              className="h-[28px] w-[28px] flex items-center justify-center rounded-md cursor-pointer transition-colors border border-[rgba(239,68,68,0.3)] text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)]"
            >
              <TrashIcon size={12} />
            </button>
          )}
        </div>
      )}

      {showDeleteAll && (
        <ConfirmDialog
          title="Delete All Custom Tools"
          message={`Are you sure you want to delete all ${tools.length} custom MCP tools? This cannot be undone.`}
          confirmLabel="Delete All"
          danger
          onConfirm={() => {
            onUpdate({ mcpTools: [] });
            setShowDeleteAll(false);
          }}
          onCancel={() => setShowDeleteAll(false)}
        />
      )}
    </div>
  );
}
