/**
 * Screen 05 — the table, and 05B to 05E with it.
 *
 * The markup is the mock's: a `.tblw` that scrolls sideways around a
 * `table.tbl`, `th` per column, and per row `td.num`, `td.ttl`, chips, `.st`,
 * `.pr`, `.who` and `td.dt` — with `.late` on a date that has gone by.
 *
 * The same issues as rows, dense enough to scan a hundred. This is also the
 * shape the export writes: what is in these columns is what lands in the
 * spreadsheet, in this order.
 *
 * Four things it has to do that a plain table does not:
 *
 * - **A long title wraps; it is never cut.** `td.ttl` clips by default in the
 *   mock, which is right for a fixed figure of tidy data; with wrapping on, the
 *   ellipsis goes and the row grows. That row is taller and that is correct —
 *   the alternative cuts the sentence exactly where it was about to say the
 *   useful part.
 * - **Two-level sort.** One click sets the primary, shift-click adds the
 *   tiebreak, and the header carries its number — two arrows without an order
 *   is a table you cannot trust.
 * - **Pinned identity columns.** `#` and `Title` stay while the rest scrolls
 *   sideways, so at row 190 of 214 you can still tell which row you are on.
 * - **Rows are virtualised past about sixty.** 214 issues is one `gh issue
 *   list`; 214 rows of DOM is not.
 *
 * Sorting and filtering happen over the full set, never over what is on screen.
 *
 * On the virtualisation, honestly: rows are not a fixed height, because titles
 * wrap. So the spacers are sized from a running average of the rows actually
 * measured, which makes the scrollbar accurate to within a row or two and
 * converges as you scroll. A fixed row height would buy an exact thumb by
 * cutting the titles, which is the trade this screen exists to refuse.
 */
import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Ico } from './GhIcons';
import { avClass, chipOf, prClass } from './GhCards';
import { DENSITY_PAD, type Density, type SortLevel } from './board-prefs';
import {
  QUIET_DAYS, rankOf, type BoardIssue, type Group, type ProposedDimension,
} from './board-types';
import { arrange, catalogue, type TableColumn } from './table-columns';
import { sinceIso } from './format';
import type { SearchHit } from './filter-model';
import type { RepoMeta } from './types';

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
  selected, onToggle, onOpen, cursor, meta, onEdit, pending, hits, renderHeader,
}: {
  groups: Group[];
  showGroups: boolean;
  dimensions: ProposedDimension[];
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
  onEdit: (issue: BoardIssue, field: 'assignee' | 'milestone', value: string) => void;
  pending: Map<number, { field: string; value: string }>;
  hits?: Map<number, SearchHit>;
  renderHeader: (group: Group) => React.ReactNode;
}) {
  const cols = useMemo(() => arrange(catalogue(dimensions), columns), [dimensions, columns]);

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
  const visible = rows.slice(start, end);

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

  return (
    <div className="tblw" ref={scrollRef} style={{ overflow: 'auto', height: '100%' }}>
      <table className="tbl">
        <thead>
          <tr>
            {cols.map(c => (
              <HeaderCell key={c.key} col={c} sort={sort} onSort={onSort}
                          left={offsets.get(c.key)} pad={pad} />
            ))}
          </tr>
        </thead>
        <tbody>
          {padTop > 0 && (
            <tr><td colSpan={cols.length} style={{ height: padTop, padding: 0, border: 0 }} /></tr>
          )}

          {visible.map((r, i) => r.kind === 'header' ? (
            <tr key={r.key} ref={el => measure(start + i, el)}>
              <td colSpan={cols.length} style={{ padding: '10px 12px 4px', border: 0 }}>
                {/* Inside a `.group`, because that is what the mock's `.gh`
                    rules are written against. */}
                <div className="group">{renderHeader(r.group)}</div>
              </td>
            </tr>
          ) : (
            <IssueRow
              key={r.key}
              ref={el => measure(start + i, el)}
              issue={r.issue}
              cols={cols}
              offsets={offsets}
              pad={pad}
              wrapTitles={wrapTitles}
              dimensions={dimensions}
              selected={selected.has(r.issue.number)}
              anySelected={selected.size > 0}
              cursor={cursor === r.issue.number}
              meta={meta}
              pendingValue={pending.get(r.issue.number)}
              hit={hits?.get(r.issue.number)}
              onToggle={onToggle}
              onOpen={onOpen}
              onEdit={onEdit}
            />
          ))}

          {padBottom > 0 && (
            <tr><td colSpan={cols.length} style={{ height: padBottom, padding: 0, border: 0 }} /></tr>
          )}
        </tbody>
      </table>
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
    if (el) heights.current[index] = el.offsetHeight;
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
 * unnoticed.
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

function HeaderCell({ col, sort, onSort, left, pad }: {
  col: TableColumn;
  sort: SortLevel[];
  onSort: (next: SortLevel[]) => void;
  left?: number;
  pad: string;
}) {
  const at = sort.findIndex(s => s.key === col.key);
  const level = at >= 0 ? sort[at] : undefined;

  return (
    <th
      className={level ? 'sorted' : undefined}
      onClick={e => onSort(nextSort(sort, col.key, e.shiftKey))}
      title={`Sort by ${col.label} — shift-click to add it as a tiebreak`}
      style={{
        cursor: 'pointer',
        padding: pad,
        textAlign: col.align === 'right' ? 'right' : 'left',
        position: left !== undefined ? 'sticky' : undefined,
        left,
        zIndex: left !== undefined ? 3 : 2,
        minWidth: col.width,
      }}
    >
      {col.label}
      {level && (
        <span className="sortmark">
          {level.dir === 'asc' ? '▲' : '▼'}
          {/* The number, always when there is more than one — a two-level sort
              you cannot read is one you cannot trust. */}
          {sort.length > 1 && at + 1}
        </span>
      )}
    </th>
  );
}

const IssueRow = forwardRef<HTMLTableRowElement, {
  issue: BoardIssue;
  cols: TableColumn[];
  offsets: Map<string, number>;
  pad: string;
  wrapTitles: boolean;
  dimensions: ProposedDimension[];
  selected: boolean;
  anySelected: boolean;
  cursor: boolean;
  meta?: RepoMeta;
  pendingValue?: { field: string; value: string };
  hit?: SearchHit;
  onToggle: (issue: BoardIssue, mods: { ctrl: boolean; shift: boolean }) => void;
  onOpen: (issue: BoardIssue) => void;
  onEdit: (issue: BoardIssue, field: 'assignee' | 'milestone', value: string) => void;
}>(function IssueRow({
  issue, cols, offsets, pad, wrapTitles, dimensions, selected, anySelected,
  cursor, meta, pendingValue, hit, onToggle, onOpen, onEdit,
}, ref) {
  const click = (e: React.MouseEvent) => {
    const mods = { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey };
    if (anySelected || mods.ctrl || mods.shift) { onToggle(issue, mods); return; }
    onOpen(issue);
  };

  return (
    <tr
      ref={ref}
      data-issue={issue.number}
      className={selected ? 'rowsel' : undefined}
      onClick={click}
      style={{
        cursor: 'pointer',
        ...(cursor ? { outline: '1px solid var(--dk-gh)', outlineOffset: -1 } : {}),
      }}
    >
      {cols.map(c => (
        <Cell
          key={c.key}
          col={c}
          issue={issue}
          pad={pad}
          left={offsets.get(c.key)}
          wrapTitles={wrapTitles}
          dimensions={dimensions}
          selected={selected}
          anySelected={anySelected}
          meta={meta}
          pendingValue={pendingValue}
          hit={hit}
          onToggle={onToggle}
          onEdit={onEdit}
        />
      ))}
    </tr>
  );
});

function Cell({
  col, issue, pad, left, wrapTitles, dimensions, selected, anySelected,
  meta, pendingValue, hit, onToggle, onEdit,
}: {
  col: TableColumn;
  issue: BoardIssue;
  pad: string;
  left?: number;
  wrapTitles: boolean;
  dimensions: ProposedDimension[];
  selected: boolean;
  anySelected: boolean;
  meta?: RepoMeta;
  pendingValue?: { field: string; value: string };
  hit?: SearchHit;
  onToggle: (issue: BoardIssue, mods: { ctrl: boolean; shift: boolean }) => void;
  onEdit: (issue: BoardIssue, field: 'assignee' | 'milestone', value: string) => void;
}) {
  const claimed = (field: string) =>
    (pendingValue && pendingValue.field === field ? pendingValue.value : undefined);
  const optionsOf = (key: string) => dimensions.find(d => d.dimension === key)?.options;

  /* Pinned cells carry their own ground, or the columns behind them show
     through as they scroll underneath. */
  const style: React.CSSProperties = {
    padding: pad,
    textAlign: col.align === 'right' ? 'right' : 'left',
    ...(left !== undefined
      ? { position: 'sticky', left, zIndex: 1, background: 'var(--dk-panel)' }
      : {}),
  };

  switch (col.key) {
    case 'number':
      return (
        <td className="num" style={style}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {(anySelected || selected) && (
              <span
                className={`sel${selected ? ' on' : ''}`}
                onClick={e => { e.stopPropagation(); onToggle(issue, { ctrl: true, shift: false }); }}
              >
                {selected && <Ico name="check" />}
              </span>
            )}
            {issue.number}
          </span>
        </td>
      );

    case 'title':
      return (
        <td
          className="ttl"
          style={{
            ...style,
            /* Wrapped, never clipped. An ellipsis lands exactly where the
               sentence was about to say the useful part. */
            ...(wrapTitles
              ? { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip',
                  overflowWrap: 'anywhere', maxWidth: 420 }
              : {}),
          }}
        >
          {issue.title}
          {hit && hit.where !== 'title' && (
            <div style={{ fontSize: 9, color: 'var(--dk-faint)', fontWeight: 400, marginTop: 1 }}>
              <span style={{ color: 'var(--dk-gh)' }}>in the {hit.where}</span> — {hit.snippet}
            </div>
          )}
        </td>
      );

    case 'state':
      return (
        <td style={style}>
          <span className={`st ${issue.state === 'OPEN' ? 'st-todo' : 'st-done'}`}>
            <b />{issue.state === 'OPEN' ? 'Open' : 'Closed'}
          </span>
        </td>
      );

    case 'assignee': {
      const claim = claimed('assignee');
      const who = claim ?? issue.assignees[0] ?? '';
      return (
        <td style={style}>
          <Editable
            what="assignee"
            value={who}
            pending={claim !== undefined}
            options={meta?.assignees ?? []}
            unavailable="Nobody on this repository can be assigned from here."
            onPick={v => onEdit(issue, 'assignee', v)}
          >
            {who
              ? <span className="who"><span className={avClass(who)}>{who[0].toUpperCase()}</span>{who}</span>
              : <span className="who" style={{ color: 'var(--dk-amber)' }}>unassigned</span>}
          </Editable>
        </td>
      );
    }

    case 'milestone': {
      const claim = claimed('milestone');
      const title = claim ?? issue.milestone ?? '';
      return (
        <td style={style}>
          <Editable
            what="milestone"
            value={title}
            pending={claim !== undefined}
            options={(meta?.milestones ?? []).map(m => m.title)}
            unavailable="This repository has no open milestones."
            onPick={v => onEdit(issue, 'milestone', v)}
          >
            <span>{title || '—'}</span>
          </Editable>
        </td>
      );
    }

    case 'labels':
      return (
        <td style={style}>
          <span className="chips">
            {issue.labels.slice(0, 3).map(l => (
              <span key={l.name} className="chip"
                    style={{
                      color: `#${l.color}`,
                      borderColor: `color-mix(in srgb, #${l.color} 45%, transparent)`,
                      background: `color-mix(in srgb, #${l.color} 13%, transparent)`,
                    }}>
                {l.name}
              </span>
            ))}
          </span>
        </td>
      );

    case 'author':
      return <td style={style}>{issue.author ?? '—'}</td>;

    case 'comments':
      return <td className="dt" style={style}>{issue.commentCount || '—'}</td>;

    case 'age':
      return <td className="dt" style={style}>{issue.ageDays}d</td>;

    case 'quiet':
      return (
        <td className={`dt${issue.quietDays >= QUIET_DAYS ? ' late' : ''}`} style={style}>
          {issue.quietDays}d
        </td>
      );

    case 'created':
      return <td className="dt" style={style}>{sinceIso(issue.createdAt)}</td>;

    case 'url':
      return <td className="dt" style={style}>{issue.url}</td>;

    default: {
      /*
        A form dimension. Read-only, and the tooltip says why: the value lives
        in a heading inside the issue body, so changing it means rewriting prose
        somebody wrote — the detail screen's job, not a table cell's.
      */
      const v = issue.dimensions[col.key];
      if (!v) return <td style={style}>—</td>;
      const options = optionsOf(col.key);
      const c = chipOf(v, options);
      /* A priority-like field reads as a `.pr` dot rather than a chip, which is
         how the mock draws it. */
      if (/priority|severity|impact/i.test(col.key)) {
        return (
          <td style={style}>
            <span className={prClass(v, options)}><b />{v}</span>
          </td>
        );
      }
      return (
        <td style={style}
            title={`${col.label} is a heading in the issue body — open the issue to change it`}>
          <span className={c.className} style={c.style}>{v}</span>
        </td>
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
 * title nobody meant to save.
 *
 * The cell shows the new value immediately and marks it pending. If the write
 * fails the old value comes back with the reason attached — rather than the
 * cell having quietly said something untrue until the next refresh corrected it.
 */
function Editable({ what, value, pending, options, unavailable, onPick, children }: {
  what: string;
  value: string;
  pending: boolean;
  options: string[];
  unavailable: string;
  onPick: (value: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <span onClick={() => setOpen(o => !o)} title={`Click to change the ${what}`}
            style={{ cursor: 'pointer', opacity: pending ? 0.65 : 1, display: 'inline-flex',
                     alignItems: 'center', gap: 5 }}>
        {children}
        {pending && <span className="chip c-stale">saving</span>}
      </span>
      {open && (
        <>
          <span style={{ position: 'fixed', inset: 0, zIndex: 20 }} onClick={() => setOpen(false)} />
          <div className="menu" style={{ position: 'absolute', left: 0, top: '100%', zIndex: 21 }}>
            {options.length === 0 ? (
              <div className="fct">{unavailable}</div>
            ) : options.map(o => (
              <button key={o} type="button" className={`fct${o === value ? ' on' : ''}`}
                      style={{ width: '100%' }}
                      onClick={() => { setOpen(false); onPick(o); }}>
                <span className="bx">{o === value && <Ico name="check" />}</span>
                {o}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
