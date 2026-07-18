import { useState, useCallback, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useUrlSuggestionsStore } from '../../store/url-suggestions-store';
import { postMsg } from '../../vscode';
import { HighlightedInput } from '../shared';
import { ButtonView, IconButtonView, DropDownButtonView, type ContextMenuItem } from '@salilvnair/dui';
import { saveRequest } from '../../services/request';
import { ConnectIcon, DisconnectIcon, SaveIcon, MoreVerticalIcon, SparkleIcon } from '../../icons';
import { useMockSuggestions } from '../../hooks/useMockSuggestions';
import { AiPreflightPopover } from '../ai/AiPreflightPopover';
import { PatternBaselinePopup } from '../ai/AiRequestPatternStatus';
import { AiGqlFederationModal } from '../ai/AiGqlFederationModal';
import { useAiFeaturesStore } from '../../store/ai-features-store';
import { logUiEvent } from '../../store/ui-audit-store';

const ACCENT = 'var(--color-protocol-graphql)';

/**
 * GraphQL URL bar — endpoint input + Connect/Disconnect button + AI Tools ⋮ menu.
 * Connect triggers schema introspection. Run is in the query editor.
 * All interactive elements use size="lg" matching REST UrlBar.
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

  const isConnecting = activeTab.authData?.['gql_connected'] === 'connecting';

  const handleSave = () => {
    logUiEvent('graphql.save', { url: activeTab.url });
    const saved = saveRequest(activeTab);
    if (saved) useTabsStore.getState().updateTab(activeTab.id, { dirty: false });
  };

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
    <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0 bg-[var(--color-panel)]">
      {/* Protocol badge */}
      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wider text-[var(--color-protocol-graphql)] bg-[color-mix(in_srgb,var(--color-protocol-graphql)_10%,transparent)]">
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
        accentColor={ACCENT}
      />

      {/* Connect/Disconnect button — size="lg" matching REST UrlBar */}
      {!isConnected ? (
        <ButtonView
          label={isConnecting ? 'Connecting...' : 'Connect'}
          variant="primary"
          size="lg"
          iconLeft={<ConnectIcon size={12} />}
          accentColor={ACCENT}
          disabled={!activeTab.url.trim() || isConnecting}
          onClick={handleConnect}
        />
      ) : (
        <ButtonView
          label="Disconnect"
          variant="primary"
          size="lg"
          iconLeft={<DisconnectIcon size={12} />}
          accentColor="var(--color-error)"
          onClick={handleDisconnect}
        />
      )}

      {/* Save DropDownButton — size="lg" matching REST UrlBar */}
      <DropDownButtonView
        label="Save"
        icon={<SaveIcon size={13} />}
        variant="secondary"
        size="lg"
        onPrimaryClick={handleSave}
        items={saveItems}
        align="right"
      />

      {/* AI Tools ⋮ menu — size="lg" matching REST UrlBar */}
      <div className="flex-shrink-0 relative" ref={overflowRef}>
        <IconButtonView
          icon={<MoreVerticalIcon size={15} />}
          title="AI tools"
          size="lg"
          active={showOverflow}
          onClick={() => {
            if (!showOverflow && overflowRef.current) {
              const rect = overflowRef.current.getBoundingClientRect();
              const spaceBelow = window.innerHeight - rect.bottom;
              setOverflowDir(spaceBelow < 180 ? 'up' : 'down');
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
            {aiEnabled('gqlFederation') && (
              <button type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11.5px] cursor-pointer transition-all text-left"
                style={{ color: 'var(--color-protocol-ai)' }}
                onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, var(--color-protocol-ai) 8%, transparent)`; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                onClick={() => { setShowFederationModal(true); setShowOverflow(false); }}
              >
                <SparkleIcon size={12} style={{ color: 'var(--color-protocol-ai)', flexShrink: 0 }} />
                Federation Explorer
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
          />
        )}
      </div>
    </div>
  );
}
