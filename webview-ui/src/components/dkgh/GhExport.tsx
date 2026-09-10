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
import { useMemo, useState } from 'react';
import { postMsg } from '../../vscode';
import { Ico, type IcoName } from './GhIcons';
import {
  FORMATS, cells, exportColumns, filename, report, sheets, toCsv, toMarkdown,
  type Format, type Scope,
} from './export-model';
import { GhHarvest, useHarvest } from './GhHarvest';
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
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState('');
  /*
    15D — the whole repository, which is not on the board.

    Reading it is a walk of dozens of calls, so it starts when the scope is
    picked rather than when Save is pressed: by the time somebody has chosen
    their columns and their format the rows are usually already there.
  */
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
        sheets: book.map(s => ({
          name: s.name,
          columns: picked.map(c => ({
            label: c.label,
            type: c.type,
            width: c.key === 'title' ? 52 : c.type === 'text' ? 18 : 12,
          })),
          rows: s.rows.map(r => ({ cells: cells(r, picked) })),
        })),
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
  const preview = picked.slice(0, 6);
  const previewRows = (book[0]?.rows ?? []).slice(0, 5);

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">

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
        <button type="button" className="btn" style={{ padding: '3px 9px' }} onClick={onClose}>
          ×
        </button>
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
            <div className="cols" style={{ padding: '0 5px', display: 'block' }}>
              {all.map(c => (
                <div
                  key={c.key}
                  className={`fct${chosen.includes(c.key) ? ' on' : ''}`}
                  style={{ padding: '3px 9px', cursor: 'pointer' }}
                  title={c.note}
                  onClick={() => toggle(c.key)}
                >
                  <span className="bx">{chosen.includes(c.key) && <Ico name="check" />}</span>
                  {c.label}
                </div>
              ))}
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
                <div className="fct on" style={{ padding: '3px 9px', cursor: 'default' }}
                     title="A frozen header and the filter row, always — a report is read by scrolling">
                  <span className="bx"><Ico name="check" /></span>
                  Frozen header and filters
                </div>
              </div>
            )}

            <div>
              <div className="fl" style={{ marginBottom: 7 }}>
                Preview — {format === 'xlsx' ? `sheet “${book[0]?.name ?? 'Issues'}”` : 'first rows'}
              </div>
              <div className="sheet">
                <div className="sr hd">
                  <span className="gut" />
                  {preview.map(c => <span key={c.key}>{c.label}</span>)}
                  {Array.from({ length: Math.max(0, 6 - preview.length) })
                    .map((_, i) => <span key={`pad-${i}`} />)}
                </div>
                {previewRows.map((r, at) => {
                  const row = cells(r, preview);
                  return (
                    <div className="sr" key={r.number}>
                      <span className="gut">{at + 1}</span>
                      {row.map((v, i) => <span key={preview[i].key}>{v}</span>)}
                      {Array.from({ length: Math.max(0, 6 - row.length) })
                        .map((_, i) => <span key={`pad-${i}`} />)}
                    </div>
                  );
                })}
              </div>
              {picked.length > preview.length && (
                <div className="sub" style={{ marginTop: 6 }}>
                  {picked.length - preview.length} more column
                  {picked.length - preview.length === 1 ? '' : 's'} are in the file — the preview
                  shows six so the rows stay readable.
                </div>
              )}
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
