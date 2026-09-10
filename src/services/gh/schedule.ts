/**
 * The export that runs every Friday — screen 15E.
 *
 * A status report is a recurring chore, and a chore that needs a human to
 * remember it is a chore that gets skipped in the week it mattered.
 *
 * **It writes a file. It does not send anything.** No email, no webhook, no
 * upload. Sending on somebody's behalf is a different kind of permission and
 * dkgh does not ask for it — the file appears, and they attach it.
 *
 * **The filename carries the date it was *for*, not the date it ran.** This is
 * the rule the whole thing rests on. A scheduled report that silently skips a
 * week is worse than none, and one that runs late while pretending to be on
 * time is worse still: a Monday catch-up named `2026-09-14` would be read as
 * Monday's numbers when it is Friday's report arriving late. So a missed run
 * is caught up on the next launch, under the date it should have had.
 *
 * **It runs when VS Code is open.** There is no daemon and this file does not
 * pretend there is one. `due()` is asked on launch and on a timer; anything it
 * returns is a run that was owed.
 */

/** How often. The three the mock offers, and nothing else. */
export type Every = 'daily' | 'weekly' | 'fortnightly';

/** What it produces. Both can be on. */
export type Produces = 'xlsx' | 'pdf';

export interface Schedule {
  /** The repository this belongs to. */
  repo: string;
  /** The saved view it exports, by name. */
  view: string;
  every: Every;
  /** 0–6, Sunday first, as `Date#getDay` counts. Ignored when `every` is daily. */
  weekday: number;
  /** Minutes past local midnight. `16:00` is 960. */
  minute: number;
  produces: Produces[];
  /** Where the files go. */
  folder: string;
  /**
   * The last occurrence that has actually been written, as `YYYY-MM-DD`.
   *
   * A date rather than a timestamp, because what matters is which *report* has
   * been produced. Two runs on the same Friday are one report.
   */
  lastRunFor?: string;
  /** Off without being forgotten. */
  paused?: boolean;
}

const DAY = 86_400_000;

/*
  Spelled out rather than taken from `toLocaleString`.

  ICU renders September as "Sept" in en-GB and "Sep" in en-US, and which one a
  machine gives depends on its Node build. A filename and a footer that read
  differently on two laptops is the kind of difference nobody can explain, so
  the three-letter forms are written down.
*/
export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/** `2026-09-11`, in local time — the same day the reader is looking at. */
export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** `16:00` from 960. */
export function clock(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 960 from `16:00`. Anything unparseable stays where it was. */
export function minuteOf(text: string, fallback = 960): number {
  const m = /^\s*(\d{1,2})\s*:\s*(\d{2})\s*$/.exec(text);
  if (!m) return fallback;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return fallback;
  return h * 60 + mm;
}

/** That day, at the scheduled minute, in local time. */
function at(day: Date, minute: number): Date {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  d.setMinutes(minute);
  return d;
}

/**
 * The first occurrence at or after `from`.
 *
 * Fortnightly is anchored to the ISO epoch rather than to when the schedule was
 * made, so "every other Friday" means the same Fridays on every machine that
 * reads the same schedule — an anchor of "whenever you pressed Schedule" makes
 * two people with the same settings get different weeks.
 */
export function nextRun(s: Schedule, from: Date): Date {
  if (s.every === 'daily') {
    const today = at(from, s.minute);
    return today > from ? today : at(new Date(from.getTime() + DAY), s.minute);
  }

  const step = s.every === 'fortnightly' ? 14 : 7;
  /* Walk forward to the next matching weekday, then on to a matching week. */
  for (let i = 0; i <= step * 2; i++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    if (day.getDay() !== s.weekday) continue;
    if (s.every === 'fortnightly' && weekIndex(day) % 2 !== 0) continue;
    const when = at(day, s.minute);
    if (when > from) return when;
  }
  /* Unreachable for any weekday in 0–6; a schedule with a nonsense weekday
     gets tomorrow rather than an exception. */
  return at(new Date(from.getTime() + DAY), s.minute);
}

/** Whole weeks since the epoch, for the fortnightly anchor. */
export function weekIndex(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / (DAY * 7));
}

/**
 * The most recent occurrence at or before `now`.
 *
 * This is what a catch-up is named after. Walking backwards rather than
 * forwards is the whole point: on a Monday launch after a missed Friday, this
 * returns Friday.
 */
export function lastOccurrence(s: Schedule, now: Date): Date | undefined {
  for (let i = 0; i <= 31; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    if (s.every !== 'daily') {
      if (day.getDay() !== s.weekday) continue;
      if (s.every === 'fortnightly' && weekIndex(day) % 2 !== 0) continue;
    }
    const when = at(day, s.minute);
    if (when <= now) return when;
  }
  return undefined;
}

/**
 * The run that is owed, if any.
 *
 * Returns the date the report is *for*, not the moment it is being produced.
 * A schedule that has never run is owed its most recent occurrence — which
 * means turning one on at 17:00 on a Friday produces that Friday's report
 * immediately, which is what somebody who just set it up is expecting.
 */
export function due(s: Schedule, now: Date): Date | undefined {
  if (s.paused) return undefined;
  const last = lastOccurrence(s, now);
  if (!last) return undefined;
  if (s.lastRunFor && s.lastRunFor >= isoDay(last)) return undefined;
  return last;
}

/**
 * What the file is called.
 *
 * `dk-gh — this sprint — 2026-09-11.xlsx`. The em dashes and the spaces are
 * the mock's; the date is the occurrence, never the wall clock.
 */
export function scheduledName(s: Schedule, forDay: Date, ext: string): string {
  const view = s.view.trim() || 'all';
  return `dk-gh — ${safe(view)} — ${isoDay(forDay)}.${ext}`;
}

/** Anything a filesystem would refuse, out. Spaces stay: the mock has them. */
export function safe(text: string): string {
  return text.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

/**
 * `dk-gh — this sprint — 2026-09-11 (2).xlsx` when the first one is there.
 *
 * Nothing is overwritten. A catch-up that replaced last Friday's file would
 * destroy the report somebody is in the middle of reading.
 */
export function unclashed(name: string, taken: (n: string) => boolean): string {
  if (!taken(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; i < 100; i++) {
    const tryName = `${stem} (${i})${ext}`;
    if (!taken(tryName)) return tryName;
  }
  return `${stem} (${Date.now()})${ext}`;
}

/** "Friday 11 Sep, 16:00" — the footer's own sentence. */
export function whenNext(s: Schedule, from: Date): string {
  const d = nextRun(s, from);
  const month = MONTHS[d.getMonth()];
  const day = s.every === 'daily' ? '' : `${WEEKDAYS[d.getDay()]} `;
  return `${day}${d.getDate()} ${month}, ${clock(s.minute)}`;
}
