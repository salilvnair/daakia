/**
 * AiSessionExportModal — Export AI conversation as a markdown report.
 * Task 10.8 — AI Session Export · Exports prompts, responses, generated requests.
 */
import { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { SparkleIcon, DownloadIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { ModalView, CopyButtonView, ButtonView } from '@salilvnair/dui';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

export function AiSessionExportModal({ onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');

  useEffect(() => { generateReport(); }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setReport(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setLoading(false); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'Export failed'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const generateReport = () => {
    if (!activeTab || loading) return;
    streamRef.current = ''; setReport(''); setError(''); setLoading(true);
    postMsg({
      type: 'aiChat',
      tabId: activeTab.id,
      messages: [{
        role: 'user',
        content: `Generate a structured markdown report of this AI conversation session. Include:

# Daakia AI Session Export
- Date: ${new Date().toLocaleString()}
- Session Summary: brief overview of what was accomplished

## Topics Discussed
List main API topics, protocols, or endpoints discussed

## Generated Artifacts
List any API requests, test scripts, mock configurations, or code generated

## Key Insights
3-5 key findings or recommendations from the conversation

## Next Steps
Suggested follow-up actions

Format as clean, shareable markdown that can be saved as a .md file or pasted into documentation.`,
      }],
      stream: true,
    });
  };

  const handleDownload = () => {
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daakia-ai-session-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="Export Session ✦"
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        report ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <CopyButtonView text={report} title="Copy" size="md" accentColor={ACCENT} />
            <ButtonView size="md" variant="secondary" onClick={handleDownload}>
              <DownloadIcon size={12} style={{ marginRight: 4 }} />Download .md
            </ButtonView>
          </div>
        ) : undefined
      }
    >
      {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
      {loading && !report && <p className="text-[11px] animate-pulse text-center py-12" style={{ color: ACCENT }}>Generating session report…</p>}
      {report && (
        <pre className="text-[11.5px] font-mono whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
          {report}
        </pre>
      )}
    </ModalView>
  );
}
