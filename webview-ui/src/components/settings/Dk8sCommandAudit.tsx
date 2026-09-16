/**
 * Settings → DK8S → Commands — every kubectl dk8s has run.
 *
 * dk8s's claim is that it runs lines you could have typed. This is where that
 * stops being a claim: the command, what the cluster said back, how long it
 * took, and which context and namespace it named — for every call, in order.
 *
 * It is the screen to open when dk8s and a terminal disagree. "The cluster says
 * you cannot read logs here" beside a `kubectl logs` that works is not a
 * mystery once you can see that dk8s asked a *different namespace*, or that the
 * permission check errored rather than refused.
 *
 * The rows come from the same audit table as everything else, filtered to the
 * dk8s command events, and the table is the one Developer Tools → Audit Log
 * draws — same row height, same badges, same expand-for-detail — because a
 * second audit that looked different would read as a different kind of record.
 */
import { Fragment, useCallback, useEffect, useState } from 'react';
import { postMsg } from '../../vscode';
import { useUiStateStore } from '../../store/ui-state-store';
import { COMMAND_AUDIT_LIMIT_KEY, commandAuditLimit } from './CommandAuditLimit';
import { CopyButtonView } from '@salilvnair/dui';
import {
  RefreshIcon, TrashIcon, SearchIcon, CloseIcon, ChevronRightIcon, ChevronDownIcon,
} from '../../icons';

const ACCENT = 'var(--color-dk8s)';

interface UiRow {
  id: number;
  event_type: string;
  module: string;
  button?: string;
  action?: string;
  metadata?: string;
  created_at: string;
}

interface Meta {
  context?: string;
  namespace?: string;
  ms?: number;
  exit?: number | null;
  ok?: boolean;
  said?: string;
  bytes?: number;
  /** `poll` is a refresh on a timer that nobody pressed. Absent on old rows. */
  source?: 'user' | 'poll';
}

function readMeta(row: UiRow): Meta {
  try {
    return row.metadata ? JSON.parse(row.metadata) as Meta : {};
  } catch {
    return {};
  }
}

/** `2026-09-14T02:03:16.326Z` → `02:03:16`, which is what you compare against. */
function clock(at: string): string {
  const d = new Date(at.includes('T') ? at : at.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? at : d.toISOString().slice(11, 19);
}

/**
 * The same chip the Developer Tools audit uses, to the pixel.
 *
 * This had its own: a hairline at 40% of the accent, no weight on the text, no
 * vertical padding. Beside the audit it was meant to match it read as a
 * different control — the hard outline pulled the eye to the border instead of
 * the word. Two screens listing the same kind of thing should not look like
 * two products, so the numbers here are copied from `StageBadge` in
 * settings/devtools/AuditLogTab.tsx rather than re-guessed.
 */
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0 whitespace-nowrap"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

export function Dk8sCommandAudit() {
  const [rows, setRows] = useState<UiRow[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<number | null>(null);

  /* How far back to read — Settings → DK8S → General. The audit keeps
     everything; this is only how much of it this screen asks for. */
  const stored = useUiStateStore(s2 => s2.prefs[COMMAND_AUDIT_LIMIT_KEY]);
  const limit = commandAuditLimit(stored);
  const load = useCallback(() => postMsg({ type: 'uiAudit:load', limit }), [limit]);

  useEffect(() => {
    load();
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== 'uiAudit:data') return;
      const all = (e.data.entries ?? []) as UiRow[];
      /* Only the command rows. The rest of the UI audit has its own screen. */
      setRows(all.filter(r => (r.event_type ?? '').startsWith('dk8s.kubectl')));
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [load]);

  /*
    Background polls are off by default.

    Metrics have no watch API, so `top pods` re-runs every fifteen seconds for
    every namespace being watched — leave them in and a morning's work is a
    page of them with the handful of commands somebody actually ran buried
    somewhere inside. They are still recorded, still here behind the toggle,
    and the count says how many are being held back so nothing is hidden
    silently.
  */
  const [showPolls, setShowPolls] = useState(false);
  const polls = rows.filter(r => readMeta(r).source === 'poll');
  const base = showPolls ? rows : rows.filter(r => readMeta(r).source !== 'poll');

  const q = search.trim().toLowerCase();
  const shown = q
    ? base.filter(r => `${r.action ?? ''} ${r.button ?? ''} ${r.metadata ?? ''}`.toLowerCase().includes(q))
    : base;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── What this is ── */}
      <div className="flex flex-col gap-1.5 px-5 pt-4 pb-3">
        <span className="text-[14px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          Commands
        </span>
        <span className="text-[11.5px] leading-relaxed"
              style={{ color: 'var(--color-text-muted)', maxWidth: '110ch' }}>
          Every kubectl dk8s has run this session, with what the cluster said back. Copy any
          line and run it yourself — if it behaves differently there, the difference is the
          answer. Credentials are masked; contexts, namespaces and pod names are not, because
          they are what makes a row worth reading.
        </span>
      </div>

      {/* ── Filter and actions — the Developer Tools audit bar ── */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-y border-[var(--color-surface-border)] shrink-0">
        <div className="flex items-center gap-1.5 flex-1 min-w-0 px-2 py-1 rounded"
             style={{ background: 'var(--color-surface)' }}>
          <SearchIcon size={11} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by command, context, namespace…"
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[11px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')} title="Clear filter"
                    className="w-4 h-4 flex items-center justify-center rounded cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
              <CloseIcon size={9} />
            </button>
          ) : (
            <span className="text-[10px] font-mono tabular-nums px-1 rounded shrink-0 leading-none"
                  style={{ color: 'var(--color-text-muted)', backgroundColor: 'color-mix(in srgb, var(--color-text-primary) 5%, transparent)' }}>
              {shown.length}
            </span>
          )}
        </div>
        {polls.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPolls(v => !v)}
            title={showPolls
              ? 'Hide the background refreshes again'
              : 'Metrics are polled every 15s per watched namespace — nobody pressed anything to run these'}
            className="text-[10.5px] px-2 py-0.5 rounded-full cursor-pointer shrink-0 tabular-nums transition-colors"
            style={{
              color: showPolls ? ACCENT : 'var(--color-text-muted)',
              background: showPolls ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : 'transparent',
              border: `1px solid ${showPolls
                ? `color-mix(in srgb, ${ACCENT} 30%, transparent)`
                : 'var(--color-surface-border)'}`,
            }}
          >
            {showPolls ? 'hiding nothing' : `${polls.length} background`}
          </button>
        )}
        <button type="button" onClick={load} title="Refresh"
                className="w-6 h-6 flex items-center justify-center rounded cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
          <RefreshIcon size={12} />
        </button>
        <button type="button" title="Clear the whole audit log"
                onClick={() => { postMsg({ type: 'uiAudit:clear' }); setRows([]); }}
                className="w-6 h-6 flex items-center justify-center rounded cursor-pointer text-[var(--color-text-muted)] hover:text-[#ef4444] transition-colors">
          <TrashIcon size={12} />
        </button>
      </div>

      {/* ── The rows ── */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {shown.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[11px] text-[var(--color-text-muted)]">
            {rows.length === 0
              ? 'Nothing yet — open dk8s and every command it runs appears here'
              : base.length === 0
                ? 'Only background refreshes so far — show them to see what dk8s has been doing'
                : 'No matches'}
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10 bg-[var(--color-surface)]">
              <tr className="border-b border-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)]">
                <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)] w-[32px]">#</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)] w-[104px]">What</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)]">Command</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)] w-[150px]">Context / Namespace</th>
                <th className="text-right px-2 py-2 font-medium text-[var(--color-text-muted)] w-[72px]">Took</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)] w-[76px]">Exit</th>
                <th className="text-left px-2 py-2 font-medium text-[var(--color-text-muted)] w-[80px]">Time</th>
                <th className="w-[24px]" />
              </tr>
            </thead>
            <tbody>
              {shown.map((row, i) => {
                const meta = readMeta(row);
                const isOpen = open === row.id;
                const streaming = row.event_type.endsWith('.stream');
                const failed = meta.ok === false;
                const tone = failed ? 'var(--color-warning)' : ACCENT;
                return (
                  <Fragment key={row.id}>
                    <tr
                      onClick={() => setOpen(isOpen ? null : row.id)}
                      className="border-b border-[color-mix(in_srgb,var(--color-text-primary)_3%,transparent)] cursor-pointer transition-colors"
                      style={{ background: isOpen ? `color-mix(in srgb, ${tone} 5%, transparent)` : undefined }}
                    >
                      <td className="px-3 py-2 font-mono text-[10px] text-[var(--color-text-muted)]">
                        {shown.length - i}
                      </td>
                      <td className="px-2 py-2">
                        <Badge label={row.button || 'kubectl'} color={tone} />
                      </td>
                      <td className="px-2 py-2 font-mono text-[10.5px] truncate max-w-[1px]"
                          style={{ color: 'var(--color-text-primary)' }}>
                        {row.action}
                      </td>
                      <td className="px-2 py-2 text-[10.5px] truncate"
                          style={{ color: 'var(--color-text-muted)' }}>
                        {meta.context ?? '—'}{meta.namespace ? ` · ${meta.namespace}` : ''}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-[10px]"
                          style={{ color: meta.ms != null && meta.ms > 3000 ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
                        {streaming ? 'stream' : meta.ms != null ? `${meta.ms}ms` : '—'}
                      </td>
                      <td className="px-2 py-2 font-mono text-[10px]"
                          style={{ color: failed ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
                        {streaming ? '—' : meta.exit == null ? '—' : meta.exit}
                      </td>
                      <td className="px-2 py-2 font-mono text-[10px] text-[var(--color-text-muted)]">
                        {clock(row.created_at)}
                      </td>
                      <td className="px-1 py-2 text-[var(--color-text-muted)]">
                        {isOpen ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="px-3 pb-3 pt-1"
                            style={{ background: `color-mix(in srgb, ${tone} 4%, transparent)` }}>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase tracking-wider"
                                    style={{ color: 'var(--color-text-muted)' }}>
                                Run it yourself
                              </span>
                              <span className="flex-1" />
                              <CopyButtonView text={row.action ?? ''} title="Copy this command"
                                              accentColor={ACCENT} />
                            </div>
                            <div className="flex items-start gap-2 px-2.5 py-1.5 rounded font-mono text-[11.5px]"
                                 style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-primary)' }}>
                              <span style={{ color: ACCENT, userSelect: 'none' }}>$</span>
                              <span className="break-all">{row.action}</span>
                            </div>
                            {meta.said && (
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] uppercase tracking-wider"
                                      style={{ color: 'var(--color-text-muted)' }}>
                                  What it said
                                </span>
                                <span className="text-[11px] font-mono break-all"
                                      style={{ color: failed ? 'var(--color-warning)' : 'var(--color-text-secondary)' }}>
                                  {meta.said}
                                </span>
                              </div>
                            )}
                            {meta.bytes != null && (
                              <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                                {meta.bytes.toLocaleString()} bytes of output — the output itself is
                                not kept, because it is your cluster’s data.
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
