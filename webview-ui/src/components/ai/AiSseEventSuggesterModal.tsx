/**
 * AiSseEventSuggesterModal — AI suggests related SSE event types to subscribe to.
 * Task 9.16 — SSE Event Suggester ✦ · Gate: sseEventSuggester
 */
import { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView } from '@salilvnair/dui';

interface Props {
  observedEventTypes: string[];
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

export function AiSseEventSuggesterModal({ observedEventTypes, onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [suggestions, setSuggestions] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');

  useEffect(() => { startSuggest(); }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setSuggestions(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setLoading(false); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'AI request failed'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const startSuggest = () => {
    if (!activeTab || loading) return;
    const eventList = observedEventTypes.length > 0 ? observedEventTypes.join(', ') : 'message (default)';
    streamRef.current = ''; setSuggestions(''); setError(''); setLoading(true);
    postMsg({
      type: 'aiChat',
      tabId: activeTab.id,
      messages: [{ role: 'user', content: `You are an SSE (Server-Sent Events) expert. The user is receiving these SSE event types from ${activeTab.url || 'an SSE endpoint'}: ${eventList}. Suggest 6-10 related event types they should look for or listen to. Consider: retry events, heartbeat/ping events, error events, auth refresh events, pagination cursor events. Explain what each suggested event type would signal and how to handle it. Format as a numbered list with clear descriptions.` }],
      stream: true,
    });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="Event Suggester"
      size="md"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
    >
      {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
      {loading && !suggestions && <p className="text-[11px] animate-pulse text-center py-12" style={{ color: ACCENT }}>Analyzing event stream…</p>}
      {suggestions && <MdViewer content={suggestions} />}
    </ModalView>
  );
}
