import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { postMsg } from '../../../vscode';
import { Checkbox } from '../controls/Checkbox';
import { METHOD_COLORS } from '../../../colors';
import { CloseIcon, PlayIcon } from '../../../icons';

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
    postMsg({
      type: 'runCollection',
      collectionId,
      delay,
      stopOnError,
      persistResponses,
      keepVariables,
    });
  };

  const handleStop = () => {
    postMsg({ type: 'stopCollectionRun' });
    setRunning(false);
  };

  const cliCommand = `daakia run --collection "${collectionName}" --delay ${delay}${stopOnError ? ' --stop-on-error' : ''}${persistResponses ? ' --persist-responses' : ''}`;

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50"
    >
      <div className="w-full max-w-[600px] rounded-xl bg-[var(--color-elevated)] border border-[var(--color-elevated-border)] shadow-2xl animate-[fadeSlideIn_150ms_ease-out] flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--color-surface-border)]">
          <h2 className="text-[20px] font-semibold text-[var(--color-text-primary)]">Run collection</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--color-error)] hover:text-[var(--color-status-5xx)] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors disabled:opacity-40"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0 px-5 border-b border-[var(--color-surface-border)]">
          <TabBtn label="Runner" active={activeTab === 'runner'} onClick={() => setActiveTab('runner')} />
          <TabBtn label="CLI" active={activeTab === 'cli'} onClick={() => setActiveTab('cli')} />
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
          {activeTab === 'runner' ? (
            <>
              {/* Run config */}
              <div className="space-y-3">
                <h3 className="text-[13px] font-medium text-[var(--color-text-primary)]">Run Configuration</h3>
                <div className="space-y-1.5">
                  <label className="block text-[12px] text-[var(--color-text-secondary)]">Delay (ms)</label>
                  <input
                    type="number"
                    value={delay}
                    onChange={(e) => setDelay(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full h-[36px] px-3 rounded-lg bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[13px] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
                  />
                </div>

                <h3 className="text-[13px] font-medium text-[var(--color-text-primary)] pt-2">Advanced Settings</h3>
                <CheckboxRow label="Stop run if an error occurs" checked={stopOnError} onChange={setStopOnError} />
                <CheckboxRow label="Persist responses" checked={persistResponses} onChange={setPersistResponses} />
                <CheckboxRow label="Keep variable values" checked={keepVariables} onChange={setKeepVariables} />
              </div>

              {/* Progress / Results */}
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
                    <div className="flex items-center gap-4 pt-2 text-[12px]">
                      <span className="text-[var(--color-text-secondary)]">Total: {summary.total}</span>
                      <span className="text-[var(--color-success)]">Passed: {summary.passed}</span>
                      <span className="text-[var(--color-error)]">Failed: {summary.failed}</span>
                      <span className="text-[var(--color-text-muted)]">{summary.duration}ms</span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <label className="block text-[12px] font-medium text-[var(--color-text-secondary)]">Equivalent command</label>
              <pre className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-input-border)] text-[12px] font-mono text-[var(--color-text-primary)] whitespace-pre-wrap">{cliCommand}</pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-[var(--color-surface-border)]">
          {running ? (
            <button
              type="button"
              onClick={handleStop}
              className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg bg-[var(--color-error)] text-white cursor-pointer transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRun}
              className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] cursor-pointer transition-colors flex items-center gap-2"
            >
              <PlayIcon size={12} />
              Run
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors disabled:opacity-40"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
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

function CheckboxRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <Checkbox checked={checked} onChange={onChange} label={label} />;
}
