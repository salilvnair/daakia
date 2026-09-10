/**
 * Screen 15D — exporting a repository's whole history.
 *
 * Exporting the current view is one call against issues already in memory.
 * This is dozens, and it is the export somebody runs once a quarter and really
 * needs to complete — so it says where it is rather than showing a spinner for
 * two minutes and then a file.
 *
 * **The amber line is the honest one.** Issues that predate the templates have
 * no parseable body, and their Module and Environment columns come out empty.
 * Said here, during the export, rather than discovered later as a gap in a
 * spreadsheet somebody has already circulated.
 *
 * **The rate limit is a first-class number, not a failure mode.** An export
 * that exhausts an hourly budget breaks every other tool that account uses for
 * the next fifty minutes, so the walk pauses under a tenth and this says so
 * while it waits — a stall with no explanation reads as a hang.
 */
import { useEffect, useState } from 'react';
import { ModalView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { Ico } from './GhIcons';
import { Dk, GhNote } from './GhShell';
import { ACCENT } from './types';
import type { BoardIssue } from './board-types';

export interface RateLimit { remaining: number; limit: number; resetAt: number }

export interface HarvestProgress {
  done: number;
  total: number;
  page: number;
  pages: number;
  parsed: number;
  unparsed: number;
  rate?: RateLimit;
  etaSeconds?: number;
  pausedUntil?: number;
}

export const EMPTY: HarvestProgress = {
  done: 0, total: 0, page: 0, pages: 0, parsed: 0, unparsed: 0,
};

/** `1,320` — the mock's own separators, so a five-digit count stays readable. */
export function group(n: number): string {
  return n.toLocaleString('en-GB');
}

/**
 * "about 40 seconds left", or nothing.
 *
 * Rounded hard on purpose. A projection accurate to the second is a projection
 * that visibly disagrees with itself every page, and "about a minute" is the
 * claim the number can actually support.
 */
export function leftToGo(seconds: number | undefined): string {
  if (seconds === undefined || seconds <= 0) return '';
  if (seconds < 90) return `about ${Math.round(seconds / 10) * 10} seconds left`;
  /* Floor, not round: ninety seconds rounds to two minutes, which makes the
     singular unreachable and overstates the wait. "About a minute" for 90s is
     both shorter to read and closer to true. */
  const mins = Math.max(1, Math.floor(seconds / 60));
  return `about ${mins} minute${mins === 1 ? '' : 's'} left`;
}

export function useHarvest(repo: string, running: boolean) {
  const [progress, setProgress] = useState<HarvestProgress>(EMPTY);
  const [result, setResult] = useState<{
    issues: BoardIssue[]; error?: string; cancelled?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!running || !repo) return;
    setProgress(EMPTY);
    setResult(null);
    const onMsg = (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown>;
      if (msg?.type === 'dkgh:harvest:progress') {
        setProgress({
          done: Number(msg.done) || 0,
          total: Number(msg.total) || 0,
          page: Number(msg.page) || 0,
          pages: Number(msg.pages) || 0,
          parsed: Number(msg.parsed) || 0,
          unparsed: Number(msg.unparsed) || 0,
          rate: msg.rate as RateLimit | undefined,
          etaSeconds: msg.etaSeconds as number | undefined,
          pausedUntil: msg.pausedUntil as number | undefined,
        });
      }
      if (msg?.type === 'dkgh:harvest:result') {
        setResult({
          issues: (msg.issues as BoardIssue[]) ?? [],
          error: msg.error as string | undefined,
          cancelled: msg.cancelled as boolean | undefined,
        });
        if (msg.progress) setProgress(msg.progress as HarvestProgress);
      }
    };
    window.addEventListener('message', onMsg);
    postMsg({ type: 'dkgh:harvest', repo });
    return () => window.removeEventListener('message', onMsg);
  }, [repo, running]);

  return { progress, result };
}

export function GhHarvest({ repo, progress, onCancel, onHide }: {
  repo: string;
  progress: HarvestProgress;
  onCancel: () => void;
  /** Leaves it running. The file appears when it is done. */
  onHide: () => void;
}) {
  const { done, total, page, pages, parsed, unparsed, rate } = progress;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const eta = leftToGo(progress.etaSeconds);

  return (
    <ModalView
      open
      onClose={onHide}
      size="md"
      headerGradient
      headerColor={ACCENT}
      headerIcon={<Ico name="dl" />}
      title={total > 0 ? `Exporting ${group(total)} issues` : 'Exporting'}
      subtitle={repo}
      footerLeft={
        <Dk><span className="sub">
          writing to a temp file as it goes &mdash; nothing is held in memory
        </span></Dk>
      }
      footerRight={
        <Dk>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn" onClick={onHide}>Hide</button>
          </span>
        </Dk>
      }
    >
      <Dk>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13.2 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9.6, marginBottom: 7.2 }}>
              <span style={{ flex: 1, height: 7.2, borderRadius: 3.6,
                             background: 'var(--dk-raised)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${pct}%`,
                               background: 'var(--dk-gh)', transition: 'width 200ms ease' }} />
              </span>
              <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--dk-text)' }}>
                {group(done)} / {group(total)}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--dk-muted)' }}>
              {pages > 0 ? `Page ${page} of ${pages}` : 'Counting'}
              {eta && <> &middot; {eta}</>}
            </div>
          </div>

          <div style={{ border: '1px solid var(--dk-border)', borderRadius: 9.6,
                        background: 'var(--dk-panel)', padding: '10.8px 13.2px',
                        display: 'flex', flexDirection: 'column', gap: 4.8 }}>
            <div className="why-row pass">
              <span className="mark">&#10003;</span>
              <div>Issues, labels, assignees, dates &mdash; <b>{group(done)}</b></div>
            </div>
            <div className="why-row pass">
              <span className="mark">&#10003;</span>
              <div>Template fields parsed &mdash; <b>{group(parsed)}</b> of them had headings</div>
            </div>
            {progress.pausedUntil ? (
              <div className="why-row" style={{ color: 'var(--dk-gh)' }}>
                <span className="mark" style={{ color: 'var(--dk-gh)' }}>&rarr;</span>
                <div>Waiting for the rate limit to reset &mdash; nothing is lost</div>
              </div>
            ) : (
              <div className="why-row" style={{ color: 'var(--dk-gh)' }}>
                <span className="mark" style={{ color: 'var(--dk-gh)' }}>&rarr;</span>
                <div>Reading page {page || 1}</div>
              </div>
            )}
            {unparsed > 0 && (
              <div className="why-row fail">
                <span className="mark">&times;</span>
                <div>
                  <b>{group(unparsed)}</b> older issue{unparsed === 1 ? ' has' : 's have'} no
                  parseable body &mdash; exported with those columns empty
                </div>
              </div>
            )}
          </div>

          {rate && (
            <GhNote icon="refresh" style={{ margin: 0, maxWidth: 'none' }}>
              <b>Rate limit: {group(rate.remaining)} of {group(rate.limit)} left.</b> Paged
              at 100 with a pause when the remaining budget drops under 10% &mdash; an export
              that exhausts somebody&rsquo;s hourly limit breaks every other tool they use for
              the next fifty minutes.
            </GhNote>
          )}

          <GhNote icon="check" style={{ margin: 0, maxWidth: 'none' }}>
            Runs in the background. You can close this and keep using the board; the file
            appears when it is done.
          </GhNote>
        </div>
      </Dk>
    </ModalView>
  );
}
