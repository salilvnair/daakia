/**
 * AiDataGeneratorModal — AI-powered test data factory (4.3.7)
 *
 * Generates realistic test data (names, emails, addresses, UUIDs, dates,
 * credit card numbers) as JSON arrays or CSV. Accessible from the Body
 * toolbar Dice button.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { useTabsStore } from '../../store/tabs-store';
import { CloseIcon, DiceIcon, CopyIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';

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
    setResult('');
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

  const livePreview = result || streaming;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="w-[580px] max-h-[85vh] flex flex-col rounded-xl border shadow-2xl"
        style={{
          backgroundColor: 'var(--color-surface-bg)',
          borderColor: 'var(--color-surface-border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          <DiceIcon size={16} style={{ color: ACCENT, flexShrink: 0 }} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Generate Test Data</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">AI-powered realistic data for testing</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer transition-opacity"
          >
            <CloseIcon size={12} />
          </button>
        </div>

        {/* Config section */}
        <div className="px-5 py-4 flex-shrink-0 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
          {/* Data type selector */}
          <p className="text-[11px] font-medium text-[var(--color-text-muted)] mb-2">Data Type</p>
          <div className="grid grid-cols-3 gap-1.5 mb-4">
            {DATA_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setDataType(cat.id)}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left cursor-pointer transition-all border"
                style={{
                  borderColor: dataType === cat.id ? ACCENT : 'var(--color-surface-border)',
                  backgroundColor: dataType === cat.id
                    ? `color-mix(in srgb, ${ACCENT} 10%, var(--color-surface-bg))`
                    : 'var(--color-surface-bg)',
                  color: dataType === cat.id ? ACCENT : 'var(--color-text-secondary)',
                }}
              >
                <span className="text-[14px] flex-shrink-0">{cat.emoji}</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium leading-tight">{cat.label}</p>
                  <p className="text-[9px] text-[var(--color-text-muted)] leading-tight truncate">{cat.description}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Custom description */}
          {dataType === 'custom' && (
            <textarea
              value={customDesc}
              onChange={e => setCustomDesc(e.target.value)}
              rows={2}
              placeholder="Describe the data shape… e.g. 'IoT sensor readings with device ID, temperature, humidity, and timestamp'"
              className="w-full resize-none rounded-md px-2.5 py-2 text-[12px] bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none mb-3"
              style={{ minHeight: 52 }}
            />
          )}

          {/* Count + format row */}
          <div className="flex items-center gap-4">
            {/* Count */}
            <div>
              <p className="text-[11px] font-medium text-[var(--color-text-muted)] mb-1.5">Count</p>
              <div className="flex gap-1">
                {COUNTS.map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCount(n)}
                    className="w-[34px] h-[28px] rounded-md text-[11px] font-mono cursor-pointer transition-all border"
                    style={{
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
              <p className="text-[11px] font-medium text-[var(--color-text-muted)] mb-1.5">Format</p>
              <div className="flex gap-1">
                {(['json', 'csv'] as OutputFormat[]).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className="h-[28px] px-3 rounded-md text-[11px] font-medium cursor-pointer transition-all border"
                    style={{
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

            {/* Generate button */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || (dataType === 'custom' && !customDesc.trim())}
              className="ml-auto h-[30px] px-4 rounded-md text-[12px] font-medium text-white cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              style={{ backgroundColor: ACCENT }}
            >
              <DiceIcon size={12} style={{ color: 'white' }} />
              {loading ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 min-h-0 flex flex-col px-5 py-4 overflow-y-auto [scrollbar-gutter:stable]">
          {loading && !streaming && (
            <div className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
              {[0, 150, 300].map(d => (
                <span
                  key={d}
                  className="w-[5px] h-[5px] rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }}
                />
              ))}
              <span style={{ color: ACCENT }}>Generating {count} records…</span>
            </div>
          )}

          {error && !loading && (
            <p className="text-[12px] text-[var(--color-error)]">{error}</p>
          )}

          {livePreview && (
            <div
              className="rounded-lg border font-mono text-[11px] text-[var(--color-text-primary)] whitespace-pre-wrap break-all overflow-y-auto flex-1 min-h-0 p-3"
              style={{
                borderColor: 'var(--color-surface-border)',
                backgroundColor: 'var(--color-input-bg)',
                maxHeight: 280,
              }}
            >
              {livePreview}
            </div>
          )}

          {!livePreview && !loading && !error && (
            <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--color-text-muted)] opacity-50">
              Configure your data and click Generate
            </div>
          )}
        </div>

        {/* Footer */}
        {result && (
          <div
            className="flex items-center justify-between px-5 py-3 border-t flex-shrink-0"
            style={{ borderColor: 'var(--color-surface-border)' }}
          >
            <div className="text-[11px] text-[var(--color-text-muted)]">
              {count} records · {format.toUpperCase()}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="h-[30px] px-3 rounded-md text-[11px] font-medium cursor-pointer transition-colors flex items-center gap-1.5 bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              {onApply && (
                <button
                  type="button"
                  onClick={handleApply}
                  className="h-[30px] px-4 rounded-md text-[12px] font-medium text-white cursor-pointer transition-opacity hover:opacity-90"
                  style={{ backgroundColor: ACCENT }}
                >
                  Apply to editor
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="h-[30px] px-3 rounded-md text-[11px] font-medium cursor-pointer transition-colors bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
