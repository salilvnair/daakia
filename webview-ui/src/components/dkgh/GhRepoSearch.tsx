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
import { TableSkeletonView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { Ico } from './GhIcons';
import { GhActions, GhButton, GhEmpty, GhLede, GhPrimary } from './GhShell';
import { sinceIso } from './format';
import { activeAccount, type GhEnv, type RepoSummary } from './types';

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
        <button type="button" className="btn" onClick={onBack}>Back</button>
        <span style={{ fontSize: 14.4, fontWeight: 500, color: 'var(--dk-text)' }}>
          Search your repositories
        </span>
        <span className="sp" style={{ flex: 1 }} />
        <span className="sub">searching as {me || 'this account'}</span>
      </div>

      {/* The term, and what narrows it */}
      <div className="flex items-center gap-[7px] px-4 py-2 flex-wrap flex-shrink-0"
           style={{ borderBottom: '1px solid var(--dk-border)' }}>
        {/* The filter rail's own search box, which is the box this tab uses
            everywhere else somebody types to narrow a list. */}
        <div className="panelsearch flex-1" style={{ margin: 0, minWidth: 200 }}>
          <Ico name="search" />
          <input
            autoFocus
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            /* Enter takes an exact owner/name straight through — typing a
               repository you already know and waiting for a search is a step
               nobody wants. */
            onKeyDown={e => {
              if (e.key === 'Enter' && VALID.test(query.trim())) onPick(query.trim());
              if (e.key === 'Escape') onQueryChange('');
            }}
            placeholder="Name, or owner/name"
          />
          {searching && <span className="n">…</span>}
        </div>
        <button type="button" className={`pill${owner ? '' : ' on'}`} onClick={() => setOwner('')}>
          All orgs
        </button>
        {owners.map(([o, n]) => (
          <button key={o} type="button" className={`pill${owner === o ? ' on' : ''}`}
                  onClick={() => setOwner(owner === o ? '' : o)}>
            {o === me ? 'Mine' : o}<b>{n}</b>
          </button>
        ))}
        <button type="button" className={`pill${archived ? ' on' : ''}`}
                title="Archived repositories can be read, never written to"
                onClick={() => setArchived(a => !a)}>
          Include archived
        </button>
      </div>

      {/* The results */}
      <div className="flex-1 overflow-y-auto min-w-0 px-4 py-3">
        {query.trim().length < MIN_QUERY ? (
          <GhEmpty icon="search" title="Type at least two letters">
            <GhLede>
              Every repository this account can reach is searched, including private ones and
              every organisation you belong to. An exact owner/name goes straight through on
              Enter.
            </GhLede>
          </GhEmpty>
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
          <GhEmpty icon="warn" title="gh could not run the search">
            <GhLede>{error}</GhLede>
          </GhEmpty>
        ) : shown.length === 0 ? (
          <GhEmpty icon="search" title="Nothing this account can see matches">
            <GhLede>
              {owner
                ? `No repository under ${owner} matches "${query.trim()}". Clear the org filter to see the rest.`
                : `Nothing named like "${query.trim()}" is visible to ${me || 'this account'}.`
                  + (archived ? '' : ' Archived repositories are excluded — include them to widen it.')}
            </GhLede>
            {(exact || owner) && (
              <GhActions>
                {exact
                  ? <GhPrimary onClick={() => onPick(query.trim())}>
                      Use {query.trim()} anyway
                    </GhPrimary>
                  : <GhButton onClick={() => setOwner('')}>All orgs</GhButton>}
              </GhActions>
            )}
          </GhEmpty>
        ) : (
          <ResultTable rows={shown} term={query.trim()} onPick={onPick} />
        )}
      </div>

      {/* What actually ran */}
      <div className="flex items-center gap-2 px-4 py-2 sub flex-shrink-0 min-w-0"
           style={{ borderTop: '1px solid var(--dk-border)' }}>
        <code className="truncate">
          {commands[0] ?? 'gh repo list'}
          {commands.length > 1 ? `  ·  and ${commands.length - 1} more` : ''}
        </code>
        <span className="sp" style={{ flex: 1 }} />
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
  const cols = '1fr 88px 92px 82px 62px';
  return (
    <div className="rounded-lg border overflow-hidden"
         style={{ borderColor: 'var(--dk-border)' }}>
      <div className="grid items-center px-3 py-1.5 fl"
           style={{
             gridTemplateColumns: cols,
             gap: 10,
             background: 'var(--dk-panel)',
             borderBottom: '1px solid var(--dk-border)',
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
                 : '1px solid color-mix(in srgb, var(--dk-border) 60%, transparent)',
             }}>
          <span className="flex items-center gap-1.5 min-w-0">
            <Ico name={r.isPrivate ? 'lock' : 'repo'}
                 style={{ color: r.isPrivate ? 'var(--dk-faint)' : 'var(--dk-gh)',
                          flexShrink: 0 }} />
            <span className="truncate"
                  style={{ fontFamily: 'var(--mono)', fontSize: 12.6, color: 'var(--dk-text)' }}>
              <Match text={r.nameWithOwner} term={term} />
            </span>
            {r.isPrivate && <span className="chip">private</span>}
            {r.isArchived && <span className="chip c-stale">archived</span>}
          </span>
          <span className="text-right"
                style={{ fontFamily: 'var(--mono)', fontSize: 12.6, color: 'var(--dk-muted)' }}>
            {r.openIssues}
          </span>
          <span>
            {(r.templates ?? 0) > 0
              ? <span className="chip c-gh">
                  {r.templates} form{r.templates === 1 ? '' : 's'}
                </span>
              : <span className="chip">none</span>}
          </span>
          <span className="text-right whitespace-nowrap"
                style={{ fontFamily: 'var(--mono)', fontSize: 11.4, color: 'var(--dk-faint)' }}>
            {sinceIso(r.pushedAt)}
          </span>
          <span className="flex justify-end">
            {r.isArchived ? (
              /*
                Read-only, and said so rather than disabled and silent.

                Reading an archived repository's issues is legitimate — the
                composer is what cannot work — so the row still opens a board.
              */
              <button type="button" className="btn" style={{ padding: '2px 8px' }}
                      title="Archived — its issues can be read, but nothing can be filed"
                      onClick={() => onPick(r.nameWithOwner)}>
                Read only
              </button>
            ) : (
              <button
                type="button"
                className={(r.templates ?? 0) > 0 ? 'btn go' : 'btn'}
                style={{ padding: '2px 10px' }}
                onClick={() => onPick(r.nameWithOwner)}
              >
                Use
              </button>
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
        background: 'color-mix(in srgb, var(--dk-gh) 26%, transparent)',
        borderRadius: 2,
        padding: '0 1px',
      }}>
        {text.slice(at, at + t.length)}
      </span>
      {text.slice(at + t.length)}
    </>
  );
}
