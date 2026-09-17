/**
 * A link to one pod, and to one line of its log.
 *
 * ── What a link can honestly point at ──
 *
 * Not a line number. `kubectl logs` returns a moving window over a file that
 * rotates, and a pod is replaced on every rollout — line 4,312 is a different
 * line tomorrow and a different pod's line next week. A link built on one
 * would keep working in the sense that it would keep opening something, which
 * is the worst way for a link to break.
 *
 * So a link carries what can be looked for again: the pod's address, the
 * moment the line was written, and enough of its text to recognise it. Opening
 * one fetches the log around that moment and finds the line that matches. When
 * the pod is gone, or the line has rotated out of the window, that is said
 * plainly — an honest "this is no longer here" beats a confident highlight on
 * the wrong line.
 *
 * ── Why the text is carried and not a hash ──
 *
 * A hash would be shorter and would only ever answer yes or no. The text can
 * be shown: "looking for `upstream timeout on request 22338`" is a thing the
 * reader can act on when the line cannot be found — they can search for it
 * themselves, or recognise that they are in the wrong namespace. A hash tells
 * them nothing except that it failed.
 *
 * ── The two spellings ──
 *
 * `daakia://dk8s/logs?…` is the app's own, and is what goes on the clipboard:
 * it is what daakia itself understands, in the extension and in the browser.
 * `vscode://salilvnair.daakia/dk8s/logs?…` is the same target spelled for the
 * operating system, so a link pasted into a chat window opens the editor.
 * Both parse to the same thing, because a reader who was sent one form should
 * not have to care which they got.
 */

/** How much of the line travels in the link. */
const MAX_TEXT = 160;

export interface PodTarget {
  context: string;
  namespace: string;
  pod: string;
}

export interface LogTarget extends PodTarget {
  container?: string;
  /** When the line was written. Absent for a log with no timestamps. */
  ts?: number;
  /** Enough of the line to recognise it again. */
  text?: string;
}

const APP_SCHEME = 'daakia://';
const OS_SCHEME = 'vscode://salilvnair.daakia/';

function query(t: LogTarget): string {
  const q = new URLSearchParams();
  q.set('context', t.context);
  q.set('ns', t.namespace);
  q.set('pod', t.pod);
  if (t.container) q.set('container', t.container);
  if (t.ts !== undefined) q.set('ts', String(t.ts));
  if (t.text) q.set('text', t.text.slice(0, MAX_TEXT));
  return q.toString();
}

/** The app's own form — what Copy link puts on the clipboard. */
export function podLogLink(t: LogTarget): string {
  return `${APP_SCHEME}dk8s/logs?${query(t)}`;
}

/** The same target, spelled so the operating system opens the editor on it. */
export function podLogLinkForOs(t: LogTarget): string {
  return `${OS_SCHEME}dk8s/logs?${query(t)}`;
}

/** A link to the pod itself, with no line in mind. */
export function podLink(t: PodTarget): string {
  return podLogLink(t);
}

/**
 * Read either spelling back.
 *
 * Returns nothing for anything that is not one of ours, because this runs on
 * whatever was pasted into a search box — most of which is a search.
 */
export function parsePodLink(raw: string): LogTarget | undefined {
  const s = raw.trim();
  const rest = s.startsWith(APP_SCHEME) ? s.slice(APP_SCHEME.length)
    : s.startsWith(OS_SCHEME) ? s.slice(OS_SCHEME.length)
      : undefined;
  if (rest === undefined) return undefined;

  const cut = rest.indexOf('?');
  if (cut < 0) return undefined;
  /* Only the dk8s log route, for now. An unknown route is not ours to guess
     at — opening the wrong screen is worse than saying nothing. */
  if (rest.slice(0, cut) !== 'dk8s/logs') return undefined;

  const q = new URLSearchParams(rest.slice(cut + 1));
  const context = q.get('context') ?? '';
  const namespace = q.get('ns') ?? '';
  const pod = q.get('pod') ?? '';
  /* A target missing any part of its address cannot be opened, and opening
     "some pod called this, in whichever namespace" is how somebody ends up
     reading production while they think they are in the lab. */
  if (!namespace || !pod) return undefined;

  const ts = Number(q.get('ts'));
  return {
    context,
    namespace,
    pod,
    container: q.get('container') || undefined,
    ts: Number.isFinite(ts) && ts > 0 ? ts : undefined,
    text: q.get('text') || undefined,
  };
}

/** Does this look like one of ours at all? Cheap enough for every keystroke. */
export function looksLikePodLink(raw: string): boolean {
  const s = raw.trim();
  return s.startsWith(APP_SCHEME) || s.startsWith(OS_SCHEME);
}

/**
 * Find the line a link was pointing at.
 *
 * The timestamp puts us in the right part of the log and the text picks the
 * line out of it, because neither is enough alone: several lines share a
 * millisecond, and the same message repeats all day.
 *
 * Matching on the text the link carried, which may be a prefix of the line —
 * it was cut to keep the link short. Exact equality would fail on precisely
 * the long lines worth linking to.
 */
export function findLinkedLine<T extends { ts?: number; text: string }>(
  lines: T[], target: LogTarget,
): T | undefined {
  const wanted = target.text?.trim();
  if (!wanted && target.ts === undefined) return undefined;

  if (wanted) {
    const hits = lines.filter(l => l.text.includes(wanted));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1 && target.ts !== undefined) {
      /* The same message all afternoon: the timestamp decides which one. */
      return hits.reduce((best, l) => (
        Math.abs((l.ts ?? 0) - target.ts!) < Math.abs((best.ts ?? 0) - target.ts!) ? l : best
      ));
    }
    if (hits.length) return hits[0];
  }

  /* No text, or the text is gone: the nearest line by time is the closest
     thing to an answer, and the caller says it is approximate. */
  if (target.ts === undefined) return undefined;
  const timed = lines.filter(l => l.ts !== undefined);
  if (!timed.length) return undefined;
  return timed.reduce((best, l) => (
    Math.abs(l.ts! - target.ts!) < Math.abs(best.ts! - target.ts!) ? l : best
  ));
}
