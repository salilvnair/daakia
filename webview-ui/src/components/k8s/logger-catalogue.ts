/**
 * The Loggers tab's table, worked out from what is stored and what is seen.
 *
 * Three things go into a row and only one of them is kept:
 *
 *   - the loggers somebody added — from a project, the pod, a paste;
 *   - the loggers the buffer names, where a log format parsed a logger off
 *     the line (never guessed out of the text — see `LogLine.logger`);
 *   - the patterns, filed under the logger that writes them.
 *
 * The counts are over a WINDOW of the buffer, and the zero is the point:
 * "declared, never fired in this window" is the row a tester cannot get from
 * the log itself, because a logger that said nothing left nothing to find.
 *
 * ── Names do not have to match exactly ──
 *
 * logback's `%logger{36}` writes `c.a.o.OrderService` for
 * `com.acme.orders.OrderService`, and a JSON encoder writes the full name.
 * The catalogue has one or the other and the line has either, so the match
 * is abbreviation-aware: same class, and each shortened package segment a
 * prefix of the real one.
 */
import type { LogLine } from '../../store/k8s-store';
import type { CataloguePattern, CatalogueLogger, LoggerSource } from '../../store/dk8s-logger-store';
import { compilePattern, matchPattern, type CompiledPattern } from './logger-pattern';
import { LOGGERS } from './tone';

export type RowSource = LoggerSource | 'seen';

export const SOURCE_LABEL: Record<RowSource, string> = {
  config: 'logback.xml',
  code: 'source code',
  pod: 'from the pod',
  hand: 'added by hand',
  seen: 'seen in logs',
};

/** The rail's colour squares, from the boards. */
export const SOURCE_COLOR: Record<RowSource, string> = {
  config: 'var(--color-info, #3b82f6)',
  code: 'var(--color-dk8s)',
  pod: 'var(--color-warning)',
  hand: LOGGERS,
  seen: 'var(--color-success)',
};

export const LEVEL_COLOR: Record<string, string> = {
  ERROR: 'var(--color-error)', FATAL: 'var(--color-error)', WARN: 'var(--color-warning)',
  INFO: 'var(--color-info, #3b82f6)',
  DEBUG: 'var(--color-text-muted)', TRACE: 'var(--color-text-muted)', OFF: 'var(--color-text-muted)',
};

// ── Names ──────────────────────────────────────────────────────────────────

export function shortName(name: string): string {
  const parts = name.split(/[.:/]/);
  return parts[parts.length - 1] || name;
}

/**
 * Is the logger the line names the one the catalogue names.
 *
 * `c.a.o.OrderService` ~ `com.acme.orders.OrderService`, `OrderService` ~
 * `com.acme.orders.OrderService`; never `OrderService` ~ `OrderServiceImpl`.
 */
export function loggerMatches(full: string, seen: string): boolean {
  if (!full || !seen) return false;
  if (full === seen) return true;
  const f = full.split('.');
  const s = seen.split('.');
  if (s.length > f.length) return false;
  if (f[f.length - 1] !== s[s.length - 1]) return false;
  /* Right-aligned: logback shortens from the left and keeps the class. */
  const offset = f.length - s.length;
  for (let i = 0; i < s.length - 1; i++) {
    if (!f[offset + i].startsWith(s[i])) return false;
  }
  /* A bare class name is a match only when the catalogue has nothing with a
     package to compare — `OrderService` alone is still the class. */
  return true;
}

/**
 * Library packages, by the names everybody's dependencies use.
 *
 * "Skip library packages" in Add loggers, and the packages rail's grouping:
 * `org.springframework` is one group, `com.acme` is split by module, because
 * the reader cares about their own modules and not about Spring's.
 */
const LIBRARY = [
  'org.springframework', 'org.hibernate', 'org.apache', 'org.eclipse', 'org.jboss', 'org.flywaydb',
  'org.mongodb', 'org.postgresql', 'org.elasticsearch', 'org.redisson', 'org.quartz', 'org.thymeleaf',
  'io.lettuce', 'io.netty', 'io.micrometer', 'io.grpc', 'io.undertow', 'io.opentelemetry', 'io.swagger',
  'com.zaxxer', 'com.fasterxml', 'com.amazonaws', 'com.google', 'com.netflix', 'com.mongodb', 'com.azure',
  'software.amazon', 'ch.qos', 'reactor', 'liquibase', 'kafka', 'okhttp3', 'javax', 'jakarta', 'java', 'sun',
  'springfox', 'net.logstash', 'feign', 'brave', 'zipkin2',
  'urllib3', 'botocore', 'boto3', 'uvicorn', 'gunicorn', 'sqlalchemy', 'asyncio', 'httpx', 'kafka',
];

export function isLibrary(name: string): boolean {
  return LIBRARY.some(p => name === p || name.startsWith(`${p}.`));
}

/**
 * The package a logger is grouped under in the PACKAGES rail.
 *
 * A library is grouped by its vendor (`org.hibernate`); the application's own
 * packages one level deeper (`com.acme.orders`, `com.acme.payments`), which
 * is where its modules are. A class name never makes a group of its own.
 */
export function packageOf(name: string): string {
  if (name.includes(':')) return name.split(':')[0];
  const parts = name.split('.');
  const pkg = parts.length > 1 && /^[A-Z]/.test(parts[parts.length - 1]) ? parts.slice(0, -1) : parts;
  if (isLibrary(name)) {
    const lib = LIBRARY.find(p => name === p || name.startsWith(`${p}.`))!;
    return lib;
  }
  if (pkg.length >= 3) return pkg.slice(0, 3).join('.');
  return pkg.length > 1 ? pkg.slice(0, -1).join('.') || pkg[0] : pkg[0];
}

// ── Windows ────────────────────────────────────────────────────────────────

export type CatalogueWindow = '15m' | '1h' | '2h' | '6h' | 'all';

export const WINDOW_MS: Record<CatalogueWindow, number | undefined> = {
  '15m': 15 * 60_000, '1h': 3_600_000, '2h': 7_200_000, '6h': 21_600_000, all: undefined,
};

export const WINDOW_LABEL: Record<CatalogueWindow, string> = {
  '15m': 'last 15 minutes', '1h': 'last hour', '2h': 'last 2 hours', '6h': 'last 6 hours', all: 'everything held',
};

/** The column header's short form: EVENTS 2H. */
export const WINDOW_SHORT: Record<CatalogueWindow, string> = {
  '15m': '15M', '1h': '1H', '2h': '2H', '6h': '6H', all: 'HELD',
};

/**
 * The lines of the buffer inside a window ending now.
 *
 * A log with no timestamps at all cannot be windowed, and answering "nothing
 * in the last two hours" for it would be a claim about time made from lines
 * that carry none — so it is taken whole.
 */
export function linesInWindow<T extends Pick<LogLine, 'ts'>>(lines: T[], win: CatalogueWindow, now: number): T[] {
  const span = WINDOW_MS[win];
  if (span === undefined) return lines;
  if (!lines.some(l => l.ts !== undefined)) return lines;
  const from = now - span;
  return lines.filter(l => l.ts !== undefined && l.ts >= from);
}

// ── Rows ───────────────────────────────────────────────────────────────────

export interface PatternStat {
  pattern: CataloguePattern;
  count: number;
  last?: number;
}

export interface CatalogueRow {
  /** Stable key: the name, or '' for patterns filed under no logger. */
  key: string;
  name: string;
  level?: string;
  /** Every source that knows it; `primary` is what the SOURCE column says. */
  sources: RowSource[];
  primary: RowSource;
  origin?: string;
  stored?: CatalogueLogger;
  patterns: PatternStat[];
  events: number;
  lastSeen?: number;
  /** In the buffer at all, whatever the window. */
  everSeen: boolean;
  /** The names the buffer's lines give it — `c.a.o.OrderService` — for Show in Logs. */
  seenNames: string[];
}

const SOURCE_RANK: RowSource[] = ['config', 'pod', 'code', 'hand', 'seen'];

function pickPrimary(sources: RowSource[]): RowSource {
  return SOURCE_RANK.find(s => sources.includes(s)) ?? 'seen';
}

interface Compiled { pattern: CataloguePattern; compiled: CompiledPattern }

/**
 * Build the table.
 *
 * One pass over the window: each line is filed under its logger by name
 * where the format named one, and under whichever pattern claims it. A line
 * both name counts once for its logger. Patterns are tried in the order of
 * the logger the line names first, so a line with a logger costs that
 * logger's patterns and not the whole catalogue's.
 */
export function buildRows(
  stored: CatalogueLogger[],
  patterns: CataloguePattern[],
  buffer: LogLine[],
  window: LogLine[],
): CatalogueRow[] {
  const rows: CatalogueRow[] = [];
  const byName = new Map<string, CatalogueRow>();

  const rowFor = (name: string, source: RowSource): CatalogueRow => {
    let row = byName.get(name);
    if (!row) {
      row = { key: name, name, sources: [], primary: source, patterns: [], events: 0, everSeen: false, seenNames: [] };
      byName.set(name, row);
      rows.push(row);
    }
    if (!row.sources.includes(source)) row.sources.push(source);
    return row;
  };

  for (const l of stored) {
    const row = rowFor(l.name, l.source);
    row.stored = row.stored ?? l;
    row.level = row.level ?? l.level;
    row.origin = row.origin ?? l.origin;
  }

  /* A seen name joins the row it abbreviates, when there is one. Worked out
     once per distinct name, not per line. */
  const seenMap = new Map<string, CatalogueRow>();
  const resolveSeen = (seen: string): CatalogueRow => {
    const hit = seenMap.get(seen);
    if (hit) return hit;
    const existing = rows.find(r => r.key && (loggerMatches(r.name, seen) || loggerMatches(seen, r.name)));
    const row = existing ?? rowFor(seen, 'seen');
    if (!row.sources.includes('seen')) row.sources.push('seen');
    row.everSeen = true;
    if (!row.seenNames.includes(seen)) row.seenNames.push(seen);
    seenMap.set(seen, row);
    return row;
  };
  for (const line of buffer) if (line.logger) resolveSeen(line.logger);

  /* Patterns go under their logger; one with no logger under the blank row. */
  const compiled: Compiled[] = [];
  const statOf = new Map<string, PatternStat>();
  const patternRow = new Map<string, CatalogueRow>();
  for (const p of patterns) {
    let row: CatalogueRow | undefined;
    if (p.logger) {
      row = rows.find(r => r.key && (loggerMatches(r.name, p.logger!) || loggerMatches(p.logger!, r.name)));
      if (!row) row = rowFor(p.logger, p.source === 'scan' ? 'code' : 'hand');
    } else {
      row = byName.get('') ?? rowFor('', 'hand');
    }
    const stat: PatternStat = { pattern: p, count: 0 };
    row.patterns.push(stat);
    statOf.set(p.id, stat);
    patternRow.set(p.id, row);
    compiled.push({ pattern: p, compiled: compilePattern(p) });
  }

  /* Each row's own patterns, for trying a line with a logger on it first. */
  const ownCompiled = new Map<CatalogueRow, Compiled[]>();
  for (const c of compiled) {
    const r = patternRow.get(c.pattern.id)!;
    ownCompiled.set(r, [...(ownCompiled.get(r) ?? []), c]);
  }

  for (const line of window) {
    if (line.continuation) continue;
    const text = line.message ?? line.text;
    const named = line.logger ? resolveSeen(line.logger) : undefined;
    if (named) {
      named.events++;
      if (line.ts !== undefined && (named.lastSeen ?? 0) < line.ts) named.lastSeen = line.ts;
    }

    const tryList = named ? (ownCompiled.get(named) ?? []) : compiled;
    let claimed = false;
    for (const c of tryList) {
      if (matchPattern(c.compiled, text)) { credit(c, line, named); claimed = true; break; }
    }
    /* A named line its own logger's patterns did not claim can still be one
       of the unassigned patterns — a pasted template with no logger. */
    if (!claimed && named) {
      for (const c of ownCompiled.get(byName.get('')!) ?? []) {
        if (matchPattern(c.compiled, text)) { credit(c, line, named); break; }
      }
    }
  }

  function credit(c: Compiled, line: LogLine, named: CatalogueRow | undefined) {
    const stat = statOf.get(c.pattern.id)!;
    stat.count++;
    if (line.ts !== undefined && (stat.last ?? 0) < line.ts) stat.last = line.ts;
    const row = patternRow.get(c.pattern.id)!;
    if (row !== named && row.key) {
      row.events++;
      if (line.ts !== undefined && (row.lastSeen ?? 0) < line.ts) row.lastSeen = line.ts;
    }
  }

  for (const row of rows) row.primary = pickPrimary(row.sources);
  return rows;
}

// ── Filters ────────────────────────────────────────────────────────────────

export type SourceFilter = 'any' | 'declared' | 'seen' | 'hand' | 'code';

export interface RowFilter {
  query: string;
  level: string;
  source: SourceFilter;
  neverFired: boolean;
  pkg?: string;
  from?: RowSource;
}

/** A logger that was declared or added, rather than only seen. */
export const isDeclared = (row: CatalogueRow) => row.sources.some(s => s !== 'seen');

/** Declared, and silent in the window: the row the tab exists for. */
export const isSilent = (row: CatalogueRow) => !!row.key && isDeclared(row) && row.events === 0;

/** Configured below what anybody runs with, so a zero is expected, not news. */
export const isOffAtLevel = (row: CatalogueRow) =>
  row.level === 'OFF' || ((row.level === 'DEBUG' || row.level === 'TRACE') && row.events === 0);

export function filterRows(rows: CatalogueRow[], f: RowFilter): CatalogueRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter(row => {
    if (f.level !== 'any' && (row.level ?? 'none') !== f.level) return false;
    if (f.source === 'declared' && !isDeclared(row)) return false;
    if (f.source === 'seen' && !row.sources.includes('seen')) return false;
    if (f.source === 'hand' && !row.sources.includes('hand')) return false;
    if (f.source === 'code' && !row.sources.includes('code')) return false;
    if (f.neverFired && !isSilent(row)) return false;
    if (f.pkg && (!row.key || packageOf(row.name) !== f.pkg)) return false;
    if (f.from && !row.sources.includes(f.from)) return false;
    if (q) {
      const inName = row.name.toLowerCase().includes(q);
      const inPattern = row.patterns.some(p => p.pattern.template.toLowerCase().includes(q));
      if (!inName && !inPattern) return false;
    }
    return true;
  });
}

/** Busiest first; the silent declared ones after; the blank row last. */
export function sortRows(rows: CatalogueRow[]): CatalogueRow[] {
  return [...rows].sort((a, b) => {
    if (!a.key !== !b.key) return a.key ? -1 : 1;
    return b.events - a.events || a.name.localeCompare(b.name);
  });
}

/** The PACKAGES rail: every group and its count, largest first. */
export function packageCounts(rows: CatalogueRow[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.key) counts.set(packageOf(r.name), (counts.get(packageOf(r.name)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** The WHERE FROM rail. A row counts under every source that knows it. */
export function sourceCounts(rows: CatalogueRow[]): [RowSource, number][] {
  const counts = new Map<RowSource, number>();
  for (const r of rows) if (r.key) for (const s of r.sources) counts.set(s, (counts.get(s) ?? 0) + 1);
  return SOURCE_RANK.filter(s => counts.has(s)).map(s => [s, counts.get(s)!]);
}

// ── Relative time ──────────────────────────────────────────────────────────

export function ago(ts: number | undefined, now: number): string {
  if (ts === undefined) return '—';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// ── Paste a list ───────────────────────────────────────────────────────────

/**
 * "Paste a list" — whatever shape the list arrived in.
 *
 *     com.acme.orders.OrderService
 *     com.acme.payments INFO
 *     com.acme.audit=DEBUG
 *     logging.level.org.hibernate.SQL: TRACE
 *     <logger name="com.acme.x" level="WARN"/>
 *
 * People paste out of a properties file, a YAML block, a logback file or a
 * chat message, and each of those is a list of loggers with the same two
 * facts in it.
 */
export function parseLoggerList(text: string): { name: string; level?: string }[] {
  const out: { name: string; level?: string }[] = [];
  const seen = new Set<string>();
  const LEVELS = /^(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL|OFF)$/i;
  for (const raw of text.split(/\r?\n|;/)) {
    let line = raw.trim().replace(/^[-*]\s+/, '');
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const xml = /<(?:logger|Logger|AsyncLogger)\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*?(?:\blevel\s*=\s*["']([^"']+)["'])?/.exec(line);
    let name: string | undefined;
    let level: string | undefined;
    if (xml) {
      name = xml[1];
      level = xml[2] ?? /\blevel\s*=\s*["']([^"']+)["']/.exec(line)?.[1];
    } else {
      line = line.replace(/^logging\.level\./i, '');
      /* `web:checkout` is a name; `SQL: TRACE` is a name and a level. */
      const m = /^([\w$.-]+(?::[\w$.-]+)?)(?:\s*[=:\s]\s*["']?(\w+)["']?)?\s*,?$/.exec(line);
      if (!m) continue;
      name = m[1];
      level = m[2];
    }
    if (!name || !/[A-Za-z]/.test(name)) continue;
    const lv = level && LEVELS.test(level) ? level.toUpperCase().replace('WARNING', 'WARN') : undefined;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, level: lv });
  }
  return out;
}

// ── Export ─────────────────────────────────────────────────────────────────

/** The catalogue as a file somebody can hand to the next tester. */
export function exportCatalogue(rows: CatalogueRow[], scope: string, win: CatalogueWindow): string {
  return JSON.stringify({
    kind: 'daakia.dk8s.loggers',
    version: 1,
    scope,
    exported: new Date().toISOString(),
    window: WINDOW_LABEL[win],
    loggers: rows.filter(r => r.key || r.patterns.length).map(r => ({
      name: r.name || null,
      level: r.level ?? null,
      source: r.sources,
      origin: r.origin ?? null,
      events: r.events,
      lastSeen: r.lastSeen ? new Date(r.lastSeen).toISOString() : null,
      patterns: r.patterns.map(p => ({
        template: p.pattern.template,
        level: p.pattern.level ?? null,
        holes: p.pattern.holes,
        count: p.count,
        marked: !!p.pattern.marked,
      })),
    })),
  }, null, 2);
}
