/**
 * The ribbon's hover card: what a band or a tick stands for.
 *
 * Its own file so the log view carries only where the card goes — which is
 * the part that was wrong (see `hoverCardPlacement`) — and not the words in
 * it, which change for reasons that have nothing to do with a split pane.
 */
import { formatLogTime, type DensityBucket, type RibbonTick, type MatchedLine } from './log-view';

/** How wide the ribbon's hover card is, when the pane has the room. */
export const HOVER_CARD_W = 200;

/** What a band or a tick stands for, in the card beside it. */
export function RibbonHover({ bucket, tick, lines }: { bucket?: DensityBucket; tick?: RibbonTick; lines: MatchedLine[] }) {
  if (tick) {
    const ts = lines[tick.startIndex]?.ts;
    const color = tick.level === 'error' ? 'var(--color-error)' : 'var(--color-warning)';
    return (
      <>
        <span style={{ color, fontWeight: 600 }}>
          {tick.count} {tick.level === 'error' ? 'error' : 'warning'}{tick.count === 1 ? '' : 's'} here
        </span>
        {ts !== undefined && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLogTime(ts)}</span>}
        <span style={{ color: 'var(--color-text-muted)' }}>Click to go to it</span>
      </>
    );
  }
  if (!bucket) return null;
  if (!bucket.count) {
    return <span style={{ color: 'var(--color-text-muted)' }}>Nothing logged in this slice</span>;
  }
  return (
    <>
      <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
        {bucket.count.toLocaleString()} line{bucket.count === 1 ? '' : 's'}
      </span>
      {(bucket.errors > 0 || bucket.warns > 0) && (
        <span>
          {bucket.errors > 0 && <span style={{ color: 'var(--color-error)' }}>{bucket.errors} error{bucket.errors === 1 ? '' : 's'}</span>}
          {bucket.errors > 0 && bucket.warns > 0 && ' · '}
          {bucket.warns > 0 && <span style={{ color: 'var(--color-warning)' }}>{bucket.warns} warning{bucket.warns === 1 ? '' : 's'}</span>}
        </span>
      )}
      {bucket.fromTs !== undefined && (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatLogTime(bucket.fromTs)}{bucket.toTs !== undefined && bucket.toTs !== bucket.fromTs ? ` – ${formatLogTime(bucket.toTs)}` : ''}
        </span>
      )}
    </>
  );
}
