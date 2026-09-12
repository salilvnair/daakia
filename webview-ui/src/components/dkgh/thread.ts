/**
 * One thread, in the order it happened.
 *
 * dkgh drew two lists: every comment, then a separate "What happened" block of
 * events underneath. So a label added before a comment appeared *after* it, and
 * the question the page exists to answer — what went on here, in what order —
 * needed the reader to hold two lists in their head and interleave them by the
 * relative timestamps.
 *
 * github.com has one stream, and it is one stream because the events and the
 * comments are the same conversation: somebody labels it `bug`, somebody says
 * why, somebody else moves it to In Progress. This weaves them back together.
 *
 * The filter chips stay. Being able to turn the project churn off and read only
 * the writing is the thing dkgh has that the site does not, and it is worth
 * more inside one stream than it was over a block of its own.
 */

export interface ThreadComment {
  author?: string;
  body: string;
  createdAt?: string;
  url?: string;
  mine?: boolean;
}

export interface ThreadEvent {
  kind: string;
  actor?: string;
  at?: string;
  text: string;
  value?: string;
  colour?: string;
}

/*
  Generic over both halves so the caller keeps its own types. `GhIssue`'s event
  has a `TimelineKind` union on it, and that union is what indexes the icon
  table — widened to `string` here, the icon lookup stops type-checking and the
  next kind somebody adds goes out with no glyph.
*/
export type Strand<C = ThreadComment, E = ThreadEvent> =
  | { kind: 'comment'; at: number; seq: number; comment: C }
  /**
   * One row, which may be several events.
   *
   * github.com does not draw `salilvnair added enhancement` and
   * `salilvnair removed enhancement` as two lines a second apart; it draws one
   * line that says both. Four separate rows for one person's four clicks is
   * four times the height saying one thing. See `condense`.
   */
  | { kind: 'event'; at: number; seq: number; events: E[] };

/**
 * Both lists, in one order.
 *
 * ── Things without a timestamp ──
 *
 * GitHub does not always send one, and an item that sorted to the epoch would
 * jump to the top of the thread — the loudest possible place for the one row we
 * know least about. Each list arrives in order, so an undated item inherits the
 * time of the item before it and stays where it already was.
 *
 * ── Ties ──
 *
 * Real, and not rare: labelling an issue and moving it in a Project happen in
 * the same second, and a comment posted by an action lands on the same second
 * as the event that triggered it. Events sort before comments on an exact tie,
 * because an event is the smaller thing and the comment beside it usually
 * reads as the answer to it. Within one kind the original order is kept, so a
 * tie never scrambles a list that already knew its own sequence.
 */
export function weave<C extends ThreadComment, E extends ThreadEvent>(
  comments: C[], events: E[],
): Strand<C, E>[] {
  const out: Strand<C, E>[] = [];

  let last = 0;
  events.forEach((event, i) => {
    last = stamp(event.at, last);
    out.push({ kind: 'event', at: last, seq: i, events: [event] });
  });

  last = 0;
  comments.forEach((comment, i) => {
    last = stamp(comment.createdAt, last);
    out.push({ kind: 'comment', at: last, seq: i, comment });
  });

  return out.sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at;
    if (a.kind !== b.kind) return a.kind === 'event' ? -1 : 1;
    return a.seq - b.seq;
  });
}

/**
 * How far apart two of one person's events can be and still be one row.
 *
 * Ten minutes. The events being merged are somebody triaging — labelling,
 * assigning, moving a card — and that is a sitting, not an instant. Tighter
 * than this and the pair github.com shows as one line comes back as two;
 * looser and two unrelated visits a lunch hour apart read as one action.
 */
export const CONDENSE_MS = 10 * 60_000;

/**
 * Adjacent events by the same person, of the same kind, as one row.
 *
 * All three conditions are load-bearing. **Adjacent**, so a comment between
 * them keeps them apart — they are no longer one action once somebody has
 * spoken in the middle. **The same person**, because "salilvnair and octocat
 * added" is not a sentence anybody wants to parse. **The same kind**, because
 * a label change and a project move share no verb and merging them would mean
 * inventing one.
 */
export function condense<C, E extends ThreadEvent>(
  strands: Strand<C, E>[], within = CONDENSE_MS,
): Strand<C, E>[] {
  const out: Strand<C, E>[] = [];

  for (const s of strands) {
    const last = out[out.length - 1];
    if (
      s.kind === 'event' && last?.kind === 'event'
      && last.events[0].actor === s.events[0].actor
      && last.events[0].kind === s.events[0].kind
      && s.at - last.at <= within
    ) {
      /* The row keeps the time of its latest event, which is what "1d ago" on
         a merged row should mean — when this person last touched it. */
      out[out.length - 1] = { ...last, at: s.at, events: [...last.events, ...s.events] };
      continue;
    }
    out.push(s);
  }

  return out;
}

/** The thread as it is drawn: woven, then condensed. */
export function threadOf<C extends ThreadComment, E extends ThreadEvent>(
  comments: C[], events: E[], within = CONDENSE_MS,
): Strand<C, E>[] {
  return condense(weave(comments, events), within);
}

function stamp(at: string | undefined, fallback: number): number {
  const t = at ? Date.parse(at) : NaN;
  return Number.isFinite(t) ? t : fallback;
}

/** A key that stays the same across re-renders and is unique within the thread. */
export function strandKey(s: Strand<ThreadComment, ThreadEvent>): string {
  return s.kind === 'comment'
    ? `c-${s.comment.url ?? ''}-${s.comment.createdAt ?? ''}-${s.seq}`
    : `e-${s.events[0].kind}-${s.events[0].at ?? ''}-${s.seq}`;
}
