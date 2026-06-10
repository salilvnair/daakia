/**
 * AiMockConfig — UI for managing AI mock server scenarios.
 *
 * Layout:
 *   • Built-in scenarios — always-visible bubble chips; click to expand a read-only detail card.
 *   • Custom scenarios  — bubble chips below built-ins; click to edit; trash to delete.
 *   • "Add Custom Scenario" — opens a new draft card; Save/Cancel to commit.
 */
import { useState, useCallback } from 'react';
import type { MockServer, AiMockScenario } from '../mock-types';
import { createDefaultAiScenario } from '../mock-types';
import { PlusIcon, TrashIcon, SparkleIcon, CloseIcon } from '../../../icons';
import { ConfirmDialog } from '../../shared';
import { AiMockIntelligenceModal } from '../../ai/AiMockIntelligenceModal';
import { AiAdaptiveMockLearningModal } from '../../ai/AiAdaptiveMockLearningModal';
import { AiScenarioGeneratorModal } from '../../ai/AiScenarioGeneratorModal';
import { useAiFeaturesStore } from '../../../store/ai-features-store';

interface Props {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
}

const AI_COLOR = 'var(--color-protocol-ai)';
const CHIP_STYLE = { backgroundColor: 'rgba(168,85,247,0.25)', color: '#d8b4fe', border: '1px solid rgba(168,85,247,0.55)' };

// ─── Compact built-in scenario metadata (display only) ───────────────────────
// Full responses are served by the extension host's mock-ai-server.ts.
// We show name + keywords + delay + a short preview of the response format.

interface BuiltInMeta {
  name: string;
  keywords: string[];
  delay: number;
  responsePreview: string;
}

const BUILT_IN_META: BuiltInMeta[] = [
  { name: 'Generate JSON Schema',       keywords: ['json schema', 'schema', 'generate schema', 'validate json', 'schema for'], delay: 400, responsePreview: 'Returns a complete JSON Schema (draft-07) with required fields, types, format validators, and additionalProperties rules.' },
  { name: 'Explain API Response',       keywords: ['explain', 'what does', 'what is this', 'explain response', 'explain this'], delay: 350, responsePreview: 'Breaks down the API response field-by-field — status meaning, pagination patterns, key fields, and tips.' },
  { name: 'Suggest HTTP Headers',       keywords: ['headers', 'suggest header', 'which header', 'http header', 'request header'], delay: 300, responsePreview: 'Returns a recommended headers table (Content-Type, Authorization, X-Request-ID, etc.) with security headers.' },
  { name: 'Generate Test Case',         keywords: ['test case', 'test this', 'write test', 'generate test', 'unit test', 'api test'], delay: 500, responsePreview: 'Generates a Jest test suite with happy path, 401, 404, and validation failure cases.' },
  { name: 'Generate Request Body',      keywords: ['request body', 'sample body', 'example body', 'body payload', 'generate body', 'sample payload'], delay: 350, responsePreview: 'Returns a realistic JSON request payload with nested objects and example values.' },
  { name: 'Troubleshoot Authentication', keywords: ['auth', 'authentication', 'bearer token', '401', 'unauthorized', 'jwt', 'oauth', 'api key'], delay: 400, responsePreview: 'Step-by-step auth debugging guide: token format, expiry, scopes, refresh, API key placement.' },
  { name: 'Analyze Error Response',     keywords: ['error', '400', '422', '500', '503', 'bad request', 'failed', 'status code'], delay: 300, responsePreview: 'Parses the error response, explains each validation failure, and provides an HTTP status codes cheat sheet.' },
  { name: 'Generate cURL Command',      keywords: ['curl', 'command', 'cli', 'terminal', 'bash command', 'cURL'], delay: 250, responsePreview: 'Returns a cURL command with all headers, body, and useful flags (verbose, timeout, jq piping).' },
  { name: 'GraphQL Query Help',         keywords: ['graphql', 'gql', 'query', 'mutation', 'subscription', 'fragment'], delay: 450, responsePreview: 'Shows a complete paginated GraphQL query with variables, a mutation example, and cursor pagination.' },
  { name: 'Document API Endpoint',      keywords: ['document', 'documentation', 'openapi', 'swagger', 'api doc', 'describe endpoint'], delay: 500, responsePreview: 'OpenAPI-style endpoint doc with request body schema, response table, rate limits, and 201 response example.' },
  { name: 'Data Transformation',        keywords: ['transform', 'convert', 'map data', 'parse', 'format data', 'extract field'], delay: 350, responsePreview: 'JavaScript transform function with snake_case → camelCase conversion, date formatting, and bulk mapping.' },
  { name: 'Environment Variables Setup', keywords: ['environment', 'env var', 'variable', 'config', 'secret', 'env file', '.env'], delay: 400, responsePreview: 'A .env file template with API config, auth secrets, feature flags, and Daakia usage instructions.' },
  { name: 'Create Mock Response',       keywords: ['mock', 'mock response', 'fake data', 'sample response', 'dummy data', 'placeholder'], delay: 300, responsePreview: 'Realistic mock JSON response with nested settings, stats, and meta (requestId, timestamp, version).' },
  { name: 'Performance & Optimization', keywords: ['performance', 'slow', 'optimize', 'cache', 'rate limit', 'timeout', 'latency'], delay: 450, responsePreview: 'Caching with ETags, field selection, parallel requests, and exponential backoff retry code.' },
  { name: 'General AI Assistant',       keywords: [], delay: 200, responsePreview: 'Fallback — matches any message. Lists all available built-in scenarios and usage tips.' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function KeywordChips({ keywords, onRemove }: { keywords: string[]; onRemove?: (kw: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {keywords.length === 0 && (
        <span className="text-[10px] italic text-[var(--color-text-muted)]">None — fallback (matches any message)</span>
      )}
      {keywords.map(kw => (
        <span
          key={kw}
          className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded font-mono"
          style={CHIP_STYLE}
        >
          {kw}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(kw)}
              className="ml-0.5 opacity-60 hover:opacity-100 cursor-pointer leading-none"
            >
              ×
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

/** Read-only card for a built-in scenario */
function BuiltInCard({ meta, onClose }: { meta: BuiltInMeta; onClose: () => void }) {
  return (
    <div
      className="rounded-lg border overflow-hidden mt-2"
      style={{ borderColor: 'rgba(168,85,247,0.25)', backgroundColor: 'rgba(168,85,247,0.04)' }}
    >
      {/* Card header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgba(168,85,247,0.15)]">
        <SparkleIcon size={11} style={{ color: AI_COLOR }} />
        <span className="text-[11px] font-semibold flex-1" style={{ color: AI_COLOR }}>{meta.name}</span>
        <span className="text-[9px] text-[var(--color-text-muted)] mr-2">Built-in · read-only</span>
        <button type="button" onClick={onClose} className="opacity-50 hover:opacity-100 cursor-pointer transition-opacity">
          <CloseIcon size={11} />
        </button>
      </div>
      {/* Fields */}
      <div className="px-3 py-2.5 flex flex-col gap-2.5">
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">Match keywords</div>
          <KeywordChips keywords={meta.keywords} />
        </div>
        <div className="flex items-center gap-3">
          <div>
            <span className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)]">Delay</span>
            <span className="ml-2 text-[11px] font-mono" style={{ color: AI_COLOR }}>{meta.delay} ms</span>
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">Response</div>
          <p className="text-[10px] text-[var(--color-text-muted)] italic leading-relaxed">{meta.responsePreview}</p>
        </div>
      </div>
    </div>
  );
}

/** Editable card for a custom scenario (both new drafts and editing existing) */
function CustomScenarioCard({
  scenario,
  onSave,
  onCancel,
  onDelete,
}: {
  scenario: AiMockScenario;
  onSave: (s: AiMockScenario) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<AiMockScenario>({ ...scenario });
  const [kwInput, setKwInput] = useState('');

  const addKeyword = () => {
    const trimmed = kwInput.trim().toLowerCase();
    if (!trimmed || draft.keywords.includes(trimmed)) return;
    setDraft(d => ({ ...d, keywords: [trimmed, ...d.keywords] }));
    setKwInput('');
  };

  const removeKeyword = (kw: string) => {
    setDraft(d => ({ ...d, keywords: d.keywords.filter(k => k !== kw) }));
  };

  return (
    <div
      className="rounded-lg border overflow-hidden mt-2"
      style={{ borderColor: 'rgba(168,85,247,0.3)', backgroundColor: 'rgba(168,85,247,0.05)' }}
    >
      {/* Card header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgba(168,85,247,0.15)]">
        <input
          type="text"
          value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          placeholder="Scenario name"
          className="flex-1 bg-transparent text-[12px] h-[26px] font-semibold focus:outline-none text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
        />
        <button
          type="button"
          onClick={onDelete}
          title="Delete scenario"
          className="p-1 rounded cursor-pointer hover:bg-[rgba(239,68,68,0.12)] transition-colors"
        >
          <TrashIcon size={12} className="text-[var(--color-error)]" />
        </button>
      </div>

      {/* Fields */}
      <div className="px-3 py-2.5 flex flex-col gap-2.5">
        {/* Keywords */}
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
            Match keywords <span className="normal-case">(user message must contain one · leave empty = fallback)</span>
          </div>
          <KeywordChips keywords={draft.keywords} onRemove={removeKeyword} />
          {/* Keyword input — full width, below chips */}
          <input
            type="text"
            value={kwInput}
            onChange={e => setKwInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
            placeholder="Type keyword and press Enter to add..."
            className="mt-1.5 w-full h-[26px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded px-2 text-[10px] focus:outline-none focus:border-[var(--color-protocol-ai)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
          />
        </div>

        {/* Delay */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)] flex-shrink-0">Delay</span>
          <input
            type="number"
            value={draft.delay}
            onChange={e => setDraft(d => ({ ...d, delay: Math.max(0, parseInt(e.target.value) || 0) }))}
            className="w-20 h-[26px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded px-2 text-[11px] focus:outline-none text-[var(--color-text-primary)]"
          />
          <span className="text-[9px] text-[var(--color-text-muted)]">ms · simulates AI thinking time</span>
        </div>

        {/* Response */}
        <div>
          <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">Assistant response (Markdown supported)</div>
          <textarea
            value={draft.response}
            onChange={e => setDraft(d => ({ ...d, response: e.target.value }))}
            rows={5}
            className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded px-2 py-1.5 text-[11px] font-mono focus:outline-none focus:border-[var(--color-protocol-ai)] text-[var(--color-text-primary)] resize-y"
            placeholder="Enter the assistant's canned response..."
          />
        </div>

        {/* Save / Cancel */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={!draft.name.trim()}
            className="h-[26px] px-3 text-[11px] rounded font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'rgba(168,85,247,0.18)', color: AI_COLOR, border: '1px solid rgba(168,85,247,0.3)' }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-[26px] px-3 text-[11px] rounded cursor-pointer transition-colors opacity-60 hover:opacity-100"
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

export function AiMockConfig({ server, onUpdate }: Props) {
  const scenarios = server.aiScenarios || [];

  /** Which built-in scenario name is expanded (or null) */
  const [expandedBuiltIn, setExpandedBuiltIn] = useState<string | null>(null);
  /** Which custom scenario id is being edited (or null) */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Whether we're composing a brand-new custom scenario */
  const [addingNew, setAddingNew] = useState(false);
  /** Confirm delete-all custom scenarios */
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  /** The blank template for a new scenario */
  const [newDraft] = useState<AiMockScenario>(() => createDefaultAiScenario());
  const [showMockIntelligence, setShowMockIntelligence] = useState(false);
  const [showAdaptiveLearning, setShowAdaptiveLearning] = useState(false);
  const [showScenarioComposer, setShowScenarioComposer] = useState(false);
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);

  const toggleBuiltIn = (name: string) => {
    setExpandedBuiltIn(prev => (prev === name ? null : name));
  };

  const handleSaveNew = useCallback((draft: AiMockScenario) => {
    onUpdate({ aiScenarios: [...scenarios, draft] });
    setAddingNew(false);
  }, [scenarios, onUpdate]);

  const handleSaveEdit = useCallback((updated: AiMockScenario) => {
    onUpdate({ aiScenarios: scenarios.map(s => s.id === updated.id ? updated : s) });
    setEditingId(null);
  }, [scenarios, onUpdate]);

  const handleDelete = useCallback((id: string) => {
    onUpdate({ aiScenarios: scenarios.filter(s => s.id !== id) });
    setEditingId(null);
  }, [scenarios, onUpdate]);

  return (
    <div className="flex flex-col gap-3">
      {/* Header info */}
      <div
        className="rounded-lg px-3 py-2.5 flex gap-2 items-start text-[11px]"
        style={{ backgroundColor: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}
      >
        <SparkleIcon size={13} className="mt-0.5 flex-shrink-0" style={{ color: AI_COLOR }} />
        <div className="text-[var(--color-text-muted)] flex-1">
          <span style={{ color: AI_COLOR }} className="font-semibold">OpenAI-compatible</span> mock server.
          Set your provider&apos;s base URL to <code className="font-mono text-[10px]">http://localhost:{'{port}'}/v1</code>.
          {scenarios.length === 0 && (
            <span> Using <strong style={{ color: AI_COLOR }}>15 built-in scenarios</strong> — add custom ones below to override.</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {aiEnabled('mockIntelligence') && (
            <button type="button" onClick={() => setShowMockIntelligence(true)}
              className="flex items-center gap-1 h-[24px] px-2 rounded-lg text-[10px] font-medium cursor-pointer"
              style={{ color: AI_COLOR, backgroundColor: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)' }}
              title="AI Mock Intelligence — learn from real API responses"
            >
              <SparkleIcon size={9} />Intelligence ✦
            </button>
          )}
          {aiEnabled('adaptiveMockLearning') && (
            <button type="button" onClick={() => setShowAdaptiveLearning(true)}
              className="flex items-center gap-1 h-[24px] px-2 rounded-lg text-[10px] font-medium cursor-pointer"
              style={{ color: AI_COLOR, backgroundColor: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)' }}
              title="Adaptive Mock Learning — record real traffic, AI builds smart mock rules"
            >
              <SparkleIcon size={9} />AI Learn ✦
            </button>
          )}
          {aiEnabled('aiScenarioComposer') && (
            <button type="button" onClick={() => setShowScenarioComposer(true)}
              className="flex items-center gap-1 h-[24px] px-2 rounded-lg text-[10px] font-medium cursor-pointer"
              style={{ color: AI_COLOR, backgroundColor: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)' }}
              title="AI Scenario Composer — describe complex scenarios in plain English"
            >
              <SparkleIcon size={9} />Compose ✦
            </button>
          )}
        </div>
      </div>
      {showMockIntelligence && <AiMockIntelligenceModal onClose={() => setShowMockIntelligence(false)} />}
      {showAdaptiveLearning && <AiAdaptiveMockLearningModal onClose={() => setShowAdaptiveLearning(false)} />}
      {showScenarioComposer && <AiScenarioGeneratorModal onClose={() => setShowScenarioComposer(false)} />}

      {/* ── Built-in scenarios (always visible) ── */}
      <div className="flex flex-col gap-2">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Built-in Scenarios (active)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {BUILT_IN_META.map(meta => (
            <button
              key={meta.name}
              type="button"
              onClick={() => toggleBuiltIn(meta.name)}
              className="text-[9px] px-2 py-0.5 rounded font-mono cursor-pointer transition-all"
              style={{
                ...CHIP_STYLE,
                opacity: expandedBuiltIn === meta.name ? 1 : 0.75,
                fontWeight: expandedBuiltIn === meta.name ? 600 : 400,
                boxShadow: expandedBuiltIn === meta.name ? '0 0 0 1px rgba(168,85,247,0.5)' : 'none',
              }}
            >
              {meta.name}
            </button>
          ))}
        </div>

        {/* Expanded built-in card */}
        {expandedBuiltIn && (() => {
          const meta = BUILT_IN_META.find(m => m.name === expandedBuiltIn);
          return meta ? <BuiltInCard meta={meta} onClose={() => setExpandedBuiltIn(null)} /> : null;
        })()}
      </div>

      {/* ── Custom scenarios ── */}
      {(scenarios.length > 0 || addingNew) && (
        <div className="flex flex-col gap-2">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Custom Scenarios ({scenarios.length})
          </div>

          {/* Custom bubbles */}
          {scenarios.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {scenarios.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setEditingId(prev => (prev === s.id ? null : s.id));
                    setAddingNew(false);
                  }}
                  className="text-[9px] px-2 py-0.5 rounded font-mono cursor-pointer transition-all"
                  style={{
                    ...CHIP_STYLE,
                    opacity: editingId === s.id ? 1 : 0.75,
                    fontWeight: editingId === s.id ? 600 : 400,
                    boxShadow: editingId === s.id ? '0 0 0 1px rgba(168,85,247,0.5)' : 'none',
                  }}
                >
                  {s.name || 'Untitled'}
                </button>
              ))}
            </div>
          )}

          {/* Custom edit card */}
          {editingId && (() => {
            const s = scenarios.find(sc => sc.id === editingId);
            return s ? (
              <CustomScenarioCard
                scenario={s}
                onSave={handleSaveEdit}
                onCancel={() => setEditingId(null)}
                onDelete={() => handleDelete(s.id)}
              />
            ) : null;
          })()}

          {/* New scenario draft card */}
          {addingNew && (
            <CustomScenarioCard
              scenario={{ ...newDraft, id: `new-${Date.now()}` }}
              onSave={handleSaveNew}
              onCancel={() => setAddingNew(false)}
              onDelete={() => setAddingNew(false)}
            />
          )}
        </div>
      )}

      {/* ── Add custom scenario + Delete All row ── */}
      {!addingNew && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setAddingNew(true); setEditingId(null); }}
            className="flex items-center gap-1.5 h-[26px] px-3 text-[11px] rounded cursor-pointer transition-colors border"
            style={{ color: AI_COLOR, borderColor: `color-mix(in srgb, ${AI_COLOR} 30%, transparent)`, background: 'transparent' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = `color-mix(in srgb, ${AI_COLOR} 10%, transparent)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <PlusIcon size={12} />
            Add Custom Scenario
          </button>
          {scenarios.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDeleteAll(true)}
              title="Delete All Custom Scenarios"
              className="flex items-center gap-1 h-[26px] px-2.5 text-[10px] rounded cursor-pointer transition-colors border border-[rgba(239,68,68,0.3)] text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)]"
            >
              <TrashIcon size={11} />
              Delete All
            </button>
          )}
        </div>
      )}

      {showDeleteAll && (
        <ConfirmDialog
          title="Delete All Custom Scenarios"
          message={`Are you sure you want to delete all ${scenarios.length} custom scenarios? This cannot be undone.`}
          confirmLabel="Delete All"
          danger
          onConfirm={() => {
            onUpdate({ aiScenarios: [] });
            setShowDeleteAll(false);
            setEditingId(null);
          }}
          onCancel={() => setShowDeleteAll(false)}
        />
      )}
    </div>
  );
}
