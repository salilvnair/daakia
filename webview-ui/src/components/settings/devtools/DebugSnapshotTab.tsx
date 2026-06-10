/**
 * DebugSnapshotTab — 7.5 Developer Tools: Debug Snapshot
 * Colorful tiles for summary cards, Monaco JSON preview.
 */
import { useState, useEffect, useCallback } from 'react';
import { postMsg } from '../../../vscode';
import { CopyButton, CodeEditor } from '../../shared';
import { RefreshIcon, DownloadIcon } from '../../../icons';

interface SnapshotData {
  generatedAt: string;
  extension: { version?: string; nodeVersion?: string; pid?: number; uptime?: number };
  memory: { heapUsed?: number; heapTotal?: number; rss?: number };
  sqlite: { ok: boolean; error?: string };
  tables: { name: string; rowCount: number }[];
  recentErrors: unknown[];
  performanceData?: unknown;
}

function fmtBytes(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const TILE_META = [
  { key: 'node',    label: 'Node.js Version', color: '#10b981', emoji: '⬡' },
  { key: 'pid',     label: 'Process ID',      color: '#06b6d4', emoji: '⚙' },
  { key: 'heap',    label: 'Heap Used',        color: '#818cf8', emoji: '◈' },
  { key: 'tables',  label: 'DB Tables',        color: '#a855f7', emoji: '⊞' },
  { key: 'errors',  label: 'Recent Errors',    color: '#ef4444', emoji: '⚠' },
];

function MemoryCard({ label, value, color, emoji }: { label: string; value: string; color: string; emoji: string }) {
  return (
    <div
      className="flex items-center gap-4 px-4 py-3 rounded-xl border w-full"
      style={{ borderColor: `color-mix(in srgb, ${color} 22%, transparent)`, background: `color-mix(in srgb, ${color} 5%, var(--color-surface))` }}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-[18px]"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: `color-mix(in srgb, ${color} 75%, var(--color-text-muted))` }}>
          {label}
        </p>
        <p className="text-[16px] font-mono font-bold mt-0.5 leading-none" style={{ color }}>{value}</p>
      </div>
    </div>
  );
}

export function DebugSnapshotTab() {
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [json, setJson] = useState('');
  const [loading, setLoading] = useState(false);

  const generate = useCallback(() => {
    setLoading(true);
    postMsg({ type: 'getPerformanceData' });
    postMsg({ type: 'dbExplorer:getTables' });
    postMsg({ type: 'aiAudit:load', limit: 5 });
  }, []);

  useEffect(() => {
    generate();
    const pieces: { perf?: unknown; tables?: unknown[]; auditErrors?: unknown[] } = {};

    const tryBuild = () => {
      if (!pieces.perf || !pieces.tables) return;
      const perf = pieces.perf as Record<string, unknown>;
      const snap: SnapshotData = {
        generatedAt: new Date().toISOString(),
        extension: {
          nodeVersion: perf.nodeVersion as string,
          pid: perf.processId as number,
          uptime: perf.uptime as number,
        },
        memory: {
          heapUsed: perf.heapUsed as number,
          heapTotal: perf.heapTotal as number,
          rss: perf.rss as number,
        },
        sqlite: { ok: true },
        tables: pieces.tables as { name: string; rowCount: number }[],
        recentErrors: (pieces.auditErrors ?? []).filter((e: unknown) => (e as Record<string, unknown>).error),
        performanceData: pieces.perf,
      };
      setSnapshot(snap);
      setJson(JSON.stringify(snap, null, 2));
      setLoading(false);
    };

    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg) return;
      if (msg.type === 'performanceData') { pieces.perf = msg.data; tryBuild(); }
      if (msg.type === 'dbExplorer:tables') { pieces.tables = msg.tables; tryBuild(); }
      if (msg.type === 'aiAudit:data') { pieces.auditErrors = msg.entries; tryBuild(); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [generate]);

  const handleDownload = () => {
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `daakia-debug-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const tileValues = snapshot ? {
    node:   snapshot.extension.nodeVersion ?? '—',
    pid:    String(snapshot.extension.pid ?? '—'),
    heap:   snapshot.memory.heapUsed ? fmtBytes(snapshot.memory.heapUsed) : '—',
    tables: String(snapshot.tables.length),
    errors: String(snapshot.recentErrors.length),
  } : null;

  return (
    <div className="flex flex-col h-full min-h-0 p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-[12px] font-semibold text-[var(--color-text-primary)]">Debug Snapshot</h3>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
            Export a full diagnostic bundle — DB tables, memory, recent errors, versions
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={generate}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] cursor-pointer transition-all border"
            style={{ color: '#818cf8', borderColor: 'color-mix(in srgb, #818cf8 25%, transparent)', background: 'color-mix(in srgb, #818cf8 8%, transparent)' }}>
            <RefreshIcon size={12} /> Regenerate
          </button>
          <button type="button" onClick={handleDownload} disabled={!json}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-white cursor-pointer transition-all disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}>
            <DownloadIcon size={12} /> Download JSON
          </button>
          {json && <CopyButton text={json} size={13} className="w-7 h-7" />}
        </div>
      </div>

      {/* Memory cards — full-width column layout */}
      {tileValues && !loading && (
        <div className="flex flex-col gap-2 shrink-0">
          {TILE_META.map(({ key, label, color, emoji }) => (
            <MemoryCard key={key} label={label} value={tileValues[key as keyof typeof tileValues]} color={color} emoji={emoji} />
          ))}
        </div>
      )}

      {/* JSON Monaco preview */}
      <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-[rgba(129,140,248,0.15)]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <span className="text-[22px]">⟳</span>
            <span className="text-[11px] text-[var(--color-text-muted)]">Collecting diagnostics…</span>
          </div>
        ) : (
          <CodeEditor value={json} language="json" readOnly height="100%" />
        )}
      </div>
    </div>
  );
}
