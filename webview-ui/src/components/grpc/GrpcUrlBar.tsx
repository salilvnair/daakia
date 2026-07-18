import { useCallback, useRef, useState, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useUrlSuggestionsStore } from '../../store/url-suggestions-store';
import { postMsg } from '../../vscode';
import { PlayIcon, SaveIcon, LockIcon, StopSquareIcon, MoreVerticalIcon, SparkleIcon } from '../../icons';
import { saveRequest } from '../../services/request';
import { GrpcMethodSelector } from './GrpcMethodSelector';
import { useMockSuggestions } from '../../hooks/useMockSuggestions';
import { AiPreflightPopover } from '../ai/AiPreflightPopover';
import { PatternBaselinePopup } from '../ai/AiRequestPatternStatus';
import { AiGrpcProtoExplainerModal } from '../ai/AiGrpcProtoExplainerModal';
import { useAiFeaturesStore } from '../../store/ai-features-store';
import { logUiEvent } from '../../store/ui-audit-store';
import {
  ButtonView,
  IconButtonView,
  DropDownButtonView,
  HighlightedInputView,
  type ContextMenuItem,
} from '@salilvnair/dui';

const ACCENT = 'var(--color-protocol-grpc)';

/**
 * GrpcUrlBar — endpoint input (host:port) + TLS toggle + method selector + Invoke + Save buttons + AI Tools ⋮ menu.
 */
export function GrpcUrlBar() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const openDaakiaAiTab = useTabsStore(s => s.openDaakiaAiTab);
  const updateTab = useTabsStore(s => s.updateTab);
  const urlSuggestions = useUrlSuggestionsStore(s => s.byProtocol.grpc);
  const mockSuggestions = useMockSuggestions('grpc');
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const lastReflectedUrl = useRef('');

  const [showOverflow, setShowOverflow] = useState(false);
  const [overflowDir, setOverflowDir] = useState<'down' | 'up'>('down');
  const [showPreflight, setShowPreflight] = useState(false);
  const [showPatternStatus, setShowPatternStatus] = useState(false);
  const [showProtoExplainer, setShowProtoExplainer] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflow(false);
      }
    };
    if (showOverflow) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showOverflow]);

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

  const isValidGrpcEndpoint = useCallback((raw: string): boolean => {
    const stripped = raw.replace(/^https?:\/\//, '');
    if (!stripped) return false;
    const withPort = stripped.match(/^([a-zA-Z0-9._-]+|\[[^\]]+\]):(\d+)$/);
    if (withPort) {
      const port = parseInt(withPort[2], 10);
      return port > 0 && port <= 65535;
    }
    return /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/.test(stripped) && stripped.includes('.');
  }, []);

  const triggerReflect = useCallback(() => {
    if (!activeTab) return;
    const endpoint = activeTab.url.trim();
    if (!endpoint || endpoint === lastReflectedUrl.current) return;
    if (!isValidGrpcEndpoint(endpoint)) return;
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

    logUiEvent('grpc.invoke', { url: endpoint, method: activeTab.grpcMethod });

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
      authType: activeTab.authType,
      authData: activeTab.authData,
      preRequestScript: activeTab.preRequestScript || '',
      postResponseScript: activeTab.postResponseScript || '',
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
    logUiEvent('grpc.save', { url: activeTab.url });
    const saved = saveRequest(activeTab);
    if (saved) updateTab(activeTab.id, { dirty: false });
  }, [activeTab, updateTab]);

  const toggleTls = useCallback(() => {
    if (!activeTab) return;
    updateTab(activeTab.id, { grpcTls: !activeTab.grpcTls });
  }, [activeTab, updateTab]);

  if (!activeTab) return null;

  const saveItems: ContextMenuItem[] = [
    {
      id: 'save-as',
      label: 'Save as',
      icon: <SaveIcon size={13} />,
      iconColor: 'var(--color-ctx-close-saved)',
      onClick: () => postMsg({ type: 'openSaveAs', tabId: useTabsStore.getState().activeTabId! }),
    },
  ];

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)] flex-shrink-0 bg-[var(--color-panel)]">
      {/* TLS toggle */}
      <IconButtonView
        icon={<LockIcon size={14} />}
        size="lg"
        active={activeTab.grpcTls}
        accentColor={activeTab.grpcTls ? ACCENT : undefined}
        title={activeTab.grpcTls ? 'TLS enabled (click to disable)' : 'TLS disabled (click to enable)'}
        onClick={toggleTls}
      />

      {/* Endpoint input */}
      <div className="flex-[2] min-w-0">
        <HighlightedInputView
          value={activeTab.url}
          onChange={(val) => {
            updateTab(activeTab.id, { url: val, dirty: true });
            // Detect mock server selection by matching against known mock URLs
            const matched = mockSuggestions.find(s => s.url === val);
            if (matched) handleMockServerSelect(val);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') { triggerReflect(); handleInvoke(); } }}
          placeholder="localhost:50051"
          suggestions={urlSuggestions}
          mockServers={mockSuggestions}
          accentColor={ACCENT}
          size="lg"
          borderRadius={6}
        />
      </div>

      {/* Method selector */}
      <GrpcMethodSelector />

      {/* Invoke / Cancel button */}
      {activeTab.loading ? (
        <ButtonView
          label="Cancel"
          iconLeft={<StopSquareIcon size={12} />}
          variant="danger"
          size="lg"
          onClick={handleCancel}
        />
      ) : (
        <ButtonView
          label="Invoke"
          iconLeft={<PlayIcon size={12} />}
          variant="primary"
          size="lg"
          accentColor={ACCENT}
          disabled={!activeTab.url.trim()}
          onClick={handleInvoke}
        />
      )}

      {/* Save DropDownButton */}
      <DropDownButtonView
        label="Save"
        icon={<SaveIcon size={13} />}
        variant="secondary"
        size="lg"
        onPrimaryClick={handleSave}
        items={saveItems}
        align="right"
      />

      {/* AI Tools ⋮ menu */}
      <div className="flex-shrink-0 relative" ref={overflowRef}>
        <IconButtonView
          icon={<MoreVerticalIcon size={15} />}
          title="AI tools"
          size="lg"
          active={showOverflow}
          onClick={() => {
            if (!showOverflow && overflowRef.current) {
              const rect = overflowRef.current.getBoundingClientRect();
              setOverflowDir((window.innerHeight - rect.bottom) < 180 ? 'up' : 'down');
            }
            setShowOverflow(p => !p);
          }}
        />

        {showOverflow && (
          <div
            className={`absolute right-0 z-50 rounded-xl border shadow-2xl overflow-hidden min-w-[200px] ${overflowDir === 'up' ? 'bottom-[calc(100%+4px)]' : 'top-[calc(100%+4px)]'}`}
            style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}
          >
            <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
              <p className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>AI Tools</p>
            </div>

            {activeTab.url.trim() && aiEnabled('preflightCheck') && (
              <button type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left"
                style={{ color: 'var(--color-protocol-ai)' }}
                onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)`; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                onClick={() => { setShowPreflight(true); setShowOverflow(false); }}
              >
                <SparkleIcon size={12} style={{ color: 'var(--color-protocol-ai)', flexShrink: 0 }} />
                Pre-flight Check
              </button>
            )}

            {aiEnabled('daakiaAiChat') && (
              <button type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left"
                style={{ color: 'var(--color-protocol-ai)' }}
                onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)`; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                onClick={() => { openDaakiaAiTab(); setShowOverflow(false); }}
              >
                <SparkleIcon size={12} style={{ color: 'var(--color-protocol-ai)', flexShrink: 0 }} />
                Ask AI
              </button>
            )}

            {activeTab.url.trim() && aiEnabled('patternBaseline') && (
              <button type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left"
                style={{ color: 'var(--color-protocol-ai)' }}
                onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)`; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                onClick={() => { setShowPatternStatus(p => !p); setShowOverflow(false); }}
              >
                <SparkleIcon size={12} style={{ color: 'var(--color-protocol-ai)', flexShrink: 0 }} />
                Pattern Baseline
              </button>
            )}

            {aiEnabled('grpcProtoExplainer') && (
              <button type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left"
                style={{ color: 'var(--color-protocol-ai)' }}
                onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)`; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                onClick={() => { setShowProtoExplainer(true); setShowOverflow(false); }}
              >
                <SparkleIcon size={12} style={{ color: 'var(--color-protocol-ai)', flexShrink: 0 }} />
                Proto Explainer
              </button>
            )}
          </div>
        )}

        {showProtoExplainer && <AiGrpcProtoExplainerModal onClose={() => setShowProtoExplainer(false)} />}

        {showPreflight && activeTab.url.trim() && (
          <AiPreflightPopover tab={activeTab} onClose={() => setShowPreflight(false)} />
        )}

        {showPatternStatus && activeTab.url.trim() && aiEnabled('patternBaseline') && (
          <PatternBaselinePopup
            method="gRPC"
            url={activeTab.url}
            onClose={() => setShowPatternStatus(false)}
          />
        )}
      </div>
    </div>
  );
}
