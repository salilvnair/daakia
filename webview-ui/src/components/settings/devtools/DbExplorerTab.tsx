/**
 * DbExplorerTab — 7.4 Developer Tools: DB Explorer
 * Colorful: table list with per-table color, colored column headers, JSON Monaco preview.
 */
import { useState, useEffect, useCallback } from 'react';
import { postMsg } from '../../../vscode';
import { CodeEditor } from '../../shared';
import { RefreshIcon, TrashIcon, ChevronRightIcon, ChevronDownIcon, ServerIcon } from '../../../icons';

interface TableInfo { name: string; rowCount: number; columns: string[]; }

// ─── Per-table accent color ───────────────────────────────────────────────────

const TABLE_COLORS: Record<string, string> = {
  request_history:      '#06b6d4',
  collections:          '#818cf8',
  collection_requests:  '#a78bfa',
  environments:         '#10b981',
  app_settings:         '#f59e0b',
  ce_audit:             'var(--color-protocol-ai)',
  prompt_library:       '#e879f9',
  mock_request_log:     'var(--color-mock-server)',
  cookies:              '#f97316',
  script_console_log:   '#84cc16',
  ai_conversations:     'var(--color-protocol-ai)',
};

function tableColor(name: string): string {
  return TABLE_COLORS[name] ?? '#818cf8';
}

// ─── JSON expand cell ─────────────────────────────────────────────────────────

function JsonCell({ value, accentColor }: { value: unknown; accentColor: string }) {
  const [open, setOpen] = useState(false);
  const str = value == null ? '' : String(value);
  const isJson = str.startsWith('{') || str.startsWith('[');

  if (!isJson || str.length < 20) {
    return (
      <span className="font-mono text-[10px]" style={{ color: str ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
        {str || <span className="italic text-[var(--color-text-muted)]">null</span>}
      </span>
    );
  }

  let pretty = str;
  try { pretty = JSON.stringify(JSON.parse(str), null, 2); } catch { /* raw */ }

  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 cursor-pointer text-[10px] font-mono"
        style={{ color: accentColor }}
      >
        {open ? <ChevronDownIcon size={10} /> : <ChevronRightIcon size={10} />}
        <span className="opacity-70">{open ? 'collapse' : `{…} ${str.length} chars`}</span>
      </button>
      {open && (
        <div className="rounded-lg overflow-hidden border" style={{ borderColor: `color-mix(in srgb, ${accentColor} 15%, transparent)` }}>
          <CodeEditor value={pretty.slice(0, 2000)} language="json" readOnly height="120px" />
        </div>
      )}
    </span>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function DbExplorerTab() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTables = useCallback(() => {
    postMsg({ type: 'dbExplorer:getTables' });
  }, []);

  const loadRows = useCallback((tableName: string) => {
    setLoading(true);
    postMsg({ type: 'dbExplorer:getRows', tableName, limit: 200 });
  }, []);

  useEffect(() => {
    loadTables();
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg) return;
      if (msg.type === 'dbExplorer:tables') setTables(msg.tables ?? []);
      if (msg.type === 'dbExplorer:rows') {
        setRows(msg.rows ?? []);
        setLoading(false);
        const tbl = (msg.tables as TableInfo[] | undefined)?.find((t: TableInfo) => t.name === msg.tableName);
        if (tbl) setColumns(tbl.columns);
      }
      if (msg.type === 'dbExplorer:rowDeleted' && activeTable) loadRows(activeTable);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [loadTables, loadRows, activeTable]);

  useEffect(() => {
    if (rows.length > 0 && columns.length === 0) setColumns(Object.keys(rows[0]));
  }, [rows, columns]);

  const selectTable = (name: string) => {
    const tbl = tables.find(t => t.name === name);
    if (tbl) setColumns(tbl.columns);
    setActiveTable(name);
    setRows([]);
    loadRows(name);
  };

  const handleDelete = (row: Record<string, unknown>) => {
    if (!activeTable) return;
    const pkCol = columns.find(c => c.toLowerCase().includes('id') && c !== 'conversation_id') ?? columns[0];
    postMsg({ type: 'dbExplorer:deleteRow', tableName: activeTable, pkCol, pkVal: row[pkCol] });
  };

  const activeColor = activeTable ? tableColor(activeTable) : '#818cf8';

  return (
    <div className="flex h-full min-h-0">
      {/* ─── Left: table list ─── */}
      <div className="w-[190px] shrink-0 border-r border-[rgba(255,255,255,0.07)] flex flex-col bg-[rgba(255,255,255,0.01)]">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[rgba(255,255,255,0.07)]">
          <span className="text-[9.5px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">Tables</span>
          <button type="button" onClick={loadTables}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors">
            <RefreshIcon size={11} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] py-1">
          {tables.map(tbl => {
            const c = tableColor(tbl.name);
            const isActive = activeTable === tbl.name;
            return (
              <button
                key={tbl.name}
                type="button"
                onClick={() => selectTable(tbl.name)}
                className="w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer transition-all rounded-lg mx-1 mb-0.5"
                style={{
                  width: 'calc(100% - 8px)',
                  background: isActive ? `color-mix(in srgb, ${c} 12%, transparent)` : 'transparent',
                  color: isActive ? c : 'var(--color-text-primary)',
                  borderLeft: isActive ? `2px solid ${c}` : '2px solid transparent',
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ServerIcon size={11} className="shrink-0" style={{ color: c }} />
                  <span className="text-[11px] truncate font-medium">{tbl.name}</span>
                </div>
                <span
                  className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full shrink-0 ml-1"
                  style={{ color: c, background: `color-mix(in srgb, ${c} 12%, transparent)` }}
                >
                  {tbl.rowCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Right: rows ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeTable ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <ServerIcon size={28} className="text-[var(--color-text-muted)] opacity-30" />
            <span className="text-[11px] text-[var(--color-text-muted)]">Select a table to browse rows</span>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full text-[11px] text-[var(--color-text-muted)]">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[11px] text-[var(--color-text-muted)]">
            No rows in <code className="ml-1 font-mono" style={{ color: activeColor }}>{activeTable}</code>
          </div>
        ) : (
          <>
            {/* Table header bar */}
            <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0" style={{ borderColor: `color-mix(in srgb, ${activeColor} 15%, transparent)`, background: `color-mix(in srgb, ${activeColor} 4%, transparent)` }}>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: activeColor }}>{activeTable}</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full" style={{ color: activeColor, background: `color-mix(in srgb, ${activeColor} 12%, transparent)` }}>
                {rows.length} rows
              </span>
            </div>
            <div className="flex-1 overflow-auto [scrollbar-gutter:stable]">
              <table className="w-full text-[10.5px] border-collapse">
                <thead className="sticky top-0 z-10 bg-[var(--color-surface)]">
                  <tr>
                    {columns.map((col, i) => (
                      <th
                        key={col}
                        className="text-left px-3 py-2 font-semibold whitespace-nowrap border-b"
                        style={{
                          color: i === 0 ? activeColor : 'var(--color-text-muted)',
                          borderColor: `color-mix(in srgb, ${activeColor} 12%, transparent)`,
                        }}
                      >
                        {col}
                      </th>
                    ))}
                    <th className="w-[28px] border-b" style={{ borderColor: `color-mix(in srgb, ${activeColor} 12%, transparent)` }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b transition-colors"
                      style={{ borderColor: 'rgba(255,255,255,0.03)' }}
                      onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.background = `color-mix(in srgb, ${activeColor} 3%, transparent)`}
                      onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.background = ''}
                    >
                      {columns.map((col, ci) => (
                        <td key={col} className="px-3 py-1.5 align-top max-w-[200px]">
                          <JsonCell value={row[col]} accentColor={ci === 0 ? activeColor : '#818cf8'} />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right align-top">
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          title="Delete row"
                          className="text-[var(--color-text-muted)] hover:text-[#ef4444] cursor-pointer transition-colors"
                        >
                          <TrashIcon size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
