/**
 * PerformanceTab — colorful memory & system resource dashboard (7.1 Memory Footprint).
 * Each section has its own accent color. Progress bars are gradient-colored.
 */
import { useState, useEffect, useCallback } from 'react';
import { CpuIcon, MemoryIcon, UptimeIcon, GaugeIcon, RefreshIcon, ProcessIcon } from '../../../icons';
import { postMsg } from '../../../vscode';

interface PerformanceData {
  cpuUsage: number;
  memoryUsage: number;
  uptime: number;
  processId: number;
  heapUsed?: number;
  heapTotal?: number;
  rss?: number;
  external?: number;
  arrayBuffers?: number;
  osFreeMemory?: number;
  osTotalMemory?: number;
  nodeVersion?: string;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function barColor(pct: number): string {
  if (pct >= 80) return '#ef4444';
  if (pct >= 60) return '#f59e0b';
  return '#10b981';
}

function StatusChip({ value, color }: { value: string; color: string }) {
  return (
    <span
      className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      {value}
    </span>
  );
}

function MetricRow({ label, value, bar, color }: {
  label: string;
  value: string;
  bar?: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0" style={{ borderColor: `color-mix(in srgb, ${color} 8%, transparent)` }}>
      <span className="text-[11px] text-[var(--color-text-muted)] w-[150px] shrink-0">{label}</span>
      {bar !== undefined && (
        <div className="flex-1 h-[5px] rounded-full max-w-[140px] overflow-hidden" style={{ background: `color-mix(in srgb, ${barColor(bar)} 14%, transparent)` }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(bar, 100)}%`, backgroundColor: barColor(bar) }}
          />
        </div>
      )}
      <StatusChip value={value} color={bar !== undefined ? barColor(bar) : color} />
    </div>
  );
}

function SectionCard({ title, icon, color, children }: {
  title: string;
  icon: React.ReactNode;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ borderColor: `color-mix(in srgb, ${color} 20%, transparent)`, background: `color-mix(in srgb, ${color} 4%, var(--color-surface))` }}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: `color-mix(in srgb, ${color} 14%, transparent)` }}>
        <span style={{ color }}>{icon}</span>
        <span className="text-[10.5px] font-bold uppercase tracking-widest" style={{ color }}>{title}</span>
      </div>
      <div className="px-4 py-0.5">{children}</div>
    </div>
  );
}

export function PerformanceTab() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const requestData = useCallback(() => {
    postMsg({ type: 'getPerformanceData' });
  }, []);

  useEffect(() => {
    requestData();
    const interval = setInterval(requestData, 3000);
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'performanceData') {
        setData(e.data.data);
        setLastRefresh(new Date());
      }
    };
    window.addEventListener('message', handler);
    return () => { clearInterval(interval); window.removeEventListener('message', handler); };
  }, [requestData]);

  const cpu = data?.cpuUsage ?? 0;
  const heapUsed = data?.heapUsed ?? data?.memoryUsage ?? 0;
  const heapTotal = data?.heapTotal ?? 0;
  const rss = data?.rss ?? data?.memoryUsage ?? 0;
  const external = data?.external ?? 0;
  const arrayBuffers = data?.arrayBuffers ?? 0;
  const osFree = data?.osFreeMemory ?? 0;
  const osTotal = data?.osTotalMemory ?? 0;
  const osUsed = osTotal - osFree;
  const heapPct = heapTotal > 0 ? (heapUsed / heapTotal) * 100 : 0;
  const osPct = osTotal > 0 ? (osUsed / osTotal) * 100 : 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto [scrollbar-gutter:stable] p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-[12px] font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
            <GaugeIcon size={13} style={{ color: '#10b981' }} />
            Memory Footprint
          </h3>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
            Extension host process · auto-refresh every 3s
            {lastRefresh && ` · last updated ${lastRefresh.toLocaleTimeString()}`}
          </p>
        </div>
        <button
          type="button"
          onClick={requestData}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] cursor-pointer transition-all border"
          style={{ color: '#10b981', borderColor: 'color-mix(in srgb, #10b981 25%, transparent)', background: 'color-mix(in srgb, #10b981 8%, transparent)' }}
          title="Force refresh"
        >
          <RefreshIcon size={12} />
          Refresh
        </button>
      </div>

      {!data && (
        <div className="text-[11px] text-[var(--color-text-muted)] text-center py-8">Connecting to extension host…</div>
      )}

      {data && (
        <>
          {/* Heap Memory — teal */}
          <SectionCard title="Heap Memory" color="#10b981" icon={<MemoryIcon size={13} />}>
            <MetricRow label="Heap Used" value={`${formatBytes(heapUsed)} / ${formatBytes(heapTotal)}`} bar={heapPct} color="#10b981" />
            <MetricRow label="Heap Total (allocated)" value={formatBytes(heapTotal)} color="#10b981" />
          </SectionCard>

          {/* Process Memory — blue */}
          <SectionCard title="Process Memory" color="#06b6d4" icon={<MemoryIcon size={13} />}>
            <MetricRow label="RSS (Resident Set)" value={formatBytes(rss)} color="#06b6d4" />
            <MetricRow label="External (C++ objects)" value={formatBytes(external)} color="#06b6d4" />
            <MetricRow label="Array Buffers" value={formatBytes(arrayBuffers)} color="#06b6d4" />
          </SectionCard>

          {/* OS Memory — indigo */}
          {osTotal > 0 && (
            <SectionCard title="System Memory" color="#818cf8" icon={<GaugeIcon size={13} />}>
              <MetricRow label="OS Memory Used" value={`${formatBytes(osUsed)} / ${formatBytes(osTotal)}`} bar={osPct} color="#818cf8" />
              <MetricRow label="OS Free Memory" value={formatBytes(osFree)} color="#818cf8" />
            </SectionCard>
          )}

          {/* Process Info — purple */}
          <SectionCard title="Process Info" color="#a855f7" icon={<ProcessIcon size={13} />}>
            <MetricRow label="CPU Usage" value={`${cpu.toFixed(1)}%`} bar={cpu} color="#a855f7" />
            <MetricRow label="Uptime" value={formatUptime(data.uptime)} color="#a855f7" />
            <MetricRow label="Process ID" value={String(data.processId)} color="#a855f7" />
            {data.nodeVersion && (
              <MetricRow label="Node.js Version" value={data.nodeVersion} color="#a855f7" />
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
