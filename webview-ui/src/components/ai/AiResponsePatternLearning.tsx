/**
 * AiResponsePatternLearning — AI learns API response patterns and alerts on anomalies.
 * Feature 4.6.6 — AI Response Pattern Learning
 *
 * Records baseline response shapes per endpoint. Compares new responses against baseline.
 * Shows an alert badge when something looks "off".
 */
import { useState, useEffect, useRef } from 'react';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';
import { AIButtonView } from '../../dui';

interface PatternRecord {
  url: string;
  method: string;
  sampleBody: string;
  recordedAt: number;
}

interface Props {
  responseBody: string;
  method: string;
  url: string;
  status: number;
}

const STORAGE_KEY = 'daakia:response-patterns';
const ACCENT = 'var(--color-protocol-ai)';
const WARN = 'var(--color-warning)';

function loadPatterns(): PatternRecord[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function savePatterns(patterns: PatternRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(patterns.slice(-200)));
}

export function AiResponsePatternLearning({ responseBody, method, url, status }: Props) {
  const [anomaly, setAnomaly] = useState('');
  const [checking, setChecking] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [open, setOpen] = useState(false);
  const hasBaseline = useRef(false);
  const accRef = useRef('');
  const reqIdRef = useRef('');

  useEffect(() => {
    if (!responseBody || status >= 400) return;
    const patterns = loadPatterns();
    const key = `${method.toUpperCase()}:${url}`;
    const existing = patterns.filter(p => `${p.method}:${p.url}` === key);
    if (existing.length === 0) {
      hasBaseline.current = false;
      return;
    }
    hasBaseline.current = true;
    // Check for anomaly with AI
    checkAnomaly(existing[existing.length - 1].sampleBody, responseBody);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responseBody, url, method]);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;
      if (msg.type === 'ai:chunk') {
        accRef.current += (msg.delta as string) || '';
      }
      if (msg.type === 'ai:complete') {
        const content = accRef.current || '';
        setChecking(false);
        if (content.toLowerCase().includes('anomaly') || content.toLowerCase().includes('changed') || content.toLowerCase().includes('different')) {
          setAnomaly(content);
        }
      }
      if (msg.type === 'ai:error') setChecking(false);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const checkAnomaly = (baseline: string, current: string) => {
    setChecking(true);
    accRef.current = '';
    const pid = `ai-pattern-${Date.now()}`;
    reqIdRef.current = pid;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'rest.pattern.check',
      systemPrompts: ['You are an API response anomaly detector. Compare two API responses and identify structural changes, missing/added fields, or type changes. Be concise. If no anomaly, say "No anomaly detected." If anomaly found, say "Anomaly:" then describe it in 1-2 sentences.'],
      userPrompt: `Baseline response:\n${baseline.slice(0, 2000)}\n\nCurrent response:\n${current.slice(0, 2000)}`,
      conversation: [], tools: [],
      settings: { temperature: 0.1, maxTokens: 300, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  const recordBaseline = () => {
    if (!responseBody || status >= 400) return;
    const patterns = loadPatterns();
    const record: PatternRecord = { url, method: method.toUpperCase(), sampleBody: responseBody.slice(0, 3000), recordedAt: Date.now() };
    const filtered = patterns.filter(p => !(p.method === record.method && p.url === record.url));
    savePatterns([...filtered, record]);
    setRecorded(true);
    hasBaseline.current = true;
    setTimeout(() => setRecorded(false), 2000);
  };

  if (status >= 400 || !responseBody) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Anomaly alert */}
      {anomaly && (
        <button type="button" onClick={() => setOpen(p => !p)}
          className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border cursor-pointer animate-pulse"
          style={{ color: WARN, borderColor: `color-mix(in srgb, ${WARN} 40%, transparent)`, backgroundColor: `color-mix(in srgb, ${WARN} 10%, transparent)` }}>
          ⚠ Pattern anomaly
        </button>
      )}

      {/* Record Baseline — AIButtonView xs, dynamic accent (soap red → success green on record) */}
      {(() => {
        const c = recorded ? 'var(--color-success)' : 'var(--color-protocol-soap)';
        const label = recorded ? 'Recorded!' : checking ? 'Checking…' : hasBaseline.current ? 'Update Baseline' : 'Record Baseline';
        return (
          <AIButtonView
            action="ask"
            label={label}
            size="xs"
            accentColor={c}
            onClick={recordBaseline}
          />
        );
      })()}

      {/* Anomaly detail popover */}
      {open && anomaly && (
        <div className="absolute top-full mt-1 right-0 z-50 w-[320px] rounded-xl border p-3 shadow-xl"
          style={{ backgroundColor: 'var(--color-panel)', borderColor: `color-mix(in srgb, ${WARN} 40%, var(--color-surface-border))` }}>
          <p className="text-[11px] font-semibold mb-1.5" style={{ color: WARN }}>⚠ Pattern Anomaly Detected</p>
          <MdViewer content={anomaly} />
          <button type="button" onClick={() => setOpen(false)} className="mt-2 text-[10px] cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
