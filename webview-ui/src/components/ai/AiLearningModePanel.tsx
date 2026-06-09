/**
 * AiLearningModePanel — AI watches user manually test → learns workflow → can replay.
 * Feature 4.6.21 — AI Learning Mode (Watch & Replay)
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SparkleIcon, CloseIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useTabsStore } from '../../store/tabs-store';
import { useToastStore } from '../../store/toast-store';

interface RecordedStep {
  method: string;
  url: string;
  body?: string;
  headers?: Record<string, string>;
  timestamp: number;
  responseStatus?: number;
}

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';
const STORAGE_KEY = 'daakia:learning-mode-recording';

export function AiLearningModePanel({ onClose }: Props) {
  const [recording, setRecording] = useState(false);
  const [steps, setSteps] = useState<RecordedStep[]>([]);
  const [analysisName, setAnalysisName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [workflowName, setWorkflowName] = useState('');

  const tabs = useTabsStore(s => s.tabs);
  const addToast = useToastStore(s => s.addToast);

  // Load any existing recording
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved?.steps) setSteps(saved.steps);
    } catch { /* ignore */ }
  }, []);

  // When recording, watch for new tab responses
  useEffect(() => {
    if (!recording) return;

    const prevStates = new Map<string, number>();
    tabs.forEach(t => { if (t.response) prevStates.set(t.id, t.response.status); });

    const interval = setInterval(() => {
      tabs.forEach(tab => {
        if (!tab.response) return;
        const prev = prevStates.get(tab.id);
        if (prev !== tab.response.status || !prevStates.has(tab.id)) {
          prevStates.set(tab.id, tab.response.status);
          const step: RecordedStep = {
            method: tab.method || 'GET',
            url: tab.url || '',
            body: tab.bodyRaw || undefined,
            timestamp: Date.now(),
            responseStatus: tab.response.status,
          };
          setSteps(prev => {
            const updated = [...prev, step];
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ steps: updated }));
            return updated;
          });
        }
      });
    }, 500);

    return () => clearInterval(interval);
  }, [recording, tabs]);

  const stopAndAnalyze = () => {
    setRecording(false);
    if (steps.length === 0) { addToast({ type: 'warning', message: 'No requests recorded. Send some requests first.' }); return; }
    setAnalyzing(true);

    const summary = steps.map(s => `${s.method} ${s.url} → ${s.responseStatus}`).join('\n');

    postMsg({
      type: 'ai:send',
      tabId: `ai-learn-${Date.now()}`,
      provider: '', model: '', baseUrl: '',
      stage: 'agent.learn.analyze',
      systemPrompts: ['You are an API workflow analyzer. Given a sequence of API calls the user made, identify the workflow name and describe it in 1-2 sentences.'],
      userPrompt: `API call sequence:\n${summary}`,
      conversation: [], tools: [],
      settings: { temperature: 0.2, maxTokens: 100, stream: false, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });

    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'ai:complete') {
        setAnalysisName((msg.message as Record<string, unknown>)?.content as string || 'Recorded Workflow');
        setAnalyzing(false);
        window.removeEventListener('message', handler);
      }
    };
    window.addEventListener('message', handler);
  };

  const clearRecording = () => {
    setSteps([]);
    setAnalysisName('');
    localStorage.removeItem(STORAGE_KEY);
  };

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[620px] max-h-[88vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">AI Learning Mode</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">AI watches your API workflow → learns to replay it</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Recording status */}
          <div className="rounded-xl border p-4"
            style={{
              borderColor: recording ? `color-mix(in srgb, ${ACCENT} 40%, var(--color-surface-border))` : 'var(--color-surface-border)',
              backgroundColor: recording ? `color-mix(in srgb, ${ACCENT} 5%, var(--color-panel))` : 'var(--color-panel)',
            }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: recording ? 'var(--color-error)' : 'var(--color-text-muted)',
                  boxShadow: recording ? '0 0 0 4px color-mix(in srgb, var(--color-error) 20%, transparent)' : 'none',
                }} />
              <span className="text-[12px] font-semibold" style={{ color: recording ? 'var(--color-error)' : 'var(--color-text-primary)' }}>
                {recording ? 'Recording…' : steps.length > 0 ? `${steps.length} steps recorded` : 'Ready to record'}
              </span>
            </div>

            <p className="text-[10.5px] mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              {recording
                ? 'Send API requests normally. Every request you make is being recorded.'
                : steps.length > 0
                ? 'Recording complete. AI can analyze and replay this workflow.'
                : 'Start recording, then perform your API workflow manually. AI will watch and learn.'}
            </p>

            <div className="flex gap-2">
              {!recording && steps.length === 0 && (
                <button type="button" onClick={() => setRecording(true)}
                  className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer text-white"
                  style={{ backgroundColor: 'var(--color-error)' }}>
                  ● Start Recording
                </button>
              )}
              {recording && (
                <button type="button" onClick={stopAndAnalyze}
                  className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer text-white"
                  style={{ backgroundColor: ACCENT }}>
                  ■ Stop & Analyze
                </button>
              )}
              {steps.length > 0 && !recording && (
                <button type="button" onClick={clearRecording}
                  className="h-[30px] px-3 text-[11px] rounded-md cursor-pointer border"
                  style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Recorded steps */}
          {steps.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Recorded steps</p>
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg border"
                  style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
                  <span className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded min-w-[36px] text-center"
                    style={{ backgroundColor: 'var(--color-info)' }}>{step.method}</span>
                  <span className="text-[10.5px] font-mono flex-1 truncate" style={{ color: 'var(--color-text-primary)' }}>{step.url}</span>
                  <span className="text-[9.5px]"
                    style={{ color: step.responseStatus && step.responseStatus < 400 ? 'var(--color-success)' : 'var(--color-error)' }}>
                    {step.responseStatus}
                  </span>
                </div>
              ))}
            </div>
          )}

          {analyzing && (
            <div className="flex gap-1 items-center">
              {[0, 150, 300].map(d => (<span key={d} className="w-[4px] h-[4px] rounded-full animate-pulse" style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />))}
              <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Analyzing workflow…</span>
            </div>
          )}

          {analysisName && (
            <div className="rounded-lg border p-4"
              style={{ borderColor: `color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`, backgroundColor: `color-mix(in srgb, ${ACCENT} 4%, var(--color-panel))` }}>
              <p className="text-[11px] font-semibold" style={{ color: ACCENT }}>✦ Workflow identified</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-primary)' }}>{analysisName}</p>
              <div className="mt-3">
                <input value={workflowName} onChange={e => setWorkflowName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg text-[11.5px] outline-none"
                  placeholder="Give this workflow a name…"
                  style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
              </div>
              <button type="button"
                onClick={() => { addToast({ type: 'success', message: `Workflow "${workflowName || 'Workflow'}" saved!` }); onClose(); }}
                className="mt-2 h-[30px] px-3 text-[11px] font-medium rounded-md cursor-pointer text-white"
                style={{ backgroundColor: ACCENT }}>
                Save Workflow
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
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
