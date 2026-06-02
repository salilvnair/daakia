import { useState, useMemo, useCallback } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { SearchIcon } from '../../icons';

// ────────── Types ──────────

interface SchemaType {
  name: string;
  kind: string;
  description?: string;
  fields?: SchemaField[];
  inputFields?: SchemaField[];
  enumValues?: { name: string; description?: string }[];
}

interface SchemaField {
  name: string;
  type: GqlType;
  args?: { name: string; type: GqlType }[];
  description?: string;
}

interface GqlType {
  name: string | null;
  kind: string;
  ofType?: GqlType | null;
}

// ────────── Helpers ──────────

function resolveTypeName(t: GqlType): string {
  if (t.kind === 'NON_NULL') return resolveTypeName(t.ofType!) + '!';
  if (t.kind === 'LIST') return '[' + resolveTypeName(t.ofType!) + ']';
  return t.name || 'Unknown';
}

function getBaseTypeName(t: GqlType): string | null {
  if (t.kind === 'NON_NULL' || t.kind === 'LIST') return getBaseTypeName(t.ofType!);
  return t.name;
}

const SCALAR_TYPES = new Set(['String', 'Int', 'Float', 'Boolean', 'ID']);

function getTypeColor(name: string | null, kind?: string): string {
  if (!name) return 'var(--color-text-muted)';
  if (SCALAR_TYPES.has(name)) return 'var(--color-info)';
  if (kind === 'ENUM') return 'var(--color-warning)';
  if (kind === 'INPUT_OBJECT') return 'var(--color-warning)';
  return 'var(--color-protocol-graphql)';
}

/** Strip markdown-style backticks and [link](url) from descriptions */
function renderDescription(desc: string): string {
  return desc
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

// ────────── Breadcrumb Path ──────────

interface BreadcrumbPath {
  label: string;
  typeName: string | null; // null = Root
}

// ────────── Panel ──────────

export function GraphQLDocumentationPanel() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [search, setSearch] = useState('');
  const [path, setPath] = useState<BreadcrumbPath[]>([{ label: 'Root', typeName: null }]);

  const schema = activeTab?.authData?.['gql_schema'];
  const parsed = useMemo(() => {
    if (!schema) return null;
    try { return JSON.parse(schema); } catch { return null; }
  }, [schema]);

  const navigateTo = useCallback((label: string, typeName: string) => {
    setPath(prev => [...prev, { label, typeName }]);
    setSearch('');
  }, []);

  const navigateToIndex = useCallback((idx: number) => {
    setPath(prev => prev.slice(0, idx + 1));
    setSearch('');
  }, []);

  if (!activeTab?.authData?.['gql_connected']) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] gap-2 px-4">
        <span className="text-[24px] opacity-20">📖</span>
        <p className="text-[12px] text-center">Connect to a GraphQL endpoint to view documentation</p>
      </div>
    );
  }

  if (!parsed) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] gap-2 px-4">
        <div className="w-4 h-4 border-2 border-[var(--color-protocol-graphql)] border-t-transparent rounded-full animate-spin" />
        <p className="text-[12px]">Loading schema...</p>
      </div>
    );
  }

  const types: SchemaType[] = parsed.types || [];
  const typesMap = new Map(types.map(t => [t.name, t]));
  const currentCrumb = path[path.length - 1];

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 py-2 border-b border-[var(--color-surface-border)]">
        <div className="relative">
          <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search types..."
            className="w-full h-[32px] pl-8 pr-3 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="px-3 py-1.5 border-b border-[var(--color-surface-border)] flex items-center gap-1 flex-wrap">
        {path.map((crumb, idx) => {
          const crumbType = crumb.typeName ? typesMap.get(crumb.typeName) : null;
          const crumbColor = crumb.typeName === null
            ? 'var(--color-text-muted)'
            : getTypeColor(crumb.typeName, crumbType?.kind);
          return (
            <span key={idx} className="flex items-center gap-1">
              {idx > 0 && <span className="text-[11px] text-[var(--color-text-muted)]">›</span>}
              <button
                type="button"
                onClick={() => navigateToIndex(idx)}
                className={`text-[11px] font-medium font-mono cursor-pointer transition-opacity ${
                  idx === path.length - 1 ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                }`}
                style={{ color: crumbColor }}
              >
                {crumb.label}
              </button>
            </span>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-none px-4 py-3">
        {currentCrumb.typeName === null ? (
          <RootView
            parsed={parsed}
            types={types}
            search={search}
            onNavigate={navigateTo}
          />
        ) : (
          <TypeDetailView
            typeName={currentCrumb.typeName}
            typesMap={typesMap}
            onNavigate={navigateTo}
          />
        )}
      </div>
    </div>
  );
}

// ────────── Root View ──────────

function RootView({
  parsed,
  types,
  search,
  onNavigate,
}: {
  parsed: any;
  types: SchemaType[];
  search: string;
  onNavigate: (label: string, typeName: string) => void;
}) {
  const queryType = parsed.queryType?.name;
  const mutationType = parsed.mutationType?.name;
  const subscriptionType = parsed.subscriptionType?.name;

  // Show all types including scalars
  const userTypes = types.filter((t: SchemaType) => !t.name.startsWith('__'));
  const filtered = search
    ? userTypes.filter((t: SchemaType) => t.name.toLowerCase().includes(search.toLowerCase()))
    : userTypes;

  return (
    <>
      {/* Description */}
      <p className="text-[13px] text-[var(--color-text-muted)] mb-5">
        A GraphQL schema provides a root type for each kind of operation.
      </p>

      {/* Root Types */}
      {!search && (
        <>
          <h4 className="text-[15px] font-bold text-[var(--color-text-primary)] mb-3">Root Types</h4>
          <div className="space-y-2.5 mb-6">
            {queryType && (
              <RootTypeEntry name="query" typeName={queryType} onNavigate={onNavigate} />
            )}
            {mutationType && (
              <RootTypeEntry name="mutation" typeName={mutationType} onNavigate={onNavigate} />
            )}
            {subscriptionType && (
              <RootTypeEntry name="subscription" typeName={subscriptionType} onNavigate={onNavigate} />
            )}
          </div>
        </>
      )}

      {/* All Schema Types */}
      <h4 className="text-[15px] font-bold text-[var(--color-text-primary)] mb-3">All Schema Types</h4>
      <div className="space-y-1.5">
        {filtered.map((t: SchemaType) => (
          <button
            key={t.name}
            type="button"
            onClick={() => onNavigate(t.name, t.name)}
            className="block text-[14px] font-mono cursor-pointer transition-colors hover:opacity-80"
            style={{ color: getTypeColor(t.name, t.kind) }}
          >
            {t.name}
          </button>
        ))}
      </div>
    </>
  );
}

function RootTypeEntry({ name, typeName, onNavigate }: { name: string; typeName: string; onNavigate: (l: string, t: string) => void }) {
  return (
    <div className="text-[14px] font-mono">
      <span className="text-[var(--color-protocol-graphql)] font-medium">{name}</span>
      <span className="text-[var(--color-text-muted)]"> : </span>
      <button
        type="button"
        onClick={() => onNavigate(typeName, typeName)}
        className="text-[var(--color-success)] cursor-pointer hover:underline"
      >
        {typeName}
      </button>
    </div>
  );
}

// ────────── Type Detail View ──────────

function TypeDetailView({
  typeName,
  typesMap,
  onNavigate,
}: {
  typeName: string;
  typesMap: Map<string, SchemaType>;
  onNavigate: (label: string, typeName: string) => void;
}) {
  const type = typesMap.get(typeName);

  if (!type) {
    return (
      <p className="text-[13px] text-[var(--color-text-muted)]">Type &ldquo;{typeName}&rdquo; not found in schema.</p>
    );
  }

  const fields = type.fields || type.inputFields || [];
  const enumValues = type.enumValues || [];

  return (
    <>
      {/* Type name heading */}
      <h3 className="text-[20px] font-bold mb-2" style={{ color: getTypeColor(type.name, type.kind) }}>{type.name}</h3>

      {type.description && (
        <p className="text-[13px] text-[var(--color-text-secondary)] mb-4 leading-relaxed">
          {renderDescription(type.description)}
        </p>
      )}

      {/* Fields */}
      {fields.length > 0 && (
        <>
          <h4 className="text-[15px] font-bold text-[var(--color-text-primary)] mb-3 mt-4">Fields</h4>
          <div className="space-y-2.5">
            {fields.map((field) => (
              <FieldEntry key={field.name} field={field} typesMap={typesMap} onNavigate={onNavigate} />
            ))}
          </div>
        </>
      )}

      {/* Enum Values */}
      {enumValues.length > 0 && (
        <>
          <h4 className="text-[15px] font-bold text-[var(--color-text-primary)] mb-3 mt-4">Enum Values</h4>
          <div className="space-y-1.5">
            {enumValues.map((v) => (
              <div key={v.name} className="text-[14px] font-mono text-[var(--color-warning)]">
                {v.name}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function FieldEntry({
  field,
  typesMap,
  onNavigate,
}: {
  field: SchemaField;
  typesMap: Map<string, SchemaType>;
  onNavigate: (label: string, typeName: string) => void;
}) {
  const baseType = getBaseTypeName(field.type);
  const typeStr = resolveTypeName(field.type);
  const isClickable = baseType && typesMap.has(baseType) && !SCALAR_TYPES.has(baseType);
  const hasArgs = field.args && field.args.length > 0;

  return (
    <div className="text-[14px] font-mono leading-relaxed">
      <span className="text-[var(--color-protocol-graphql)]">{field.name}</span>
      {hasArgs && (
        <span className="text-[var(--color-text-muted)]"> (...)</span>
      )}
      <span className="text-[var(--color-text-muted)]"> : </span>
      <TypeDisplay typeStr={typeStr} baseType={baseType} typesMap={typesMap} onNavigate={onNavigate} isClickable={!!isClickable} />
    </div>
  );
}

function TypeDisplay({
  typeStr,
  baseType,
  typesMap,
  onNavigate,
  isClickable,
}: {
  typeStr: string;
  baseType: string | null;
  typesMap: Map<string, SchemaType>;
  onNavigate: (label: string, typeName: string) => void;
  isClickable: boolean;
}) {
  if (!isClickable || !baseType) {
    const typeObj = baseType ? typesMap.get(baseType) : null;
    return (
      <span style={{ color: getTypeColor(baseType, typeObj?.kind) }}>{typeStr}</span>
    );
  }

  const typeObj = typesMap.get(baseType);
  const color = getTypeColor(baseType, typeObj?.kind);
  const idx = typeStr.indexOf(baseType);
  const prefix = typeStr.slice(0, idx);
  const suffix = typeStr.slice(idx + baseType.length);

  return (
    <span>
      {prefix && <span style={{ color }}>{prefix}</span>}
      <button
        type="button"
        onClick={() => onNavigate(baseType, baseType)}
        className="cursor-pointer hover:underline"
        style={{ color }}
      >
        {baseType}
      </button>
      {suffix && <span style={{ color }}>{suffix}</span>}
    </span>
  );
}
