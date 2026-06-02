/**
 * RouteCard — expandable route editor for REST mock server routes.
 */
import { useState, useEffect, useRef } from 'react';
import { CodeEditor, ConfirmDialog, KeyValueTable, StyledDropdown, ResizablePanel, DurationInput, type DropdownOption, type KeyValueRow } from '../shared';
import { METHOD_COLORS, methodBg } from '../../colors';
import { TrashIcon, CopyIcon, CheckIcon, DiagonalLinesPattern, ExternalLinkIcon } from '../../icons';
import type { MockRoute, HttpMethod } from './mock-types';
import { openRouteTryTab } from './mock-try-handler';

function formatDelay(ms: number): string {
  if (ms >= 60000) return `${Math.round(ms / 60000)}m`;
  if (ms >= 1000) return `${Math.round(ms / 1000)}s`;
  return `${ms}ms`;
}

const MOCK_METHOD_OPTIONS: DropdownOption[] = [
  { value: 'GET', label: 'GET', color: METHOD_COLORS.GET },
  { value: 'POST', label: 'POST', color: METHOD_COLORS.POST },
  { value: 'PUT', label: 'PUT', color: METHOD_COLORS.PUT },
  { value: 'PATCH', label: 'PATCH', color: METHOD_COLORS.PATCH },
  { value: 'DELETE', label: 'DELETE', color: METHOD_COLORS.DELETE },
  { value: 'HEAD', label: 'HEAD', color: METHOD_COLORS.HEAD },
  { value: 'OPTIONS', label: 'OPTIONS', color: METHOD_COLORS.OPTIONS },
];

interface RouteCardProps {
  route: MockRoute;
  isEditing: boolean;
  serverBaseUrl?: string;
  onEdit: () => void;
  onUpdate: (patch: Partial<MockRoute>) => void;
  onDelete: () => void;
}

export function RouteCard({ route, isEditing, serverBaseUrl, onEdit, onUpdate, onDelete }: RouteCardProps) {
  const [contentType, setContentType] = useState<'application/json' | 'application/xml' | 'text/plain'>('application/json');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [headersExpanded, setHeadersExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyFullPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!serverBaseUrl) return;
    const fullUrl = `${serverBaseUrl}${route.path.startsWith('/') ? '' : '/'}${route.path}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const tryRoute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!serverBaseUrl) return;
    openRouteTryTab(serverBaseUrl, route);
  };

  const getEditorLang = () => {
    if (contentType === 'application/json') return 'json';
    if (contentType === 'application/xml') return 'xml';
    return 'text';
  };

  // Local state for header rows — syncs FROM route.headerRows (or route.headers fallback)
  const toRows = (route: { headers: Record<string, string>; headerRows?: Array<{ key: string; value: string; enabled: boolean }> }): KeyValueRow[] => {
    if (route.headerRows && route.headerRows.length > 0) {
      const rows = route.headerRows.map(r => ({
        id: `${r.key}-${r.enabled}`,
        key: r.key,
        value: r.value,
        enabled: r.enabled,
      }));
      if (rows.length === 0) rows.push({ id: crypto.randomUUID(), key: '', value: '', enabled: true });
      return rows;
    }
    const rows = Object.entries(route.headers).map(([key, value]) => ({
      id: key,
      key,
      value,
      enabled: true,
    }));
    if (rows.length === 0) rows.push({ id: crypto.randomUUID(), key: '', value: '', enabled: true });
    return rows;
  };

  const [headerRows, setHeaderRows] = useState<KeyValueRow[]>(() => toRows(route));
  const prevHeadersRef = useRef(route.headers);

  // Sync from parent if route.headers changed externally
  useEffect(() => {
    if (prevHeadersRef.current !== route.headers) {
      prevHeadersRef.current = route.headers;
      setHeaderRows(toRows(route));
    }
  }, [route.headers]);

  const handleHeadersChange = (rows: KeyValueRow[]) => {
    setHeaderRows(rows);
    // Only enabled rows with keys go into headers (for the backend)
    const headers: Record<string, string> = {};
    rows.forEach(r => { if (r.key.trim() && r.enabled) headers[r.key.trim()] = r.value; });
    // Persist full row state including disabled
    const headerRows2 = rows.filter(r => r.key.trim()).map(r => ({ key: r.key.trim(), value: r.value, enabled: r.enabled }));
    prevHeadersRef.current = headers;
    onUpdate({ headers, headerRows: headerRows2 });
  };

  return (
    <div className={`relative rounded-lg border transition-all ${
      isEditing
        ? 'border-[var(--color-mock-server)] bg-[rgba(234,179,8,0.03)] shadow-[0_0_0_1px_rgba(234,179,8,0.1)]'
        : route.enabled
          ? 'border-[var(--color-surface-border)] bg-[var(--color-surface)] hover:border-[var(--color-elevated-border)]'
          : 'border-[var(--color-surface-border)] bg-[var(--color-panel)]'
    }`}>
      {/* Disabled overlay */}
      {!route.enabled && (
        <div className="absolute inset-0 rounded-lg z-10 pointer-events-none overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg bg-[var(--color-muted-fallback)]" />
          <div className="absolute inset-0 rounded-lg" style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.03) 0%, rgba(255,255,255,0.04) 100%)' }} />
          <DiagonalLinesPattern patternId={`disabled-lines-${route.id}`} />
        </div>
      )}

      {/* Route summary row */}
      <div className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer group relative ${!route.enabled ? 'opacity-50' : ''}`} onClick={() => { if (route.enabled) onEdit(); }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onUpdate({ enabled: !route.enabled }); }}
          className="relative z-20 w-[28px] h-[14px] rounded-full transition-colors flex-shrink-0 cursor-pointer"
          style={{ backgroundColor: route.enabled ? 'var(--color-success)' : 'var(--color-muted-fallback)' }}
          title={route.enabled ? 'Disable' : 'Enable'}
        >
          <span className="absolute top-[2px] w-[10px] h-[10px] rounded-full bg-white transition-all" style={{ left: route.enabled ? '16px' : '2px' }} />
        </button>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md tracking-wider" style={{ color: METHOD_COLORS[route.method] || 'var(--color-muted-fallback)', backgroundColor: methodBg(route.method) }}>
          {route.method}
        </span>
        <span className="text-[12px] text-[var(--color-text-primary)] font-mono flex-1 truncate">{route.path}</span>
        <span className="text-[10px] text-[var(--color-text-muted)] font-mono bg-[var(--color-input-bg)] border border-[var(--color-surface-border)] rounded px-1.5 py-0.5">{route.statusCode}</span>
        {route.delay > 0 && (
          <span className="text-[10px] text-[var(--color-text-muted)] font-mono bg-[var(--color-input-bg)] border border-[var(--color-surface-border)] rounded px-1.5 py-0.5">{formatDelay(route.delay)}</span>
        )}
        {serverBaseUrl && (
          <button
            type="button"
            onClick={tryRoute}
            className="relative z-20 p-1 text-[var(--color-try-button)] hover:text-[var(--color-try-button)] cursor-pointer transition-all opacity-0 group-hover:opacity-100"
            title="Try this route"
          >
            <ExternalLinkIcon size={12} />
          </button>
        )}
        {serverBaseUrl && (
          <button
            type="button"
            onClick={copyFullPath}
            className="relative z-20 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-all opacity-0 group-hover:opacity-100"
            title="Copy full URL"
          >
            {copied ? <CheckIcon size={12} className="text-[var(--color-success)]" /> : <CopyIcon size={12} />}
          </button>
        )}
        {route.enabled && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
            className="relative z-20 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer transition-all opacity-0 group-hover:opacity-100"
            title="Delete route"
          >
            <TrashIcon size={12} />
          </button>
        )}
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Route?"
          message={`${route.method} ${route.path} will be permanently deleted.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => { setShowDeleteConfirm(false); onDelete(); }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Expanded edit form */}
      {isEditing && route.enabled && (
        <div className="border-t border-[var(--color-surface-border)] px-3 py-3 flex flex-col gap-2.5">
          {/* Method + Path */}
          <div className="flex items-center gap-2">
            <StyledDropdown
              options={MOCK_METHOD_OPTIONS}
              value={route.method}
              onChange={(v) => onUpdate({ method: v as HttpMethod })}
              className="mock-method"
            />
            <input
              type="text"
              value={route.path}
              onChange={(e) => onUpdate({ path: e.target.value })}
              placeholder="/api/endpoint"
              className="flex-1 h-[32px] px-3 text-[13px] font-mono rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          {/* Status + Delay */}
          <div className="flex items-center gap-4 pt-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[var(--color-text-muted)]">Status</span>
              <input
                type="text"
                inputMode="numeric"
                value={route.statusCode}
                onChange={(e) => onUpdate({ statusCode: parseInt(e.target.value) || 200 })}
                className="w-[56px] h-[28px] px-2 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[var(--color-text-muted)]">Delay</span>
              <DurationInput
                value={route.delay}
                onChange={(ms) => onUpdate({ delay: ms })}
              />
            </div>
          </div>

          {/* Response Headers — collapsed by default, tight spacing */}
          <div className="pt-0.5">
            <button
              type="button"
              onClick={() => setHeadersExpanded(!headersExpanded)}
              className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
            >
              <span className={`transition-transform text-[8px] ${headersExpanded ? 'rotate-90' : ''}`}>▶</span>
              Response Headers ({Object.keys(route.headers).length})
            </button>
            {headersExpanded && (
              <div className="mt-1.5">
                <KeyValueTable
                  rows={headerRows}
                  onChange={handleHeadersChange}
                  placeholder={{ key: 'Header name', value: 'Value' }}
                  autocompleteKeys
                  label="Header List"
                  accentColor="var(--color-mock-server)"
                />
              </div>
            )}
          </div>

          {/* Response Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">Response Body</label>
              <div className="flex items-center gap-0.5 rounded-md border border-[var(--color-surface-border)] overflow-hidden">
                {(['application/json', 'application/xml', 'text/plain'] as const).map(ct => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => {
                      setContentType(ct);
                      onUpdate({ headers: { ...route.headers, 'Content-Type': ct } });
                    }}
                    className={`px-2.5 py-1 text-[10px] cursor-pointer transition-colors ${
                      contentType === ct
                        ? 'bg-[rgba(234,179,8,0.15)] text-[var(--color-mock-server)] font-medium'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]'
                    }`}
                  >
                    {ct.split('/')[1]}
                  </button>
                ))}
              </div>
            </div>
            <ResizablePanel id={`mock.rest.route.${route.id}.body`} defaultHeight={120} minHeight={60} maxHeight={500}>
              <CodeEditor
                value={route.body}
                onChange={(val) => onUpdate({ body: val })}
                language={getEditorLang() as any}
                height="100%"
              />
            </ResizablePanel>
          </div>

          {/* Response Script (for dynamic responses like OAuth/JWT) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">
                Response Script
                {route.responseScript?.trim() && <span className="ml-1.5 text-[9px] text-[var(--color-success)]">(active — overrides body)</span>}
              </label>
              <span className="text-[9px] text-[var(--color-text-muted)] opacity-60">JS • access: req.body, req.headers, req.query, jwt.sign()</span>
            </div>
            <ResizablePanel id={`mock.rest.route.${route.id}.script`} defaultHeight={100} minHeight={50} maxHeight={400}>
              <CodeEditor
                value={route.responseScript || ''}
                onChange={(val) => onUpdate({ responseScript: val })}
                language="javascript"
                placeholder="// Return object/string as response. Example:\n// const token = jwt.sign({ sub: req.body.username }, 'secret', { expiresIn: 3600 });\n// return { access_token: token };"
                height="100%"
              />
            </ResizablePanel>
          </div>
        </div>
      )}
    </div>
  );
}
