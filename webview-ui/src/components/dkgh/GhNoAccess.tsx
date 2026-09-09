/**
 * Screen 03B — the repository exists and you cannot see it.
 *
 * GitHub returns 404 rather than 403 for a private repository you lack access
 * to, because saying "this exists but is not for you" leaks its existence.
 * That is correct of GitHub and unhelpful to the person reading it.
 *
 * **dkgh does not guess which of the four it is.** Ranking them is useful;
 * asserting one would be a confident wrong answer, and the second cause looks
 * identical to the first from here. The two commands distinguish access from
 * naming in about fifteen seconds, which is faster than any diagnosis this
 * screen could run on somebody's behalf.
 *
 * When gh's own message names the cause — a SAML org, a missing scope — that
 * cause is lifted to the top of the list rather than replacing it. gh is right
 * often enough to reorder by and not often enough to trust alone.
 */
import { useEffect, useState } from 'react';
import { ButtonView, SetupOptionView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { LockIcon, RefreshIcon } from '../../icons';
import { GhEmpty, GhLede, GhNote, GhActions } from './GhShell';
import { ACCENT, type RepoAccess } from './types';

/**
 * The four causes, in the order they are worth checking.
 *
 * The lapsed SSO grant is second because it is both extremely common and
 * completely invisible: people are signed in, the token is valid, and one
 * organisation has silently disappeared from what it can reach.
 */
function causes(org: string) {
  return [
    { id: 'team', text: <>You are not a member of the team that owns it</> },
    {
      id: 'sso',
      text: <>Your SSO session for <b style={{ color: 'var(--color-text-primary)' }}>{org}</b>{' '}
        has lapsed — this is the common one</>,
    },
    { id: 'name', text: <>The name is wrong, or it was renamed</> },
    { id: 'gone', text: <>It genuinely does not exist</> },
  ];
}

export function GhNoAccess({ repo, onRetry, onChangeRepo }: {
  repo: string;
  onRetry: () => void;
  onChangeRepo: () => void;
}) {
  const [access, setAccess] = useState<RepoAccess | null>(null);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type !== 'dkgh:inspectRepo:result') return;
      if (msg.repo !== repo) return;
      setAccess(msg as unknown as RepoAccess);
    };
    window.addEventListener('message', handler);
    postMsg({ type: 'dkgh:inspectRepo', repo });
    return () => window.removeEventListener('message', handler);
  }, [repo]);

  const org = repo.split('/')[0] || 'the organisation';
  const verdict = access?.verdict;

  /*
    gh's verdict reorders the list; it never shortens it.

    A SAML error message is strong evidence and not proof — an account can be
    outside the team AND outside the SSO grant, and a screen that showed only
    the second would send somebody to refresh a token that was never the
    problem.
  */
  const ranked = (() => {
    const all = causes(org);
    if (verdict === 'sso') return [all[1], all[0], all[2], all[3]];
    if (verdict === 'not-found') return [all[2], all[0], all[1], all[3]];
    return all;
  })();

  return (
    <GhEmpty icon={<LockIcon size={30} />} title={`Cannot open ${repo}`} titleColor="var(--color-warning)">
      <GhLede>
        GitHub answered <b>404</b>. For a private repository that means the same thing as
        &ldquo;no access&rdquo; — it does not distinguish, on purpose.
      </GhLede>

      <div className="w-full flex flex-col gap-2" style={{ maxWidth: 520 }}>

        <SetupOptionView
          accentColor={ACCENT}
          title="Most likely, in order"
          tag={verdict === 'sso' ? 'reordered by gh' : verdict === 'not-found' ? 'reordered by gh' : undefined}
        >
          <ol className="m-0 pl-4 flex flex-col gap-1 text-[10.5px]"
              style={{ color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
            {ranked.map(c => <li key={c.id}>{c.text}</li>)}
          </ol>
        </SetupOptionView>

        <SetupOptionView
          accentColor={ACCENT}
          recommended
          title="If it is SSO"
          tag="try first"
          command="gh auth refresh"
          note="Re-authorises the org. An expired SSO grant looks exactly like no access."
        />

        <SetupOptionView
          accentColor={ACCENT}
          title="Check what you can see"
          command={`gh repo list ${org} --limit 100`}
          note={<>If this comes back empty, it is access. If it lists repositories and not this
            one, it is the name.</>}
        />

        {access?.said && (
          <SetupOptionView
            accentColor={ACCENT}
            title="What gh said"
            note={<code style={{ overflowWrap: 'anywhere' }}>{access.said}</code>}
          />
        )}

        <GhNote title="dkgh does not guess which of the four it is" tone="warn">
          Ranking them is useful; asserting one would be a confident wrong answer, and the second
          cause looks identical to the first from here.
        </GhNote>
      </div>

      <GhActions>
        <ButtonView size="md" variant="primary" accentColor={ACCENT}
                    iconLeft={<RefreshIcon size={12} />} onClick={onRetry}>
          Try again
        </ButtonView>
        <ButtonView size="md" accentColor="var(--color-text-muted)" onClick={onChangeRepo}>
          Pick a different repository
        </ButtonView>
      </GhActions>
    </GhEmpty>
  );
}
