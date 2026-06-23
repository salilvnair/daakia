/**
 * AiMqttTopicSuggesterModal — AI suggests related MQTT topic patterns.
 * Task 9.22 — MQTT Topic Suggester ✦ · Gate: mqttTopicSuggester
 */
import { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView } from '@salilvnair/dui';

interface Props {
  subscribedTopics: string[];
  onClose: () => void;
  onSubscribe?: (topic: string) => void;
}

const ACCENT = 'var(--color-protocol-mqtt)';

export function AiMqttTopicSuggesterModal({ subscribedTopics, onClose, onSubscribe }: Props) {
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
    const topicList = subscribedTopics.join(', ') || 'none';
    streamRef.current = ''; setSuggestions(''); setError(''); setLoading(true);
    postMsg({
      type: 'aiChat',
      tabId: activeTab.id,
      messages: [{ role: 'user', content: `You are an MQTT expert. The user is subscribed to these topics: ${topicList}. Suggest 8-12 related topic patterns they should also consider, including wildcards (+ and #), parent topics, sibling topics, and common IoT hierarchies. For each suggestion explain why it's useful. Format as a numbered list.` }],
      stream: true,
    });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="Topic Suggester ✦"
      size="md"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
    >
      {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
      {loading && !suggestions && <p className="text-[11px] animate-pulse text-center py-12" style={{ color: ACCENT }}>Analyzing topic hierarchy…</p>}
      {suggestions && <MdViewer content={suggestions} />}
    </ModalView>
  );
}
