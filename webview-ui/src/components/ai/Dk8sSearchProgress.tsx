/**
 * The box under "Searching 9 pods for …" while a dk8s search runs.
 *
 * The chat library draws one line of text while it waits. That line says what
 * is being searched; this says where the search has got to — the live logs
 * first, then the archive on the volume, which is slower — so a search that
 * takes eight seconds reads as working rather than stuck.
 *
 * It is portalled into the library's own "thinking" row, found by its class,
 * because that row is where the eye already is and the library has no slot for
 * it. When the library removes the row (the answer arrived) the box goes with
 * it; the store is cleared on the same message.
 */
import { createPortal } from 'react-dom';
import { useLibrarySlot } from './use-library-slot';
import { useDk8sAiProgress, type Dk8sAiProgress, type Dk8sPhaseState } from '../../store/dk8s-ai-progress-store';

const DK8S = 'var(--color-ai-accent, #D97757)';
const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';

const CSS = `
@keyframes dk8s-spin { to { transform: rotate(360deg); } }
.dk8s-spinner { animation: dk8s-spin .9s linear infinite; }
@media (prefers-reduced-motion: reduce) { .dk8s-spinner { animation: none; } }
`;

export function Dk8sSearchProgressPortal({ root }: { root: HTMLElement | null }) {
  const progress = useDk8sAiProgress(s => s.progress);
  const slot = useLibrarySlot(root, '.ce-message-content:has(> .ce-thinking-strip)', 'dk8s-progress-slot', !!progress);
  if (!progress || !slot) return null;
  return createPortal(<Dk8sSearchProgress progress={progress} />, slot);
}

export function Dk8sSearchProgress({ progress }: { progress: Dk8sAiProgress }) {
  const scope = progress.namespaces.length === 1 ? ` in ${progress.namespaces[0]}` : '';
  const liveNothing = progress.live?.state === 'done' && progress.live.hits === 0;

  return (
    <div className="flex flex-col" style={{ gap: 10, marginTop: 10, maxWidth: 580 }}>
      <style>{CSS}</style>
      <span className="inline-flex items-center self-start" style={{
        gap: 8, padding: '6px 11px', borderRadius: 8, fontSize: 11.5,
        border: '1px solid color-mix(in srgb, var(--color-ai-accent, #D97757) 35%, transparent)',
        background: 'color-mix(in srgb, var(--color-ai-accent, #D97757) 6%, transparent)',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={DK8S} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span style={{ color: DK8S, fontWeight: 600 }}>dk8s.search</span>
        <span style={{ fontFamily: MONO, color: 'var(--color-text-secondary)' }}>
          {progress.query} · ±{progress.around} lines · {progress.archive ? 'live + archive' : 'live'}
        </span>
      </span>

      <div className="flex flex-col" style={{
        gap: 7, padding: '11px 14px', borderRadius: 10,
        border: '1px solid var(--color-surface-border)',
        background: 'color-mix(in srgb, var(--color-text-primary) 3%, var(--color-panel))',
      }}>
        <PhaseRow label={`Live logs · ${progress.pods} pod${progress.pods === 1 ? '' : 's'}${scope}`} phase={progress.live ?? { state: 'running', hits: 0, ms: 0 }} />
        {progress.archive && <ArchiveRow progress={progress} />}
        {liveNothing && progress.archive && progress.archivePhase?.state !== 'done' && (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', paddingLeft: 22, lineHeight: 1.5 }}>
            Nothing live — {progress.query} may be older than anything <span style={{ fontFamily: MONO }}>kubectl logs</span> still holds.
          </div>
        )}
        {progress.found && (
          <div className="flex items-center" style={{ gap: 9, fontSize: 12, color: 'var(--color-text-secondary)', paddingTop: 2 }}>
            <Spinner />
            <span>
              {progress.found.threads
                ? `${progress.found.threads} thread${progress.found.threads === 1 ? '' : 's'}${progress.found.failures ? `, ${progress.found.failures} failure${progress.found.failures === 1 ? '' : 's'}` : ''} — writing the answer…`
                : 'Nothing matched — writing the answer…'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/*
  The archive half, pod by pod: the path it is grepping and the pod it is in,
  then how far through the pods it is and how many files have held a hit.
*/
function ArchiveRow({ progress }: { progress: Dk8sAiProgress }) {
  const a = progress.archivePhase;
  const where = a?.roots?.length ? a.roots.join(', ') : undefined;
  const files = a?.files ? ` · ${a.files} file${a.files === 1 ? '' : 's'} with hits` : '';
  const label = !a ? "Archive · the rotated files on the pods' volumes"
    : a.state === 'done' ? `Archive · ${where ?? "the pods' volumes"} · ${progress.pods} pod${progress.pods === 1 ? '' : 's'}`
    : a.pod ? `Archive · ${where ? `${where} on ` : ''}${a.pod}`
    : "Archive · the rotated files on the pods' volumes";
  const detail = a?.state === 'running' && a.podIndex
    ? `pod ${a.podIndex} of ${progress.pods}${files}…`
    : a?.state === 'done' ? `${a.hits} hit${a.hits === 1 ? '' : 's'} · ${(a.ms / 1000).toFixed(1)}s${files}` : undefined;
  return <PhaseRow label={label} phase={a} waiting={!a} detail={detail} />;
}

function PhaseRow({ label, phase, waiting, detail }: { label: string; phase?: Dk8sPhaseState; waiting?: boolean; detail?: string }) {
  const done = phase?.state === 'done';
  return (
    <div className="flex items-center" style={{ gap: 9, fontSize: 12, color: waiting ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}>
      {done
        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-success, #10b981)" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
        : waiting ? <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid var(--color-surface-border)', boxSizing: 'border-box' }} />
          : <Spinner />}
      <span className="flex-1 min-w-0" style={{ overflowWrap: 'anywhere' }}>{label}</span>
      <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums', fontSize: 11.5, flexShrink: 0 }}>
        {detail ?? (done ? `${phase!.hits} hit${phase!.hits === 1 ? '' : 's'} · ${(phase!.ms / 1000).toFixed(1)}s` : waiting ? 'next' : 'reading…')}
      </span>
    </div>
  );
}

const Spinner = () => (
  <span className="dk8s-spinner" style={{
    width: 13, height: 13, borderRadius: '50%', boxSizing: 'border-box', flexShrink: 0,
    border: `2px solid ${DK8S}`, borderRightColor: 'transparent', display: 'inline-block',
  }} />
);
