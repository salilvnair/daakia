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
import { ModalView } from '@salilvnair/dui';
import { Ico } from './GhIcons';
import { Dk } from './GhShell';
import { postMsg } from '../../vscode';
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
      {/* The mock's own changed-view strip: an amber rule down the left edge
          rather than a wash across the tab, which is a lot of screen to spend
          on something that blocks nothing. */}
      <div className="dirtybar">
        <Ico name="warn" style={{ color: 'var(--dk-amber)' }} />
        <span className="chip c-stale">old gh</span>
        <span>
          <b style={{ color: 'var(--dk-text)' }}>gh {version}</b>
          {' '}— the board and the composer work.{' '}
          {n === 1 ? 'One feature does not.' : `${n} features do not.`}
        </span>
        <span className="sp" style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          What is missing
        </button>
        {/* Per repository, and only when there is one to key it to. */}
        {repo && (
          <button type="button" className="btn" onClick={onDismiss}>
            <Ico name="x" />Dismiss for this repo
          </button>
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
          <Dk>
            <button type="button" className="btn" onClick={() => setOpen(false)}>Close</button>
          </Dk>
        }
      >
        <Dk>
          <div className="tblw">
            <table className="tbl">
              <thead>
                <tr>
                  {['Feature', 'Needs', 'You have', 'Now'].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {FEATURES.map(f => {
                  const ok = env.capabilities ? f.has(env.capabilities) : false;
                  return (
                    <tr key={f.what} style={ok ? undefined : { color: 'var(--dk-text)' }}>
                      <td>{f.what}</td>
                      <td className="dt">{f.needs}</td>
                      <td className="dt">{version}</td>
                      <td>
                        {ok
                          ? <span style={{ color: 'var(--dk-green)' }}>works</span>
                          : <span className="late">{f.degraded}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="sub" style={{ marginTop: 12 }}>
            Nothing is blocked. The screens that need what is missing go quiet and say why; the
            rest runs exactly as it would on the newest gh. Upgrading is
            {' '}<code>winget upgrade GitHub.cli</code>, <code>brew upgrade gh</code> or your
            package manager&rsquo;s equivalent — and if the image is locked, the rows above are
            the specific ask.
          </div>
        </Dk>
      </ModalView>
    </>
  );
}

/** Dismiss, and remember it against this repository. */
export function dismissOldGh(repo: string) {
  postMsg({ type: 'dkgh:dismissOldGh', repo });
}
