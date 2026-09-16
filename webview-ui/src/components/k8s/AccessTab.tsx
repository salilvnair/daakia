/**
 * What this account may do here, and how dk8s knows.
 *
 * ── Why it is a tab of its own ──
 *
 * The answer used to be scattered across the padlocks: Terminal greyed out
 * said "create on pods/exec", Logs greyed out said something else, and to read
 * the whole picture you had to click every tab and collect the sentences. And
 * the one place that came closest — the Explorer's Access panel — lives inside
 * a tab that is itself gated on exec, so on exactly the account that needs it
 * most, it cannot be opened at all.
 *
 * So: every permission on one screen, always reachable, whatever the cluster
 * said. It needs no permission of its own — it renders an answer dk8s already
 * has.
 *
 * ── Why the commands are on it ──
 *
 * "The cluster says you cannot" is a claim, and the reader's next thought is
 * reasonably "that is not what my terminal says". Each row carries the exact
 * `kubectl auth can-i` that produced its answer, copyable, so the disagreement
 * can be settled in one paste rather than argued about. That is the same
 * gesture the loading states make, drawn the same way.
 */
import { useMemo, useState } from 'react';
import { CopyButtonView, IconSize } from '@salilvnair/dui';
import { ACCESS_CHECKS, canILine, type AccessKey } from '@daakia/access-checks';
import { useK8sStore } from '../../store/k8s-store';
import { LockIcon, CheckIcon, InfoCircleIcon, RefreshIcon } from '../../icons';
import { ACCENT, OK } from './tone';

type Verdict = 'allowed' | 'denied' | 'unknown';

const TONE: Record<Verdict, string> = {
  allowed: OK,
  denied: 'var(--color-error)',
  unknown: 'var(--color-text-muted)',
};

const WORD: Record<Verdict, string> = {
  allowed: 'allowed',
  denied: 'denied',
  unknown: 'not established',
};

/**
 * Three states, not two.
 *
 * `probed` is false when the check could not be made — an expired credential,
 * a cluster that refuses SelfSubjectAccessReview, a proxy in the way. dk8s
 * fails open there and every action stays enabled, so saying "allowed" would
 * be claiming an answer nobody gave. That distinction is the entire reason
 * this feature was rewritten, and it would be a waste to hide it here.
 */
export function verdictOf(allowed: boolean, probed: boolean): Verdict {
  if (!probed) return 'unknown';
  return allowed ? 'allowed' : 'denied';
}

/** The one-line summary at the top: what this account can do, counted. */
export function summarise(
  access: Record<AccessKey, boolean> & { probed: boolean },
): { allowed: number; denied: number; unknown: number } {
  let allowed = 0, denied = 0, unknown = 0;
  for (const c of ACCESS_CHECKS) {
    const v = verdictOf(access[c.key], access.probed);
    if (v === 'allowed') allowed++;
    else if (v === 'denied') denied++;
    else unknown++;
  }
  return { allowed, denied, unknown };
}

function Mark({ verdict }: { verdict: Verdict }) {
  const color = TONE[verdict];
  return (
    <span
      className="flex items-center justify-center flex-shrink-0"
      style={{
        width: 22, height: 22, borderRadius: 6,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        color,
      }}
    >
      {verdict === 'allowed' ? <CheckIcon size={12} />
        : verdict === 'denied' ? <LockIcon size={12} />
          : <InfoCircleIcon size={12} />}
    </span>
  );
}

/**
 * The line that produced a row's answer.
 *
 * Drawn the way every other command block in dk8s is drawn — the prompt, the
 * monospace line, the copy button — because it is the same offer: take this,
 * run it, see whether you get what dk8s got.
 */
function CommandCard({ line, note }: { line: string; note: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg px-4 py-3.5"
         style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}>
      <div className="flex items-center gap-2">
        <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          how dk8s knows
        </span>
        <span className="flex-1" />
        <CopyButtonView text={line} title="Copy this command" accentColor={ACCENT} />
      </div>
      {/*
        One line, with room around it, scrolled rather than wrapped — the same
        block the loaders use, for the same reason: a line you are about to
        copy reads as one line.
      */}
      <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-md font-mono text-[11.5px]"
           data-nobar="true"
           style={{
             background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)',
             overflowX: 'auto', whiteSpace: 'nowrap', scrollbarWidth: 'none',
           }}>
        <span style={{ color: ACCENT, userSelect: 'none' }}>$</span>
        <span>{line}</span>
      </div>
      <span className="text-[10.5px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
        {note}
      </span>
    </div>
  );
}

export function AccessTab({ context, namespace }: { context: string; namespace: string }) {
  const access = useK8sStore(s => s.access);
  const probe = useK8sStore(s => s.probe);
  const [open, setOpen] = useState<AccessKey | null>(null);

  const counts = useMemo(() => summarise(access), [access]);

  const rows = ACCESS_CHECKS.map(c => ({
    check: c,
    verdict: verdictOf(access[c.key], access.probed),
    line: canILine(c, context, namespace),
  }));

  return (
    <div className="h-full min-h-0 overflow-auto px-5 py-4">
      <div className="flex flex-col gap-4 mx-auto" style={{ maxWidth: 780 }}>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              What this account may do in {namespace}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={probe}
              title="Ask the cluster again"
              className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded cursor-pointer transition-colors"
              style={{ background: 'none', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)' }}
            >
              <RefreshIcon size={11} /> Re-check
            </button>
          </div>
          <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Asked with <code>kubectl auth can-i</code>, which is a SelfSubjectAccessReview: the API
            server evaluates the same RBAC rules it would apply to the real call and answers without
            doing anything. Nothing here was tried against the pod.
          </span>
        </div>

        {/*
          The counts, and the one that matters said plainly.

          A read-only account is the normal case on a company cluster, not a
          fault, so this does not lead with how much is denied.
        */}
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <Tally n={counts.allowed} word="allowed" color={OK} />
          {counts.denied > 0 && <Tally n={counts.denied} word="denied" color="var(--color-error)" />}
          {counts.unknown > 0 && <Tally n={counts.unknown} word="not established" color="var(--color-text-muted)" />}
        </div>

        {!access.probed && (
          <div className="flex flex-col gap-1 px-3 py-2.5 rounded-lg text-[11.5px] leading-relaxed"
               style={{
                 background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
                 border: '1px solid color-mix(in srgb, var(--color-warning) 28%, transparent)',
                 color: 'var(--color-warning)',
               }}>
            <span style={{ fontWeight: 600 }}>The cluster did not answer the permission check.</span>
            {/* What kubectl actually said, where it said anything.

                Listing every possible cause is true and useless: a credential
                helper that timed out and an expired token need different
                things done, and the cluster already named which. */}
            {access?.detail ? (
              <span className="font-mono text-[11px]"
                    style={{ color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>
                {access.detail}
              </span>
            ) : (
              <span style={{ color: 'var(--color-text-secondary)' }}>
                An expired credential, a cluster that will not run SelfSubjectAccessReview, or a
                proxy in the way all look like this.
              </span>
            )}
            <span style={{ color: 'var(--color-text-secondary)' }}>
              dk8s leaves every action enabled rather than hiding one that would have worked
              &mdash; so what you see below is what it does not know, not what you cannot do. Run
              a line and the cluster will tell you which.
            </span>
          </div>
        )}

        <div className="flex flex-col rounded-lg overflow-hidden"
             style={{ border: '1px solid var(--color-surface-border)' }}>
          {rows.map(({ check, verdict, line }, i) => {
            const isOpen = open === check.key;
            return (
              <div key={check.key}
                   style={{ borderTop: i === 0 ? undefined : '1px solid var(--color-surface-border)' }}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : check.key)}
                  className="w-full flex items-start gap-3 px-3.5 py-3 text-left cursor-pointer transition-colors"
                  style={{ background: isOpen ? 'var(--color-surface)' : 'none', border: 'none' }}
                >
                  <Mark verdict={verdict} />
                  <span className="flex flex-col gap-1 min-w-0 flex-1">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12.5px]" style={{ color: 'var(--color-text-primary)' }}>
                        {check.title}
                      </span>
                      <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide"
                            style={{
                              color: TONE[verdict],
                              backgroundColor: `color-mix(in srgb, ${TONE[verdict]} 14%, transparent)`,
                              border: `1px solid color-mix(in srgb, ${TONE[verdict]} 20%, transparent)`,
                            }}>
                        {WORD[verdict]}
                      </span>
                    </span>
                    <span className="text-[11px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
                      {check.rule}
                    </span>
                    <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                      {check.gates}
                    </span>
                  </span>
                </button>

                {/*
                  The panel is inset the same amount on both sides.

                  It was `paddingLeft: 49` to line the card up under the row's
                  text, and flush on the right — so it read as a block that had
                  slipped rather than a panel belonging to the row above it.
                  Even inset now, and the same 14px the row header uses, so the
                  whole tab sits on one rhythm.
                */}
                {isOpen && (
                  <div className="flex flex-col gap-2.5 px-3.5 pb-3.5">
                    <CommandCard
                      line={line}
                      note={verdict === 'denied'
                        ? 'It printed nothing and exited 1. With --quiet that is the API server '
                          + 'evaluating the rules and saying no — the only result dk8s treats as a refusal.'
                        : verdict === 'allowed'
                          ? 'It exited 0. --quiet matters: without it kubectl prints "no" and still '
                            + 'exits 0, which would read as allowed.'
                          : 'It exited non-zero and said something on stderr, which means the check '
                            + 'could not be made rather than that the answer was no.'}
                    />
                    {verdict === 'denied' && (
                      <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                        To get it, ask whoever manages the cluster for <code>{check.rule}</code> in{' '}
                        <code>{namespace}</code>.
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <span className="text-[10.5px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          Every one of these lines is also in Settings &rarr; DK8S &rarr; Commands, with what the
          cluster said back and how long it took. Permissions are re-read a few minutes after they
          change &mdash; <span style={{ color: ACCENT }}>Re-check</span> asks now.
        </span>

      </div>
    </div>
  );
}

function Tally({ n, word, color }: { n: number; word: string; color: string }) {
  return (
    <span className="flex items-baseline gap-1.5 px-2 py-1 rounded"
          style={{ background: `color-mix(in srgb, ${color} 8%, transparent)` }}>
      <span className="text-[13px] font-semibold tabular-nums" style={{ color }}>{n}</span>
      <span style={{ color: 'var(--color-text-muted)' }}>{word}</span>
    </span>
  );
}

void IconSize;
