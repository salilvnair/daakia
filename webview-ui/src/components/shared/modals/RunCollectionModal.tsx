import { useEffect, useState } from 'react';
import { postMsg } from '../../../vscode';
import { METHOD_COLORS } from '../../../colors';
import { PlayIcon, StopSquareIcon } from '../../../icons';
import { ModalView, ButtonView, CodeBlockView, AIButtonView, TextInputView, CheckboxView } from '../../../dui';
import { AiPerformanceInsightsModal } from '../../ai/AiPerformanceInsightsModal';

interface RunCollectionModalProps {
  open: boolean;
  collectionId: string | null;
  collectionName: string;
  onClose: () => void;
}

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

export function RunCollectionModal({ open, collectionId, collectionName, onClose }: RunCollectionModalProps) {
  const [activeTab, setActiveTab] = useState<'runner' | 'cli'>('runner');
  const [delay, setDelay] = useState(500);
  const [stopOnError, setStopOnError] = useState(false);
  const [persistResponses, setPersistResponses] = useState(true);
  const [keepVariables, setKeepVariables] = useState(true);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RequestResult[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [summary, setSummary] = useState<{ total: number; passed: number; failed: number; duration: number } | null>(null);
  const [showInsights, setShowInsights] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResults([]);
    setProgress(null);
    setSummary(null);
    setRunning(false);

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'runCollectionProgress') {
        setResults(prev => [...prev, msg.result]);
        setProgress({ current: msg.index + 1, total: msg.total });
      }
      if (msg.type === 'runCollectionComplete') {
        setRunning(false);
        setSummary({ total: msg.total, passed: msg.passed, failed: msg.failed, duration: msg.duration });
      }
    };

    window.addEventListener('message', handler);
    const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !running) onClose(); };
    document.addEventListener('keydown', escHandler);
    return () => {
      window.removeEventListener('message', handler);
      document.removeEventListener('keydown', escHandler);
    };
  }, [open, running, onClose]);

  const handleRun = () => {
    if (!collectionId) return;
    setResults([]);
    setProgress(null);
    setSummary(null);
    setRunning(true);
    postMsg({ type: 'runCollection', collectionId, delay, stopOnError, persistResponses, keepVariables });
  };

  const handleStop = () => {
    postMsg({ type: 'stopCollectionRun' });
    setRunning(false);
  };

  const cliCommand = `daakia run --collection "${collectionName}" --delay ${delay}${stopOnError ? ' --stop-on-error' : ''}${persistResponses ? ' --persist-responses' : ''}`;

  const footerRight = running ? (
    <ButtonView variant="danger" size="sm" iconLeft={<StopSquareIcon size={12} />} onClick={handleStop}>
      Stop
    </ButtonView>
  ) : (
    <ButtonView variant="primary" size="sm" iconLeft={<PlayIcon size={12} />} onClick={handleRun} disabled={!collectionId}>
      Run
    </ButtonView>
  );

  return (
    <>
      <ModalView
        open={open}
        onClose={!running ? onClose : undefined}
        title="Run collection"
        size="md"
        footerRight={footerRight}
      >
        {/* Tab bar — negative margin to flush against modal header */}
        <div style={{ margin: '-18px -18px 16px', borderBottom: '1px solid var(--color-surface-border)', display: 'flex', alignItems: 'center', padding: '0 18px' }}>
          <TabBtn label="Runner" active={activeTab === 'runner'} onClick={() => setActiveTab('runner')} />
          <TabBtn label="CLI" active={activeTab === 'cli'} onClick={() => setActiveTab('cli')} />
        </div>

        {/* Content */}
        <div className="space-y-4">
          {activeTab === 'runner' ? (
            <>
              <div className="space-y-3">
                <h3 className="text-[13px] font-medium text-[var(--color-text-primary)]">Run Configuration</h3>
                <div className="space-y-1.5">
                  <label className="block text-[12px] text-[var(--color-text-secondary)]">Delay (ms)</label>
                  <TextInputView
                    type="number"
                    value={String(delay)}
                    onChange={(e) => setDelay(Math.max(0, parseInt(e.target.value) || 0))}
                    size="md"
                    width="fw"
                  />
                </div>

                <h3 className="text-[13px] font-medium text-[var(--color-text-primary)] pt-2">Advanced Settings</h3>
                <CheckboxView checked={stopOnError} onChange={setStopOnError} label="Stop run if an error occurs" size="sm" />
                <CheckboxView checked={persistResponses} onChange={setPersistResponses} label="Persist responses" size="sm" />
                <CheckboxView checked={keepVariables} onChange={setKeepVariables} label="Keep variable values" size="sm" />
              </div>

              {(results.length > 0 || running) && (
                <div className="space-y-2 pt-2 border-t border-[var(--color-surface-border)]">
                  {progress && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--color-surface-border)] overflow-hidden">
                        <div className="h-full bg-[var(--color-primary)] transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                      </div>
                      <span className="text-[11px] text-[var(--color-text-muted)] shrink-0">{progress.current}/{progress.total}</span>
                    </div>
                  )}
                  <div className="max-h-[180px] overflow-y-auto space-y-1">
                    {results.map(r => (
                      <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-[12px]">
                        <span className="font-mono font-medium shrink-0" style={{ color: METHOD_COLORS[r.method] || 'var(--color-muted-fallback)' }}>{r.method}</span>
                        <span className="truncate flex-1 text-[var(--color-text-secondary)]">{r.name || r.url}</span>
                        {r.error ? (
                          <span className="text-[var(--color-error)] shrink-0">Error</span>
                        ) : (
                          <span className={`shrink-0 ${r.status < 400 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>{r.status}</span>
                        )}
                        <span className="text-[var(--color-text-muted)] shrink-0">{r.time}ms</span>
                      </div>
                    ))}
                  </div>
                  {summary && (
                    <div className="flex items-center gap-3 pt-2 text-[12px] flex-wrap">
                      <span className="text-[var(--color-text-secondary)]">Total: {summary.total}</span>
                      <span className="text-[var(--color-success)]">Passed: {summary.passed}</span>
                      <span className="text-[var(--color-error)]">Failed: {summary.failed}</span>
                      <span className="text-[var(--color-text-muted)]">{summary.duration}ms</span>
                      {results.length > 0 && (
                        <div className="ml-auto">
                          <AIButtonView
                            label="AI Insights"
                            size="sm"
                            accentColor="var(--color-warning)"
                            onClick={() => setShowInsights(true)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <label className="block text-[12px] font-medium text-[var(--color-text-secondary)]">Equivalent command</label>
              <CodeBlockView code={cliCommand} language="bash" showCopyButton showLineNumbers={false} maxHeight="120px" />
            </div>
          )}
        </div>
      </ModalView>

      {showInsights && (
        <AiPerformanceInsightsModal
          collectionName={collectionName}
          results={results}
          onClose={() => setShowInsights(false)}
        />
      )}
    </>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 text-[12.5px] font-medium cursor-pointer transition-colors border-b-2 ${active ? 'text-[var(--color-primary)] border-[var(--color-primary)]' : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)]'}`}
    >
      {label}
    </button>
  );
}
