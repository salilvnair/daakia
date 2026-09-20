/**
 * What each thing in the filter looks like — its icon and its colour.
 *
 * ── Why the colours are not decoration ──
 *
 * A filter panel is scanned, not read. Fifteen grey rows with a number on the
 * end all look alike, and finding "5XX" in them means reading every label.
 * Given the colour the app already uses for a 5xx — the same red as the status
 * chip on the row it will match — the eye lands on it without reading anything.
 *
 * So every colour here is one the reader has already learnt somewhere else:
 * methods take `METHOD_COLORS`, exactly as the request rows below do; protocols
 * take `getProtocolAccent`, as the sidebar headers do; and the status buckets
 * take the semantic tokens the response panel uses. Nothing invents a hue.
 *
 * ── Why the icons are in one table ──
 *
 * A tab, its facets and the conditions it offers all say the same thing —
 * "this is about headers" — and they should say it with the same mark. Spread
 * across three components they drifted within a day of being written.
 */
import {
  BracesIcon, CheckCircleIcon, ClockIcon, CollectionsFolderIcon, DisconnectIcon,
  DotIcon, FileTextIcon, FolderIcon, FolderPlusIcon, GaugeIcon, KeyIcon, LinkIcon,
  LockIcon, NetworkIcon, RowsIcon, SendIcon, ShieldIcon, TerminalIcon,
  WarningTriangleIcon, XCircleIcon, ArrowUpRightIcon,
} from '../../../icons';
import { METHOD_COLORS, getProtocolAccent } from '../../../colors';
import type { ConditionField, TermField } from '../../../services/history-filter/filter-model';

const SIZE = 11;

/** The mark for a whole area of the request — used by tabs, headings and rows. */
export const AREA_ICONS: Record<string, React.ReactNode> = {
  request: <SendIcon size={SIZE} color="currentColor" />,
  headers: <RowsIcon size={SIZE} color="currentColor" />,
  body: <BracesIcon size={SIZE} color="currentColor" />,
  auth: <LockIcon size={SIZE} color="currentColor" />,
  scripts: <TerminalIcon size={SIZE} color="currentColor" />,
};

/** The colour each tab's mark takes, so the strip is readable at a glance. */
export const AREA_TONES: Record<string, string> = {
  request: 'var(--color-info)',
  headers: 'var(--color-filter-field)',
  body: 'var(--color-filter-value)',
  auth: 'var(--color-warning)',
  scripts: 'var(--color-protocol-ai)',
};

/** The heading mark for each facet. */
export const FACET_ICONS: Partial<Record<TermField, React.ReactNode>> = {
  method: <SendIcon size={SIZE} color="currentColor" />,
  status: <GaugeIcon size={SIZE} color="currentColor" />,
  saved: <CollectionsFolderIcon size={SIZE} color="currentColor" />,
  when: <ClockIcon size={SIZE} color="currentColor" />,
  protocol: <NetworkIcon size={SIZE} color="currentColor" />,
  auth: <ShieldIcon size={SIZE} color="currentColor" />,
  has: <BracesIcon size={SIZE} color="currentColor" />,
};

/**
 * Which status bucket wears which colour and mark.
 *
 * `error` is grey rather than red on purpose: a request that never reached the
 * server is not the server failing, and giving it the 5xx red would make two
 * genuinely different problems look like one.
 */
const STATUS_LOOK: Record<string, { tone: string; icon: React.ReactNode }> = {
  '2xx': { tone: 'var(--color-success)', icon: <CheckCircleIcon size={SIZE} color="currentColor" /> },
  '3xx': { tone: 'var(--color-info)', icon: <ArrowUpRightIcon size={SIZE} color="currentColor" /> },
  '4xx': { tone: 'var(--color-warning)', icon: <WarningTriangleIcon size={SIZE} color="currentColor" /> },
  '5xx': { tone: 'var(--color-error)', icon: <XCircleIcon size={SIZE} color="currentColor" /> },
  error: { tone: 'var(--color-text-muted)', icon: <DisconnectIcon size={SIZE} color="currentColor" /> },
};

const SAVED_LOOK: Record<string, { tone: string; icon: React.ReactNode }> = {
  yes: { tone: 'var(--color-success)', icon: <FolderIcon size={SIZE} color="currentColor" /> },
  no: { tone: 'var(--color-warning)', icon: <FolderPlusIcon size={SIZE} color="currentColor" /> },
};

const HAS_LOOK: Record<string, { tone: string; icon: React.ReactNode }> = {
  body: { tone: 'var(--color-filter-value)', icon: <FileTextIcon size={SIZE} color="currentColor" /> },
  json: { tone: 'var(--color-filter-field)', icon: <BracesIcon size={SIZE} color="currentColor" /> },
  prescript: { tone: 'var(--color-protocol-ai)', icon: <TerminalIcon size={SIZE} color="currentColor" /> },
  postscript: { tone: 'var(--color-info)', icon: <TerminalIcon size={SIZE} color="currentColor" /> },
  script: { tone: 'var(--color-protocol-ai)', icon: <TerminalIcon size={SIZE} color="currentColor" /> },
  secret: { tone: 'var(--color-error)', icon: <KeyIcon size={SIZE} color="currentColor" /> },
  response: { tone: 'var(--color-success)', icon: <FileTextIcon size={SIZE} color="currentColor" /> },
};

export interface ValueLook {
  tone: string;
  icon: React.ReactNode;
}

const NEUTRAL: ValueLook = {
  tone: 'var(--color-text-secondary)',
  icon: <DotIcon size={SIZE} color="currentColor" />,
};

/**
 * How one facet value is drawn.
 *
 * Falls back to a plain dot rather than to nothing, so a value this table has
 * not heard of — a protocol added later, an auth type from a plugin — still
 * lines up in the icon column with everything above it.
 */
export function lookOf(field: TermField, value: string): ValueLook {
  if (field === 'method') {
    const tone = METHOD_COLORS[value.toUpperCase()];
    return tone ? { tone, icon: <DotIcon size={SIZE} color="currentColor" /> } : NEUTRAL;
  }
  if (field === 'status') return STATUS_LOOK[value] ?? NEUTRAL;
  if (field === 'saved') return SAVED_LOOK[value] ?? NEUTRAL;
  if (field === 'has') return HAS_LOOK[value] ?? NEUTRAL;
  if (field === 'when') {
    return { tone: 'var(--color-info)', icon: <ClockIcon size={SIZE} color="currentColor" /> };
  }
  if (field === 'protocol') {
    /* `getProtocolAccent` only knows the protocols it was written for; anything
       else keeps the neutral tone rather than being mis-coloured as REST. */
    const tone = getProtocolAccent(value as never);
    return { tone: tone || NEUTRAL.tone, icon: <DotIcon size={SIZE} color="currentColor" /> };
  }
  if (field === 'auth') {
    return value === 'none'
      ? NEUTRAL
      : { tone: 'var(--color-warning)', icon: <KeyIcon size={SIZE} color="currentColor" /> };
  }
  return NEUTRAL;
}

/** The mark and colour on each "add a condition" button. */
export const CONDITION_LOOK: Record<ConditionField, ValueLook> = {
  url: { tone: 'var(--color-info)', icon: <LinkIcon size={10} color="currentColor" /> },
  header: { tone: 'var(--color-filter-field)', icon: <RowsIcon size={10} color="currentColor" /> },
  resheader: { tone: 'var(--color-success)', icon: <RowsIcon size={10} color="currentColor" /> },
  body: { tone: 'var(--color-filter-value)', icon: <FileTextIcon size={10} color="currentColor" /> },
  resbody: { tone: 'var(--color-success)', icon: <FileTextIcon size={10} color="currentColor" /> },
  json: { tone: 'var(--color-filter-field)', icon: <BracesIcon size={10} color="currentColor" /> },
  resjson: { tone: 'var(--color-success)', icon: <BracesIcon size={10} color="currentColor" /> },
  script: { tone: 'var(--color-protocol-ai)', icon: <TerminalIcon size={10} color="currentColor" /> },
  authfield: { tone: 'var(--color-warning)', icon: <KeyIcon size={10} color="currentColor" /> },
};
