/**
 * TemplateEditorPanel — Handlebars response templating with live preview (6A.7-6A.9).
 * Toggle template mode on a route, with Monaco editor and live rendered preview.
 */
import { useState, useCallback } from 'react';
import { CodeEditor, ResizablePanel } from '../../shared';
import { SparkleIcon, ChevronDownIcon } from '../../../icons';
import type { MockRoute } from '../mock-types';

const MOCK_ACCENT = 'var(--color-mock-server)';

interface Props {
  route: MockRoute;
  onUpdate: (patch: Partial<MockRoute>) => void;
}

// Minimal client-side template renderer for live preview (6A.9)
function renderPreview(template: string, sampleRequest: SampleRequest): string {
  try {
    let out = template;

    // Replace {{request.*}} variables
    out = out.replace(/\{\{request\.url\}\}/g, sampleRequest.url);
    out = out.replace(/\{\{request\.path\}\}/g, sampleRequest.path);
    out = out.replace(/\{\{request\.method\}\}/g, sampleRequest.method);
    out = out.replace(/\{\{request\.query\.(\w+)\}\}/g, (_, k) => sampleRequest.queryParams[k] ?? '');
    out = out.replace(/\{\{request\.headers\.([\w-]+)\}\}/g, (_, k) => sampleRequest.headers[k] ?? sampleRequest.headers[k.toLowerCase()] ?? '');
    out = out.replace(/\{\{request\.body\.(\w+)\}\}/g, (_, k) => {
      try { return (JSON.parse(sampleRequest.body) as Record<string, unknown>)[k] as string ?? ''; } catch { return ''; }
    });

    // Random values
    out = out.replace(/\{\{randomValue\s+type='UUID'\}\}/g, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    out = out.replace(/\{\{randomValue[^}]*\}\}/g, 'random_value_xyz');
    out = out.replace(/\{\{now[^}]*\}\}/g, new Date().toISOString());

    // Faker
    out = out.replace(/\{\{faker\.name\.firstName\}\}/g, 'Alice');
    out = out.replace(/\{\{faker\.name\.lastName\}\}/g, 'Johnson');
    out = out.replace(/\{\{faker\.name\.fullName\}\}/g, 'Alice Johnson');
    out = out.replace(/\{\{faker\.internet\.email\}\}/g, 'alice.johnson@example.com');
    out = out.replace(/\{\{faker\.address\.city\}\}/g, 'New York');

    // Encoding
    out = out.replace(/\{\{base64\s+([^}]+)\}\}/g, (_, v) => btoa(v.replace(/['"]/g, '')));
    out = out.replace(/\{\{md5\s+([^}]+)\}\}/g, '5f4dcc3b5aa765d61d8327deb882cf99');

    // Math
    out = out.replace(/\{\{add\s+(\d+)\s+(\d+)\}\}/g, (_, a, b) => String(parseInt(a) + parseInt(b)));
    out = out.replace(/\{\{subtract\s+(\d+)\s+(\d+)\}\}/g, (_, a, b) => String(parseInt(a) - parseInt(b)));

    // String helpers
    out = out.replace(/\{\{upper\s+([^}]+)\}\}/g, (_, v) => v.replace(/['"]/g, '').toUpperCase());
    out = out.replace(/\{\{lower\s+([^}]+)\}\}/g, (_, v) => v.replace(/['"]/g, '').toLowerCase());

    // Unresolved — leave as-is or show placeholder
    out = out.replace(/\{\{[^}]+\}\}/g, match => `<span style="color:rgba(234,179,8,0.8)">${match}</span>`);

    return out;
  } catch {
    return template;
  }
}

interface SampleRequest {
  url: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body: string;
}

const DEFAULT_SAMPLE: SampleRequest = {
  url: '/api/users/123?page=1',
  path: '/api/users/123',
  method: 'POST',
  headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9...', 'Content-Type': 'application/json' },
  queryParams: { page: '1', limit: '20' },
  body: '{"name":"John Doe","email":"john@example.com","role":"admin"}',
};

// Built-in helper reference
const HELPER_CATALOG = [
  { category: 'Request', items: ['{{request.url}}', '{{request.path}}', '{{request.method}}', '{{request.headers.Authorization}}', '{{request.query.page}}', '{{request.body.email}}'] },
  { category: 'Random', items: ["{{randomValue type='UUID'}}", "{{randomValue type='ALPHANUMERIC'}}", '{{randomInt 1 100}}', '{{randomDecimal 0.0 1.0}}'] },
  { category: 'Date/Time', items: ['{{now}}', "{{now format='epoch'}}", "{{now offset='-3600'}}"] },
  { category: 'Faker', items: ['{{faker.name.firstName}}', '{{faker.name.fullName}}', '{{faker.internet.email}}', '{{faker.address.city}}', '{{faker.company.name}}', '{{faker.datatype.uuid}}'] },
  { category: 'String', items: ['{{upper value}}', '{{lower value}}', '{{trim value}}', '{{capitalize value}}'] },
  { category: 'Math', items: ['{{add x y}}', '{{subtract x y}}', '{{multiply x y}}', '{{divide x y}}'] },
  { category: 'Encoding', items: ["{{base64 value}}", "{{base64 value decode='true'}}", '{{md5 value}}', '{{sha256 value}}', '{{urlEncode value}}'] },
  { category: 'JSON', items: ["{{jsonPath request.body '$.email'}}", '{{toJson value}}', '{{formatJson value}}'] },
  { category: 'Control', items: ['{{#if condition}}...{{/if}}', '{{#each array}}...{{/each}}', "{{#range 1 5}}{{this}}{{/range}}"] },
];

export function TemplateEditorPanel({ route, onUpdate }: Props) {
  const [showPreview, setShowPreview] = useState(false);
  const [showHelpers, setShowHelpers] = useState(false);
  const [sampleJson, setSampleJson] = useState(JSON.stringify(DEFAULT_SAMPLE, null, 2));
  const [previewError, setPreviewError] = useState('');

  const parsedSample = useCallback((): SampleRequest => {
    try { return JSON.parse(sampleJson) as SampleRequest; }
    catch { return DEFAULT_SAMPLE; }
  }, [sampleJson]);

  const preview = route.isTemplate && showPreview
    ? renderPreview(route.body, parsedSample())
    : '';

  const insertHelper = (snippet: string) => {
    onUpdate({ body: route.body + snippet });
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Template toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onUpdate({ isTemplate: !route.isTemplate })}
            className="relative w-[32px] h-[16px] rounded-full transition-colors flex-shrink-0 cursor-pointer"
            style={{ backgroundColor: route.isTemplate ? MOCK_ACCENT : 'var(--color-muted-fallback)' }}
          >
            <span className="absolute top-[2px] w-[12px] h-[12px] rounded-full bg-white transition-all" style={{ left: route.isTemplate ? '18px' : '2px' }} />
          </button>
          <span className="text-[11px] font-medium text-[var(--color-text-muted)]">
            {route.isTemplate ? 'Template mode ON' : 'Template mode OFF'}
          </span>
          {route.isTemplate && <SparkleIcon size={11} style={{ color: MOCK_ACCENT }} />}
        </div>
        {route.isTemplate && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowHelpers(v => !v)}
              className="h-[22px] px-2 text-[10px] rounded cursor-pointer transition-colors"
              style={{ color: MOCK_ACCENT, background: showHelpers ? `color-mix(in srgb, ${MOCK_ACCENT} 15%, transparent)` : 'transparent', border: `1px solid color-mix(in srgb, ${MOCK_ACCENT} 25%, transparent)` }}
            >
              Helpers
            </button>
            <button
              type="button"
              onClick={() => setShowPreview(v => !v)}
              className="h-[22px] px-2 text-[10px] rounded cursor-pointer transition-colors"
              style={{ color: 'var(--color-info)', background: showPreview ? 'rgba(14,165,233,0.1)' : 'transparent', border: '1px solid rgba(14,165,233,0.2)' }}
            >
              {showPreview ? 'Hide Preview' : 'Live Preview'}
            </button>
          </div>
        )}
      </div>

      {/* Helper catalog (6A.8) */}
      {route.isTemplate && showHelpers && (
        <div className="rounded-lg border border-[rgba(255,255,255,0.08)] overflow-hidden">
          <div className="px-3 py-2 bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.07)]">
            <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">Helper Catalog — click to insert</span>
          </div>
          <div className="p-2 grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
            {HELPER_CATALOG.map(cat => (
              <div key={cat.category}>
                <p className="text-[9px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide mb-1 px-1">{cat.category}</p>
                {cat.items.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => insertHelper(item)}
                    title={`Insert ${item}`}
                    className="w-full text-left px-1.5 py-0.5 text-[10px] font-mono rounded hover:bg-[rgba(255,255,255,0.06)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors truncate"
                  >
                    {item}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live preview (6A.9) */}
      {route.isTemplate && showPreview && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            {/* Template side */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">Template</span>
              <ResizablePanel id={`tpl.${route.id}.body`} defaultHeight={140} minHeight={80} maxHeight={400}>
                <CodeEditor value={route.body} onChange={v => onUpdate({ body: v })} language="json" height="100%" />
              </ResizablePanel>
            </div>
            {/* Preview side */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">Preview</span>
              <div
                className="flex-1 min-h-[140px] px-2.5 py-2 rounded-md text-[11px] font-mono overflow-auto"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            </div>
          </div>
          {/* Sample request input */}
          <div>
            <button
              type="button"
              onClick={() => setShowHelpers(v => !v)}
              className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer mb-1"
            >
              <ChevronDownIcon size={10} /> Sample Request (for preview)
            </button>
            <textarea
              value={sampleJson}
              onChange={e => { setSampleJson(e.target.value); setPreviewError(''); }}
              rows={4}
              className="w-full px-2.5 py-2 text-[10px] font-mono rounded-md bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] text-[var(--color-text-muted)] focus:outline-none resize-none"
              spellCheck={false}
            />
            {previewError && <p className="text-[10px] text-[var(--color-error)]">{previewError}</p>}
          </div>
        </div>
      )}

      {/* Hint when template mode is off */}
      {!route.isTemplate && (
        <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
          Enable template mode to use {`{{request.body.email}}`}, {`{{faker.name.firstName}}`}, {`{{randomValue type='UUID'}}`} and 50+ helpers in your response body.
        </p>
      )}
    </div>
  );
}
