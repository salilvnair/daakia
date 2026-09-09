/**
 * Screen 03 — signed in, and no repository chosen yet.
 *
 * Three ways in, ordered by how likely each is to be right. The git remote
 * guess is first because the repository you are testing is usually the
 * repository you have open, and it arrives with the two facts worth knowing
 * before you commit to it: how many issues are waiting, and whether it has
 * templates for the composer to read.
 *
 * The scope readout at the bottom is here rather than buried in Settings for
 * one reason: this is the last screen before the board, and "why is my roadmap
 * empty" is answered by a line on it. Saying so now costs a glance; discovering
 * it on screen 07 costs an afternoon.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ButtonView, SearchFieldView, SetupOptionView, BadgeChipView, TogglePillView,
  SkeletonView,
} from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { RepoIcon, CheckIcon, WarningTriangleIcon, LockIcon } from '../../icons';
import { GhEmpty, GhLede, GhNote, GhCommand } from './GhShell';
import { ACCENT, activeAccount, hasScope, type GhEnv } from './types';

/** `owner/name`, and nothing that would make gh reinterpret it as a URL or path. */
const VALID = /^[^/\s]+\/[^/\s]+$/;

/** What each scope buys, in the order they matter. */
const SCOPES = [
  { name: 'repo',         buys: 'Reading issues, and creating them',    required: true },
  { name: 'read:project', buys: 'Status, Priority, Start date and ETA', required: false },
];

interface RepoSummary {
  nameWithOwner: string;
  description?: string;
  isPrivate: boolean;
  isArchived: boolean;
  isFork: boolean;
  parent?: string;
  openIssues: number;
  pushedAt?: string;
  templates?: number;
}

export function GhPickRepository({ env, onPick, onOpenAccount }: {
  env: GhEnv;
  onPick: (repo: string) => void;
  /** Screens 02A/B/D/E — reached from the scope readout at the bottom. */
  onOpenAccount?: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [guess, setGuess] = useState<{ repo?: RepoSummary; reason?: string } | null>(null);
  const [recent, setRecent] = useState<RepoSummary[]>([]);
  const [results, setResults] = useState<RepoSummary[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [archived, setArchived] = useState(false);

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
      if (msg.type === 'dkgh:repoOptions:result') {
        setGuess(msg.guess as { repo?: RepoSummary; reason?: string });
        setRecent((msg.recent as RepoSummary[]) ?? []);
        return;
      }
      if (msg.type === 'dkgh:searchRepos:loading') { setSearching(true); return; }
      if (msg.type === 'dkgh:searchRepos:result') {
        setSearching(false);
        setResults((msg.repos as RepoSummary[]) ?? []);
        setSearchError((msg.error as string) ?? '');
      }
    };
    window.addEventListener('message', handler);
    postMsg({ type: 'dkgh:repoOptions' });
    return () => window.removeEventListener('message', handler);
  }, []);

  /*
    Search on a pause, not on a keystroke.

    Each search is a repo listing plus a pair of counts per row, so firing one
    per character would spend a hundred API calls to answer a word somebody has
    not finished typing.
  */
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const q = typed.trim();
    if (timer.current) window.clearTimeout(timer.current);
    if (q.length < 2) { setResults(null); setSearchError(''); return; }
    timer.current = window.setTimeout(
      () => postMsg({ type: 'dkgh:searchRepos', query: q, includeArchived: archived }),
      400,
    );
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [typed, archived]);

  const shown = useMemo(() => results ?? [], [results]);

  return (
    <GhEmpty icon={<RepoIcon size={30} />} title="Which repository?">
      <GhLede>
        Signed in as <span style={{ color: 'var(--color-text-primary)' }}>{account?.login}</span>
        {' '}on {account?.host}. Pick the repository whose issues you want to read and write.
      </GhLede>

      <div className="w-full flex flex-col gap-2" style={{ maxWidth: 520 }}>

        {/* The guess */}
        {guessing ? (
          <GuessSkeleton />
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
            onChange={setTyped}
            onClear={() => setTyped('')}
            /* Enter takes an exact owner/name straight through — typing a
               repository you already know and waiting for a search is a step
               nobody wants. */
            onSearch={v => { if (VALID.test(v.trim())) onPick(v.trim()); }}
            placeholder="owner/name"
            size="md"
            accentColor={ACCENT}
            width="100%"
          />

          {typed.trim().length >= 2 && (
            <div className="flex items-center gap-[7px] flex-wrap">
              <TogglePillView accentColor={ACCENT} active={!archived}
                              onClick={() => setArchived(false)}>
                Active only
              </TogglePillView>
              <TogglePillView accentColor={ACCENT} active={archived}
                              onClick={() => setArchived(true)}>
                Include archived
              </TogglePillView>
              {searching && (
                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  searching…
                </span>
              )}
            </div>
          )}

          {searchError && !searching && (
            <div className="text-[10px]" style={{ color: 'var(--color-error)' }}>{searchError}</div>
          )}

          {results !== null && !searching && shown.length === 0 && !searchError && (
            <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              Nothing this account can see matches &ldquo;{typed.trim()}&rdquo;.
              {exact && ' Press Enter to use it anyway — it may be somewhere gh can reach but not list.'}
            </div>
          )}

          {shown.length > 0 && (
            <div className="flex flex-col rounded-lg border overflow-hidden"
                 style={{ borderColor: 'var(--color-surface-border)' }}>
              {shown.map(r => <RepoRow key={r.nameWithOwner} repo={r} term={typed.trim()} onPick={onPick} />)}
            </div>
          )}
        </SetupOptionView>

        {/* Where you have been */}
        {recent.length > 0 && (
          <div className="mt-2">
            <div className="text-[9.5px] font-bold uppercase tracking-[.09em] mb-1.5"
                 style={{ color: 'var(--color-text-muted)' }}>
              Recent
            </div>
            <div className="flex flex-col rounded-lg border overflow-hidden"
                 style={{ borderColor: 'var(--color-surface-border)' }}>
              {recent.map(r => <RepoRow key={r.nameWithOwner} repo={r} onPick={onPick} />)}
            </div>
          </div>
        )}

        <GhNote title="Remembered per workspace">
          Which product you are testing is exactly what a workspace already distinguishes, so
          switching workspace switches repository with it — rather than leaving you filing a bug
          against the last project you looked at.
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

/** One repository in a list — search results, or the recents. */
function RepoRow({ repo, term, onPick }: {
  repo: RepoSummary;
  term?: string;
  onPick: (repo: string) => void;
}) {
  const t = repo.templates ?? 0;
  return (
    <button
      type="button"
      onClick={() => onPick(repo.nameWithOwner)}
      className="flex items-center gap-2 px-2.5 py-1.5 text-left cursor-pointer"
      style={{
        background: 'transparent',
        border: 'none',
        borderTop: '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)',
      }}
    >
      {repo.isPrivate
        ? <LockIcon size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        : <RepoIcon size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />}
      <span className="text-[11px] font-mono truncate" style={{ color: 'var(--color-text-primary)' }}>
        <Match text={repo.nameWithOwner} term={term} />
      </span>
      {repo.isArchived && <BadgeChipView tone="var(--color-text-muted)" size="xs">archived</BadgeChipView>}
      {t > 0 && <BadgeChipView tone={ACCENT} size="xs">{t} form{t === 1 ? '' : 's'}</BadgeChipView>}
      <span className="flex-1" />
      <span className="text-[10px] font-mono whitespace-nowrap"
            style={{ color: 'var(--color-text-muted)' }}>
        {repo.openIssues} open
      </span>
    </button>
  );
}

/** The searched-for part, lit — so a long list says why each row is in it. */
function Match({ text, term }: { text: string; term?: string }) {
  const t = (term ?? '').replace(/^.*\//, '').trim();
  if (!t) return <>{text}</>;
  const at = text.toLowerCase().indexOf(t.toLowerCase());
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span style={{
        background: `color-mix(in srgb, ${ACCENT} 26%, transparent)`,
        borderRadius: 2,
        padding: '0 1px',
      }}>
        {text.slice(at, at + t.length)}
      </span>
      {text.slice(at + t.length)}
    </>
  );
}
