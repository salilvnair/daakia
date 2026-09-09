/**
 * Screen 04C — select several, act once.
 *
 * Triage is a bulk activity. Assigning three unowned issues one at a time is
 * three page loads on github.com and three round trips of attention.
 *
 * This is the selection and the actions; the confirm strip below it and the
 * per-issue report after are `GhEditConfirm`, shared with the table's inline
 * editor — a bulk assign and a single cell change are the same request with a
 * different number of issues in it, so they take the same path. See
 * `edit-flow.ts`.
 *
 * The values in each menu come from the repository — see `services/gh/meta.ts`
 * — rather than from a text field, because GitHub refuses a label or an
 * assignee that does not exist and that refusal arrives after the confirm
 * screen, which is the worst possible moment to learn you typed a name wrong.
 *
 * The selection survives a filter change and does not survive a repository
 * switch. Picking three PROD issues, switching to DEV to check something and
 * coming back should not cost you the selection; the other repository's issues
 * are different issues entirely.
 */
import { useEffect, useState } from 'react';
import { ButtonView, CheckboxView } from '@salilvnair/dui';
import { UsersIcon, TagIcon, LayersIcon, CheckCircleIcon } from '../../icons';
import type { EditRequest } from './edit-flow';
import { ACCENT, type RepoMeta } from './types';

export function GhBulkBar({
  repo, selected, total, meta, autoOpen, onAutoOpened, onSelectAll, onClear, onPropose,
}: {
  repo: string;
  selected: number[];
  /** How many are on the board right now, for "3 of 12". */
  total: number;
  meta?: RepoMeta;
  /**
   * A key asked for this menu — screen 05D's `a`, `l` and `m`.
   *
   * The keystroke selects and opens the list; it never picks a value. Guessing
   * which assignee somebody meant from a single letter is how the wrong person
   * gets three issues.
   */
  autoOpen?: 'assign' | 'label' | 'milestone';
  onAutoOpened: () => void;
  onSelectAll: () => void;
  onClear: () => void;
  onPropose: (request: EditRequest) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 flex-wrap flex-shrink-0"
         style={{ background: `color-mix(in srgb, ${ACCENT} 8%, var(--color-panel))` }}>
      <CheckboxView checked accentColor={ACCENT} size="sm" onChange={onClear} />
      <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
        {selected.length} selected
      </span>
      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
        of {total} · <Link onClick={onSelectAll}>select all</Link>
        {' · '}
        <Link onClick={onClear}>clear</Link>
      </span>
      <span className="flex-1" />
      <Picker
        label="Assign"
        auto={autoOpen === 'assign'}
        onAuto={onAutoOpened}
        icon={<UsersIcon size={11} />}
        options={meta?.assignees ?? []}
        empty="Nobody on this repository can be assigned — or listing them needs a permission this account lacks."
        onPick={v => onPropose({ repo, numbers: selected, addAssignees: [v] })}
      />
      <Picker
        label="Label"
        auto={autoOpen === 'label'}
        onAuto={onAutoOpened}
        icon={<TagIcon size={11} />}
        options={(meta?.labels ?? []).map(l => l.name)}
        empty="This repository has no labels."
        onPick={v => onPropose({ repo, numbers: selected, addLabels: [v] })}
      />
      <Picker
        label="Milestone"
        auto={autoOpen === 'milestone'}
        onAuto={onAutoOpened}
        icon={<LayersIcon size={11} />}
        options={(meta?.milestones ?? []).map(m => m.title)}
        empty="This repository has no open milestones."
        onPick={v => onPropose({ repo, numbers: selected, milestone: v })}
      />
      <ButtonView size="sm" accentColor="var(--color-success)"
                  iconLeft={<CheckCircleIcon size={11} />}
                  onClick={() => onPropose({
                    repo, numbers: selected, state: 'close', closeReason: 'completed',
                  })}>
        Close
      </ButtonView>
    </div>
  );
}

function Link({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="cursor-pointer"
            style={{ background: 'none', border: 'none', color: ACCENT, padding: 0 }}>
      {children}
    </button>
  );
}

/** A short list, opened from a button. Filterable once it stops being short. */
function Picker({ label, icon, options, empty, auto, onAuto, onPick }: {
  label: string;
  icon: React.ReactNode;
  options: string[];
  empty: string;
  auto?: boolean;
  onAuto?: () => void;
  onPick: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!auto) return;
    setOpen(true);
    setFilter('');
    onAuto?.();
  }, [auto, onAuto]);
  const shown = options.filter(o => o.toLowerCase().includes(filter.toLowerCase())).slice(0, 40);

  return (
    <span style={{ position: 'relative' }}>
      <ButtonView size="sm" accentColor={ACCENT} iconLeft={icon}
                  onClick={() => { setOpen(o => !o); setFilter(''); }}>
        {label}
      </ButtonView>
      {open && (
        <>
          <span className="fixed inset-0" style={{ zIndex: 20 }} onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 rounded-lg border flex flex-col"
               style={{
                 zIndex: 21,
                 width: 210,
                 maxHeight: 260,
                 borderColor: 'var(--color-surface-border)',
                 background: 'var(--color-surface)',
                 boxShadow: '0 8px 22px rgba(0,0,0,.35)',
               }}>
            {options.length > 8 && (
              <input
                autoFocus
                value={filter}
                onChange={e => setFilter(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
                placeholder={`Filter ${label.toLowerCase()}s`}
                className="text-[10.5px] px-2 py-1.5"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--color-surface-border)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
            )}
            <div className="overflow-y-auto flex flex-col py-1">
              {options.length === 0 ? (
                <span className="px-2.5 py-2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  {empty}
                </span>
              ) : shown.length === 0 ? (
                <span className="px-2.5 py-2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  Nothing matches &ldquo;{filter}&rdquo;.
                </span>
              ) : shown.map(o => (
                <button
                  key={o}
                  type="button"
                  onClick={() => { setOpen(false); onPick(o); }}
                  className="text-left px-2.5 py-1 text-[10.5px] cursor-pointer"
                  style={{ background: 'transparent', border: 'none',
                           color: 'var(--color-text-secondary)' }}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </span>
  );
}
