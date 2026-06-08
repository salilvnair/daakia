/**
 * RequestChaining — extract values from response body/headers and chain to next request.
 * Feature 6B.1 — Request Chaining
 *
 * Lets users define extractions like: response.data.id → {{userId}}
 * The variable is then available in subsequent requests via the env system.
 */
import { useState } from 'react';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import { PlusIcon, TrashIcon } from '../../icons';

export interface ChainExtraction {
  id: string;
  source: 'body' | 'header' | 'status';
  path: string;           // JSONPath-like: data.users[0].id  or  header: Authorization
  variableName: string;   // {{variableName}} — without the braces
  enabled: boolean;
}

interface Props {
  tabId: string;
  extractions: ChainExtraction[];
  onExtractionsChange: (extractions: ChainExtraction[]) => void;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
}

function extractValue(body: string, headers: Record<string, string>, extraction: ChainExtraction): string | undefined {
  if (extraction.source === 'status') return undefined;
  if (extraction.source === 'header') {
    const key = Object.keys(headers).find(k => k.toLowerCase() === extraction.path.toLowerCase());
    return key ? headers[key] : undefined;
  }
  // Body extraction — simple dot-path resolver
  try {
    const obj = JSON.parse(body);
    const parts = extraction.path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current !== undefined ? String(current) : undefined;
  } catch {
    return undefined;
  }
}

export function RequestChaining({ tabId, extractions, onExtractionsChange, responseBody = '', responseHeaders = {} }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const addToast = useToastStore(s => s.addToast);

  const addExtraction = () => {
    onExtractionsChange([
      ...extractions,
      { id: `ex-${Date.now()}`, source: 'body', path: '', variableName: '', enabled: true },
    ]);
  };

  const removeExtraction = (id: string) => {
    onExtractionsChange(extractions.filter(e => e.id !== id));
  };

  const updateExtraction = (id: string, partial: Partial<ChainExtraction>) => {
    onExtractionsChange(extractions.map(e => e.id === id ? { ...e, ...partial } : e));
  };

  const applyExtractions = () => {
    const applied: Record<string, string> = {};
    for (const ex of extractions) {
      if (!ex.enabled || !ex.variableName || !ex.path) continue;
      const value = extractValue(responseBody, responseHeaders, ex);
      if (value !== undefined) {
        applied[ex.variableName] = value;
      }
    }

    if (Object.keys(applied).length === 0) {
      addToast({ type: 'warning', message: 'No values extracted. Check your paths.' });
      return;
    }

    postMsg({ type: 'env:setVars', vars: applied });
    addToast({ type: 'success', message: `Extracted ${Object.keys(applied).length} variable${Object.keys(applied).length !== 1 ? 's' : ''} to environment` });
  };

  const extractedPreviews: Array<{ ex: ChainExtraction; value: string | undefined }> = responseBody
    ? extractions.filter(e => e.enabled && e.path).map(ex => ({ ex, value: extractValue(responseBody, responseHeaders, ex) }))
    : [];

  return (
    <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--color-surface-border)' }}>
      {/* Header */}
      <button type="button" onClick={() => setCollapsed(p => !p)}
        className="w-full flex items-center justify-between px-3 py-2 cursor-pointer"
        style={{ backgroundColor: 'var(--color-surface-hover)' }}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            ⛓ Response Chaining
          </span>
          {extractions.filter(e => e.enabled).length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white"
              style={{ backgroundColor: 'var(--color-info)' }}>
              {extractions.filter(e => e.enabled).length}
            </span>
          )}
        </div>
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <div className="p-3 flex flex-col gap-2">
          <p className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
            Extract values from the response and inject them as environment variables for use in subsequent requests.
          </p>

          {extractions.map(ex => (
            <div key={ex.id} className="flex items-center gap-2 p-2 rounded-lg border"
              style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
              <input
                type="checkbox"
                checked={ex.enabled}
                onChange={e => updateExtraction(ex.id, { enabled: e.target.checked })}
                className="flex-shrink-0"
              />

              {/* Source */}
              <div className="flex flex-col gap-1 w-[80px] flex-shrink-0">
                {(['body', 'header', 'status'] as const).map(src => (
                  <label key={src} className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" name={`src-${ex.id}`} value={src} checked={ex.source === src}
                      onChange={() => updateExtraction(ex.id, { source: src })} className="w-3 h-3" />
                    <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>{src}</span>
                  </label>
                ))}
              </div>

              {/* Path */}
              <input
                type="text"
                value={ex.path}
                onChange={e => updateExtraction(ex.id, { path: e.target.value })}
                placeholder={ex.source === 'header' ? 'Authorization' : ex.source === 'status' ? '(status code)' : 'data.user.id'}
                disabled={ex.source === 'status'}
                className="flex-1 px-2 py-1 rounded text-[10.5px] font-mono outline-none"
                style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
              />

              <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>→</span>

              {/* Variable name */}
              <input
                type="text"
                value={ex.variableName}
                onChange={e => updateExtraction(ex.id, { variableName: e.target.value })}
                placeholder="variableName"
                className="w-[120px] px-2 py-1 rounded text-[10.5px] font-mono outline-none"
                style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
              />

              {/* Preview value */}
              {responseBody && ex.path && (
                <span className="text-[9.5px] font-mono max-w-[80px] truncate flex-shrink-0"
                  style={{
                    color: extractedPreviews.find(p => p.ex.id === ex.id)?.value
                      ? 'var(--color-success)' : 'var(--color-text-muted)'
                  }}>
                  {extractedPreviews.find(p => p.ex.id === ex.id)?.value ?? '(not found)'}
                </span>
              )}

              <button type="button" onClick={() => removeExtraction(ex.id)}
                className="w-6 h-6 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer flex-shrink-0">
                <TrashIcon size={11} />
              </button>
            </div>
          ))}

          <div className="flex items-center gap-2">
            <button type="button" onClick={addExtraction}
              className="flex items-center gap-1 text-[10.5px] px-2.5 py-1 rounded-md cursor-pointer border transition-all"
              style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
              <PlusIcon size={10} />
              Add Extraction
            </button>

            {extractions.length > 0 && responseBody && (
              <button type="button" onClick={applyExtractions}
                className="flex items-center gap-1 text-[10.5px] px-2.5 py-1 rounded-md cursor-pointer text-white"
                style={{ backgroundColor: 'var(--color-success)' }}>
                ⛓ Apply to Environment
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
