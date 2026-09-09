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
import { ButtonView, CheckboxView, ModalView, BadgeChipView } from '@salilvnair/dui';
import { SaveIcon } from '../../icons';
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
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          {now.filters.terms.length} filter{now.filters.terms.length === 1 ? '' : 's'} ·{' '}
          {matches} issue{matches === 1 ? '' : 's'} match right now
        </span>
      }
      footerRight={
        <span className="flex items-center gap-2">
          <ButtonView size="sm" accentColor="var(--color-text-muted)" onClick={onCancel}>
            Cancel
          </ButtonView>
          <ButtonView size="sm" variant="primary" accentColor={ACCENT}
                      disabled={!name.trim()}
                      onClick={() => onSave(name.trim(), icon, parts)}>
            {existing ? 'Update view' : 'Save view'}
          </ButtonView>
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[9.5px] font-bold uppercase tracking-[.09em]"
                style={{ color: 'var(--color-text-muted)' }}>
            Name
          </span>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="PROD fires"
            className="text-[11px] px-2 py-1.5 rounded"
            style={{
              background: 'var(--color-panel)',
              border: '1px solid var(--color-surface-border)',
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-[9.5px] font-bold uppercase tracking-[.09em]"
                style={{ color: 'var(--color-text-muted)' }}>
            Icon
          </span>
          <div className="flex gap-1 flex-wrap">
            {ICONS.map(i => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                className="cursor-pointer rounded"
                style={{
                  width: 24, height: 24, fontSize: 13,
                  background: icon === i
                    ? `color-mix(in srgb, ${ACCENT} 18%, transparent)` : 'transparent',
                  border: `1px solid ${icon === i
                    ? `color-mix(in srgb, ${ACCENT} 50%, transparent)`
                    : 'var(--color-surface-border)'}`,
                }}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[9.5px] font-bold uppercase tracking-[.09em]"
                style={{ color: 'var(--color-text-muted)' }}>
            This view will remember
          </span>
          <div className="rounded-lg border flex flex-col"
               style={{ borderColor: 'var(--color-surface-border)',
                        background: 'var(--color-panel)' }}>
            {CAPTURE_PARTS.map(({ key, label }, at) => {
              const value = describeCapture(now, key);
              /* Columns on a card layout would freeze a list the view never
                 shows, so the row says so rather than offering a dead tick. */
              const inert = key === 'columns' && now.layout.view !== 'table';
              return (
                <label
                  key={key}
                  className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer"
                  style={{
                    opacity: inert ? 0.55 : 1,
                    borderTop: at === 0 ? 'none'
                      : '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)',
                  }}
                >
                  <CheckboxView
                    checked={parts.has(key) && !inert}
                    disabled={inert}
                    onChange={() => toggle(key)}
                    accentColor={ACCENT}
                    size="sm"
                  />
                  <span className="text-[10.5px]" style={{ color: 'var(--color-text-primary)' }}>
                    {label}
                  </span>
                  <span className="flex-1" />
                  {/* The value, not just the name — that is what makes this
                      checkable rather than a guess. */}
                  <BadgeChipView tone="var(--color-text-muted)" size="xs">{value}</BadgeChipView>
                </label>
              );
            })}
          </div>
        </div>

        <div className="text-[10px] rounded-lg px-2.5 py-2"
             style={{
               color: 'var(--color-text-muted)',
               lineHeight: 1.6,
               border: '1px solid var(--color-surface-border)',
               background: `color-mix(in srgb, ${ACCENT} 5%, transparent)`,
             }}>
          <b style={{ color: 'var(--color-text-primary)' }}>Views are yours.</b> They are stored
          on this machine, against this repository — nothing is written to the repository itself.
          To give somebody this view, use <b style={{ color: 'var(--color-text-primary)' }}>Copy
          query</b> and they paste it.
        </div>
      </div>
    </ModalView>
  );
}
