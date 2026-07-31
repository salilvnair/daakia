/**
 * GraphQL Schema Explorer — a port of GraphiQL Explorer's model (OneGraph/graphiql-explorer,
 * the package `graphiql-plugin-explorer` actually depends on), rebuilt on this codebase's
 * loosely-typed introspection JSON + DUI components instead of `GraphQLSchema` objects.
 *
 * Top tab bar: Schema (raw SDL) | Query | Mutation | Subscription. The three operation tabs
 * are always present; one whose root type the schema doesn't define just says so.
 *
 * Two distinct things are checkable, exactly as in the reference implementation:
 *
 *  1. FIELDS (selections). Checking one adds it to the query; unchecking removes it.
 *     Checking a nested field auto-creates every ancestor up to the root so the query stays
 *     structurally valid. Checking an object-type field auto-selects its own immediate
 *     leaf sub-fields as a starting point. A selected field whose children are then all
 *     unchecked *stays* in the query as a bare `field(args)` — matching the reference, which
 *     lets you hold a field while you decide what to select on it.
 *     A plain selected field never carries a value — GraphQL has no syntax for that — so
 *     selected fields only ever show their `: Type` label.
 *
 *  2. ARGUMENTS. A selected field's arguments render as their own indented checkbox rows
 *     beneath it (`key*: ""`, `localeId*: en_US`, …), required ones marked `*` and checked
 *     by default. Only a *checked* argument shows a value editor and appears in the query.
 *     Scalars get an inline underline input, enums and Booleans get a dropdown, and
 *     INPUT_OBJECT arguments expand into a nested group of their own fields, printing as a
 *     nested object literal (`input: { name: "", age: 0 }`).
 *
 *     Hovering a checked argument reveals a `$` button that "variablizes" it, the same way
 *     the reference does: the literal is replaced by `$argName`, and a variable definition
 *     carrying the old literal as its default is hoisted onto the operation —
 *     `query MyQuery($tag: String = "") { token(tag: $tag) }`. Clicking `$` again puts the
 *     literal back. Variable names are de-duplicated (`tag`, `tag2`, …), and the declared
 *     type is the argument's nullable form since it now has a default.
 *
 * Everything the user sets lands in the query text (regenerated wholesale via graphql-js
 * `print()` on each change) — the Variables tab is never written to.
 *
 * Known limitation: list arguments are edited as a single value (GraphQL coerces a lone
 * value to a one-item list, so the result stays valid). Union types aren't broken into
 * `... on Type` fragments; only their own selection is offered.
 */
import { useState, useMemo, useEffect, useCallback, type CSSProperties } from 'react';
import {
  parse, print, parseType, Kind,
  type DocumentNode, type OperationDefinitionNode, type SelectionSetNode, type FieldNode,
  type ArgumentNode, type ValueNode, type ObjectValueNode, type VariableDefinitionNode,
  type StringValueNode, type IntValueNode, type FloatValueNode, type BooleanValueNode,
  type EnumValueNode, type VariableNode,
} from 'graphql';
import { useTabsStore } from '../../store/tabs-store';
import { CheckboxView, TabView, SelectInputView, IconButtonView, type TabItem } from '@salilvnair/dui';
import { SearchIcon, ChevronDownIcon, ChevronRightIcon } from '../../icons';
import { GraphQLSchemaPanel } from './GraphQLSchemaPanel';

const ACCENT = 'var(--color-protocol-graphql)';
const VAR_COLOR = 'var(--color-protocol-ai)';
/** The `$` button is a quiet affordance sitting inside a dense tree, not a call to action —
 * desaturated against the muted text colour so an active variable reads as a soft tint
 * rather than a bright solid chip. */
const VAR_BTN_COLOR = `color-mix(in srgb, ${VAR_COLOR} 60%, var(--color-text-muted))`;
const VAR_BTN_ACTIVE_BG = `color-mix(in srgb, ${VAR_COLOR} 14%, transparent)`;

// ── Loosely-typed introspection shapes (mirrors GraphQLDocumentationPanel.tsx) ──

interface SchemaType {
  name: string;
  kind: string;
  fields?: SchemaField[];
  inputFields?: SchemaField[];
  enumValues?: { name: string }[];
}
interface SchemaField {
  name: string;
  type: GqlType;
  args?: ArgDef[];
}
interface ArgDef {
  name: string;
  type: GqlType;
}
interface GqlType {
  name: string | null;
  kind: string;
  ofType?: GqlType | null;
}

function resolveTypeName(t: GqlType): string {
  if (t.kind === 'NON_NULL') return resolveTypeName(t.ofType!) + '!';
  if (t.kind === 'LIST') return '[' + resolveTypeName(t.ofType!) + ']';
  return t.name || 'Unknown';
}
/** The type to declare a variable as. A variablized argument always gets a default value,
 * and a non-null variable can't have one, so the outer NON_NULL is stripped — matching the
 * reference's `variablize`, which unwraps `NonNullType` before attaching `defaultValue`. */
function nullableTypeName(t: GqlType): string {
  return t.kind === 'NON_NULL' ? resolveTypeName(t.ofType!) : resolveTypeName(t);
}
function getBaseTypeName(t: GqlType): string | null {
  if (t.kind === 'NON_NULL' || t.kind === 'LIST') return getBaseTypeName(t.ofType!);
  return t.name;
}
/** Mirrors the reference's `isRequiredArgument` — a NON_NULL argument with no default. The
 * introspection payload this codebase stores doesn't carry `defaultValue`, so NON_NULL alone
 * decides it; a required arg is checked by default when its field is selected. */
function isRequiredArg(arg: ArgDef): boolean {
  return arg.type.kind === 'NON_NULL';
}
const SCALAR_TYPES = new Set(['String', 'Int', 'Float', 'Boolean', 'ID']);
function isLeafType(baseType: string | null, typesMap: Map<string, SchemaType>): boolean {
  if (!baseType) return true;
  if (SCALAR_TYPES.has(baseType)) return true;
  const t = typesMap.get(baseType);
  return !t || t.kind === 'ENUM' || t.kind === 'SCALAR';
}
function getTypeColor(name: string | null, kind?: string): string {
  if (!name) return 'var(--color-text-muted)';
  if (SCALAR_TYPES.has(name)) return 'var(--color-info)';
  if (kind === 'ENUM') return 'var(--color-warning)';
  return ACCENT;
}

// ── Argument values ──

type ArgKind = 'string' | 'number' | 'boolean';
type ArgClass = ArgKind | 'enum' | 'object' | 'unsupported';
/** Enum literals are tagged so they print as an unquoted `EnumValue` node rather than a
 * string; variablized arguments are tagged so they print as `$name` while carrying the type
 * and old literal needed to declare the variable on the operation. */
interface EnumArgValue { __enum: string }
interface VariableArgValue { __var: string; __typeName: string; __default: ArgValue }
type ArgValue = string | number | boolean | EnumArgValue | VariableArgValue | { [key: string]: ArgValue };

function isEnumArgValue(v: ArgValue): v is EnumArgValue {
  return typeof v === 'object' && v !== null && '__enum' in v;
}
function isVariableArgValue(v: ArgValue): v is VariableArgValue {
  return typeof v === 'object' && v !== null && '__var' in v;
}
/** A plain nested input-object value (as opposed to one of the tagged wrappers above). */
function isObjectArgValue(v: ArgValue): v is Record<string, ArgValue> {
  return typeof v === 'object' && v !== null && !isEnumArgValue(v) && !isVariableArgValue(v);
}

function classifyArgType(baseType: string | null, typesMap: Map<string, SchemaType>): ArgClass {
  if (baseType === 'String' || baseType === 'ID') return 'string';
  if (baseType === 'Int' || baseType === 'Float') return 'number';
  if (baseType === 'Boolean') return 'boolean';
  const t = baseType ? typesMap.get(baseType) : undefined;
  if (t?.kind === 'ENUM') return 'enum';
  if (t?.kind === 'INPUT_OBJECT') return 'object';
  return 'unsupported';
}
function defaultScalarValue(kind: ArgKind): ArgValue {
  if (kind === 'string') return '';
  if (kind === 'number') return 0;
  return true;
}
/** The starting value for a newly-checked argument, recursing into input objects. */
function defaultValueForArg(arg: ArgDef, typesMap: Map<string, SchemaType>): ArgValue | undefined {
  const baseType = getBaseTypeName(arg.type);
  const cls = classifyArgType(baseType, typesMap);
  if (cls === 'unsupported') return undefined;
  if (cls === 'enum') {
    const first = typesMap.get(baseType!)?.enumValues?.[0]?.name;
    return first ? { __enum: first } : undefined;
  }
  if (cls === 'object') {
    return defaultInputObjectValue(typesMap.get(baseType!)?.inputFields, typesMap);
  }
  return defaultScalarValue(cls);
}
/** Mirrors the reference's `defaultInputObjectFields`: only *required* input fields are
 * pre-populated, so an input object doesn't explode into every optional field at once. */
function defaultInputObjectValue(inputFields: SchemaField[] | undefined, typesMap: Map<string, SchemaType>): Record<string, ArgValue> {
  const out: Record<string, ArgValue> = {};
  for (const f of inputFields || []) {
    if (!isRequiredArg(f)) continue;
    const v = defaultValueForArg(f, typesMap);
    if (v !== undefined) out[f.name] = v;
  }
  return out;
}
/** Required arguments are checked automatically when their field is selected. */
function defaultArgsForField(field: SchemaField, typesMap: Map<string, SchemaType>): Record<string, ArgValue> | undefined {
  const out: Record<string, ArgValue> = {};
  for (const arg of field.args || []) {
    if (!isRequiredArg(arg)) continue;
    const v = defaultValueForArg(arg, typesMap);
    if (v !== undefined) out[arg.name] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
/** Arguments we can render a control for at all (everything except list-of-object etc.). */
function editableArgs(field: SchemaField | undefined, typesMap: Map<string, SchemaType>): ArgDef[] {
  return (field?.args || []).filter(a => classifyArgType(getBaseTypeName(a.type), typesMap) !== 'unsupported');
}

// ── Selection tree ──
//
// A checked field is present in its parent's `children` map; its own `children` map holds
// whichever of *its* sub-fields are also checked. `args` holds only the arguments the user
// has actually checked, keyed by argument name.

interface FieldSelectionNode {
  children: Map<string, FieldSelectionNode>;
  args?: Record<string, ArgValue>;
}
type SelectionMap = Map<string, FieldSelectionNode>;

function cloneArgValue(v: ArgValue): ArgValue {
  if (isEnumArgValue(v)) return { __enum: v.__enum };
  if (isVariableArgValue(v)) return { __var: v.__var, __typeName: v.__typeName, __default: cloneArgValue(v.__default) };
  if (isObjectArgValue(v)) {
    const out: Record<string, ArgValue> = {};
    for (const k in v) out[k] = cloneArgValue(v[k]);
    return out;
  }
  return v;
}
function cloneArgs(args?: Record<string, ArgValue>): Record<string, ArgValue> | undefined {
  if (!args) return undefined;
  const out: Record<string, ArgValue> = {};
  for (const k in args) out[k] = cloneArgValue(args[k]);
  return out;
}
function cloneSelection(map: SelectionMap): SelectionMap {
  const out: SelectionMap = new Map();
  for (const [k, v] of map) out.set(k, { children: cloneSelection(v.children), args: cloneArgs(v.args) });
  return out;
}

/** Variable definitions declared on the operation, so a `$name` in the body can be read back
 * with its type and default intact when the tree is re-seeded from query text. */
type VarDefLookup = Map<string, { typeName: string; def: ArgValue }>;

function valueNodeToArgValue(v: ValueNode, varDefs: VarDefLookup): ArgValue | undefined {
  if (v.kind === Kind.STRING) return v.value;
  if (v.kind === Kind.INT) return parseInt(v.value, 10);
  if (v.kind === Kind.FLOAT) return parseFloat(v.value);
  if (v.kind === Kind.BOOLEAN) return v.value;
  if (v.kind === Kind.ENUM) return { __enum: v.value };
  if (v.kind === Kind.VARIABLE) {
    const declared = varDefs.get(v.name.value);
    return { __var: v.name.value, __typeName: declared?.typeName || 'String', __default: declared?.def ?? '' };
  }
  if (v.kind === Kind.OBJECT) {
    const rec: Record<string, ArgValue> = {};
    for (const f of v.fields) {
      const fv = valueNodeToArgValue(f.value, varDefs);
      if (fv !== undefined) rec[f.name.value] = fv;
    }
    return rec;
  }
  return undefined;
}
function argNodesToRecord(argNodes: readonly ArgumentNode[] | undefined, varDefs: VarDefLookup): Record<string, ArgValue> | undefined {
  if (!argNodes || argNodes.length === 0) return undefined;
  const rec: Record<string, ArgValue> = {};
  for (const a of argNodes) {
    const v = valueNodeToArgValue(a.value, varDefs);
    if (v !== undefined) rec[a.name.value] = v;
  }
  return Object.keys(rec).length > 0 ? rec : undefined;
}

function selectionSetToMap(ss: SelectionSetNode, varDefs: VarDefLookup): SelectionMap {
  const map: SelectionMap = new Map();
  for (const sel of ss.selections) {
    if (sel.kind === Kind.FIELD) {
      map.set(sel.name.value, {
        children: sel.selectionSet ? selectionSetToMap(sel.selectionSet, varDefs) : new Map(),
        args: argNodesToRecord(sel.arguments, varDefs),
      });
    }
  }
  return map;
}

function valueNodeFor(value: ArgValue): ValueNode {
  if (typeof value === 'boolean') return { kind: Kind.BOOLEAN, value } as BooleanValueNode;
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? ({ kind: Kind.INT, value: String(value) } as IntValueNode)
      : ({ kind: Kind.FLOAT, value: String(value) } as FloatValueNode);
  }
  if (typeof value === 'string') return { kind: Kind.STRING, value, block: false } as StringValueNode;
  if (isEnumArgValue(value)) return { kind: Kind.ENUM, value: value.__enum } as EnumValueNode;
  if (isVariableArgValue(value)) {
    return { kind: Kind.VARIABLE, name: { kind: Kind.NAME, value: value.__var } } as VariableNode;
  }
  return {
    kind: Kind.OBJECT,
    fields: Object.entries(value).map(([name, v]) => ({
      kind: Kind.OBJECT_FIELD,
      name: { kind: Kind.NAME, value: name },
      value: valueNodeFor(v),
    })),
  } as ObjectValueNode;
}
function argsRecordToNodes(args?: Record<string, ArgValue>): ArgumentNode[] {
  if (!args) return [];
  return Object.entries(args).map(([name, value]) => ({
    kind: Kind.ARGUMENT,
    name: { kind: Kind.NAME, value: name },
    value: valueNodeFor(value),
  } as ArgumentNode));
}

/** Walks the whole tree gathering every variablized argument (at any depth, including inside
 * input objects) so the operation can declare them. */
function collectVariables(map: SelectionMap, out: VarDefLookup): void {
  for (const [, node] of map) {
    if (node.args) collectVariablesFromArgs(node.args, out);
    collectVariables(node.children, out);
  }
}
function collectVariablesFromArgs(args: Record<string, ArgValue>, out: VarDefLookup): void {
  for (const k in args) {
    const v = args[k];
    if (isVariableArgValue(v)) out.set(v.__var, { typeName: v.__typeName, def: v.__default });
    else if (isObjectArgValue(v)) collectVariablesFromArgs(v, out);
  }
}
function variableDefinitionNodes(map: SelectionMap): VariableDefinitionNode[] {
  const found: VarDefLookup = new Map();
  collectVariables(map, found);
  return [...found.entries()].map(([name, { typeName, def }]) => ({
    kind: Kind.VARIABLE_DEFINITION,
    variable: { kind: Kind.VARIABLE, name: { kind: Kind.NAME, value: name } },
    type: parseType(typeName),
    defaultValue: valueNodeFor(def),
    directives: [],
  } as VariableDefinitionNode));
}

function mapToSelectionSet(map: SelectionMap): SelectionSetNode | undefined {
  if (map.size === 0) return undefined;
  return {
    kind: Kind.SELECTION_SET,
    selections: [...map.entries()].map(([name, node]) => ({
      kind: Kind.FIELD,
      name: { kind: Kind.NAME, value: name },
      arguments: argsRecordToNodes(node.args),
      selectionSet: mapToSelectionSet(node.children),
    } as FieldNode)),
  };
}

/** Walks `path` and returns the node it names, or undefined if any segment is missing. */
function nodeAtPath(map: SelectionMap, path: string[]): FieldSelectionNode | undefined {
  let cursor = map;
  for (let i = 0; i < path.length - 1; i++) {
    const node = cursor.get(path[i]);
    if (!node) return undefined;
    cursor = node.children;
  }
  return cursor.get(path[path.length - 1]);
}

type OperationKind = 'query' | 'mutation' | 'subscription';
type PanelTab = 'schema' | OperationKind;
const OP_LABEL: Record<OperationKind, string> = { query: 'MyQuery', mutation: 'MyMutation', subscription: 'MySubscription' };
const PANEL_TABS: TabItem[] = [
  { id: 'schema', label: 'Schema' },
  { id: 'query', label: 'Query' },
  { id: 'mutation', label: 'Mutation' },
  { id: 'subscription', label: 'Subscription' },
] as TabItem[];

export function GraphQLSchemaExplorer() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [panelTab, setPanelTab] = useState<PanelTab>('query');
  const [search, setSearch] = useState('');
  const [opKind, setOpKind] = useState<OperationKind>('query');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<SelectionMap>(new Map());

  const schemaStr = activeTab?.authData?.['gql_schema'];
  const parsed = useMemo(() => {
    if (!schemaStr) return null;
    try { return JSON.parse(schemaStr); } catch { return null; }
  }, [schemaStr]);
  const typesMap = useMemo(() => new Map<string, SchemaType>((parsed?.types || []).map((t: SchemaType) => [t.name, t])), [parsed]);

  const rootTypeName: string | undefined = parsed
    ? opKind === 'query' ? parsed.queryType?.name : opKind === 'mutation' ? parsed.mutationType?.name : parsed.subscriptionType?.name
    : undefined;
  const rootType = rootTypeName ? typesMap.get(rootTypeName) : undefined;

  // Re-seed the checked-field tree from the current query text whenever the tab or operation
  // kind changes — best-effort; a parse failure leaves the current checkbox state untouched
  // rather than wiping out in-progress selections.
  useEffect(() => {
    const body = activeTab?.bodyRaw;
    if (!body || !body.trim()) { setSelection(new Map()); return; }
    try {
      const doc = parse(body);
      const opDef = doc.definitions.find(
        (d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION && d.operation === opKind
      );
      if (!opDef) { setSelection(new Map()); return; }
      const varDefs: VarDefLookup = new Map();
      for (const vd of opDef.variableDefinitions || []) {
        varDefs.set(vd.variable.name.value, {
          typeName: print(vd.type),
          def: (vd.defaultValue && valueNodeToArgValue(vd.defaultValue, new Map())) ?? '',
        });
      }
      setSelection(selectionSetToMap(opDef.selectionSet, varDefs));
    } catch {
      // leave current selection untouched on parse failure
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, opKind]);

  const regenerate = useCallback((next: SelectionMap) => {
    setSelection(next);
    if (!activeTab) return;
    const selSet = mapToSelectionSet(next);
    if (!selSet) {
      updateTab(activeTab.id, { bodyRaw: '' });
      return;
    }
    const doc: DocumentNode = {
      kind: Kind.DOCUMENT,
      definitions: [{
        kind: Kind.OPERATION_DEFINITION,
        operation: opKind,
        name: { kind: Kind.NAME, value: OP_LABEL[opKind] },
        variableDefinitions: variableDefinitionNodes(next),
        directives: [],
        selectionSet: selSet,
      } as OperationDefinitionNode],
    };
    updateTab(activeTab.id, { bodyRaw: print(doc) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, opKind]);

  const toggleField = useCallback((path: string[], field: SchemaField) => {
    const next = cloneSelection(selection);
    let cursor = next;
    // Auto-vivify every missing ancestor as a bare container so a click on a deeply
    // nested field (leaf or object) always produces a structurally valid query —
    // only the clicked field itself gets selected, ancestors are not auto-populated.
    for (let i = 0; i < path.length - 1; i++) {
      const segName = path[i];
      let node = cursor.get(segName);
      if (!node) {
        node = { children: new Map() };
        cursor.set(segName, node);
      }
      cursor = node.children;
    }
    const name = path[path.length - 1];
    if (cursor.has(name)) {
      cursor.delete(name);
    } else {
      const baseType = getBaseTypeName(field.type);
      const leaf = isLeafType(baseType, typesMap);
      const children: SelectionMap = new Map();
      if (!leaf && baseType) {
        // Auto-select the object type's own immediate leaf fields as a starting point.
        const subType = typesMap.get(baseType);
        const subFields = subType?.fields || subType?.inputFields || [];
        for (const sf of subFields) {
          if (isLeafType(getBaseTypeName(sf.type), typesMap)) children.set(sf.name, { children: new Map() });
        }
        setExpandedPaths(prev => new Set(prev).add(path.join('.')));
      }
      cursor.set(name, { children, args: defaultArgsForField(field, typesMap) });
    }
    // Deliberately no empty-selection pruning: a selected field with every child unchecked
    // stays in the query as a bare `field(args)`, so it doesn't flicker out from under you
    // while you're picking sub-fields (the reference behaves the same way).
    regenerate(next);
  }, [selection, typesMap, regenerate]);

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  /** Add or remove one of a selected field's arguments (the argument's own checkbox). */
  const toggleArg = useCallback((path: string[], arg: ArgDef) => {
    const next = cloneSelection(selection);
    const node = nodeAtPath(next, path);
    if (!node) return;
    const args = { ...(node.args || {}) };
    if (arg.name in args) {
      delete args[arg.name];
    } else {
      const v = defaultValueForArg(arg, typesMap);
      if (v === undefined) return;
      args[arg.name] = v;
    }
    node.args = Object.keys(args).length > 0 ? args : undefined;
    regenerate(next);
  }, [selection, typesMap, regenerate]);

  const changeArg = useCallback((path: string[], argName: string, value: ArgValue) => {
    const next = cloneSelection(selection);
    const node = nodeAtPath(next, path);
    if (!node) return;
    node.args = { ...(node.args || {}), [argName]: value };
    regenerate(next);
  }, [selection, regenerate]);

  /** A variable name not already taken elsewhere in the operation (`tag`, `tag2`, …), the
   * same de-duplication the reference's `variablize` does. */
  const makeVarName = useCallback((base: string) => {
    const used: VarDefLookup = new Map();
    collectVariables(selection, used);
    if (!used.has(base)) return base;
    let n = 2;
    while (used.has(`${base}${n}`)) n++;
    return `${base}${n}`;
  }, [selection]);

  if (!activeTab?.authData?.['gql_connected']) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] gap-2 px-4">
        <span className="text-[24px] opacity-20">⟨/⟩</span>
        <p className="text-[12px] text-center">Connect to a GraphQL endpoint to explore the schema</p>
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

  const handleTabChange = (t: string) => {
    setPanelTab(t as PanelTab);
    if (t === 'query' || t === 'mutation' || t === 'subscription') setOpKind(t);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 pt-2 border-b border-[var(--color-surface-border)]">
        <TabView
          tabs={PANEL_TABS}
          activeTab={panelTab}
          onChange={handleTabChange}
          variant="underline"
          size="sm"
          accentColor={ACCENT}
        />
      </div>

      {panelTab === 'schema' ? (
        <div className="flex-1 min-h-0"><GraphQLSchemaPanel /></div>
      ) : (
        <>
          <div className="px-3 py-2 border-b border-[var(--color-surface-border)]">
            <div className="relative">
              <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search fields..."
                className="w-full h-[30px] pl-8 pr-3 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-protocol-graphql)]"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-none px-3 py-2">
            {!rootType?.fields ? (
              <p className="text-[12px] text-[var(--color-text-muted)] px-1">
                This schema defines no {opKind} operations.
              </p>
            ) : (
              <FieldList
                fields={rootType.fields}
                path={[]}
                depth={0}
                typesMap={typesMap}
                selection={selection}
                expandedPaths={expandedPaths}
                search={search}
                onToggleField={toggleField}
                onToggleExpand={toggleExpand}
                onToggleArg={toggleArg}
                onArgChange={changeArg}
                makeVarName={makeVarName}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface TreeHandlers {
  onToggleField: (path: string[], field: SchemaField) => void;
  onToggleExpand: (path: string) => void;
  onToggleArg: (path: string[], arg: ArgDef) => void;
  onArgChange: (path: string[], argName: string, value: ArgValue) => void;
  makeVarName: (base: string) => string;
}

function FieldList({
  fields, path, depth, typesMap, selection, expandedPaths, search, ...handlers
}: TreeHandlers & {
  fields: SchemaField[];
  path: string[];
  depth: number;
  typesMap: Map<string, SchemaType>;
  selection: SelectionMap;
  expandedPaths: Set<string>;
  search: string;
}) {
  const visible = depth === 0 && search
    ? fields.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
    : fields;

  return (
    <div className="flex flex-col" style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
      {visible.map(field => {
        const fieldPath = [...path, field.name];
        const pathKey = fieldPath.join('.');
        const baseType = getBaseTypeName(field.type);
        const leaf = isLeafType(baseType, typesMap);
        const node = selection.get(field.name);
        const isChecked = !!node;
        const isExpanded = expandedPaths.has(pathKey);
        const subType = !leaf && baseType ? typesMap.get(baseType) : undefined;
        const subFields = subType?.fields || subType?.inputFields || [];
        const args = editableArgs(field, typesMap);

        return (
          <div key={field.name}>
            <div className="flex items-center gap-1.5 py-1">
              {!leaf ? (
                <button
                  type="button"
                  onClick={() => handlers.onToggleExpand(pathKey)}
                  className="flex items-center justify-center w-4 h-4 shrink-0 cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                >
                  {isExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                </button>
              ) : (
                <span className="w-4 h-4 shrink-0" />
              )}
              <CheckboxView
                size="sm"
                checked={isChecked}
                onChange={() => handlers.onToggleField(fieldPath, field)}
                accentColor={ACCENT}
              />
              <span className="text-[12.5px] font-mono text-[var(--color-text-primary)]">{field.name}</span>
              <span className="text-[11px] font-mono" style={{ color: getTypeColor(baseType, subType?.kind) }}>
                : {resolveTypeName(field.type)}
              </span>
            </div>

            {/* A selected field's arguments, each its own checkbox row (reference behaviour). */}
            {isChecked && args.length > 0 && (
              <div className="flex flex-col" style={{ paddingLeft: 22 }}>
                {args.map(arg => (
                  <ArgumentRow
                    key={arg.name}
                    arg={arg}
                    value={node?.args?.[arg.name]}
                    isSet={!!node?.args && arg.name in node.args}
                    typesMap={typesMap}
                    makeVarName={handlers.makeVarName}
                    onToggle={() => handlers.onToggleArg(fieldPath, arg)}
                    onChange={(v) => handlers.onArgChange(fieldPath, arg.name, v)}
                  />
                ))}
              </div>
            )}

            {!leaf && isExpanded && subFields.length > 0 && (
              <FieldList
                fields={subFields}
                path={fieldPath}
                depth={depth + 1}
                typesMap={typesMap}
                selection={node?.children ?? new Map()}
                expandedPaths={expandedPaths}
                search=""
                {...handlers}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** One argument of a selected field — or, recursively, one field of an INPUT_OBJECT argument
 * (they have the same `{name, type}` + value shape). Renders its own checkbox, a `name*:`
 * label, a hover-revealed `$` variablize button, and — only once checked — a value control.
 * INPUT_OBJECT values expand into a nested group of these same rows. */
function ArgumentRow({ arg, value, isSet, typesMap, makeVarName, onToggle, onChange }: {
  arg: ArgDef;
  value: ArgValue | undefined;
  isSet: boolean;
  typesMap: Map<string, SchemaType>;
  makeVarName: (base: string) => string;
  onToggle: () => void;
  onChange: (v: ArgValue) => void;
}) {
  const baseType = getBaseTypeName(arg.type);
  const cls = classifyArgType(baseType, typesMap);
  const isObject = cls === 'object';
  const isVar = value !== undefined && isVariableArgValue(value);
  const nested = value !== undefined && isObjectArgValue(value) ? value : {};

  const variablize = () => {
    if (value === undefined) return;
    if (isVariableArgValue(value)) {
      onChange(value.__default);            // devariablize — restore the literal
    } else {
      onChange({ __var: makeVarName(arg.name), __typeName: nullableTypeName(arg.type), __default: value });
    }
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 py-[3px] group/arg">
        <CheckboxView size="sm" checked={isSet} onChange={onToggle} accentColor={ACCENT} />
        <span className="text-[11.5px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
          {arg.name}{isRequiredArg(arg) ? '*' : ''}:
        </span>
        {isSet && !isObject && (
          <span
            className={isVar ? 'opacity-100' : 'opacity-0 group-hover/arg:opacity-100 transition-opacity'}
          >
            <IconButtonView
              icon={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}>$</span>}
              size="xs"
              variant="ghost"
              accentColor={VAR_BTN_COLOR}
              color={VAR_BTN_COLOR}
              activeColor={VAR_BTN_COLOR}
              active={isVar}
              style={isVar ? { background: VAR_BTN_ACTIVE_BG } : undefined}
              tooltip={isVar ? 'Remove the variable' : 'Extract the current value into a GraphQL variable'}
              onClick={variablize}
            />
          </span>
        )}
        {isSet && !isObject && (
          isVar
            ? <span className="text-[11px] font-mono" style={{ color: VAR_COLOR }}>${(value as VariableArgValue).__var}</span>
            : <ArgValueEditor cls={cls} baseType={baseType} typesMap={typesMap} value={value} onChange={onChange} />
        )}
        {isObject && (
          <span className="text-[11px] font-mono" style={{ color: ACCENT }}>
            {isSet ? '{' : resolveTypeName(arg.type)}
          </span>
        )}
      </div>
      {isSet && isObject && (
        <>
          <div className="flex flex-col" style={{ paddingLeft: 20 }}>
            {(typesMap.get(baseType!)?.inputFields || [])
              .filter(f => classifyArgType(getBaseTypeName(f.type), typesMap) !== 'unsupported')
              .map(f => (
                <ArgumentRow
                  key={f.name}
                  arg={f}
                  value={nested[f.name]}
                  isSet={f.name in nested}
                  typesMap={typesMap}
                  makeVarName={makeVarName}
                  onToggle={() => {
                    const copy = { ...nested };
                    if (f.name in copy) {
                      delete copy[f.name];
                    } else {
                      const v = defaultValueForArg(f, typesMap);
                      if (v === undefined) return;
                      copy[f.name] = v;
                    }
                    onChange(copy);
                  }}
                  onChange={(v) => onChange({ ...nested, [f.name]: v })}
                />
              ))}
          </div>
          <div className="text-[11px] font-mono py-[3px]" style={{ color: ACCENT, paddingLeft: 20 }}>{'}'}</div>
        </>
      )}
    </div>
  );
}

const BOOL_OPTIONS = [{ value: 'true', label: 'true' }, { value: 'false', label: 'false' }];

/** Value control for a checked scalar/enum/boolean argument. */
function ArgValueEditor({ cls, baseType, typesMap, value, onChange }: {
  cls: ArgClass;
  baseType: string | null;
  typesMap: Map<string, SchemaType>;
  value: ArgValue | undefined;
  onChange: (v: ArgValue) => void;
}) {
  if (cls === 'boolean') {
    return (
      <SelectInputView
        options={BOOL_OPTIONS}
        value={String(value ?? true)}
        onChange={(v) => onChange(v === 'true')}
        size="sm"
        accentColor={ACCENT}
      />
    );
  }
  if (cls === 'enum') {
    const options = (typesMap.get(baseType || '')?.enumValues || []).map(v => ({ value: v.name, label: v.name }));
    const current = value !== undefined && isEnumArgValue(value) ? value.__enum : options[0]?.value || '';
    return (
      <SelectInputView
        options={options}
        value={current}
        onChange={(v) => onChange({ __enum: v })}
        size="sm"
        accentColor={ACCENT}
      />
    );
  }
  if (cls === 'string' || cls === 'number') {
    return (
      <InlineScalarInput
        kind={cls}
        value={(value as string | number) ?? (defaultScalarValue(cls) as string | number)}
        onChange={onChange}
      />
    );
  }
  return null;
}

/** Matches the reference's `ScalarInput`: no box, no background, no placeholder — a
 * bottom-border-only input auto-sized to its content, with static quote characters around
 * string values (only the raw text lives in the input). */
function InlineScalarInput({ kind, value, onChange }: {
  kind: 'string' | 'number';
  value: string | number;
  onChange: (v: string | number) => void;
}) {
  const strValue = String(value);
  const inputStyle: CSSProperties = {
    border: 'none',
    borderBottom: '1px solid var(--color-input-border)',
    outline: 'none',
    background: 'transparent',
    color: 'var(--color-info)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: 0,
    width: `${Math.max(1, Math.min(20, strValue.length || 1))}ch`,
  };
  if (kind === 'number') {
    return (
      <input
        type="number"
        value={strValue}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        style={inputStyle}
      />
    );
  }
  return (
    <span style={{ color: 'var(--color-info)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      "<input type="text" value={strValue} onChange={(e) => onChange(e.target.value)} style={inputStyle} />"
    </span>
  );
}
