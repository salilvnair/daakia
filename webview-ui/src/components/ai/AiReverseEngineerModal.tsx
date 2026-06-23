/**
 * AiReverseEngineerModal — paste a HAR export or JSON request log
 * and let AI analyze the traffic to generate a Daakia collection.
 *
 * Feature 4.6.2 — AI Reverse Engineer from Website
 *
 * Workflow:
 * 1. User exports HAR from browser DevTools (Network → Save as HAR)
 * 2. Pastes the JSON here (or drags in the file)
 * 3. AI filters API calls (XHR/Fetch), deduplicates, groups by base URL
 * 4. User reviews and creates collection
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { postMsg } from '../../vscode';
import { SparkleIcon, CloseCircleIcon, FolderImportIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { ModalView, AIButtonView, MultilineInputView, ButtonView } from '@salilvnair/dui';

// ─── HAR types (minimal) ──────────────────────────────────────────────────────

interface HarHeader { name: string; value: string }
interface HarPostData { mimeType: string; text?: string; params?: { name: string; value: string }[] }
interface HarRequest {
  method: string;
  url: string;
  headers: HarHeader[];
  postData?: HarPostData;
  queryString?: { name: string; value: string }[];
}
interface HarEntry {
  time: number;
  request: HarRequest;
  response: { status: number; statusText: string; headers: HarHeader[]; content: { mimeType: string; text?: string; size: number } };
}
interface HarLog { entries: HarEntry[] }
interface HarFile { log: HarLog }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Filter entries to only API-ish requests (XHR/Fetch returning JSON/XML) */
function filterApiEntries(entries: HarEntry[]): HarEntry[] {
  return entries.filter(e => {
    const url = e.request.url;
    const method = e.request.method.toUpperCase();
    const responseMime = e.response.content.mimeType ?? '';
    const status = e.response.status;

    // Skip static assets
    if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|html)(\?|$)/i.test(url)) return false;
    if (/\.(chunk|bundle)\./i.test(url)) return false;

    // Keep if response is JSON/XML/text or request has JSON body or status suggests data
    const isDataResponse = /json|xml|text\/plain/i.test(responseMime);
    const isDataRequest = /json|xml/i.test(e.request.postData?.mimeType ?? '');
    const isApiMethod = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const isGoodStatus = status > 0 && status < 600;

    return isApiMethod && isGoodStatus && (isDataResponse || isDataRequest);
  });
}

/** Deduplicate by URL+method, keeping the first occurrence */
function deduplicateEntries(entries: HarEntry[]): HarEntry[] {
  const seen = new Set<string>();
  return entries.filter(e => {
    // Normalize dynamic IDs in URL (UUID-like, numeric segments)
    const normalized = e.request.url
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/{id}')
      .replace(/\/\d{2,}/g, '/{id}')
      .replace(/[?#].*/g, ''); // strip query + fragment
    const key = `${e.request.method}:${normalized}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatEntriesForAi(entries: HarEntry[]): string {
  const lines = [`${entries.length} API requests found:\n`];
  entries.slice(0, 50).forEach((e, i) => {
    const url = new URL(e.request.url);
    const path = url.pathname + (url.search.length > 40 ? url.search.slice(0, 40) + '…' : url.search);
    const body = e.request.postData?.text?.slice(0, 100);
    lines.push(`${i + 1}. [${e.request.method}] ${path} → ${e.response.status} (${e.response.content.mimeType.split(';')[0]})`);
    if (body) lines.push(`   Body: ${body}${(e.request.postData?.text?.length ?? 0) > 100 ? '…' : ''}`);
  });
  if (entries.length > 50) lines.push(`\n... and ${entries.length - 50} more`);
  return lines.join('\n');
}

type Phase = 'idle' | 'parsed' | 'analyzing' | 'analyzed';

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export function AiReverseEngineerModal({ onClose }: Props) {
  const openDaakiaAiTab = useTabsStore(s => s.openDaakiaAiTab);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rawText, setRawText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [parsedEntries, setParsedEntries] = useState<HarEntry[]>([]);
  const [parseError, setParseError] = useState('');
  const [analysis, setAnalysis] = useState('');

  const reqIdRef = useRef(`rev-${Date.now()}`);
  const accRef = useRef('');

  const ACCENT = 'var(--color-protocol-ai)';

  // Listen for AI streaming events
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (!msg || typeof msg !== 'object') return;
      const reqId = msg.reqId as string | undefined;
      if (reqId && reqId !== reqIdRef.current) return;

      switch (msg.type) {
        case 'ai:chunk': {
          const chunk = msg.chunk as { delta?: { content?: string } } | string;
          const delta = typeof chunk === 'string' ? chunk : (chunk?.delta?.content ?? '');
          accRef.current += delta;
          setAnalysis(accRef.current);
          break;
        }
        case 'ai:complete':
          setPhase('analyzed');
          break;
        case 'ai:error':
          setPhase('parsed');
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleParse = useCallback(() => {
    setParseError('');
    if (!rawText.trim()) return;

    try {
      let parsed: HarFile;
      // Try parsing as HAR
      try {
        const raw = JSON.parse(rawText) as HarFile | { log: HarLog } | HarEntry[];
        // Support bare array of entries
        if (Array.isArray(raw)) {
          parsed = { log: { entries: raw as HarEntry[] } };
        } else if ('log' in raw && raw.log?.entries) {
          parsed = raw as HarFile;
        } else {
          throw new Error('Not a valid HAR format');
        }
      } catch {
        throw new Error('Invalid JSON. Please paste a valid HAR export (from browser DevTools → Network → Save as HAR).');
      }

      const allEntries = parsed.log.entries ?? [];
      const filtered = filterApiEntries(allEntries);
      const deduped = deduplicateEntries(filtered);
      setParsedEntries(deduped);
      setPhase('parsed');
    } catch (e) {
      setParseError((e as Error).message);
    }
  }, [rawText]);

  const handleFileLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRawText(text);
    };
    reader.readAsText(file);
    // reset so same file can be re-selected
    e.target.value = '';
  }, []);

  const handleAnalyze = useCallback(() => {
    if (parsedEntries.length === 0) return;
    const summary = formatEntriesForAi(parsedEntries);
    accRef.current = '';
    setAnalysis('');
    setPhase('analyzing');
    reqIdRef.current = `rev-${Date.now()}`;
    postMsg({
      type: 'ai:send',
      reqId: reqIdRef.current,
      systemPrompt: 'You are a senior API developer. Analyze these network requests captured from a website and help the user understand and document the API.',
      messages: [{ role: 'user', content: `I captured these API calls from a website:\n\n${summary}\n\nPlease:\n1. Group them by feature/domain (auth, users, products, etc.)\n2. Describe what each endpoint does\n3. Identify the authentication pattern (JWT, cookie session, API key, etc.)\n4. Suggest collection folder structure\n5. Note any interesting patterns (pagination, versioning, etc.)` }],
      stream: true,
    });
  }, [parsedEntries]);

  const handleCreateCollection = useCallback(() => {
    if (parsedEntries.length === 0) return;
    openDaakiaAiTab();
    const summary = formatEntriesForAi(parsedEntries.slice(0, 30));
    postMsg({
      type: 'ai:chat:prefill',
      text: `Create a Daakia collection from these captured network requests:\n\n${summary}\n\nFor each request, create a properly named entry with method, URL, and relevant headers/body.`,
    });
    onClose();
  }, [parsedEntries, openDaakiaAiTab, onClose]);

  return (
    <ModalView
      open
      onClose={onClose}
      title="AI Reverse Engineer from Website"
      subtitle="Export a HAR file from browser DevTools → paste here → AI generates collection"
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ACCENT }}>
          <FolderImportIcon size={14} style={{ color: '#fff' }} />
        </div>
      }
      footerLeft={
        (phase === 'parsed' || phase === 'analyzing' || phase === 'analyzed') ? (
          <div className="flex items-center gap-2">
            <AIButtonView
              label={phase === 'analyzing' ? 'Analyzing…' : 'Analyze with AI'}
              size="md"
              accentColor={ACCENT}
              disabled={phase === 'analyzing' || parsedEntries.length === 0}
              loading={phase === 'analyzing'}
              onClick={handleAnalyze}
            />
            <ButtonView size="md" variant="secondary" disabled={parsedEntries.length === 0} onClick={handleCreateCollection}>
              Create Collection
            </ButtonView>
          </div>
        ) : undefined
      }
      footerRight={
        phase === 'idle' ? (
          <AIButtonView
            label="Parse & Filter API Calls"
            size="md"
            accentColor={ACCENT}
            disabled={!rawText.trim()}
            onClick={handleParse}
          />
        ) : (
          <ButtonView
            size="md"
            variant="secondary"
            onClick={() => { setPhase('idle'); setParsedEntries([]); setAnalysis(''); setRawText(''); }}
          >
            Reset
          </ButtonView>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {/* How to export HAR */}
        {phase === 'idle' && (
          <div
            className="rounded-lg border px-4 py-3 text-[11px] leading-relaxed"
            style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface)' }}
          >
            <strong style={{ color: 'var(--color-text-secondary)' }}>How to export a HAR file:</strong>
            <ol className="list-decimal list-inside mt-1 space-y-0.5">
              <li>Open the website in Chrome/Edge/Firefox</li>
              <li>Open DevTools (F12) → go to Network tab</li>
              <li>Browse the website to capture API calls</li>
              <li>Right-click anywhere in the Network tab → "Save all as HAR with content"</li>
              <li>Paste the file content below (or click "Load File")</li>
            </ol>
          </div>
        )}

        {/* File load + textarea */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              Paste HAR JSON content
            </label>
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept=".har,.json" className="hidden" onChange={handleFileLoad} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-[22px] px-2 text-[10px] rounded-md border cursor-pointer hover:opacity-80 transition-opacity"
                style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-panel)' }}
              >
                Load .har File
              </button>
              {rawText && (
                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  {(rawText.length / 1024).toFixed(0)} kB pasted
                </span>
              )}
            </div>
          </div>
          <MultilineInputView
            value={rawText.slice(0, 200000)}
            onChange={e => { setRawText(e.target.value); setPhase('idle'); setParseError(''); }}
            rows={6}
            size="md"
            width="fw"
            placeholder='{"log": {"entries": [...]}}'
          />
          {parseError && (
            <p className="text-[10.5px] mt-1" style={{ color: 'var(--color-error)' }}>{parseError}</p>
          )}
        </div>

        {/* Parsed results summary */}
        {(phase === 'parsed' || phase === 'analyzing' || phase === 'analyzed') && (
          <div
            className="rounded-lg border p-3 text-[11px]"
            style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface)' }}
          >
            <div className="font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
              Found {parsedEntries.length} unique API endpoints
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
              {parsedEntries.map((e, i) => {
                const url = new URL(e.request.url);
                const path = url.pathname.length > 50 ? url.pathname.slice(0, 47) + '…' : url.pathname;
                return (
                  <div key={i} className="flex items-center gap-2 py-0.5 font-mono">
                    <span className="w-[42px] flex-shrink-0 font-bold text-[10px]" style={{ color: 'var(--color-success)' }}>
                      {e.request.method}
                    </span>
                    <span className="flex-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>{path}</span>
                    <span className="flex-shrink-0 text-[10px]" style={{ color: e.response.status < 400 ? 'var(--color-success)' : 'var(--color-error)' }}>
                      {e.response.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* AI analysis */}
        {(phase === 'analyzing' || phase === 'analyzed') && analysis && (
          <div className="rounded-lg border p-3" style={{ borderColor: `color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))` }}>
            <div className="text-[11px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: ACCENT }}>
              <SparkleIcon size={12} />
              AI Analysis
              {phase === 'analyzing' && <span className="text-[10px] animate-pulse ml-1" style={{ color: 'var(--color-text-muted)' }}>analyzing…</span>}
            </div>
            <div className="text-[12px]"><MdViewer content={analysis} /></div>
          </div>
        )}
      </div>
    </ModalView>
  );
}
