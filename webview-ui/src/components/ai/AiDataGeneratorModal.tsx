/**
 * AiDataGeneratorModal — AI-powered test data factory (4.3.7)
 *
 * Generates realistic test data (names, emails, addresses, UUIDs, dates,
 * credit card numbers) as JSON arrays or CSV. Accessible from the Body
 * toolbar Dice button.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { useTabsStore } from '../../store/tabs-store';
import { DiceIcon, CopyIcon, CheckIcon, RefreshIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView, ButtonView, EditorView } from '../../dui';

// ─── Types ────────────────────────────────────────────────────────────────────

type DataType = 'person' | 'address' | 'payment' | 'product' | 'company' | 'custom';
type OutputFormat = 'json' | 'csv';

interface DataCategory {
  id: DataType;
  label: string;
  description: string;
  emoji: string;
}

const DATA_CATEGORIES: DataCategory[] = [
  { id: 'person',  label: 'Person',  description: 'Name, email, phone, DOB, gender', emoji: '👤' },
  { id: 'address', label: 'Address', description: 'Street, city, state, zip, country', emoji: '🏠' },
  { id: 'payment', label: 'Payment', description: 'Card number, expiry, CVV, billing', emoji: '💳' },
  { id: 'product', label: 'Product', description: 'Name, SKU, price, description, category', emoji: '📦' },
  { id: 'company', label: 'Company', description: 'Name, domain, industry, size, address', emoji: '🏢' },
  { id: 'custom',  label: 'Custom',  description: 'Describe any data shape you need', emoji: '✏️' },
];

const COUNTS = [1, 5, 10, 25, 50, 100];

interface Props {
  tabId: string;
  onApply?: (data: string) => void;
  onClose: () => void;
}

const ACCENT = 'var(--color-info)';

// ─── Component ────────────────────────────────────────────────────────────────

export function AiDataGeneratorModal({ tabId, onApply, onClose }: Props) {
  const [dataType, setDataType] = useState<DataType>('person');
  const [count, setCount] = useState(10);
  const [format, setFormat] = useState<OutputFormat>('json');
  const [customDesc, setCustomDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [streaming, setStreaming] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const accumulatedRef = useRef('');
  const reqIdRef = useRef('');

  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === tabId));
  const resolve = useAiPromptTemplatesStore(s => s.resolve);

  // ── Listen for AI stream ──────────────────────────────────────────────────

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
        const clean = content
          .replace(/^```(?:json|csv)?\s*/im, '')
          .replace(/\s*```\s*$/im, '')
          .trim();
        setResult(clean);
        setStreaming('');
        setLoading(false);
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'Data generation failed. Check your AI provider settings.');
        setStreaming('');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── Generate ──────────────────────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    if (dataType === 'custom' && !customDesc.trim()) return;

    setLoading(true);
    setError('');
    setStreaming('');
    setCopied(false);
    accumulatedRef.current = '';

    const pid = `ai-datagen-${Date.now()}`;
    reqIdRef.current = pid;

    const dataTypeLabel = DATA_CATEGORIES.find(c => c.id === dataType)?.description || dataType;
    const systemPrompt = resolve('data.generate.system');
    const userPrompt = resolve('data.generate', {
      dataType: dataType === 'custom' ? 'custom' : dataTypeLabel,
      count: String(count),
      format: format === 'json' ? 'JSON array' : 'CSV',
      customDescription: dataType === 'custom' ? customDesc.trim() : '',
    });

    postMsg({
      type: 'ai:send',
      tabId: pid,
      provider: '',
      model: '',
      baseUrl: '',
      stage: 'data.generate',
      systemPrompts: [systemPrompt],
      userPrompt,
      conversation: [],
      tools: [],
      settings: {
        temperature: 0.7,
        maxTokens: 2048,
        stream: true,
        topP: 1,
        stopSequences: [],
        responseFormat: 'text',
        frequencyPenalty: 0.3,
        presencePenalty: 0,
        seed: null,
      },
      mcpServerConfigs: [],
      authType: activeTab?.authType,
      authData: activeTab?.authData,
      envId: activeTab?.envId,
    });
  }, [dataType, count, format, customDesc, activeTab, resolve]);

  // ── Copy to clipboard ─────────────────────────────────────────────────────

  const handleCopy = useCallback(async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  // ── Apply to body editor ──────────────────────────────────────────────────

  const handleApply = useCallback(() => {
    if (!result || !onApply) return;
    onApply(result);
    onClose();
  }, [result, onApply, onClose]);

  const livePreview = streaming || result;

  return (
    <ModalView
      open
      onClose={onClose}
      title="Generate Test Data"
      subtitle="AI-powered realistic data for testing"
      size="md"
      headerColor={ACCENT}
      headerIcon={
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `color-mix(in srgb, ${ACCENT} 18%, transparent)`,
        }}>
          <DiceIcon size={13} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={result ? (
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          {count} records · {format.toUpperCase()}
        </span>
      ) : undefined}
      footerRight={
        <>
          {result ? (
            <>
              <ButtonView
                variant="secondary"
                size="sm"
                iconLeft={copied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
                onClick={handleCopy}
              >
                {copied ? 'Copied!' : 'Copy'}
              </ButtonView>
              {onApply && (
                <ButtonView variant="primary" size="sm" onClick={handleApply}>
                  Apply to editor
                </ButtonView>
              )}
              <ButtonView
                variant="secondary"
                size="sm"
                iconLeft={<RefreshIcon size={11} />}
                disabled={loading}
                onClick={handleGenerate}
                style={{ color: ACCENT, borderColor: `color-mix(in srgb, ${ACCENT} 30%, transparent)` }}
              >
                {loading ? 'Generating…' : 'Regenerate'}
              </ButtonView>
            </>
          ) : (
            <AIButtonView
              label={loading ? 'Generating…' : 'Generate'}
              size="sm"
              accentColor={ACCENT}
              disabled={loading || (dataType === 'custom' && !customDesc.trim())}
              onClick={handleGenerate}
            />
          )}
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Data type selector */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 8 }}>Data Type</p>
          <div className="grid grid-cols-3 gap-1.5">
            {DATA_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setDataType(cat.id)}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left cursor-pointer transition-all border"
                style={{
                  borderColor: dataType === cat.id ? ACCENT : 'var(--color-surface-border)',
                  backgroundColor: dataType === cat.id
                    ? `color-mix(in srgb, ${ACCENT} 10%, var(--color-surface))`
                    : 'var(--color-surface)',
                  color: dataType === cat.id ? ACCENT : 'var(--color-text-secondary)',
                }}
              >
                <span style={{ fontSize: 14, flexShrink: 0 }}>{cat.emoji}</span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.2, margin: 0 }}>{cat.label}</p>
                  <p style={{ fontSize: 9, color: 'var(--color-text-muted)', lineHeight: 1.2, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom description */}
        {dataType === 'custom' && (
          <textarea
            value={customDesc}
            onChange={e => setCustomDesc(e.target.value)}
            rows={2}
            placeholder="Describe the data shape… e.g. 'IoT sensor readings with device ID, temperature, humidity, and timestamp'"
            className="w-full resize-none rounded-md px-2.5 py-2 text-[12px] bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
            style={{ minHeight: 52 }}
          />
        )}

        {/* Count + format row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
          {/* Count */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 6 }}>Count</p>
            <div style={{ display: 'flex', gap: 4 }}>
              {COUNTS.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className="cursor-pointer transition-all border"
                  style={{
                    width: 34, height: 28, borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)',
                    borderColor: count === n ? ACCENT : 'var(--color-surface-border)',
                    backgroundColor: count === n
                      ? `color-mix(in srgb, ${ACCENT} 15%, transparent)`
                      : 'transparent',
                    color: count === n ? ACCENT : 'var(--color-text-muted)',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 6 }}>Format</p>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['json', 'csv'] as OutputFormat[]).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className="cursor-pointer transition-all border"
                  style={{
                    height: 28, padding: '0 12px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                    borderColor: format === f ? ACCENT : 'var(--color-surface-border)',
                    backgroundColor: format === f
                      ? `color-mix(in srgb, ${ACCENT} 15%, transparent)`
                      : 'transparent',
                    color: format === f ? ACCENT : 'var(--color-text-muted)',
                  }}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading dots */}
        {loading && !streaming && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {[0, 150, 300].map(d => (
              <span
                key={d}
                className="w-[5px] h-[5px] rounded-full animate-pulse"
                style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }}
              />
            ))}
            <span style={{ fontSize: 12, color: ACCENT }}>Generating {count} records…</span>
          </div>
        )}

        {error && !loading && (
          <p style={{ fontSize: 12, color: 'var(--color-error)', margin: 0 }}>{error}</p>
        )}

        {/* Live preview — always EditorView to avoid mount/unmount flicker */}
        {livePreview && (
          <EditorView
            value={livePreview}
            language={format === 'json' ? 'json' : 'plaintext'}
            height="260px"
            readOnly
            wordWrap
            bordered
          />
        )}

        {!livePreview && !loading && !error && (
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)', opacity: 0.5, padding: '16px 0' }}>
            Configure your data and click Generate
          </div>
        )}
      </div>
    </ModalView>
  );
}
