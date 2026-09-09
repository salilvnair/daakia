/**
 * Screen 09D — manage views.
 *
 * Five views is a tab bar; fifteen is a mess. Reorder, pin the one that should
 * open by default, hide a preset, delete the rest.
 *
 * **Delete confirms in the row, not in another dialog.** A second modal over a
 * modal is where people stop reading and click through; a row that turns red
 * with the view's own name and count still in front of you is the same
 * protection without the ceremony.
 *
 * The five built-in presets can be hidden but never deleted. They are not the
 * reader's to throw away, and they come back with Restore presets.
 */
import { useState } from 'react';
import { BadgeChipView, ButtonView, ModalView } from '@salilvnair/dui';
import {
  ArrowUpIcon, ArrowDownIcon, EyeIcon, EyeOffIcon, PinIcon, TrashIcon, SettingsIcon,
} from '../../icons';
import { presetViews, type SavedView, type StoredViews } from './views-model';
import { ACCENT } from './types';

export function GhManageViews({ open, stored, counts, onClose, onChange }: {
  open: boolean;
  stored: StoredViews;
  counts: Map<string, number>;
  onClose: () => void;
  onChange: (next: StoredViews) => void;
}) {
  /** The row currently asking to be confirmed. One at a time. */
  const [confirming, setConfirming] = useState<string | undefined>();

  const order = stored.order ?? stored.views.map(v => v.id);
  const rank = new Map(order.map((id, at) => [id, at]));
  const rows = [...stored.views].sort(
    (a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999),
  );
  const hidden = rows.filter(v => v.hidden).length;

  const move = (id: string, by: -1 | 1) => {
    const ids = rows.map(v => v.id);
    const at = ids.indexOf(id);
    const to = at + by;
    if (at < 0 || to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to], ids[at]];
    onChange({ ...stored, order: ids });
  };

  const patch = (id: string, change: Partial<SavedView>) => onChange({
    ...stored,
    views: stored.views.map(v => (v.id === id ? { ...v, ...change } : v)),
  });

  const remove = (id: string) => {
    setConfirming(undefined);
    onChange({
      ...stored,
      views: stored.views.filter(v => v.id !== id),
      defaultId: stored.defaultId === id ? undefined : stored.defaultId,
    });
  };

  const restore = () => {
    const byId = new Map(stored.views.map(v => [v.id, v]));
    for (const p of presetViews()) byId.set(p.id, { ...(byId.get(p.id) ?? p), hidden: false });
    onChange({ ...stored, views: [...byId.values()] });
  };

  return (
    <ModalView
      open={open}
      onClose={onClose}
      size="md"
      headerGradient
      headerColor={ACCENT}
      headerIcon={<SettingsIcon size={14} />}
      title="Manage views"
      footerLeft={
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          {rows.length} view{rows.length === 1 ? '' : 's'}
          {hidden > 0 ? ` · ${hidden} hidden` : ''}
        </span>
      }
      footerRight={
        <span className="flex items-center gap-2">
          {hidden > 0 && (
            <ButtonView size="sm" accentColor="var(--color-text-muted)" onClick={restore}>
              Restore presets
            </ButtonView>
          )}
          <ButtonView size="sm" variant="primary" accentColor={ACCENT} onClick={onClose}>
            Done
          </ButtonView>
        </span>
      }
    >
      <div className="rounded-lg border flex flex-col overflow-hidden"
           style={{ borderColor: 'var(--color-surface-border)' }}>
        {rows.map((v, at) => {
          const isConfirming = confirming === v.id;
          return (
            <div
              key={v.id}
              className="flex items-center gap-2 px-2.5 py-1.5"
              style={{
                opacity: v.hidden ? 0.5 : 1,
                background: isConfirming
                  ? 'color-mix(in srgb, var(--color-error) 14%, transparent)'
                  : 'transparent',
                borderTop: at === 0 ? 'none'
                  : '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)',
              }}
            >
              <span style={{ fontSize: 12 }}>{v.icon ?? '•'}</span>
              <span className="text-[11px]" style={{ color: 'var(--color-text-primary)' }}>
                {v.name}
              </span>
              {counts.get(v.id) !== undefined && (
                <BadgeChipView tone="var(--color-text-muted)" size="xs">
                  {counts.get(v.id)}
                </BadgeChipView>
              )}
              {stored.defaultId === v.id && (
                <BadgeChipView tone={ACCENT} size="xs">default</BadgeChipView>
              )}
              {v.preset && (
                <BadgeChipView tone="var(--color-text-muted)" size="xs">preset</BadgeChipView>
              )}
              <span className="flex-1" />

              {isConfirming ? (
                <>
                  {/*
                    The confirmation lives here, with the name and the count
                    still visible. Nothing about this view leaves the screen in
                    order to ask about it.
                  */}
                  <span className="text-[10px]" style={{ color: 'var(--color-error)' }}>
                    Delete this view?
                  </span>
                  <ButtonView size="sm" accentColor="var(--color-text-muted)"
                              onClick={() => setConfirming(undefined)}>
                    Keep
                  </ButtonView>
                  <ButtonView size="sm" variant="danger" accentColor="var(--color-error)"
                              onClick={() => remove(v.id)}>
                    Delete
                  </ButtonView>
                </>
              ) : (
                <>
                  <Tiny label="Move up" disabled={at === 0} onClick={() => move(v.id, -1)}>
                    <ArrowUpIcon size={10} />
                  </Tiny>
                  <Tiny label="Move down" disabled={at === rows.length - 1}
                        onClick={() => move(v.id, 1)}>
                    <ArrowDownIcon size={10} />
                  </Tiny>
                  <Tiny
                    label={stored.defaultId === v.id ? 'Stop opening on this' : 'Open on this'}
                    onClick={() => onChange({
                      ...stored,
                      defaultId: stored.defaultId === v.id ? undefined : v.id,
                    })}
                  >
                    <PinIcon size={10} />
                  </Tiny>
                  <Tiny label={v.hidden ? 'Show' : 'Hide'}
                        onClick={() => patch(v.id, { hidden: !v.hidden })}>
                    {v.hidden ? <EyeIcon size={10} /> : <EyeOffIcon size={10} />}
                  </Tiny>
                  <Tiny
                    label={v.preset
                      ? 'A preset can be hidden, never deleted — Restore brings it back'
                      : 'Delete'}
                    disabled={v.preset}
                    onClick={() => setConfirming(v.id)}
                  >
                    <TrashIcon size={10} />
                  </Tiny>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-[10px] mt-2.5" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
        Deleting a view deletes a saved filter, never an issue. The five built-in presets can be
        hidden but not deleted.
      </div>
    </ModalView>
  );
}

function Tiny({ label, disabled, onClick, children }: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex items-center justify-center rounded"
      style={{
        width: 18, height: 18,
        background: 'transparent',
        border: 'none',
        color: 'var(--color-text-muted)',
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
