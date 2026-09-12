/**
 * Comparing two database schemas.
 *
 * ── Two ways in, one model out ──
 *
 * The plan's SD-7 puts a `compare_schemas` tool in pgsql_mcp that connects to
 * both databases and returns `{only_in_left, only_in_right, both_different,
 * both_same}` keyed by object type. That tool does not exist yet, and a screen
 * that can only be driven by something that does not exist cannot be tested.
 *
 * So the model is the thing, and there are two ways to reach it: parse two DDL
 * dumps here, or adopt the tool's payload when it arrives. `fromComparePayload`
 * is that seam, written against the shape SD-7 specifies, so the tool lands
 * without any of this changing.
 *
 * ── Severity is derived, not asked for ──
 *
 * The model is asked to explain each anomaly, not to rank it. A rank that comes
 * back differently on two runs of the same comparison is not a rank, and a
 * migration decision made on it is a coin toss. Severity here comes from the
 * diff itself: lines that disappear between source and target can break a
 * consumer, lines that only appear cannot, and an object that is absent
 * entirely is its own case. The model's job is to say what the change means.
 */
import { diffLines, tallyDiff } from '@salilvnair/dui';

export type SchemaObjectType =
  | 'table' | 'view' | 'materialized view' | 'function' | 'procedure'
  | 'index' | 'sequence' | 'type' | 'trigger' | 'other';

/** Where an object stands between the two schemas. */
export type DriftStatus =
  /** Present on both sides, byte-identical DDL. */
  | 'in-sync'
  /** Present on both sides, different DDL. */
  | 'drift'
  /** On the source but not the target — the target is missing it. */
  | 'missing'
  /** On the target but not the source. */
  | 'target-only';

export type Severity = 'critical' | 'warning' | 'info';

export interface SchemaObject {
  name: string;
  type: SchemaObjectType;
  ddl: string;
}

export interface SchemaAnomaly {
  /** Stable across re-comparisons — the graph and the open pane key off it. */
  key: string;
  name: string;
  type: SchemaObjectType;
  status: DriftStatus;
  severity: Severity;
  /** Empty when the object is target-only. */
  sourceDdl: string;
  /** Empty when the object is missing from the target. */
  targetDdl: string;
  linesAdded: number;
  linesRemoved: number;
  /** From the model. Absent until the analysis returns. */
  description?: string;
  suggestedFix?: string;
}

export interface SchemaComparison {
  anomalies: SchemaAnomaly[];
  counts: Record<Severity, number>;
  inSync: number;
  /** Every object considered, drifted or not — what the graph draws. */
  total: number;
}

// ── Parsing a DDL dump ───────────────────────────────────────────────────────

/**
 * What kind of object a `CREATE ...` statement makes, and what it is called.
 *
 * Deliberately forgiving: dumps arrive from pg_dump, from a GUI's "script
 * object" command, and pasted by hand out of a terminal, and they disagree
 * about quoting, schema qualification and `IF NOT EXISTS`. A statement whose
 * head cannot be read still becomes an object under 'other' rather than being
 * dropped — an unparsed object shown as unparsed is recoverable, one silently
 * missing from the comparison is not.
 */
const CREATE_HEAD = new RegExp(
  '^\\s*CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:GLOBAL\\s+|LOCAL\\s+)?(?:TEMP(?:ORARY)?\\s+)?(?:UNIQUE\\s+)?'
  + '(MATERIALIZED\\s+VIEW|TABLE|VIEW|FUNCTION|PROCEDURE|INDEX|SEQUENCE|TYPE|TRIGGER)\\s+'
  + '(?:IF\\s+NOT\\s+EXISTS\\s+)?([^\\s(;]+)',
  'i',
);

function normaliseName(raw: string): string {
  // Strip quoting and any trailing argument list a function head carries.
  return raw.replace(/["`\[\]]/g, '').replace(/\(.*$/, '').trim().toLowerCase();
}

/**
 * Split a DDL dump into objects.
 *
 * Statements are separated on `;` at the end of a line, which is how every
 * dump this has to read writes them, and is safe against the semicolons inside
 * a function body — those sit mid-line inside `$$ ... $$`.
 */
export function parseDdl(sql: string): SchemaObject[] {
  const text = sql.replace(/\r\n/g, '\n');
  if (!text.trim()) return [];

  const statements: string[] = [];
  let buf: string[] = [];
  let inDollar = false;

  for (const line of text.split('\n')) {
    // `$$` and `$tag$` bodies contain their own semicolons; an odd number of
    // markers on a line flips whether we are inside one.
    const markers = (line.match(/\$[A-Za-z_]*\$/g) || []).length;
    if (markers % 2 === 1) inDollar = !inDollar;

    buf.push(line);
    if (!inDollar && /;\s*$/.test(line)) {
      statements.push(buf.join('\n'));
      buf = [];
    }
  }
  if (buf.length) statements.push(buf.join('\n'));

  const objects: SchemaObject[] = [];
  let unnamed = 0;
  for (const stmt of statements) {
    const ddl = stmt.trim();
    if (!ddl || /^\s*--/.test(ddl)) continue;

    const m = CREATE_HEAD.exec(ddl);
    if (m) {
      const type = m[1].toLowerCase().replace(/\s+/g, ' ') as SchemaObjectType;
      objects.push({ name: normaliseName(m[2]), type, ddl });
    } else {
      unnamed++;
      objects.push({ name: `statement ${unnamed}`, type: 'other', ddl });
    }
  }
  return objects;
}

// ── Comparing ────────────────────────────────────────────────────────────────

const keyOf = (o: { type: string; name: string }) => `${o.type}:${o.name}`;

/**
 * Severity from the shape of the change.
 *
 * An object the target does not have is critical: whatever reads it is broken
 * right now. An object only the target has is a warning — unexpected, but
 * nothing is calling it from the source's side. For drift the question is
 * whether anything was taken away: removed lines are dropped columns,
 * constraints and grants, which break consumers; added lines alone do not.
 */
function severityOf(status: DriftStatus, removed: number, added: number): Severity {
  if (status === 'missing') return 'critical';
  if (status === 'target-only') return 'warning';
  if (status === 'in-sync') return 'info';
  if (removed > 0) return 'critical';
  return added > 0 ? 'warning' : 'info';
}

function anomaly(
  name: string, type: SchemaObjectType, status: DriftStatus,
  sourceDdl: string, targetDdl: string,
): SchemaAnomaly {
  const t = status === 'drift' ? tallyDiff(diffLines(sourceDdl, targetDdl)) : { added: 0, removed: 0, same: 0 };
  return {
    key: keyOf({ type, name }),
    name, type, status,
    severity: severityOf(status, t.removed, t.added),
    sourceDdl, targetDdl,
    linesAdded: t.added,
    linesRemoved: t.removed,
  };
}

function summarise(anomalies: SchemaAnomaly[], inSync: number): SchemaComparison {
  const counts: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  for (const a of anomalies) {
    if (a.status !== 'in-sync') counts[a.severity]++;
  }
  return { anomalies, counts, inSync, total: anomalies.length };
}

/** Sorted worst-first, then by name, so the list opens on what matters. */
const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
const STATUS_RANK: Record<DriftStatus, number> = { missing: 0, drift: 1, 'target-only': 2, 'in-sync': 3 };

function order(a: SchemaAnomaly, b: SchemaAnomaly): number {
  if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (RANK[a.severity] !== RANK[b.severity]) return RANK[a.severity] - RANK[b.severity];
  return a.name.localeCompare(b.name);
}

/** Compare two parsed schemas. In-sync objects are kept: the graph draws them. */
export function compareSchemas(source: SchemaObject[], target: SchemaObject[]): SchemaComparison {
  const byKeyTarget = new Map(target.map(o => [keyOf(o), o]));
  const seen = new Set<string>();
  const out: SchemaAnomaly[] = [];
  let inSync = 0;

  for (const s of source) {
    const k = keyOf(s);
    seen.add(k);
    const t = byKeyTarget.get(k);
    if (!t) {
      out.push(anomaly(s.name, s.type, 'missing', s.ddl, ''));
      continue;
    }
    if (s.ddl.trim() === t.ddl.trim()) {
      inSync++;
      out.push(anomaly(s.name, s.type, 'in-sync', s.ddl, t.ddl));
    } else {
      out.push(anomaly(s.name, s.type, 'drift', s.ddl, t.ddl));
    }
  }

  for (const t of target) {
    if (seen.has(keyOf(t))) continue;
    out.push(anomaly(t.name, t.type, 'target-only', '', t.ddl));
  }

  return summarise(out.sort(order), inSync);
}

/** Convenience for the paste path: two dumps in, a comparison out. */
export function compareDdl(sourceSql: string, targetSql: string): SchemaComparison {
  return compareSchemas(parseDdl(sourceSql), parseDdl(targetSql));
}

// ── The SD-7 seam ────────────────────────────────────────────────────────────

/**
 * The payload `compare_schemas` is specified to return.
 *
 * Each bucket is keyed by object type and holds either names (for the buckets
 * where one side has nothing to show) or `{name, left, right}` for the ones
 * that carry DDL. Both spellings of the DDL keys are accepted because the tool
 * does not exist yet to settle it, and guessing wrong should not mean a screen
 * that renders nothing.
 */
export interface ComparePayload {
  only_in_left?: Record<string, Array<string | { name: string; ddl?: string; left?: string }>>;
  only_in_right?: Record<string, Array<string | { name: string; ddl?: string; right?: string }>>;
  both_different?: Record<string, Array<{ name: string; left?: string; right?: string; source?: string; target?: string }>>;
  both_same?: Record<string, Array<string | { name: string; ddl?: string }>>;
}

const asType = (raw: string): SchemaObjectType => {
  const t = raw.toLowerCase().replace(/s$/, '').replace(/_/g, ' ');
  const known: SchemaObjectType[] = [
    'table', 'view', 'materialized view', 'function', 'procedure',
    'index', 'sequence', 'type', 'trigger',
  ];
  return (known as string[]).includes(t) ? (t as SchemaObjectType) : 'other';
};

const nameOf = (e: unknown): string =>
  typeof e === 'string' ? e : String((e as { name?: string })?.name ?? '');

const ddlOf = (e: unknown, ...keys: string[]): string => {
  if (typeof e === 'string') return '';
  const o = (e ?? {}) as Record<string, unknown>;
  for (const k of keys) {
    if (typeof o[k] === 'string') return o[k] as string;
  }
  return '';
};

/** Adopt SD-7's structured diff without re-deriving it. */
export function fromComparePayload(payload: ComparePayload): SchemaComparison {
  const out: SchemaAnomaly[] = [];
  let inSync = 0;

  for (const [rawType, entries] of Object.entries(payload.only_in_left ?? {})) {
    for (const e of entries) out.push(anomaly(nameOf(e), asType(rawType), 'missing', ddlOf(e, 'ddl', 'left'), ''));
  }
  for (const [rawType, entries] of Object.entries(payload.only_in_right ?? {})) {
    for (const e of entries) out.push(anomaly(nameOf(e), asType(rawType), 'target-only', '', ddlOf(e, 'ddl', 'right')));
  }
  for (const [rawType, entries] of Object.entries(payload.both_different ?? {})) {
    for (const e of entries) {
      out.push(anomaly(nameOf(e), asType(rawType), 'drift', ddlOf(e, 'left', 'source'), ddlOf(e, 'right', 'target')));
    }
  }
  for (const [rawType, entries] of Object.entries(payload.both_same ?? {})) {
    for (const e of entries) {
      inSync++;
      const ddl = ddlOf(e, 'ddl');
      out.push(anomaly(nameOf(e), asType(rawType), 'in-sync', ddl, ddl));
    }
  }

  return summarise(out.sort(order), inSync);
}

/**
 * What the model is given: the facts, without the DDL bodies that would blow
 * the context window.
 *
 * The two database names are deliberately NOT repeated here. The prompt that
 * wraps this states them, and that prompt is user-editable — a digest carrying
 * them too meant every request said "Source: ST" twice, which reads to a model
 * as emphasis nobody intended.
 *
 * Severity travels with each line. It was derived from the diff before the
 * model saw anything, and stating it is what stops the model quietly inventing
 * its own ranking.
 */
export function analysisDigest(c: SchemaComparison): string {
  const drifted = c.anomalies.filter(a => a.status !== 'in-sync');
  const lines = drifted.map(a => {
    const shape = a.status === 'drift'
      ? ` (+${a.linesAdded}/-${a.linesRemoved} lines)`
      : '';
    return `- ${a.type} "${a.name}" — ${a.status}, ${a.severity}${shape}`;
  });
  return [
    `${c.inSync} object(s) in sync, ${drifted.length} with differences.`,
    '',
    ...lines,
  ].join('\n');
}
