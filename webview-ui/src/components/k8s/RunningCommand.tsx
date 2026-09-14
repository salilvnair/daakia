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
 * Nothing is rendered when there is nothing to show — a screen with no command
 * behind it should not grow an empty box to say so.
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

export function RunningCommand({ match, now: pinnedNow, width = 460, mode = 'waiting' }: {
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
  const cmd = showable({ commands, context, now, match, mode });
  if (!cmd) return null;

  const failed = cmd.ok === false;

  return (
    <div
      className="flex flex-col gap-2 rounded-lg px-3.5 py-3 mt-2.5 mx-auto text-left"
      style={{
        maxWidth: width, width: '100%',
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
        }}
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
        <span className="text-[11px] leading-relaxed break-all"
              style={{ color: failed ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
          {cmd.said}
        </span>
      )}
    </div>
  );
}
