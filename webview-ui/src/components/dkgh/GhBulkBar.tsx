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
import { Ico, type IcoName } from './GhIcons';
import type { EditRequest } from './edit-flow';
import type { RepoMeta } from './types';

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
         style={{ background: 'color-mix(in srgb, var(--dk-gh) 8%, var(--dk-panel))' }}>
      {/* The filter panel's own tick, so a selection reads the same
          everywhere on the board. */}
      <span className="fct on" style={{ padding: 0, background: 'transparent', cursor: 'pointer' }}
            onClick={onClear}>
        <span className="bx"><Ico name="check" /></span>
      </span>
      <span style={{ fontSize: 13.2, fontWeight: 500, color: 'var(--dk-text)' }}>
        {selected.length} selected
      </span>
      <span className="sub">
        of {total} · <Link onClick={onSelectAll}>select all</Link>
        {' · '}
        <Link onClick={onClear}>clear</Link>
      </span>
      <span className="sp" style={{ flex: 1 }} />
      <Picker
        label="Assign"
        auto={autoOpen === 'assign'}
        onAuto={onAutoOpened}
        icon="person"
        options={(meta?.assignees ?? []).map(a => ({ value: a, avatar: true }))}
        empty="Nobody on this repository can be assigned — or listing them needs a permission this account lacks."
        onPick={v => onPropose({ repo, numbers: selected, addAssignees: [v] })}
      />
      <Picker
        label="Label"
        auto={autoOpen === 'label'}
        onAuto={onAutoOpened}
        icon="tag"
        /*
          The colour and the description are the repository's own, straight off
          `gh label list` — a label list without them is nine grey words, and
          the colour is how people actually recognise the one they mean. The
          description is the half nobody remembers: `wontfix` and `invalid`
          differ by a sentence somebody wrote once.
        */
        options={(meta?.labels ?? []).map(l => ({
          value: l.name,
          colour: hexOf(l.color),
          note: l.description,
        }))}
        empty="This repository has no labels."
        onPick={v => onPropose({ repo, numbers: selected, addLabels: [v] })}
      />
      <Picker
        label="Milestone"
        auto={autoOpen === 'milestone'}
        onAuto={onAutoOpened}
        icon="milestone"
        options={(meta?.milestones ?? []).map(m => ({ value: m.title }))}
        empty="This repository has no open milestones."
        onPick={v => onPropose({ repo, numbers: selected, milestone: v })}
      />
      <button type="button" className="btn ok"
              onClick={() => onPropose({
                repo, numbers: selected, state: 'close', closeReason: 'completed',
              })}>
        <Ico name="closed" />Close
      </button>
    </div>
  );
}

/** A verb inside a sentence. The mock's own inline link. */
function Link({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="textlink" onMouseDown={e => e.preventDefault()}>
      {children}
    </button>
  );
}

/** GitHub gives a label's colour as bare hex; CSS wants the hash. */
function hexOf(colour?: string): string | undefined {
  if (!colour) return undefined;
  return colour.startsWith('#') ? colour : `#${colour}`;
}

/** One row of a picker — the name, and whatever else is known about it. */
export interface PickOption {
  value: string;
  /** A label's own colour, as the repository set it. */
  colour?: string;
  /** The sentence somebody wrote when they made it. */
  note?: string;
  /** Draw the initial in a circle, for a person. */
  avatar?: boolean;
}

/**
 * A short list, opened from a button.
 *
 * It used to take plain strings and draw them as plain strings, which threw
 * away everything `gh` had already said about each one — a label's colour and
 * its description, both fetched, both dropped on the floor. A list of nine grey
 * words is a list you read; a list of nine coloured labels is one you point at.
 */
function Picker({ label, icon, options, empty, auto, onAuto, onPick }: {
  label: string;
  icon: IcoName;
  options: PickOption[];
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
  /* The description is searched too: somebody looking for the "not planned"
     one does not necessarily remember it is spelled `wontfix`. */
  const q = filter.trim().toLowerCase();
  const shown = options
    .filter(o => !q || o.value.toLowerCase().includes(q) || (o.note ?? '').toLowerCase().includes(q))
    .slice(0, 40);

  return (
    <span style={{ position: 'relative' }}>
      <button type="button" className="btn"
              onClick={() => { setOpen(o => !o); setFilter(''); }}>
        <Ico name={icon} />{label}
      </button>
      {open && (
        <>
          <span className="fixed inset-0" style={{ zIndex: 20 }} onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 flex flex-col"
               style={{
                 zIndex: 21,
                 width: 268,
                 maxHeight: 300,
                 borderRadius: 9.6,
                 border: '1px solid var(--dk-border)',
                 background: 'var(--dk-surface)',
                 boxShadow: '0 10px 28px rgba(0,0,0,.45)',
                 overflow: 'hidden',
                 paddingBottom: 4,
               }}>
            {/*
              The same search field the filter rails use — a box inset from the
              menu's own gutter with the magnifier in it, not a bare input
              stretched wall to wall. Flush to the edge it squared off the two
              top corners the menu had just rounded, and there was nothing
              about it that said it could be typed into.
            */}
            {options.length > 6 && (
              <div className="panelsearch" style={{ margin: '8px 8px 6px' }}>
                <Ico name="search" />
                <input
                  autoFocus
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
                  placeholder={`Search ${label.toLowerCase()}s…`}
                />
                <span className="n">{shown.length}</span>
              </div>
            )}
            <div className="overflow-y-auto flex flex-col py-1">
              {options.length === 0 ? (
                <span className="sub" style={{ padding: '8px 10px' }}>{empty}</span>
              ) : shown.length === 0 ? (
                <span className="sub" style={{ padding: '8px 10px' }}>
                  Nothing matches &ldquo;{filter}&rdquo;.
                </span>
              ) : shown.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { setOpen(false); onPick(o.value); }}
                  className="pick-row text-left cursor-pointer flex items-start gap-2"
                >
                  {o.colour && (
                    <span
                      className="shrink-0 rounded-full"
                      style={{
                        width: 10, height: 10, marginTop: 3, background: o.colour,
                        /* A label the repository set to near-black or near-white
                           still has to be visible on this surface. */
                        boxShadow: '0 0 0 1px color-mix(in srgb, var(--dk-text) 25%, transparent)',
                      }}
                    />
                  )}
                  {o.avatar && (
                    <span className="shrink-0 rounded-full grid place-items-center"
                          style={{
                            width: 16, height: 16, marginTop: 0, fontSize: 10.8, fontWeight: 700,
                            color: 'var(--dk-gh)',
                            background: 'color-mix(in srgb, var(--dk-gh) 20%, transparent)',
                          }}>
                      {o.value[0]?.toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex flex-col">
                    <span className="truncate" style={{ color: 'var(--dk-text)' }}>
                      {o.value}
                    </span>
                    {o.note && (
                      <span className="sub" style={{ lineHeight: 1.4 }}>{o.note}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </span>
  );
}
