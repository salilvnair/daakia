/**
 * Screen 15E — the export that runs every Friday.
 *
 * The status report is a recurring chore, and a chore that needs a human to
 * remember it is a chore that gets skipped in the week it mattered.
 *
 * **It writes a file. It does not send anything.** No email, no webhook, no
 * upload. Sending on somebody's behalf is a different kind of permission and
 * dkgh does not ask for it — the file appears, and they attach it.
 *
 * **The filename carries the date it was for.** A scheduled report that
 * silently skips a week is worse than none, and one that runs late while
 * pretending to be on time is worse still — so a Monday catch-up is named for
 * the Friday it belongs to, and nothing is ever overwritten.
 *
 * The clock is the host's. This screen is where somebody says what they want
 * and reads back when it will next happen; `schedule.ts` decides when that is.
 */
import { useMemo, useState } from 'react';
import { ModalView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { Ico } from './GhIcons';
import { Dk, GhNote } from './GhShell';
import { ACCENT } from './types';

export type Every = 'daily' | 'weekly' | 'fortnightly';
export type Produces = 'xlsx' | 'pdf';

export interface Schedule {
  repo: string;
  view: string;
  every: Every;
  weekday: number;
  minute: number;
  produces: Produces[];
  folder: string;
  lastRunFor?: string;
  paused?: boolean;
}

/** Mirrors `services/gh/schedule.ts`, which is where the real ones live. */
export const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];
export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function clock(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function minuteOf(text: string, fallback = 960): number {
  const m = /^\s*(\d{1,2})\s*:\s*(\d{2})\s*$/.exec(text);
  if (!m) return fallback;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return fallback;
  return h * 60 + mm;
}

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    + `-${String(d.getDate()).padStart(2, '0')}`;
}

/** The footer's sentence. Kept in step with `whenNext` in the host's copy. */
export function whenNext(s: Schedule, from: Date): string {
  const at = (day: Date) => {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    d.setMinutes(s.minute);
    return d;
  };
  if (s.every === 'daily') {
    const today = at(from);
    const d = today > from ? today : at(new Date(from.getTime() + 86_400_000));
    return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${clock(s.minute)}`;
  }
  for (let i = 0; i <= 28; i++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    if (day.getDay() !== s.weekday) continue;
    if (s.every === 'fortnightly'
      && Math.floor(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())
        / (86_400_000 * 7)) % 2 !== 0) continue;
    const when = at(day);
    if (when > from) {
      return `${WEEKDAYS[when.getDay()]} ${when.getDate()} ${MONTHS[when.getMonth()]}`
        + `, ${clock(s.minute)}`;
    }
  }
  return clock(s.minute);
}

/**
 * The name the file will actually get.
 *
 * Built the way `filenameForDay` builds it — from the repository, not from a
 * fixed `dk-gh`. A preview showing a different name from the one that appears
 * in the folder is worse than no preview.
 */
export function exampleName(repo: string, view: string, ext: string, on: Date): string {
  const stem = [repo.split('/')[1] || repo, view, isoDay(on)]
    .map(part => part.trim())
    .filter(Boolean)
    .join(' — ');
  return `${stem.replace(/[\\/:*?"<>|]/g, '-')}.${ext}`;
}

const EVERY: { id: Every; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'fortnightly', label: 'Fortnightly' },
];

export function GhSchedule({ repo, view, count, existing, onCancel, onSaved }: {
  repo: string;
  /** The view it exports. A schedule is a saved question, not a saved file. */
  view: string;
  /** What that view holds right now, for the line beside its name. */
  count: number;
  existing?: Schedule;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [every, setEvery] = useState<Every>(existing?.every ?? 'weekly');
  const [weekday, setWeekday] = useState(existing?.weekday ?? 5);
  const [time, setTime] = useState(clock(existing?.minute ?? 960));
  const [produces, setProduces] = useState<Produces[]>(existing?.produces ?? ['xlsx']);
  const [folder, setFolder] = useState(existing?.folder ?? '');

  const minute = minuteOf(time, existing?.minute ?? 960);
  const zone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'this machine',
    [],
  );

  const draft: Schedule = {
    repo, view, every, weekday, minute, produces, folder,
    lastRunFor: existing?.lastRunFor,
  };
  const ready = folder.trim().length > 0 && produces.length > 0;

  const toggle = (p: Produces) => setProduces(prev => (
    prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
  ));

  return (
    <ModalView
      open
      onClose={onCancel}
      size="md"
      headerGradient
      headerColor={ACCENT}
      headerIcon={<Ico name="cal" />}
      title="Scheduled export"
      subtitle={repo}
      footerLeft={
        <Dk><span className="sub">
          {ready ? `next: ${whenNext(draft, new Date())}` : 'choose a folder and a format'}
        </span></Dk>
      }
      footerRight={
        <Dk>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            {existing && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  postMsg({ type: 'dkgh:schedule:delete', repo, view });
                  onSaved();
                }}
              >
                Stop this one
              </button>
            )}
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
            <button
              type="button"
              className="btn go"
              disabled={!ready}
              onClick={() => {
                postMsg({ type: 'dkgh:schedule:save', schedule: draft });
                onSaved();
              }}
            >
              Schedule
            </button>
          </span>
        </Dk>
      }
    >
      <Dk>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13.2 }}>
          <div className="fieldrow">
            <span className="fl">From the view</span>
            <div className="inp" style={{ display: 'flex', alignItems: 'center', gap: 8.4 }}>
              <Ico name="tl" style={{ width: 14.4, height: 14.4, color: 'var(--dk-gh)' }} />
              {view}
              <span style={{ color: 'var(--dk-faint)', fontSize: 12 }}>
                &middot; {count} issue{count === 1 ? '' : 's'} right now
              </span>
            </div>
          </div>

          <div className="fieldrow">
            <span className="fl">When</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {EVERY.map(e => (
                <button
                  key={e.id}
                  type="button"
                  className={`btn${every === e.id ? ' go' : ''}`}
                  style={{ padding: '4.8px 12px' }}
                  onClick={() => setEvery(e.id)}
                >
                  {e.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
              {every !== 'daily' && (
                <select
                  className="inp"
                  style={{ padding: '4.8px 10.8px', fontSize: 12.6 }}
                  value={weekday}
                  onChange={e => setWeekday(Number(e.target.value))}
                >
                  {WEEKDAYS.map((w, at) => <option key={w} value={at}>{w}</option>)}
                </select>
              )}
              <input
                className="inp"
                style={{ padding: '4.8px 10.8px', fontSize: 12.6, width: 84 }}
                value={time}
                onChange={e => setTime(e.target.value)}
                aria-label="Time of day"
              />
              <span style={{ fontSize: 12, color: 'var(--dk-faint)' }}>{zone}</span>
            </div>
          </div>

          <div className="fieldrow">
            <span className="fl">Produces</span>
            <div style={{ display: 'flex', gap: 7.2 }}>
              <button
                type="button"
                className={`btn${produces.includes('xlsx') ? ' go' : ''}`}
                style={{ padding: '4.8px 12px' }}
                onClick={() => toggle('xlsx')}
              >
                <Ico name="xls" />Excel
              </button>
              <button
                type="button"
                className={`btn${produces.includes('pdf') ? ' go' : ''}`}
                style={{ padding: '4.8px 12px' }}
                onClick={() => toggle('pdf')}
              >
                <Ico name="pdf" />PDF
              </button>
            </div>
          </div>

          <div className="fieldrow">
            <span className="fl">Puts them in</span>
            <input
              className="inp"
              style={{ fontFamily: 'var(--mono)', fontSize: 12.6 }}
              value={folder}
              /* An expression rather than an attribute string: JSX takes a
                 backslash in an attribute literally, so the escaped ones
                 rendered doubled. */
              placeholder={'C:\\Users\\you\\Reports\\dk-gh\\'}
              onChange={e => setFolder(e.target.value)}
              aria-label="Folder"
            />
            <div style={{ fontSize: 11.4, color: 'var(--dk-faint)' }}>
              Named <code>{exampleName(repo, view, produces[0] ?? 'xlsx', new Date())}</code>.
              Nothing is overwritten.
            </div>
          </div>

          <GhNote icon="warn" style={{ margin: 0, maxWidth: 'none' }}>
            <b>It writes a file. It does not send anything.</b> No email, no webhook, no
            upload &mdash; sending on your behalf is a different kind of permission and dkgh
            does not ask for it. The file appears, you attach it.
          </GhNote>

          <GhNote icon="refresh" style={{ margin: 0, maxWidth: 'none' }}>
            <b>It runs while this tab is open</b>, and catches up the next time you open it
            if it missed one &mdash; with the date it <i>would</i> have run in the filename,
            so a Monday catch-up is not mistaken for Friday&rsquo;s numbers.
          </GhNote>
        </div>
      </Dk>
    </ModalView>
  );
}
