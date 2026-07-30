/**
 * AiAgentWorkflowModal — Multi-step autonomous agent (4.5.3)
 * Phase 1: run collection → Phase 2: AI diagnosis → Phase 3: stream report
 */
import { useState, useEffect, useRef } from 'react';
import { postMsg } from '../../vscode';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { SparkleIcon, SpinnerIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { METHOD_COLORS } from '../../colors';
import { ModalView, ButtonView } from '@salilvnair/dui';
import { useAiCollectionCacheStore } from '../../store/ai-collection-cache-store';

interface RequestResult {
  id: string; name: string; method: string; url: string;
  status: number; statusText: string; time: number; size: number; error?: string;
}

interface Props { collectionId: string; collectionName: string; protocol?: string; onClose: () => void; }

type Phase = 'idle' | 'running' | 'analyzing' | 'done';

const ACCENT = 'var(--color-success)';

function formatResultsForAi(results: RequestResult[]): string {
  return results.map((r, i) => {
    const statusStr = r.error ? `Error: ${r.error.slice(0, 80)}` : `${r.status} ${r.statusText || ''}`.trim();
    const sizeStr = r.size > 0 ? ` | ${(r.size / 1024).toFixed(1)} KB` : '';
    return `${i + 1}. [${r.method}] ${r.name || r.url}\n   URL: ${r.url}\n   Status: ${statusStr} | Time: ${r.time}ms${sizeStr}`;
  }).join('\n\n');
}

export function AiAgentWorkflowModal({ collectionId, collectionName, protocol, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [results, setResults] = useState<RequestResult[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [summary, setSummary] = useState<{ total: number; passed: number; failed: number; duration: number } | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [analysisError, setAnalysisError] = useState('');

  const tabIdRef = useRef('');
  const accRef = useRef('');
  const resolveTemplate = useAiPromptTemplatesStore(s => s.resolve);
  const cacheGet = useAiCollectionCacheStore(s => s.get);
  const cacheSet = useAiCollectionCacheStore(s => s.set);
  const cacheKey = `agent-workflow:${collectionId}`;

  // Cache-first: if this collection was already run, show the last result instead
  // of resetting to the empty idle state — Re-run is always available to regenerate.
  useEffect(() => {
    const cached = cacheGet(cacheKey);
    if (!cached) return;
    const p = cached.payload as { results: RequestResult[]; summary: typeof summary; analysis: string };
    setResults(p.results);
    setSummary(p.summary);
    setAnalysis(p.analysis);
    setPhase('done');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  // Persist the completed run so reopening this modal for the same collection is cache-first.
  useEffect(() => {
    if (phase === 'done' && !analysisError) {
      cacheSet(cacheKey, { results, summary, analysis });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Collection run events + AI streaming — use tabId (not reqId) to match ai:send
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (!msg) return;

      if (msg.type === 'runCollectionProgress') {
        setResults(prev => [...prev, msg.result as RequestResult]);
        setProgress({ current: (msg.index as number) + 1, total: msg.total as number });
      }
      if (msg.type === 'runCollectionComplete') {
        setSummary({ total: msg.total as number, passed: msg.passed as number, failed: msg.failed as number, duration: msg.duration as number });
        setPhase('analyzing');
      }

      // Use tabId for routing (consistent with other modals)
      if (msg.tabId !== tabIdRef.current) return;
      if (msg.type === 'ai:chunk') {
        accRef.current += (msg.delta as string) || (msg.text as string) || '';
        setAnalysis(accRef.current);
      }
      if (msg.type === 'ai:complete') { setPhase('done'); }
      if (msg.type === 'ai:error') { setAnalysisError((msg.message as string) || 'AI analysis failed'); setPhase('done'); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Trigger AI analysis when phase becomes 'analyzing'
  useEffect(() => {
    if (phase !== 'analyzing') return;
    const currentResults = results;
    const tabId = `agent-wf-${Date.now()}`;
    tabIdRef.current = tabId;
    accRef.current = '';
    setAnalysis('');
    setAnalysisError('');

    const resultText = formatResultsForAi(currentResults);
    const failCount = currentResults.filter(r => r.error || r.status >= 400).length;
    const envName = protocol ? `${protocol} collection` : 'REST collection';

    postMsg({
      type: 'ai:send',
      tabId,
      provider: '', model: '', baseUrl: '',
      stage: 'rest.agent.workflow',
      systemPrompts: [resolveTemplate('rest.agent.workflow.system')],
      userPrompt: resolveTemplate('rest.agent.workflow', {
        collectionName,
        environment: envName,
        results: failCount === 0
          ? `All ${currentResults.length} requests passed.\n\n${resultText}`
          : `${currentResults.length} total, ${failCount} failed.\n\n${resultText}`,
      }),
      conversation: [], tools: [],
      settings: { temperature: 0.3, maxTokens: 2000, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleStart = () => {
    setResults([]); setProgress(null); setSummary(null); setAnalysis(''); setAnalysisError('');
    setPhase('running');
    postMsg({ type: 'runCollection', collectionId, delay: 300, stopOnError: false, persistResponses: false, keepVariables: true });
  };

  const handleStop = () => { postMsg({ type: 'stopCollectionRun' }); setPhase('idle'); };

  const statusChip = (result: RequestResult) => {
    const failed = result.error || result.status >= 400;
    const color = failed ? 'var(--color-error)' : 'var(--color-success)';
    return (
      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded"
        style={{ color, backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}>
        {result.error ? 'ERR' : String(result.status)}
      </span>
    );
  };

  const phaseLabel =
    phase === 'idle' ? 'Ready to run'
    : phase === 'running' ? `Running requests${progress ? ` (${progress.current}/${progress.total})` : ''}…`
    : phase === 'analyzing' ? 'AI analyzing results…'
    : 'Analysis complete';

  const footerLeft = phase === 'done' ? (
    <ButtonView size="sm" variant="primary" accentColor={ACCENT} onClick={handleStart}>Re-run</ButtonView>
  ) : phase === 'running' ? (
    <ButtonView size="sm" variant="danger" onClick={handleStop}>Stop</ButtonView>
  ) : undefined;

  return (
    <ModalView
      open
      onClose={onClose}
      title="AI Agent Workflow"
      subtitle={collectionName}
      size="lg"
      elevated
      headerColor={ACCENT}
      headerIcon={<SparkleIcon size={15} style={{ color: ACCENT }} />}
      noPadding
      footerLeft={footerLeft}
    >
      {/* Phase status bar */}
      <div className="flex items-center gap-2 px-4 py-1.5 text-[11px]"
        style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 8%, var(--color-panel))`, color: ACCENT }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: ACCENT, animation: (phase === 'running' || phase === 'analyzing') ? 'pulse 1s infinite' : 'none' }} />
        {phaseLabel}
      </div>

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Idle — start button */}
        {phase === 'idle' && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 px-4">
            <p className="text-[12px] text-[var(--color-text-muted)]">
              Click below to run all requests and get an AI-powered test report.
            </p>
            <ButtonView size="md" variant="primary" accentColor={ACCENT} iconLeft={<SparkleIcon size={13} />} onClick={handleStart}>
              Start Agent Workflow
            </ButtonView>
          </div>
        )}

        {/* Results list */}
        {phase !== 'idle' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="overflow-y-auto [scrollbar-gutter:stable]"
              style={{ maxHeight: (phase === 'done' || phase === 'analyzing') ? '220px' : '320px' }}>
              {results.length === 0 && phase === 'running' && (
                <div className="flex items-center justify-center gap-2 py-6">
                  <SpinnerIcon size={13} style={{ color: ACCENT }} />
                  <span className="text-[12px] text-[var(--color-text-muted)]">Starting...</span>
                </div>
              )}
              {results.map((r, i) => (
                <div key={r.id || i} className="flex items-center gap-2 px-4 py-1.5 border-b text-[11.5px]"
                  style={{ borderColor: 'var(--color-surface-border)' }}>
                  <span className="text-[10px] font-mono font-bold w-[42px] text-center rounded px-1 flex-shrink-0"
                    style={{ color: METHOD_COLORS[r.method as keyof typeof METHOD_COLORS] || 'var(--color-text-secondary)' }}>
                    {r.method}
                  </span>
                  <span className="flex-1 truncate text-[var(--color-text-secondary)]">{r.name || r.url}</span>
                  {statusChip(r)}
                  <span className="text-[10px] w-[52px] text-right flex-shrink-0 text-[var(--color-text-muted)]">{r.time}ms</span>
                </div>
              ))}
            </div>

            {summary && (
              <div className="flex items-center gap-4 px-4 py-2 text-[11px] border-b"
                style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
                <span className="text-[var(--color-text-muted)]">{summary.total} requests · {(summary.duration / 1000).toFixed(1)}s</span>
                <span style={{ color: 'var(--color-success)' }}>✓ {summary.passed} passed</span>
                {summary.failed > 0 && <span style={{ color: 'var(--color-error)' }}>✗ {summary.failed} failed</span>}
              </div>
            )}

            {/* AI analysis section */}
            {(phase === 'analyzing' || phase === 'done') && (
              <div className="flex flex-col flex-1 overflow-hidden border-t" style={{ borderColor: 'var(--color-elevated-border)' }}>
                <div className="flex items-center gap-2 px-4 py-2"
                  style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 6%, var(--color-panel))` }}>
                  <SparkleIcon size={12} style={{ color: ACCENT }} />
                  <span className="text-[11px] font-semibold" style={{ color: ACCENT }}>
                    {phase === 'analyzing' ? 'AI is analyzing your test results...' : 'AI Test Report'}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-4 py-3">
                  {analysisError ? (
                    <p className="text-[11.5px] text-[var(--color-error)]">Error: {analysisError}</p>
                  ) : analysis ? (
                    <MdViewer content={analysis + (phase === 'analyzing' ? ' ▌' : '')} />
                  ) : (
                    <div className="flex items-center gap-2 py-2">
                      <SpinnerIcon size={13} style={{ color: ACCENT }} />
                      <span className="text-[11.5px] text-[var(--color-text-muted)]">Preparing analysis...</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ModalView>
  );
}
