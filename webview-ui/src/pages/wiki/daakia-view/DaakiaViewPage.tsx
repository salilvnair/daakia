import { useState, useRef, useLayoutEffect, useCallback } from 'react';
import { RestView } from './rest/RestView';
import { GqlView } from './gql/GqlView';
import { WebSocketView } from './websocket/WebSocketView';
import { GrpcView } from './grpc/GrpcView';
import { SoapView } from './soap/SoapView';
import { MockServerView } from './mock-server/MockServerView';

// ─── Protocol tabs ──────────────────────────────────────────────────────────

type ProtocolId = 'rest' | 'gql' | 'websocket' | 'grpc' | 'soap' | 'mock-server';

interface Protocol {
  id: ProtocolId;
  label: string;
  color: string;
  ready: boolean;
}

const PROTOCOLS: Protocol[] = [
  { id: 'rest',        label: 'REST API',     color: 'var(--color-protocol-rest)',      ready: true  },
  { id: 'gql',         label: 'GraphQL',      color: 'var(--color-protocol-graphql)',   ready: false },
  { id: 'websocket',   label: 'WebSocket',    color: 'var(--color-protocol-websocket)', ready: false },
  { id: 'grpc',        label: 'gRPC',         color: 'var(--color-protocol-grpc)',      ready: false },
  { id: 'soap',        label: 'SOAP',         color: 'var(--color-protocol-soap)',      ready: false },
  { id: 'mock-server', label: 'Mock Server',  color: 'var(--color-mock-server)',        ready: false },
];

// ─── Original app dimensions (what the capture was taken at) ──────────────────

// left nav = 48px, right nav ≈ 431px (383 panel + 48 icon rail), resizer = 6px
// center = flexible; total design width we use for scale calculation
const DESIGN_WIDTH  = 1280;
const DESIGN_HEIGHT = 720;

// ─── Component ───────────────────────────────────────────────────────────────

export function DaakiaViewPage() {
  const [activeId, setActiveId] = useState<ProtocolId>('rest');
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const updateScale = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const availW = el.clientWidth;
    const availH = el.clientHeight;
    const scaleW = availW / DESIGN_WIDTH;
    const scaleH = availH / DESIGN_HEIGHT;
    setScale(Math.min(scaleW, scaleH, 1));
  }, []);

  useLayoutEffect(() => {
    updateScale();
    const ro = new ResizeObserver(updateScale);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [updateScale]);

  const active = PROTOCOLS.find(p => p.id === activeId)!;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--color-panel)]">

      {/* ── Protocol tab bar ──────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-0 px-3 border-b border-[var(--color-surface-border)] flex-shrink-0"
        style={{ backgroundColor: 'var(--color-panel)' }}
      >
        {PROTOCOLS.map(p => {
          const isActive = p.id === activeId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveId(p.id)}
              className="relative flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium cursor-pointer transition-colors"
              style={{
                color: isActive ? p.color : 'var(--color-text-muted)',
                borderBottom: isActive ? `2px solid ${p.color}` : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {p.label}
              {!p.ready && (
                <span
                  className="text-[9px] px-1 py-0.5 rounded font-medium"
                  style={{
                    background: 'color-mix(in srgb, var(--color-text-muted) 10%, transparent)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  soon
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Scaled preview container ─────────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative">

        {/* Scale wrapper: inner div is full design size, scaled to fit */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: DESIGN_WIDTH,
            height: DESIGN_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            // accent variable — resolves color-mix in children
            '--color-accent': active.color,
          } as React.CSSProperties}
        >
          <div className="flex h-full w-full overflow-hidden">
            {activeId === 'rest'        && <RestView />}
            {activeId === 'gql'         && <GqlView />}
            {activeId === 'websocket'   && <WebSocketView />}
            {activeId === 'grpc'        && <GrpcView />}
            {activeId === 'soap'        && <SoapView />}
            {activeId === 'mock-server' && <MockServerView />}
          </div>
        </div>

        {/* Ghost fill so the container reports correct height to ResizeObserver */}
        <div
          style={{
            width: DESIGN_WIDTH * scale,
            height: DESIGN_HEIGHT * scale,
            pointerEvents: 'none',
          }}
        />
      </div>

    </div>
  );
}
