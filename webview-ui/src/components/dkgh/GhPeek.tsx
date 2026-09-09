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
 */
import { useEffect, useState } from 'react';
import { AvatarView, BadgeChipView, ButtonView, SkeletonView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { ExternalLinkIcon, CopyIcon } from '../../icons';
import { GhEvidence } from './GhEvidence';
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
const BODY_MAX = 420;

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

  return (
    <div
      className="absolute rounded-xl border overflow-hidden flex flex-col"
      style={{
        /* Centred over the board rather than anchored to the card. A panel that
           follows the cursor is a panel that lands half off-screen at the edge
           of the grid, and this one is on screen for four seconds. */
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(440px, 88%)',
        maxHeight: '72%',
        zIndex: 30,
        borderColor: `color-mix(in srgb, ${ACCENT} 45%, transparent)`,
        background: 'var(--color-surface)',
        boxShadow: '0 14px 42px rgba(0,0,0,.5)',
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
           style={{
             borderBottom: '1px solid var(--color-surface-border)',
             background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`,
           }}>
        <span className="text-[11px] font-mono" style={{ color: ACCENT }}>#{issue.number}</span>
        <span className="text-[11px] font-medium truncate"
              style={{ color: 'var(--color-text-primary)' }}>
          {issue.title}
        </span>
        <span className="flex-1" />
        {Object.values(issue.dimensions).slice(0, 2).map(v => (
          <BadgeChipView key={v} tone={ACCENT} size="xs">{v}</BadgeChipView>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2.5 flex flex-col gap-2">
        <Section title="Actual">
          {detail === null ? (
            <span className="flex flex-col gap-1 animate-pulse">
              <SkeletonView variant="block" width="100%" height={9} />
              <SkeletonView variant="block" width="72%" height={9} />
            </span>
          ) : detail.error ? (
            <span style={{ color: 'var(--color-error)' }}>{detail.error}</span>
          ) : (
            <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {plain(detail.body) || 'This issue has an empty body.'}
            </span>
          )}
        </Section>

        {shots.length > 0 && (
          <Section title={`Evidence${shots.length > 1 ? ` · ${shots.length}` : ''}`}>
            <span className="grid gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${Math.min(shots.length, 3)}, 1fr)` }}>
              {shots.map(u => (
                <GhEvidence key={u} url={u} height={92} alt={`Evidence on #${issue.number}`} />
              ))}
            </span>
          </Section>
        )}

        {last && (
          <Section title="Last comment">
            <span className="flex items-start gap-2">
              {last.author && <AvatarView name={last.author} size="xs" />}
              <span style={{ overflowWrap: 'anywhere' }}>
                <b style={{ color: 'var(--color-text-primary)' }}>{last.author ?? 'someone'}</b>
                {last.createdAt ? `, ${sinceIso(last.createdAt)}` : ''}: {plain(last.body, 200)}
              </span>
            </span>
          </Section>
        )}

        {detail && !detail.error && detail.comments.length === 0 && (
          <span className="text-[10px]" style={{ color: 'var(--color-warning)' }}>
            Nobody has commented. {issue.quietDays}d since anything happened on it.
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0"
           style={{ borderTop: '1px solid var(--color-surface-border)' }}>
        <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
          release Space to dismiss
        </span>
        <span className="flex-1" />
        <ButtonView size="sm" accentColor={ACCENT} iconLeft={<ExternalLinkIcon size={11} />}
                    onClick={() => onOpen(issue)}>
          Open
        </ButtonView>
        <ButtonView size="sm" accentColor="var(--color-text-muted)"
                    iconLeft={<CopyIcon size={11} />}
                    onClick={() => navigator.clipboard?.writeText(issue.url)}>
          Link
        </ButtonView>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-bold uppercase tracking-[.08em]"
            style={{ color: 'var(--color-text-muted)' }}>
        {title}
      </span>
      <span className="text-[10.5px]" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
        {children}
      </span>
    </div>
  );
}

/**
 * A body, as much of it as a peek should show.
 *
 * The form's own headings are stripped — an issue filed from a template starts
 * with `### Summary`, and a panel whose first line is the same on every issue
 * has wasted its first line. Images go too: they are shown properly below,
 * and their markdown is a URL nobody can read.
 */
function plain(markdown: string, max = BODY_MAX): string {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<img[^>]*>/gi, '')
    .split(/\r?\n/)
    .filter(l => !/^#{1,6}\s/.test(l.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
