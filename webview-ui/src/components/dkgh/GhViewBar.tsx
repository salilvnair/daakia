/**
 * Screen 09 — the view bar, and 09B under it.
 *
 * A filter you rebuild every Monday is a filter you stop using. Views are
 * named, counted and reorderable, and the per-view menu is deliberately the
 * shape people already know from GitHub Projects — rename, duplicate, delete,
 * chart, export — because a familiar menu in an unfamiliar tool is one less
 * thing to learn. **Copy query** is the addition, and it is the one place the
 * query language earns its keep: a view is a string, so sending a colleague
 * your exact filter is a paste into chat rather than a screenshot with an arrow
 * drawn on it.
 *
 * The bar underneath is 09B, and it is the real usability problem with saved
 * views: you open one, tweak a filter to check something, and the tool has to
 * decide whether you meant to change it. Getting that wrong either loses saved
 * work or nags constantly.
 *
 * So: **nothing is saved until you say so**, the diff is stated in words, and
 * the three ways out are in escalating order of commitment with the destructive
 * one furthest from where the cursor rests. Navigating away keeps the modified
 * state; only Reset discards it.
 */
import { useState } from 'react';
import { BadgeChipView, ButtonView } from '@salilvnair/dui';
import {
  PlusIcon, MoreHorizontalIcon, RenameIcon, DuplicateIcon, CopyIcon,
  ChartBarIcon, DownloadIcon, TrashIcon, ShareIcon, SettingsIcon,
} from '../../icons';
import { describeDiff, type SavedView, type ViewDiff } from './views-model';
import { ACCENT } from './types';

export type ViewAction =
  | 'rename' | 'duplicate' | 'copy-query' | 'chart' | 'export' | 'share' | 'delete';

export function GhViewBar({
  views, activeId, counts, diff, labels,
  onPick, onNew, onAction, onManage, onReset, onSaveAs, onUpdate,
}: {
  views: SavedView[];
  activeId?: string;
  counts: Map<string, number>;
  /** What has changed since this view was opened, if anything. */
  diff?: ViewDiff;
  labels?: Map<string, string>;
  onPick: (id: string | undefined) => void;
  onNew: () => void;
  onAction: (view: SavedView, action: ViewAction) => void;
  onManage: () => void;
  onReset: () => void;
  onSaveAs: () => void;
  onUpdate: () => void;
}) {
  const active = views.find(v => v.id === activeId);
  const dirty = !!diff?.dirty && !!active;

  return (
    <div className="flex flex-col flex-shrink-0">
      <div className="flex items-center gap-1 px-4 pt-2 pb-1 flex-wrap">
        {views.map(v => (
          <ViewTab
            key={v.id}
            view={v}
            count={counts.get(v.id)}
            active={v.id === activeId}
            dirty={v.id === activeId && dirty}
            onPick={() => onPick(v.id)}
            onAction={a => onAction(v, a)}
          />
        ))}
        <ButtonView size="sm" variant="ghost" accentColor={ACCENT}
                    iconLeft={<PlusIcon size={11} />} onClick={onNew}>
          New view
        </ButtonView>
        <span className="flex-1" />
        {activeId && (
          <ButtonView size="sm" variant="ghost" accentColor="var(--color-text-muted)"
                      onClick={() => onPick(undefined)}>
            No view
          </ButtonView>
        )}
        <ButtonView size="sm" variant="ghost" accentColor="var(--color-text-muted)"
                    iconLeft={<SettingsIcon size={11} />} onClick={onManage}>
          Manage
        </ButtonView>
      </div>

      {dirty && active && (
        <div className="flex items-center gap-2 px-4 py-1.5 flex-wrap"
             style={{
               background: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
               borderTop: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
               borderBottom: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
             }}>
          <span className="text-[10.5px]" style={{ color: 'var(--color-text-primary)' }}>
            <b>You have changed this view.</b>{' '}
            <span style={{ color: 'var(--color-text-muted)' }}>
              {describeDiff(diff!, labels)}
            </span>
          </span>
          <span className="flex-1" />
          {/*
            Escalating order of commitment, and the destructive one furthest
            from where the cursor rests. Reset is the only thing here that
            throws work away, so it is the one that has to be reached for.
          */}
          <ButtonView size="sm" variant="ghost" accentColor="var(--color-text-muted)"
                      onClick={onReset}>
            Reset to saved
          </ButtonView>
          <ButtonView size="sm" accentColor={ACCENT} onClick={onSaveAs}>
            Save as new view
          </ButtonView>
          <ButtonView size="sm" variant="primary" accentColor={ACCENT} onClick={onUpdate}>
            Update “{active.name}”
          </ButtonView>
        </div>
      )}
    </div>
  );
}

/** One tab, with its count and its menu. */
function ViewTab({ view, count, active, dirty, onPick, onAction }: {
  view: SavedView;
  count?: number;
  active: boolean;
  dirty: boolean;
  onPick: () => void;
  onAction: (action: ViewAction) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span style={{ position: 'relative' }} className="inline-flex items-center">
      <button
        type="button"
        onClick={onPick}
        className="flex items-center gap-1.5 px-2 py-1 rounded-l cursor-pointer"
        style={{
          background: active ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'transparent',
          border: `1px solid ${active ? `color-mix(in srgb, ${ACCENT} 45%, transparent)`
            : 'var(--color-surface-border)'}`,
          borderRight: 'none',
          color: active ? ACCENT : 'var(--color-text-secondary)',
          fontSize: 10.5,
        }}
      >
        {view.icon && <span>{view.icon}</span>}
        {view.name}
        {/* The dot, so a changed view is legible from the bar rather than only
            from the sentence under it. */}
        {dirty && (
          <span style={{ width: 5, height: 5, borderRadius: 5,
                         background: 'var(--color-warning)' }} />
        )}
        {count !== undefined && (
          <BadgeChipView tone={active ? ACCENT : 'var(--color-text-muted)'} size="xs">
            {count}
          </BadgeChipView>
        )}
      </button>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Rename, duplicate, chart, share, delete"
        className="flex items-center px-1 py-1 rounded-r cursor-pointer"
        style={{
          background: active ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'transparent',
          border: `1px solid ${active ? `color-mix(in srgb, ${ACCENT} 45%, transparent)`
            : 'var(--color-surface-border)'}`,
          color: 'var(--color-text-muted)',
        }}
      >
        <MoreHorizontalIcon size={10} />
      </button>

      {open && (
        <>
          <span className="fixed inset-0" style={{ zIndex: 20 }} onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-1 rounded-lg border py-1 flex flex-col"
               style={{
                 top: '100%',
                 zIndex: 21,
                 minWidth: 172,
                 borderColor: 'var(--color-surface-border)',
                 background: 'var(--color-surface)',
                 boxShadow: '0 8px 22px rgba(0,0,0,.35)',
               }}>
            <Item icon={<RenameIcon size={11} />} onClick={() => { setOpen(false); onAction('rename'); }}>
              Rename view
            </Item>
            <Item icon={<DuplicateIcon size={11} />} onClick={() => { setOpen(false); onAction('duplicate'); }}>
              Duplicate view
            </Item>
            <Item icon={<CopyIcon size={11} />} onClick={() => { setOpen(false); onAction('copy-query'); }}>
              Copy query
            </Item>
            <Item icon={<ShareIcon size={11} />} onClick={() => { setOpen(false); onAction('share'); }}>
              Share view
            </Item>
            <Item icon={<ChartBarIcon size={11} />} onClick={() => { setOpen(false); onAction('chart'); }}>
              Generate chart
            </Item>
            <Item icon={<DownloadIcon size={11} />} onClick={() => { setOpen(false); onAction('export'); }}>
              Export view data
            </Item>
            <span style={{ height: 1, background: 'var(--color-surface-border)', margin: '3px 0' }} />
            <Item
              icon={<TrashIcon size={11} />}
              tone={view.preset ? 'var(--color-text-muted)' : 'var(--color-error)'}
              onClick={() => { setOpen(false); onAction('delete'); }}
            >
              {/* A preset can be hidden but never deleted — it is not the
                  reader's to throw away, and it comes back on Restore. */}
              {view.preset ? 'Hide this preset' : 'Delete view'}
            </Item>
          </div>
        </>
      )}
    </span>
  );
}

function Item({ icon, tone, onClick, children }: {
  icon: React.ReactNode;
  tone?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-2.5 py-1 text-left text-[10.5px] cursor-pointer"
      style={{ background: 'transparent', border: 'none',
               color: tone ?? 'var(--color-text-secondary)' }}
    >
      {icon}
      {children}
    </button>
  );
}
