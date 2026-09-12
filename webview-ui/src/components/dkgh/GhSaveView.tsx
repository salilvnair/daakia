/**
 * Screen 09A — save a view, and see exactly what it captures.
 *
 * The usual bug with saved views is that people assume they hold the filters
 * and are surprised when the grouping comes back too — or does not. So the
 * dialog lists everything it is about to capture, **with the current value
 * beside each**, and lets you drop any of it.
 *
 * "Grouping — Module" is checkable in a way that "Grouping" is not, because you
 * can see what you would be committing to. Columns is off by default on a card
 * layout, since it would capture nothing useful there, and turns itself on when
 * the view is saved from the table.
 */
import { useEffect, useState } from 'react';
import { ModalView } from '@salilvnair/dui';
import { SaveIcon } from '../../icons';
import { Ico } from './GhIcons';
import { Dk, GhNote } from './GhShell';
import {
  CAPTURE_PARTS, describeCapture, type BoardSnapshot, type CapturePart, type SavedView,
} from './views-model';
import { ACCENT } from './types';

/** A short row of icons, so a bar of views is scannable rather than a list. */
const ICONS = ['📋', '🔥', '🕸️', '🙋', '🏃', '✅', '🐞', '📦', '⏰', '🚧'];

export function GhSaveView({ open, now, existing, matches, onCancel, onSave }: {
  open: boolean;
  now: BoardSnapshot;
  /** Set when updating rather than creating, so the dialog says so. */
  existing?: SavedView;
  /** How many issues the filter matches right now — the footer's reassurance. */
  matches: number;
  onCancel: () => void;
  onSave: (name: string, icon: string, parts: Set<CapturePart>) => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [parts, setParts] = useState<Set<CapturePart>>(new Set());

  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? '');
    setIcon(existing?.icon ?? ICONS[0]);
    /*
      Filters, grouping and sort by default; layout and search text off, and
      columns off unless this is a table — capturing a column arrangement from
      a card board freezes a list the view will never show.
    */
    setParts(new Set<CapturePart>([
      'filters', 'grouping', 'sort',
      ...(now.layout.view === 'table' ? (['columns'] as CapturePart[]) : []),
    ]));
  }, [open, existing, now.layout.view]);

  const toggle = (key: CapturePart) => setParts(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <ModalView
      open={open}
      onClose={onCancel}
      size="md"
      headerGradient
      headerColor={ACCENT}
      headerIcon={<SaveIcon size={14} />}
      title={existing ? `Update “${existing.name}”` : 'Save as a view'}
      footerLeft={
        <Dk>
          <span className="sub">
            {now.filters.terms.length} filter{now.filters.terms.length === 1 ? '' : 's'} ·{' '}
            {matches} issue{matches === 1 ? '' : 's'} match right now
          </span>
        </Dk>
      }
      footerRight={
        <Dk>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn go" disabled={!name.trim()}
                    onClick={() => onSave(name.trim(), icon, parts)}>
              {existing ? 'Update view' : 'Save view'}
            </button>
          </span>
        </Dk>
      }
    >
      <Dk>
      <div className="flex flex-col gap-3">
        <div className="fieldrow">
          <label className="fl" htmlFor="dkgh-view-name">Name</label>
          <input
            id="dkgh-view-name"
            className="inp"
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="PROD fires"
          />
        </div>

        <div className="fieldrow">
          <span className="fl">Icon</span>
          <div className="picks">
            {ICONS.map(i => (
              <span
                key={i}
                role="button"
                tabIndex={0}
                className={icon === i ? 'on' : undefined}
                style={{ cursor: 'pointer', fontSize: 15.6 }}
                onClick={() => setIcon(i)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setIcon(i); }}
              >
                {i}
              </span>
            ))}
          </div>
        </div>

        <div className="fieldrow">
          <span className="fl">This view will remember</span>
          <div className="opt" style={{ gap: 2, padding: 4 }}>
            {CAPTURE_PARTS.map(({ key, label }) => {
              const value = describeCapture(now, key);
              /* Columns on a card layout would freeze a list the view never
                 shows, so the row says so rather than offering a dead tick. */
              const inert = key === 'columns' && now.layout.view !== 'table';
              const on = parts.has(key) && !inert;
              return (
                <div
                  key={key}
                  className={`fct${on ? ' on' : ''}`}
                  style={{ opacity: inert ? 0.55 : 1, cursor: inert ? 'default' : 'pointer' }}
                  onClick={() => { if (!inert) toggle(key); }}
                >
                  <span className="bx">{on && <Ico name="check" />}</span>
                  {label}
                  {/* The value, not just the name — that is what makes this
                      checkable rather than a guess. */}
                  <span className="n">{value}</span>
                </div>
              );
            })}
          </div>
        </div>

        <GhNote title="Views are yours" icon="lock" style={{ margin: 0 }}>
          They are stored on this machine, against this repository — nothing is written to the
          repository itself. To give somebody this view, use <b>Copy its query</b> and they
          paste it.
        </GhNote>
      </div>
      </Dk>
    </ModalView>
  );
}
