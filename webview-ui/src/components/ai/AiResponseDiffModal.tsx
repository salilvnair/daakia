/**
 * AiResponseDiffModal — compare two API responses with AI (4.4.4)
 */
import { useState, useEffect, useRef } from 'react';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';
import { ModalView, AIButtonView, ButtonView, EditorView, SplitPanelView, ResizablePanelView } from '../../dui';

interface Props {
  currentResponseBody: string;
  method?: string;
  url?: string;
  onClose: () => void;
}

const ACCENT = 'var(--color-warning)';
const COLOR_A = 'var(--color-info)';
const COLOR_B = 'var(--color-warning)';

function ResponseChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: 999,
        fontSize: 10.5, fontWeight: 600, letterSpacing: '0.02em', userSelect: 'none',
        backgroundColor: `color-mix(in srgb, ${color} 14%, var(--color-panel))`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        boxShadow: `0 0 8px color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, backgroundColor: color }} />
      {label}
    </span>
  );
}

export function AiResponseDiffModal({ currentResponseBody, method, url, onClose }: Props) {
  const [responseA, setResponseA] = useState(currentResponseBody);
  const [responseB, setResponseB] = useState('');
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
        accRef.current += (msg.delta as string) || (msg.text as string) || '';
        setAnalysis(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        const msgPayload = msg.message as Record<string, unknown> | undefined;
        setAnalysis(accRef.current || (msgPayload?.content as string) || '');
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

  const detectLang = (body: string): 'json' | 'xml' | 'plaintext' => {
    const t = body.trim();
    if (t.startsWith('{') || t.startsWith('[')) return 'json';
    if (t.startsWith('<')) return 'xml';
    return 'plaintext';
  };

  const handleCompare = () => {
    if (!responseA.trim() || !responseB.trim()) { setError('Both responses are required.'); return; }
    setLoading(true);
    setAnalysis('');
    setError('');
    accRef.current = '';

    const pid = `ai-diff-${Date.now()}`;
    reqIdRef.current = pid;

    const systemPrompt = resolve('rest.response.diff.system');
    const userPrompt = resolve('rest.response.diff', {
      labelA: 'Current Response',
      responseA: responseA.slice(0, 3000),
      labelB: 'Comparison Response',
      responseB: responseB.slice(0, 3000),
    });

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'rest.response.diff',
      systemPrompts: [systemPrompt],
      userPrompt,
      conversation: [], tools: [],
      settings: { temperature: 0.2, maxTokens: 1024, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="Response Diff Analyzer"
      subtitle={url ? `${method} ${url}` : undefined}
      size="xl"
      headerColor={ACCENT}
      headerGradient
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)`, border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={
        analysis && !loading ? (
          <button type="button" onClick={() => { setAnalysis(''); accRef.current = ''; }}
            style={{ fontSize: 11, cursor: 'pointer', color: 'var(--color-text-muted)', background: 'none', border: 'none', opacity: 0.7 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
          >
            Clear analysis
          </button>
        ) : undefined
      }
      footerRight={
        <div style={{ display: 'flex', gap: 8 }}>
          {analysis && !loading && (
            <ButtonView
              variant="secondary"
              size="md"
              style={{ borderColor: `color-mix(in srgb, ${ACCENT} 35%, var(--color-surface-border))`, color: ACCENT }}
              onClick={handleCompare}
            >
              Re-analyze
            </ButtonView>
          )}
          <AIButtonView
            label={loading ? 'Analyzing…' : 'Compare with AI'}
            size="md"
            accentColor={ACCENT}
            disabled={loading || !responseA.trim() || !responseB.trim()}
            onClick={handleCompare}
          />
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <ResponseChip label="Current Response" color={COLOR_A} />
          <ResponseChip label="Comparison Response" color={COLOR_B} />
        </div>

        {/* Resizable side-by-side editors */}
        <ResizablePanelView defaultHeight={300} minHeight={120} maxHeight={520}>
          <SplitPanelView
            direction="horizontal"
            defaultSplit={50}
            minFirst={160}
            minSecond={160}
            first={
              <EditorView
                value={responseA}
                language={detectLang(responseA)}
                onChange={setResponseA}
                height="100%"
                placeholder="Paste response A (JSON, XML, text…)"
              />
            }
            second={
              <EditorView
                value={responseB}
                language={detectLang(responseB)}
                onChange={setResponseB}
                height="100%"
                placeholder="Paste comparison response here…"
              />
            }
          />
        </ResizablePanelView>

        {error && (
          <p style={{ fontSize: 11, padding: '8px 12px', borderRadius: 8, color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, var(--color-surface))', margin: 0 }}>
            {error}
          </p>
        )}

        {loading && !analysis && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0' }}>
            {[0, 150, 300].map(d => (
              <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
            ))}
            <span style={{ fontSize: 11, marginLeft: 8, color: 'var(--color-text-muted)' }}>Analyzing differences…</span>
          </div>
        )}

        {analysis && (
          <div style={{ borderRadius: 8, border: `1px solid color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`, backgroundColor: `color-mix(in srgb, ${ACCENT} 4%, var(--color-surface))`, padding: 16 }}>
            <p style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, margin: '0 0 8px 0', color: ACCENT }}>AI Analysis</p>
            <MdViewer content={analysis} />
          </div>
        )}
      </div>
    </ModalView>
  );
}
