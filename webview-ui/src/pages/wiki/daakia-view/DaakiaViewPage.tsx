import { useState } from 'react';
import { SideNavView, type SideNavItem } from '@salilvnair/dui';
import { QuickStartView } from './platform/QuickStartView';
import { RestView } from './rest/RestView';
import { GqlView } from './gql/GqlView';
import { WebSocketView } from './websocket/WebSocketView';
import { GrpcView } from './grpc/GrpcView';
import { SoapView } from './soap/SoapView';
import { MockServerView } from './mock-server/MockServerView';
import { CollectionsEnvView } from './platform/CollectionsEnvView';
import { AiAssistantView } from './platform/AiAssistantView';
import { SettingsView } from './platform/SettingsView';
import { Dk8sOverviewView } from './dk8s/Dk8sOverviewView';
import { Dk8sPodView } from './dk8s/Dk8sPodView';
import { Dk8sSearchView } from './dk8s/Dk8sSearchView';
import { Dk8sDoctorView } from './dk8s/Dk8sDoctorView';
import { Dk8sArchiveView } from './dk8s/Dk8sArchiveView';
import { Dk8sCommandsView } from './dk8s/Dk8sCommandsView';
import { Dk8sViewsView } from './dk8s/Dk8sViewsView';
import {
  DocumentIcon, ProtocolRestBadge, ProtocolGraphQLBadge, ProtocolRealtimeBadge,
  ProtocolGrpcBadge, ProtocolSoapBadge, ServerIcon, CollectionsFolderIcon,
  GeneralAssistantIcon, SettingsIcon, Dk8sIcon, SearchIcon, StethoscopeIcon,
  FolderOpenIcon, TerminalIcon, LayersIcon,
} from '../../../icons';

// ─── Wiki tabs ──────────────────────────────────────────────────────────────

export type TabId = 'quick-start' | 'rest' | 'gql' | 'websocket' | 'grpc' | 'soap' | 'mock-server' | 'collections-env' | 'ai-assistant' | 'settings' | 'dk8s' | 'dk8s-pod' | 'dk8s-search' | 'dk8s-doctor' | 'dk8s-archive' | 'dk8s-commands' | 'dk8s-views';

interface Tab {
  id: TabId;
  label: string;
  color: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { id: 'quick-start',      label: 'Quick Start',       color: 'var(--color-accent)',             icon: <DocumentIcon size={15} /> },
  { id: 'rest',              label: 'REST API',          color: 'var(--color-protocol-rest)',      icon: <ProtocolRestBadge size={16} /> },
  { id: 'gql',               label: 'GraphQL',           color: 'var(--color-protocol-graphql)',   icon: <ProtocolGraphQLBadge size={16} /> },
  { id: 'websocket',         label: 'WebSocket',         color: 'var(--color-protocol-websocket)', icon: <ProtocolRealtimeBadge size={16} /> },
  { id: 'grpc',              label: 'gRPC',              color: 'var(--color-protocol-grpc)',      icon: <ProtocolGrpcBadge size={16} /> },
  { id: 'soap',              label: 'SOAP',              color: 'var(--color-protocol-soap)',      icon: <ProtocolSoapBadge size={16} /> },
  { id: 'mock-server',       label: 'Mock Server',       color: 'var(--color-mock-server)',        icon: <ServerIcon size={15} /> },
  { id: 'collections-env',   label: 'Collections & Env', color: 'var(--color-accent)',             icon: <CollectionsFolderIcon size={15} /> },
  { id: 'ai-assistant',      label: 'AI Assistant',      color: 'var(--color-protocol-ai)',        icon: <GeneralAssistantIcon size={15} /> },
  { id: 'settings',          label: 'Settings',          color: 'var(--color-accent)',             icon: <SettingsIcon size={15} /> },
  { id: 'dk8s',              label: 'Overview',          color: 'var(--color-dk8s)',               icon: <Dk8sIcon size={15} /> },
  { id: 'dk8s-pod',          label: 'Pod Detail',        color: 'var(--color-dk8s)',               icon: <LayersIcon size={15} /> },
  { id: 'dk8s-search',       label: 'Log Search',        color: 'var(--color-dk8s)',               icon: <SearchIcon size={15} /> },
  { id: 'dk8s-doctor',       label: 'Doctor & Artifacts', color: 'var(--color-doctor)',            icon: <StethoscopeIcon size={15} /> },
  { id: 'dk8s-views',        label: 'Every View',        color: 'var(--color-doctor)',             icon: <LayersIcon size={15} /> },
  { id: 'dk8s-archive',      label: 'Archived Logs',     color: 'var(--color-dk8s)',               icon: <FolderOpenIcon size={15} /> },
  { id: 'dk8s-commands',     label: 'Behind the Scenes', color: 'var(--color-dk8s)',               icon: <TerminalIcon size={15} /> },
];

const TAB_BY_ID = Object.fromEntries(TABS.map(t => [t.id, t]));

/** Flat {id, label, icon} list — for hosts (e.g. SettingsPanel) that want to nest these as their own group's children instead of rendering DaakiaViewPage's own SideNavView. */
export const WIKI_TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = TABS.map(t => ({ id: t.id, label: t.label, icon: t.icon }));

/** Full {id, label, color, icon} list — used by QuickStartView to render clickable
 * "go to this tab" cards with the exact same color/icon every other nav surface uses. */
export const WIKI_TABS_FULL: Tab[] = TABS;

const NAV_ITEMS: SideNavItem[] = [
  { id: 'g-start', label: 'Get Started', isGroup: true, children: [
    { id: 'quick-start', label: TAB_BY_ID['quick-start'].label, icon: TAB_BY_ID['quick-start'].icon },
  ] },
  { id: 'g-protocols', label: 'Protocols', isGroup: true, children: [
    { id: 'rest', label: TAB_BY_ID['rest'].label, icon: TAB_BY_ID['rest'].icon },
    { id: 'gql', label: TAB_BY_ID['gql'].label, icon: TAB_BY_ID['gql'].icon },
    { id: 'websocket', label: TAB_BY_ID['websocket'].label, icon: TAB_BY_ID['websocket'].icon },
    { id: 'grpc', label: TAB_BY_ID['grpc'].label, icon: TAB_BY_ID['grpc'].icon },
    { id: 'soap', label: TAB_BY_ID['soap'].label, icon: TAB_BY_ID['soap'].icon },
    { id: 'mock-server', label: TAB_BY_ID['mock-server'].label, icon: TAB_BY_ID['mock-server'].icon },
  ] },
  { id: 'g-platform', label: 'Platform', isGroup: true, children: [
    { id: 'collections-env', label: TAB_BY_ID['collections-env'].label, icon: TAB_BY_ID['collections-env'].icon },
    { id: 'ai-assistant', label: TAB_BY_ID['ai-assistant'].label, icon: TAB_BY_ID['ai-assistant'].icon },
    { id: 'settings', label: TAB_BY_ID['settings'].label, icon: TAB_BY_ID['settings'].icon },
  ] },
  // Its own group rather than a Platform child: dk8s is a different surface
  // from the request tabs, and filing it under "Platform" alongside Settings
  // would bury the one page that explains how a search decides what to read.
  { id: 'g-dk8s', label: 'dk8s (Kubernetes)', isGroup: true, children: [
    { id: 'dk8s', label: TAB_BY_ID['dk8s'].label, icon: TAB_BY_ID['dk8s'].icon },
    { id: 'dk8s-pod', label: TAB_BY_ID['dk8s-pod'].label, icon: TAB_BY_ID['dk8s-pod'].icon },
    { id: 'dk8s-search', label: TAB_BY_ID['dk8s-search'].label, icon: TAB_BY_ID['dk8s-search'].icon },
    { id: 'dk8s-doctor', label: TAB_BY_ID['dk8s-doctor'].label, icon: TAB_BY_ID['dk8s-doctor'].icon },
    { id: 'dk8s-views', label: TAB_BY_ID['dk8s-views'].label, icon: TAB_BY_ID['dk8s-views'].icon },
    { id: 'dk8s-archive', label: TAB_BY_ID['dk8s-archive'].label, icon: TAB_BY_ID['dk8s-archive'].icon },
    { id: 'dk8s-commands', label: TAB_BY_ID['dk8s-commands'].label, icon: TAB_BY_ID['dk8s-commands'].icon },
  ] },
];

// ─── Component ───────────────────────────────────────────────────────────────

interface DaakiaViewPageProps {
  /** When true, suppresses this component's own SideNavView — the host (e.g. SettingsPanel, nesting WIKI_TABS into its own unified nav) drives activeId/onSelect instead, avoiding two independent nav columns rendered side by side. */
  hideNav?: boolean;
  activeId?: TabId;
  onSelect?: (id: TabId) => void;
}

export function DaakiaViewPage({ hideNav, activeId: activeIdProp, onSelect: onSelectProp }: DaakiaViewPageProps = {}) {
  const [activeIdState, setActiveIdState] = useState<TabId>('quick-start');
  const activeId = activeIdProp ?? activeIdState;
  const onSelect = onSelectProp ?? setActiveIdState;
  const active = TAB_BY_ID[activeId];

  return (
    <div className="flex h-full overflow-hidden bg-[var(--color-panel)]" style={{ '--color-accent': active.color } as React.CSSProperties}>

      {/* ── Docs-style left nav (suppressed in embedded/hideNav mode) ───── */}
      {!hideNav && (
        <SideNavView
          items={NAV_ITEMS}
          activeId={activeId}
          onSelect={(id) => onSelect(id as TabId)}
          defaultOpenIds={['g-start', 'g-protocols', 'g-platform', 'g-dk8s']}
          width={196}
          accentColor={active.color}
          searchable
          searchPlaceholder="Search wiki..."
          size="sm"
          className="flex-shrink-0 border-r border-[var(--color-surface-border)]"
        />
      )}

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {/* dw-root defines every --dw-* color variable (WikiShared.css) that
          section cards/callouts/badges/hero depend on — without it those
          rules resolve against unset custom properties (invalid border/
          background, not just "default styled"), which is why the wiki
          previously rendered as borderless, backgroundless floating text. */}
      <div className="dw-root flex-1 overflow-hidden relative min-w-0">
        {activeId === 'quick-start'    && <QuickStartView onNavigate={onSelect} />}
        {activeId === 'rest'           && <RestView />}
        {activeId === 'gql'            && <GqlView />}
        {activeId === 'websocket'      && <WebSocketView />}
        {activeId === 'grpc'           && <GrpcView />}
        {activeId === 'soap'           && <SoapView />}
        {activeId === 'mock-server'    && <MockServerView />}
        {activeId === 'collections-env' && <CollectionsEnvView />}
        {activeId === 'ai-assistant'   && <AiAssistantView />}
        {activeId === 'settings'       && <SettingsView />}
        {activeId === 'dk8s'           && <Dk8sOverviewView />}
        {activeId === 'dk8s-pod'       && <Dk8sPodView />}
        {activeId === 'dk8s-search'    && <Dk8sSearchView />}
        {activeId === 'dk8s-doctor'    && <Dk8sDoctorView />}
        {activeId === 'dk8s-views'     && <Dk8sViewsView />}
        {activeId === 'dk8s-archive'   && <Dk8sArchiveView />}
        {activeId === 'dk8s-commands'  && <Dk8sCommandsView />}
      </div>

    </div>
  );
}
