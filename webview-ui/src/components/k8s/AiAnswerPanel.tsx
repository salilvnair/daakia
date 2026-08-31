/**
 * Where the AI's answers land.
 *
 * A docked column rather than a modal, because the answer is only useful next
 * to the evidence that produced it — a dialog covering the log would force the
 * reader to choose between the explanation and the thing being explained.
 */
import { useState } from 'react';
import { CopyButtonView, SplitPanelView } from '@salilvnair/dui';
import { SparkleIcon, SpinnerIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { useDk8sAiStore, type Dk8sAnswer } from '../../store/dk8s-ai-store';
import { useUiStateStore } from '../../store/ui-state-store';

const ACCENT = 'var(--color-protocol-ai)';

function AnswerCard({ answer }: { answer: Dk8sAnswer }) {
  const [showEvidence, setShowEvidence] = useState(false);

  return (
    <div className="flex flex-col rounded-lg overflow-hidden"
         style={{
           background: 'var(--color-surface)',
           border: `1px solid ${answer.error
             ? 'color-mix(in srgb, var(--color-error) 35%, transparent)'
             : 'var(--color-surface-border)'}`,
         }}>
      <div className="flex items-center gap-2 px-3 py-2"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        {answer.streaming
          ? <SpinnerIcon size={12} color={ACCENT} />
          : <SparkleIcon size={12} color={ACCENT} />}
        {/* The title never wraps. It is three short words and the label for the
            whole card; letting a long pod name push it onto a second line made
            two cards side by side look like different components. */}
        <span className="text-[11.5px] whitespace-nowrap shrink-0"
              style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          {answer.title}
        </span>
        {answer.podName && (
          /* A pod name is a workload, a ReplicaSet hash and a pod suffix, and
             in a 340px column the tail is what distinguishes one card from
             another — but it is also what will not fit. Truncated to one line
             with the whole name on hover: the chip says which pod without
             deciding how tall the header is. */
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded truncate min-w-0"
                title={answer.podName}
                style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-muted)' }}>
            {answer.podName}
          </span>
        )}
        <div className="flex-1" />
        {!answer.streaming && answer.text && (
          <CopyButtonView text={answer.text} size="xs" />
        )}
      </div>

      {answer.error ? (
        <div className="px-3 py-2.5 text-[11.5px]" style={{ color: 'var(--color-error)' }}>
          {answer.error}
        </div>
      ) : (
        <div className="px-3 py-2.5 text-[12px]" style={{ color: 'var(--color-text-primary)' }}>
          {answer.text
            ? <MdViewer content={answer.text} />
            : <span className="text-[11.5px] text-[var(--color-text-muted)]">Thinking…</span>}
          {/* A caret while streaming, so a slow provider does not read as a
              hang — the difference between "still coming" and "stopped" is the
              only thing the reader wants to know at that moment. */}
          {answer.streaming && answer.text && (
            <span style={{
              display: 'inline-block', width: 6, height: 13, marginLeft: 2,
              background: ACCENT, verticalAlign: 'text-bottom', opacity: 0.8,
            }} />
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowEvidence(v => !v)}
        className="flex items-center gap-1 px-3 py-1.5 text-[10.5px] cursor-pointer border-none bg-transparent text-left"
        style={{
          color: 'var(--color-text-muted)',
          borderTop: '1px solid var(--color-surface-border)',
        }}
      >
        {showEvidence ? <ChevronDownIcon size={10} /> : <ChevronRightIcon size={10} />}
        {showEvidence ? 'Hide' : 'Show'} what was sent
        {' · '}
        {(() => {
          const n = answer.evidence.split('\n').length;
          return `${n} line${n === 1 ? '' : 's'}`;
        })()}
      </button>

      {/* Wrapped, never scrolled sideways.
          `pre-wrap` alone breaks at whitespace, and a stack frame has none
          worth breaking at — `java.base/sun.nio.ch.NioSocketImpl.connect` is
          one token, so the box grew a horizontal scrollbar beside the vertical
          one. Two scrollbars on a 340px panel, to read text that could simply
          have wrapped. `anywhere` lets a long token break. */}
      {showEvidence && (
        <pre className="px-3 py-2 text-[10.5px] font-mono"
             style={{
               maxHeight: 200, margin: 0,
               overflowX: 'hidden',
               overflowY: 'auto',
               background: 'var(--color-surface-hover)',
               color: 'var(--color-text-secondary)',
               whiteSpace: 'pre-wrap',
               overflowWrap: 'anywhere',
             }}>
          {answer.evidence}
        </pre>
      )}
    </div>
  );
}

/**
 * The AI pane's share of the width, as a percentage for the CONTENT side.
 *
 * Persisted, because a width is a preference: someone reading long answers
 * wants a wide pane and someone glancing at them wants a narrow one, and being
 * asked again on every open is the thing that makes a resizable panel annoying
 * rather than useful.
 *
 * Read from the store but overridden locally while dragging — writing a pref
 * on every pointer move would post a message per frame, and the stored value
 * arrives after hydration, so deriving it rather than seeding state is what
 * keeps a restored width from being replaced by the default.
 */
function useAiSplit(): [number, (n: number) => void, (n: number) => void] {
  const stored = useUiStateStore(s => s.prefs[AI_SPLIT_PREF]);
  const [dragging, setDragging] = useState<number | null>(null);

  const parsed = Number(stored);
  const split = dragging ?? (Number.isFinite(parsed) && parsed > 0 ? parsed : 68);

  return [
    split,
    setDragging,
    (n: number) => {
      setDragging(null);
      useUiStateStore.getState().setPref(AI_SPLIT_PREF, String(Math.round(n)));
    },
  ];
}

const AI_SPLIT_PREF = 'dk8s.ai.split';

/**
 * Content on the left, answers on the right, with a handle between them.
 *
 * Both the pod detail and the artifact analyzer put the same panel beside the
 * same kind of thing, so the arrangement lives here once. When the panel is
 * closed this is not a split at all — it renders the content directly, because
 * a split pane with one empty half still reserves the divider and the gap.
 */
export function AiSplit({ children }: { children: React.ReactNode }) {
  const open = useDk8sAiStore(s => s.open);
  const [split, onResize, onResizeEnd] = useAiSplit();

  if (!open) return <>{children}</>;

  return (
    <SplitPanelView
      direction="horizontal"
      className="flex-1 min-h-0"
      split={split}
      onResize={onResize}
      onResizeEnd={onResizeEnd}
      // The answer is read beside its evidence, so neither side may be dragged
      // down to a sliver — at which point the pane is closed, not resized, and
      // there is a button for that.
      minFirstPct={30}
      minSecondPct={15}
      accentColor={ACCENT}
      first={<div className="flex flex-col h-full min-w-0 overflow-hidden">{children}</div>}
      second={<AiAnswerPanel />}
    />
  );
}

export function AiAnswerPanel() {
  const { open, answers, activeId, clear, cancel } = useDk8sAiStore();
  if (!open) return null;

  return (
    // Sized by the split, not by itself. This was a hard 340px, which is why
    // a stack frame had nowhere to wrap to.
    <div className="flex flex-col h-full w-full min-h-0 min-w-0"
         style={{ background: 'var(--color-surface-secondary, var(--color-surface))' }}>
      <div className="flex items-center gap-2 px-3 py-2.5 shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <SparkleIcon size={14} color={ACCENT} />
        <span className="text-[12px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          AI analysis
        </span>
        <div className="flex-1" />
        {activeId && (
          <button type="button" onClick={cancel}
                  className="text-[10.5px] px-2 py-1 rounded cursor-pointer border-none bg-transparent"
                  style={{ color: 'var(--color-error)' }}>
            stop
          </button>
        )}
        {answers.length > 0 && !activeId && (
          <button type="button" onClick={clear} title="Clear answers"
                  className="p-1 rounded cursor-pointer border-none bg-transparent">
            <TrashIcon size={12} color="var(--color-text-muted)" />
          </button>
        )}

      </div>

      <div className="flex-1 overflow-auto px-3 py-3 flex flex-col gap-3 min-h-0">
        {answers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
            <SparkleIcon size={22} color="var(--color-text-muted)" />
            <span className="text-[11.5px] text-[var(--color-text-muted)]">
              Select any text in the log and ask why. The pod's state goes along with it,
              so the answer accounts for restarts and exit codes rather than just the words.
            </span>
          </div>
        ) : (
          answers.map(a => <AnswerCard key={a.id} answer={a} />)
        )}
      </div>
    </div>
  );
}
