/**
 * Screen 15 — export.
 *
 * **Whatever the view shows is what the file gets**: same filters, same
 * columns, same order, same grouping. That equivalence is the feature — you
 * check the report on screen and then press a button, rather than exporting and
 * then checking whether the file agrees with what you saw. So the column list
 * here is the table's own catalogue (see `export-model.ts`) and the rows are
 * the board's, already filtered.
 *
 * **The preview is the file, not a picture of one.** The sheet below is drawn
 * from the same `cells()` the writer uses, so a date that will land as
 * `2026-09-11` shows as `2026-09-11` here. A preview that showed the friendly
 * form would be reassuring about the exact thing that goes wrong.
 *
 * **A format with no writer says so.** PDF is drawn and disabled rather than
 * hidden: somebody who came for the status-mail PDF should find out here, in
 * one word, rather than by not finding it and wondering where it went.
 */
import { useEffect, useMemo, useState } from 'react';
import { postMsg } from '../../vscode';
import { Ico, type IcoName } from './GhIcons';
import { GhClose } from './GhClose';
import {
  FORMATS, cells, exportColumns, filename, report, sheets, toCsv, toMarkdown, workbook,
  type Format, type Scope,
} from './export-model';
import { GhHarvest, useHarvest } from './GhHarvest';
import { GhSchedule, type Schedule } from './GhSchedule';
import type { BoardIssue, ProposedDimension } from './board-types';

/** The mock's own glyph per format. */
const FORMAT_ICON: Record<Format, IcoName> = {
  xlsx: 'xls', pdf: 'pdf', csv: 'csv', md: 'md',
};

export function GhExport({
  repo, view, rows, selected, everything, columns, groupBy, dimensions, query, onClose,
}: {
  repo: string;
  /** The view or filter the rows came from, for the chip and the file name. */
  view: string;
  /** What the board is showing right now. */
  rows: BoardIssue[];
  /** The ticked rows, when there are any. */
  selected: BoardIssue[];
  /** Everything read from the repository, filters off. */
  everything: BoardIssue[];
  /** The table's arrangement — the columns a fresh export starts with. */
  columns: string[];
  groupBy?: string;
  dimensions: ProposedDimension[];
  /** What is filtering the board, in words — the PDF's footer. */
  query: string;
  onClose: () => void;
}) {
  const all = useMemo(() => exportColumns(dimensions), [dimensions]);

  const [scope, setScope] = useState<Scope>('view');
  const [chosen, setChosen] = useState<string[]>(() => {
    const known = new Set(all.map(c => c.key));
    const start = columns.filter(k => known.has(k));
    return start.length ? start : ['number', 'title', 'state'];
  });
  const [format, setFormat] = useState<Format>('xlsx');
  const [perGroup, setPerGroup] = useState(true);
  const [frozen, setFrozen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState('');
  /*
    15D — the whole repository, which is not on the board.

    Reading it is a walk of dozens of calls, so it starts when the scope is
    picked rather than when Save is pressed: by the time somebody has chosen
    their columns and their format the rows are usually already there.
  */
  /** 15E — open while a recurring run is being described. */
  const [scheduling, setScheduling] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [harvesting, setHarvesting] = useState(false);
  const [hidden, setHidden] = useState(false);
  const { progress, result } = useHarvest(repo, harvesting);

  const picked = useMemo(
    () => chosen.map(k => all.find(c => c.key === k)).filter(Boolean) as typeof all,
    [chosen, all],
  );

  const source = scope === 'selected' ? selected
    : scope === 'repository' ? (result?.issues ?? [])
    : scope === 'all' ? everything
    : rows;
  const spec = FORMATS.find(f => f.id === format)!;
  const book = useMemo(
    () => sheets(source, format === 'xlsx' && perGroup ? groupBy : undefined, dimensions),
    [source, format, perGroup, groupBy, dimensions],
  );
  const name = filename(repo, view, spec.ext);

  const toggle = (key: string) => setChosen(prev => (
    prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
  ));

  /*
    Picked up and put down, rather than nudged a step at a time.

    Arrows meant four presses to move a column four places, with no sense of
    where it was going. The grip is the gesture the terminal themes use, and
    the line that appears shows where it will land before you let go.
  */
  const [lifting, setLifting] = useState<string | undefined>();
  const [dropAt, setDropAt] = useState<string | undefined>();
  const [below, setBelow] = useState(false);

  const drop = (onto: string) => {
    const from = lifting;
    setLifting(undefined);
    setDropAt(undefined);
    if (!from || from === onto) return;
    setChosen(prev => {
      const rest = prev.filter(k => k !== from);
      const at = rest.indexOf(onto);
      if (at < 0) return prev;
      rest.splice(below ? at + 1 : at, 0, from);
      return rest;
    });
  };

  /* The ticked ones in their own order, then everything else in the
     catalogue's. */
  const ordered = useMemo(() => {
    const byKey = new Map(all.map(c => [c.key, c]));
    return [
      ...chosen.map(k => byKey.get(k)).filter(Boolean) as typeof all,
      ...all.filter(c => !chosen.includes(c.key)),
    ];
  }, [all, chosen]);

  const text = () => (format === 'csv' ? toCsv(source, picked) : toMarkdown(source, picked));

  const save = () => {
    setSaid('');
    setSaving(true);
    if (format === 'pdf') {
      /* 15B — the layout is the host's, because a page is a coordinate
         system rather than a DOM. What goes on it is decided here, from the
         same rows and columns the preview showed. */
      postMsg({
        type: 'dkgh:export',
        filename: name,
        report: report(source, picked, {
          repo, view, groupBy, dimensions, query,
        }),
      });
    } else if (format === 'xlsx') {
      postMsg({
        type: 'dkgh:export',
        filename: name,
        sheets: workbook(source, picked, format === 'xlsx' && perGroup ? groupBy : undefined,
                         dimensions, frozen),
      });
    } else {
      postMsg({ type: 'dkgh:export', filename: name, text: text() });
    }
    /* The host answers; until it does the button says what it is doing. */
    const done = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type !== 'dkgh:export:result') return;
      window.removeEventListener('message', done);
      setSaving(false);
      setSaid(msg.cancelled ? '' : msg.error ? String(msg.error) : `Saved to ${msg.path}`);
    };
    window.addEventListener('message', done);
  };

  /* Six columns is what the mock's sheet draws, and it is enough to see that
     the file is the view. The rest is counted rather than squeezed in. */
  /* Every column the file will have. It scrolls sideways rather than being
     cut at six with a sentence apologising for it — the point of a preview is
     to show what is going to be written. */
  const preview = picked;
  const previewRows = (book[0]?.rows ?? []).slice(0, 5);
  const schedule = schedules.find(s => s.repo === repo && s.view === view);

  /* What this machine already has running, so the button can say "change" and
     the dialog can open on the existing settings rather than the defaults. */
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown>;
      if (msg?.type === 'dkgh:schedules:result') {
        setSchedules((msg.schedules as Schedule[]) ?? []);
      }
    };
    window.addEventListener('message', onMsg);
    postMsg({ type: 'dkgh:schedules' });
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">

      {scheduling && (
        <GhSchedule
          repo={repo}
          view={view}
          count={rows.length}
          existing={schedule}
          onCancel={() => setScheduling(false)}
          onSaved={() => setScheduling(false)}
        />
      )}

      {harvesting && !result && !hidden && (
        <GhHarvest
          repo={repo}
          progress={progress}
          onCancel={() => {
            postMsg({ type: 'dkgh:harvest:cancel', repo });
            setHidden(true);
          }}
          onHide={() => setHidden(true)}
        />
      )}

      <div className="head">
        <div className="repo">
          <Ico name="dl" />
          <span className="path" style={{ fontFamily: 'var(--sans)', fontWeight: 700 }}>
            Export
          </span>
        </div>
        <span className="chip c-gh">from view: {view}</span>
        <span className="spacer" />
        <GhClose onClick={onClose} />
      </div>

      <div className="split" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div className="facets" style={{ width: 236, padding: '12px 0', flexShrink: 0,
                                         overflowY: 'auto' }}>
          <div className="facet">
            <div className="fh">Rows</div>
            <Row on={scope === 'view'} count={rows.length} onClick={() => setScope('view')}>
              Everything in this view
            </Row>
            <Row on={scope === 'selected'} count={selected.length}
                 disabled={selected.length === 0}
                 onClick={() => selected.length && setScope('selected')}>
              Selected rows only
            </Row>
            <Row on={scope === 'all'} count={everything.length} onClick={() => setScope('all')}>
              All issues read
            </Row>
            {/* 15D. The count is what the walk has produced so far, so the row
                fills in while somebody is still choosing their columns. */}
            <Row
              on={scope === 'repository'}
              count={result?.issues.length ?? progress.done}
              onClick={() => { setScope('repository'); setHarvesting(true); setHidden(false); }}
            >
              Every issue in the repository
            </Row>
            {scope === 'repository' && (
              <div className="sub" style={{ padding: '2px 14px 0' }}>
                {result?.error
                  ? result.error
                  : result?.cancelled
                    ? 'Stopped. What was read is still here.'
                    : result
                      ? `${result.issues.length} read, including closed`
                      : 'Reading the whole history…'}
                {!result && (
                  <>
                    {' '}
                    <button type="button" className="textlink" onClick={() => setHidden(false)}>
                      show progress
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="facet">
            <div className="fh">Columns<span className="n">{chosen.length} of {all.length}</span></div>
            {/*
              Ticked first, in the order the file will be written in, and
              movable. The list *is* the column order — reading it top to
              bottom is reading the spreadsheet left to right, which is the
              only arrangement that needs no explaining.

              The rest keep the catalogue's own order underneath, because a
              list of things you have not chosen has no order of yours to
              respect.
            */}
            <div className="cols" style={{ padding: '0 5px', display: 'block' }}>
              {ordered.map(c => {
                const on = chosen.includes(c.key);
                const over = dropAt === c.key;
                return (
                  <div
                    key={c.key}
                    className={`fct${on ? ' on' : ''}`
                      + `${lifting === c.key ? ' lifting' : ''}`
                      + `${over ? ' dropzone' : ''}${over && below ? ' below' : ''}`}
                    style={{ padding: '3px 9px', cursor: 'pointer' }}
                    title={c.note}
                    onClick={() => toggle(c.key)}
                    /* Only a chosen column has a place in the order to move
                       within, so only a chosen one is a drop target. */
                    onDragOver={on ? e => {
                      if (!lifting) return;
                      e.preventDefault();
                      const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setDropAt(c.key);
                      setBelow(e.clientY > box.top + box.height / 2);
                    } : undefined}
                    onDragLeave={() => { if (dropAt === c.key) setDropAt(undefined); }}
                    onDrop={on ? e => { e.preventDefault(); drop(c.key); } : undefined}
                  >
                    {on && (
                      <span
                        className="colgrip"
                        draggable
                        title="Drag to reorder"
                        aria-label={`Reorder ${c.label}`}
                        onClick={e => e.stopPropagation()}
                        onDragStart={e => {
                          setLifting(c.key);
                          e.dataTransfer.effectAllowed = 'move';
                          /* Firefox refuses to start a drag without it. */
                          e.dataTransfer.setData('text/plain', c.key);
                        }}
                        onDragEnd={() => { setLifting(undefined); setDropAt(undefined); }}
                      >
                        <Ico name="drag" />
                      </span>
                    )}
                    <span className="bx">{on && <Ico name="check" />}</span>
                    {c.label}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="pane" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column',
                        gap: 11, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <div>
              <div className="fl" style={{ marginBottom: 7 }}>Format</div>
              <div className="fmt">
                {FORMATS.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    className={`fmtc${format === f.id ? ' pick' : ''}`}
                    disabled={!f.live}
                    style={f.live ? { cursor: 'pointer' } : { opacity: 0.5, cursor: 'default' }}
                    title={f.live ? undefined : 'Not written yet'}
                    onClick={() => f.live && setFormat(f.id)}
                  >
                    <Ico name={FORMAT_ICON[f.id]} />
                    <span className="n">{f.name}</span>
                    <span className="d">{f.blurb}</span>
                  </button>
                ))}
              </div>
            </div>

            {format === 'pdf' && (
              <div className="sub">
                Three pages at most: a cover with the numbers <b>and one sentence saying what
                they mean</b>, the two charts from Insights, then the table grouped the way the
                board is. Landscape, page numbers, and the filter on every footer — so a
                printed copy still says what it is of.
              </div>
            )}
            {format === 'xlsx' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div
                  className={`fct${perGroup && groupBy ? ' on' : ''}`}
                  style={{ padding: '3px 9px', cursor: groupBy ? 'pointer' : 'default',
                           opacity: groupBy ? 1 : 0.5 }}
                  title={groupBy
                    ? `One sheet per ${groupBy}`
                    : 'The board is not grouped, so there is one sheet either way'}
                  onClick={() => groupBy && setPerGroup(v => !v)}
                >
                  <span className="bx">{perGroup && groupBy && <Ico name="check" />}</span>
                  One sheet per {groupBy ?? 'group'}
                </div>
                {/* It used to be drawn ticked and refuse to untick, with the
                    reason in a tooltip nobody opens. Somebody feeding the file
                    to a script wants neither the pane nor the filter, so it is
                    a real choice now. */}
                <div className={`fct${frozen ? ' on' : ''}`}
                     style={{ padding: '3px 9px', cursor: 'pointer' }}
                     title="A frozen header and a filter on every column — how a report is read"
                     onClick={() => setFrozen(v => !v)}>
                  <span className="bx">{frozen && <Ico name="check" />}</span>
                  Frozen header and filters
                </div>
              </div>
            )}

            <div>
              <div className="fl" style={{ marginBottom: 7 }}>
                Preview — {format === 'xlsx' ? `sheet “${book[0]?.name ?? 'Issues'}”` : 'first rows'}
              </div>
              {/* Scrolls, with no visible bar — the wheel and a trackpad both
                  reach it, and a scrollbar under a five-row table is more
                  furniture than the table. */}
              <div className="sheetw">
                <div
                  className="sheet"
                  /* The track list lives on the rows, which are the grids —
                     `.sr` reads it from here so one number drives them all. */
                  style={{
                    ['--sheet-cols' as string]:
                      `34px repeat(${preview.length}, minmax(104px, 1fr))`,
                  }}
                >
                  <div className="sr hd">
                    <span className="gut" />
                    {preview.map(c => <span key={c.key}>{c.label}</span>)}
                  </div>
                  {previewRows.map((r, at) => (
                    <div className="sr" key={r.number}>
                      <span className="gut">{at + 1}</span>
                      {cells(r, preview).map((v, i) => <span key={preview[i].key}>{v}</span>)}
                    </div>
                  ))}
                </div>
              </div>
              {source.length === 0 && (
                <div className="sub" style={{ marginTop: 6, color: 'var(--dk-amber)' }}>
                  Nothing is selected to write. The file would have a header and no rows.
                </div>
              )}
            </div>

            {said && <div className="sub">{said}</div>}
          </div>

          <div className="footbar">
            <span className="runcmd" style={{ flex: 1 }}>
              {name} · {source.length} row{source.length === 1 ? '' : 's'} ·{' '}
              {picked.length} column{picked.length === 1 ? '' : 's'}
              {format === 'xlsx' ? ` · ${book.length} sheet${book.length === 1 ? '' : 's'}` : ''}
            </span>
            {format !== 'xlsx' && (
              <button
                type="button"
                className="btn"
                onClick={() => { navigator.clipboard?.writeText(text()); setSaid('Copied.'); }}
              >
                <Ico name="copy" />Copy to clipboard
              </button>
            )}
            {/* 15E. Beside Save rather than behind a menu: somebody who has
                just built the right export is exactly the person who wants it
                every Friday. */}
            <button type="button" className="btn" onClick={() => setScheduling(true)}>
              <Ico name="cal" />{schedule ? 'Change the schedule' : 'Every Friday…'}
            </button>
            <button type="button" className="btn go" disabled={saving || picked.length === 0}
                    onClick={save}>
              <Ico name="dl" />{saving ? 'Saving…' : 'Save file'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One of the three row scopes, with what it would write. */
function Row({ on, count, disabled, onClick, children }: {
  on: boolean;
  count: number;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`fct${on ? ' on' : ''}`}
      style={{ cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}
      onClick={onClick}
    >
      <span className="bx">{on && <Ico name="check" />}</span>
      {children}
      <span className="n">{count}</span>
    </div>
  );
}
