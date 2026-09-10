/**
 * Screen 14 — one issue, in full.
 *
 * Everything github.com shows on an issue page minus the parts a tester never
 * uses, plus the evidence gallery as a first-class row rather than three inline
 * images you scroll past.
 *
 * **One column, in time order.** GitHub splits an issue between a sidebar of
 * current values and a timeline you scroll to find out how they got that way.
 * Both are here, but the left column is a single chronology — body, evidence,
 * what happened, comments — because that is the order somebody reads it in when
 * they are trying to work out what is going on.
 *
 * **The board's row is the header.** Title, labels, state, the dimensions: the
 * board already read all of it, so opening an issue does not re-read what is
 * already on screen. Two calls are made, and both are for things the board
 * deliberately does not hold — the body with its comments, and the timeline.
 *
 * **A timeline event this app cannot word is counted, not rendered.** See
 * `services/gh/timeline.ts`: GitHub adds event types, and an unrecognised one
 * printed as its own JSON is worse than absent. The count is shown so the list
 * never quietly claims to be complete.
 */
import { useEffect, useMemo, useState } from 'react';
import { SplitPanelView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { openExternal } from './open-external';
import { Ico, type IcoName } from './GhIcons';
import { avClass, chipOf, prClass } from './GhCards';
import { GhEvidence } from './GhEvidence';
import { GhProse } from './GhProse';
import { sinceIso as since } from './format';
import { GhEditConfirm } from './GhEditConfirm';
import { GhCloseIssue } from './GhCloseIssue';
import { GhMarkdown } from './GhMarkdown';
import { useEditFlow } from './edit-flow';
import type { BoardIssue, ProposedDimension } from './board-types';

interface Detail {
  number: number;
  body: string;
  evidence: string[];
  comments: { author?: string; body: string; createdAt?: string }[];
  error?: string;
}

type TimelineKind =
  | 'label' | 'assign' | 'milestone' | 'project' | 'date' | 'state'
  | 'rename' | 'reference' | 'comment';

interface TimelineEvent {
  kind: TimelineKind;
  actor?: string;
  at?: string;
  text: string;
  value?: string;
  colour?: string;
}

interface Timeline {
  number: number;
  events: TimelineEvent[];
  skipped: number;
  error?: string;
}

/** The glyph each kind of event gets, so a timeline is scannable. */
const EVENT_ICON: Record<TimelineKind, IcoName> = {
  label: 'tag',
  assign: 'person',
  milestone: 'milestone',
  project: 'board',
  date: 'cal',
  state: 'closed',
  rename: 'pen',
  reference: 'link',
  comment: 'cmt',
};

/** The status word, in the mock's own five colours. */
const STATE_CLASS: Record<string, string> = {
  'in progress': 'st-prog',
  'in review': 'st-review',
  done: 'st-done',
  blocked: 'st-block',
};

export function GhIssue({ repo, issue, dimensions, closed, onBack, onWrote }: {
  repo: string;
  issue: BoardIssue;
  dimensions: ProposedDimension[];
  /** The closed issues the board holds — 14E reads its reasons off them. */
  closed: BoardIssue[];
  onBack: () => void;
  /** After a write lands, so the board and this page re-read. */
  onWrote: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  /** 14A — the label churn, dropped without being lost. */
  const [muted, setMuted] = useState<Set<TimelineKind>>(new Set());
  /** 14B — what is in the box, until it is proposed. */
  const [draft, setDraft] = useState('');
  /** 14E — open while the close is being explained. */
  const [closing, setClosing] = useState(false);
  /** How many times a write has landed, to re-read this page's own two calls. */
  const [wrote, setWrote] = useState(0);

  /*
    This page's own write flow.

    The board's lives on the board, and the board is not rendered while screen
    14 is — so a comment written here would have had nowhere to show its
    confirm. Same hook, same host functions, same strip.
  */
  const flow = useEditFlow(repo, () => {
    setDraft('');
    setClosing(false);
    setWrote(n => n + 1);
    onWrote();
  });

  useEffect(() => {
    setDetail(null);
    setTimeline(null);
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.number !== issue.number) return;
      if (msg.type === 'dkgh:issue:result') { setDetail(msg as unknown as Detail); return; }
      if (msg.type === 'dkgh:timeline:result') setTimeline(msg as unknown as Timeline);
    };
    window.addEventListener('message', handler);
    postMsg({ type: 'dkgh:issue', repo, number: issue.number });
    postMsg({ type: 'dkgh:timeline', repo, number: issue.number });
    return () => window.removeEventListener('message', handler);
    /* `wrote` is in the list on purpose: a comment that landed is a comment
       this page should be showing, and re-reading is the only way it can. */
  }, [repo, issue.number, wrote]);

  const status = (issue.dimensions.status ?? '').toLowerCase();
  const shots = detail?.evidence ?? issue.evidence;

  /*
    The body without its images.

    They are in the gallery below, at a size worth looking at. Left inline they
    are the same pictures twice, and the second copy is the one that pushes the
    first comment off the screen.
  */
  const body = useMemo(() => stripImages(detail?.body ?? ''), [detail?.body]);

  const events = (timeline?.events ?? []).filter(e => !muted.has(e.kind));
  const kinds = useMemo(
    () => [...new Set((timeline?.events ?? []).map(e => e.kind))],
    [timeline],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">

      {/* Where you are, and the two things to do from here */}
      <div className="head">
        <button type="button" className="btn" style={{ padding: '3px 9px' }} onClick={onBack}>
          ←
        </button>
        <div className="repo">
          <Ico name="repo" />
          <span className="path" style={{ color: 'var(--dk-faint)' }}>{repo}</span>
        </div>
        {issue.state === 'CLOSED'
          ? <span className="st st-done"><b />Closed</span>
          : status
            ? <span className={`st ${STATE_CLASS[status] ?? 'st-todo'}`}><b />{cap(status)}</span>
            : <span className="st st-todo"><b />Open</span>}
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => openExternal(issue.url)}>
          <Ico name="link" />Open on github.com
        </button>
        {issue.state === 'OPEN' ? (
          <button type="button" className="btn ok" onClick={() => setClosing(true)}>
            <Ico name="closed" />Close issue
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={() => flow.propose({ repo, numbers: [issue.number], state: 'reopen' })}
          >
            <Ico name="issue" />Reopen
          </button>
        )}
      </div>

      <SplitPanelView
        className="compose"
        direction="horizontal"
        defaultSplit={72}
        minFirstPct={45}
        minSecondPct={16}
        accentColor="var(--dk-gh)"
        first={
          <div className="left" style={{ overflowY: 'auto' }}>
            <div style={{ padding: '12px 14px 0' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--dk-text)' }}>
                  {issue.title}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 15.6,
                               color: 'var(--dk-faint)' }}>
                  #{issue.number}
                </span>
              </div>
              <div className="chips" style={{ marginTop: 7 }}>
                {Object.entries(issue.dimensions)
                  .filter(([k, v]) => k !== 'status' && v)
                  .map(([k, v]) => <Dim key={k} field={k} value={v} dimensions={dimensions} />)}
                <span className="sub">
                  opened {since(issue.createdAt)}{issue.author ? ` by ${issue.author}` : ''}
                </span>
              </div>
            </div>

            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column',
                          gap: 10 }}>
              {/* The body, as its author wrote it */}
              <Comment who={issue.author} when={issue.createdAt} verb="opened this">
                {detail
                  ? (body.trim()
                    ? <GhProse content={body} gallery={false} />
                    : <span style={{ color: 'var(--dk-faint)' }}>No description.</span>)
                  : <span style={{ color: 'var(--dk-faint)' }}>Reading it…</span>}
              </Comment>

              {shots.length > 0 && (
                <div>
                  <div className="fl" style={{ marginBottom: 6 }}>
                    Evidence · {shots.length}
                  </div>
                  {/* 14C. Four across, at a height worth looking at — the whole
                      reason the gallery is a row of its own. */}
                  <div className="gallery" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                    {shots.map(url => (
                      <button
                        key={url}
                        type="button"
                        style={{ background: 'none', border: 'none', padding: 0,
                                 cursor: 'pointer' }}
                        title="Open it on github.com"
                        onClick={() => openExternal(url)}
                      >
                        <GhEvidence url={url} height={84} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 14A — what happened, and what you can stop looking at */}
              {timeline && timeline.events.length > 0 && (
                <div>
                  <div className="fl" style={{ marginBottom: 6, display: 'flex',
                                               alignItems: 'center', gap: 6 }}>
                    What happened
                    <span className="sp" style={{ flex: 1 }} />
                    {kinds.map(k => (
                      <button
                        key={k}
                        type="button"
                        className={`pill${muted.has(k) ? '' : ' on'}`}
                        style={{ padding: '1px 8px' }}
                        title={muted.has(k) ? 'Show these again' : 'Hide these'}
                        onClick={() => setMuted(prev => {
                          const next = new Set(prev);
                          if (next.has(k)) next.delete(k);
                          else next.add(k);
                          return next;
                        })}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                  <div className="tline">
                    {events.map((e, at) => (
                      <div className="tev" key={`${e.kind}-${e.at}-${at}`}>
                        <span className="dotc"><Ico name={EVENT_ICON[e.kind]} /></span>
                        <span className="txt">
                          <b>{e.actor ?? 'somebody'}</b> {e.text}
                          {e.value && (
                            <>
                              {' '}
                              {e.colour
                                ? <span className="lbldot">
                                    <b style={{ background: `#${e.colour}` }} />{e.value}
                                  </span>
                                : <b>{e.value}</b>}
                            </>
                          )}
                          {e.at && <i> · {since(e.at)}</i>}
                        </span>
                      </div>
                    ))}
                    {events.length === 0 && (
                      <div className="sub" style={{ padding: '4px 0' }}>
                        Everything here is hidden. Turn one back on above.
                      </div>
                    )}
                  </div>
                  {timeline.skipped > 0 && (
                    <div className="sub" style={{ marginTop: 6 }}>
                      {timeline.skipped} more event{timeline.skipped === 1 ? '' : 's'} GitHub sent
                      that dkgh does not know how to word — said here rather than left out
                      quietly. They are all on github.com.
                    </div>
                  )}
                </div>
              )}

              {/* The discussion */}
              {(detail?.comments ?? []).map((c, at) => (
                <Comment key={`${c.author}-${c.createdAt}-${at}`}
                         who={c.author} when={c.createdAt} verb="commented">
                  {/* A comment's screenshots are blocked by the webview's own
                      content policy, so they come through the host — see
                      GhProse. */}
                  <GhProse content={c.body} />
                </Comment>
              ))}

              {/*
                14B — writing a comment without leaving.

                It goes through the board's own confirm flow rather than
                sending on Enter: a comment is a write, everybody watching gets
                a notification, and there is no unsend. The strip below shows
                the exact call.
              */}
              <div className="cmt">
                <div className="ch">
                  <span className="av av-s">Y</span>
                  <b>You</b>
                  <span style={{ marginLeft: 'auto' }}>Markdown · #43 links</span>
                </div>
                <div className="cb" style={{ padding: 0 }}>
                  {/* The same box the composer files in. On github.com the
                      reply box is the filing box, and two different ones here
                      is how somebody learns that one of them cannot do bold. */}
                  <GhMarkdown
                    value={draft}
                    onChange={setDraft}
                    minHeight={84}
                    placeholder="Leave a comment…"
                  />
                </div>
                {draft.trim() && (
                  <div className="actions" style={{ margin: 0, padding: '0 12px 10px',
                                                    justifyContent: 'flex-start' }}>
                    <button
                      type="button"
                      className="btn go"
                      onClick={() => flow.propose({
                        repo, numbers: [issue.number], comment: draft,
                      })}
                    >
                      <Ico name="cmt" />Comment
                    </button>
                    <button type="button" className="btn" onClick={() => setDraft('')}>
                      Discard
                    </button>
                  </div>
                )}
              </div>

              {detail?.error && (
                <div className="note" style={{ margin: 0 }}>
                  <Ico name="warn" style={{ color: 'var(--dk-amber)' }} />
                  <div><b>gh could not read it.</b> {detail.error}</div>
                </div>
              )}
            </div>
          </div>
        }
        second={
          <div className="right" style={{ overflowY: 'auto' }}>
            <div className="paneh"><Ico name="tag" />Details</div>

            <Msec label="Assignees">
              {issue.assignees.length
                ? issue.assignees.map(a => (
                    <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className={avClass(a)}>{a[0].toUpperCase()}</span>{a}
                    </span>
                  ))
                : undefined}
            </Msec>

            <Msec label="Labels">
              {issue.labels.length
                ? issue.labels.map(l => (
                    <span key={l.name} className="lbldot">
                      <b style={{ background: `#${l.color}` }} />{l.name}
                    </span>
                  ))
                : undefined}
            </Msec>

            {Object.entries(issue.dimensions).filter(([, v]) => v).map(([field, value]) => (
              <Msec key={field} label={cap(field)}>
                <Dim field={field} value={value} dimensions={dimensions} />
              </Msec>
            ))}

            <Msec label="Milestone">{issue.milestone || undefined}</Msec>

            <Msec label="Age · quiet">
              {`${issue.ageDays} day${issue.ageDays === 1 ? '' : 's'} old · `
                + `${issue.quietDays} quiet`}
            </Msec>

            <Msec label="Activity">
              {issue.commentCount
                ? `${issue.commentCount} comment${issue.commentCount === 1 ? '' : 's'} · `
                  + `last ${since(issue.updatedAt)}`
                : undefined}
            </Msec>

            <div style={{ padding: '10px 12px', marginTop: 'auto', display: 'flex',
                          flexDirection: 'column', gap: 6 }}>
              <button
                type="button"
                className="btn"
                onClick={() => navigator.clipboard?.writeText(asMarkdown(issue, detail))}
              >
                <Ico name="copy" />Copy as Markdown
              </button>
              <button type="button" className="btn"
                      onClick={() => navigator.clipboard?.writeText(issue.url)}>
                <Ico name="link" />Copy link
              </button>
            </div>
          </div>
        }
      />

      {/* Every write from this page, confirmed the way the board's are. */}
      <GhEditConfirm flow={flow} />

      {closing && (
        <GhCloseIssue
          repo={repo}
          issue={issue}
          closed={closed}
          onCancel={() => setClosing(false)}
          onClose={request => { setClosing(false); flow.propose(request); }}
        />
      )}
    </div>
  );
}

/** One block of prose with its author above it. */
function Comment({ who, when, verb, children }: {
  who?: string;
  when?: string;
  verb: string;
  children: React.ReactNode;
}) {
  return (
    <div className="cmt">
      <div className="ch">
        <span className={avClass(who ?? '?')}>{(who ?? '?')[0].toUpperCase()}</span>
        <b>{who ?? 'somebody'}</b> {verb}
        {when && <span style={{ marginLeft: 'auto' }}>{since(when)}</span>}
      </div>
      <div className="cb">{children}</div>
    </div>
  );
}

/** One sidebar row. An unset value says so rather than showing an empty box. */
function Msec({ label, children }: { label: string; children?: React.ReactNode }) {
  const empty = children === undefined || children === null || children === '';
  return (
    <div className="msec">
      <div className="mh">{label}</div>
      <div className={`val${empty ? '' : ' set'}`}>
        {empty ? `No ${label.toLowerCase()}` : children}
      </div>
    </div>
  );
}

/** A dimension's value in the board's own colour for it. */
function Dim({ field, value, dimensions }: {
  field: string;
  value: string;
  dimensions: ProposedDimension[];
}) {
  const options = dimensions.find(d => d.dimension === field)?.options;
  if (field === 'priority') {
    return <span className={prClass(value, options)}><b />{value}</span>;
  }
  const { className, style } = chipOf(value, options);
  return <span className={className} style={style}>{value}</span>;
}

/**
 * The body without its images.
 *
 * Both markdown forms, and the bare URL on its own line that GitHub renders as
 * an image when it points at one of its own assets.
 */
function stripImages(body: string): string {
  return body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/^\s*https:\/\/\S+\.(png|jpe?g|gif|webp)\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The issue as text somebody can paste into a chat window.
 *
 * The link first, because that is the half the reader actually needs; the rest
 * saves them opening it to find out whether they care.
 */
function asMarkdown(issue: BoardIssue, detail: Detail | null): string {
  const lines = [
    `[#${issue.number} ${issue.title}](${issue.url})`,
    '',
    `State: ${issue.state === 'OPEN' ? 'open' : 'closed'} · opened ${since(issue.createdAt)}`
      + (issue.author ? ` by ${issue.author}` : ''),
  ];
  if (issue.labels.length) lines.push(`Labels: ${issue.labels.map(l => l.name).join(', ')}`);
  if (issue.assignees.length) lines.push(`Assignees: ${issue.assignees.join(', ')}`);
  const dims = Object.entries(issue.dimensions).filter(([, v]) => v);
  if (dims.length) lines.push(dims.map(([k, v]) => `${cap(k)}: ${v}`).join(' · '));
  if (detail?.body?.trim()) lines.push('', stripImages(detail.body));
  return lines.join('\n');
}

/** `in progress` → `In progress`. */
function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
