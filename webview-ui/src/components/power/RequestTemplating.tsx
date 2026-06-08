/**
 * RequestTemplating — define templates with placeholders, generate multiple requests from CSV/JSON data.
 * Feature 6B.11 — Request templating
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, PlusIcon } from '../../icons';
import { useTabsStore } from '../../store/tabs-store';
import { useToastStore } from '../../store/toast-store';

interface Props {
  requestUrl?: string;
  requestMethod?: string;
  requestBody?: string;
  onClose: () => void;
}

type DataSourceMode = 'csv' | 'json' | 'manual';

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

function parseJSONData(text: string): Record<string, string>[] {
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data.map(item => Object.fromEntries(Object.entries(item).map(([k, v]) => [k, String(v)])));
    return [];
  } catch {
    return [];
  }
}

function applyTemplate(template: string, row: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => row[key] ?? `{{${key}}}`);
}

export function RequestTemplating({ requestUrl = '', requestMethod = 'GET', requestBody = '', onClose }: Props) {
  const [urlTemplate, setUrlTemplate] = useState(requestUrl);
  const [bodyTemplate, setBodyTemplate] = useState(requestBody);
  const [method, setMethod] = useState(requestMethod);
  const [dataMode, setDataMode] = useState<DataSourceMode>('csv');
  const [csvData, setCsvData] = useState('');
  const [jsonData, setJsonData] = useState('');
  const [manualRows, setManualRows] = useState<Record<string, string>[]>([{}]);
  const [preview, setPreview] = useState(false);
  const [generated, setGenerated] = useState(false);

  const addTab = useTabsStore(s => s.addTab);
  const addToast = useToastStore(s => s.addToast);

  const getRows = (): Record<string, string>[] => {
    if (dataMode === 'csv') return parseCSV(csvData);
    if (dataMode === 'json') return parseJSONData(jsonData);
    return manualRows.filter(r => Object.values(r).some(v => v));
  };

  const rows = getRows();

  // Extract variables from templates
  const vars = Array.from(new Set([
    ...Array.from(urlTemplate.matchAll(/\{\{(\w+)\}\}/g)).map(m => m[1]),
    ...Array.from(bodyTemplate.matchAll(/\{\{(\w+)\}\}/g)).map(m => m[1]),
  ]));

  const previewRequests = rows.slice(0, 5).map(row => ({
    url: applyTemplate(urlTemplate, row),
    body: applyTemplate(bodyTemplate, row),
  }));

  const generateRequests = () => {
    if (rows.length === 0) {
      addToast({ type: 'warning', message: 'No data rows found. Add CSV/JSON data or manual rows.' });
      return;
    }

    let count = 0;
    for (const row of rows) {
      addTab({
        name: `${method} ${applyTemplate(urlTemplate, row).split('/').pop()}`,
        method,
        url: applyTemplate(urlTemplate, row),
        bodyRaw: bodyTemplate ? applyTemplate(bodyTemplate, row) : '',
        bodyType: bodyTemplate ? 'json' : 'none',
      });
      count++;
    }

    setGenerated(true);
    addToast({ type: 'success', message: `${count} requests created as new tabs` });
    setTimeout(onClose, 1500);
  };

  const EXAMPLE_CSV = `name,email,role\nJohn Smith,john@example.com,admin\nJane Doe,jane@example.com,user\nBob Wilson,bob@example.com,moderator`;
  const EXAMPLE_JSON = `[{"name":"John Smith","email":"john@example.com","role":"admin"},{"name":"Jane Doe","email":"jane@example.com","role":"user"}]`;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[740px] max-h-[92vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-surface-bg)', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Request Templating</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Define template with {'{{variables}}'} → generate multiple requests from CSV/JSON</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Template definition */}
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>1. Define Request Template</p>
            <div className="flex gap-2">
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => (
                <button key={m} type="button" onClick={() => setMethod(m)}
                  className="px-2 py-1 text-[10px] rounded border cursor-pointer"
                  style={{
                    borderColor: method === m ? 'var(--color-info)' : 'var(--color-surface-border)',
                    color: method === m ? 'var(--color-info)' : 'var(--color-text-secondary)',
                  }}>{m}</button>
              ))}
            </div>
            <input value={urlTemplate} onChange={e => setUrlTemplate(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg text-[11.5px] font-mono outline-none"
              placeholder="https://api.example.com/users/{{id}} or /api/{{resource}}/{{id}}"
              style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
            {method !== 'GET' && method !== 'DELETE' && (
              <textarea value={bodyTemplate} onChange={e => setBodyTemplate(e.target.value)} rows={3}
                className="w-full px-3 py-2 rounded-lg text-[11px] font-mono resize-none outline-none"
                placeholder={'{"name": "{{name}}", "email": "{{email}}", "role": "{{role}}"}'}
                style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
            )}
            {vars.length > 0 && (
              <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                Variables detected: {vars.map(v => <code key={v} className="mx-0.5 px-1 rounded" style={{ backgroundColor: 'var(--color-surface-hover)' }}>{`{{${v}}}`}</code>)}
              </p>
            )}
          </div>

          {/* Data source */}
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>2. Data Source</p>
            <div className="flex gap-2">
              {(['csv', 'json', 'manual'] as const).map(m => (
                <button key={m} type="button" onClick={() => setDataMode(m)}
                  className="px-3 py-1 text-[10.5px] rounded border cursor-pointer"
                  style={{
                    borderColor: dataMode === m ? 'var(--color-info)' : 'var(--color-surface-border)',
                    color: dataMode === m ? 'var(--color-info)' : 'var(--color-text-secondary)',
                    backgroundColor: dataMode === m ? 'color-mix(in srgb, var(--color-info) 10%, transparent)' : 'transparent',
                  }}>
                  {m.toUpperCase()}
                </button>
              ))}
            </div>

            {dataMode === 'csv' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>CSV data (first row = headers)</label>
                  <button type="button" onClick={() => setCsvData(EXAMPLE_CSV)} className="text-[10px] cursor-pointer" style={{ color: 'var(--color-info)' }}>Load example</button>
                </div>
                <textarea value={csvData} onChange={e => setCsvData(e.target.value)} rows={5}
                  className="w-full px-3 py-2 rounded-lg text-[10.5px] font-mono resize-none outline-none"
                  placeholder={`name,email,role\nJohn,john@example.com,admin`}
                  style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
              </div>
            )}

            {dataMode === 'json' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>JSON array of objects</label>
                  <button type="button" onClick={() => setJsonData(EXAMPLE_JSON)} className="text-[10px] cursor-pointer" style={{ color: 'var(--color-info)' }}>Load example</button>
                </div>
                <textarea value={jsonData} onChange={e => setJsonData(e.target.value)} rows={5}
                  className="w-full px-3 py-2 rounded-lg text-[10.5px] font-mono resize-none outline-none"
                  placeholder='[{"id": 1, "name": "John"}, {"id": 2, "name": "Jane"}]'
                  style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
              </div>
            )}

            {dataMode === 'manual' && (
              <div>
                <p className="text-[11px] mb-2" style={{ color: 'var(--color-text-secondary)' }}>Add rows manually</p>
                {manualRows.map((row, i) => (
                  <div key={i} className="flex gap-2 mb-1.5">
                    {vars.map(v => (
                      <input key={v} value={row[v] || ''} onChange={e => {
                        const updated = [...manualRows];
                        updated[i] = { ...updated[i], [v]: e.target.value };
                        setManualRows(updated);
                      }}
                        className="flex-1 px-2 py-1 rounded text-[10.5px] outline-none"
                        placeholder={`{{${v}}}`}
                        style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
                    ))}
                  </div>
                ))}
                <button type="button" onClick={() => setManualRows([...manualRows, {}])}
                  className="flex items-center gap-1 text-[10.5px] cursor-pointer"
                  style={{ color: 'var(--color-info)' }}>
                  <PlusIcon size={10} />Add row
                </button>
              </div>
            )}

            {rows.length > 0 && (
              <p className="text-[10px]" style={{ color: 'var(--color-success)' }}>✓ {rows.length} rows ready</p>
            )}
          </div>

          {/* Preview */}
          {rows.length > 0 && urlTemplate && (
            <div>
              <button type="button" onClick={() => setPreview(p => !p)}
                className="text-[11px] cursor-pointer" style={{ color: 'var(--color-info)' }}>
                {preview ? '▼' : '▶'} Preview first {Math.min(5, rows.length)} requests
              </button>
              {preview && (
                <div className="mt-2 flex flex-col gap-1">
                  {previewRequests.map((req, i) => (
                    <div key={i} className="flex gap-2 items-start text-[10.5px] p-2 rounded border"
                      style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
                      <span className="font-bold flex-shrink-0" style={{ color: 'var(--color-info)' }}>{method}</span>
                      <span className="font-mono truncate" style={{ color: 'var(--color-text-primary)' }}>{req.url}</span>
                    </div>
                  ))}
                  {rows.length > 5 && <p className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>...and {rows.length - 5} more</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0 gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button type="button" onClick={generateRequests}
            disabled={rows.length === 0 || !urlTemplate.trim() || generated}
            className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-40 text-white"
            style={{ backgroundColor: generated ? 'var(--color-success)' : 'var(--color-info)' }}>
            {generated ? `✓ Generated` : `Generate ${rows.length} Request${rows.length !== 1 ? 's' : ''}`}
          </button>
          <button type="button" onClick={onClose}
            className="h-[30px] px-4 text-[11px] font-medium rounded-md cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
