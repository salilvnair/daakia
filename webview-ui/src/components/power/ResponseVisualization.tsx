/**
 * ResponseVisualization — render JSON arrays as tables, images/PDFs inline.
 * Feature 6B.6 — Response visualization
 */
import { useState, useMemo } from 'react';

interface Props {
  responseBody: string;
  contentType?: string;
}

type VisualizationMode = 'table' | 'chart' | 'image' | 'pdf' | 'none';

function detectMode(body: string, contentType: string = ''): VisualizationMode {
  if (contentType.includes('image/')) return 'image';
  if (contentType.includes('application/pdf')) return 'pdf';
  if (!body.trim()) return 'none';
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') return 'table';
    return 'none';
  } catch {
    return 'none';
  }
}

function JsonTable({ data }: { data: Record<string, unknown>[] }) {
  if (data.length === 0) return null;

  // Collect all keys across all rows
  const allKeys = Array.from(new Set(data.flatMap(row => Object.keys(row))));
  const displayKeys = allKeys.slice(0, 12); // max 12 columns

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-[10.5px] border-collapse">
        <thead>
          <tr style={{ backgroundColor: 'var(--color-surface-hover)' }}>
            <th className="px-2 py-1.5 text-left border-b font-semibold sticky top-0"
              style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-surface-hover)' }}>
              #
            </th>
            {displayKeys.map(key => (
              <th key={key} className="px-2 py-1.5 text-left border-b font-semibold sticky top-0 whitespace-nowrap"
                style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-surface-hover)' }}>
                {key}
              </th>
            ))}
            {allKeys.length > 12 && (
              <th className="px-2 py-1.5 text-left border-b font-semibold sticky top-0"
                style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface-hover)' }}>
                +{allKeys.length - 12} more
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 500).map((row, i) => (
            <tr key={i} className="border-b hover:bg-[var(--color-surface-hover)] transition-colors"
              style={{ borderColor: 'var(--color-surface-border)' }}>
              <td className="px-2 py-1.5" style={{ color: 'var(--color-text-muted)' }}>{i + 1}</td>
              {displayKeys.map(key => {
                const val = row[key];
                const isNull = val === null || val === undefined;
                const isBool = typeof val === 'boolean';
                const isNum = typeof val === 'number';
                const displayVal = isNull ? '—' : typeof val === 'object' ? JSON.stringify(val).slice(0, 50) : String(val);
                return (
                  <td key={key} className="px-2 py-1.5 max-w-[200px]"
                    style={{
                      color: isNull ? 'var(--color-text-muted)' : isBool ? 'var(--color-warning)' : isNum ? 'var(--color-info)' : 'var(--color-text-primary)',
                    }}>
                    <span className="block truncate" title={String(val ?? '')}>{displayVal}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 500 && (
        <p className="text-[10px] px-3 py-2" style={{ color: 'var(--color-text-muted)' }}>
          Showing 500 of {data.length} rows
        </p>
      )}
    </div>
  );
}

export function ResponseVisualization({ responseBody, contentType }: Props) {
  const mode = useMemo(() => detectMode(responseBody, contentType), [responseBody, contentType]);
  const [manualMode, setManualMode] = useState<VisualizationMode | null>(null);

  const activeMode = manualMode || mode;

  let parsedData: Record<string, unknown>[] = [];
  if (activeMode === 'table') {
    try {
      const arr = JSON.parse(responseBody);
      parsedData = Array.isArray(arr) ? arr : [];
    } catch { /* ignore */ }
  }

  if (mode === 'none' && !manualMode) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>No visualization available for this response type</p>
        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Works with: JSON arrays, images (PNG/JPG), PDFs</p>
        <button type="button" onClick={() => setManualMode('table')}
          className="text-[10.5px] px-3 py-1 rounded-md border cursor-pointer"
          style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
          Try as table anyway
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b flex-shrink-0"
        style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-hover)' }}>
        <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          {activeMode === 'table' ? `Table — ${parsedData.length} rows` :
           activeMode === 'image' ? 'Image' :
           activeMode === 'pdf' ? 'PDF' : 'Visualization'}
        </span>
        <div className="flex gap-1 ml-auto">
          {(['table'] as const).map(m => (
            <button key={m} type="button" onClick={() => setManualMode(m)}
              className="px-2 py-0.5 text-[9.5px] rounded border cursor-pointer"
              style={{
                borderColor: activeMode === m ? 'var(--color-info)' : 'var(--color-surface-border)',
                color: activeMode === m ? 'var(--color-info)' : 'var(--color-text-muted)',
              }}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeMode === 'table' && (
          parsedData.length > 0
            ? <JsonTable data={parsedData} />
            : <div className="flex items-center justify-center h-full">
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Response is not a JSON array</p>
              </div>
        )}

        {activeMode === 'image' && (
          <div className="flex items-center justify-center h-full p-4">
            <img
              src={`data:${contentType};base64,${btoa(responseBody)}`}
              alt="Response image"
              className="max-w-full max-h-full object-contain rounded-lg"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}

        {activeMode === 'pdf' && (
          <div className="flex items-center justify-center h-full flex-col gap-2">
            <span className="text-[32px]">📄</span>
            <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>PDF response detected</p>
            <button type="button"
              onClick={() => {
                const blob = new Blob([responseBody], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                window.open(url);
              }}
              className="text-[10.5px] px-3 py-1 rounded-md border cursor-pointer"
              style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
              Open PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
