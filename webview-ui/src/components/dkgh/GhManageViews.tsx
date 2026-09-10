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
import { ModalView } from '@salilvnair/dui';
import {
  ArrowUpIcon, ArrowDownIcon, EyeIcon, EyeOffIcon, PinIcon, TrashIcon, SettingsIcon,
} from '../../icons';
import { Dk } from './GhShell';
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
        <Dk><span className="sub">
          {rows.length} view{rows.length === 1 ? '' : 's'}
          {hidden > 0 ? ` · ${hidden} hidden` : ''}
        </span></Dk>
      }
      footerRight={
        <Dk>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            {hidden > 0 && (
              <button type="button" className="btn" onClick={restore}>Restore presets</button>
            )}
            <button type="button" className="btn go" onClick={onClose}>Done</button>
          </span>
        </Dk>
      }
    >
      <Dk>
      <div className="vlist" style={{ border: '1px solid var(--dk-border)', borderRadius: 9.6,
                                      overflow: 'hidden' }}>
        {rows.map((v, at) => {
          const isConfirming = confirming === v.id;
          return (
            <div
              key={v.id}
              className="vrow"
              style={{
                opacity: v.hidden ? 0.5 : 1,
                background: isConfirming
                  ? 'color-mix(in srgb, var(--dk-red) 14%, transparent)'
                  : 'transparent',
              }}
            >
              <span style={{ fontSize: 16.8 }}>{v.icon ?? '•'}</span>
              <span>{v.name}</span>
              {counts.get(v.id) !== undefined && (
                <span className="cx">{counts.get(v.id)}</span>
              )}
              {stored.defaultId === v.id && <span className="chip c-gh">default</span>}
              {v.preset && <span className="chip">preset</span>}
              <span className="sp" />

              {isConfirming ? (
                <>
                  {/*
                    The confirmation lives here, with the name and the count
                    still visible. Nothing about this view leaves the screen in
                    order to ask about it.
                  */}
                  <span className="sub" style={{ color: 'var(--dk-red)' }}>
                    Delete this view?
                  </span>
                  <button type="button" className="btn"
                          onClick={() => setConfirming(undefined)}>
                    Keep
                  </button>
                  <button type="button" className="btn stop"
                          onClick={() => remove(v.id)}>
                    Delete
                  </button>
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

      <div className="sub" style={{ marginTop: 10 }}>
        Deleting a view deletes a saved filter, never an issue. The five built-in presets can be
        hidden but not deleted.
      </div>
      </Dk>
    </ModalView>
  );
}

/** One of the row's small verbs. The title is the only label it gets. */
function Tiny({ label, disabled, onClick, children }: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className="t" title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
