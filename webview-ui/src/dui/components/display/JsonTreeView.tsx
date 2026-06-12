import { useState } from 'react';
import './JsonTreeView.css';

export interface JsonTreeViewProps {
  data: unknown;
  /** Optional label shown as the root key */
  name?: string;
  /** Expand nodes at depth < defaultExpandDepth (default: 2) */
  defaultExpandDepth?: number;
  /** Stop rendering children beyond this depth (default: 8) */
  maxDepth?: number;
  className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ValueType = 'string' | 'number' | 'boolean' | 'null' | 'fn' | 'object' | 'array';

function getValueType(v: unknown): ValueType {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v.startsWith('<') ? 'fn' : 'string';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'object') return 'object';
  return 'null';
}

function getPreview(v: unknown, expanded: boolean): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') {
    if (v.startsWith('<')) return v;
    return `'${v.length > 60 ? v.slice(0, 60) + '…' : v}'`;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    if (expanded) return `Array(${v.length})`;
    const inner = v.slice(0, 4).map(i => getShort(i)).join(', ');
    return `(${v.length}) [${inner}${v.length > 4 ? ', …' : ''}]`;
  }
  if (typeof v === 'object') {
    if (expanded) return '{…}';
    const keys = Object.keys(v as Record<string, unknown>);
    const inner = keys.slice(0, 3).map(k => `${k}: ${getShort((v as Record<string, unknown>)[k])}`).join(', ');
    return `{${inner}${keys.length > 3 ? ', …' : ''}}`;
  }
  return String(v);
}

function getShort(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return `'${v.length > 12 ? v.slice(0, 12) + '…' : v}'`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `Array(${v.length})`;
  if (typeof v === 'object') return '{…}';
  return String(v);
}

// ─── JsonNode (recursive) ────────────────────────────────────────────────────

interface JsonNodeProps {
  name?: string;
  value: unknown;
  depth: number;
  defaultExpandDepth: number;
  maxDepth: number;
}

function JsonNode({ name, value, depth, defaultExpandDepth, maxDepth }: JsonNodeProps) {
  const [expanded, setExpanded] = useState(depth < defaultExpandDepth);
  const type = getValueType(value);
  const isExpandable = type === 'object' || type === 'array';
  const atMaxDepth = depth >= maxDepth;

  return (
    <div>
      <div
        className={`dui_json-tree__row${isExpandable ? ' dui_json-tree__row--expandable' : ''}`}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onClick={isExpandable && !atMaxDepth ? () => setExpanded(v => !v) : undefined}
      >
        {isExpandable && !atMaxDepth ? (
          <span className={`dui_json-tree__chevron${expanded ? ' dui_json-tree__chevron--open' : ''}`}>
            ▶
          </span>
        ) : (
          <span className="dui_json-tree__chevron-spacer" />
        )}

        {name !== undefined && (
          <>
            <span className="dui_json-tree__key">{name}</span>
            <span className="dui_json-tree__eq"> =</span>
          </>
        )}

        <span className={`dui_json-tree__value dui_json-tree__value--${type}`}>
          {getPreview(value, expanded && isExpandable)}
        </span>
      </div>

      {expanded && isExpandable && !atMaxDepth && (
        <>
          {Array.isArray(value)
            ? (value as unknown[]).map((item, idx) => (
                <JsonNode
                  key={idx}
                  name={String(idx)}
                  value={item}
                  depth={depth + 1}
                  defaultExpandDepth={defaultExpandDepth}
                  maxDepth={maxDepth}
                />
              ))
            : Object.entries(value as Record<string, unknown>).map(([k, v]) => (
                <JsonNode
                  key={k}
                  name={k}
                  value={v}
                  depth={depth + 1}
                  defaultExpandDepth={defaultExpandDepth}
                  maxDepth={maxDepth}
                />
              ))
          }
          {Array.isArray(value) && (
            <div
              className="dui_json-tree__length"
              style={{ paddingLeft: `${(depth + 1) * 14 + 4}px` }}
            >
              length: {(value as unknown[]).length}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function JsonTreeView({
  data,
  name,
  defaultExpandDepth = 2,
  maxDepth = 8,
  className = '',
}: JsonTreeViewProps) {
  return (
    <div className={`dui_json-tree${className ? ` ${className}` : ''}`}>
      <JsonNode
        name={name}
        value={data}
        depth={0}
        defaultExpandDepth={defaultExpandDepth}
        maxDepth={maxDepth}
      />
    </div>
  );
}
