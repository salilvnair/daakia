import { useState } from 'react';
import { METHOD_COLORS } from '../../../colors';

function formatJsonSafe(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function SubRequestRow({ sr }: { sr: { method: string; url: string; status: number; statusText: string; duration: number; timestamp: number; phase: string; requestHeaders?: Record<string, string>; requestBody?: string; responseHeaders?: Record<string, string>; responseBody?: string } }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = sr.requestHeaders || sr.requestBody || sr.responseHeaders || sr.responseBody;
  const statusColor = sr.status === 0 ? 'var(--color-danger)' : sr.status < 300 ? 'var(--color-success)' : sr.status < 400 ? '#f59e0b' : '#ef4444';

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-2 py-[4px] text-[11px] rounded hover:bg-[var(--color-input-bg)] ${hasDetails ? 'cursor-pointer' : ''}`}
        onClick={hasDetails ? () => setExpanded(!expanded) : undefined}
      >
        {hasDetails && (
          <span className={`text-[8px] text-[var(--color-text-muted)] transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
        )}
        <span className="text-[9px] px-1 py-[1px] rounded bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-text-muted)] font-mono uppercase flex-shrink-0">
          {sr.phase}
        </span>
        <span
          className="px-1 py-[1px] rounded text-[9px] font-bold font-mono flex-shrink-0"
          style={{ color: METHOD_COLORS[sr.method] || 'var(--color-text-primary)', backgroundColor: `color-mix(in srgb, ${METHOD_COLORS[sr.method] || 'var(--color-text-primary)'} 12%, transparent)` }}
        >
          {sr.method}
        </span>
        <span className="text-[11px] text-[var(--color-text-primary)] font-mono truncate flex-1">{sr.url}</span>
        <span
          className="px-1 py-[1px] rounded text-[9px] font-mono font-bold flex-shrink-0"
          style={{ color: statusColor, backgroundColor: `color-mix(in srgb, ${statusColor} 12%, transparent)` }}
        >
          {sr.status || 'ERR'}
        </span>
        <span className="px-1 py-[1px] rounded text-[9px] font-mono bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)] font-semibold flex-shrink-0">
          {sr.duration}ms
        </span>
      </div>
      {expanded && hasDetails && (
        <SubRequestDetails sr={sr} />
      )}
    </div>
  );
}

function SubRequestDetails({ sr }: { sr: { requestHeaders?: Record<string, string>; requestBody?: string; responseHeaders?: Record<string, string>; responseBody?: string; status: number; statusText: string; duration: number } }) {
  const [tab, setTab] = useState<'request' | 'response'>('response');

  return (
    <div className="mx-2 mb-2 mt-1 rounded border border-[var(--color-surface-border)] bg-[var(--color-surface-bg)] overflow-hidden">
      <div className="flex border-b border-[var(--color-surface-border)]">
        <button
          type="button"
          onClick={() => setTab('request')}
          className={`px-3 py-1 text-[10px] font-medium cursor-pointer ${tab === 'request' ? 'bg-[var(--color-input-bg)] text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}
        >
          Request
        </button>
        <button
          type="button"
          onClick={() => setTab('response')}
          className={`px-3 py-1 text-[10px] font-medium cursor-pointer ${tab === 'response' ? 'bg-[var(--color-input-bg)] text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}
        >
          Response
        </button>
      </div>
      <div className="p-2 max-h-[200px] overflow-y-auto [scrollbar-gutter:stable]">
        {tab === 'request' ? (
          <div className="flex flex-col gap-1.5">
            {sr.requestHeaders && Object.keys(sr.requestHeaders).length > 0 && (
              <>
                <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Headers</div>
                <div className="font-mono text-[10px] text-[var(--color-text-secondary)]">
                  {Object.entries(sr.requestHeaders).map(([k, v]) => (
                    <div key={k}><span className="text-[var(--color-accent)]">{k}</span>: {v}</div>
                  ))}
                </div>
              </>
            )}
            {sr.requestBody && (
              <>
                <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mt-1">Body</div>
                <pre className="font-mono text-[10px] text-[var(--color-text-secondary)] whitespace-pre-wrap break-all">{formatJsonSafe(sr.requestBody)}</pre>
              </>
            )}
            {!sr.requestHeaders && !sr.requestBody && (
              <div className="text-[10px] text-[var(--color-text-muted)] italic">No request details</div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[10px]">
              <span className="font-mono font-bold" style={{ color: sr.status < 300 ? 'var(--color-success)' : 'var(--color-danger)' }}>{sr.status} {sr.statusText}</span>
              <span className="text-[var(--color-text-muted)]">{sr.duration}ms</span>
            </div>
            {sr.responseHeaders && Object.keys(sr.responseHeaders).length > 0 && (
              <>
                <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Headers</div>
                <div className="font-mono text-[10px] text-[var(--color-text-secondary)]">
                  {Object.entries(sr.responseHeaders).map(([k, v]) => (
                    <div key={k}><span className="text-[var(--color-accent)]">{k}</span>: {v}</div>
                  ))}
                </div>
              </>
            )}
            {sr.responseBody && (
              <>
                <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mt-1">Body</div>
                <pre className="font-mono text-[10px] text-[var(--color-text-secondary)] whitespace-pre-wrap break-all">{formatJsonSafe(sr.responseBody)}</pre>
              </>
            )}
            {!sr.responseBody && sr.status === 0 && (
              <div className="text-[10px] text-[var(--color-danger)] italic">Request failed: {sr.statusText}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
