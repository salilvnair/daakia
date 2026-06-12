/**
 * AiRequestFuzzerModal — AI-powered API fuzzer that generates edge-case payloads
 * to discover bugs, crashes, and unexpected behavior.
 *
 * Feature 4.6.4 — AI Request Fuzzer
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { postMsg } from '../../vscode';
import { SparkleIcon, PlayIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { ModalView, ButtonView } from '../../dui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FuzzPayload {
  category: string;
  name: string;
  description: string;
  body: string;
}

interface FuzzResult {
  payload: FuzzPayload;
  status: number;
  statusText: string;
  duration: number;
  body: string;
  anomaly?: string;
}

type Phase = 'idle' | 'generating' | 'generated' | 'running' | 'done' | 'analyzing' | 'analyzed';

// ─── Fuzz categories ──────────────────────────────────────────────────────────

const FUZZ_SYSTEM_PROMPT = `You are a security-focused API testing expert.
Given an API request body template, generate edge-case test payloads to find bugs.

Generate a JSON array of test cases. Each case must be:
{
  "category": "sql-injection" | "xss" | "empty-fields" | "huge-values" | "type-mismatch" | "unicode" | "null-values" | "boundary",
  "name": "short name",
  "description": "what this tests",
  "body": "the complete JSON body as a string (valid JSON)"
}

Generate 8-12 diverse cases covering:
1. SQL injection strings in text fields
2. XSS payloads in text fields
3. Empty strings for required fields
4. Extremely large numbers (Integer.MAX_VALUE, huge floats)
5. Wrong types (number where string expected, etc.)
6. Unicode edge cases (null bytes, emoji, RTL text, zero-width chars)
7. Null values for required fields
8. Boundary values (0, -1, MAX_INT for numbers; very long strings for text)

Output ONLY valid JSON array, no markdown or explanation.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectAnomaly(status: number, body: string): string | undefined {
  if (status === 500) return '⚠️ Server error — possible crash or unhandled exception';
  if (status === 200 && body.toLowerCase().includes('error')) return '⚠️ 200 response contains "error" text — possible silent failure';
  if (body.toLowerCase().includes('exception') || body.toLowerCase().includes('stacktrace')) return '⚠️ Stack trace leaked in response';
  if (body.toLowerCase().includes('syntax error') || body.toLowerCase().includes('sql error')) return '⚠️ SQL error leaked — possible injection vulnerability';
  if (body.includes('<script>') || body.includes('javascript:')) return '⚠️ XSS payload reflected in response';
  if (status === 413) return 'Payload too large (expected)';
  if (status === 422 || status === 400) return 'Validation rejected (expected)';
  if (status === 200 || status === 201) return '✓ Accepted — may need manual review';
  return undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export function AiRequestFuzzerModal({ onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));

  const [phase, setPhase] = useState<Phase>('idle');
  const [payloads, setPayloads] = useState<FuzzPayload[]>([]);
  const [results, setResults] = useState<FuzzResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [analysis, setAnalysis] = useState('');
  const [parseError, setParseError] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(['sql-injection', 'xss', 'empty-fields', 'huge-values', 'type-mismatch', 'unicode', 'null-values', 'boundary']),
  );

  const reqIdRef = useRef(`fuzz-${Date.now()}`);
  const accRef = useRef('');
  const currentRunRef = useRef<number>(0);

  const categories = [
    { id: 'sql-injection', label: 'SQL Injection', color: 'var(--color-error)' },
    { id: 'xss', label: 'XSS', color: 'var(--color-protocol-soap)' },
    { id: 'empty-fields', label: 'Empty Fields', color: 'var(--color-warning)' },
    { id: 'huge-values', label: 'Huge Values', color: 'var(--color-method-put)' },
    { id: 'type-mismatch', label: 'Type Mismatch', color: 'var(--color-protocol-mqtt)' },
    { id: 'unicode', label: 'Unicode', color: 'var(--color-method-head)' },
    { id: 'null-values', label: 'Null Values', color: 'var(--color-text-muted)' },
    { id: 'boundary', label: 'Boundary', color: 'var(--color-success)' },
  ];

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (!msg || typeof msg !== 'object') return;

      switch (msg.type) {
        case 'fuzz:result': {
          if (msg.runId !== currentRunRef.current) return;
          const result = msg as unknown as FuzzResult & { runId: number };
          setResults(prev => [...prev, result]);
          setCurrentIndex(prev => prev + 1);
          if ((msg.done as boolean)) setPhase('done');
          break;
        }
        case 'ai:chunk': {
          const reqId = msg.reqId as string | undefined;
          if (reqId !== reqIdRef.current) return;
          const chunk = msg.chunk as { delta?: { content?: string } } | string;
          const delta = typeof chunk === 'string' ? chunk : (chunk?.delta?.content ?? '');
          accRef.current += delta;
          if (phase === 'analyzing') {
            setAnalysis(accRef.current);
          }
          break;
        }
        case 'ai:complete': {
          const reqId = msg.reqId as string | undefined;
          if (reqId !== reqIdRef.current) return;
          if (phase === 'generating') {
            try {
              const generated = JSON.parse(accRef.current.trim()) as FuzzPayload[];
              const filtered = generated.filter(p => selectedCategories.has(p.category));
              setPayloads(filtered);
              setPhase('generated');
              setParseError('');
            } catch {
              setParseError('AI returned invalid JSON. Please try again.');
              setPhase('idle');
            }
          } else if (phase === 'analyzing') {
            setPhase('analyzed');
          }
          break;
        }
        case 'ai:error': {
          const reqId = msg.reqId as string | undefined;
          if (reqId !== reqIdRef.current) return;
          setPhase(phase === 'generating' ? 'idle' : 'done');
          break;
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [phase, selectedCategories]);

  const handleGenerate = useCallback(() => {
    if (!activeTab?.bodyRaw?.trim()) return;
    accRef.current = '';
    setPayloads([]);
    setResults([]);
    setParseError('');
    setPhase('generating');
    reqIdRef.current = `fuzz-${Date.now()}`;

    const userMessage = `API request to fuzz:
- Method: ${activeTab.method}
- URL: ${activeTab.url}
- Content-Type: ${activeTab.bodyContentType || 'application/json'}
- Request body template:
\`\`\`json
${activeTab.bodyRaw.slice(0, 1000)}
\`\`\`

Categories to include: ${Array.from(selectedCategories).join(', ')}

Generate the fuzz payloads:`;

    postMsg({
      type: 'ai:send',
      reqId: reqIdRef.current,
      systemPrompt: FUZZ_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      stream: true,
    });
  }, [activeTab, selectedCategories]);

  const handleRunFuzz = useCallback(() => {
    if (payloads.length === 0 || !activeTab) return;
    const runId = Date.now();
    currentRunRef.current = runId;
    setResults([]);
    setCurrentIndex(0);
    setPhase('running');

    postMsg({
      type: 'fuzz:run',
      runId,
      tabId: activeTab.id,
      method: activeTab.method,
      url: activeTab.url,
      headers: activeTab.headers,
      authType: activeTab.authType,
      authData: activeTab.authData,
      envId: activeTab.envId,
      payloads: payloads.map((p, i) => ({ index: i, body: p.body, name: p.name })),
    });
  }, [payloads, activeTab]);

  const handleAnalyze = useCallback(() => {
    if (results.length === 0) return;
    const anomalies = results.filter(r => r.anomaly && !r.anomaly.startsWith('✓') && !r.anomaly.startsWith('Validation'));
    const summary = results.map(r =>
      `[${r.status}] ${r.payload.category}/${r.payload.name}: ${r.anomaly || 'no anomaly'}`,
    ).join('\n');

    accRef.current = '';
    setAnalysis('');
    setPhase('analyzing');
    reqIdRef.current = `fuzz-analyze-${Date.now()}`;

    postMsg({
      type: 'ai:send',
      reqId: reqIdRef.current,
      systemPrompt: 'You are a security expert analyzing API fuzz test results.',
      messages: [{
        role: 'user',
        content: `Fuzz test results for ${activeTab?.method} ${activeTab?.url}:\n\n${summary}\n\nAnomalies found: ${anomalies.length}\n\nAnalyze these results:\n1. What security vulnerabilities were found?\n2. Which unexpected behaviors need investigation?\n3. What should the developer fix first?\n4. Rate the overall security level (1-10)`,
      }],
      stream: true,
    });
  }, [results, activeTab]);

  const filtered = payloads.filter(p => selectedCategories.has(p.category));

  const handleReset = () => { setPhase('idle'); setPayloads([]); setResults([]); setAnalysis(''); };

  const footerLeft = (() => {
    if (phase === 'idle') return (
      <ButtonView
        variant="danger"
        size="sm"
        iconLeft={<SparkleIcon size={11} />}
        onClick={handleGenerate}
        disabled={!activeTab?.bodyRaw?.trim() || selectedCategories.size === 0}
      >
        Generate Payloads with AI
      </ButtonView>
    );
    if (phase === 'generating') return (
      <span className="animate-pulse" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
        Generating fuzz payloads…
      </span>
    );
    if (phase === 'generated' || phase === 'done') return (
      <>
        <ButtonView
          variant="danger"
          size="sm"
          iconLeft={<PlayIcon size={11} />}
          onClick={handleRunFuzz}
          disabled={phase === 'running' || payloads.length === 0}
        >
          Run Fuzz Tests ({filtered.length})
        </ButtonView>
        {phase === 'done' && (
          <ButtonView
            variant="ghost"
            size="sm"
            iconLeft={<SparkleIcon size={11} />}
            onClick={handleAnalyze}
            style={{
              border: '1px solid var(--color-error)',
              color: 'var(--color-error)',
              backgroundColor: 'color-mix(in srgb, var(--color-error) 6%, transparent)',
            }}
          >
            Analyze Results
          </ButtonView>
        )}
      </>
    );
    return undefined;
  })();

  const footerRight = (phase === 'generated' || phase === 'done')
    ? <ButtonView variant="secondary" size="sm" onClick={handleReset}>Reset</ButtonView>
    : undefined;

  const headerIcon = (
    <div style={{
      width: 32, height: 32, borderRadius: 8,
      backgroundColor: 'var(--color-error)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <SparkleIcon size={15} style={{ color: 'var(--color-btn-primary-text, #fff)' }} />
    </div>
  );

  return (
    <ModalView
      open={true}
      onClose={onClose}
      title="AI Request Fuzzer"
      subtitle={`Generate edge-case payloads to find API bugs • ${activeTab?.method} ${activeTab?.url?.slice(0, 40) || 'No request'}`}
      headerIcon={headerIcon}
      headerColor="var(--color-error)"
      headerGradient
      size="lg"
      footerLeft={footerLeft}
      footerRight={footerRight}
    >
      <div className="flex flex-col gap-4">
        {/* Category selector */}
        {(phase === 'idle' || phase === 'generated') && (
          <div>
            <label className="text-[11px] font-medium mb-2 block" style={{ color: 'var(--color-text-muted)' }}>
              Attack categories to fuzz:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    const next = new Set(selectedCategories);
                    if (next.has(cat.id)) next.delete(cat.id);
                    else next.add(cat.id);
                    setSelectedCategories(next);
                  }}
                  className="h-[22px] px-2.5 text-[10.5px] font-medium rounded-full border cursor-pointer transition-all"
                  style={{
                    borderColor: selectedCategories.has(cat.id) ? cat.color : 'var(--color-surface-border)',
                    color: selectedCategories.has(cat.id) ? cat.color : 'var(--color-text-muted)',
                    backgroundColor: selectedCategories.has(cat.id)
                      ? `color-mix(in srgb, ${cat.color} 9%, transparent)`
                      : 'transparent',
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!activeTab?.bodyRaw?.trim() && (
          <div
            className="rounded-lg p-3 text-[11px] text-center"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-muted)' }}
          >
            ⚠️ No request body found. Open a request with a JSON body, then come back to fuzz it.
          </div>
        )}

        {parseError && (
          <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{parseError}</p>
        )}

        {/* Generated payloads list */}
        {(phase === 'generated' || phase === 'running' || phase === 'done' || phase === 'analyzing' || phase === 'analyzed') && payloads.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              {payloads.length} fuzz payloads generated
            </div>
            <div className="overflow-y-auto rounded-lg border" style={{ maxHeight: 220, borderColor: 'var(--color-surface-border)' }}>
              {filtered.map((p, i) => {
                const result = results[i];
                const cat = categories.find(c => c.id === p.category);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-1.5 border-b text-[11px]"
                    style={{ borderColor: 'var(--color-surface-border)' }}
                  >
                    <span
                      className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded font-medium"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${cat?.color ?? 'var(--color-text-muted)'} 12%, transparent)`,
                        color: cat?.color ?? 'var(--color-text-muted)',
                      }}
                    >
                      {p.category}
                    </span>
                    <span className="flex-1 truncate" style={{ color: 'var(--color-text-primary)' }}>{p.name}</span>
                    {result ? (
                      <span
                        className="flex-shrink-0 font-mono font-bold text-[10px]"
                        style={{ color: result.status < 500 ? 'var(--color-text-muted)' : 'var(--color-error)' }}
                      >
                        {result.status}
                      </span>
                    ) : phase === 'running' && currentIndex === i ? (
                      <span className="flex-shrink-0 text-[10px] animate-pulse" style={{ color: 'var(--color-text-muted)' }}>running…</span>
                    ) : null}
                    {result?.anomaly && (
                      <span
                        className="flex-shrink-0 text-[9.5px] truncate max-w-[160px]"
                        style={{ color: result.anomaly.startsWith('⚠️') ? 'var(--color-error)' : 'var(--color-success)' }}
                      >
                        {result.anomaly}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Progress bar during run */}
        {phase === 'running' && (
          <div>
            <div className="flex justify-between text-[11px] mb-1" style={{ color: 'var(--color-text-muted)' }}>
              <span>Running fuzz tests…</span>
              <span>{currentIndex} / {payloads.length}</span>
            </div>
            <div className="h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-border)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${(currentIndex / payloads.length) * 100}%`, backgroundColor: 'var(--color-error)' }}
              />
            </div>
          </div>
        )}

        {/* AI analysis */}
        {(phase === 'analyzing' || phase === 'analyzed') && analysis && (
          <div
            className="rounded-lg border p-3"
            style={{ borderColor: 'color-mix(in srgb, var(--color-error) 25%, var(--color-surface-border))' }}
          >
            <div className="text-[11px] font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--color-error)' }}>
              <SparkleIcon size={12} />
              Security Analysis
              {phase === 'analyzing' && (
                <span className="text-[10px] animate-pulse ml-1" style={{ color: 'var(--color-text-muted)' }}>analyzing…</span>
              )}
            </div>
            <div className="text-[12px]"><MdViewer content={analysis} /></div>
          </div>
        )}
      </div>
    </ModalView>
  );
}
