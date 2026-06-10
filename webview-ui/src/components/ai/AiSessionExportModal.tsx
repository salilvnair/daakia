/**
 * AiSessionExportModal — Export AI conversation as a markdown report.
 * Task 10.8 — AI Session Export · Exports prompts, responses, generated requests.
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTabsStore } from '../../store/tabs-store';
import { CloseIcon, SparkleIcon, DownloadIcon, CopyIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

export function AiSessionExportModal({ onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
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

  const handleCopy = () => {
    navigator.clipboard.writeText(report).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onMouseDown={e => e.stopPropagation()}>
      <div className="relative flex flex-col rounded-2xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--color-panel)', borderColor: `color-mix(in srgb, ${ACCENT} 30%, var(--color-surface-border))`, width: 620, maxHeight: '82vh' }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex items-center gap-2">
            <SparkleIcon size={14} style={{ color: ACCENT }} />
            <span className="text-[13px] font-semibold" style={{ color: ACCENT }}>Export Session ✦</span>
          </div>
          <div className="flex items-center gap-2">
            {report && (
              <>
                <button type="button" onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-all" style={{ color: copied ? 'var(--color-success)' : ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 10%, transparent)` }}>
                  {copied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}{copied ? 'Copied!' : 'Copy'}
                </button>
                <button type="button" onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-all" style={{ color: ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 10%, transparent)` }}>
                  <DownloadIcon size={11} />Download .md
                </button>
              </>
            )}
            <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-[var(--color-hover)] cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
              <CloseIcon size={13} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-5 min-h-0">
          {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
          {loading && !report && <p className="text-[11px] animate-pulse text-center py-12" style={{ color: ACCENT }}>Generating session report…</p>}
          {report && (
            <pre className="text-[11.5px] font-mono whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
              {report}
            </pre>
          )}
        </div>
        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[var(--color-hover)]" style={{ color: 'var(--color-text-muted)' }}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
