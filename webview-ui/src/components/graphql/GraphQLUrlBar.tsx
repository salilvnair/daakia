import { useState, useCallback, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useUrlSuggestionsStore } from '../../store/url-suggestions-store';
import { postMsg } from '../../vscode';
import { SplitButton, HighlightedInput, type SplitButtonItem } from '../shared';
import { saveRequest } from '../../services/request';
import { ConnectIcon, DisconnectIcon, SaveIcon, MoreVerticalIcon, SparkleIcon } from '../../icons';
import { useMockSuggestions } from '../../hooks/useMockSuggestions';
import { AiPreflightPopover } from '../ai/AiPreflightPopover';
import { PatternBaselinePopup } from '../ai/AiRequestPatternStatus';
import { AiGqlFederationModal } from '../ai/AiGqlFederationModal';
import { useAiFeaturesStore } from '../../store/ai-features-store';
import { logUiEvent } from '../../store/ui-audit-store';

/**
 * GraphQL URL bar — endpoint input + Connect/Disconnect button + AI Tools ⋮ menu.
 * Connect triggers schema introspection. Run is in the query editor.
 */
export function GraphQLUrlBar() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const openDaakiaAiTab = useTabsStore(s => s.openDaakiaAiTab);
  const updateTab = useTabsStore(s => s.updateTab);
  const urlSuggestions = useUrlSuggestionsStore(s => s.byProtocol.graphql);
  const mockSuggestions = useMockSuggestions('graphql');
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);

  const [showOverflow, setShowOverflow] = useState(false);
  const [overflowDir, setOverflowDir] = useState<'down' | 'up'>('down');
  const [showPreflight, setShowPreflight] = useState(false);
  const [showPatternStatus, setShowPatternStatus] = useState(false);
  const [showFederationModal, setShowFederationModal] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const overflowBtnRef = useRef<HTMLButtonElement>(null);

  const isConnected = !!activeTab?.authData?.['gql_connected'];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflow(false);
      }
    };
    if (showOverflow) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showOverflow]);

  const handleConnect = useCallback(() => {
    if (!activeTab) return;
    const endpoint = activeTab.url.trim();
    if (!endpoint) return;

    logUiEvent('graphql.introspect', { url: endpoint });
    updateTab(activeTab.id, { authData: { ...activeTab.authData, gql_connected: 'connecting' } });
    postMsg({
      type: 'graphql:connect',
      tabId: activeTab.id,
      endpoint,
      headers: activeTab.headers.filter(h => h.enabled && h.key),
      envId: activeTab.envId,
    });
  }, [activeTab, updateTab]);

  const handleDisconnect = useCallback(() => {
    if (!activeTab) return;
    const { gql_connected, gql_schema, gql_schema_sdl, ...restAuth } = activeTab.authData || {};
    updateTab(activeTab.id, { authData: restAuth });
  }, [activeTab, updateTab]);

  if (!activeTab) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)] flex-shrink-0">
      {/* Protocol badge */}
      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wider text-[var(--color-protocol-graphql)] bg-[rgba(229,53,171,0.1)]">
        GQL
      </span>

      {/* Endpoint input */}
      <HighlightedInput
        value={activeTab.url}
        onChange={(v) => updateTab(activeTab.id, { url: v })}
        onKeyDown={(e) => { if (e.key === 'Enter') isConnected ? handleDisconnect() : handleConnect(); }}
        placeholder="https://api.example.com/graphql"
        disabled={isConnected}
        suggestions={urlSuggestions}
        mockServers={mockSuggestions}
        protocolHints={['http://', 'https://']}
        accentColor="var(--color-protocol-graphql)"
      />

      {/* Connect/Disconnect button */}
      {!isConnected ? (
        <button
          type="button"
          onClick={handleConnect}
          disabled={!activeTab.url.trim() || activeTab.authData?.['gql_connected'] === 'connecting'}
          className="h-[36px] px-5 text-[12px] font-medium rounded-md bg-[var(--color-protocol-graphql)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity flex items-center gap-1.5 flex-shrink-0"
        >
          <ConnectIcon size={12} />
          {activeTab.authData?.['gql_connected'] === 'connecting' ? 'Connecting...' : 'Connect'}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleDisconnect}
          className="h-[36px] px-5 text-[12px] font-medium rounded-md bg-[rgba(239,68,68,0.12)] text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.2)] cursor-pointer transition-colors flex items-center gap-1.5 flex-shrink-0"
        >
          <DisconnectIcon size={12} />
          Disconnect
        </button>
      )}

      {/* Save SplitButton */}
      <SplitButton
        label="Save"
        variant="secondary"
        onClick={() => {
          const saved = saveRequest(activeTab);
          if (saved) useTabsStore.getState().updateTab(activeTab.id, { dirty: false });
        }}
        icon={<SaveIcon />}
        items={saveItems}
      />

      {/* AI Tools ⋮ menu */}
      <div className="flex-shrink-0 relative" ref={overflowRef}>
        <button
          ref={overflowBtnRef}
          type="button"
          onClick={() => {
            if (!showOverflow && overflowBtnRef.current) {
              const rect = overflowBtnRef.current.getBoundingClientRect();
              const spaceBelow = window.innerHeight - rect.bottom;
              setOverflowDir(spaceBelow < 180 ? 'up' : 'down');
            }
            setShowOverflow(p => !p);
          }}
          title="AI tools"
          className="flex items-center justify-center w-[36px] h-[36px] rounded-md cursor-pointer transition-colors"
          style={{
            color: showOverflow ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            backgroundColor: showOverflow ? 'rgba(255,255,255,0.08)' : 'transparent',
          }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = showOverflow ? 'rgba(255,255,255,0.08)' : 'transparent'; e.currentTarget.style.color = showOverflow ? 'var(--color-text-primary)' : 'var(--color-text-muted)'; }}
        >
          <MoreVerticalIcon size={15} />
        </button>

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
            {aiEnabled('gqlFederation') && (
              <button type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left"
                style={{ color: 'var(--color-protocol-graphql)' }}
                onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-protocol-graphql) 8%, transparent)`; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                onClick={() => { setShowFederationModal(true); setShowOverflow(false); }}
              >
                <SparkleIcon size={12} style={{ color: 'var(--color-protocol-graphql)', flexShrink: 0 }} />
                Federation Explorer ✦
              </button>
            )}
          </div>
        )}

        {showFederationModal && <AiGqlFederationModal onClose={() => setShowFederationModal(false)} />}

        {showPreflight && activeTab.url.trim() && (
          <AiPreflightPopover tab={activeTab} onClose={() => setShowPreflight(false)} />
        )}

        {showPatternStatus && activeTab.url.trim() && aiEnabled('patternBaseline') && (
          <PatternBaselinePopup
            method="GQL"
            url={activeTab.url}
            onClose={() => setShowPatternStatus(false)}
            dir={overflowDir}
          />
        )}
      </div>
    </div>
  );
}

const saveItems: SplitButtonItem[] = [
  {
    id: 'save-as',
    label: 'Save as',
    icon: <SaveIcon />,
    iconColor: 'var(--color-ctx-close-saved)',
    onClick: () => postMsg({ type: 'openSaveAs', tabId: useTabsStore.getState().activeTabId! }),
  },
];
