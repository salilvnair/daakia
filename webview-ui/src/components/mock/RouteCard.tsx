/**
 * RouteCard — expandable route editor for REST mock server routes.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { ConfirmDialog } from '../shared';
import { SelectInputView, EditorView, KeyValueTableView, DurationInputView, ResizablePanelView, TabView, TextInputView, IconButtonView, PilledTabView, ToggleSwitchView } from '@salilvnair/dui';
import type { TabItem, KeyValueTableRow, SelectOption, PilledTab } from '@salilvnair/dui';
import { METHOD_COLORS, methodBg } from '../../colors';
import { TrashIcon, CopyIcon, CheckIcon, DiagonalLinesPattern, ExternalLinkIcon, FolderOpenIcon } from '../../icons';
import type { MockRoute, HttpMethod } from './mock-types';
import { postMsg } from '../../vscode';
import { logUiEvent } from '../../store/ui-audit-store';
import { openRouteTryTab } from './mock-try-handler';
import { MatchBuilderPanel } from './wiremock/MatchBuilderPanel';
import { TemplateEditorPanel } from './wiremock/TemplateEditorPanel';
import { FaultInjectionPanel } from './wiremock/FaultInjectionPanel';
import { SequencePanel } from './wiremock/SequencePanel';
import { WebhookPanel } from './wiremock/WebhookPanel';
import { RouteStatePanel } from './wiremock/StateMachinePanel';

type RouteTab = 'basic' | 'matching' | 'advanced';

function formatDelay(ms: number): string {
  if (ms >= 60000) return `${Math.round(ms / 60000)}m`;
  if (ms >= 1000) return `${Math.round(ms / 1000)}s`;
  return `${ms}ms`;
}

const MOCK_METHOD_OPTIONS: SelectOption[] = [
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
  availableStates?: string[];
  onEdit: () => void;
  onUpdate: (patch: Partial<MockRoute>) => void;
  onDelete: () => void;
}

export function RouteCard({ route, isEditing, serverBaseUrl, availableStates, onEdit, onUpdate, onDelete }: RouteCardProps) {
  const [contentType, setContentType] = useState<'application/json' | 'application/xml' | 'text/plain'>('application/json');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [headersExpanded, setHeadersExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<RouteTab>('basic');

  const pickBodyFile = useCallback(() => {
    const callbackId = `route-${route.id}-${Date.now()}`;
    const handler = (event: MessageEvent) => {
      const d = event.data;
      if (d?.type === 'mockServer:bodyFilePicked' && d.callbackId === callbackId) {
        window.removeEventListener('message', handler);
        if (d.filePath) onUpdate({ bodyFile: d.filePath });
      }
    };
    window.addEventListener('message', handler);
    postMsg({ type: 'mockServer:pickBodyFile', callbackId });
  }, [route.id, onUpdate]);

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

  const getEditorLang = (): 'json' | 'xml' | 'plaintext' => {
    if (contentType === 'application/json') return 'json';
    if (contentType === 'application/xml') return 'xml';
    return 'plaintext';
  };

  // Local state for header rows — syncs FROM route.headerRows (or route.headers fallback)
  const toRows = (route: { headers: Record<string, string>; headerRows?: Array<{ key: string; value: string; enabled: boolean }> }): KeyValueTableRow[] => {
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

  const [headerRows, setHeaderRows] = useState<KeyValueTableRow[]>(() => toRows(route));
  const prevHeadersRef = useRef(route.headers);

  // Sync from parent if route.headers changed externally
  useEffect(() => {
    if (prevHeadersRef.current !== route.headers) {
      prevHeadersRef.current = route.headers;
      setHeaderRows(toRows(route));
    }
  }, [route.headers]);

  const handleHeadersChange = (rows: KeyValueTableRow[]) => {
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
        <div onClick={(e) => e.stopPropagation()} className="relative z-20 flex-shrink-0">
          <ToggleSwitchView
            checked={route.enabled}
            onChange={(v) => { logUiEvent('mock.route_toggle', { enabled: v, routeId: route.id, method: route.method, path: route.path }); onUpdate({ enabled: v }); }}
            accentColor="var(--color-success)"
            size="xs"
          />
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md tracking-wider" style={{ color: METHOD_COLORS[route.method] || 'var(--color-muted-fallback)', backgroundColor: methodBg(route.method) }}>
          {route.method}
        </span>
        <span className="text-[12px] text-[var(--color-text-primary)] font-mono flex-1 truncate">{route.path}</span>
        <span className="text-[10px] text-[var(--color-text-muted)] font-mono bg-[var(--color-input-bg)] border border-[var(--color-surface-border)] rounded px-1.5 py-0.5">{route.statusCode}</span>
        {route.delay > 0 && (
          <span className="text-[10px] text-[var(--color-text-muted)] font-mono bg-[var(--color-input-bg)] border border-[var(--color-surface-border)] rounded px-1.5 py-0.5">{formatDelay(route.delay)}</span>
        )}
        {serverBaseUrl && (
          <span className="relative z-20 opacity-0 group-hover:opacity-100 transition-all">
            <IconButtonView
              size="default"
              icon={<ExternalLinkIcon size={12} />}
              onClick={tryRoute}
              tooltip="Try this route"
              color="var(--color-try-button)"
            />
          </span>
        )}
        {serverBaseUrl && (
          <span className="relative z-20 opacity-0 group-hover:opacity-100 transition-all">
            <IconButtonView
              size="default"
              icon={copied ? <CheckIcon size={12} className="text-[var(--color-success)]" /> : <CopyIcon size={12} />}
              onClick={copyFullPath}
              tooltip="Copy full URL"
            />
          </span>
        )}
        {route.enabled && (
          <span className="relative z-20 opacity-0 group-hover:opacity-100 transition-all">
            <IconButtonView
              size="default"
              icon={<TrashIcon size={12} />}
              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
              tooltip="Delete route"
              color="var(--color-text-muted)"
              accentColor="var(--color-error)"
            />
          </span>
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

          {/* Route-level tab bar */}
          <div className="flex items-center -mx-3 px-3 pb-0 pt-0.5 border-b border-[var(--color-surface-border)]">
            <TabView
              tabs={([
                { id: 'basic', label: 'Response' },
                { id: 'matching', label: 'Matching' },
                { id: 'advanced', label: 'Advanced' },
              ] as TabItem[])}
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as RouteTab)}
              variant="underline"
              size="xs"
              accentColor="var(--color-mock-server)"
            />
          </div>

          {/* ═══ BASIC TAB ═══════════════════════════════════════════════════ */}
          {activeTab === 'basic' && <>
            {/* Method + Path */}
            <div className="flex items-center gap-2">
              <SelectInputView
                options={MOCK_METHOD_OPTIONS}
                value={route.method}
                onChange={(v) => { logUiEvent('mock.route_method', { method: v, routeId: route.id }); onUpdate({ method: v as HttpMethod }); }}
                size="md"
                accentColor={METHOD_COLORS[route.method] || 'var(--color-primary)'}
              />
              <TextInputView
                value={route.path}
                onChange={(e) => onUpdate({ path: e.target.value })}
                placeholder="/api/endpoint"
                size="md"
                className="flex-1 font-mono"
                accentColor="var(--color-mock-server)"
              />
            </div>

            {/* Status + Delay */}
            <div className="flex items-center gap-4 pt-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[var(--color-text-muted)]">Status</span>
                <TextInputView
                  type="number"
                  value={String(route.statusCode)}
                  onChange={(e) => onUpdate({ statusCode: parseInt(e.target.value) || 200 })}
                  size="md"
                  className="font-mono text-center w-[56px]"
                  accentColor="var(--color-mock-server)"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[var(--color-text-muted)]">Delay</span>
                <DurationInputView
                  value={route.delay}
                  onChange={(ms) => onUpdate({ delay: ms })}
                  size="md"
                />
              </div>
            </div>

            {/* Response Headers — collapsed by default, tight spacing */}
            <div className="pt-0.5">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setHeadersExpanded(!headersExpanded)}
                className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
              >
                <span className={`transition-transform text-[8px] ${headersExpanded ? 'rotate-90' : ''}`}>▶</span>
                Response Headers ({Object.keys(route.headers).length})
              </div>
              {headersExpanded && (
                <div className="mt-1.5">
                  <KeyValueTableView
                    rows={headerRows}
                    onChange={handleHeadersChange}
                    placeholder={{ key: 'Header name', value: 'Value' }}
                    label="Header List"
                    accentColor="var(--color-mock-server)"
                    size="md"
                  />
                </div>
              )}
            </div>

            {/* Response Body Source toggle */}
            <div className="flex items-center gap-3">
              <label className="text-[11px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">Body Source</label>
              <PilledTabView
                mode="pill"
                tabs={[{ id: 'inline', label: 'inline' }, { id: 'file', label: 'file' }] as PilledTab[]}
                activeId={route.bodySource ?? 'inline'}
                onChange={(id) => onUpdate({ bodySource: id as 'inline' | 'file' })}
                accentColor="var(--color-mock-server)"
              />
            </div>

            {/* File path input when bodySource === 'file' */}
            {route.bodySource === 'file' && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <TextInputView
                    value={route.bodyFile || ''}
                    onChange={(e) => onUpdate({ bodyFile: e.target.value })}
                    placeholder="Select a file or type its path…"
                    size="md"
                    className="font-mono flex-1"
                    accentColor="var(--color-mock-server)"
                  />
                  <IconButtonView
                    size="md"
                    icon={<FolderOpenIcon size={14} />}
                    onClick={pickBodyFile}
                    tooltip="Browse file…"
                    color="var(--color-mock-server)"
                  />
                </div>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  Supports any file type (ZIP, PDF, PNG, XML, …). Content-Type and Content-Disposition are auto-set from the file extension unless overridden in Response Headers above.
                </span>
              </div>
            )}

            {/* Response Body editor (only when inline) */}
            {(route.bodySource ?? 'inline') === 'inline' && <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">Response Body</label>
                <PilledTabView
                  mode="pill"
                  tabs={[
                    { id: 'application/json', label: 'json' },
                    { id: 'application/xml', label: 'xml' },
                    { id: 'text/plain', label: 'plain' },
                  ] as PilledTab[]}
                  activeId={contentType}
                  onChange={(id) => {
                    setContentType(id as 'application/json' | 'application/xml' | 'text/plain');
                    onUpdate({ headers: { ...route.headers, 'Content-Type': id } });
                  }}
                  accentColor="var(--color-mock-server)"
                />
              </div>
              <ResizablePanelView defaultHeight={120} minHeight={60} maxHeight={500}>
                <EditorView
                  value={route.body}
                  onChange={(val) => onUpdate({ body: val })}
                  language={getEditorLang()}
                  height="100%"
                />
              </ResizablePanelView>
            </div>}

            {/* Template Editor (6A.7-6A.9) */}
            <TemplateEditorPanel route={route} onUpdate={onUpdate} />

            {/* Response Script (for dynamic responses like OAuth/JWT) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">
                  Response Script
                  {route.responseScript?.trim() && <span className="ml-1.5 text-[9px] text-[var(--color-success)]">(active — overrides body)</span>}
                </label>
                <span className="text-[9px] text-[var(--color-text-muted)] opacity-60">JS • access: req.body, req.headers, req.query, jwt.sign()</span>
              </div>
              <ResizablePanelView defaultHeight={100} minHeight={50} maxHeight={400}>
                <EditorView
                  value={route.responseScript || ''}
                  onChange={(val) => onUpdate({ responseScript: val })}
                  language="javascript"
                  placeholder="// Return object/string as response. Example:\n// const token = jwt.sign({ sub: req.body.username }, 'secret', { expiresIn: 3600 });\n// return { access_token: token };"
                  height="100%"
                />
              </ResizablePanelView>
            </div>

            {/* Sequence responses (6A.22) */}
            <SequencePanel route={route} onUpdate={onUpdate} />
          </>}

          {/* ═══ MATCHING TAB ════════════════════════════════════════════════ */}
          {activeTab === 'matching' && (
            <MatchBuilderPanel route={route} onUpdate={onUpdate} />
          )}

          {/* ═══ ADVANCED TAB ════════════════════════════════════════════════ */}
          {activeTab === 'advanced' && (
            <div className="flex flex-col gap-3">
              {/* State machine (6A.11) */}
              <div>
                <p className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide mb-2">State Machine</p>
                <RouteStatePanel route={route} onUpdate={onUpdate} availableStates={availableStates} />
              </div>
              {/* Fault injection + rate limit (6A.13-6A.14) */}
              <FaultInjectionPanel route={route} onUpdate={onUpdate} />
              {/* Webhooks (6A.23) */}
              <WebhookPanel route={route} onUpdate={onUpdate} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
