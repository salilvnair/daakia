/**
 * PerformanceTab — Shows application performance & system resource usage.
 * Displays: CPU Usage, Memory Usage, Uptime, Process ID (like Bruno's Performance tab).
 */
import { useState, useEffect, useCallback } from 'react';
import { CpuIcon, MemoryIcon, UptimeIcon, ProcessIcon, GaugeIcon } from '../../../icons';
import { postMsg } from '../../../vscode';

interface PerformanceData {
  cpuUsage: number;
  memoryUsage: number;
  uptime: number;
  processId: number;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

function formatMemory(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function ResourceCard({ icon, title, value, subtitle, color }: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
  color: string;
}) {
  return (
    <div
      className="flex flex-col gap-2 p-4 rounded-lg border bg-[var(--color-input-bg)]"
      style={{ borderColor: `color-mix(in srgb, ${color} 30%, transparent)` }}
    >
      <div className="flex items-center gap-2" style={{ color }}>
        {icon}
        <span className="text-[11px] font-medium">{title}</span>
      </div>
      <div className="text-[20px] font-semibold leading-tight" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] text-[var(--color-text-muted)]">
        {subtitle}
      </div>
    </div>
  );
}

export function PerformanceTab() {
  const [data, setData] = useState<PerformanceData | null>(null);

  const requestPerformanceData = useCallback(() => {
    postMsg({ type: 'getPerformanceData' });
  }, []);

  useEffect(() => {
    // Request immediately
    requestPerformanceData();

    // Poll every 3 seconds
    const interval = setInterval(requestPerformanceData, 3000);

    // Listen for response
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'performanceData') {
        setData(msg.data);
      }
    };
    window.addEventListener('message', handleMessage);

    return () => {
      clearInterval(interval);
      window.removeEventListener('message', handleMessage);
    };
  }, [requestPerformanceData]);

  // Show placeholder data while waiting for backend
  const cpuUsage = data?.cpuUsage ?? 0;
  const memoryUsage = data?.memoryUsage ?? 0;
  const uptime = data?.uptime ?? 0;
  const processId = data?.processId ?? 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto [scrollbar-gutter:stable] p-4">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-[12px] font-semibold text-[var(--color-text-primary)]">
          <span className="inline-flex items-center gap-1.5">
            <GaugeIcon size={13} style={{ color: '#10b981' }} />
            System Resources
          </span>
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Extension host process metrics • auto-refreshes every 3s</p>
      </div>

      {/* Resource cards grid */}
      <div className="grid grid-cols-2 gap-3 max-w-[600px] lg:grid-cols-4">
        <ResourceCard
          icon={<CpuIcon size={15} />}
          title="CPU Usage"
          value={`${cpuUsage.toFixed(1)}%`}
          subtitle="Total CPU usage"
          color="#f59e0b"
        />
        <ResourceCard
          icon={<MemoryIcon size={15} />}
          title="Memory Usage"
          value={formatMemory(memoryUsage)}
          subtitle="Total memory usage"
          color="#8b5cf6"
        />
        <ResourceCard
          icon={<UptimeIcon size={15} />}
          title="Uptime"
          value={formatUptime(uptime)}
          subtitle="Process runtime"
          color="#10b981"
        />
        <ResourceCard
          icon={<ProcessIcon size={15} />}
          title="Process ID"
          value={String(processId)}
          subtitle="Main process PID"
          color="#3b82f6"
        />
      </div>

      {!data && (
        <div className="mt-4 text-[11px] text-[var(--color-text-muted)]">
          Connecting to extension host...
        </div>
      )}
    </div>
  );
}
