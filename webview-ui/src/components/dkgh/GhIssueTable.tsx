/**
 * Screen 05 — the table, and 05B through 05E with it.
 *
 * The same issues as rows, dense enough to scan a hundred. This is also the
 * shape the export writes: what is in these columns is what lands in the
 * spreadsheet, in this order.
 *
 * It is built here rather than on the shared `DataTableView` because the four
 * things this table has to do are the four that one deliberately does not:
 *
 * - **A long title wraps; it is never cut.** The shared table clips every cell
 *   to one line with an ellipsis, which lands exactly where the sentence was
 *   about to say the useful part. That row is taller than the others and that
 *   is correct. Dense tightens the padding, not the content.
 * - **Two-level sort.** "Urgent first, and within that oldest first" is how a
 *   lead reads a backlog, and it is two sorts. One click sets the primary,
 *   shift-click adds the tiebreak, and the header numbers say which is which —
 *   two arrows without an order is a table you cannot trust.
 * - **Pinned identity columns.** `#` and `Title` stay while the rest scrolls
 *   sideways, so at row 190 of 214 you can still tell which row the amber value
 *   is in. The header stays too.
 * - **Rows are virtualised past about sixty.** 214 issues is one `gh issue
 *   list`; 214 rows of DOM is not.
 *
 * Sorting and filtering happen over the full set, never over what is on screen.
 *
 * On the virtualisation, honestly: rows are not a fixed height, because titles
 * wrap. So the spacers above and below the rendered window are sized from a
 * running average of the rows actually measured, which makes the scrollbar
 * accurate to within a row or two rather than exact, and converges as you
 * scroll. The alternative — a fixed row height — buys an exact thumb by cutting
 * the titles, which is the trade this screen exists to refuse.
 */
import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AvatarView, BadgeChipView, CheckboxView } from '@salilvnair/dui';
import { ArrowUpIcon, ArrowDownIcon } from '../../icons';
import { DENSITY_PAD, type Density, type SortLevel } from './board-prefs';
import {
  QUIET_DAYS, rankOf, type BoardIssue, type Group, type ProposedDimension,
} from './board-types';
import { arrange, catalogue, type TableColumn } from './table-columns';
import { sinceIso } from './format';
import type { SearchHit } from './filter-model';
import { fromMap } from './field-colour';
import { ACCENT, type RepoMeta } from './types';

/** Past this many rows, only what fits plus a margin is rendered. */
const VIRTUALISE_ABOVE = 60;

/** Rows kept beyond the viewport on each side, so scrolling never shows a gap. */
const OVERSCAN = 10;

/** Until anything has been measured, this is what a row is assumed to cost. */
const ASSUMED_ROW = 30;

type Row =
  | { kind: 'header'; key: string; group: Group }
  | { kind: 'issue'; key: string; issue: BoardIssue };

export function GhIssueTable({
  groups, showGroups, dimensions, columns, density, wrapTitles, sort, onSort,
  selected, onToggle, onOpen, cursor, meta, onEdit, pending, hits, colours, renderHeader,
}: {
  groups: Group[];
  showGroups: boolean;
  dimensions: ProposedDimension[];
  /** The columns that are on, in the order they were arranged. */
  columns: string[];
  density: Density;
  wrapTitles: boolean;
  sort: SortLevel[];
  onSort: (next: SortLevel[]) => void;
  selected: Set<number>;
  onToggle: (issue: BoardIssue, mods: { ctrl: boolean; shift: boolean }) => void;
  onOpen: (issue: BoardIssue) => void;
  cursor?: number;
  meta?: RepoMeta;
  /** A cell was changed — the caller shows the command and runs it. */
  onEdit: (issue: BoardIssue, field: 'assignee' | 'milestone', value: string) => void;
  /** Issues with a write in flight: which field, and what the cell now claims. */
  pending: Map<number, { field: string; value: string }>;
  /** Where the search matched, per issue — screen 08C. */
  hits?: Map<number, SearchHit>;
  /** Each dimension value's colour, by its index in its own dropdown. */
  colours: Map<string, string>;
  /** The group header, drawn by the board so both views agree on it. */
  renderHeader: (group: Group) => React.ReactNode;
}) {
  const cols = useMemo(
    () => arrange(catalogue(dimensions), columns),
    [dimensions, columns],
  );

  /* One flat list, headers included, so the window can be taken over the whole
     thing rather than per group. Sorting stays inside each group, which is what
     grouping meant. */
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const g of groups) {
      if (showGroups) out.push({ kind: 'header', key: `h:${g.key}`, group: g });
      for (const i of sortIssues(g.issues, sort, cols, dimensions)) {
        out.push({ kind: 'issue', key: `i:${i.number}`, issue: i });
      }
    }
    return out;
  }, [groups, showGroups, sort, cols, dimensions]);

  const { scrollRef, start, end, padTop, padBottom, measure } = useWindow(rows.length);

  const template = cols
    .map(c => `${c.width}px`)
    .join(' ')
    /* The last column absorbs the slack, so a narrow set of columns does not
       leave a ragged strip of background down the right of every row. */
    .replace(/(\d+px)$/, 'minmax($1, 1fr)');

  /* Where each pinned column starts, for `position: sticky`. Cumulative,
     because the second pinned column has to clear the first. */
  const offsets = new Map<string, number>();
  let run = 0;
  for (const c of cols) {
    if (!c.pinned) break;
    offsets.set(c.key, run);
    run += c.width;
  }

  const pad = DENSITY_PAD[density];
  const visible = rows.slice(start, end);

  return (
    <div ref={scrollRef} className="h-full" style={{ overflow: 'auto' }}>
      <div style={{ minWidth: 'max-content' }}>

        {/* The header stays. */}
        <div className="grid"
             style={{
               gridTemplateColumns: template,
               position: 'sticky',
               top: 0,
               zIndex: 3,
               background: 'var(--color-panel)',
               borderBottom: '1px solid var(--color-surface-border)',
             }}>
          {cols.map(c => (
            <HeaderCell key={c.key} col={c} sort={sort} onSort={onSort} pad={pad}
                        left={offsets.get(c.key)} />
          ))}
        </div>

        {padTop > 0 && <div style={{ height: padTop }} />}

        {visible.map((r, i) => r.kind === 'header' ? (
          <div key={r.key}
               ref={el => measure(start + i, el)}
               style={{ padding: '10px 10px 6px' }}>
            {renderHeader(r.group)}
          </div>
        ) : (
          <IssueRow
            key={r.key}
            ref={el => measure(start + i, el)}
            issue={r.issue}
            cols={cols}
            template={template}
            offsets={offsets}
            pad={pad}
            wrapTitles={wrapTitles}
            selected={selected.has(r.issue.number)}
            anySelected={selected.size > 0}
            cursor={cursor === r.issue.number}
            meta={meta}
            pendingValue={pending.get(r.issue.number)}
            hit={hits?.get(r.issue.number)}
            colours={colours}
            onToggle={onToggle}
            onOpen={onOpen}
            onEdit={onEdit}
          />
        ))}

        {padBottom > 0 && <div style={{ height: padBottom }} />}
      </div>
    </div>
  );
}

// ── The window ──────────────────────────────────────────────────────────────

/**
 * Which slice of the rows is worth having in the DOM.
 *
 * Off entirely below sixty rows: a board that fits on two screens gains nothing
 * from windowing and loses the browser's own find-in-page over the whole table.
 */
function useWindow(count: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const heights = useRef<number[]>([]);
  const [avg, setAvg] = useState(ASSUMED_ROW);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    setViewport(el.clientHeight || 600);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  /* A changed row set invalidates every measurement taken against the old one. */
  useEffect(() => { heights.current = []; }, [count]);

  const measure = (index: number, el: HTMLElement | null) => {
    if (!el) return;
    heights.current[index] = el.offsetHeight;
  };

  useLayoutEffect(() => {
    const taken = heights.current.filter(h => h > 0);
    if (taken.length === 0) return;
    const next = taken.reduce((a, b) => a + b, 0) / taken.length;
    /* Only when it has actually moved, or this runs on every paint and the
       spacers twitch by a fraction of a pixel forever. */
    if (Math.abs(next - avg) > 0.75) setAvg(next);
  });

  if (count <= VIRTUALISE_ABOVE) {
    return { scrollRef, start: 0, end: count, padTop: 0, padBottom: 0, measure };
  }

  const rowsInView = Math.ceil(viewport / avg);
  const start = Math.max(0, Math.floor(scrollTop / avg) - OVERSCAN);
  const end = Math.min(count, start + rowsInView + OVERSCAN * 2);
  return {
    scrollRef,
    start,
    end,
    padTop: start * avg,
    padBottom: Math.max(0, (count - end) * avg),
    measure,
  };
}

// ── Sorting ─────────────────────────────────────────────────────────────────

/**
 * Sort, one level at a time, falling through to the next on a tie.
 *
 * **Priority sorts by rank, not alphabetically.** Urgent, High, Medium, Low is
 * the order the form declares, and sorting it as text would put High above Low
 * above Medium above Urgent — wrong in a way that looks plausible enough to go
 * unnoticed. Any single-select sorts by its declared order; see `rankOf`.
 */
export function sortIssues(
  issues: BoardIssue[],
  sort: SortLevel[],
  cols: TableColumn[],
  dimensions: ProposedDimension[],
): BoardIssue[] {
  if (sort.length === 0) return issues;
  const byKey = new Map(cols.map(c => [c.key, c]));
  const optionsOf = new Map(dimensions.map(d => [d.dimension, d.options]));

  return [...issues].sort((a, b) => {
    for (const level of sort) {
      const col = byKey.get(level.key);
      if (!col) continue;
      const cmp = compare(col, optionsOf.get(col.key), a, b);
      if (cmp !== 0) return level.dir === 'asc' ? cmp : -cmp;
    }
    /* A stable last resort, so two issues that tie on every level do not swap
       places on every re-render. */
    return a.number - b.number;
  });
}

function compare(
  col: TableColumn,
  options: string[] | undefined,
  a: BoardIssue,
  b: BoardIssue,
): number {
  const av = col.value(a);
  const bv = col.value(b);
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;

  const as = String(av);
  const bs = String(bv);
  if (options) return rankOf(as, options) - rankOf(bs, options);

  /* An empty cell sorts last in both directions rather than first in one of
     them. "Unassigned" is not the smallest assignee, it is the absence of one. */
  if (!as && !bs) return 0;
  if (!as) return 1;
  if (!bs) return -1;
  return as.localeCompare(bs);
}

/** One click sets the primary; shift-click adds or flips a tiebreak. */
export function nextSort(sort: SortLevel[], key: string, shift: boolean): SortLevel[] {
  const at = sort.findIndex(s => s.key === key);

  if (!shift) {
    if (at === 0) {
      /* Third click on the primary clears it, rather than cycling forever
         between two directions with no way back to the natural order. */
      return sort[0].dir === 'asc' ? [{ key, dir: 'desc' }] : [];
    }
    return [{ key, dir: 'asc' }];
  }

  if (at < 0) return [...sort, { key, dir: 'asc' }];
  const next = [...sort];
  if (next[at].dir === 'asc') next[at] = { key, dir: 'desc' };
  else next.splice(at, 1);
  return next;
}

// ── Cells ───────────────────────────────────────────────────────────────────

function HeaderCell({ col, sort, onSort, pad, left }: {
  col: TableColumn;
  sort: SortLevel[];
  onSort: (next: SortLevel[]) => void;
  pad: string;
  left?: number;
}) {
  const at = sort.findIndex(s => s.key === col.key);
  const level = at >= 0 ? sort[at] : undefined;

  return (
    <button
      type="button"
      onClick={e => onSort(nextSort(sort, col.key, e.shiftKey))}
      title={`Sort by ${col.label} — shift-click to add it as a tiebreak`}
      className="flex items-center gap-1 cursor-pointer text-left"
      style={{
        padding: pad,
        background: 'var(--color-panel)',
        border: 'none',
        borderRight: left !== undefined ? '1px solid var(--color-surface-border)' : undefined,
        position: left !== undefined ? 'sticky' : undefined,
        left,
        zIndex: left !== undefined ? 4 : undefined,
        justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start',
        fontSize: 9.5,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        color: level ? ACCENT : 'var(--color-text-muted)',
      }}
    >
      {col.label}
      {level && (
        <span className="flex items-center" style={{ gap: 1 }}>
          {level.dir === 'asc' ? <ArrowUpIcon size={9} /> : <ArrowDownIcon size={9} />}
          {/* The number, always — a two-level sort you cannot read is one you
              cannot trust, and one arrow alone does not say which came first. */}
          {sort.length > 1 && <span style={{ fontSize: 8 }}>{at + 1}</span>}
        </span>
      )}
    </button>
  );
}

/**
 * One issue.
 *
 * A grid row rather than a `<tr>`, because the pinned columns need
 * `position: sticky` against a horizontally scrolling container and a table
 * cell cannot be made to do that without the layout fighting back.
 */
const IssueRow = forwardRef<HTMLDivElement, {
  issue: BoardIssue;
  cols: TableColumn[];
  template: string;
  offsets: Map<string, number>;
  pad: string;
  wrapTitles: boolean;
  selected: boolean;
  anySelected: boolean;
  cursor: boolean;
  meta?: RepoMeta;
  pendingValue?: { field: string; value: string };
  hit?: SearchHit;
  colours: Map<string, string>;
  onToggle: (issue: BoardIssue, mods: { ctrl: boolean; shift: boolean }) => void;
  onOpen: (issue: BoardIssue) => void;
  onEdit: (issue: BoardIssue, field: 'assignee' | 'milestone', value: string) => void;
}>(function IssueRow({
  issue, cols, template, offsets, pad, wrapTitles, selected, anySelected,
  cursor, meta, pendingValue, hit, colours, onToggle, onOpen, onEdit,
}, ref) {
  const click = (e: React.MouseEvent) => {
    const mods = { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey };
    if (anySelected || mods.ctrl || mods.shift) { onToggle(issue, mods); return; }
    onOpen(issue);
  };

  const ground = selected
    ? `color-mix(in srgb, ${ACCENT} 13%, var(--color-surface))`
    : 'var(--color-surface)';

  return (
    <div
      ref={ref}
      data-issue={issue.number}
      onClick={click}
      className="grid"
      style={{
        gridTemplateColumns: template,
        cursor: 'pointer',
        background: ground,
        borderBottom: '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)',
        outline: cursor ? `1px solid ${ACCENT}` : undefined,
        outlineOffset: -1,
      }}
    >
      {cols.map(c => {
        const left = offsets.get(c.key);
        return (
          <div
            key={c.key}
            style={{
              padding: pad,
              fontSize: 10.5,
              color: 'var(--color-text-secondary)',
              display: 'flex',
              alignItems: c.key === 'title' && wrapTitles ? 'flex-start' : 'center',
              justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start',
              minWidth: 0,
              /* Pinned cells carry the row's own ground, or the columns behind
                 them show through as they scroll underneath. */
              position: left !== undefined ? 'sticky' : undefined,
              left,
              zIndex: left !== undefined ? 2 : undefined,
              background: left !== undefined ? ground : undefined,
              borderRight: left !== undefined
                ? '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)'
                : undefined,
            }}
          >
            <Cell col={c} issue={issue} wrapTitles={wrapTitles} meta={meta}
                  selected={selected} anySelected={anySelected} hit={hit} colours={colours}
                  pendingValue={pendingValue} onToggle={onToggle} onEdit={onEdit} />
          </div>
        );
      })}
    </div>
  );
});

function Cell({
  col, issue, wrapTitles, meta, selected, anySelected, pendingValue, hit, colours,
  onToggle, onEdit,
}: {
  col: TableColumn;
  issue: BoardIssue;
  wrapTitles: boolean;
  meta?: RepoMeta;
  selected: boolean;
  anySelected: boolean;
  pendingValue?: { field: string; value: string };
  hit?: SearchHit;
  colours: Map<string, string>;
  onToggle: (issue: BoardIssue, mods: { ctrl: boolean; shift: boolean }) => void;
  onEdit: (issue: BoardIssue, field: 'assignee' | 'milestone', value: string) => void;
}) {
  const claimed = (field: string) =>
    (pendingValue && pendingValue.field === field ? pendingValue.value : undefined);

  switch (col.key) {
    case 'number':
      return (
        <span className="flex items-center gap-1.5">
          {(anySelected || selected) && (
            <span onClick={e => e.stopPropagation()}>
              <CheckboxView
                checked={selected}
                onChange={() => onToggle(issue, { ctrl: true, shift: false })}
                accentColor={ACCENT}
                size="sm"
              />
            </span>
          )}
          <span className="font-mono" style={{ color: ACCENT }}>{issue.number}</span>
        </span>
      );

    case 'title':
      return (
        <span
          style={{
            color: 'var(--color-text-primary)',
            /* Wrapped, never clipped. An ellipsis lands exactly where the
               sentence was about to say the useful part. */
            whiteSpace: wrapTitles ? 'normal' : 'nowrap',
            overflow: wrapTitles ? undefined : 'hidden',
            textOverflow: wrapTitles ? undefined : 'ellipsis',
            overflowWrap: 'anywhere',
            lineHeight: 1.45,
          }}
        >
          {issue.title}
          {/* Where the search matched — a hit in an old comment and a hit in
              the title are different kinds of answer. */}
          {hit && hit.where !== 'title' && (
            <span className="block text-[9px]"
                  style={{ color: 'var(--color-text-muted)', marginTop: 1 }}>
              <span style={{ color: ACCENT }}>in the {hit.where}</span> — {hit.snippet}
            </span>
          )}
        </span>
      );

    case 'state':
      return (
        <BadgeChipView
          tone={issue.state === 'OPEN' ? 'var(--color-success)' : 'var(--color-text-muted)'}
          size="xs"
        >
          {issue.state === 'OPEN' ? 'Open' : 'Closed'}
        </BadgeChipView>
      );

    case 'assignee': {
      const claim = claimed('assignee');
      const who = claim ?? issue.assignees[0] ?? '';
      return (
        <EditableCell
          what="assignee"
          value={who}
          pending={claim !== undefined}
          options={meta?.assignees ?? []}
          unavailable="Nobody on this repository can be assigned from here."
          onPick={v => onEdit(issue, 'assignee', v)}
        >
          {who
            ? <span className="flex items-center gap-1.5 min-w-0">
                <AvatarView name={who} size="xs" />
                <span className="truncate">{who}</span>
              </span>
            : <span style={{ color: 'var(--color-warning)' }}>unassigned</span>}
        </EditableCell>
      );
    }

    case 'milestone': {
      const claim = claimed('milestone');
      const title = claim ?? issue.milestone ?? '';
      return (
        <EditableCell
          what="milestone"
          value={title}
          pending={claim !== undefined}
          options={(meta?.milestones ?? []).map(m => m.title)}
          unavailable="This repository has no open milestones."
          onPick={v => onEdit(issue, 'milestone', v)}
        >
          <span className="truncate">{title || '—'}</span>
        </EditableCell>
      );
    }

    case 'labels':
      return (
        <span className="flex gap-1 flex-wrap">
          {issue.labels.slice(0, 3).map(l => (
            <BadgeChipView key={l.name} tone={`#${l.color}`} size="xs">{l.name}</BadgeChipView>
          ))}
          {issue.labels.length > 3 && (
            <span style={{ color: 'var(--color-text-muted)' }}>+{issue.labels.length - 3}</span>
          )}
        </span>
      );

    case 'author':
      return <span className="truncate">{issue.author ?? '—'}</span>;

    case 'comments':
      return <span className="font-mono">{issue.commentCount || '—'}</span>;

    case 'age':
      return <span className="font-mono">{issue.ageDays}d</span>;

    case 'quiet':
      return (
        <span
          className="font-mono"
          style={{ color: issue.quietDays >= QUIET_DAYS ? 'var(--color-warning)' : undefined }}
        >
          {issue.quietDays}d
        </span>
      );

    case 'created':
      return <span className="font-mono">{sinceIso(issue.createdAt)}</span>;

    case 'url':
      return (
        <span className="truncate font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {issue.url}
        </span>
      );

    default: {
      /*
        A form dimension. Read-only, and it says why: the value lives in a
        heading inside the issue body, so changing it means rewriting prose
        somebody wrote — which is the detail screen's job, not a table cell's.
      */
      const v = issue.dimensions[col.key];
      if (!v) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
      return (
        <span title={`${col.label} is a heading in the issue body — open the issue to change it`}>
          <BadgeChipView tone={fromMap(colours, col.key, v)} size="xs">{v}</BadgeChipView>
        </span>
      );
    }
  }
}

/**
 * A cell you can change where it is displayed — screen 05C.
 *
 * **Only fields that have a defined set are editable inline.** Assignee and
 * milestone each have a list, so there is nothing to get wrong. Title and body
 * are not: editing prose in a table cell is how you end up with a truncated
 * title nobody meant to save, and those open the detail screen instead.
 *
 * The cell shows the new value immediately and marks it pending. If the write
 * fails the old value comes back with the reason attached to the row — rather
 * than the cell having quietly said something untrue for four minutes until the
 * next refresh corrected it.
 */
function EditableCell({ what, value, pending, options, unavailable, onPick, children }: {
  what: string;
  value: string;
  pending: boolean;
  options: string[];
  unavailable: string;
  onPick: (value: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const shown = options.filter(o => o.toLowerCase().includes(filter.toLowerCase())).slice(0, 30);

  return (
    <span
      style={{ position: 'relative', minWidth: 0, width: '100%' }}
      onClick={e => e.stopPropagation()}
    >
      <span
        onClick={() => { setOpen(o => !o); setFilter(''); }}
        title={`Click to change the ${what}`}
        className="flex items-center gap-1 min-w-0 cursor-pointer rounded"
        style={{ opacity: pending ? 0.65 : 1 }}
      >
        {children}
        {pending && <BadgeChipView tone="var(--color-warning)" size="xs">saving</BadgeChipView>}
      </span>
      {open && (
        <>
          <span className="fixed inset-0" style={{ zIndex: 20 }} onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 mt-1 rounded-lg border flex flex-col"
            style={{
              zIndex: 21,
              width: 190,
              maxHeight: 220,
              borderColor: 'var(--color-surface-border)',
              background: 'var(--color-surface)',
              boxShadow: '0 8px 22px rgba(0,0,0,.35)',
            }}
          >
            {options.length > 8 && (
              <input
                autoFocus
                value={filter}
                onChange={e => setFilter(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
                placeholder="Filter"
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
                  {unavailable}
                </span>
              ) : shown.map(o => (
                <button
                  key={o}
                  type="button"
                  onClick={() => { setOpen(false); onPick(o); }}
                  className="text-left px-2.5 py-1 text-[10.5px] cursor-pointer"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: o === value ? ACCENT : 'var(--color-text-secondary)',
                    fontWeight: o === value ? 600 : 400,
                  }}
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
