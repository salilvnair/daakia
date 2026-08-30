/**
 * Where the AI's answers land.
 *
 * A docked column rather than a modal, because the answer is only useful next
 * to the evidence that produced it — a dialog covering the log would force the
 * reader to choose between the explanation and the thing being explained.
 */
import { useState } from 'react';
import { CopyButtonView } from '@salilvnair/dui';
import { SparkleIcon, SpinnerIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { useDk8sAiStore, type Dk8sAnswer } from '../../store/dk8s-ai-store';

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

export function AiAnswerPanel() {
  const { open, answers, activeId, clear, cancel } = useDk8sAiStore();
  if (!open) return null;

  return (
    <div className="flex flex-col shrink-0 min-h-0"
         style={{
           width: 340,
           borderLeft: `1px solid color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`,
           background: 'var(--color-surface-secondary, var(--color-surface))',
         }}>
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
