/**
 * Where the AI's answers land.
 *
 * A docked column rather than a modal, because the answer is only useful next
 * to the evidence that produced it — a dialog covering the log would force the
 * reader to choose between the explanation and the thing being explained.
 */
import { useState } from 'react';
import { CopyButtonView, SplitPanelView, ChatInputView, IconSize } from '@salilvnair/dui';
import {
  SparkleIcon, SpinnerIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon, ShieldIcon,
  SendIcon, UserPromptIcon,
} from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { useDk8sAiStore, type Dk8sAnswer } from '../../store/dk8s-ai-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { useAppSettingsStore } from '../../store/app-settings-store';

import { AI as ACCENT } from './tone';

/**
 * One question and its answer, foldable.
 *
 * A thread of eight follow-ups is a column of prose with nothing to navigate
 * by: the questions were a line of grey text with a chevron character in front
 * of them, indistinguishable at a glance from the answers around them. So the
 * question is a header you can press, the answer folds under it, and each side
 * carries a mark saying who said it — a person asked, the model replied.
 */
function Turn({ turn }: { turn: Dk8sAnswer['turns'][number] }) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ borderTop: '1px solid var(--color-surface-border)' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 text-[11.5px] flex items-start gap-2 text-left cursor-pointer border-none"
        style={{ background: 'var(--color-surface-hover)' }}
        title={open ? 'Fold this answer away' : 'Show this answer'}
      >
        <span style={{ flexShrink: 0, marginTop: 1, color: 'var(--color-text-muted)' }}>
          {open ? <ChevronDownIcon size={IconSize.inline} /> : <ChevronRightIcon size={IconSize.inline} />}
        </span>
        <span style={{ flexShrink: 0, marginTop: 1, color: ACCENT }}>
          <UserPromptIcon size={IconSize.inline} />
        </span>
        <span style={{ color: 'var(--color-text-primary)', overflowWrap: 'anywhere', flex: 1 }}>
          {turn.question}
        </span>
        {!open && turn.streaming && <SpinnerIcon size={IconSize.inline} color={ACCENT} />}
      </button>

      {open && (turn.error ? (
        <div className="px-3 py-2.5 text-[11.5px] flex items-start gap-2"
             style={{ color: 'var(--color-error)' }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}><SparkleIcon size={IconSize.inline} /></span>
          <span style={{ flex: 1 }}>{turn.error}</span>
        </div>
      ) : (
        <div className="px-3 py-2.5 text-[12px] flex items-start gap-2"
             style={{ color: 'var(--color-text-primary)' }}>
          <span style={{ flexShrink: 0, marginTop: 2, color: ACCENT }}>
            <SparkleIcon size={IconSize.inline} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {turn.text
              ? <MdViewer content={turn.text} />
              : <span className="text-[11.5px] text-[var(--color-text-muted)]">Thinking…</span>}
            {turn.streaming && turn.text && (
              <span style={{
                display: 'inline-block', width: 6, height: 13, marginLeft: 2,
                background: ACCENT, verticalAlign: 'text-bottom', opacity: 0.8,
              }} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AnswerCard({ answer }: { answer: Dk8sAnswer }) {
  const [showEvidence, setShowEvidence] = useState(false);
  /* The whole card folds too: a panel holding four analyses is four screens of
     prose, and the one being read is never the first. */
  const [open, setOpen] = useState(true);

  return (
    /*
      `shrink-0`, and it is the whole reason this panel would not scroll.

      The column is a flex container, so every card is a flex item with
      `flex-shrink: 1`. A flex item's automatic minimum size normally protects
      its content — but `overflow: hidden` (here, for the rounded corners) sets
      that minimum to zero. So instead of the column overflowing and scrolling,
      each card was squashed to fit and its answer clipped: the content was
      never taller than the box, which is why there was never a scrollbar.
    */
    <div className="flex flex-col rounded-lg overflow-hidden shrink-0"
         style={{
           background: 'var(--color-surface)',
           border: `1px solid ${answer.error
             ? 'color-mix(in srgb, var(--color-error) 35%, transparent)'
             : 'var(--color-surface-border)'}`,
         }}>
      <div className="flex items-center gap-2 px-3 py-2"
           style={{ borderBottom: open ? '1px solid var(--color-surface-border)' : 'none' }}>
        {/* The chevron folds the whole card. Four analyses in one panel is four
            screens of prose, and the one being read is never the first. */}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center cursor-pointer border-none bg-transparent p-0 shrink-0"
          style={{ color: 'var(--color-text-muted)' }}
          title={open ? 'Fold this answer away' : 'Show this answer'}
        >
          {open ? <ChevronDownIcon size={IconSize.inline} /> : <ChevronRightIcon size={IconSize.inline} />}
        </button>
        {answer.streaming
          ? <SpinnerIcon size={IconSize.action} color={ACCENT} />
          : <SparkleIcon size={IconSize.action} color={ACCENT} />}
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

      {open && (answer.error ? (
        <div className="px-3 py-2.5 text-[11.5px]" style={{ color: 'var(--color-error)' }}>
          {answer.error}
        </div>
      ) : (
        <div className="px-3 py-2.5 text-[12px] flex items-start gap-2"
             style={{ color: 'var(--color-text-primary)' }}>
          {/* Who replied. The question above carries a person; this carries the
              model, so a thread reads as a conversation rather than as prose
              that changes voice without saying so. */}
          <span style={{ flexShrink: 0, marginTop: 2, color: ACCENT }}>
            <SparkleIcon size={IconSize.inline} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
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
        </div>
      ))}

      {/*
        The thread, under the answer it belongs to.

        Follow-ups sit inside the card rather than becoming cards of their own,
        because they are not separate answers — "and the restarts?" is
        meaningless away from the log it was asked about, and a flat list of
        loose questions could not tell you which evidence each one meant.
      */}
      {open && answer.turns.map((t, i) => <Turn key={i} turn={t} />)}

      {/* Only once there is something to follow up ON. A composer under a
          card that is still producing its first answer invites a question
          about an answer nobody has read. */}
      {open && !answer.streaming && !answer.error && answer.text && (
        <FollowUpBox answerId={answer.id} busy={answer.turns.some(t => t.streaming)} />
      )}

      {open && (
      <button
        type="button"
        onClick={() => setShowEvidence(v => !v)}
        className="flex items-center gap-1 px-3 py-1.5 text-[10.5px] cursor-pointer border-none bg-transparent text-left"
        style={{
          color: 'var(--color-text-muted)',
          borderTop: '1px solid var(--color-surface-border)',
        }}
      >
        {showEvidence ? <ChevronDownIcon size={IconSize.inline} /> : <ChevronRightIcon size={IconSize.inline} />}
        {showEvidence ? 'Hide' : 'Show'} what was sent
        {' · '}
        {(() => {
          const n = answer.evidence.split('\n').length;
          return `${n} line${n === 1 ? '' : 's'}`;
        })()}
      </button>
      )}

      {/*
        What was taken out, next to what was sent.

        Only when something was actually removed — a standing "0 secrets found"
        on every answer is a line nobody reads by the second time, and its
        absence would then mean nothing. Shown above the evidence because it
        explains the «redacted» markers the reader is about to meet.
      */}
      {showEvidence && answer.redactionNote && (
        <div className="px-3 py-1.5 text-[10px] flex items-start gap-1.5"
             style={{
               background: 'color-mix(in srgb, var(--color-success) 10%, transparent)',
               color: 'var(--color-success)',
               borderTop: '1px solid color-mix(in srgb, var(--color-success) 25%, transparent)',
             }}>
          <ShieldIcon size={IconSize.inline} />
          <span>{answer.redactionNote}</span>
        </div>
      )}

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
 * Ask again, on this thread.
 *
 * Enter sends and Shift+Enter breaks the line, which is the arrangement every
 * chat box has trained people into — the opposite pairing makes the common
 * case need a mouse.
 *
 * The history depth is a setting rather than a constant because the right
 * answer depends on what is being discussed: a short exchange about one stack
 * trace wants everything, and a long session over a two-hundred-line log
 * cannot afford to re-send itself on every turn.
 */
function FollowUpBox({ answerId, busy }: { answerId: string; busy: boolean }) {
  const [text, setText] = useState('');
  const followUp = useDk8sAiStore(s => s.followUp);
  const historyTurns = useAppSettingsStore(s => s.settings.dk8sAiHistoryTurns);

  const send = () => {
    const q = text.trim();
    if (!q || busy) return;
    setText('');
    followUp(answerId, q, historyTurns);
  };

  /*
    The app's own chat composer, not a textarea with a button bolted beside it.

    The follow-up box was a two-row `MultilineInputView` with a 26px square
    button next to it — two rectangles with a gap down the middle, where the
    Daakia AI tab has one rounded composer with the send inside it. Same
    question being asked in both places, so it should be the same object.

    `ChatInputView` is that shape and already handles the auto-grow and the
    Enter-to-send, so this is less code as well as the right one.
  */
  return (
    <div className="px-2 py-2" style={{ borderTop: '1px solid var(--color-surface-border)' }}>
      <ChatInputView
        value={text}
        onChange={setText}
        onSend={send}
        disabled={busy}
        placeholder={busy ? 'waiting for the answer…' : 'Ask a follow-up — Enter to send'}
        size="sm"
        /*
          A box, not a capsule.

          It was pill-shaped to match the Daakia AI tab, but that tab's
          composer is the whole width of a chat column and carries the shape
          well. Here it is a narrow field in a side panel stacked under square
          answer cards, and a capsule among them reads as a stray control from
          somewhere else. The default radius is the one every other input in
          this panel already uses.
        */
        color={ACCENT}
      />
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
 * same kind of thing, so the arrangement lives here once.
 *
 * The split is rendered in both states and collapsed when the panel is closed,
 * which is not a stylistic preference. This used to `return <>{children}</>`
 * when closed and mount the split when open — and that moves `children` to a
 * different position in the tree, so React unmounted and rebuilt the whole
 * subtree on every toggle. What that meant in practice: open a 200MB heap
 * dump, wait for it to parse, click AI, and the analyzer came back on its
 * "open a file" empty state with the parse thrown away. Toggling a side panel
 * must not be able to destroy what the panel is there to talk about.
 */
export function AiSplit({ children }: { children: React.ReactNode }) {
  const open = useDk8sAiStore(s => s.open);
  const [split, onResize, onResizeEnd] = useAiSplit();

  return (
    <SplitPanelView
      collapsed={!open}
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
        <SparkleIcon size={IconSize.row} color={ACCENT} />
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
            <TrashIcon size={IconSize.action} color="var(--color-text-muted)" />
          </button>
        )}

      </div>

      {/* `scrollbar-gutter: stable` keeps the track reserved, so the bar is
          visible the moment there is anything to scroll and the column does
          not shift sideways when it appears. */}
      <div className="dk8s-ai-scroll flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3 min-h-0"
           style={{ scrollbarGutter: 'stable' }}>
        {answers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
            <SparkleIcon size={IconSize.medallion} color="var(--color-text-muted)" />
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
