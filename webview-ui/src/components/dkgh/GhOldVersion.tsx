/**
 * Screen 01C — found, but too old to do everything.
 *
 * The nastiest version of this problem: gh is installed, signed in, and works
 * right up until a command it does not have. A blanket "upgrade" wall would be
 * wrong, because most of dkgh works fine.
 *
 * So: degrade, do not block. A feature matrix rather than a wall — the amber
 * rows name the command and the version that would fix them, so somebody on a
 * locked corporate image can have a specific conversation with whoever owns it
 * instead of an argument about "the tool wants an upgrade".
 *
 * Everything here is read from CAPABILITY, never from the version number. A
 * corporate build can call itself anything; what matters is whether the command
 * exists. The number in the table is for the reader.
 */
import { useState } from 'react';
import { ButtonView, BadgeChipView, ModalView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { WarningTriangleIcon, CloseIcon } from '../../icons';
import { ACCENT, type GhEnv } from './types';

interface Feature {
  what: string;
  /** The version that first shipped it, for the reader's conversation. */
  needs: string;
  /** How this reads when the capability is absent — never just "unavailable". */
  degraded: string;
  has: (c: NonNullable<GhEnv['capabilities']>) => boolean;
}

const FEATURES: Feature[] = [
  { what: 'Board, table, filters', needs: 'gh 2.0',
    degraded: 'the board cannot run', has: c => c.issueJson },
  { what: 'Create and edit issues', needs: 'gh 2.0',
    degraded: 'read only', has: c => c.issueCreate && c.issueEdit },
  { what: 'Evidence upload', needs: 'gh 2.4',
    degraded: 'paste a link instead', has: c => c.issueCreate },
  { what: 'Status, Priority, dates', needs: 'gh 2.28 — project',
    degraded: 'columns show —', has: c => c.project },
  { what: 'Issue types', needs: 'gh 2.60',
    degraded: 'falls back to labels', has: c => c.issueTypes },
];

/** Which features this gh cannot do. Empty means there is nothing to say. */
export function missingFeatures(env: GhEnv | null): Feature[] {
  if (!env?.capabilities) return [];
  const caps = env.capabilities;
  return FEATURES.filter(f => !f.has(caps));
}

/**
 * The banner, and the matrix behind it.
 *
 * Dismissible per repository, because a team on a pinned corporate gh should
 * not be nagged daily about a version they cannot change — and because the
 * features it names only matter for the repository you are looking at.
 */
export function GhOldVersion({ env, repo, dismissed, onDismiss }: {
  env: GhEnv;
  repo?: string;
  dismissed: string[];
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);
  const missing = missingFeatures(env);

  if (missing.length === 0) return null;
  if (repo && dismissed.includes(repo)) return null;

  const version = env.version?.version ?? env.version?.raw ?? 'unknown';
  const n = missing.length;

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-1.5 flex-shrink-0 flex-wrap"
           style={{
             borderBottom: '1px solid var(--color-surface-border)',
             background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
           }}>
        <WarningTriangleIcon size={12} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
        <BadgeChipView tone="var(--color-warning)" size="xs">old gh</BadgeChipView>
        <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
          <b style={{ color: 'var(--color-text-primary)' }}>gh {version}</b>
          {' '}— the board and the composer work.{' '}
          {n === 1 ? 'One feature does not.' : `${n} features do not.`}
        </span>
        <span className="flex-1" />
        <ButtonView size="sm" variant="ghost" accentColor={ACCENT} onClick={() => setOpen(true)}>
          What is missing
        </ButtonView>
        {/* Per repository, and only when there is one to key it to. */}
        {repo && (
          <ButtonView size="sm" accentColor="var(--color-text-muted)"
                      iconLeft={<CloseIcon size={10} />} onClick={onDismiss}>
            Dismiss for this repo
          </ButtonView>
        )}
      </div>

      <ModalView
        open={open}
        onClose={() => setOpen(false)}
        title="What this gh can and cannot do"
        subtitle={`gh ${version} · detected by running each command, not by reading the version`}
        size="md"
        headerColor={ACCENT}
        footerRight={
          <ButtonView size="md" accentColor="var(--color-text-muted)" onClick={() => setOpen(false)}>
            Close
          </ButtonView>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr>
                {['Feature', 'Needs', 'You have', 'Now'].map(h => (
                  <th key={h}
                      className="text-left px-2.5 py-1.5 text-[9.5px] font-semibold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-surface-border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map(f => {
                const ok = env.capabilities ? f.has(env.capabilities) : false;
                return (
                  <tr key={f.what}>
                    <td className="px-2.5 py-1.5" style={cell(ok)}>{f.what}</td>
                    <td className="px-2.5 py-1.5 font-mono whitespace-nowrap" style={cell(ok)}>{f.needs}</td>
                    <td className="px-2.5 py-1.5 font-mono whitespace-nowrap" style={cell(ok)}>{version}</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap" style={cell(ok)}>
                      {ok
                        ? <span style={{ color: 'var(--color-success)' }}>works</span>
                        : <span style={{ color: 'var(--color-warning)' }}>{f.degraded}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] mt-3 mb-0" style={{ color: 'var(--color-text-muted)', lineHeight: 1.65 }}>
          Nothing is blocked. The screens that need what is missing go quiet and say why; the
          rest runs exactly as it would on the newest gh. Upgrading is
          {' '}<code>winget upgrade GitHub.cli</code>, <code>brew upgrade gh</code> or your
          package manager's equivalent — and if the image is locked, the rows above are the
          specific ask.
        </p>
      </ModalView>
    </>
  );
}

function cell(ok: boolean) {
  return {
    borderBottom: '1px solid color-mix(in srgb, var(--color-surface-border) 55%, transparent)',
    color: ok ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
  } as const;
}

/** Dismiss, and remember it against this repository. */
export function dismissOldGh(repo: string) {
  postMsg({ type: 'dkgh:dismissOldGh', repo });
}
