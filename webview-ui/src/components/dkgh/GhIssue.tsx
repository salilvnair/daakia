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
import { ButtonView, SplitPanelView, TextInputView } from '@salilvnair/dui';
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
import { GhCommentMenu } from './GhCommentMenu';
import { GhIssueMenu, type ProjectPlace } from './GhIssueMenu';
import { commentId } from './edit-flow';
import { strandKey, threadOf } from './thread';
import { GhAvatar } from './GhAvatar';
import { useEditFlow } from './edit-flow';
import { GhRelations, useRelations } from './GhRelations';
import { GhCopyButton } from './GhCopyButton';
import { GhClose } from './GhClose';
import { GhDetails } from './GhDetails';
import type { ProjectBoard, ProjectField } from './project-store';
import { ACCENT, type RepoMeta } from './types';
import type { BoardIssue, ProposedDimension } from './board-types';

interface Detail {
  number: number;
  body: string;
  evidence: string[];
  /* `url` and `mine` come from the same `--json comments` payload the host
     already reads — see `fetchIssueDetail`. They are what the `…` menu needs
     to decide whether Edit and Delete are this reader's to offer. */
  comments: {
    author?: string;
    body: string;
    createdAt?: string;
    url?: string;
    mine?: boolean;
  }[];
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

export function GhIssue({
  repo, issue, dimensions, closed, all, end, meta, project, writingProject,
  onWriteProject, onOpen, onBack, onReference, onWrote, me, canWriteProject,
  onProjectItem,
}: {
  repo: string;
  issue: BoardIssue;
  dimensions: ProposedDimension[];
  /** The closed issues the board holds — 14E reads its reasons off them. */
  closed: BoardIssue[];
  /** The whole board, so 14D can give a blocker its chips and its ETA. */
  all: BoardIssue[];
  /** The Project's target-date field — where a blocker's ETA lives. */
  end?: ProjectField;
  /** The repository's labels, assignable people and milestones — the pickers. */
  meta?: RepoMeta;
  /** The linked Project, whose single-selects are the rest of the rail. */
  project?: ProjectBoard | null;
  /** Which Project field is being written right now, if any. */
  writingProject?: string;
  onWriteProject?: (field: ProjectField, value: string, optionId?: string) => void;
  /** Follow a relationship to the issue on the other end of it. */
  onOpen: (n: number) => void;
  onBack: () => void;
  /** Open the composer on a new issue seeded from a comment — the `…` menu. */
  onReference: (seed: string) => void;
  /** Whoever is signed in, so the description's Edit is offered to its author. */
  me?: string;
  /**
   * Whether the token carries `project`, not just `read:project`.
   *
   * The `…` draws Archive and Remove either way — a menu that differs silently
   * between two people looking at the same issue is worse than one with two
   * rows greyed and the reason under them. See `GhIssueMenu`.
   */
  canWriteProject?: boolean;
  /** Archive or remove this issue's card from the Project it is on. */
  onProjectItem?: (what: 'archive' | 'remove', itemId: string) => void;
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
  /**
   * The comment being rewritten, and what it currently says.
   *
   * Held here rather than in the row so that opening a second editor closes
   * the first: two comments half-rewritten, only one of which you remember, is
   * the way to lose the other.
   */
  const [editing, setEditing] = useState<{ id: number; body: string } | undefined>();
  /**
   * The description being rewritten.
   *
   * Separate from `editing` because it is a different write — `gh issue edit
   * --body-file -` against the issue, not a `PATCH` against a comment id — and
   * folding the two into one piece of state would mean a `0` id standing for
   * "the description" everywhere it is read.
   */
  const [editingBody, setEditingBody] = useState<string | undefined>();
  /** The title being rewritten. `undefined` is "not renaming". */
  const [renaming, setRenaming] = useState<string | undefined>();
  /** How many times a write has landed, to re-read this page's own two calls. */
  const [wrote, setWrote] = useState(0);
  /** 14D — what this issue is attached to. A third call, and the cheapest. */
  const relations = useRelations(repo, issue.number, wrote);

  /* The field names the rail above already draws with a picker. */
  const projectOwns = useMemo(
    () => new Set((project?.fields ?? [])
      .filter(f => f.dataType === 'SINGLE_SELECT')
      .map(f => f.name.toLowerCase())),
    [project],
  );

  /*
    This page's own write flow.

    The board's lives on the board, and the board is not rendered while screen
    14 is — so a comment written here would have had nowhere to show its
    confirm. Same hook, same host functions, same strip.
  */
  const flow = useEditFlow(repo, () => {
    setDraft('');
    setClosing(false);
    /* Only once the write has actually landed. Closing the editor at the
       moment the plan was proposed would throw the rewrite away if the reader
       then read the command and said no — which is the one thing the confirm
       screen exists to let them do. */
    setEditing(undefined);
    setEditingBody(undefined);
    setRenaming(undefined);
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

  /* Where this issue sits inside its Project, if it is on one — what the
     three project entries in the `…` are addressed by. */
  const place: ProjectPlace | undefined = project?.title && project.number
    ? {
      owner: repo.split('/')[0],
      number: project.number,
      title: project.title,
      itemId: project.items.find(i => i.number === issue.number)?.id,
    }
    : undefined;

  const status = (issue.dimensions.status ?? '').toLowerCase();
  const shots = detail?.evidence ?? issue.evidence;

  /*
    The body without its images.

    They are in the gallery below, at a size worth looking at. Left inline they
    are the same pictures twice, and the second copy is the one that pushes the
    first comment off the screen.
  */
  const body = useMemo(() => stripImages(detail?.body ?? ''), [detail?.body]);

  const kinds = useMemo(
    () => [...new Set((timeline?.events ?? []).map(e => e.kind))],
    [timeline],
  );
  /*
    The comments and the events, in one order — see `weave`. The mute filter
    is applied before weaving rather than after, so hiding every label event
    does not leave a gap where they were.
  */
  const thread = useMemo(
    () => threadOf(
      detail?.comments ?? [],
      (timeline?.events ?? []).filter(e => !muted.has(e.kind)),
    ),
    [detail, timeline, muted],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">

      {/* Where you are, and the two things to do from here */}
      <div className="head">
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
        {/*
          A close, and nothing else.

          Closing the issue and closing the page used to sit side by side up
          here meaning different things, which is why the page's own close was
          an arrow on the far left instead. Both moved: the × is where every
          other close in the tab is, and closing the *issue* went down to the
          comment box — which is where github.com puts it, and where the
          comment it belongs with is already being written.
        */}
        <GhClose onClick={onBack} title="Back to the board" />
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
              {/*
                The title, and the pencil beside it.

                Renaming happens in place, the way github.com does it: the
                heading becomes the field, with Cancel and Save under it. A
                dialog for one line of text is a dialog nobody opens, which is
                how an issue ends up called "test" for three months.
              */}
              {renaming === undefined ? (
                <div className="ghtitle">
                  <span className="ghtitle-t">{issue.title}</span>
                  <span className="ghtitle-n">#{issue.number}</span>
                  <button
                    type="button"
                    className="iconbtn"
                    title="Rename this issue"
                    aria-label="Rename this issue"
                    onClick={() => setRenaming(issue.title)}
                  >
                    <Ico name="pen" />
                  </button>
                  <span className="sp" style={{ flex: 1 }} />
                  <GhIssueMenu
                    url={issue.url}
                    canWriteProject={!!canWriteProject}
                    place={place}
                    onArchive={id => onProjectItem?.('archive', id)}
                    onRemove={id => onProjectItem?.('remove', id)}
                  />
                </div>
              ) : (
                /*
                  dui's own field and buttons, all at `size="lg"`.

                  Not the mock's `.btn` beside a hand-padded `<input>`: those
                  are two different ideas of how tall a control is, and they
                  came out two different heights every time the padding was
                  adjusted. `TextInputView` and `ButtonView` both take their
                  height from the same size token and set it inline, so the row
                  is uniform by construction — which is what the REST tab's URL
                  bar and its Send button already do.
                */
                <div className="ghtitle-edit">
                  <TextInputView
                    autoFocus
                    size="lg"
                    value={renaming}
                    onChange={e => setRenaming(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Escape') setRenaming(undefined);
                      if (e.key === 'Enter' && renaming.trim() && renaming !== issue.title) {
                        flow.propose({ repo, numbers: [issue.number], title: renaming.trim() });
                      }
                    }}
                    accentColor={ACCENT}
                    aria-label="Issue title"
                    style={{ flex: 1, minWidth: 0, fontWeight: 600 }}
                  />
                  <ButtonView
                    size="lg"
                    variant="secondary"
                    className="flex-shrink-0"
                    iconLeft={<Ico name="x" />}
                    onClick={() => setRenaming(undefined)}
                  >
                    Cancel
                  </ButtonView>
                  <ButtonView
                    size="lg"
                    variant="primary"
                    className="flex-shrink-0"
                    accentColor={ACCENT}
                    iconLeft={<Ico name="check" />}
                    /* A rename to the same words is not a write. */
                    disabled={!renaming.trim() || renaming.trim() === issue.title}
                    onClick={() => flow.propose({
                      repo, numbers: [issue.number], title: renaming.trim(),
                    })}
                  >
                    Save
                  </ButtonView>
                </div>
              )}
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
              <Comment who={issue.author} when={issue.createdAt}
                       verb={editingBody !== undefined ? 'is editing this' : 'opened this'}
                       menu={
                         /* The shorter menu github.com draws on the opening
                            post: no "Reference in a new issue" — that would
                            reference the issue you are reading — and no
                            Delete, because the description cannot be removed
                            without removing the issue. */
                         <GhCommentMenu
                           body
                           comment={{
                             author: issue.author,
                             body,
                             createdAt: issue.createdAt,
                             url: issue.url,
                             mine: !!me && issue.author === me,
                           }}
                           issueUrl={issue.url}
                           editing={editingBody !== undefined}
                           onQuote={quoted => {
                             setDraft(d => (d ? `${d.trimEnd()}

${quoted}` : quoted));
                             document.getElementById('dkgh-reply')
                               ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                           }}
                           onReference={onReference}
                           onEdit={() => setEditingBody(body)}
                         />
                       }>
                {editingBody !== undefined ? (
                  <GhMarkdown
                    value={editingBody}
                    onChange={setEditingBody}
                    minHeight={120}
                    issues={all}
                    placeholder="What this issue is about."
                    footer={
                      <>
                        <button type="button" className="btn"
                                onClick={() => setEditingBody(undefined)}>
                          <Ico name="x" />Cancel
                        </button>
                        <button
                          type="button"
                          className="btn go"
                          disabled={editingBody === body}
                          onClick={() => flow.propose({
                            repo, numbers: [issue.number], body: editingBody,
                          })}
                        >
                          <Ico name="check" />Update description
                        </button>
                      </>
                    }
                  />
                ) : detail
                  ? (body.trim()
                    ? <GhProse content={body} gallery={false} repo={repo} onOpenIssue={onOpen} full />
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

              {/* 14D — sub-issues, blockers, and where this was referenced from */}
              <GhRelations rel={relations} issues={all} end={end} onOpen={onOpen} />

              {/*
                14A — the thread, in the order it happened.

                One stream, the way github.com has it: the events and the
                comments are the same conversation, and dkgh used to draw them
                as two lists — every comment, then a "What happened" block —
                so a label added before a comment appeared after it. See
                `weave`.

                The chips are the part the site does not have. They stay, and
                they are worth more here than they were over a block of their
                own: this is how you read the writing without the project
                churn around it.
              */}
              {kinds.length > 0 && (
                <div className="fl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="sp" style={{ flex: 1 }} />
                  {/*
                    All of them, in one press.

                    Turning six kinds off to read the writing, and six back on
                    afterwards, is twelve clicks for a thing that is one
                    decision. It shows the state it is in rather than the state
                    it will produce — lit when everything is on, like the chips
                    beside it — and pressing it means "the other way".
                  */}
                  <button
                    type="button"
                    className={`pill${muted.size === 0 ? ' on' : ''}`}
                    style={{ padding: '1px 8px' }}
                    title={muted.size === 0 ? 'Hide all of these' : 'Show all of these'}
                    onClick={() => setMuted(prev => (prev.size === 0 ? new Set(kinds) : new Set()))}
                  >
                    all
                  </button>
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
              )}

              <div className="tline">
                {thread.map(s => {
                  if (s.kind === 'event') {
                    const first = s.events[0];
                    const last = s.events[s.events.length - 1];
                    return (
                      <div className="tev" key={strandKey(s)}>
                        <span className="dotc"><Ico name={EVENT_ICON[first.kind]} /></span>
                        <span className="txt">
                          <GhAvatar who={first.actor} className="av av-t" />
                          <b>{first.actor ?? 'somebody'}</b>{' '}
                          {/*
                            One row, however many events are in it — "added
                            enhancement and removed enhancement", the way
                            github.com writes it. The actor is said once at the
                            front and the time once at the end; everything
                            between is the verbs, joined. See `condense`.
                          */}
                          {s.events.map((e, i) => (
                            <span key={i} className="evp">
                              {i > 0 && <span className="evj">
                                {i === s.events.length - 1 ? ' and ' : ', '}
                              </span>}
                              {e.text}
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
                            </span>
                          ))}
                          {last.at && <i> · {since(last.at)}</i>}
                        </span>
                      </div>
                    );
                  }

                  const c = s.comment;
                  const id = commentId(c.url);
                  const open = id !== undefined && editing?.id === id;
                  return (
                    <Comment key={strandKey(s)}
                             who={c.author} when={c.createdAt}
                             verb={open ? 'is being edited' : 'commented'}
                             menu={
                               /* github.com's own `…`. Copy link, Copy Markdown,
                                  Quote reply, Reference in a new issue, and — on
                                  your own comments only — Edit and Delete. */
                               <GhCommentMenu
                                 comment={c}
                                 issueUrl={issue.url}
                                 editing={open}
                                 onQuote={quoted => {
                                   setDraft(d => (d ? `${d.trimEnd()}\n\n${quoted}` : quoted));
                                   document.getElementById('dkgh-reply')
                                     ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                                 }}
                                 onReference={onReference}
                                 /* In place, the way the site does it — the
                                    comment becomes the box, rather than the box
                                    opening somewhere else with a copy of the
                                    text in it. */
                                 onEdit={n => setEditing({ id: n, body: c.body })}
                                 onDelete={n => flow.propose({
                                   repo, numbers: [issue.number], deleteComment: { id: n },
                                 })}
                               />
                             }>
                      {open ? (
                        <GhMarkdown
                          value={editing.body}
                          onChange={body => setEditing({ id: editing.id, body })}
                          minHeight={96}
                          issues={all}
                          footer={
                            <>
                              <button type="button" className="btn"
                                      onClick={() => setEditing(undefined)}>
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="btn go"
                                /* An edit that changes nothing is not a write. */
                                disabled={!editing.body.trim() || editing.body === c.body}
                                onClick={() => flow.propose({
                                  repo,
                                  numbers: [issue.number],
                                  editComment: { id: editing.id, body: editing.body },
                                })}
                              >
                                <Ico name="check" />Update comment
                              </button>
                            </>
                          }
                        />
                      ) : (
                        /* A comment's screenshots are blocked by the webview's
                           own content policy, so they come through the host —
                           see GhProse. */
                        <GhProse content={c.body} repo={repo} onOpenIssue={onOpen} full />
                      )}
                    </Comment>
                  );
                })}

                {thread.length === 0 && timeline && (
                  <div className="sub" style={{ padding: '4px 0' }}>
                    {kinds.length > 0
                      ? 'Everything here is hidden. Turn one back on above.'
                      : 'Nothing has happened here yet.'}
                  </div>
                )}
              </div>

              {timeline && timeline.skipped > 0 && (
                <div className="sub">
                  {timeline.skipped} more event{timeline.skipped === 1 ? '' : 's'} GitHub sent
                  that dkgh does not know how to word — said here rather than left out
                  quietly. They are all on github.com.
                </div>
              )}

              {/*
                14B — writing a comment without leaving.

                It goes through the board's own confirm flow rather than
                sending on Enter: a comment is a write, everybody watching gets
                a notification, and there is no unsend. The strip below shows
                the exact call.

                One box, not a card wrapped around one. The "You" header strip
                is gone — the reader is the only person who can type here, and
                a row carrying their own name was height spent saying so.
              */}
              <GhMarkdown
                /* Quote reply scrolls here, so the quoted text is visible the
                   moment it lands rather than somewhere below the fold. */
                id="dkgh-reply"
                value={draft}
                onChange={setDraft}
                minHeight={84}
                placeholder="Leave a comment…"
                issues={all}
                right={<span className="sub">Type <b>#</b> to link another issue</span>}
                footer={
                  /*
                    github.com's own footer: closing the issue lives with the
                    comment, because the two are one thought. The button says
                    which it will do — "Close with comment" when there is
                    something in the box, "Close issue" when there is not — so
                    nobody has to wonder whether their half-written sentence is
                    about to be thrown away.
                  */
                  <>
                    {draft.trim() && (
                      /* An icon, like the two beside it. Without one its
                         content box was a line of text where theirs was a
                         12px glyph, so it sat visibly shorter in a row of
                         three buttons that are meant to read as a set. */
                      <button type="button" className="btn" onClick={() => setDraft('')}>
                        <Ico name="trash" />Discard
                      </button>
                    )}
                    {/* Purple, because that is the colour a closed issue is on
                        github.com — green there means merged, which this is
                        not. Solid, like the Comment beside it: an outline
                        against a fill reads as one real button and one
                        suggestion. */}
                    {issue.state === 'OPEN' ? (
                      <button type="button" className="btn shut" onClick={() => setClosing(true)}>
                        <Ico name="closed" />
                        {draft.trim() ? 'Close with comment' : 'Close issue'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => flow.propose({
                          repo,
                          numbers: [issue.number],
                          state: 'reopen',
                          ...(draft.trim() ? { comment: draft } : {}),
                        })}
                      >
                        <Ico name="issue" />
                        {draft.trim() ? 'Reopen with comment' : 'Reopen'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn go"
                      disabled={!draft.trim()}
                      onClick={() => flow.propose({
                        repo, numbers: [issue.number], comment: draft,
                      })}
                    >
                      <Ico name="cmt" />Comment
                    </button>
                  </>
                }
              />

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

            {/*
              Assignees, labels, the Project's fields and the milestone — each
              behind a gear, the way github.com does it. Everything below this
              is a fact about the issue rather than a field on it, and stays a
              row you read.
            */}
            <GhDetails
              repo={repo}
              issue={issue}
              meta={meta}
              project={project}
              dimensions={dimensions}
              flow={flow}
              writing={writingProject}
              onWriteProject={onWriteProject}
            />

            {/*
              Read out of the body, not set from here: a dimension lives in the
              issue's markdown under its own heading, and editing it is editing
              the body.

              The Project's fields are filtered out because `withProject` merges
              them into `dimensions` for the board's sake — without this, Status
              appeared twice on this page, once with a gear and once without,
              which reads as two different Statuses.
            */}
            {Object.entries(issue.dimensions)
              .filter(([field, v]) => v && !projectOwns.has(field.toLowerCase()))
              .map(([field, value]) => (
                <Msec key={field} label={cap(field)}>
                  <Dim field={field} value={value} dimensions={dimensions} />
                </Msec>
              ))}

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
              <button type="button" className="btn" onClick={() => openExternal(issue.url)}>
                <Ico name="link" />Open on github.com
              </button>
              <GhCopyButton text={() => asMarkdown(issue, detail)}>
                Copy as Markdown
              </GhCopyButton>
              <GhCopyButton icon="link" text={() => issue.url}>
                Copy link
              </GhCopyButton>
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
          /* Whatever is in the reply box is the comment this close carries —
             the button said "Close with comment", and losing it here would
             make that a lie. */
          draft={draft}
          onClose={request => { setClosing(false); setDraft(''); flow.propose(request); }}
        />
      )}
    </div>
  );
}

/** One block of prose with its author above it. */
function Comment({ who, when, verb, menu, children }: {
  who?: string;
  when?: string;
  verb: string;
  /** The `…`, drawn at the right-hand end of the header. */
  menu?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="cmt">
      <div className="ch">
        {/* Their actual picture when there is one, the letter until there is —
            see `GhAvatar`. `avClass` still picks the colour, so a bot or a
            signed-out session keeps the circle it always had. */}
        <GhAvatar who={who} className={avClass(who ?? '?')} />
        <b>{who ?? 'somebody'}</b> {verb}
        <span style={{ marginLeft: 'auto' }} />
        {when && <span>{since(when)}</span>}
        {menu}
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
