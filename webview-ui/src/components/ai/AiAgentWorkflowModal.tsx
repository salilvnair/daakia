/**
 * AiAgentWorkflowModal — Multi-step autonomous agent: "Test this entire collection
 * and report failures with fixes" (4.5.3)
 *
 * Phase 1: Runs the collection via runCollection → shows per-request results in real-time.
 * Phase 2: Automatically sends failures (and all results) to AI for diagnosis + fix suggestions.
 * Phase 3: Streams the comprehensive AI report with root causes + actionable fixes.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { postMsg } from '../../vscode';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { CloseIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { METHOD_COLORS } from '../../colors';

interface RequestResult {
  id: string;
  name: string;
  method: string;
  url: string;
  status: number;
  statusText: string;
  time: number;
  size: number;
  error?: string;
}

interface Props {
  collectionId: string;
  collectionName: string;
  protocol?: string;
  onClose: () => void;
}

type Phase = 'idle' | 'running' | 'analyzing' | 'done';

const ACCENT = 'var(--color-success)';

/** Format collection run results as a readable string for the AI */
function formatResultsForAi(results: RequestResult[]): string {
  return results.map((r, i) => {
    const statusStr = r.error
      ? `Error: ${r.error.slice(0, 80)}`
      : `${r.status} ${r.statusText || ''}`.trim();
    const sizeStr = r.size > 0 ? ` | ${(r.size / 1024).toFixed(1)} KB` : '';
    const label = r.name || r.url;
    return `${i + 1}. [${r.method}] ${label}\n   URL: ${r.url}\n   Status: ${statusStr} | Time: ${r.time}ms${sizeStr}`;
  }).join('\n\n');
}

export function AiAgentWorkflowModal({ collectionId, collectionName, protocol, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [results, setResults] = useState<RequestResult[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [summary, setSummary] = useState<{ total: number; passed: number; failed: number; duration: number } | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [analysisError, setAnalysisError] = useState('');

  const reqIdRef = useRef('');
  const accRef = useRef('');
  const resolveTemplate = useAiPromptTemplatesStore(s => s.resolve);

  // ── Listen for collection run events + AI streaming ──────────────────────
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;

      // Phase 1: collection run progress
      if (msg.type === 'runCollectionProgress') {
        setResults(prev => [...prev, msg.result as RequestResult]);
        setProgress({ current: (msg.index as number) + 1, total: msg.total as number });
      }
      if (msg.type === 'runCollectionComplete') {
        setSummary({
          total: msg.total as number,
          passed: msg.passed as number,
          failed: msg.failed as number,
          duration: msg.duration as number,
        });
        setPhase('analyzing');
      }

      // Phase 2: AI streaming
      if (msg.type === 'ai:chunk' && msg.reqId === reqIdRef.current) {
        accRef.current += (msg.delta as string) || '';
        setAnalysis(accRef.current);
      }
      if (msg.type === 'ai:complete' && msg.reqId === reqIdRef.current) {
        setPhase('done');
      }
      if (msg.type === 'ai:error' && msg.reqId === reqIdRef.current) {
        setAnalysisError((msg.error as string) || 'AI analysis failed');
        setPhase('done');
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── Trigger AI analysis when phase becomes 'analyzing' ───────────────────
  useEffect(() => {
    if (phase !== 'analyzing') return;
    const currentResults = results; // capture snapshot
    const reqId = `agent-wf-${Date.now()}`;
    reqIdRef.current = reqId;
    accRef.current = '';
    setAnalysis('');
    setAnalysisError('');

    const resultText = formatResultsForAi(currentResults);
    const failCount = currentResults.filter(r => r.error || r.status >= 400).length;
    const envName = protocol ? `${protocol} collection` : 'REST collection';

    const prompt = resolveTemplate('rest.agent.workflow', {
      collectionName,
      environment: envName,
      results: failCount === 0
        ? `All ${currentResults.length} requests passed.\n\n${resultText}`
        : `${currentResults.length} total, ${failCount} failed.\n\n${resultText}`,
    });
    const systemPrompt = resolveTemplate('rest.agent.workflow.system');

    postMsg({
      type: 'ai:send',
      reqId,
      systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });
  }, [phase, collectionName, protocol, resolveTemplate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start collection run ──────────────────────────────────────────────────
  const handleStart = () => {
    setResults([]);
    setProgress(null);
    setSummary(null);
    setAnalysis('');
    setAnalysisError('');
    setPhase('running');
    postMsg({
      type: 'runCollection',
      collectionId,
      delay: 300,
      stopOnError: false,
      persistResponses: false,
      keepVariables: true,
    });
  };

  const handleStop = () => {
    postMsg({ type: 'stopCollectionRun' });
    setPhase('idle');
  };

  // ── Status chip ───────────────────────────────────────────────────────────
  const statusChip = (result: RequestResult) => {
    const failed = result.error || result.status >= 400;
    const color = failed ? 'var(--color-error)' : 'var(--color-success)';
    const label = result.error ? 'ERR' : String(result.status);
    return (
      <span
        className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded"
        style={{ color, backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}
      >
        {label}
      </span>
    );
  };

  // ── Phase labels ──────────────────────────────────────────────────────────
  const phaseLabel =
    phase === 'idle' ? 'Ready to run'
    : phase === 'running' ? `Running requests${progress ? ` (${progress.current}/${progress.total})` : ''}...`
    : phase === 'analyzing' ? 'AI analyzing results...'
    : 'Analysis complete';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div
        className="w-full max-w-[700px] rounded-xl border shadow-2xl animate-[fadeSlideIn_150ms_ease-out] flex flex-col"
        style={{
          backgroundColor: 'var(--color-elevated)',
          borderColor: 'var(--color-elevated-border)',
          maxHeight: '88vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-3 border-b" style={{ borderColor: 'var(--color-elevated-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT, flexShrink: 0 }} />
          <span className="font-semibold text-[13px] flex-1 truncate" style={{ color: ACCENT }}>
            AI Agent Workflow
          </span>
          <span className="text-[12px] font-medium truncate mr-2" style={{ color: 'var(--color-text-secondary)' }}>
            {collectionName}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Phase status bar */}
        <div
          className="flex items-center gap-2 px-4 py-1.5 text-[11px]"
          style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 8%, var(--color-panel))`, color: ACCENT }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: ACCENT,
              animation: phase === 'running' || phase === 'analyzing' ? 'pulse 1s infinite' : 'none',
            }}
          />
          {phaseLabel}
        </div>

        {/* Body: split into results + analysis */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Idle state — start button */}
          {phase === 'idle' && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                Click below to run all requests and get an AI-powered test report.
              </p>
              <button
                type="button"
                onClick={handleStart}
                className="h-[32px] px-5 text-[12px] font-semibold rounded-lg text-white cursor-pointer hover:opacity-90 transition-opacity flex items-center gap-2"
                style={{ backgroundColor: ACCENT }}
              >
                <SparkleIcon size={13} />
                Start Agent Workflow
              </button>
            </div>
          )}

          {/* Results list (during + after run) */}
          {phase !== 'idle' && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Request results */}
              <div
                className="overflow-y-auto [scrollbar-gutter:stable]"
                style={{ maxHeight: phase === 'done' || phase === 'analyzing' ? '220px' : '320px' }}
              >
                {results.length === 0 && phase === 'running' && (
                  <div className="flex items-center justify-center py-6">
                    <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>Starting...</span>
                  </div>
                )}
                {results.map((r, i) => (
                  <div
                    key={r.id || i}
                    className="flex items-center gap-2 px-4 py-1.5 border-b text-[11.5px]"
                    style={{ borderColor: 'var(--color-surface-border)' }}
                  >
                    <span
                      className="text-[10px] font-mono font-bold w-[42px] text-center rounded px-1 flex-shrink-0"
                      style={{ color: METHOD_COLORS[r.method as keyof typeof METHOD_COLORS] || 'var(--color-text-secondary)' }}
                    >
                      {r.method}
                    </span>
                    <span className="flex-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                      {r.name || r.url}
                    </span>
                    {statusChip(r)}
                    <span className="text-[10px] w-[52px] text-right flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                      {r.time}ms
                    </span>
                  </div>
                ))}
              </div>

              {/* Summary row */}
              {summary && (
                <div
                  className="flex items-center gap-4 px-4 py-2 text-[11px] border-b"
                  style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}
                >
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {summary.total} requests · {(summary.duration / 1000).toFixed(1)}s
                  </span>
                  <span style={{ color: 'var(--color-success)' }}>✓ {summary.passed} passed</span>
                  {summary.failed > 0 && (
                    <span style={{ color: 'var(--color-error)' }}>✗ {summary.failed} failed</span>
                  )}
                </div>
              )}

              {/* Stop button during run */}
              {phase === 'running' && (
                <div className="flex justify-end px-4 py-2">
                  <button
                    type="button"
                    onClick={handleStop}
                    className="h-[26px] px-3 text-[11px] rounded cursor-pointer hover:opacity-90 transition-opacity border"
                    style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
                  >
                    Stop
                  </button>
                </div>
              )}

              {/* AI analysis section */}
              {(phase === 'analyzing' || phase === 'done') && (
                <div className="flex flex-col flex-1 overflow-hidden border-t" style={{ borderColor: 'var(--color-elevated-border)' }}>
                  <div className="flex items-center gap-2 px-4 py-2" style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 6%, var(--color-panel))` }}>
                    <SparkleIcon size={12} style={{ color: ACCENT }} />
                    <span className="text-[11px] font-semibold" style={{ color: ACCENT }}>
                      {phase === 'analyzing' ? 'AI is analyzing your test results...' : 'AI Test Report'}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-4 py-3">
                    {analysisError ? (
                      <p className="text-[11.5px]" style={{ color: 'var(--color-error)' }}>
                        Error: {analysisError}
                      </p>
                    ) : analysis ? (
                      <MdViewer
                        content={analysis + (phase === 'analyzing' ? ' ▌' : '')}
                        fontSize={12}
                      />
                    ) : (
                      <div className="flex items-center gap-2 py-2">
                        <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>Preparing analysis...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t" style={{ borderColor: 'var(--color-elevated-border)' }}>
          {phase === 'done' && (
            <button
              type="button"
              onClick={handleStart}
              className="h-[26px] px-3 text-[11px] font-medium rounded cursor-pointer hover:opacity-90 transition-opacity text-white"
              style={{ backgroundColor: ACCENT }}
            >
              Re-run
            </button>
          )}
          {phase === 'idle' && <div />}
          {(phase === 'running' || phase === 'analyzing') && <div />}
          <button
            type="button"
            onClick={onClose}
            className="h-[26px] px-3 text-[11px] rounded cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors border"
            style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
