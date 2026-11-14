/**
 * The small pieces of the scratchpad screens that are worth testing on their
 * own: "2 min ago", and Format for the types that have a formatter.
 */
import { formatJsonWithTemplates } from '../../services/template/format-json';
import { prettyXml } from '../k8s/log-payload';
import type { ScratchpadType } from '../../store/scratchpad-store';

/** When a scratchpad was last written, the way a person says it. */
export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 14) return 'last week';
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The types Format can do. YAML, SQL and text have no formatter here, so they get no button. */
export function canFormat(type: ScratchpadType): boolean {
  return type === 'json' || type === 'xml';
}

/**
 * The text formatted, or `null` when it would not survive it — JSON that does
 * not parse is left exactly as typed rather than mangled.
 */
export function formatScratchpad(type: ScratchpadType, text: string): string | null {
  if (!text.trim()) return null;
  if (type === 'json') return formatJsonWithTemplates(text);
  if (type === 'xml') return prettyXml(text).join('\n');
  return null;
}
