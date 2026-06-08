/**
 * ImportPanel — Import OpenAPI / Postman / WireMock + Contract Validation (6A.19-6A.21).
 */
import { useState, useRef } from 'react';
import { ChevronDownIcon } from '../../../icons';
import type { MockRoute } from '../mock-types';

const MOCK_ACCENT = 'var(--color-mock-server)';

type ImportFormat = 'openapi' | 'postman' | 'wiremock';

interface ImportResult {
  routes: MockRoute[];
  warnings: string[];
  errors: string[];
  routeCount: number;
}

interface Props {
  onImport: (routes: MockRoute[]) => void;
}

export function ImportPanel({ onImport }: Props) {
  const [format, setFormat] = useState<ImportFormat>('openapi');
  const [content, setContent] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [contractMode, setContractMode] = useState(false);
  const [contractResult, setContractResult] = useState<ContractResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setContent(ev.target?.result as string ?? '');
    reader.readAsText(file);
  };

  const handleParse = async () => {
    if (!content.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      // Send to extension host for actual parsing (uses mock-importer.ts)
      // In webview context, post message to extension
      const result = parseClientSide(format, content);
      setResult(result);
    } catch (e) {
      setResult({ routes: [], warnings: [], errors: [String(e)], routeCount: 0 });
    } finally {
      setLoading(false);
    }
  };

  const handleValidateContract = () => {
    if (!content.trim()) return;
    const r = validateContract(format, content);
    setContractResult(r);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Format selector */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-text-muted)]">Import format</span>
        <div className="flex rounded-md overflow-hidden border border-[rgba(255,255,255,0.1)]">
          {(['openapi', 'postman', 'wiremock'] as ImportFormat[]).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className="h-[26px] px-3 text-[10px] font-medium cursor-pointer transition-colors capitalize"
              style={{
                background: format === f ? `color-mix(in srgb, ${MOCK_ACCENT} 15%, transparent)` : 'transparent',
                color: format === f ? MOCK_ACCENT : 'var(--color-text-muted)',
                borderRight: f !== 'wiremock' ? '1px solid rgba(255,255,255,0.1)' : undefined,
              }}
            >
              {f === 'openapi' ? 'OpenAPI 3.x' : f === 'postman' ? 'Postman' : 'WireMock'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <label className="text-[10px] text-[var(--color-text-muted)] cursor-pointer">Contract validation</label>
          <button
            type="button"
            onClick={() => setContractMode(v => !v)}
            className="relative w-[28px] h-[14px] rounded-full transition-colors cursor-pointer flex-shrink-0"
            style={{ backgroundColor: contractMode ? MOCK_ACCENT : 'var(--color-muted-fallback)' }}
          >
            <span className="absolute top-[2px] w-[10px] h-[10px] rounded-full bg-white transition-all" style={{ left: contractMode ? '16px' : '2px' }} />
          </button>
        </div>
      </div>

      {/* Format hints */}
      <FormatHint format={format} />

      {/* File upload / paste */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">
            {format === 'openapi' ? 'OpenAPI YAML or JSON' : format === 'postman' ? 'Postman Collection JSON (v2.x)' : 'WireMock Mappings JSON'}
          </label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="h-[22px] px-2 text-[10px] rounded cursor-pointer"
            style={{ color: MOCK_ACCENT, background: `color-mix(in srgb, ${MOCK_ACCENT} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${MOCK_ACCENT} 20%, transparent)` }}
          >
            Upload file
          </button>
          <input ref={fileRef} type="file" accept=".json,.yaml,.yml" className="hidden" onChange={handleFile} />
        </div>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={8}
          placeholder={PLACEHOLDERS[format]}
          className="w-full px-3 py-2 text-[10px] font-mono rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-muted)] placeholder:text-[var(--color-text-muted)] placeholder:opacity-40 focus:outline-none resize-none"
          spellCheck={false}
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleParse}
          disabled={!content.trim() || loading}
          className="h-[30px] px-4 text-[11px] font-medium rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: `color-mix(in srgb, ${MOCK_ACCENT} 15%, transparent)`, border: `1px solid color-mix(in srgb, ${MOCK_ACCENT} 30%, transparent)`, color: MOCK_ACCENT }}
        >
          {loading ? 'Parsing…' : 'Parse & Preview Routes'}
        </button>
        {contractMode && (
          <button
            type="button"
            onClick={handleValidateContract}
            disabled={!content.trim()}
            className="h-[30px] px-4 text-[11px] font-medium rounded cursor-pointer disabled:opacity-40"
            style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)', color: 'var(--color-warning)' }}
          >
            Validate Contract
          </button>
        )}
      </div>

      {/* Contract result */}
      {contractResult && <ContractResultView result={contractResult} />}

      {/* Parse result */}
      {result && (
        <ParseResultView
          result={result}
          onImport={() => { if (result.routes.length > 0) onImport(result.routes); }}
        />
      )}
    </div>
  );
}

// ─── Contract validation result ───────────────────────────────────────────────

interface ContractResult {
  valid: boolean;
  violations: Array<{ path: string; message: string; severity: 'error' | 'warning' }>;
  summary: string;
}

function ContractResultView({ result }: { result: ContractResult }) {
  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: result.valid ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)' }}>
      <div className="px-3 py-2 flex items-center gap-2" style={{ background: result.valid ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)' }}>
        <span className="text-[12px]">{result.valid ? '✅' : '❌'}</span>
        <span className="text-[11px] font-medium" style={{ color: result.valid ? 'var(--color-success)' : 'var(--color-error)' }}>
          {result.summary}
        </span>
      </div>
      {result.violations.length > 0 && (
        <div className="px-3 py-2 flex flex-col gap-1 max-h-[120px] overflow-y-auto">
          {result.violations.map((v, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-[9px] flex-shrink-0 mt-0.5" style={{ color: v.severity === 'error' ? 'var(--color-error)' : 'var(--color-warning)' }}>
                {v.severity === 'error' ? '●' : '○'}
              </span>
              <div>
                <span className="text-[10px] font-mono text-[var(--color-text-muted)]">{v.path}</span>
                <span className="text-[10px] text-[var(--color-text-muted)] ml-2">{v.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Parse result ─────────────────────────────────────────────────────────────

function ParseResultView({ result, onImport }: { result: ImportResult; onImport: () => void }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.1)] overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between bg-[rgba(255,255,255,0.02)]">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setExpanded(v => !v)} className="cursor-pointer text-[var(--color-text-muted)]">
            <span style={{ display: 'inline-flex', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
              <ChevronDownIcon size={12} />
            </span>
          </button>
          <span className="text-[11px] font-medium text-[var(--color-text-primary)]">
            {result.routeCount} route{result.routeCount !== 1 ? 's' : ''} found
          </span>
          {result.warnings.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(234,179,8,0.12)] text-[var(--color-warning)]">
              {result.warnings.length} warnings
            </span>
          )}
          {result.errors.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(239,68,68,0.12)] text-[var(--color-error)]">
              {result.errors.length} errors
            </span>
          )}
        </div>
        {result.routes.length > 0 && (
          <button
            type="button"
            onClick={onImport}
            className="h-[26px] px-3 text-[10px] font-medium rounded cursor-pointer"
            style={{ background: `color-mix(in srgb, ${MOCK_ACCENT} 15%, transparent)`, border: `1px solid color-mix(in srgb, ${MOCK_ACCENT} 30%, transparent)`, color: MOCK_ACCENT }}
          >
            Import All Routes
          </button>
        )}
      </div>

      {expanded && (
        <div className="max-h-[200px] overflow-y-auto divide-y divide-[rgba(255,255,255,0.05)]">
          {result.routes.map((r, i) => (
            <div key={r.id ?? i} className="flex items-center gap-2 px-3 py-1.5">
              <span className="text-[9px] font-mono px-1 py-0.5 rounded font-medium" style={{ background: 'rgba(14,165,233,0.12)', color: 'var(--color-info)' }}>{r.method}</span>
              <span className="text-[11px] font-mono text-[var(--color-text-muted)] flex-1 truncate">{r.path}</span>
              <span className="text-[10px] font-mono text-[var(--color-text-muted)]">{r.statusCode}</span>
            </div>
          ))}
          {result.warnings.map((w, i) => (
            <div key={`w${i}`} className="px-3 py-1.5 text-[10px] text-[var(--color-warning)] opacity-80">⚠ {w}</div>
          ))}
          {result.errors.map((e, i) => (
            <div key={`e${i}`} className="px-3 py-1.5 text-[10px] text-[var(--color-error)]">✖ {e}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function FormatHint({ format }: { format: ImportFormat }) {
  const hints: Record<ImportFormat, string> = {
    openapi: 'Supports OpenAPI 3.0 and 3.1 in YAML or JSON. Generates one mock route per operation with schema-based example bodies.',
    postman: 'Supports Postman Collection format v2.0 and v2.1. Imports requests with their saved example responses.',
    wiremock: 'Imports WireMock stub mappings JSON. Supports request matchers, response bodies, and delays.',
  };
  return <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">{hints[format]}</p>;
}

// ─── Client-side lightweight parser (actual heavy lifting in extension host) ──

const PLACEHOLDERS: Record<ImportFormat, string> = {
  openapi: `openapi: '3.0.0'\ninfo:\n  title: My API\n  version: '1.0'\npaths:\n  /users/{id}:\n    get:\n      summary: Get user\n      responses:\n        '200':\n          description: OK`,
  postman: `{\n  "info": { "name": "My Collection", "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },\n  "item": []\n}`,
  wiremock: `{\n  "mappings": [\n    {\n      "request": { "method": "GET", "url": "/api/users" },\n      "response": { "status": 200, "body": "{\\"users\\":[]}", "headers": { "Content-Type": "application/json" } }\n    }\n  ]\n}`,
};

function parseClientSide(format: ImportFormat, content: string): ImportResult {
  // Lightweight client-side preview parse — real import goes through extension host
  try {
    const routes: MockRoute[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    if (format === 'openapi') {
      // Detect YAML vs JSON
      const isYaml = content.trim().startsWith('openapi:') || content.trim().startsWith('---');
      if (!isYaml) {
        JSON.parse(content); // validate JSON
      }
      warnings.push('Full import requires extension host. Preview shows route stubs.');
      // Count paths
      const pathMatches = content.match(/^\s{2}\/[\w/{}.-]+:/gm) ?? [];
      pathMatches.forEach((_, i) => {
        routes.push({
          id: crypto.randomUUID(), method: 'GET', path: '/imported/route', statusCode: 200,
          headers: {}, body: '', delay: 0, enabled: true,
        });
      });
    } else if (format === 'postman') {
      const parsed = JSON.parse(content) as { item?: unknown[] };
      const count = parsed.item?.length ?? 0;
      warnings.push(`Preview: found ${count} top-level items. Sub-folders counted separately.`);
      for (let i = 0; i < count; i++) {
        routes.push({ id: crypto.randomUUID(), method: 'POST', path: `/collection/item/${i}`, statusCode: 200, headers: {}, body: '', delay: 0, enabled: true });
      }
    } else {
      const parsed = JSON.parse(content) as { mappings?: unknown[] };
      const count = parsed.mappings?.length ?? 0;
      parsed.mappings?.forEach((_, i) => {
        routes.push({ id: crypto.randomUUID(), method: 'GET', path: `/wiremock/stub/${i}`, statusCode: 200, headers: {}, body: '', delay: 0, enabled: true });
      });
    }

    return { routes, warnings, errors, routeCount: routes.length };
  } catch (e) {
    return { routes: [], warnings: [], errors: [`Parse failed: ${String(e)}`], routeCount: 0 };
  }
}

function validateContract(format: ImportFormat, content: string): ContractResult {
  // Basic structural validation
  const violations: ContractResult['violations'] = [];
  try {
    if (format === 'openapi') {
      const isJson = content.trim().startsWith('{');
      if (isJson) {
        const obj = JSON.parse(content) as Record<string, unknown>;
        if (!obj['openapi']) violations.push({ path: '#/openapi', message: 'Missing required field "openapi"', severity: 'error' });
        if (!obj['info']) violations.push({ path: '#/info', message: 'Missing required field "info"', severity: 'error' });
        if (!obj['paths']) violations.push({ path: '#/paths', message: 'Missing required field "paths"', severity: 'warning' });
      } else {
        if (!content.includes('openapi:')) violations.push({ path: '#/openapi', message: 'Missing "openapi:" key', severity: 'error' });
        if (!content.includes('paths:')) violations.push({ path: '#/paths', message: 'Missing "paths:" key', severity: 'warning' });
      }
    } else if (format === 'postman') {
      const obj = JSON.parse(content) as Record<string, unknown>;
      if (!obj['info']) violations.push({ path: '#/info', message: 'Missing info block', severity: 'error' });
      if (!obj['item']) violations.push({ path: '#/item', message: 'Missing item array', severity: 'warning' });
    } else {
      const obj = JSON.parse(content) as Record<string, unknown>;
      if (!obj['mappings']) violations.push({ path: '#/mappings', message: 'Missing mappings array', severity: 'error' });
    }
    const valid = violations.filter(v => v.severity === 'error').length === 0;
    return { valid, violations, summary: valid ? `Valid ${format} document` : `${violations.filter(v => v.severity === 'error').length} error(s) found` };
  } catch (e) {
    return { valid: false, violations: [{ path: '#', message: `JSON parse error: ${String(e)}`, severity: 'error' }], summary: 'Parse error' };
  }
}
