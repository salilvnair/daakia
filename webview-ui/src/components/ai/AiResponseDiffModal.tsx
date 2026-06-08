/**
 * AiResponseDiffModal — compare two API responses with AI (4.4.4)
 *
 * Response A is auto-filled from the current tab's last response.
 * Response B is pasted by the user (or vice versa).
 * AI explains what changed and why it might matter.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { CloseIcon, SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';

interface Props {
  currentResponseBody: string;
  method?: string;
  url?: string;
  onClose: () => void;
}

const ACCENT = 'var(--color-warning)';

export function AiResponseDiffModal({ currentResponseBody, method, url, onClose }: Props) {
  const [responseA, setResponseA] = useState(currentResponseBody);
  const [responseB, setResponseB] = useState('');
  const [labelA, setLabelA] = useState('Current Response');
  const [labelB, setLabelB] = useState('Comparison Response');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState('');
  const [error, setError] = useState('');

  const accRef = useRef('');
  const reqIdRef = useRef('');
  const resolve = useAiPromptTemplatesStore(s => s.resolve);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;

      if (msg.type === 'ai:chunk') {
        const delta = (msg.delta as string) || (msg.text as string) || '';
        accRef.current += delta;
        setAnalysis(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        const msgPayload = msg.message as Record<string, unknown> | undefined;
        const content = accRef.current || (msgPayload?.content as string) || '';
        setAnalysis(content);
        setLoading(false);
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'Analysis failed.');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleCompare = () => {
    if (!responseA.trim() || !responseB.trim()) {
      setError('Both responses are required.');
      return;
    }
    setLoading(true);
    setAnalysis('');
    setError('');
    accRef.current = '';

    const pid = `ai-diff-${Date.now()}`;
    reqIdRef.current = pid;

    const systemPrompt = resolve('rest.response.diff.system');
    const userPrompt = resolve('rest.response.diff', {
      labelA,
      responseA: responseA.slice(0, 3000),
      labelB,
      responseB: responseB.slice(0, 3000),
    });

    postMsg({
      type: 'ai:send',
      tabId: pid,
      provider: '', model: '', baseUrl: '',
      stage: 'rest.response.diff',
      systemPrompts: [systemPrompt],
      userPrompt,
      conversation: [],
      tools: [],
      settings: { temperature: 0.2, maxTokens: 1024, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="w-[680px] max-h-[88vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-surface-bg)', borderColor: 'var(--color-surface-border)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Response Diff Analyzer</p>
            {url && <p className="text-[11px] text-[var(--color-text-muted)] truncate">{method} {url}</p>}
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Response A */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Response A</label>
                <input
                  value={labelA}
                  onChange={e => setLabelA(e.target.value)}
                  className="text-[10px] px-1.5 py-0.5 rounded outline-none"
                  style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-muted)', width: '120px' }}
                  placeholder="Label A"
                />
              </div>
              <textarea
                value={responseA}
                onChange={e => setResponseA(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 rounded-lg text-[11px] font-mono resize-none outline-none"
                placeholder="Paste response A (JSON)"
                style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
              />
            </div>
            {/* Response B */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Response B</label>
                <input
                  value={labelB}
                  onChange={e => setLabelB(e.target.value)}
                  className="text-[10px] px-1.5 py-0.5 rounded outline-none"
                  style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-muted)', width: '120px' }}
                  placeholder="Label B"
                />
              </div>
              <textarea
                value={responseB}
                onChange={e => setResponseB(e.target.value)}
                rows={8}
                autoFocus
                className="w-full px-3 py-2 rounded-lg text-[11px] font-mono resize-none outline-none"
                placeholder="Paste the other response to compare"
                style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
              />
            </div>
          </div>

          {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

          {!analysis && !loading && (
            <button
              type="button"
              onClick={handleCompare}
              disabled={!responseA.trim() || !responseB.trim()}
              className="h-[30px] px-4 text-[12px] font-medium rounded-md text-white cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 self-start"
              style={{ backgroundColor: ACCENT }}
            >
              ✨ Compare with AI
            </button>
          )}

          {loading && !analysis && (
            <div className="flex gap-1 items-center py-2">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
              ))}
              <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Analyzing differences…</span>
            </div>
          )}

          {analysis && (
            <div className="rounded-lg border p-3" style={{ borderColor: `color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`, backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-surface-bg))` }}>
              <MdViewer content={analysis} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div>
            {analysis && !loading && (
              <button type="button" onClick={() => { setAnalysis(''); accRef.current = ''; }}
                className="text-[11px] underline cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                Clear
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {analysis && !loading && (
              <button type="button" onClick={handleCompare}
                className="h-[30px] px-3 text-[11px] rounded-md cursor-pointer border text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                style={{ borderColor: 'var(--color-surface-border)' }}>
                Re-analyze
              </button>
            )}
            <button type="button" onClick={onClose}
              className="h-[30px] px-4 text-[12px] font-medium rounded-md cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
