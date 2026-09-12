/**
 * The window a log search runs over, shared by the search and its export.
 *
 * The presets only ever reach backwards from now, which answers "what is
 * happening" but not "what happened". An incident that ended on the 5th cannot
 * be named by any number of "last 6h" — by the time you are looking, the window
 * has moved past it. So the presets keep their place as the quick answer, and
 * `Between…` takes the two ends directly.
 *
 * One module because the search dialog and its export dialog have to agree.
 * They previously each owned a private copy of the range list, which is how the
 * export came to offer a choice the search did not.
 */
import { SegmentedControlView, DateTimeInputView } from '@salilvnair/dui';

export type WindowKind = 'all' | '30m' | '1h' | '2h' | '6h' | 'between';

export interface TimeWindow {
  kind: WindowKind;
  /**
   * `YYYY-MM-DDTHH:mm` on the reader's own clock.
   *
   * No zone here on purpose. This is the time on the screen of the person
   * choosing it, which their device already knows; the zone that has to be
   * stated is the one the LOG is written in, and that is a property of the
   * log rather than of each search — it lives in the archive settings, next
   * to the mounts it describes.
   */
  from: string;
  to: string;
}

const RANGE_SECONDS: Record<string, number> = {
  '30m': 1800, '1h': 3600, '2h': 7200, '6h': 21600,
};

const LABEL: Record<WindowKind, string> = {
  all: 'All time', '30m': 'Last 30m', '1h': 'Last 1h',
  '2h': 'Last 2h', '6h': 'Last 6h', between: 'Between\u2026',
};

/** `datetime-local` wants `YYYY-MM-DDTHH:mm`, in local time. */
export function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** An hour back to now, so opening `Between…` starts somewhere real. */
export function defaultWindow(): TimeWindow {
  const now = new Date();
  return {
    kind: 'all',
    from: localInputValue(new Date(now.getTime() - 3600_000)),
    to: localInputValue(now),
  };
}

/**
 * The window as the search engine takes it.
 *
 * A preset stays relative — `--since=1h` means an hour before the search runs,
 * which is what someone watching a live pod means by it. `Between…` resolves to
 * absolute milliseconds, because both of its ends are fixed points.
 */
export function windowOptions(w: TimeWindow): {
  sinceSeconds?: number; fromMs?: number; toMs?: number;
} {
  if (w.kind === 'all') return {};
  if (w.kind !== 'between') return { sinceSeconds: RANGE_SECONDS[w.kind] };
  // `Date.parse` of a zoneless reading uses the device's own zone, which is
  // exactly what these two fields mean.
  const fromMs = Date.parse(w.from);
  const toMs = Date.parse(w.to);
  return {
    fromMs: Number.isNaN(fromMs) ? undefined : fromMs,
    // Through the end of the chosen minute, so picking 09:05 includes 09:05:59
    // rather than only its first instant.
    toMs: Number.isNaN(toMs) ? undefined : toMs + 59_999,
  };
}

/** Why this window cannot be searched, when it cannot. */
export function windowError(w: TimeWindow): string | undefined {
  if (w.kind !== 'between') return undefined;
  const from = Date.parse(w.from);
  const to = Date.parse(w.to);
  if (Number.isNaN(from) || Number.isNaN(to)) return 'Both ends of the range need a date and time.';
  if (from > to) return 'The end of the range is before its start.';
  return undefined;
}

/** One line describing what will be read, for the hint under the control. */
export function describeWindow(w: TimeWindow): string {
  if (w.kind === 'all') {
    return 'Everything the pod still holds. Kubernetes rotates this, so it is not forever.';
  }
  if (w.kind !== 'between') return `Only lines from the ${LABEL[w.kind].toLowerCase()}.`;
  return windowError(w)
    ?? 'Only lines timestamped inside this window, at either end of it inclusive.';
}

export function TimeWindowPicker({ value, onChange, size = 'md', accent }: {
  value: TimeWindow;
  onChange: (w: TimeWindow) => void;
  size?: 'sm' | 'md';
  accent: string;
}) {
  return (
    // One row: the two dates are part of the same choice as the preset beside
    // them, and stacking them read as a separate setting that had appeared.
    <div className="flex items-center gap-2 flex-wrap">
      <SegmentedControlView
        value={value.kind}
        onChange={k => onChange({ ...value, kind: k as WindowKind })}
        options={(Object.keys(LABEL) as WindowKind[]).map(k => ({ value: k, label: LABEL[k] }))}
        size={size} density="compact" accentColor={accent}
      />
      {/* Shown only when it applies. Two date fields greyed out beside a preset
          are noise, and greyed-out controls read as broken rather than as
          inapplicable. */}
      {value.kind === 'between' && (
        <div className="dk8s-window-dates flex items-center gap-2 flex-wrap">
          {/* The two controls stand side by side and have to end level.
              A compact segmented control settles at 26px whatever size it is
              given, while the date field is 24 at `sm` and 28 at `md` — no
              combination of the two components' own sizes lines them up, so
              the row pins the height and the field fills it. */}
          <DateTimeInputView
            value={value.from} onChange={v => onChange({ ...value, from: v })}
            size="sm" color={accent}
          />
          <span className="text-[11px] text-[var(--color-text-muted)]">to</span>
          <DateTimeInputView
            value={value.to} onChange={v => onChange({ ...value, to: v })}
            size="sm" color={accent}
          />
        </div>
      )}
    </div>
  );
}
