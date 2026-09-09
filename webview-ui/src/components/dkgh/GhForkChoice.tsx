/**
 * Screen 03C — a fork, and where its issues really live.
 *
 * Your workspace's remote is a fork. Forks have issues disabled by default, and
 * the issues everybody actually reads are on the upstream — so the obvious
 * guess is the wrong repository. A fork with issues disabled would give an
 * empty board and no explanation, which is the most confusing possible first
 * run: nothing is broken and nothing is there.
 *
 * Detected from `gh repo view --json parent`, never from the name. Fork names
 * usually match their upstream, so guessing from the string would be right
 * often enough to be trusted and wrong often enough to matter.
 *
 * This renders in the guess's slot on screen 03 rather than taking the whole
 * tab. The fork question IS the guess — replacing the picker with it would hide
 * the search and the recents behind a question about a repository the reader
 * may not want either of.
 */
import { ButtonView, SetupOptionView } from '@salilvnair/dui';
import { GhNote } from './GhShell';
import { ACCENT, type ForkChoice, type RepoSummary } from './types';

export function GhForkChoice({ choice, onPick }: {
  choice: ForkChoice;
  onPick: (repo: string) => void;
}) {
  const { fork, upstream, upstreamError } = choice;
  /*
    A fork with its own tracker turned on is a deliberate choice somebody made,
    and dkgh should not overrule it — so neither side is recommended and both
    carry their counts. Only when the fork's tracker is off is the upstream the
    obvious answer, and then it says why.
  */
  const forkHasIssues = fork.hasIssues !== false;
  const preferUpstream = !!upstream && !forkHasIssues;

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="text-[11px] px-0.5" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
        <code>{fork.nameWithOwner}</code> is a fork of{' '}
        <code>{fork.parent}</code>. Which one&rsquo;s issues do you want?
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
        {upstream ? (
          <SetupOptionView
            accentColor={ACCENT}
            recommended={preferUpstream}
            title={upstream.nameWithOwner}
            tag="upstream"
            note={<Facts repo={upstream} lead="Where the team files and reads." />}
            action={
              <ButtonView size="sm" variant={preferUpstream ? 'primary' : 'secondary'}
                          accentColor={ACCENT}
                          onClick={() => onPick(upstream.nameWithOwner)}>
                Use this
              </ButtonView>
            }
          />
        ) : (
          <SetupOptionView
            accentColor={ACCENT}
            title={fork.parent ?? 'The upstream'}
            tag="upstream"
            note={<span style={{ color: 'var(--color-warning)' }}>
              {upstreamError || 'This account cannot read the upstream.'}
            </span>}
          />
        )}

        <SetupOptionView
          accentColor={ACCENT}
          title={fork.nameWithOwner}
          tag="your fork"
          note={forkHasIssues
            ? <Facts repo={fork} lead="This fork has its own issue tracker." />
            : <span style={{ color: 'var(--color-warning)' }}>
                Issues are disabled on this fork. GitHub turns them off by default —
                there is nothing to read here.
              </span>}
          action={
            <ButtonView size="sm" variant={forkHasIssues && !preferUpstream ? 'primary' : 'secondary'}
                        accentColor={forkHasIssues ? ACCENT : 'var(--color-text-muted)'}
                        title={forkHasIssues ? undefined
                          : 'The board would be empty, and the composer could not file anything'}
                        onClick={() => onPick(fork.nameWithOwner)}>
              {forkHasIssues ? 'Use this' : 'Use it anyway'}
            </ButtonView>
          }
        />
      </div>

      {preferUpstream ? (
        <GhNote title="Upstream is pre-selected, and the reason is stated" tone="warn">
          A fork with issues disabled gives an empty board and no explanation — nothing is broken
          and nothing is there, which is the hardest first run to recover from.
        </GhNote>
      ) : upstream ? (
        <GhNote title="Both are offered, and neither is pre-selected">
          A fork with its own issue tracker is a deliberate choice somebody made, and dkgh should
          not overrule it.
        </GhNote>
      ) : null}
    </div>
  );
}

/** The two numbers worth knowing before you commit to one side or the other. */
function Facts({ repo, lead }: { repo: RepoSummary; lead: string }) {
  const t = repo.templates ?? 0;
  return (
    <>
      <b style={{ color: 'var(--color-text-primary)' }}>
        {repo.openIssues} open issue{repo.openIssues === 1 ? '' : 's'} ·{' '}
        {t === 0 ? 'no issue forms' : `${t} issue form${t === 1 ? '' : 's'}`}
      </b>
      <br />
      {lead}
    </>
  );
}
