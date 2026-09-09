/**
 * Screen 03A — finding the repository when the guess is wrong.
 *
 * The workspace's git remote is right most of the time. When it is not —
 * testing a service whose repository you do not have checked out — the search
 * has to cover every org you belong to, including private repositories, which
 * is why it is `gh repo list` and not `gh search repos` alone: search only sees
 * public ones.
 *
 * Two columns decide it: **open issues** and **templates**. They are the only
 * facts that change what dkgh can do — a repository with three forms gets
 * Module, Environment and Type, one with none gets the GitHub dimensions. Both
 * are in the picker so the answer to "why is my board so bare" was visible
 * before anybody chose.
 *
 * Archived repositories are listed and marked read-only. Hiding them would be
 * wrong, because reading an archived repository's issues is a legitimate thing
 * to do — but so would letting somebody spend ten minutes composing an issue
 * they cannot file.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ButtonView, BadgeChipView, TogglePillView, SearchFieldView, TableSkeletonView,
  EmptyStateView,
} from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import {
  RepoIcon, LockIcon, SearchIcon, ChevronLeftIcon, CheckCircleIcon,
} from '../../icons';
import { sinceIso } from './format';
import { ACCENT, activeAccount, type GhEnv, type RepoSummary } from './types';

/** `owner/name`, and nothing that would make gh reinterpret it as a URL or path. */
const VALID = /^[^/\s]+\/[^/\s]+$/;

/** Below this the search is not run: one letter matches everything. */
const MIN_QUERY = 2;

export function GhRepoSearch({ env, query, onQueryChange, onPick, onBack }: {
  env: GhEnv;
  /** Held by the caller, so leaving and returning does not lose the term. */
  query: string;
  onQueryChange: (q: string) => void;
  onPick: (repo: string) => void;
  onBack: () => void;
}) {
  const [results, setResults] = useState<RepoSummary[] | null>(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [commands, setCommands] = useState<string[]>([]);
  const [matched, setMatched] = useState(0);
  const [archived, setArchived] = useState(false);
  /** `''` is every owner. Otherwise the one whose rows are shown. */
  const [owner, setOwner] = useState('');

  const account = activeAccount(env);
  const me = account?.login ?? '';
  const exact = VALID.test(query.trim());

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'dkgh:searchRepos:loading') { setSearching(true); return; }
      if (msg.type !== 'dkgh:searchRepos:result') return;
      setSearching(false);
      setResults((msg.repos as RepoSummary[]) ?? []);
      setError((msg.error as string) ?? '');
      setCommands((msg.commands as string[]) ?? []);
      setMatched((msg.matched as number) ?? 0);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  /*
    Search on a pause, not on a keystroke.

    Each search is a repository listing plus a pair of counts per row, so firing
    one per character would spend a hundred API calls to answer a word somebody
    has not finished typing.
  */
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const q = query.trim();
    if (timer.current) window.clearTimeout(timer.current);
    if (q.length < MIN_QUERY) { setResults(null); setError(''); return; }
    timer.current = window.setTimeout(
      () => postMsg({ type: 'dkgh:searchRepos', query: q, includeArchived: archived }),
      400,
    );
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [query, archived]);

  /*
    The org facets are the owners actually in the results, not a directory of
    every organisation the account belongs to.

    Reading the membership list is another call, and it would offer facets that
    filter to nothing — an org you belong to with no repository matching the
    term is a chip that empties the table. The owners present are exactly the
    ones that can narrow it.
  */
  const owners = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of results ?? []) {
      const o = r.nameWithOwner.split('/')[0];
      seen.set(o, (seen.get(o) ?? 0) + 1);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [results]);

  const shown = useMemo(
    () => (results ?? []).filter(r => !owner || r.nameWithOwner.startsWith(`${owner}/`)),
    [results, owner],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">

      {/* Where you are, and the way back */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-1 flex-shrink-0">
        <ButtonView size="sm" variant="ghost" accentColor="var(--color-text-muted)"
                    iconLeft={<ChevronLeftIcon size={12} />} onClick={onBack}>
          Back
        </ButtonView>
        <span className="text-[12px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
          Search your repositories
        </span>
        <span className="flex-1" />
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          searching as {me || 'this account'}
        </span>
      </div>

      {/* The term, and what narrows it */}
      <div className="flex items-center gap-[7px] px-4 py-2 flex-wrap flex-shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <div className="flex-1" style={{ minWidth: 200 }}>
          <SearchFieldView
            value={query}
            onChange={onQueryChange}
            onClear={() => onQueryChange('')}
            /* Enter takes an exact owner/name straight through — typing a
               repository you already know and waiting for a search is a step
               nobody wants. */
            onSearch={v => { if (VALID.test(v.trim())) onPick(v.trim()); }}
            placeholder="Name, or owner/name"
            size="sm"
            accentColor={ACCENT}
            width="100%"
            autoFocus
            trailing={searching
              ? <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>…</span>
              : undefined}
          />
        </div>
        <TogglePillView accentColor={ACCENT} active={!owner} onClick={() => setOwner('')}>
          All orgs
        </TogglePillView>
        {owners.map(([o, n]) => (
          <TogglePillView key={o} accentColor={ACCENT} active={owner === o} count={n}
                          onClick={() => setOwner(owner === o ? '' : o)}>
            {o === me ? 'Mine' : o}
          </TogglePillView>
        ))}
        <TogglePillView accentColor={ACCENT} active={archived}
                        title="Archived repositories can be read, never written to"
                        onClick={() => setArchived(a => !a)}>
          Include archived
        </TogglePillView>
      </div>

      {/* The results */}
      <div className="flex-1 overflow-y-auto min-w-0 px-4 py-3">
        {query.trim().length < MIN_QUERY ? (
          <EmptyStateView
            variant="medallion"
            accentColor={ACCENT}
            icon={<SearchIcon size={22} />}
            title="Type at least two letters"
            message={'Every repository this account can reach is searched, including private '
              + 'ones and every organisation you belong to. An exact owner/name goes straight '
              + 'through on Enter.'}
            compact
          />
        ) : searching && !results ? (
          <TableSkeletonView
            rows={4}
            leadingIcon
            columns={[
              { width: 'flex', fill: 0.7 }, { width: 70, align: 'right' },
              { width: 80 }, { width: 70, align: 'right' }, { width: 56 },
            ]}
          />
        ) : error ? (
          <EmptyStateView
            variant="medallion"
            accentColor="var(--color-error)"
            icon={<SearchIcon size={22} />}
            title="gh could not run the search"
            message={error}
            compact
          />
        ) : shown.length === 0 ? (
          <EmptyStateView
            variant="medallion"
            accentColor={ACCENT}
            icon={<SearchIcon size={22} />}
            title="Nothing this account can see matches"
            message={owner
              ? `No repository under ${owner} matches "${query.trim()}". Clear the org filter to see the rest.`
              : `Nothing named like "${query.trim()}" is visible to ${me || 'this account'}.`
                + (archived ? '' : ' Archived repositories are excluded — include them to widen it.')}
            action={exact
              ? { label: `Use ${query.trim()} anyway`, onClick: () => onPick(query.trim()) }
              : owner
                ? { label: 'All orgs', onClick: () => setOwner('') }
                : undefined}
            compact
          />
        ) : (
          <ResultTable rows={shown} term={query.trim()} onPick={onPick} />
        )}
      </div>

      {/* What actually ran */}
      <div className="flex items-center gap-2 px-4 py-2 text-[10px] flex-shrink-0 min-w-0"
           style={{
             borderTop: '1px solid var(--color-surface-border)',
             color: 'var(--color-text-muted)',
           }}>
        <code className="truncate" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
          {commands[0] ?? 'gh repo list'}
          {commands.length > 1 ? `  ·  and ${commands.length - 1} more` : ''}
        </code>
        <span className="flex-1" />
        {results !== null && (
          <span className="whitespace-nowrap">
            {shown.length}{shown.length !== matched ? ` of ${matched}` : ''} shown
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The rows.
 *
 * A grid rather than the shared table, because the two numbers that decide the
 * choice — open issues and templates — need to sit in fixed columns the eye can
 * run down, and the last column is a control rather than a value.
 */
function ResultTable({ rows, term, onPick }: {
  rows: RepoSummary[];
  term: string;
  onPick: (repo: string) => void;
}) {
  const cols = '1fr 74px 88px 78px 62px';
  return (
    <div className="rounded-lg border overflow-hidden"
         style={{ borderColor: 'var(--color-surface-border)' }}>
      <div className="grid items-center px-3 py-1.5 text-[9.5px] font-bold uppercase tracking-[.06em]"
           style={{
             gridTemplateColumns: cols,
             gap: 10,
             color: 'var(--color-text-muted)',
             background: 'var(--color-panel)',
             borderBottom: '1px solid var(--color-surface-border)',
           }}>
        <span>Repository</span>
        <span className="text-right">Open issues</span>
        <span>Templates</span>
        <span className="text-right">Last pushed</span>
        <span />
      </div>
      {rows.map((r, i) => (
        <div key={r.nameWithOwner}
             className="grid items-center px-3 py-1.5"
             style={{
               gridTemplateColumns: cols,
               gap: 10,
               borderTop: i === 0 ? 'none'
                 : '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)',
             }}>
          <span className="flex items-center gap-1.5 min-w-0">
            {r.isPrivate
              ? <LockIcon size={11} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
              : <RepoIcon size={11} style={{ color: ACCENT, flexShrink: 0 }} />}
            <span className="text-[11px] font-mono truncate"
                  style={{ color: 'var(--color-text-primary)' }}>
              <Match text={r.nameWithOwner} term={term} />
            </span>
            {r.isPrivate && (
              <BadgeChipView tone="var(--color-text-muted)" size="xs">private</BadgeChipView>
            )}
            {r.isArchived && (
              <BadgeChipView tone="var(--color-text-muted)" size="xs">archived</BadgeChipView>
            )}
          </span>
          <span className="text-[11px] font-mono text-right"
                style={{ color: 'var(--color-text-secondary)' }}>
            {r.openIssues}
          </span>
          <span>
            {(r.templates ?? 0) > 0
              ? <BadgeChipView tone={ACCENT} size="xs">
                  {r.templates} form{r.templates === 1 ? '' : 's'}
                </BadgeChipView>
              : <BadgeChipView tone="var(--color-text-muted)" size="xs">none</BadgeChipView>}
          </span>
          <span className="text-[10px] font-mono text-right whitespace-nowrap"
                style={{ color: 'var(--color-text-muted)' }}>
            {sinceIso(r.pushedAt)}
          </span>
          <span className="flex justify-end">
            {r.isArchived ? (
              /*
                Read-only, and said so rather than disabled and silent.

                Reading an archived repository's issues is legitimate — the
                composer is what cannot work — so the row still opens a board.
              */
              <ButtonView size="sm" variant="ghost" accentColor="var(--color-text-muted)"
                          title="Archived — its issues can be read, but nothing can be filed"
                          onClick={() => onPick(r.nameWithOwner)}>
                Read only
              </ButtonView>
            ) : (
              <ButtonView size="sm"
                          variant={(r.templates ?? 0) > 0 ? 'primary' : 'secondary'}
                          accentColor={ACCENT}
                          iconLeft={(r.templates ?? 0) > 0 ? <CheckCircleIcon size={11} /> : undefined}
                          onClick={() => onPick(r.nameWithOwner)}>
                Use
              </ButtonView>
            )}
          </span>
        </div>
      ))}
    </div>
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
