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
        Signed in as <span style={{ color: 'var(--color-text-primary)' }}>{account?.login}</span>
        {' '}on {account?.host}. Pick the repository whose issues you want to read and write.
      </GhLede>

      <div className="w-full flex flex-col gap-2" style={{ maxWidth: 520 }}>

        {/* The guess — or, when it is a fork, the question the fork raises */}
        {guessing ? (
          <GuessSkeleton />
        ) : fork ? (
          <GhForkChoice choice={fork} onPick={onPick} />
        ) : guess.repo ? (
          <SetupOptionView
            accentColor={ACCENT}
            recommended
            title={guess.repo.nameWithOwner}
            tag="from git remote"
            note={<RepoFacts repo={guess.repo} lead="Detected in the open workspace" />}
            action={
              <ButtonView size="sm" variant="primary" accentColor={ACCENT}
                          onClick={() => onPick(guess.repo!.nameWithOwner)}>
                Use this
              </ButtonView>
            }
          />
        ) : (
          /* Named, not swallowed: "no remote" and "you cannot see this
             repository" are different problems with different fixes. */
          <GhNote title="No guess from this workspace">{guess.reason}</GhNote>
        )}

        {/* The search */}
        <SetupOptionView
          accentColor={ACCENT}
          title="Search your repositories"
          note={<>Anything <code>gh repo list</code> can see, including private and organisation
            repos.</>}
          action={exact ? (
            <ButtonView size="sm" variant="primary" accentColor={ACCENT}
                        onClick={() => onPick(typed.trim())}>
              Use this
            </ButtonView>
          ) : undefined}
        >
          <SearchFieldView
            value={typed}
            onChange={v => { onTyped(v); if (v.trim().length >= 2) onSearch(); }}
            onClear={() => onTyped('')}
            /* Enter takes an exact owner/name straight through — typing a
               repository you already know and waiting for a search is a step
               nobody wants. */
            onSearch={v => { if (VALID.test(v.trim())) onPick(v.trim()); else if (v.trim()) onSearch(); }}
            placeholder="owner/name, or a word to search for"
            size="md"
            accentColor={ACCENT}
            width="100%"
          />
        </SetupOptionView>

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
      <div className="w-full mt-4 flex flex-col gap-1.5" style={{ maxWidth: 520 }}>
        <div className="flex items-center gap-2">
          <span className="text-[9.5px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}>
            This account
          </span>
          <span className="flex-1" />
          {onOpenAccount && (
            <ButtonView size="sm" variant="ghost" accentColor={ACCENT} onClick={onOpenAccount}>
              Scopes, hosts and commands
            </ButtonView>
          )}
        </div>
        {SCOPES.map(s => {
          const have = hasScope(account, s.name);
          return (
            <div key={s.name} className="flex items-center gap-2 text-[11px]">
              {have
                ? <CheckIcon size={11} style={{ color: 'var(--color-success)' }} />
                : <WarningTriangleIcon size={11}
                    style={{ color: s.required ? 'var(--color-error)' : 'var(--color-warning)' }} />}
              <code style={{ color: have ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                {s.name}
              </code>
              <span style={{ color: 'var(--color-text-muted)' }}>{s.buys}</span>
            </div>
          );
        })}

        {missingProject && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            <GhCommand text="gh auth refresh --scopes read:project" />
            <div className="text-[10px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
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
    <div className="rounded-xl border p-3 flex flex-col gap-2"
         style={{
           borderColor: `color-mix(in srgb, ${ACCENT} 50%, transparent)`,
           backgroundColor: `color-mix(in srgb, ${ACCENT} 7%, transparent)`,
         }}>
      <div className="flex items-center gap-2 animate-pulse">
        <SkeletonView variant="block" width={132} height={12} />
        <SkeletonView variant="block" width={78} height={12} />
        <span className="flex-1" />
        <SkeletonView variant="block" width={62} height={20} />
      </div>
      <div className="animate-pulse">
        <SkeletonView variant="block" width="72%" height={9} />
      </div>
    </div>
  );
}

/**
 * The two numbers worth knowing before you commit to a repository.
 *
 * Templates rather than "has templates", because three forms and one form are
 * different amounts of structure for the board to group by, and zero is the
 * case that explains an empty Module column before anybody has to ask.
 */
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
    <div className="mt-1">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[9.5px] font-bold uppercase tracking-[.09em]"
              style={{ color: 'var(--color-text-muted)' }}>
          {title}
        </span>
        <span className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{aside}</span>
      </div>
      <div className="flex flex-col rounded-lg border overflow-hidden"
           style={{ borderColor: 'var(--color-surface-border)' }}>
        {repos.map((r, i) => (
          <RepoRow key={r.nameWithOwner} repo={r} first={i === 0}
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
function RepoRow({ repo, first, pinned, onPick, onPin }: {
  repo: RepoSummary;
  first: boolean;
  pinned: boolean;
  onPick: (repo: string) => void;
  onPin: (repo: string) => void;
}) {
  const t = repo.templates ?? 0;
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5"
      style={{
        borderTop: first ? 'none'
          : '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)',
      }}
    >
      <button
        type="button"
        onClick={() => onPick(repo.nameWithOwner)}
        className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
        style={{ background: 'transparent', border: 'none', padding: 0 }}
      >
        {repo.isPrivate
          ? <LockIcon size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          : <RepoIcon size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />}
        <span className="text-[11px] font-mono truncate"
              style={{ color: 'var(--color-text-primary)' }}>
          {repo.nameWithOwner}
        </span>
        {repo.isArchived && (
          <BadgeChipView tone="var(--color-text-muted)" size="xs">archived</BadgeChipView>
        )}
        {t > 0
          ? <BadgeChipView tone={ACCENT} size="xs">{formsLabel(t)}</BadgeChipView>
          : <BadgeChipView tone="var(--color-text-muted)" size="xs">no forms</BadgeChipView>}
        <span className="flex-1" />
        <span className="text-[10px] font-mono whitespace-nowrap"
              style={{ color: 'var(--color-text-muted)' }}>
          {repo.openIssues} open
          {repo.countedAt ? ` · ${since(repo.countedAt)}` : ''}
        </span>
      </button>
      <IconButtonView
        icon={pinned ? <UnpinIcon size={11} /> : <PinIcon size={11} />}
        tooltip={pinned
          ? 'Unpin — it stays in this workspace’s recents'
          : 'Pin, so it is one click away from every workspace'}
        accentColor={pinned ? ACCENT : 'var(--color-text-muted)'}
        onClick={() => onPin(repo.nameWithOwner)}
      />
    </div>
  );
}
