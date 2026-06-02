/**
 * JsonTreeViewer — Expandable/collapsible JSON tree for Console logs.
 * Shows key-value pairs with syntax coloring, auto-collapses nested objects.
 * Supports optional external expand state for persistence across re-renders.
 */
import { useState, useCallback } from 'react';
import { ChevronRightIcon } from '../../../icons';

interface JsonTreeViewerProps {
  data: unknown;
  depth?: number;
  maxInitialDepth?: number;
  /** External expand state — set of expanded dot-paths (e.g., "$.items[0].name") */
  expandedPaths?: Set<string>;
  /** Called when a node is toggled. Path format: "$.key.subkey[0]" */
  onTogglePath?: (path: string) => void;
}

const MAX_INLINE_LENGTH = 60;

function getType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function getPreview(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value.length > 40 ? value.slice(0, 40) + '…' : value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return `{${keys.length} ${keys.length === 1 ? 'key' : 'keys'}}`;
  }
  return String(value);
}

function ValueDisplay({ value }: { value: unknown }) {
  const type = getType(value);
  const colorMap: Record<string, string> = {
    string: 'var(--color-success, #4ade80)',
    number: 'var(--color-primary, #818cf8)',
    boolean: 'var(--color-warning, #f59e0b)',
    null: 'var(--color-text-muted)',
  };
  const color = colorMap[type] || 'var(--color-text-primary)';
  const display = type === 'string' ? `"${value}"` : String(value);

  return <span style={{ color }}>{display}</span>;
}

function TreeNode({ keyName, value, depth, maxInitialDepth, path, expandedPaths, onTogglePath }: { keyName?: string; value: unknown; depth: number; maxInitialDepth: number; path: string; expandedPaths?: Set<string>; onTogglePath?: (path: string) => void }) {
  const type = getType(value);
  const isExpandable = type === 'object' || type === 'array';

  // Use external state if provided, otherwise local state
  const hasExternal = expandedPaths !== undefined && onTogglePath !== undefined;
  const externalExpanded = hasExternal ? expandedPaths.has(path) : false;
  const [localExpanded, setLocalExpanded] = useState(depth < maxInitialDepth);
  const expanded = hasExternal ? externalExpanded : localExpanded;

  const toggle = useCallback(() => {
    if (hasExternal) {
      onTogglePath(path);
    } else {
      setLocalExpanded(prev => !prev);
    }
  }, [hasExternal, onTogglePath, path]);

  if (!isExpandable) {
    return (
      <div className="flex items-start gap-1" style={{ paddingLeft: `${depth * 14}px` }}>
        {keyName !== undefined && (
          <span className="text-[var(--color-text-secondary)] flex-shrink-0">{keyName}:</span>
        )}
        <ValueDisplay value={value} />
      </div>
    );
  }

  const entries = type === 'array'
    ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>);

  const bracket = type === 'array' ? ['[', ']'] : ['{', '}'];

  // Compact display for small objects/arrays
  if (!expanded) {
    const preview = getPreview(value);
    return (
      <div className="flex items-start gap-1 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] rounded" style={{ paddingLeft: `${depth * 14}px` }} onClick={toggle}>
        <span className="w-3 h-3 flex items-center justify-center flex-shrink-0 mt-[1px] transition-transform">
          <ChevronRightIcon size={10} />
        </span>
        {keyName !== undefined && (
          <span className="text-[var(--color-text-secondary)] flex-shrink-0">{keyName}:</span>
        )}
        <span className="text-[var(--color-text-muted)]">{preview}</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-1 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] rounded" style={{ paddingLeft: `${depth * 14}px` }} onClick={toggle}>
        <span className="w-3 h-3 flex items-center justify-center flex-shrink-0 mt-[1px] transition-transform rotate-90">
          <ChevronRightIcon size={10} />
        </span>
        {keyName !== undefined && (
          <span className="text-[var(--color-text-secondary)] flex-shrink-0">{keyName}:</span>
        )}
        <span className="text-[var(--color-text-muted)]">{bracket[0]}</span>
      </div>
      <div>
        {entries.map(([k, v]) => (
          <TreeNode key={k} keyName={type === 'array' ? k : k} value={v} depth={depth + 1} maxInitialDepth={maxInitialDepth} path={type === 'array' ? `${path}[${k}]` : `${path}.${k}`} expandedPaths={expandedPaths} onTogglePath={onTogglePath} />
        ))}
      </div>
      <div style={{ paddingLeft: `${depth * 14}px` }}>
        <span className="text-[var(--color-text-muted)] pl-4">{bracket[1]}</span>
      </div>
    </div>
  );
}

export function JsonTreeViewer({ data, depth = 0, maxInitialDepth = 2, expandedPaths, onTogglePath }: JsonTreeViewerProps) {
  return (
    <div className="text-[11px] font-mono leading-[18px] select-text">
      <TreeNode value={data} depth={depth} maxInitialDepth={maxInitialDepth} path="$" expandedPaths={expandedPaths} onTogglePath={onTogglePath} />
    </div>
  );
}

/**
 * Tries to parse a string as JSON. Returns parsed object/array if successful, null otherwise.
 */
export function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if ((!trimmed.startsWith('{') && !trimmed.startsWith('[')) || trimmed.length < 2) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
