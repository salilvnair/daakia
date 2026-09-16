/**
 * The command a wait is waiting on, in the block you can copy and run.
 *
 * Every dk8s loading state names its subject — "Listing namespaces in
 * staging-eu" — which answers *what* but never *how*. When a cluster answers a
 * terminal in a second and dk8s appears to take forever, the only useful
 * question is which line it actually ran, and until now the only way to find
 * out was to ask somebody who had the source open.
 *
 * So the command goes under the spinner, verbatim and copyable, drawn the way
 * dkgh draws an install command — same prompt, same block, same copy button —
 * because it is the same gesture: take this line, run it yourself, see what it
 * says. If dk8s and your terminal disagree, that is the comparison that settles
 * it.
 *
 * It is the same string the audit records, from the same event, so what a
 * loading state shows and what actually ran cannot drift apart.
 *
 * On a loader it always renders. It used to disappear when no command matched,
 * which made the card look like a decoration some screens happened to have —
 * and the screens where the match can come up empty are exactly the ones where
 * somebody is asking "is it even running anything?". Silence is the one answer
 * that question must never get, so an empty card says it is empty.
 *
 * A screen showing a RESULT is different, and still renders nothing when there
 * was no command behind it.
 */
import { useEffect, useState } from 'react';
import { CopyButtonView } from '@salilvnair/dui';
import { useK8sStore, type KubectlCommand } from '../../store/k8s-store';
import { showable, type CommandMode } from './running-command-pick';
import { ACCENT } from './tone';

/** How long it ran, or how long it has been running. */
function took(cmd: KubectlCommand, now: number): string {
  const ms = cmd.ms ?? Math.max(0, now - cmd.at);
  const secs = ms / 1000;
  const shown = secs >= 10 ? `${Math.round(secs)}s`
    : secs >= 1 ? `${secs.toFixed(1)}s`
      : `${Math.round(ms)}ms`;
  /* A stream has no end to time, so its number is how long it has been open. */
  return cmd.ms === undefined ? `${shown} so far` : shown;
}

export function RunningCommand({ match, now: pinnedNow, width = 1040, mode = 'waiting' }: {
  /**
   * Only show a command whose verb starts with this — `get pods`, `auth can-i`.
   *
   * A panel waiting on the pod list should not display the log stream that
   * happened to start a moment later. Without it the newest command wins,
   * which is right for a screen that owns the whole tab.
   */
  match?: string;
  /** Injectable for tests; the elapsed figure is otherwise unpinnable. */
  now?: number;
  width?: number;
  /**
   * `waiting` on a loader, `settled` on a screen that is showing a result.
   *
   * A failure screen's command has finished — that is what makes it a result —
   * so it must not be aged out there. See `running-command-pick.ts`.
   */
  mode?: CommandMode;
}) {
  const commands = useK8sStore(s => s.commands);
  const context = useK8sStore(s => s.context);

  /*
    A clock of its own.

    `now` was read once per render and nothing scheduled a render, so the
    "so far" figure sat still on the one screen whose whole job is to show that
    something is still happening — and the grace window below would never have
    expired on its own either. A second is the right grain for a number that is
    read as "is this taking a while".
  */
  /*
    When this wait began.

    Fixed at mount, which is when the loader appeared, and it is what lets a
    command that has finished stay on screen for the wait it belongs to while
    the backlog the host replays at panel open stays off it.
  */
  const [since] = useState(() => Date.now());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (pinnedNow !== undefined) return;    // a test pinned the clock
    const t = setInterval(() => setTick(n => n + 1), 1_000);
    return () => clearInterval(t);
  }, [pinnedNow]);
  const now = pinnedNow ?? Date.now();
  void tick;

  /*
    Only this cluster's commands, and only while they are current.

    Both halves were missing, and both produced the same lie. "slow-lab did not
    answer" carried `kubectl --context restricted-lab ... top pods` underneath
    it, because the newest line in the feed won whatever cluster it belonged
    to. And on a fresh start the card came up with a finished command's error
    still under it -- the feed outlives the wait, so "what this screen is
    waiting on" had become "the last thing that happened".

    The rule itself is in `running-command-pick.ts`, where a test can reach it.
  */
  const cmd = showable({ commands, context, now, match, mode, since });

  /*
    A loader always carries a card, even when there is nothing in it yet.

    This used to render nothing when no command matched, which made the card
    look optional — a spinner with one under it and a spinner without one were
    two different screens for no reason the reader could see, and the screens
    that most needed it (a pod list that never arrives) were the ones where the
    match could come up empty. "Is dk8s even running anything?" is precisely
    the question this box exists to answer, and silence is the one answer it
    must never give.

    A settled screen is different: it shows a RESULT, and a result that had no
    command behind it should not grow an empty box to say so.
  */
  if (!cmd) {
    if (mode !== 'waiting') return null;
    return (
      <div
        className="flex items-center gap-2 rounded-lg px-4 py-3 mt-2.5 mx-auto text-left"
        style={{
          width: 'max-content',
          maxWidth: `min(94%, ${width}px)`,
          minWidth: 'min(94%, 380px)',
          background: 'var(--color-surface)',
          border: '1px dashed var(--color-surface-border)',
        }}
      >
        <span className="text-[11px] uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}>
          Running
        </span>
        <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {/* Said plainly, because it is a real state: dk8s is between calls,
              or the one it is waiting on belongs to another cluster. Either
              way the honest answer is that nothing is running here. */}
          nothing for this cluster yet &mdash; no kubectl call has started
        </span>
      </div>
    );
  }

  const failed = cmd.ok === false;

  return (
    <div
      className="flex flex-col gap-2 rounded-lg px-4 py-3 mt-2.5 mx-auto text-left"
      style={{
        /*
          As wide as the line it holds, and no wider.

          Two earlier versions were wrong in opposite directions: a fixed width
          left a short command floating in an over-large box, and a percentage
          of the panel made the card change size as the window did while the
          line inside stayed put. `max-content` sizes the card to the command —
          so the box is the command's own length, centred, up to a ceiling past
          which a genuinely long line scrolls inside it.
        */
        width: 'max-content',
        maxWidth: `min(94%, ${width}px)`,
        minWidth: 'min(94%, 380px)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}>
          {cmd.kind === 'stream' ? 'Streaming' : 'Running'}
        </span>
        <span className="text-[11px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {took(cmd, now)}
        </span>
        <span className="flex-1" />
        <CopyButtonView text={cmd.command} title="Copy this command" accentColor={ACCENT} />
      </div>

      {/*
        One line, scrolled sideways if it has to be.

        It was `break-all`, which wrapped mid-flag: `--request-time` on one line
        and `out=10s` on the next. A line you are about to copy and paste reads
        as one line, and a wrapped one reads as two commands — so the box
        scrolls instead, and the copy button takes the whole of it either way.
      */}
      <div
        className="flex items-start gap-2 px-2.5 py-1.5 rounded font-mono text-[11.5px]"
        style={{
          background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)',
          overflowX: 'auto', whiteSpace: 'nowrap',
          /* Scrollable, but without the bar. A horizontal scrollbar under a
             single line of text reads as a layout mistake, and the copy button
             is how the whole line is actually taken. */
          scrollbarWidth: 'none',
        }}
        /* Firefox and Chromium disagree about how to hide it; the class carries
           the WebKit half. */
        data-nobar="true"
      >
        <span style={{ color: ACCENT, userSelect: 'none' }}>$</span>
        <span>{cmd.command}</span>
      </div>

      {/*
        What it said, when it said anything.

        A wait that ends in a refusal is the case this whole block exists for:
        the line above is what to paste into a terminal, and this is what dk8s
        got back when it ran the same thing.
      */}
      {cmd.said && (
        <span className="text-[11px] leading-relaxed"
              style={{
                color: failed ? 'var(--color-warning)' : 'var(--color-text-muted)',
                /* Prose, wrapped as prose. `break-all` split it mid-word —
                   "awaiting he / aders" — which reads as a rendering fault
                   rather than as what the cluster said. */
                overflowWrap: 'break-word', wordBreak: 'normal',
              }}>
          {cmd.said}
        </span>
      )}
    </div>
  );
}
