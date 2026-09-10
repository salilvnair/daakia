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
import { MarkdownView, SkeletonView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { Ico } from './GhIcons';
import { GhEvidence } from './GhEvidence';
import { avClass } from './GhCards';
import { sinceIso } from './format';
import type { BoardIssue } from './board-types';

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

export function GhPeek({ repo, issue, onOpen }: {
  repo: string;
  issue: BoardIssue;
  onOpen: (issue: BoardIssue) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);

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
    <div
      className="peek"
      style={{
        /* Centred over the board rather than anchored to the card. The mock
           pins it beside the card it belongs to, which is right in a figure of
           a fixed size; in a panel somebody drags narrow the same rule lands it
           half off-screen, and this is on screen for four seconds. */
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(520px, 90%)',
        maxHeight: '78%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div className="pkh">
        <span className="num">#{issue.number}</span>
        <b style={{ color: 'var(--dk-text)', overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' }}>
          {issue.title}
        </b>
        <span className="sp" style={{ flex: 1 }} />
        {status && (
          <span className={`st ${STATE_CLASS[status] ?? 'st-todo'}`}><b />{issue.dimensions.status}</span>
        )}
      </div>

      <div className="pkb" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
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

      <div className="footbar" style={{ padding: '8px 13px', flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--dk-faint)' }}>release Space to dismiss</span>
        <span className="sp" />
        <button type="button" className="btn go" onClick={() => onOpen(issue)}>
          <Ico name="link" />Open
        </button>
        <button type="button" className="btn" title="Copy the link"
                onClick={() => navigator.clipboard?.writeText(issue.url)}>
          <Ico name="copy" />Link
        </button>
      </div>
    </div>
  );
}

/**
 * Rendered markdown, in the peek's own type.
 *
 * `MarkdownView` brings its own sizing, which is meant for a document; this is
 * a four-second panel, so the wrapper hands it the peek's font size to inherit
 * and lets everything inside scale off that.
 */
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
