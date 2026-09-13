/**
 * Screen 14D — what this issue is attached to.
 *
 * Sub-issues, blocked-by, and every place somebody referenced this issue are
 * one question — *what else is involved* — and GitHub answers it in three
 * different corners of its UI. Here they are one panel, in the order the mock
 * puts them: blockers first, because a blocker is the reason nothing has
 * happened; then the sub-issues with their progress; then the references.
 *
 * **Blocked-by carries the blocker's own state.** The sentence that explains
 * why this issue has not moved — "its ETA passed four days ago" — is a fact
 * about a *different* issue, which is exactly why nobody ever finds it. The
 * ETA comes from the Project the board already read, joined here rather than
 * fetched again, so the two can never disagree about the same date.
 *
 * **A suggestion is drawn differently from a fact.** A link somebody made and a
 * link a model proposed are not the same claim. The chip and the dimmed row
 * keep them apart: accepting a suggestion writes a real reference, and until
 * then it is an opinion. Nothing in this file invents a relationship — every
 * row here came back from GitHub — so the suggestion slot stays empty until
 * something that actually proposes one fills it.
 */
import { useEffect, useState } from 'react';
import { postMsg } from '../../vscode';
import { Ico } from './GhIcons';
import { GhAvatar } from './GhAvatar';
import { avClass, chipOf } from './GhCards';
import { sinceIso as since } from './format';
import type { BoardIssue } from './board-types';
import type { ProjectField } from './project-store';

export interface Related {
  number: number;
  title: string;
  state: string;
  assignee?: string;
}

export interface Mention {
  number: number;
  title: string;
  state: string;
  actor?: string;
  at?: string;
  pr?: boolean;
}

export interface Relations {
  repo: string;
  number: number;
  blockedBy: Related[];
  blocking: Related[];
  subIssues: Related[];
  done: number;
  total: number;
  parent?: Related;
  mentions: Mention[];
  absent?: string;
  error?: string;
}

/** Nothing to draw at all — an issue attached to nothing gets no panel. */
export function isEmpty(r: Relations | null): boolean {
  if (!r) return true;
  return !r.absent && !r.error && !r.parent
    && r.blockedBy.length === 0 && r.blocking.length === 0
    && r.subIssues.length === 0 && r.mentions.length === 0;
}

/**
 * How late a blocker is, in whole days, or nothing if it is not late.
 *
 * A closed blocker is never late — it is finished, and the dependency is
 * stale rather than overdue.
 */
export function overdueDays(eta: string | undefined, state: string, now = new Date()): number {
  if (!eta || state === 'CLOSED') return 0;
  const due = new Date(`${eta}T00:00:00Z`).getTime();
  if (!Number.isFinite(due)) return 0;
  const days = Math.floor((now.getTime() - due) / 86_400_000);
  return days > 0 ? days : 0;
}

export function useRelations(repo: string, number: number, reload: number): Relations | null {
  const [rel, setRel] = useState<Relations | null>(null);

  useEffect(() => {
    if (!repo || !Number.isFinite(number)) return;
    setRel(null);
    const onMsg = (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown>;
      if (msg?.type !== 'dkgh:relations:result') return;
      if (Number(msg.number) !== number) return;
      setRel({
        repo, number,
        blockedBy: (msg.blockedBy as Related[]) ?? [],
        blocking: (msg.blocking as Related[]) ?? [],
        subIssues: (msg.subIssues as Related[]) ?? [],
        done: Number(msg.done) || 0,
        total: Number(msg.total) || 0,
        parent: msg.parent as Related | undefined,
        mentions: (msg.mentions as Mention[]) ?? [],
        absent: msg.absent as string | undefined,
        error: msg.error as string | undefined,
      });
    };
    window.addEventListener('message', onMsg);
    postMsg({ type: 'dkgh:relations', repo, number });
    return () => window.removeEventListener('message', onMsg);
  }, [repo, number, reload]);

  return rel;
}

/** A blocker's own ETA, read the way the roadmap reads it. */
export function etaOf(issue: BoardIssue | undefined, end: ProjectField | undefined) {
  if (!issue || !end) return undefined;
  return issue.dimensions[end.name.toLowerCase()];
}

/** The heading over each group — the mock's uppercase rule, recoloured for blockers. */
function Head({ children, colour }: { children: React.ReactNode; colour?: string }) {
  return (
    <div className="fh" style={{ color: colour, marginBottom: 7 }}>{children}</div>
  );
}

/**
 * A blocker, as a card rather than a row.
 *
 * It gets the weight of a card because it is the one relationship that is
 * actionable: the reader's next move is to go and look at it.
 */
function Blocker({ issue, on, eta, onOpen }: {
  issue: Related;
  on?: BoardIssue;
  eta?: string;
  onOpen: (n: number) => void;
}) {
  const late = overdueDays(eta, issue.state);
  return (
    <button
      type="button"
      className="card"
      onClick={() => onOpen(issue.number)}
      style={{
        background: 'var(--dk-panel)',
        borderColor: 'color-mix(in srgb, var(--dk-red) 40%, transparent)',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9.6 }}>
        <span className="num">#{issue.number}</span>
        {on && (
          <span className="chips">
            {Object.entries(on.dimensions).map(([k, v]) => {
              const c = chipOf(v);
              return <span key={k} className={c.className} style={c.style}>{v}</span>;
            })}
          </span>
        )}
        <span className="sp" style={{ flex: 1 }} />
        <span className={`st ${issue.state === 'CLOSED' ? 'st-done' : 'st-block'}`}>
          <b />{issue.state === 'CLOSED' ? 'Closed' : 'Blocked'}
        </span>
      </div>
      <div className="title">{issue.title}</div>
      {late > 0 && (
        <div className="foot" style={{ color: 'var(--dk-red)' }}>
          <Ico name="warn" style={{ width: 12, height: 12 }} />
          its ETA passed {late} {late === 1 ? 'day' : 'days'} ago &mdash; this one cannot start
        </div>
      )}
    </button>
  );
}

/** One sub-issue. Closed ones are struck through, the way the mock draws them. */
function SubRow({ issue, onOpen }: { issue: Related; onOpen: (n: number) => void }) {
  const closed = issue.state === 'CLOSED';
  return (
    <button type="button" className="vrow" onClick={() => onOpen(issue.number)}
            style={{ width: '100%' }}>
      <Ico name={closed ? 'closed' : 'issue'}
           style={{ color: closed ? 'var(--dk-green)' : 'var(--dk-gh)' }} />
      <span style={closed ? { textDecoration: 'line-through', opacity: .6 } : undefined}>
        {issue.title}
      </span>
      <span className="cx">#{issue.number}</span>
      <span className="sp" />
      {issue.assignee && (
        <GhAvatar who={issue.assignee} className={avClass(issue.assignee)} />
      )}
    </button>
  );
}

export function GhRelations({ rel, issues, end, onOpen }: {
  rel: Relations | null;
  /** The board, so a blocker can carry its own chips and ETA. */
  issues: BoardIssue[];
  /** The Project's target-date field, which is where a blocker's ETA lives. */
  end?: ProjectField;
  onOpen: (n: number) => void;
}) {
  if (!rel) return null;

  const said = rel.error ?? (rel.absent === 'scope'
    ? 'The credential cannot read this repository, so what this issue is attached to is unknown.'
    : rel.absent);

  if (said) {
    return (
      <div className="note" style={{ maxWidth: 'none', margin: 0 }}>
        <Ico name="warn" />
        <div><b>What this issue is attached to could not be read.</b> {said}</div>
      </div>
    );
  }

  if (isEmpty(rel)) return null;

  const on = (n: number) => issues.find(i => i.number === n);
  const pct = rel.total > 0 ? Math.round((rel.done / rel.total) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13.2 }}>
      {rel.blockedBy.length > 0 && (
        <div>
          <Head colour="var(--dk-red)">Blocked by &middot; {rel.blockedBy.length}</Head>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7.2 }}>
            {rel.blockedBy.map(b => (
              <Blocker key={b.number} issue={b} on={on(b.number)}
                       eta={etaOf(on(b.number), end)} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}

      {rel.blocking.length > 0 && (
        <div>
          <Head>Blocking &middot; {rel.blocking.length}</Head>
          <div style={{ border: '1px solid var(--dk-border)', borderRadius: 10.8,
                        overflow: 'hidden' }}>
            {rel.blocking.map(b => <SubRow key={b.number} issue={b} onOpen={onOpen} />)}
          </div>
        </div>
      )}

      {rel.parent && (
        <div>
          <Head>Sub-issue of</Head>
          <div style={{ border: '1px solid var(--dk-border)', borderRadius: 10.8,
                        overflow: 'hidden' }}>
            <SubRow issue={rel.parent} onOpen={onOpen} />
          </div>
        </div>
      )}

      {rel.subIssues.length > 0 && (
        <div>
          <Head>Sub-issues &middot; {rel.done} of {rel.total} done</Head>
          <div style={{ border: '1px solid var(--dk-border)', borderRadius: 10.8,
                        overflow: 'hidden' }}>
            {rel.subIssues.map(s => <SubRow key={s.number} issue={s} onOpen={onOpen} />)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9.6, marginTop: 7.2 }}>
            <span style={{ flex: 1, height: 4.8, borderRadius: 2.4,
                           background: 'var(--dk-raised)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${pct}%`,
                             background: 'var(--dk-green)' }} />
            </span>
            <span style={{ fontSize: 11.4, color: 'var(--dk-muted)',
                           fontFamily: 'var(--mono)' }}>
              {rel.done} / {rel.total}
            </span>
          </div>
        </div>
      )}

      {rel.mentions.length > 0 && (
        <div>
          <Head>Mentioned in &middot; {rel.mentions.length}</Head>
          <div style={{ border: '1px solid var(--dk-border)', borderRadius: 10.8,
                        overflow: 'hidden' }}>
            {rel.mentions.map(m => (
              <button key={m.number} type="button" className="vrow"
                      onClick={() => onOpen(m.number)} style={{ width: '100%' }}>
                <Ico name={m.pr ? 'code' : 'cmt'} />
                {m.actor ? `${m.actor} linked this from ` : 'linked from '}
                <span className="ghref">#{m.number}</span>
                <span className="sp" />
                {m.at && (
                  <span style={{ fontSize: 11.4, color: 'var(--dk-faint)' }}>{since(m.at)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
