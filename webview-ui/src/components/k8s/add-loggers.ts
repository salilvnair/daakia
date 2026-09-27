/**
 * What Add loggers offers, from each of its four sources, as one list.
 *
 * The project folder, the pod, a pasted list and a typed name all end in the
 * same table — LOGGER, LEVEL, WHERE IT CAME FROM, PATTERNS IN SOURCE — with
 * the same three switches over it. So every source is reduced here to the
 * same `LoggerCandidate`, and the modal only draws.
 *
 * ── Which level a logger has ──
 *
 * The level shown is the one in force under the chosen profile, worked out
 * the way Spring does it: `logging.level` in the application file wins over
 * logback's `<logger>`, a profile's own wins over the unprofiled, and a class
 * nobody configured takes the level of its nearest configured package, then
 * the root's. Switching the profile re-runs this, which is why the levels in
 * the table change when the select does.
 */
import type { LoggerSource } from '../../store/dk8s-logger-store';
import { isLibrary, parseLoggerList } from './logger-catalogue';
import { fromAnyCall, reasonOff } from './logger-calls';
import type { LoggerPattern } from './logger-pattern';

// ── The host's answers, as the webview receives them ───────────────────────

export interface DeclaredLogger { name: string; level?: string; profile?: string }
export interface LevelDoc { profile?: string; levels: Record<string, string> }

export interface ProjectConfigMsg {
  file: string;
  kind: 'logback' | 'yaml' | 'properties';
  loggers?: DeclaredLogger[];
  root?: DeclaredLogger[];
  levels?: LevelDoc[];
}

export interface ProjectClassMsg {
  name: string;
  file: string;
  language: 'java' | 'python' | 'node' | 'go';
  declared: boolean;
  calls: number;
  test: boolean;
}

export interface ScanHitMsg {
  file: string;
  line: number;
  code: string;
  language: 'java' | 'python' | 'node' | 'go';
  test: boolean;
  logger?: string;
}

export interface ProjectReadMsg {
  folder: string;
  build: string;
  profiles: string[];
  configs: ProjectConfigMsg[];
  classes: ProjectClassMsg[];
  hits: ScanHitMsg[];
  filesRead: number;
  stoppedAt?: 'files' | 'hits';
  fingerprint: string;
}

export interface PodLoggersMsg {
  files: { path: string; loggers: DeclaredLogger[]; root: DeclaredLogger[] }[];
  actuator?: { port: string; loggers: DeclaredLogger[] };
  command?: string;
  error?: string;
}

// ── Candidates ─────────────────────────────────────────────────────────────

/** Which "Read from the project" chip a candidate belongs to. */
export type CandidateGroup = 'xml' | 'levels' | 'classes' | 'python' | 'node' | 'go' | 'pod' | 'actuator' | 'paste' | 'hand';

export interface LoggerCandidate {
  name: string;
  level?: string;
  source: LoggerSource;
  /** WHERE IT CAME FROM: `bcbl/BcblClient.java`, `logback-spring.xml · <logger>`. */
  from: string;
  groups: CandidateGroup[];
  library: boolean;
  /** Logger calls found in source for it — PATTERNS IN SOURCE. */
  patterns: number;
  /** Already in the catalogue. */
  existing: boolean;
}

/** Spring's `profileApplies`, repeated here because the host's is not importable. */
export function profileApplies(expr: string | undefined, chosen: string): boolean {
  if (!expr) return true;
  return expr.split(/[|,]/).map(s => s.trim()).filter(Boolean).some(alt =>
    alt.split('&').map(s => s.trim()).filter(Boolean)
      .every(p => (p.startsWith('!') ? p.slice(1).trim() !== chosen : p === chosen)));
}

const fileName = (p: string) => p.replace(/\\/g, '/').split('/').pop() ?? p;
/** The last two parts of a path: `bcbl/BcblClient.java`. */
const shortPath = (p: string) => p.replace(/\\/g, '/').split('/').slice(-2).join('/');

/** Levels in force under a profile, from every config: yaml over logback, profile over none. */
export function configuredLevels(configs: ProjectConfigMsg[], profile: string): { levels: Map<string, string>; root?: string } {
  const levels = new Map<string, string>();
  let root: string | undefined;
  const apply = (name: string, level: string | undefined) => {
    if (!level) return;
    if (name === 'ROOT') root = level; else levels.set(name, level);
  };
  /* logback first, unprofiled then profiled; then application files the same
     way — each later write wins, which is the precedence Spring applies. */
  for (const pass of [false, true]) {
    for (const c of configs.filter(x => x.kind === 'logback')) {
      for (const l of [...(c.root ?? []), ...(c.loggers ?? [])]) {
        if (!!l.profile === pass && profileApplies(l.profile, profile)) apply(l.name, l.level);
      }
    }
  }
  for (const pass of [false, true]) {
    for (const c of configs.filter(x => x.kind !== 'logback')) {
      for (const d of c.levels ?? []) {
        if (!!d.profile === pass && profileApplies(d.profile, profile)) {
          for (const [n, l] of Object.entries(d.levels)) apply(n, l);
        }
      }
    }
  }
  return { levels, root };
}

/** A class's level: its own, else its nearest configured package's, else root's. */
export function effectiveLevel(name: string, levels: Map<string, string>, root?: string): string | undefined {
  const parts = name.split('.');
  for (let i = parts.length; i > 0; i--) {
    const hit = levels.get(parts.slice(0, i).join('.'));
    if (hit) return hit;
  }
  return root;
}

/**
 * The project's loggers under one profile.
 *
 * A name named by several sources is one row: the config's `from` wins for a
 * package, the class file for a class, because that is where somebody would
 * go to change it.
 */
export function projectCandidates(read: ProjectReadMsg, profile: string, existing: Set<string>): LoggerCandidate[] {
  const { levels, root } = configuredLevels(read.configs, profile);
  const by = new Map<string, LoggerCandidate>();
  const add = (name: string, over: Partial<LoggerCandidate> & { group: CandidateGroup; from: string; source: LoggerSource }) => {
    const hit = by.get(name);
    if (hit) {
      if (!hit.groups.includes(over.group)) hit.groups.push(over.group);
      if (over.source === 'code') { hit.from = over.from; hit.source = 'code'; }
      hit.patterns += over.patterns ?? 0;
      return;
    }
    by.set(name, {
      name, from: over.from, source: over.source, groups: [over.group],
      library: isLibrary(name), patterns: over.patterns ?? 0, existing: existing.has(name),
    });
  };

  for (const c of read.configs) {
    if (c.kind === 'logback') {
      for (const l of c.loggers ?? []) {
        if (!profileApplies(l.profile, profile)) continue;
        add(l.name, {
          group: 'xml', source: 'config',
          from: `${fileName(c.file)} · ${isLibrary(l.name) ? 'library' : '<logger>'}`,
        });
      }
    } else {
      for (const d of c.levels ?? []) {
        if (!profileApplies(d.profile, profile)) continue;
        for (const n of Object.keys(d.levels)) {
          if (n === 'ROOT') continue;
          add(n, { group: 'levels', source: 'config', from: fileName(c.file) });
        }
      }
    }
  }

  for (const cl of read.classes) {
    if (cl.test) continue;
    const group: CandidateGroup = cl.language === 'java' ? 'classes' : cl.language;
    add(cl.name, { group, source: 'code', from: shortPath(cl.file), patterns: cl.calls });
  }

  for (const c of by.values()) c.level = levels.get(c.name) ?? effectiveLevel(c.name, levels, root);
  return [...by.values()];
}

/** The chips over the table: what each source contributed, under this profile. */
export function projectGroups(read: ProjectReadMsg, candidates: LoggerCandidate[], profile: string): { id: CandidateGroup; label: string; count: number }[] {
  const count = (g: CandidateGroup) => candidates.filter(c => c.groups.includes(g)).length;
  const out: { id: CandidateGroup; label: string; count: number }[] = [];
  const xml = read.configs.find(c => c.kind === 'logback');
  if (xml) out.push({ id: 'xml', label: xml.file, count: count('xml') });
  const yaml = read.configs.filter(c => c.kind !== 'logback' && (c.levels ?? []).some(d => profileApplies(d.profile, profile)));
  if (yaml.length) {
    const own = yaml.find(c => (c.levels ?? []).some(d => d.profile === profile)) ?? yaml[0];
    out.push({ id: 'levels', label: `${fileName(own.file)} · logging.level`, count: count('levels') });
  }
  if (count('classes')) out.push({ id: 'classes', label: 'classes with a logger', count: count('classes') });
  for (const lang of ['python', 'node', 'go'] as const) {
    const n = count(lang);
    if (!n) continue;
    const top = read.classes.find(c => c.language === lang)?.file.replace(/\\/g, '/').split('/')[0];
    out.push({ id: lang, label: top ? `${top}/ (${lang})` : lang, count: n });
  }
  return out;
}

/** The pod's loggers: its logback file(s), then Actuator's levels over them. */
export function podCandidates(read: PodLoggersMsg, profile: string, existing: Set<string>): LoggerCandidate[] {
  const by = new Map<string, LoggerCandidate>();
  for (const f of read.files) {
    for (const l of f.loggers) {
      if (!profileApplies(l.profile, profile)) continue;
      const hit = by.get(l.name);
      if (hit) { hit.level = l.level ?? hit.level; continue; }
      by.set(l.name, {
        name: l.name, level: l.level, source: 'pod', from: `${fileName(f.path)} · in the pod`,
        groups: ['pod'], library: isLibrary(l.name), patterns: 0, existing: existing.has(l.name),
      });
    }
  }
  for (const l of read.actuator?.loggers ?? []) {
    const hit = by.get(l.name);
    if (hit) {
      /* Actuator is the level in force right now; the file is what it was
         started with. */
      hit.level = l.level ?? hit.level;
      if (!hit.groups.includes('actuator')) hit.groups.push('actuator');
      continue;
    }
    by.set(l.name, {
      name: l.name, level: l.level, source: 'pod', from: `/actuator/loggers :${read.actuator!.port}`,
      groups: ['actuator'], library: isLibrary(l.name), patterns: 0, existing: existing.has(l.name),
    });
  }
  return [...by.values()];
}

/** "Paste a list". */
export function pasteCandidates(text: string, existing: Set<string>): LoggerCandidate[] {
  return parseLoggerList(text).map(l => ({
    name: l.name, level: l.level, source: 'hand' as const, from: 'pasted',
    groups: ['paste' as const], library: isLibrary(l.name), patterns: 0, existing: existing.has(l.name),
  }));
}

export interface CandidateView {
  shown: LoggerCandidate[];
  found: number;
  fresh: number;
  already: number;
}

/**
 * The table after the switches, and the three numbers above it:
 * "421 found · 398 new · 23 already there".
 *
 * `found` counts what the source chips and "Skip library packages" leave, so
 * the three numbers describe the same set; "Only ones not in the catalogue"
 * and the filter box narrow what is SHOWN and not what was found.
 */
export function viewCandidates(all: LoggerCandidate[], opts: {
  groups?: Set<CandidateGroup>; skipLibrary: boolean; onlyNew: boolean; query: string;
}): CandidateView {
  const q = opts.query.trim().toLowerCase();
  const found = all.filter(c =>
    (!opts.groups || c.groups.some(g => opts.groups!.has(g)))
    && (!opts.skipLibrary || !c.library));
  const shown = found
    .filter(c => !opts.onlyNew || !c.existing)
    .filter(c => !q || c.name.toLowerCase().includes(q) || c.from.toLowerCase().includes(q))
    .sort((a, b) => Number(a.library) - Number(b.library) || b.patterns - a.patterns || a.name.localeCompare(b.name));
  const already = found.filter(c => c.existing).length;
  return { shown, found: found.length, fresh: found.length - already, already };
}

/**
 * "Also take the message patterns" — the calls in the chosen loggers'
 * source, with the scan's own defaults about which start off.
 */
export function patternsForLoggers(hits: ScanHitMsg[], names: Set<string>): LoggerPattern[] {
  const out: LoggerPattern[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (!hit.logger || !names.has(hit.logger)) continue;
    const pattern = fromAnyCall(hit.code);
    if (!pattern || reasonOff(pattern, hit.test)) continue;
    if (seen.has(pattern.template)) continue;
    seen.add(pattern.template);
    out.push({ ...pattern, logger: hit.logger, source: 'scan' });
  }
  return out;
}
