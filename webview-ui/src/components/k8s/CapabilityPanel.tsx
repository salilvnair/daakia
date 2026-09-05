/**
 * What this container will let you do, before you try it.
 *
 * Everything the explorer does is one `kubectl exec` running a command the
 * image may not have, so the ladder is not defensive plumbing — it is the
 * feature. It turns "that failed" into "this image has no tar", which is the
 * difference between a bug report and a decision.
 *
 * Every row is a FEATURE and a REASON, never a capability name. "Download a
 * directory — no tar in this image" rather than `tar: false`, because the
 * reader came here to find out what they can do, not to read a probe's output.
 */
import { BadgeChipView, IconSize } from '@salilvnair/dui';
import { LockIcon, RefreshIcon } from '../../icons';

export interface Capability {
  /** What you can or cannot do, in the reader's words. */
  feature: string;
  state: 'ok' | 'no' | 'warn';
  /** Why. Shown whether it worked or not — the reason is the point. */
  reason: string;
}

const TONE = {
  ok: 'var(--color-success)',
  no: 'var(--color-error)',
  warn: 'var(--color-warning)',
} as const;

const LABEL = { ok: 'ok', no: 'no', warn: 'note' } as const;

/**
 * Read the ladder out of what actually happened.
 *
 * Derived from a real listing rather than from a separate probe, because a
 * probe that says `ls` exists and a listing that failed anyway would leave the
 * panel confidently contradicting the screen behind it. The one thing that
 * cannot be inferred is tar, which only a directory copy exercises — so it is
 * reported as unknown rather than guessed.
 */
export function capabilitiesFrom(o: {
  listed: boolean;
  listError?: string;
  searched?: boolean;
  read?: boolean;
  tar?: boolean;
}): Capability[] {
  const noShell = /no shell or coreutils/i.test(o.listError ?? '');
  const denied = /Permission denied/i.test(o.listError ?? '');
  const rbac = /RBAC/i.test(o.listError ?? '');

  const out: Capability[] = [];

  out.push(rbac
    ? { feature: 'Exec into this pod', state: 'no',
        reason: 'The cluster refuses pods/exec here. That is an RBAC decision, '
          + 'not something dk8s can work around.' }
    : { feature: 'Exec into this pod', state: 'ok',
        reason: 'The commands below run over the exec channel.' });

  out.push(noShell
    ? { feature: 'Browse the filesystem', state: 'no',
        reason: 'This image has no shell and no coreutils — nothing can list a '
          + 'path inside it. Distroless and scratch images look like this.' }
    : o.listed
      ? { feature: 'Browse the filesystem', state: 'ok', reason: '`ls` answered.' }
      : denied
        ? { feature: 'Browse the filesystem', state: 'warn',
            reason: 'Listing worked, but this path is not readable by the user the '
              + 'container runs as. A root-owned volume under a non-root container '
              + 'looks exactly like an empty one.' }
        : { feature: 'Browse the filesystem', state: 'warn',
            reason: 'Not established yet — open a directory.' });

  out.push(noShell
    ? { feature: 'Search by name', state: 'no',
        reason: 'Search runs through `sh -c`, and there is no shell here.' }
    : { feature: 'Search by name', state: 'ok',
        reason: '`find`, capped by depth and result count so a large volume '
          + 'cannot be walked forever.' });

  out.push(noShell
    ? { feature: 'Open and download a file', state: 'no',
        reason: 'Reading a file needs `cat`, which this image does not have.' }
    : { feature: 'Open and download a file', state: 'ok',
        reason: 'Streams over `cat` — no tar involved, so this works on images '
          + 'where a directory copy cannot.' });

  out.push(o.tar === false
    ? { feature: 'Download a whole directory', state: 'no',
        reason: 'No tar in this image, and `kubectl cp` is tar over the exec '
          + 'channel. Individual files still download.' }
    : o.tar === true
      ? { feature: 'Download a whole directory', state: 'ok',
          reason: '`kubectl cp`, which is tar over the exec channel.' }
      : { feature: 'Download a whole directory', state: 'warn',
          reason: 'Needs tar, and only a copy proves whether this image has it. '
            + 'If it does not, the download says so rather than failing quietly.' });

  return out;
}

export function CapabilityPanel({ capabilities, onRecheck }: {
  capabilities: Capability[];
  onRecheck?: () => void;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-3 px-3 py-1.5 flex-shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <LockIcon size={IconSize.action} color="var(--color-text-muted)" />
        <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
          What this container will allow
        </span>
        <span className="flex-1" />
        {onRecheck && (
          <button
            type="button"
            onClick={onRecheck}
            className="flex items-center gap-1.5 rounded-md px-2 py-1"
            style={{
              fontSize: 10, cursor: 'pointer', color: 'var(--color-text-muted)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-surface-border)',
            }}
          >
            <RefreshIcon size={IconSize.inline} /> Check again
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
        {capabilities.map(c => (
          <div key={c.feature} className="flex items-start gap-3 py-1.5">
            {/* A fixed width so three verdicts down the column line up; the
                chip centres its own text inside that. */}
            <BadgeChipView tone={TONE[c.state]} style={{ width: 40, marginTop: 1 }}>
              {LABEL[c.state]}
            </BadgeChipView>

            <span style={{ minWidth: 0, flex: 1 }}>
              <div className="text-[11.5px]" style={{ color: 'var(--color-text-primary)' }}>
                {c.feature}
              </div>
              <div className="text-[10.5px] leading-relaxed"
                   style={{ color: 'var(--color-text-muted)' }}>
                {c.reason}
              </div>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
