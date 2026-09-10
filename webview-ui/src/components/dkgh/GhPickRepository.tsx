/**
 * Screen 03 — signed in, and no repository chosen yet. With 03C and 03D in it.
 *
 * Three ways in, ordered by how likely each is to be right. The git remote
 * guess is first because the repository you are testing is usually the
 * repository you have open, and it arrives with the two facts worth knowing
 * before you commit to it: how many issues are waiting, and whether it has
 * templates for the composer to read. When that guess turns out to be a fork,
 * it is replaced in place by screen 03C — the fork question IS the guess.
 *
 * Below it, 03D: what this workspace is on, what is pinned, and where you have
 * been. **Recent is per workspace; pinned is global.** A lead across three
 * products pins the three they always want and gets them everywhere; the recent
 * list stays specific to the workspace so a QA workspace does not fill up with
 * repositories from a different product. The counts are cached from the last
 * read, with their age — a picker that fires four API calls to render a list is
 * a picker that is slow every time.
 *
 * Typing two characters hands the whole tab to screen 03A. A search that
 * covers every org, with the two columns that decide the choice, does not fit
 * under a card — and half a search in a corner is how somebody concludes their
 * repository is not there.
 *
 * The scope readout at the bottom is here rather than buried in Settings for
 * one reason: this is the last screen before the board, and "why is my roadmap
 * empty" is answered by a line on it. Saying so now costs a glance;
 * discovering it on screen 07 costs an afternoon.
 */
import { useEffect, useState } from 'react';
import {
  ButtonView, IconButtonView, SearchFieldView, SetupOptionView, BadgeChipView,
  SkeletonView,
} from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import {
  RepoIcon, CheckIcon, WarningTriangleIcon, LockIcon, PinIcon, UnpinIcon,
} from '../../icons';
import { GhEmpty, GhLede, GhNote, GhCommand } from './GhShell';
import { Ico } from './GhIcons';
import { GhForkChoice } from './GhForkChoice';
import { since, formsLabel } from './format';
import {
  ACCENT, activeAccount, hasScope,
  type GhEnv, type RepoSummary, type ForkChoice,
} from './types';

/** `owner/name`, and nothing that would make gh reinterpret it as a URL or path. */
const VALID = /^[^/\s]+\/[^/\s]+$/;

/** What each scope buys, in the order they matter. */
const SCOPES = [
  { name: 'repo',         buys: 'Reading issues, and creating them',    required: true },
  { name: 'read:project', buys: 'Status, Priority, Start date and ETA', required: false },
];

export function GhPickRepository({ env, typed, onTyped, onSearch, onPick, onOpenAccount }: {
  env: GhEnv;
  /** The search term, held by the tab so leaving 03A and coming back keeps it. */
  typed: string;
  onTyped: (v: string) => void;
  /** Two characters is enough — hand the tab to screen 03A. */
  onSearch: () => void;
  onPick: (repo: string) => void;
  /** Screens 02A/B/D/E — reached from the scope readout at the bottom. */
  onOpenAccount?: () => void;
}) {
  const [guess, setGuess] = useState<{ repo?: RepoSummary; reason?: string } | null>(null);
  const [fork, setFork] = useState<ForkChoice | undefined>();
  const [recent, setRecent] = useState<RepoSummary[]>([]);
  const [pinned, setPinned] = useState<RepoSummary[]>([]);

  const account = activeAccount(env);
  const missingProject = !hasScope(account, 'read:project');
  const exact = VALID.test(typed.trim());
  /* The guess is one gh call away, so its slot holds the card's outline rather
     than a spinner — the real card lands where the outline stood, and the two
     options below it never move. */
  const guessing = guess === null;

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type !== 'dkgh:repoOptions:result') return;
      setRecent((msg.recent as RepoSummary[]) ?? []);
      setPinned((msg.pinned as RepoSummary[]) ?? []);
      /* The cached pass carries the lists and nothing else — it is the last
         read replayed, and it has no opinion about the guess. Letting it set
         one would clear the real answer the moment it arrived. */
      if (msg.cached) return;
      setGuess(msg.guess as { repo?: RepoSummary; reason?: string });
      setFork(msg.fork as ForkChoice | undefined);
    };
    window.addEventListener('message', handler);
    postMsg({ type: 'dkgh:repoOptions' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const pin = (repo: string) => postMsg({ type: 'dkgh:pinRepo', repo });
  const isPinned = (repo: string) => pinned.some(p => p.nameWithOwner === repo);

  return (
    <GhEmpty icon="repo" title="Which repository?">
      <GhLede>
        Signed in as <span style={{ color: 'var(--dk-text)' }}>{account?.login}</span>
        {' '}on {account?.host}. Pick the repository whose issues you want to read and write.
      </GhLede>

      {/* One column at the mock's width: these are ways in, ordered by how
          likely each is to be right, not a grid of equals. */}
      <div className="opts" style={{ gridTemplateColumns: '1fr', maxWidth: 470 }}>

        {/* The guess — or, when it is a fork, the question the fork raises */}
        {guessing ? (
          <GuessSkeleton />
        ) : fork ? (
          <GhForkChoice choice={fork} onPick={onPick} />
        ) : guess.repo ? (
          <div className="opt pick">
            <div className="oh">
              <Ico name="repo" style={{ color: 'var(--dk-gh)' }} />
              {guess.repo.nameWithOwner}
              <span className="tag">from git remote</span>
              <span className="sp" />
              <button type="button" className="btn go" style={{ padding: '3px 10px' }}
                      onClick={() => onPick(guess.repo!.nameWithOwner)}>
                Use this
              </button>
            </div>
            <div className="sub">
              <RepoFacts repo={guess.repo} lead="Detected in the open workspace" />
            </div>
          </div>
        ) : (
          /* Named, not swallowed: "no remote" and "you cannot see this
             repository" are different problems with different fixes. */
          <GhNote title="No guess from this workspace">{guess.reason}</GhNote>
        )}

        {/* The search */}
        <div className="opt">
          <div className="oh">
            <Ico name="search" style={{ color: 'var(--dk-muted)' }} />
            Search your repositories
            <span className="sp" />
            {exact && (
              <button type="button" className="btn go" style={{ padding: '3px 10px' }}
                      onClick={() => onPick(typed.trim())}>
                Use this
              </button>
            )}
          </div>
          <div className="cmd">
            <Ico name="search" style={{ color: 'var(--dk-faint)' }} />
            <input
              value={typed}
              onChange={e => {
                onTyped(e.target.value);
                if (e.target.value.trim().length >= 2) onSearch();
              }}
              /* Enter takes an exact owner/name straight through — typing a
                 repository you already know and waiting for a search is a step
                 nobody wants. */
              onKeyDown={e => {
                if (e.key !== 'Enter') return;
                const v = typed.trim();
                if (VALID.test(v)) onPick(v); else if (v) onSearch();
              }}
              placeholder="owner/name, or a word to search for"
              style={{
                flex: 1, minWidth: 0, background: 'transparent', border: 'none',
                outline: 'none', color: 'inherit', font: 'inherit',
              }}
            />
          </div>
          <div className="sub">
            Anything <code>gh repo list</code> can see, including private and organisation repos.
          </div>
        </div>

        {/* 03D — pinned first, because pinning is a deliberate act */}
        {pinned.length > 0 && (
          <RepoSection
            title="Pinned"
            aside="available in every workspace"
            repos={pinned}
            pinnedNames={pinned.map(p => p.nameWithOwner)}
            onPick={onPick}
            onPin={pin}
          />
        )}

        {recent.length > 0 && (
          <RepoSection
            title="Recent"
            aside="this workspace only"
            repos={recent}
            pinnedNames={pinned.map(p => p.nameWithOwner)}
            onPick={onPick}
            onPin={pin}
          />
        )}

        <GhNote title="Recent is per workspace; pinned is global">
          Which product you are testing is exactly what a workspace already distinguishes, so
          switching workspace switches repository with it — rather than leaving you filing a bug
          against the last project you looked at. Pinning is the one way out of that: it does not
          open two boards at once, it makes switching a click instead of a search.
        </GhNote>
      </div>

      {/* What this account can currently do */}
      <div className="facet" style={{ maxWidth: 470, margin: '16px auto 0', textAlign: 'left' }}>
        <div className="fh" style={{ padding: '4px 0 6px' }}>
          This account
          {onOpenAccount && (
            <button type="button" className="only" style={{ opacity: 1, marginLeft: 'auto' }}
                    onClick={onOpenAccount}>
              scopes, hosts and commands
            </button>
          )}
        </div>
        {SCOPES.map(sc => {
          const have = hasScope(account, sc.name);
          return (
            <div key={sc.name} className="fct" style={{ cursor: 'default' }}>
              <Ico
                name={have ? 'check' : 'warn'}
                style={{
                  color: have ? 'var(--dk-green)'
                    : sc.required ? 'var(--dk-red)' : 'var(--dk-amber)',
                }}
              />
              <code style={{ color: have ? 'var(--dk-text)' : 'var(--dk-muted)' }}>{sc.name}</code>
              <span style={{ color: 'var(--dk-faint)' }}>{sc.buys}</span>
            </div>
          );
        })}

        {missingProject && (
          <div style={{ marginTop: 8 }}>
            <GhCommand text="gh auth refresh --scopes read:project" prompt="$" />
            <div className="sub" style={{ marginTop: 6 }}>
              Adds the scope in place — keeps your account, your protocol and your existing
              scopes. Without it the board still works; the roadmap and the date columns say
              what is missing rather than showing blanks.
            </div>
          </div>
        )}
      </div>
    </GhEmpty>
  );
}

/**
 * The guess, before it arrives.
 *
 * Same border, padding and rows as the card it stands in for, and lit in the
 * accent because the guess is the recommended route whether or not its name is
 * known yet. Nothing below it shifts when the answer lands.
 */
function GuessSkeleton() {
  return (
    <div className="opt pick">
      <div className="oh animate-pulse" style={{ gap: 8 }}>
        <SkeletonView variant="block" width={132} height={12} />
        <SkeletonView variant="block" width={78} height={12} />
        <span className="sp" />
        <SkeletonView variant="block" width={62} height={20} />
      </div>
      <div className="animate-pulse">
        <SkeletonView variant="block" width="72%" height={9} />
      </div>
    </div>
  );
}

/** What is worth knowing about a repository before you commit to it. */
function RepoFacts({ repo, lead }: { repo: RepoSummary; lead?: string }) {
  const t = repo.templates ?? 0;
  return (
    <>
      {lead ? `${lead} — ` : ''}
      {repo.openIssues} open issue{repo.openIssues === 1 ? '' : 's'},{' '}
      {t === 0 ? 'no issue templates' : `${t} issue template${t === 1 ? '' : 's'}`}.
      {repo.parent && <> Forked from <code>{repo.parent}</code>.</>}
    </>
  );
}

/** Pinned, or recent — the same rows under a different heading. */
function RepoSection({ title, aside, repos, pinnedNames, onPick, onPin }: {
  title: string;
  aside: string;
  repos: RepoSummary[];
  pinnedNames: string[];
  onPick: (repo: string) => void;
  onPin: (repo: string) => void;
}) {
  return (
    <div className="facet" style={{ marginTop: 12, textAlign: 'left' }}>
      <div className="fh" style={{ padding: '4px 0 6px' }}>
        {title}
        <span className="n" style={{ textTransform: 'none', letterSpacing: 0 }}>{aside}</span>
      </div>
      {/* The mock's own list: an `.opt` shell with no padding of its own, and
          `.fct` rows inside it, so a repository reads the same way a facet
          value does everywhere else in the tab. */}
      <div className="opt" style={{ gap: 0, padding: 0 }}>
        {repos.map(r => (
          <RepoRow key={r.nameWithOwner} repo={r}
                   pinned={pinnedNames.includes(r.nameWithOwner)}
                   onPick={onPick} onPin={onPin} />
        ))}
      </div>
    </div>
  );
}

/**
 * One repository in a list.
 *
 * The counts carry their age when they came from the cache. A number with no
 * age on it claims to be current; this one says when it was true, which is the
 * difference between a fast picker and a lying one.
 */
function RepoRow({ repo, pinned, onPick, onPin }: {
  repo: RepoSummary;
  pinned: boolean;
  onPick: (repo: string) => void;
  onPin: (repo: string) => void;
}) {
  const t = repo.templates ?? 0;
  return (
    <div className="fct" style={{ padding: '6px 11px' }}>
      <button
        type="button"
        onClick={() => onPick(repo.nameWithOwner)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0,
          background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
          color: 'inherit', font: 'inherit', textAlign: 'left',
        }}
      >
        <Ico name={repo.isPrivate ? 'lock' : 'repo'} />
        <span style={{
          fontFamily: 'var(--mono)', color: 'var(--dk-text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {repo.nameWithOwner}
        </span>
        {repo.isArchived && <span className="chip">archived</span>}
        <span className={t > 0 ? 'chip c-gh' : 'chip'}>
          {t > 0 ? formsLabel(t) : 'no forms'}
        </span>
        {/* The count carries its age when it came from the cache. A number with
            no age on it claims to be current; this one says when it was true,
            which is the difference between a fast picker and a lying one. */}
        <span className="n">
          {repo.openIssues} open{repo.countedAt ? ` · ${since(repo.countedAt)}` : ''}
        </span>
      </button>
      <button
        type="button"
        className={`pin${pinned ? ' on' : ''}`}
        title={pinned
          ? 'Unpin — it stays in this workspace’s recents'
          : 'Pin, so it is one click away from every workspace'}
        onClick={() => onPin(repo.nameWithOwner)}
      >
        {pinned ? <UnpinIcon size={11} /> : <PinIcon size={11} />}
      </button>
    </div>
  );
}
