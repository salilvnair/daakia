/**
 * What Daakia AI is doing, step by step, while it writes an answer.
 *
 * Every dk8s step it takes gets a row — a command it ran, a search of the
 * pods' logs, a look in the manual — the way a chat assistant shows its tool
 * use: a short title, the command in a box that wraps rather than running off
 * the screen, and the model's own reason for the step under it, which is the
 * part of its thinking worth seeing. A search keeps its live-then-archive
 * progress inside its row.
 *
 * Portalled into the chat library's "thinking" row (see Dk8sSearchProgress
 * for why), and gone with it when the answer arrives.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLibrarySlot } from './use-library-slot';
import { useDk8sAiSteps, type Dk8sStep } from '../../store/dk8s-ai-steps-store';
import { useDk8sAiProgress } from '../../store/dk8s-ai-progress-store';
import { SearchPhases } from './Dk8sSearchProgress';

const ACCENT = 'var(--color-ai-accent, #D97757)';
const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';
const OK = 'var(--color-success, #10b981)';
const BAD = 'var(--color-error, #ef4444)';

const CSS = `
@keyframes dk8s-step-spin { to { transform: rotate(360deg); } }
.dk8s-step-spin { animation: dk8s-step-spin .9s linear infinite; }
@keyframes dk8s-step-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
.dk8s-step { animation: dk8s-step-in .22s ease-out both; }
@media (prefers-reduced-motion: reduce) { .dk8s-step-spin, .dk8s-step { animation: none; } }
.dk8s-steps-head:hover { background: color-mix(in srgb, var(--color-text-primary) 4%, transparent); }
`;

export function Dk8sStepsPortal({ root, tabId }: { root: HTMLElement | null; tabId: string }) {
  const steps = useDk8sAiSteps(s => s.byTab[tabId]);
  const active = !!steps && steps.steps.length > 0 && !steps.done;
  const slot = useLibrarySlot(root, '.ce-message-content:has(> .ce-thinking-strip)', 'dk8s-progress-slot', active);
  if (!active || !slot) return null;
  return createPortal(<Dk8sStepsCard tabId={tabId} steps={steps.steps} startedAt={steps.startedAt} />, slot);
}

export function Dk8sStepsCard({ tabId, steps, startedAt }: { tabId: string; steps: Dk8sStep[]; startedAt: number }) {
  const running = steps.some(s => s.state === 'running');
  const [open, setOpen] = useState(true);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);
  const secs = ((now - startedAt) / 1000).toFixed(1);

  return (
    <div className="flex flex-col" style={{
      marginTop: 10, maxWidth: 680, borderRadius: 12, overflow: 'hidden',
      border: '1px solid var(--color-surface-border)',
      background: 'color-mix(in srgb, var(--color-text-primary) 3%, var(--color-panel))',
    }}>
      <style>{CSS}</style>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
              className="dk8s-steps-head flex items-center border-none cursor-pointer text-left"
              style={{ gap: 9, padding: '9px 14px', background: 'transparent', color: 'var(--color-text-primary)', font: 'inherit' }}>
        {running ? <Spinner /> : <Tick />}
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{running ? 'Working' : 'Done'}</span>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          · {steps.length} step{steps.length === 1 ? '' : 's'}
        </span>
        <span className="flex-1" />
        <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{secs}s</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.5"
             style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 160ms ease' }} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="flex flex-col" style={{ gap: 12, padding: '4px 14px 13px', borderTop: '1px solid var(--color-surface-border)', paddingTop: 12 }}>
          {steps.map(s => <StepRow key={s.id} step={s} tabId={tabId} />)}
        </div>
      )}
    </div>
  );
}

function StepRow({ step, tabId }: { step: Dk8sStep; tabId: string }) {
  const progress = useDk8sAiProgress(s => (step.kind === 'search' ? s.byTab[tabId] : undefined));
  const running = step.state === 'running';
  const title = step.kind === 'kubectl'
    ? (running ? 'Running a command' : step.state === 'failed' ? 'A command did not finish' : 'Ran a command')
    : step.kind === 'search'
      ? `${running ? 'Searching' : 'Searched'} ${step.pods ?? 0} pod${step.pods === 1 ? '' : 's'} for “${step.query}”`
      : `${running ? 'Looking up' : 'Looked up'} “${step.topic}” in the Daakia manual`;

  return (
    <div className="dk8s-step flex" style={{ gap: 10 }}>
      <span className="shrink-0" style={{ width: 16, paddingTop: 2, display: 'inline-flex', justifyContent: 'center' }}>
        {running ? <Spinner /> : step.state === 'failed' ? <Cross /> : <Tick />}
      </span>
      <div className="flex flex-col flex-1 min-w-0" style={{ gap: 7 }}>
        <div className="flex items-baseline" style={{ gap: 8 }}>
          <span className="flex items-center" style={{ gap: 7, minWidth: 0 }}>
            <KindIcon kind={step.kind} />
            <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)', overflowWrap: 'anywhere' }}>{title}</span>
          </span>
          <span className="flex-1" />
          <span className="shrink-0" style={{ fontSize: 11.5, color: step.state === 'failed' ? BAD : 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {running ? '' : [step.outcome, step.ms !== undefined ? `${(step.ms / 1000).toFixed(1)}s` : ''].filter(Boolean).join(' · ')}
          </span>
        </div>

        {step.kind === 'kubectl' && step.command && (
          <div style={{
            fontFamily: MONO, fontSize: 12, lineHeight: 1.55, padding: '7px 10px', borderRadius: 7,
            background: 'var(--color-panel)', border: '1px solid var(--color-surface-border)',
            color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            <span style={{ color: ACCENT, userSelect: 'none' }}>$ </span>{step.command}
          </div>
        )}

        {step.why && (
          /* The model's own reason for the step — the part of its thinking
             that says why this, and not something else. */
          <div style={{
            fontSize: 12, lineHeight: 1.55, color: 'var(--color-text-secondary)',
            paddingLeft: 9, borderLeft: `2px solid color-mix(in srgb, ${ACCENT} 45%, transparent)`,
          }}>
            {step.why}
          </div>
        )}

        {step.kind === 'search' && running && progress && <SearchPhases progress={progress} />}
      </div>
    </div>
  );
}

function KindIcon({ kind }: { kind: Dk8sStep['kind'] }) {
  const p = { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: ACCENT, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (kind === 'kubectl') return <svg {...p}><path d="m4 17 6-5-6-5" /><path d="M12 19h8" /></svg>;
  if (kind === 'search') return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
  return <svg {...p}><path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2" /><path d="M19 19v3H6" /></svg>;
}

const Spinner = () => (
  <span className="dk8s-step-spin" style={{
    width: 13, height: 13, borderRadius: '50%', boxSizing: 'border-box', flexShrink: 0, display: 'inline-block',
    border: `2px solid ${ACCENT}`, borderRightColor: 'transparent',
  }} />
);
const Tick = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={OK} strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
);
const Cross = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={BAD} strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
);
