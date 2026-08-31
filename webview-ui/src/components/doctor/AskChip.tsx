/**
 * The small "ask about this" control.
 *
 * One component because it appears on a finding card, a suspect row and a
 * jargon term, and three hand-rolled versions drifted apart within a day of
 * each other being written.
 */
import { SparkleIcon } from '../../icons';

const AI_ACCENT = 'var(--color-protocol-ai)';

export function AskChip({ label = 'Ask AI', onClick, title }: {
  label?: string; onClick: () => void; title?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title ?? 'Explain this using the numbers on screen'}
      className="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer shrink-0"
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        color: AI_ACCENT,
        background: `color-mix(in srgb, ${AI_ACCENT} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${AI_ACCENT} 38%, transparent)`,
      }}
    >
      <SparkleIcon size={10} color={AI_ACCENT} />
      {label}
    </button>
  );
}
