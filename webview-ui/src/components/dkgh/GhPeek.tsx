/**
 * Screen 04D — peek at one without leaving the board.
 *
 * Half the times you click an issue you only want one fact from it: the error
 * message, who commented last, whether the screenshot is the one you are
 * thinking of. Opening a detail screen for that costs your scroll position and
 * your selection.
 *
 * **Hold to peek, release to dismiss** — a spring-loaded gesture rather than a
 * mode, so there is nothing to close and no way to end up with fourteen of them
 * open. The key is Space, which is also how a keyboard user selects a row; the
 * difference is the hold, and the footer says so out loud.
 *
 * It also opens from the right-click menu, and that is why it is a dialog. A
 * spring-loaded panel needs no way out — the way out is letting go — but nobody
 * is holding anything after choosing `Peek` from a menu, and a panel you opened
 * with the mouse and cannot close with the mouse is a trap.
 *
 * So it is `ModalView`, the same dialog every protocol in Daakia opens: the
 * same card, the same X in the same corner reddening under the pointer, the
 * same Escape. A peek is not rare enough to be worth a close people have to
 * find. The footer still says which gesture applies, because the held peek
 * genuinely has a different one.
 *
 * **`inline`, not `popout`.** The default mode portals the card to
 * `document.body`, and the board stays mounted when you switch to another
 * Daakia tab — so a peek left open followed you to the cluster view and sat on
 * top of it. Inline keeps the card inside the board's own DOM, where it
 * disappears with the thing it is about, and the backdrop below is drawn over
 * the board rather than over the window.
 *
 * The panel is the three things the card could not fit: the actual behaviour,
 * the evidence at a readable size, and the most recent comment, which is
 * usually the one that tells you whether anybody is on it. It is fetched when
 * the key goes down, not with the board — the comments on every issue in a busy
 * repository are megabytes to fill something open for four seconds.
 *
 * **The body is rendered, not printed.** An issue body is markdown, and a
 * comment is markdown, and showing them raw put ```` ```json ```` in the middle
 * of the one sentence somebody was reading. Code fences are exactly what a bug
 * report is full of — a stack trace, a payload, the log line — so the one place
 * they matter most was the one place they were shown as literal backticks.
 */
import { useEffect, useState } from 'react';
import { MarkdownView, ModalView, SkeletonView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { Ico } from './GhIcons';
import { Dk } from './GhShell';
import { GhEvidence } from './GhEvidence';
import { avClass } from './GhCards';
import { sinceIso } from './format';
import type { BoardIssue } from './board-types';
import { ACCENT } from './types';

interface Detail {
  number: number;
  body: string;
  evidence: string[];
  comments: { author?: string; body: string; createdAt?: string }[];
  error?: string;
}

/** How much of a body is worth showing before it stops being a peek. */
const BODY_MAX = 700;

/** The status word, in the mock's own five colours. */
const STATE_CLASS: Record<string, string> = {
  'in progress': 'st-prog',
  'in review': 'st-review',
  done: 'st-done',
  blocked: 'st-block',
};

export function GhPeek({ repo, issue, onOpen, onClose }: {
  repo: string;
  issue: BoardIssue;
  onOpen: (issue: BoardIssue) => void;
  /** Undefined while a key is being held — then releasing it is the close. */
  onClose?: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);

  /* Escape, for a peek that was opened by clicking rather than by holding. */
  useEffect(() => {
    if (!onClose) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    setDetail(null);
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type !== 'dkgh:issue:result') return;
      if (msg.number !== issue.number) return;
      setDetail(msg as unknown as Detail);
    };
    window.addEventListener('message', handler);
    postMsg({ type: 'dkgh:issue', repo, number: issue.number });
    return () => window.removeEventListener('message', handler);
  }, [repo, issue.number]);

  const last = detail?.comments[detail.comments.length - 1];
  const shots = (detail?.evidence ?? issue.evidence).slice(0, 3);
  const status = (issue.dimensions.status ?? '').toLowerCase();

  return (
    <>
      {/* Dims the board, not the window — the peek is about one card on this
          screen, and nothing outside it needs to go quiet. Only drawn when the
          peek can be clicked away; a held one is gone before a click lands and
          dimming for it would flash on every hold. */}
      {onClose && (
        <div className="absolute inset-0" style={{ zIndex: 29, background: 'rgba(0,0,0,.45)' }}
             onClick={onClose} />
      )}
      <div
        className="absolute"
        style={{
          left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(560px, 92%)', maxHeight: '82%', zIndex: 30,
          display: 'flex', flexDirection: 'column',
        }}
      >
    <ModalView
      open
      onClose={onClose ?? (() => undefined)}
      mode="inline"
      size="md"
      headerColor={ACCENT}
      showCloseIcon={!!onClose}
      noPadding
      title={
        <Dk>
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
            <span className="num">#{issue.number}</span>
            <b style={{ color: 'var(--dk-text)' }}>{issue.title}</b>
          </span>
        </Dk>
      }
      headerRight={status
        ? (
          <Dk>
            <span className={`st ${STATE_CLASS[status] ?? 'st-todo'}`}>
              <b />{issue.dimensions.status}
            </span>
          </Dk>
        )
        : undefined}
      footerLeft={
        <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
          {onClose ? 'Esc to dismiss' : 'release Space to dismiss'}
        </span>
      }
      footerRight={
        <Dk>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn go" onClick={() => onOpen(issue)}>
              <Ico name="link" />Open
            </button>
            <CopyLink url={issue.url} />
          </span>
        </Dk>
      }
    >
      <Dk>
      <div className="pkb">
        <Label>Actual</Label>
        {detail === null ? (
          <div className="animate-pulse" style={{ display: 'grid', gap: 5 }}>
            <SkeletonView variant="block" width="100%" height={10} />
            <SkeletonView variant="block" width="72%" height={10} />
          </div>
        ) : detail.error ? (
          <div style={{ color: 'var(--dk-red)' }}>{detail.error}</div>
        ) : (
          <Md content={trim(detail.body)} empty="This issue has an empty body." />
        )}

        {shots.length > 0 && (
          <>
            <Label top>Evidence{shots.length > 1 ? ` · ${shots.length}` : ''}</Label>
            <div className="gallery" style={{ display: 'grid', gap: 7,
                                              gridTemplateColumns: `repeat(${Math.min(shots.length, 3)}, 1fr)` }}>
              {shots.map(u => (
                <GhEvidence key={u} url={u} height={104} alt={`Evidence on #${issue.number}`} />
              ))}
            </div>
          </>
        )}

        {last && (
          <>
            <Label top>Last comment</Label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              {last.author && (
                <span className={avClass(last.author)} style={{ flexShrink: 0, marginTop: 2 }}>
                  {last.author[0].toUpperCase()}
                </span>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: 'var(--dk-muted)', marginBottom: 2 }}>
                  <b style={{ color: 'var(--dk-text)' }}>{last.author ?? 'someone'}</b>
                  {last.createdAt ? `, ${sinceIso(last.createdAt)}` : ''}
                </div>
                <Md content={trim(last.body, 400)} empty="An empty comment." />
              </div>
            </div>
          </>
        )}

        {detail && !detail.error && detail.comments.length === 0 && (
          <div style={{ marginTop: 10, color: 'var(--dk-amber)' }}>
            Nobody has commented. {issue.quietDays}d since anything happened on it.
          </div>
        )}
      </div>

      </Dk>
    </ModalView>
      </div>
    </>
  );
}


/**
 * Copy the link, and prove it.
 *
 * The same green tick the query bar answers with — a press with no answer is a
 * press people make twice, and the second one is the one where they wonder
 * whether it worked at all.
 */
function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return undefined;
    const t = window.setTimeout(() => setDone(false), 1500);
    return () => window.clearTimeout(t);
  }, [done]);

  return (
    <button
      type="button"
      className={`btn copyb${done ? ' done' : ''}`}
      title={done ? 'Copied' : 'Copy the link'}
      onClick={() => { navigator.clipboard?.writeText(url); setDone(true); }}
    >
      <Ico name={done ? 'check' : 'copy'} />{done ? 'Copied' : 'Link'}
    </button>
  );
}

function Md({ content, empty }: { content: string; empty: string }) {
  if (!content.trim()) return <span style={{ color: 'var(--dk-faint)' }}>{empty}</span>;
  return (
    <div className="dkgh-md" style={{ fontSize: 'inherit' }}>
      <MarkdownView content={content} />
    </div>
  );
}

function Label({ children, top }: { children: React.ReactNode; top?: boolean }) {
  return (
    <div style={{
      fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase',
      color: 'var(--dk-faint)', marginBottom: 4,
      marginTop: top ? 12 : 0,
      paddingTop: top ? 10 : 0,
      borderTop: top ? '1px solid var(--dk-border)' : undefined,
    }}>
      {children}
    </div>
  );
}

/**
 * A body, as much of it as a peek should show.
 *
 * The form's own headings go — an issue filed from a template starts with
 * `### Summary`, and a panel whose first line is the same on every issue has
 * wasted its first line. Images go too: they are shown properly below, at a
 * size you can judge, and their markdown is a URL nobody can read.
 *
 * Nothing else is touched. Fences, lists, links and inline code are the shape
 * of the thing being reported and they are what the renderer is for; cutting
 * is by length alone, on a line boundary so a fence is never left half-open.
 */
export function trim(markdown: string, max = BODY_MAX): string {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<img[^>]*>/gi, '')
    .split(/\r?\n/)
    .filter(l => !/^#{1,6}\s/.test(l.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text.length <= max) return text;

  const cut = text.slice(0, max);
  const at = cut.lastIndexOf('\n');
  const kept = at > max * 0.6 ? cut.slice(0, at) : cut;
  /* An odd number of fences means the cut landed inside a code block, and an
     unclosed fence swallows the rest of the panel. Close it. */
  const fences = (kept.match(/^```/gm) ?? []).length;
  return `${kept}${fences % 2 ? '\n```' : ''}\n\n…`;
}
