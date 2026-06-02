import { useTabsStore } from '../../store/tabs-store';
import { WebSocketIcon, SSEIcon, SocketIOIcon, MQTTIcon } from '../../icons';

export type RealtimeProtocol = 'websocket' | 'sse' | 'socketio' | 'mqtt';

interface ProtocolOption {
  id: RealtimeProtocol;
  label: string;
  available: boolean;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  color: string;
}

const PROTOCOLS: ProtocolOption[] = [
  { id: 'websocket', label: 'WebSocket', available: true, icon: WebSocketIcon, color: 'var(--color-protocol-websocket)' },
  { id: 'sse', label: 'SSE', available: true, icon: SSEIcon, color: 'var(--color-protocol-sse)' },
  { id: 'socketio', label: 'Socket.IO', available: true, icon: SocketIOIcon, color: 'var(--color-protocol-socketio)' },
  { id: 'mqtt', label: 'MQTT', available: true, icon: MQTTIcon, color: 'var(--color-protocol-mqtt)' },
];

/**
 * Realtime Protocol Selector — icon tabs for switching between WebSocket, SSE, Socket.IO, MQTT.
 * Stored in tab.authData['rt_protocol']. Default: 'websocket'.
 */
export function RealtimeProtocolSelector() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  if (!activeTab) return null;

  const current: RealtimeProtocol = (activeTab.authData?.['rt_protocol'] as RealtimeProtocol) || 'websocket';

  const handleSelect = (protocol: RealtimeProtocol) => {
    if (!activeTab) return;
    // Save current URL to authData keyed by current protocol, restore new protocol's URL
    const currentUrl = activeTab.url || '';
    const savedUrl = activeTab.authData?.[`${protocol}_url`] || '';
    updateTab(activeTab.id, {
      url: savedUrl,
      authData: { ...activeTab.authData, rt_protocol: protocol, [`${current}_url`]: currentUrl },
    });
  };

  return (
    <div className="flex items-center gap-0 px-3 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)] flex-shrink-0">
      {PROTOCOLS.map(p => {
        const Icon = p.icon;
        const isActive = current === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => p.available && handleSelect(p.id)}
            disabled={!p.available}
            className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer border-b-2 ${
              isActive
                ? 'border-current'
                : 'border-transparent hover:text-[var(--color-text-primary)]'
            } ${!p.available ? 'opacity-40 cursor-not-allowed' : ''}`}
            style={{ color: isActive ? p.color : 'var(--color-text-muted)' }}
            title={p.available ? p.label : `${p.label} (coming soon)`}
          >
            <Icon size={12} style={{ color: isActive ? p.color : 'var(--color-text-muted)' }} />
            {p.label}
            {!p.available && (
              <span className="ml-0.5 text-[9px] opacity-60">soon</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
