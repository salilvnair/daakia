/**
 * MqttMessageRow — Expandable message row for the MQTT log panel.
 */
import { useState } from 'react';
import { ArrowUpIcon, ArrowDownLeftIcon, ChevronDownIcon } from '../../../icons';

export interface MqttMessage {
  id: string;
  topic: string;
  payload: string;
  qos: 0 | 1 | 2;
  retain: boolean;
  direction: 'received' | 'published' | 'system';
  timestamp: number;
}

export interface MqttSubscription {
  id: string;
  topic: string;
  qos: 0 | 1 | 2;
  label: string;
  color: string;
  active: boolean;
}

function tryFormatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

export function MqttMessageRow({ message, subscriptions }: { message: MqttMessage; subscriptions: MqttSubscription[] }) {
  const [expanded, setExpanded] = useState(false);
  const time = new Date(message.timestamp).toLocaleTimeString();

  if (message.direction === 'system') {
    return (
      <div className="flex items-center gap-2 py-1 text-[11px] text-[var(--color-text-muted)] border-b border-[rgba(255,255,255,0.03)]">
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(139,92,246,0.1)] text-[var(--color-protocol-mqtt)]">SYS</span>
        <span className="flex-1 truncate">{message.payload}</span>
        <span className="text-[10px] opacity-60">{time}</span>
      </div>
    );
  }

  const sub = subscriptions.find(s => s.topic === message.topic);
  const dotColor = message.direction === 'published' ? 'var(--color-success)' : (sub?.color || 'var(--color-protocol-mqtt)');
  const dirIcon = message.direction === 'published' ? <ArrowUpIcon size={10} /> : <ArrowDownLeftIcon size={10} />;

  return (
    <div className="border-b border-[rgba(255,255,255,0.03)]">
      <div
        className="flex items-center gap-2 py-1.5 text-[11px] cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ color: dotColor }}>{dirIcon}</span>
        <span className="font-mono text-[var(--color-text-primary)] truncate max-w-[200px]">{message.topic}</span>
        {message.qos > 0 && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-[rgba(139,92,246,0.1)] text-[var(--color-protocol-mqtt)]">QoS {message.qos}</span>
        )}
        {message.retain && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-[rgba(245,158,11,0.12)] text-[var(--color-warning)]">R</span>
        )}
        <span className="flex-1 truncate text-[var(--color-text-muted)] font-mono">{message.payload}</span>
        <span className="text-[10px] text-[var(--color-text-muted)] opacity-60 flex-shrink-0">{time}</span>
        <ChevronDownIcon size={10} className={`text-[var(--color-text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>
      {expanded && (
        <div className="pl-6 pb-2">
          <pre className="text-[11px] font-mono text-[var(--color-text-primary)] bg-[rgba(0,0,0,0.2)] rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
            {tryFormatJson(message.payload)}
          </pre>
        </div>
      )}
    </div>
  );
}
