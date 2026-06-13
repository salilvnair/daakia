/**
 * AiBodyGenerate — AI-powered request body generator for the Body tab.
 *
 * Task: 4.3.5 — AI Body Generator
 *
 * The user types a description (e.g. "a user registration payload with name, email,
 * password and address") and clicks Generate. The AI returns the raw body content
 * (JSON, XML, form-encoded, or plain text) based on the active content-type. A
 * one-click "Apply" button inserts the generated body into the Monaco editor.
 */
import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { CloseIcon, SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { EditorView } from '../../dui';
import type { EditorLanguage } from '../../dui';

// ─── Public handle ────────────────────────────────────────────────────────────

export interface AiBodyGenerateHandle {
  open: () => void;
  loading: boolean;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  tabId: string;
  method: string;
  url: string;
  contentType: string;
  onApply: (body: string) => void;
}

const ACCENT = 'var(--color-protocol-ai)';

// ─── Language detection ───────────────────────────────────────────────────────

function detectLanguage(contentType: string): EditorLanguage {
  if (contentType.includes('json')) return 'json';
  if (contentType.includes('xml') || contentType.includes('soap')) return 'xml';
  if (contentType.includes('html')) return 'html';
  return 'plaintext';
}

// ─── Markdown fence stripper ──────────────────────────────────────────────────

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:\w+)?\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();
}

// ─── Component ────────────────────────────────────────────────────────────────

export const AiBodyGenerate = forwardRef<AiBodyGenerateHandle, Props>(
  function AiBodyGenerate({ tabId, method, url, contentType, onApply }: Props, ref) {
    const [visible, setVisible] = useState(false);
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [generated, setGenerated] = useState('');
    const [streaming, setStreaming] = useState('');
    const [error, setError] = useState('');

    const accumulatedRef = useRef('');
    const reqIdRef = useRef('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const activeTab = useTabsStore(s => s.tabs.find(t => t.id === tabId));
    const resolve = useAiPromptTemplatesStore(s => s.resolve);

    // ── Listen for AI stream messages ─────────────────────────────────────────

    useEffect(() => {
      const handler = (evt: MessageEvent) => {
        const msg = evt.data as Record<string, unknown>;
        if (!msg || msg.tabId !== reqIdRef.current) return;

        if (msg.type === 'ai:chunk') {
          const delta = (msg.delta as string) || (msg.text as string) || '';
          accumulatedRef.current += delta;
          setStreaming(accumulatedRef.current);
        }
        if (msg.type === 'ai:complete') {
          const msgPayload = msg.message as Record<string, unknown> | undefined;
          const content = accumulatedRef.current || (msgPayload?.content as string) || '';
          const clean = stripFences(content);
          setGenerated(clean);
          setStreaming('');
          setLoading(false);
        }
        if (msg.type === 'ai:error') {
          setError((msg.message as string) || 'AI generation failed. Check your AI provider settings.');
          setStreaming('');
          setLoading(false);
        }
      };
      window.addEventListener('message', handler);
      return () => window.removeEventListener('message', handler);
    }, []);

    // ── Auto-focus textarea when opened ──────────────────────────────────────

    useEffect(() => {
      if (visible && !loading) {
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    }, [visible, loading]);

    // ── Trigger generation ────────────────────────────────────────────────────

    const handleGenerate = useCallback(() => {
      if (!description.trim()) return;
      setLoading(true);
      setError('');
      setGenerated('');
      setStreaming('');
      accumulatedRef.current = '';

      const pid = `ai-body-${Date.now()}`;
      reqIdRef.current = pid;

      const systemPrompt = resolve('rest.body.generate.system');
      const userPrompt = resolve('rest.body.generate', {
        method,
        url: url || '(no URL yet)',
        contentType: contentType || 'application/json',
        description: description.trim(),
      });

      postMsg({
        type: 'ai:send',
        tabId: pid,
        provider: '',
        model: '',
        baseUrl: '',
        stage: 'rest.body.generate',
        systemPrompts: [systemPrompt],
        userPrompt,
        conversation: [],
        tools: [],
        settings: {
          temperature: 0.5,
          maxTokens: 1024,
          stream: true,
          topP: 1,
          stopSequences: [],
          responseFormat: 'text',
          frequencyPenalty: 0,
          presencePenalty: 0,
          seed: null,
        },
        mcpServerConfigs: [],
        authType: activeTab?.authType,
        authData: activeTab?.authData,
        envId: activeTab?.envId,
      });
    }, [description, method, url, contentType, activeTab, resolve]);

    // ── Apply generated body to editor ────────────────────────────────────────

    const handleApply = useCallback(() => {
      if (!generated.trim()) return;
      onApply(generated);
      setGenerated('');
      setDescription('');
      setVisible(false);
    }, [generated, onApply]);

    // ── Handle Enter key in textarea ──────────────────────────────────────────

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleGenerate();
      }
    }, [handleGenerate]);

    // ── Dismiss ───────────────────────────────────────────────────────────────

    const handleClose = useCallback(() => {
      setVisible(false);
      setGenerated('');
      setStreaming('');
      setError('');
      setLoading(false);
      accumulatedRef.current = '';
    }, []);

    // ── Expose handle ─────────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      open: () => { setVisible(true); },
      loading,
    }), [loading]);

    if (!visible) return null;

    const liveBody = generated || streaming;

    return (
      <div
        className="mx-1 mb-2 rounded-lg border overflow-hidden"
        style={{
          borderColor: `color-mix(in srgb, ${ACCENT} 25%, transparent)`,
          backgroundColor: `color-mix(in srgb, ${ACCENT} 4%, var(--color-panel))`,
        }}
      >
        {/* Header row */}
        <div
          className="flex items-center gap-2 px-3 py-2 border-b"
          style={{ borderColor: `color-mix(in srgb, ${ACCENT} 15%, transparent)` }}
        >
          <SparkleIcon size={12} style={{ color: ACCENT, flexShrink: 0 }} />
          <span className="text-[11px] font-medium flex-1" style={{ color: ACCENT }}>
            Generate Body with AI
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="w-[18px] h-[18px] flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer transition-opacity"
            title="Close"
          >
            <CloseIcon size={10} />
          </button>
        </div>

        {/* Description textarea */}
        <div className="px-3 py-2.5">
          <textarea
            ref={textareaRef}
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={2}
            placeholder={`Describe the payload… e.g. "user registration with name, email, password and address"`}
            className="w-full resize-none rounded-md px-2.5 py-2 text-[12px] font-mono bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none disabled:opacity-50 transition-colors"
            style={{ minHeight: 52 }}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-[var(--color-text-muted)]">
              ⌘↵ to generate
            </span>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || !description.trim()}
              className="h-[26px] px-3 rounded-md text-[11px] font-medium cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: ACCENT, color: 'var(--color-btn-primary-text, #fff)' }}
            >
              {loading ? 'Generating…' : (generated ? 'Regenerate' : 'Generate')}
            </button>
          </div>
        </div>

        {/* Loading dots */}
        {loading && !streaming && (
          <div className="flex gap-0.5 items-center px-3 pb-2.5">
            {[0, 120, 240].map(d => (
              <span
                key={d}
                className="w-[4px] h-[4px] rounded-full animate-pulse"
                style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }}
              />
            ))}
            <span className="text-[11px] ml-1.5" style={{ color: ACCENT }}>
              Generating…
            </span>
          </div>
        )}

        {/* Live preview — always EditorView to avoid mount/unmount flicker */}
        {liveBody && (
          <div className="px-3 pb-2.5">
            <EditorView
              value={liveBody}
              language={detectLanguage(contentType)}
              height="180px"
              readOnly
              wordWrap
              bordered
            />
            {/* Apply button — only when generation is complete */}
            {generated && !loading && (
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={handleApply}
                  className="h-[26px] px-3 rounded-md text-[11px] font-medium cursor-pointer transition-opacity hover:opacity-90"
                  style={{ backgroundColor: ACCENT, color: 'var(--color-btn-primary-text, #fff)' }}
                >
                  Apply to editor
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="px-3 pb-2.5">
            <p className="text-[11px] text-[var(--color-error)]">{error}</p>
          </div>
        )}
      </div>
    );
  },
);
