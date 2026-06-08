/**
 * DaakiaWikiPanel.tsx — Comprehensive Daakia Feature Wiki
 * Styled after dmcr_copilot WikiPanel — adapted for Daakia color system
 */
import { useState, useRef, useCallback } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../../../icons';
import './DaakiaWikiPanel.css';
import { QuickStartSection, RestApiSection, CollectionsSection, EnvironmentsSection } from './WikiSection1';
import { HistorySection, AuthSection, ScriptsSection, CookiesSection, TimelineSection } from './WikiSection2';
import { GraphQLSection, WebSocketSection, GrpcSection, SoapSection } from './WikiSection3';
import { MockServerSection, AiAssistantSection, SettingsSection } from './WikiSection4';

// ─── TOC definition ──────────────────────────────────────────────────────────
const TOC_ITEMS = [
  { id: 'quick-start',  emoji: '🚀', label: 'Quick Start' },
  { id: 'rest-api',     emoji: '📡', label: 'REST API' },
  { id: 'collections',  emoji: '📁', label: 'Collections' },
  { id: 'environments', emoji: '🌿', label: 'Environments' },
  { id: 'sep1',         emoji: '',   label: '---' },
  { id: 'history',      emoji: '🕐', label: 'History' },
  { id: 'auth',         emoji: '🔒', label: 'Authentication' },
  { id: 'scripts',      emoji: '📝', label: 'Scripts & Tests' },
  { id: 'cookies',      emoji: '🍪', label: 'Cookies' },
  { id: 'timeline',     emoji: '⏱️', label: 'Timeline' },
  { id: 'sep2',         emoji: '',   label: '---' },
  { id: 'graphql',      emoji: '🔷', label: 'GraphQL' },
  { id: 'websocket',    emoji: '🟢', label: 'WebSocket' },
  { id: 'grpc',         emoji: '🟣', label: 'gRPC' },
  { id: 'soap',         emoji: '🪪', label: 'SOAP' },
  { id: 'sep3',         emoji: '',   label: '---' },
  { id: 'mock-server',  emoji: '🎭', label: 'Mock Server' },
  { id: 'ai-assistant', emoji: '🤖', label: 'AI Assistant' },
  { id: 'settings',     emoji: '⚙️', label: 'Settings' },
] as const;

type SectionId = typeof TOC_ITEMS[number]['id'];

// ─── Component ────────────────────────────────────────────────────────────────
export function DaakiaWikiPanel() {
  const [activeId, setActiveId] = useState<SectionId>('quick-start');
  const [tocCollapsed, setTocCollapsed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const scrollToSection = useCallback((id: SectionId) => {
    if (id.startsWith('sep')) return;
    setActiveId(id);
    const el = contentRef.current?.querySelector(`#${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const scrollToTop = useCallback(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setActiveId('quick-start');
  }, []);

  return (
    <div className="dw-root">
      {/* ── Left TOC ─────────────────────────────────── */}
      <div className="dw-toc-wrap" style={tocCollapsed ? { width: 40 } : undefined}>
        <div className="dw-toc-header" style={{ display: 'flex', alignItems: 'center', gap: 4, paddingRight: 4 }}>
          {!tocCollapsed && <span style={{ flex: 1 }}>Daakia Wiki</span>}
          <button
            type="button"
            title={tocCollapsed ? 'Show navigation' : 'Hide navigation'}
            onClick={() => setTocCollapsed(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: 4, cursor: 'pointer',
              color: 'var(--dw-muted)', background: 'transparent', border: 'none',
              flexShrink: 0, marginLeft: 'auto',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {tocCollapsed ? <ChevronRightIcon size={12} /> : <ChevronLeftIcon size={12} />}
          </button>
        </div>
        {!tocCollapsed && (
          <div className="dw-toc-list">
            {TOC_ITEMS.map((item) => {
              if (item.label === '---') return <div key={item.id} className="dw-toc-sep" />;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`dw-toc-item${activeId === item.id ? ' active' : ''}`}
                  onClick={() => scrollToSection(item.id)}
                >
                  <span className="dw-toc-emoji">{item.emoji}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
        {tocCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', paddingTop: 4, gap: 2 }}>
            {TOC_ITEMS.filter(i => i.label !== '---').map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.label}
                className={`dw-toc-item${activeId === item.id ? ' active' : ''}`}
                onClick={() => scrollToSection(item.id)}
                style={{ justifyContent: 'center', padding: '5px 0' }}
              >
                <span className="dw-toc-emoji" style={{ marginRight: 0 }}>{item.emoji}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Right Content ─────────────────────────────── */}
      <div className="dw-content" ref={contentRef}>
        {/* Hero */}
        <div className="dw-hero">
          <h1 className="dw-hero-title">Daakia — Complete API Workspace</h1>
          <p className="dw-hero-subtitle">
            REST · GraphQL · WebSocket · gRPC · SOAP · Mock Servers · AI Assistant · Scripts · OAuth 2.0
          </p>
          <div className="dw-hero-chips">
            {[
              { label: '8 Protocols', color: 'var(--dw-accent)', bg: 'color-mix(in srgb, var(--dw-accent) 12%, transparent)', border: 'color-mix(in srgb, var(--dw-accent) 30%, transparent)' },
              { label: '8 AI Agents', color: 'var(--dw-ai)', bg: 'color-mix(in srgb, var(--dw-ai) 12%, transparent)', border: 'color-mix(in srgb, var(--dw-ai) 30%, transparent)' },
              { label: 'Mock Server', color: 'var(--dw-mock)', bg: 'color-mix(in srgb, var(--dw-mock) 12%, transparent)', border: 'color-mix(in srgb, var(--dw-mock) 30%, transparent)' },
              { label: 'SQLite Storage', color: 'var(--dw-settings)', bg: 'color-mix(in srgb, var(--dw-settings) 12%, transparent)', border: 'color-mix(in srgb, var(--dw-settings) 30%, transparent)' },
              { label: 'Scripts & Tests', color: 'var(--dw-rest)', bg: 'color-mix(in srgb, var(--dw-rest) 12%, transparent)', border: 'color-mix(in srgb, var(--dw-rest) 30%, transparent)' },
            ].map(chip => (
              <span key={chip.label} className="dw-hero-chip" style={{ color: chip.color, background: chip.bg, borderColor: chip.border }}>
                {chip.label}
              </span>
            ))}
          </div>
        </div>

        {/* Sections */}
        <QuickStartSection />
        <RestApiSection />
        <CollectionsSection />
        <EnvironmentsSection />
        <HistorySection />
        <AuthSection />
        <ScriptsSection />
        <CookiesSection />
        <TimelineSection />
        <GraphQLSection />
        <WebSocketSection />
        <GrpcSection />
        <SoapSection />
        <MockServerSection />
        <AiAssistantSection />
        <SettingsSection />

        {/* Footer */}
        <div style={{ padding: '16px 24px 24px', fontSize: 11, color: 'var(--dw-muted)', textAlign: 'center' }}>
          Daakia — Built with ❤️ for developers. Send your first request and explore.
        </div>
      </div>

      {/* Back to top FAB */}
      <button type="button" className="dw-fab" onClick={scrollToTop} title="Back to top">
        ↑
      </button>
    </div>
  );
}
