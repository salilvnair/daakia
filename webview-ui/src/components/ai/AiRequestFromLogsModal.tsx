/**
 * AiRequestFromLogsModal — paste server logs → AI extracts HTTP requests → creates collection.
 * Feature 4.6.12 — AI Request from Logs
 *
 * Paste Apache/nginx/Express/any access logs, error logs, or even curl output.
 * AI extracts HTTP requests and creates a collection.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SparkleIcon, CloseIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const SYSTEM_PROMPT = `You are an API request extractor from server logs. The user will paste server access logs, error logs, curl output, or HTTP traffic dumps.

Extract all unique HTTP requests and return ONLY a JSON array in this format:
[
  {
    "name": "Get Users",
    "method": "GET",
    "url": "https://api.example.com/v1/users",
    "headers": [
      { "key": "Authorization", "value": "Bearer eyJ...", "enabled": true }
    ],
    "queryParams": [
      { "key": "page", "value": "1", "enabled": true }
    ],
    "body": "",
    "bodyType": "none"
  }
]

Rules:
- Deduplicate: if the same endpoint appears 10 times, include it once (pick the most informative instance)
- Group similar requests: GET /users/1, GET /users/2 → one entry with /users/{id}
- Include auth headers if present (mask sensitive values with "***" for API keys)
- Infer body content type (json, form, etc.)
- Generate descriptive names from the method + path
- Return ONLY the JSON array, no explanation, no markdown`;

export function AiRequestFromLogsModal({ onClose }: Props) {
  const [logs, setLogs] = useState('');
  const [result, setResult] = useState<unknown[] | null>(null);
  const [rawResult, setRawResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [imported, setImported] = useState(false);
  const [error, setError] = useState('');

  const accRef = useRef('');
  const reqIdRef = useRef('');
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
        try { setResult(JSON.parse(content)); } catch { setError('Could not parse AI output. Paste the logs again or add more context.'); }
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'Extraction failed.');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const run = () => {
    if (!logs.trim()) { setError('Paste your server logs first.'); return; }
    setLoading(true);
    setRawResult('');
    setResult(null);
    setError('');
    accRef.current = '';
    const pid = `ai-logs-${Date.now()}`;
    reqIdRef.current = pid;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'import.logs',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt: `Extract API requests from these server logs:\n\n${logs.slice(0, 8000)}`,
      conversation: [], tools: [],
      settings: { temperature: 0.1, maxTokens: 3000, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  const importAsCollection = () => {
    if (!result) return;
    try {
      const collId = `logs-import-${Date.now()}`;
      postMsg({ type: 'createCollection', id: collId, name: 'Imported from Logs', protocol: 'rest' });
      setImported(true);
      addToast({ type: 'success', message: `${result.length} requests imported as collection!` });
      setTimeout(onClose, 1500);
    } catch {
      setError('Failed to import.');
    }
  };

  const EXAMPLE_LOG = `192.168.1.1 - - [08/Jun/2026:10:30:00] "GET /api/v1/users?page=1&limit=10 HTTP/1.1" 200 1234
192.168.1.2 - - [08/Jun/2026:10:30:01] "POST /api/v1/users HTTP/1.1" 201 89
192.168.1.1 - - [08/Jun/2026:10:30:05] "GET /api/v1/users/42 HTTP/1.1" 200 456
192.168.1.3 - - [08/Jun/2026:10:30:10] "DELETE /api/v1/users/42 HTTP/1.1" 204 0`;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[680px] max-h-[90vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Request from Logs</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Paste server access logs → AI extracts requests → creates collection</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Server logs</label>
              <button type="button" onClick={() => setLogs(EXAMPLE_LOG)}
                className="text-[10px] cursor-pointer" style={{ color: ACCENT }}>
                Load example
              </button>
            </div>
            <textarea
              autoFocus
              value={logs}
              onChange={e => { setLogs(e.target.value); setError(''); }}
              rows={10}
              className="w-full px-3 py-2 rounded-lg text-[11px] font-mono resize-none outline-none"
              placeholder="Paste Apache/nginx access logs, Express server output, curl verbose output, or any HTTP traffic..."
              style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
            />
            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Supports Apache/nginx access logs, Express debug output, curl -v output, Wireshark HTTP export
            </p>
          </div>

          {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

          {loading && !rawResult && (
            <div className="flex gap-1 items-center">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
              ))}
              <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Extracting requests from logs…</span>
            </div>
          )}

          {result && (
            <div className="rounded-lg border p-3"
              style={{ borderColor: `color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`, backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-panel))` }}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: ACCENT }}>✦ {result.length} unique requests found</p>
              <div className="flex flex-col gap-1">
                {(result as Array<Record<string, unknown>>).slice(0, 8).map((req, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white min-w-[38px] text-center"
                      style={{ backgroundColor: 'var(--color-info)' }}>
                      {req.method as string}
                    </span>
                    <span className="text-[10.5px] font-mono truncate" style={{ color: 'var(--color-text-secondary)' }}>
                      {req.url as string}
                    </span>
                  </div>
                ))}
                {result.length > 8 && (
                  <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>...and {result.length - 8} more</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0 gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
          {result && !loading && (
            <button type="button" onClick={importAsCollection} disabled={imported}
              className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-60 flex items-center gap-1.5 text-white"
              style={{ backgroundColor: imported ? 'var(--color-success)' : ACCENT }}>
              {imported ? <><CheckIcon size={12} /> Imported!</> : <><SparkleIcon size={11} /> Import as Collection</>}
            </button>
          )}
          <button type="button" onClick={run} disabled={loading || !logs.trim()}
            className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-40 text-white"
            style={{ backgroundColor: ACCENT }}>
            <SparkleIcon size={11} className="inline mr-1" />
            Extract Requests
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
