import { useCallback, useRef } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useUrlSuggestionsStore } from '../../store/url-suggestions-store';
import { postMsg } from '../../vscode';
import { PlayIcon, SaveIcon, LockIcon, StopSquareIcon } from '../../icons';
import { SplitButton, HighlightedInput } from '../shared';
import type { SplitButtonItem } from '../shared';
import { saveRequest } from '../../services/request';
import { GrpcMethodSelector } from './GrpcMethodSelector';
import { useMockSuggestions } from '../../hooks/useMockSuggestions';

const saveItems: SplitButtonItem[] = [
  { id: 'save-as', label: 'Save as', icon: <SaveIcon size={12} />, iconColor: 'var(--color-ctx-close-saved)', onClick: () => postMsg({ type: 'openSaveAs', tabId: useTabsStore.getState().activeTabId! }) },
];

/**
 * GrpcUrlBar — endpoint input (host:port) + TLS toggle + method selector + Invoke + Save buttons.
 */
export function GrpcUrlBar() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const urlSuggestions = useUrlSuggestionsStore(s => s.byProtocol.grpc);
  const mockSuggestions = useMockSuggestions('grpc');
  const lastReflectedUrl = useRef('');

  // When user selects a gRPC mock server, auto-trigger reflection
  const handleMockServerSelect = useCallback((url: string) => {
    if (!activeTab) return;
    lastReflectedUrl.current = url;
    updateTab(activeTab.id, { grpcReflectionStatus: 'loading', grpcReflectionError: undefined });
    postMsg({
      type: 'grpc:reflect',
      tabId: activeTab.id,
      endpoint: url,
      tls: activeTab.grpcTls ?? false,
    });
  }, [activeTab, updateTab]);

  // Validate that endpoint looks like a valid gRPC target (host:port or host for TLS)
  const isValidGrpcEndpoint = useCallback((raw: string): boolean => {
    // Strip scheme if present
    const stripped = raw.replace(/^https?:\/\//, '');
    if (!stripped) return false;
    // host:port format
    const withPort = stripped.match(/^([a-zA-Z0-9._-]+|\[[^\]]+\]):(\d+)$/);
    if (withPort) {
      const port = parseInt(withPort[2], 10);
      return port > 0 && port <= 65535;
    }
    // hostname without port (valid for TLS on default 443)
    return /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/.test(stripped) && stripped.includes('.');
  }, []);

  // Auto-trigger server reflection when URL is confirmed (blur/Enter) — only for valid endpoints
  const triggerReflect = useCallback(() => {
    if (!activeTab) return;
    const endpoint = activeTab.url.trim();
    if (!endpoint || endpoint === lastReflectedUrl.current) return;
    if (!isValidGrpcEndpoint(endpoint)) return;
    // Don't re-reflect if already connected to same endpoint
    if (activeTab.grpcReflectionStatus === 'connected' && endpoint === lastReflectedUrl.current) return;
    lastReflectedUrl.current = endpoint;
    updateTab(activeTab.id, { grpcReflectionStatus: 'loading', grpcReflectionError: undefined });
    postMsg({
      type: 'grpc:reflect',
      tabId: activeTab.id,
      endpoint,
      tls: activeTab.grpcTls ?? false,
    });
  }, [activeTab, updateTab, isValidGrpcEndpoint]);

  const handleInvoke = useCallback(() => {
    if (!activeTab) return;
    const endpoint = activeTab.url.trim();
    if (!endpoint) return;

    // Determine RPC type from discovered services or stored metadata
    let rpcType: string = 'unary';
    const method = activeTab.grpcMethod || '';
    if (activeTab.grpcServices) {
      for (const svc of activeTab.grpcServices) {
        const found = svc.methods.find(m => m.fullName === method);
        if (found) { rpcType = found.type; break; }
      }
    }
    if (rpcType === 'unary' && activeTab.authData?.['grpc_rpcType']) {
      rpcType = activeTab.authData['grpc_rpcType'] as string;
    }

    postMsg({
      type: 'grpc:invoke',
      tabId: activeTab.id,
      endpoint,
      method,
      message: activeTab.grpcMessage || '{}',
      metadata: (activeTab.grpcMetadata || []).filter(m => m.enabled && m.key),
      tls: activeTab.grpcTls ?? false,
      protoFile: activeTab.grpcProtoFile,
      rpcType,
    });

    updateTab(activeTab.id, { loading: true, grpcStreamMessages: [], grpcStreamStatus: 'idle' });
  }, [activeTab, updateTab]);

  const handleCancel = useCallback(() => {
    if (!activeTab) return;
    postMsg({ type: 'grpc:cancel', tabId: activeTab.id });
    updateTab(activeTab.id, { loading: false, grpcStreamStatus: 'idle', requestProgress: undefined });
  }, [activeTab, updateTab]);

  const handleSave = useCallback(() => {
    if (!activeTab) return;
    const saved = saveRequest(activeTab);
    if (saved) updateTab(activeTab.id, { dirty: false });
  }, [activeTab, updateTab]);

  const toggleTls = useCallback(() => {
    if (!activeTab) return;
    updateTab(activeTab.id, { grpcTls: !activeTab.grpcTls });
  }, [activeTab, updateTab]);

  if (!activeTab) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)]">
      {/* TLS toggle */}
      <button
        type="button"
        onClick={toggleTls}
        className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors ${
          activeTab.grpcTls
            ? 'text-[var(--color-protocol-grpc)] bg-[rgba(0,184,181,0.12)]'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)]'
        }`}
        title={activeTab.grpcTls ? 'TLS enabled (click to disable)' : 'TLS disabled (click to enable)'}
      >
        <LockIcon size={14} />
      </button>

      {/* Endpoint input */}
      <div className="flex-[2] min-w-0">
        <HighlightedInput
          value={activeTab.url}
          onChange={(val) => updateTab(activeTab.id, { url: val, dirty: true })}
          onKeyDown={(e) => { if (e.key === 'Enter') { triggerReflect(); handleInvoke(); } }}
          placeholder="localhost:50051"
          suggestions={urlSuggestions}
          mockServers={mockSuggestions}
          onMockServerSelect={handleMockServerSelect}
          accentColor="var(--color-protocol-grpc)"
          protocolHints={[]}
        />
      </div>

      {/* Method selector */}
      <GrpcMethodSelector />

      {/* Invoke / Cancel button */}
      {activeTab.loading ? (
        <button
          type="button"
          onClick={handleCancel}
          className="h-[36px] px-5 text-[12px] font-medium rounded-md bg-[var(--color-error)] text-white hover:opacity-90 cursor-pointer transition-opacity flex items-center gap-1.5 flex-shrink-0"
        >
          <StopSquareIcon size={12} />
          Cancel
        </button>
      ) : (
        <button
          type="button"
          onClick={handleInvoke}
          disabled={!activeTab.url.trim()}
          className="h-[36px] px-5 text-[12px] font-medium rounded-md bg-[var(--color-protocol-grpc)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity flex items-center gap-1.5 flex-shrink-0"
        >
          <PlayIcon size={12} />
          Invoke
        </button>
      )}

      {/* Save SplitButton */}
      <SplitButton
        label="Save"
        variant="secondary"
        onClick={handleSave}
        icon={<SaveIcon size={13} />}
        items={saveItems}
      />
    </div>
  );
}
