import { useTabsStore } from '../../store/tabs-store';
import { WebSocketIcon, SSEIcon, SocketIOIcon, MQTTIcon } from '../../icons';

export type RealtimeProtocol = 'websocket' | 'sse' | 'socketio' | 'mqtt';

interface ProtocolOption {
  id: RealtimeProtocol;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  color: string;
}

/*
  All four ship. The list used to carry an `available` flag with a "soon"
  badge and a disabled tab behind it; every entry has been `true` since MQTT
  landed, so what the flag actually rendered was nothing, and what it left
  behind was a disabled state nobody could reach and a reader wondering which
  of these four is real.
*/
const PROTOCOLS: ProtocolOption[] = [
  { id: 'websocket', label: 'WebSocket', icon: WebSocketIcon, color: 'var(--color-protocol-websocket)' },
  { id: 'sse', label: 'SSE', icon: SSEIcon, color: 'var(--color-protocol-sse)' },
  { id: 'socketio', label: 'Socket.IO', icon: SocketIOIcon, color: 'var(--color-protocol-socketio)' },
  { id: 'mqtt', label: 'MQTT', icon: MQTTIcon, color: 'var(--color-protocol-mqtt)' },
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
    <div className="flex items-center gap-0 px-3 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)] flex-shrink-0 overflow-x-auto overflow-y-hidden">
      {PROTOCOLS.map(p => {
        const Icon = p.icon;
        const isActive = current === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => handleSelect(p.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer border-b-2 flex-shrink-0 whitespace-nowrap ${
              isActive
                ? 'border-current'
                : 'border-transparent hover:text-[var(--color-text-primary)]'
            }`}
            style={{ color: isActive ? p.color : 'var(--color-text-muted)' }}
            title={p.label}
          >
            <Icon size={12} style={{ color: isActive ? p.color : 'var(--color-text-muted)' }} />
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
