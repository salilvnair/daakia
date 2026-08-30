/**
 * What Analyze is about to send.
 *
 * This is the one control in dk8s that takes text off the machine, so it says
 * exactly what is leaving before it leaves. At 200 lines that is a formality
 * and the dialog reads as a receipt; at 5,000 it is a real decision — the
 * buffer gets truncated to fit a prompt, it costs real tokens, and whatever is
 * in those lines goes to a third party.
 *
 * The dialog does not change shape between those cases, only its emphasis. A
 * warning that only appears sometimes trains people to click through the times
 * it does not.
 */
import { ModalView, ButtonView, CheckboxView } from '@salilvnair/dui';
import { WarningTriangleIcon, WandIcon } from '../../icons';
import type { LogLine } from '../../store/k8s-store';
import { softPrimary } from './button-style';

const ACCENT = 'var(--color-protocol-ai)';

/**
 * How much of the buffer actually reaches the model.
 *
 * Head and tail rather than the middle: the start and end of a window are
 * where the story is, and a prompt cannot hold 5,000 lines of Spring boot
 * output anyway.
 */
export const ANALYZE_HEAD = 600;
export const ANALYZE_TAIL = 600;
export const ANALYZE_FULL_LIMIT = ANALYZE_HEAD + ANALYZE_TAIL;

/** Above this, the dialog leads with the cost rather than the confirmation. */
const LOUD_ABOVE = 800;

export interface AnalyzePlan {
  totalLines: number;
  sentLines: number;
  omittedLines: number;
  bytes: number;
  truncated: boolean;
}

export function planAnalyze(lines: LogLine[]): AnalyzePlan {
  const total = lines.length;
  const truncated = total > ANALYZE_FULL_LIMIT;
  const kept = truncated
    ? [...lines.slice(0, ANALYZE_HEAD), ...lines.slice(-ANALYZE_TAIL)]
    : lines;
  let bytes = 0;
  for (const l of kept) bytes += l.text.length + 1;
  return {
    totalLines: total,
    sentLines: kept.length,
    omittedLines: total - kept.length,
    bytes,
    truncated,
  };
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

/** A very rough token count. Log lines are token-dense; ~3.3 chars per token. */
function approxTokens(bytes: number): string {
  const t = Math.round(bytes / 3.3);
  if (t < 1000) return `~${t}`;
  return `~${(t / 1000).toFixed(t < 10_000 ? 1 : 0)}k`;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</span>
      <span className="text-[14px] font-mono"
            style={{ color: tone ?? 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}

export function AnalyzeModal({
  plan, podName, includeContext, onIncludeContext, onCancel, onConfirm,
}: {
  plan: AnalyzePlan;
  podName: string;
  includeContext: boolean;
  onIncludeContext: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const loud = plan.totalLines > LOUD_ABOVE;

  return (
    <ModalView
      open
      onClose={onCancel}
      title="Send this log to AI"
      subtitle={podName}
      size="md"
      headerColor={ACCENT}
      footerRight={
        <div className="flex items-center gap-2">
          <ButtonView label="Cancel" size="sm" variant="secondary" onClick={onCancel} />
          <ButtonView
            label={`Send ${plan.sentLines.toLocaleString()} lines`}
            size="sm" variant="secondary" accentColor={ACCENT} color={ACCENT}
            iconLeft={<WandIcon size={12} color={ACCENT} />}
            onClick={onConfirm}
            style={softPrimary(ACCENT)}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        <div className="flex gap-7 flex-wrap px-3.5 py-3 rounded-lg"
             style={{ background: 'var(--color-surface-hover)' }}>
          <Stat label="in the buffer" value={plan.totalLines.toLocaleString()} />
          <Stat label="lines sent" value={plan.sentLines.toLocaleString()}
                tone={plan.truncated ? 'var(--color-warning)' : 'var(--color-success)'} />
          <Stat label="size" value={human(plan.bytes)} />
          <Stat label="roughly" value={`${approxTokens(plan.bytes)} tokens`} />
        </div>

        {/* Truncation is stated as a fact about the answer, not as a footnote.
            A summary of the middle of an incident that silently skipped the
            middle is worse than no summary. */}
        {plan.truncated ? (
          <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg"
               style={{
                 background: 'color-mix(in srgb, var(--color-warning) 9%, transparent)',
                 border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
               }}>
            <WarningTriangleIcon size={14} color="var(--color-warning)" />
            <span className="flex flex-col gap-1.5 text-[11.5px] leading-relaxed"
                  style={{ color: 'var(--color-text-secondary)' }}>
              <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                {plan.omittedLines.toLocaleString()} lines in the middle will not be sent.
              </span>
              <span>
                The first {ANALYZE_HEAD} and last {ANALYZE_TAIL} lines go; the middle is
                dropped, and the model is told so. If what you are looking for is in that
                gap, filter the log down first — a level chip or a search narrows the buffer
                and the whole of what is left will be sent.
              </span>
            </span>
          </div>
        ) : (
          <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            The whole buffer fits, so nothing is dropped.
          </span>
        )}

        {loud && (
          <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            This is a large request. It will take longer and cost more than analysing a
            narrower window, and a smaller, filtered buffer usually produces a sharper
            answer than a big one.
          </span>
        )}

        <div className="flex flex-col gap-2">
          <CheckboxView
            checked={includeContext}
            onChange={onIncludeContext}
            size="sm"
            accentColor={ACCENT}
            label="Include the pod's state"
          />
          <span className="text-[10.5px] leading-relaxed pl-6"
                style={{ color: 'var(--color-text-muted)' }}>
            Phase, restart count, exit reason and runtime travel with the log.
            &ldquo;NullPointerException&rdquo; and &ldquo;NullPointerException from a pod that has
            restarted fourteen times&rdquo; are different questions.
          </span>
        </div>

        {/* Said plainly, once. This is the only thing in dk8s that sends
            anything anywhere. */}
        <div className="flex items-start gap-2 px-3 py-2 rounded-md"
             style={{ background: 'var(--color-surface-hover)' }}>
          <span className="text-[10.5px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            These lines leave this machine and go to your configured AI provider. Everything
            else dk8s collects — dumps, recordings, exported logs — stays local.
          </span>
        </div>
      </div>
    </ModalView>
  );
}
