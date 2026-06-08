/**
 * VoiceToRequestModal — speech input → AI converts to HTTP request.
 * Feature 4.6.25 — Voice-to-Request
 *
 * "Send a POST to users with name John and email john@example.com"
 * → method: POST, url: /users, body: { name: "John", email: "..." }
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SparkleIcon, CloseIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useTabsStore } from '../../store/tabs-store';
import { useToastStore } from '../../store/toast-store';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const SYSTEM_PROMPT = `You are a voice-to-HTTP-request converter. Convert spoken/natural language descriptions of API requests into structured request objects.

Return ONLY JSON in this format:
{
  "method": "POST",
  "url": "/api/users",
  "headers": [
    { "key": "Content-Type", "value": "application/json", "enabled": true }
  ],
  "queryParams": [],
  "body": "{\\"name\\": \\"John\\", \\"email\\": \\"john@example.com\\"}",
  "bodyType": "json",
  "name": "Create User"
}

Rules:
- Infer method from context: "get/fetch/retrieve" → GET, "create/add/post/send" → POST, "update/modify/change" → PUT/PATCH, "delete/remove" → DELETE
- Infer URL from the resource mentioned (/users, /products, /orders, etc.)
- Parse any field values mentioned into the body
- If a base URL is mentioned, include it; otherwise use a relative path
- Return ONLY the JSON, no explanation`;

export function VoiceToRequestModal({ onClose }: Props) {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(true);

  const accRef = useRef('');
  const reqIdRef = useRef('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const addTab = useTabsStore(s => s.addTab);
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition as typeof window.SpeechRecognition;
    if (!SpeechRecognition) { setSupported(false); return; }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = Array.from(event.results)
        .map(r => r[0].transcript)
        .join(' ');
      setTranscript(text);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.onerror = () => {
      setListening(false);
      setError('Microphone access denied or speech not recognized.');
    };

    recognitionRef.current = recognition;

    return () => { recognition.abort(); };
  }, []);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;
      if (msg.type === 'ai:chunk') accRef.current += (msg.delta as string) || '';
      if (msg.type === 'ai:complete') {
        setLoading(false);
        try { setResult(JSON.parse(accRef.current)); }
        catch { setError('Could not parse the request. Try rephrasing.'); }
      }
      if (msg.type === 'ai:error') { setError((msg.message as string) || 'Failed.'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
    } else {
      setTranscript('');
      setError('');
      recognitionRef.current.start();
      setListening(true);
    }
  };

  const convert = () => {
    if (!transcript.trim()) { setError('Say or type a request description first.'); return; }
    setLoading(true);
    setResult(null);
    setError('');
    accRef.current = '';
    const pid = `ai-voice-${Date.now()}`;
    reqIdRef.current = pid;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'import.voice',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt: transcript,
      conversation: [], tools: [],
      settings: { temperature: 0.1, maxTokens: 500, stream: false, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  const applyToTab = () => {
    if (!result) return;
    addTab({
      name: (result.name as string) || 'Voice Request',
      method: (result.method as string) || 'GET',
      url: (result.url as string) || '',
      headers: (result.headers as unknown[]) || [],
      params: (result.queryParams as unknown[]) || [],
      bodyRaw: (result.body as string) || '',
      bodyType: (result.bodyType as string) || 'json',
    });
    setApplied(true);
    addToast({ type: 'success', message: 'Request created in new tab!' });
    setTimeout(onClose, 1200);
  };

  const EXAMPLES = [
    'Get all users from the API',
    'Post to users with name John Smith and email john@example.com',
    'Delete the user with id 42',
    'Update product 123 with price 29.99 and stock 50',
    'Send a GET request to the health endpoint',
  ];

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[600px] max-h-[88vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-surface-bg)', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Voice-to-Request</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Speak or type your request in plain English</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Microphone button */}
          {supported && (
            <div className="flex flex-col items-center py-4 gap-3">
              <button type="button" onClick={toggleListening}
                className="w-16 h-16 rounded-full flex items-center justify-center cursor-pointer transition-all"
                style={{
                  backgroundColor: listening ? 'var(--color-error)' : `color-mix(in srgb, ${ACCENT} 15%, transparent)`,
                  border: `2px solid ${listening ? 'var(--color-error)' : ACCENT}`,
                  boxShadow: listening ? '0 0 0 8px color-mix(in srgb, var(--color-error) 15%, transparent)' : 'none',
                }}>
                <span style={{ fontSize: '24px' }}>{listening ? '■' : '🎤'}</span>
              </button>
              <p className="text-[11px]" style={{ color: listening ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
                {listening ? 'Listening… speak now' : 'Click to speak'}
              </p>
            </div>
          )}

          {!supported && (
            <div className="rounded-lg border p-3 text-center" style={{ borderColor: 'var(--color-surface-border)' }}>
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                Speech recognition not supported in this environment. Type your request below.
              </p>
            </div>
          )}

          {/* Text input */}
          <div>
            <textarea
              value={transcript}
              onChange={e => { setTranscript(e.target.value); setError(''); setResult(null); }}
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-[12px] resize-none outline-none"
              placeholder="Or type: 'Send a POST to /api/users with name John and email john@example.com'"
              style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
            />
          </div>

          {/* Example phrases */}
          <div>
            <p className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Examples</p>
            <div className="flex flex-col gap-1">
              {EXAMPLES.map(ex => (
                <button key={ex} type="button" onClick={() => setTranscript(ex)}
                  className="text-left text-[10.5px] px-2.5 py-1.5 rounded-md cursor-pointer border transition-all"
                  style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                  &quot;{ex}&quot;
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

          {loading && (
            <div className="flex gap-1 items-center">
              {[0, 150, 300].map(d => (<span key={d} className="w-[4px] h-[4px] rounded-full animate-pulse" style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />))}
              <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Converting to request…</span>
            </div>
          )}

          {result && (
            <div className="rounded-lg border p-4"
              style={{ borderColor: `color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`, backgroundColor: `color-mix(in srgb, ${ACCENT} 4%, var(--color-surface-bg))` }}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: ACCENT }}>✦ Request ready</p>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--color-info)' }}>{result.method as string}</span>
                <span className="text-[11px] font-mono" style={{ color: 'var(--color-text-primary)' }}>{result.url as string}</span>
              </div>
              {result.body && <p className="text-[10px] font-mono truncate mt-1" style={{ color: 'var(--color-text-muted)' }}>{result.body as string}</p>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0 gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
          {result && (
            <button type="button" onClick={applyToTab} disabled={applied}
              className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-60 flex items-center gap-1.5 text-white"
              style={{ backgroundColor: applied ? 'var(--color-success)' : ACCENT }}>
              {applied ? <><CheckIcon size={12} /> Applied!</> : 'Open in New Tab'}
            </button>
          )}
          <button type="button" onClick={convert} disabled={loading || !transcript.trim()}
            className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-40 text-white"
            style={{ backgroundColor: ACCENT }}>
            <SparkleIcon size={11} className="inline mr-1" />
            Convert
          </button>
          <button type="button" onClick={onClose}
            className="h-[30px] px-4 text-[11px] font-medium rounded-md cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
