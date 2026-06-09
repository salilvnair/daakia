/**
 * AiResponseDiffModal — compare two API responses with AI (4.4.4)
 *
 * Both sides use Monaco editors for syntax highlighting.
 * Response A is auto-filled from the current tab's last response.
 * AI explains what changed and why it might matter.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { CloseIcon, SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';
import { CodeEditor } from '../shared';

interface Props {
  currentResponseBody: string;
  method?: string;
  url?: string;
  onClose: () => void;
}

const ACCENT = 'var(--color-warning)';

// ── Styled response label chip ────────────────────────────────────────────────
function ResponseChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-semibold tracking-wide select-none"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 14%, var(--color-panel))`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        boxShadow: `0 0 8px color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

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

  // Detect language for Monaco
  const detectLang = (body: string) => {
    const t = body.trim();
    if (t.startsWith('{') || t.startsWith('[')) return 'json';
    if (t.startsWith('<')) return 'xml';
    return 'text';
  };

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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', paddingTop: '5vh', paddingBottom: '5vh' }}
    >
      <div
        className="w-[900px] max-w-[96vw] flex flex-col rounded-2xl border shadow-2xl"
        style={{
          backgroundColor: 'var(--color-panel)',
          borderColor: 'var(--color-surface-border)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-6 py-4 border-b flex-shrink-0 rounded-t-2xl"
          style={{
            borderColor: 'var(--color-surface-border)',
            background: `linear-gradient(135deg, color-mix(in srgb, ${ACCENT} 8%, var(--color-panel)) 0%, var(--color-panel) 100%)`,
          }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 20%, var(--color-surface))`, border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)` }}
          >
            <SparkleIcon size={14} style={{ color: ACCENT }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Response Diff Analyzer</p>
            {url && <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{method} {url}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg opacity-50 hover:opacity-100 cursor-pointer transition-opacity"
            style={{ backgroundColor: 'var(--color-surface-hover)' }}
          >
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          {/* Editors side by side */}
          <div className="grid grid-cols-2 gap-4">
            {/* Response A */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <ResponseChip label={labelA} color="#3b82f6" />
                <input
                  value={labelA}
                  onChange={e => setLabelA(e.target.value)}
                  className="text-[10px] px-2 py-0.5 rounded-md outline-none max-w-[130px]"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-muted)',
                  }}
                  placeholder="Label A"
                />
              </div>
              <div
                className="rounded-xl overflow-hidden border"
                style={{ height: '320px', borderColor: 'var(--color-surface-border)' }}
              >
                <CodeEditor
                  value={responseA}
                  language={detectLang(responseA)}
                  onChange={setResponseA}
                  height="320px"
                  placeholder="Paste response A (JSON, XML, text…)"
                />
              </div>
            </div>

            {/* Response B */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <ResponseChip label={labelB} color="#f59e0b" />
                <input
                  value={labelB}
                  onChange={e => setLabelB(e.target.value)}
                  className="text-[10px] px-2 py-0.5 rounded-md outline-none max-w-[130px]"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-muted)',
                  }}
                  placeholder="Label B"
                />
              </div>
              <div
                className="rounded-xl overflow-hidden border"
                style={{ height: '320px', borderColor: 'var(--color-surface-border)' }}
              >
                <CodeEditor
                  value={responseB}
                  language={detectLang(responseB)}
                  onChange={setResponseB}
                  height="320px"
                  placeholder="Paste comparison response here…"
                />
              </div>
            </div>
          </div>

          {error && (
            <p className="text-[11px] px-3 py-2 rounded-lg" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, var(--color-surface))' }}>
              {error}
            </p>
          )}

          {/* Compare button */}
          {!analysis && !loading && (
            <button
              type="button"
              onClick={handleCompare}
              disabled={!responseA.trim() || !responseB.trim()}
              className="h-[38px] px-5 text-[12.5px] font-semibold rounded-xl text-white cursor-pointer hover:brightness-110 transition-all disabled:opacity-40 self-start flex items-center gap-2"
              style={{ backgroundColor: ACCENT }}
            >
              <SparkleIcon size={13} />
              Compare with AI
            </button>
          )}

          {loading && !analysis && (
            <div className="flex gap-1 items-center py-2">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
              ))}
              <span className="text-[11px] ml-2" style={{ color: 'var(--color-text-muted)' }}>Analyzing differences…</span>
            </div>
          )}

          {analysis && (
            <div
              className="rounded-xl border p-4"
              style={{
                borderColor: `color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`,
                backgroundColor: `color-mix(in srgb, ${ACCENT} 4%, var(--color-surface))`,
              }}
            >
              <p className="text-[10.5px] font-semibold uppercase tracking-wider mb-2" style={{ color: ACCENT }}>AI Analysis</p>
              <MdViewer content={analysis} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-6 py-3.5 border-t flex-shrink-0 rounded-b-2xl"
          style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface)' }}
        >
          <div>
            {analysis && !loading && (
              <button type="button" onClick={() => { setAnalysis(''); accRef.current = ''; }}
                className="text-[11px] cursor-pointer transition-colors hover:opacity-80"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Clear analysis
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {analysis && !loading && (
              <button type="button" onClick={handleCompare}
                className="h-[32px] px-4 text-[11.5px] font-medium rounded-lg cursor-pointer border transition-all hover:brightness-110"
                style={{ borderColor: `color-mix(in srgb, ${ACCENT} 35%, var(--color-surface-border))`, color: ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 8%, transparent)` }}>
                Re-analyze
              </button>
            )}
            <button type="button" onClick={onClose}
              className="h-[32px] px-4 text-[11.5px] font-medium rounded-lg cursor-pointer border transition-all hover:brightness-110"
              style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-surface-hover)' }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
