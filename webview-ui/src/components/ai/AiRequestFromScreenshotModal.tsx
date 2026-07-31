/**
 * AiRequestFromScreenshotModal — paste a screenshot of API docs → AI creates a request.
 * Feature 4.6.11 — AI Request from Screenshot
 *
 * User pastes a screenshot image (API docs, Swagger UI, Postman doc, etc.)
 * AI extracts: method, URL, headers, body, query params → prefills a new tab.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { SparkleIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useTabsStore } from '../../store/tabs-store';
import { useToastStore } from '../../store/toast-store';
import { ModalView, AIButtonView, MultilineInputView, ButtonView } from '@salilvnair/dui';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const SYSTEM_PROMPT = `You are an API request extractor. The user will provide a screenshot or description of API documentation.
Extract the HTTP request details and return ONLY a JSON object in this exact format:

{
  "method": "POST",
  "url": "https://api.example.com/v1/users",
  "headers": [
    { "key": "Content-Type", "value": "application/json", "enabled": true },
    { "key": "Authorization", "value": "Bearer {{token}}", "enabled": true }
  ],
  "queryParams": [
    { "key": "limit", "value": "10", "enabled": true }
  ],
  "body": "{\\"name\\": \\"John\\", \\"email\\": \\"john@example.com\\"}",
  "bodyType": "json",
  "description": "Creates a new user account",
  "name": "Create User"
}

Rules:
- bodyType: "json" | "form" | "raw" | "none"
- Use {{variable}} notation for auth tokens and base URLs
- Return ONLY valid JSON — no explanation, no markdown fences`;

export function AiRequestFromScreenshotModal({ onClose }: Props) {
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [textFallback, setTextFallback] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [rawResult, setRawResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const accRef = useRef('');
  const reqIdRef = useRef('');
  const dropRef = useRef<HTMLDivElement>(null);
  const addTab = useTabsStore(s => s.addTab);
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;
      if (msg.type === 'ai:chunk') {
        accRef.current += (msg.delta as string) || (msg.text as string) || '';
        setRawResult(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        const content = accRef.current || (msg.message as Record<string, unknown>)?.content as string || '';
        setRawResult(content);
        setLoading(false);
        try { setResult(JSON.parse(content)); } catch { setError('Could not parse AI output. Try with more descriptive text.'); }
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'Extraction failed.');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = ev => setImageDataUrl(ev.target?.result as string);
        reader.readAsDataURL(file);
        return;
      }
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = ev => setImageDataUrl(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  }, []);

  const run = () => {
    const input = textFallback.trim() || (imageDataUrl ? 'Image provided below' : '');
    if (!input && !imageDataUrl) { setError('Paste a screenshot or describe the API endpoint.'); return; }
    setLoading(true);
    setRawResult('');
    setResult(null);
    setError('');
    accRef.current = '';
    const pid = `ai-screenshot-${Date.now()}`;
    reqIdRef.current = pid;

    const userPrompt = imageDataUrl
      ? `Extract the API request from this documentation screenshot:\n\n${textFallback || '(See attached image)'}`
      : `Extract the API request from this documentation:\n\n${textFallback}`;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'import.screenshot',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt,
      ...(imageDataUrl ? { imageUrl: imageDataUrl } : {}),
      conversation: [], tools: [],
      settings: { temperature: 0.1, maxTokens: 1024, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  const applyToNewTab = () => {
    if (!result) return;
    addTab({
      name: (result.name as string) || 'From Screenshot',
      method: ((result.method as string) || 'GET') as import('../../store/tabs-store').HttpMethod,
      url: (result.url as string) || '',
      headers: (result.headers as import('../shared').KeyValueRow[]) || [],
      params: (result.queryParams as import('../shared').KeyValueRow[]) || [],
      bodyRaw: (result.body as string) || '',
      bodyMode: 'raw' as const,
      bodyContentType: 'application/json',
    });
    setApplied(true);
    addToast({ type: 'success', message: 'Request created in a new tab!' });
    setTimeout(onClose, 1200);
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="Request from Screenshot"
      subtitle="Paste API documentation screenshot → AI extracts the request"
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={
        result && !loading ? (
          <ButtonView
            size="md"
            variant="primary"
            accentColor={applied ? 'var(--color-success)' : ACCENT}
            disabled={applied}
            onClick={applyToNewTab}
          >
            {applied ? <><CheckIcon size={12} style={{ marginRight: 4 }} />Applied!</> : 'Open in New Tab'}
          </ButtonView>
        ) : undefined
      }
      footerRight={
        <AIButtonView
          label={loading ? 'Extracting…' : 'Extract'}
          size="md"
          accentColor={ACCENT}
          disabled={loading || (!imageDataUrl && !textFallback.trim())}
          loading={loading}
          onClick={run}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {/* Drop zone */}
        <div
          ref={dropRef}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          tabIndex={0}
          className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-8 cursor-pointer outline-none transition-all"
          style={{
            borderColor: dragging ? ACCENT : 'var(--color-surface-border)',
            backgroundColor: dragging ? `color-mix(in srgb, ${ACCENT} 5%, transparent)` : 'var(--color-panel)',
          }}>
          {imageDataUrl ? (
            <div className="flex flex-col items-center gap-2">
              <img src={imageDataUrl} alt="Screenshot" className="max-h-[120px] max-w-full rounded-lg object-contain" />
              <button type="button" onClick={() => setImageDataUrl('')}
                className="text-[10px] cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>Remove</button>
            </div>
          ) : (
            <>
              <p className="text-[12px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Paste screenshot here</p>
              <p className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>Ctrl+V / ⌘V — or drag & drop an image</p>
            </>
          )}
        </div>

        {/* Text fallback / supplemental */}
        <div>
          <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            Or paste/type API documentation text
          </label>
          <MultilineInputView
            value={textFallback}
            onChange={e => { setTextFallback(e.target.value); setError(''); }}
            rows={4}
            size="md"
            accentColor={ACCENT}
            width="fw"
            placeholder="e.g. POST /api/v1/users — Creates a new user. Body: { name, email, role }. Returns 201 with { id, name, email }..."
          />
        </div>

        {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

        {loading && (
          <div className="flex gap-1 items-center">
            {[0, 150, 300].map(d => (
              <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
            ))}
            <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Extracting request details…</span>
          </div>
        )}

        {result && (
          <div className="rounded-lg border p-4 flex flex-col gap-2"
            style={{ borderColor: `color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`, backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-panel))` }}>
            <p className="text-[11px] font-semibold" style={{ color: ACCENT }}>✦ Extracted Request</p>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                style={{ backgroundColor: 'var(--color-method-' + (result.method as string || 'get').toLowerCase() + ', var(--color-info))' }}>
                {result.method as string}
              </span>
              <span className="text-[11px] font-mono" style={{ color: 'var(--color-text-primary)' }}>{result.url as string}</span>
            </div>
            {typeof result.description === 'string' && result.description !== '' && (
              <p className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>{result.description as string}</p>
            )}
            {(result.headers as unknown[])?.length > 0 && (
              <p className="text-[10.5px]" style={{ color: 'var(--color-text-secondary)' }}>
                Headers: {(result.headers as Array<{key: string}>).map(h => h.key).join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    </ModalView>
  );
}
