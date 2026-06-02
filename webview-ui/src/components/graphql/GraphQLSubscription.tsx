import { useState, useEffect, useRef, useCallback } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { postMsg } from '../../vscode';
import { RadioIcon, TrashIcon, AutoScrollIcon, CopyIcon, ArrowDownLeftIcon } from '../../icons';

interface SubscriptionEvent {
  id: string;
  data: string;
  timestamp: number;
}

type SubState = 'idle' | 'connecting' | 'active' | 'completed';

/**
 * GraphQL Subscription panel — shown as a sub-tab in GraphQLEditor.
 * Uses graphql-ws protocol over WebSocket to subscribe and show live events.
 */
export function GraphQLSubscription() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const activeTabId = useTabsStore(s => s.activeTabId);

  const [subState, setSubState] = useState<SubState>('idle');
  const [events, setEvents] = useState<SubscriptionEvent[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new events
  useEffect(() => {
    if (autoScroll && events.length > 0) {
      eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, autoScroll]);

  // Listen for subscription events from extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (!activeTab || msg.tabId !== activeTab.id) return;

      switch (msg.type) {
        case 'gql:subscription:connected':
          setSubState('active');
          setError(null);
          break;
        case 'gql:subscription:data':
          setEvents(prev => [...prev, {
            id: crypto.randomUUID(),
            data: msg.data,
            timestamp: msg.timestamp,
          }]);
          break;
        case 'gql:subscription:error':
          setError(msg.error);
          setSubState('idle');
          break;
        case 'gql:subscription:complete':
          setSubState('completed');
          break;
        case 'gql:subscription:disconnected':
          setSubState('idle');
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [activeTab]);

  // Reset state when tab changes
  useEffect(() => {
    setSubState('idle');
    setEvents([]);
    setError(null);
  }, [activeTabId]);

  const handleSubscribe = useCallback(() => {
    if (!activeTab) return;
    const endpoint = activeTab.url.trim();
    const query = activeTab.bodyRaw?.trim();
    if (!endpoint || !query) return;

    setSubState('connecting');
    setError(null);
    setEvents([]);

    postMsg({
      type: 'gql:subscribe',
      tabId: activeTab.id,
      endpoint,
      query,
      variables: activeTab.authData?.['gql_variables'] || '',
      headers: activeTab.headers.filter(h => h.enabled && h.key),
      envId: activeTab.envId,
    });
  }, [activeTab]);

  const handleUnsubscribe = useCallback(() => {
    if (!activeTab) return;
    postMsg({ type: 'gql:unsubscribe', tabId: activeTab.id });
    setSubState('idle');
  }, [activeTab]);

  const handleClear = useCallback(() => {
    setEvents([]);
  }, []);

  const handleCopyEvent = useCallback((data: string) => {
    try {
      const formatted = JSON.stringify(JSON.parse(data), null, 2);
      navigator.clipboard.writeText(formatted);
    } catch {
      navigator.clipboard.writeText(data);
    }
  }, []);

  if (!activeTab) return null;

  const canSubscribe = subState === 'idle' || subState === 'completed';
  const isActive = subState === 'active' || subState === 'connecting';

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)]">
        <div className="flex items-center gap-2">
          <RadioIcon size={12} className="text-[var(--color-protocol-graphql)]" />
          <span className="text-[11px] font-medium text-[var(--color-text-muted)]">Subscription</span>
          {subState === 'active' && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--color-success)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
              Live
            </span>
          )}
          {subState === 'connecting' && (
            <span className="text-[10px] text-[var(--color-warning)]">Connecting...</span>
          )}
          {subState === 'completed' && (
            <span className="text-[10px] text-[var(--color-text-muted)]">Completed</span>
          )}
          {events.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'color-mix(in srgb, #E535AB 15%, transparent)', color: '#E535AB' }}>
              {events.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Subscribe/Unsubscribe */}
          {canSubscribe ? (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={!activeTab.url.trim() || !activeTab.bodyRaw?.trim()}
              className="h-[26px] px-2.5 text-[11px] font-medium text-[var(--color-success)] hover:bg-[rgba(34,197,94,0.08)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center gap-1.5 rounded-md"
            >
              <RadioIcon size={11} />
              Subscribe
            </button>
          ) : (
            <button
              type="button"
              onClick={handleUnsubscribe}
              className="h-[26px] px-2.5 text-[11px] font-medium text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors flex items-center gap-1.5 rounded-md"
            >
              <RadioIcon size={11} />
              Stop
            </button>
          )}

          {/* Auto-scroll toggle */}
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
            className={`h-[26px] w-[26px] flex items-center justify-center rounded-md cursor-pointer transition-colors ${
              autoScroll ? 'text-[var(--color-protocol-graphql)] bg-[rgba(229,53,171,0.08)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
            }`}
          >
            <AutoScrollIcon size={12} />
          </button>

          {/* Clear */}
          <button
            type="button"
            onClick={handleClear}
            disabled={events.length === 0}
            title="Clear events"
            className="h-[26px] w-[26px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors flex items-center justify-center rounded-md"
          >
            <TrashIcon size={12} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-3 py-2 text-[11px] text-[var(--color-error)] bg-[rgba(239,68,68,0.06)] border-b border-[var(--color-surface-border)]">
          {error}
        </div>
      )}

      {/* Events log */}
      <div ref={logContainerRef} className="flex-1 overflow-y-auto [scrollbar-gutter:stable] min-h-0">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] text-[12px] gap-2 px-4 text-center">
            <RadioIcon size={24} className="opacity-30" />
            <p>No subscription events yet</p>
            <p className="text-[11px] opacity-70">Write a subscription query and click Subscribe to start receiving live events</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-surface-border)]">
            {events.map((evt) => (
              <div key={evt.id} className="group px-3 py-2 hover:bg-[var(--color-hover)] transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <ArrowDownLeftIcon size={10} className="text-[var(--color-protocol-graphql)]" />
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      {new Date(evt.timestamp).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyEvent(evt.data)}
                    className="h-[20px] w-[20px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] opacity-0 group-hover:opacity-100 cursor-pointer transition-all flex items-center justify-center rounded"
                    title="Copy event data"
                  >
                    <CopyIcon size={10} />
                  </button>
                </div>
                <pre className="text-[11px] text-[var(--color-text-primary)] font-mono whitespace-pre-wrap break-all leading-relaxed">
                  {formatEventData(evt.data)}
                </pre>
              </div>
            ))}
            <div ref={eventsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}

function formatEventData(data: string): string {
  try {
    return JSON.stringify(JSON.parse(data), null, 2);
  } catch {
    return data;
  }
}
