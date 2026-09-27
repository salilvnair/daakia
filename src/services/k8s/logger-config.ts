/**
 * Which loggers an application DECLARES, read from its logging configuration.
 *
 * The catalogue's first question is "which loggers exist", and a tester cannot
 * answer it from the log: a logger that has never fired has never written a
 * line, and it is exactly the one worth knowing about. The configuration is
 * where the application says so out loud —
 *
 *     <logger name="com.acme.orders" level="INFO"/>        logback-spring.xml
 *     logging.level.com.acme.payments: ERROR               application-prod.yaml
 *     GET /actuator/loggers                                a running Spring app
 *
 * — so this reads those three and nothing else. It is pure on purpose: the
 * project walker and the pod reader both hand it text, and the rules for what
 * a `<springProfile>` means live in one place that is under test.
 *
 * ── Profiles are the part that matters ──
 *
 * The same logger is DEBUG in `dev` and WARN in `prod`, and a catalogue that
 * shows the wrong one tells a tester to expect lines that production will never
 * write. So every level read here carries the profile it applies under, and the
 * choice of profile is made once, by whoever is looking — `levelsFor` answers
 * for the one they picked.
 */

export interface DeclaredLogger {
  name: string;
  /** Upper-cased: `INFO`, `DEBUG`, `OFF`. Absent when the tag names no level. */
  level?: string;
  /**
   * The `<springProfile name="…">` it sits inside, as written — `prod`,
   * `dev | local`, `!prod`. Absent means every profile.
   */
  profile?: string;
}

export interface LogbackRead {
  loggers: DeclaredLogger[];
  /** `<root level="…">`, per profile, for "off at this level" on screen. */
  root: DeclaredLogger[];
}

const LEVELS = new Set(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL', 'OFF', 'ALL']);

/**
 * `INFO`, `info`, `${LOG_LEVEL:-INFO}` and `${LOG_LEVEL:INFO}` are all INFO.
 *
 * A level written as a property with a default is the ordinary way to make a
 * level overridable per environment, and the default is the value the
 * application runs with unless somebody set the variable — the honest answer
 * when the variable itself is not in front of us. With no default there is
 * nothing honest to say, so there is no level.
 */
export function normaliseLevel(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let v = raw.trim();
  const prop = /^\$\{[^:}]*(?::-?([^}]*))?\}$/.exec(v);
  if (prop) v = (prop[1] ?? '').trim();
  const up = v.toUpperCase();
  if (up === 'WARNING') return 'WARN';
  return LEVELS.has(up) ? up : undefined;
}

function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? '';
  return out;
}

/**
 * Every `<logger>` in a logback (or log4j2) configuration, with its profile.
 *
 * Not an XML parser, and deliberately so: these files are small, hand-written
 * and regular, and the three tags that matter can be found without one. What
 * a real parser would add is strictness, and a half-edited config file that
 * refuses to load at all is a worse answer than the loggers it does name.
 *
 * Comments go first — a commented-out `<logger>` is the most common way of
 * switching one off, and reading it as declared would put it straight back.
 */
export function parseLogbackXml(xml: string): LogbackRead {
  const text = xml.replace(/<!--[\s\S]*?-->/g, '');
  const loggers: DeclaredLogger[] = [];
  const root: DeclaredLogger[] = [];
  const profiles: string[] = [];

  const TAG = /<(\/?)(springProfile|logger|asyncLogger|root|asyncRoot)\b([^>]*?)(\/?)>/gi;
  let m: RegExpExecArray | null;
  while ((m = TAG.exec(text)) !== null) {
    const [, closing, tag, rawAttrs, selfClosing] = m;
    const kind = tag.toLowerCase();

    if (kind === 'springprofile') {
      if (closing) profiles.pop();
      else if (!selfClosing) profiles.push(attrs(rawAttrs).name ?? '');
      continue;
    }
    if (closing) continue;

    const a = attrs(rawAttrs);
    const profile = profiles.length ? profiles[profiles.length - 1] || undefined : undefined;
    const level = normaliseLevel(a.level);

    if (kind === 'root' || kind === 'asyncroot') {
      root.push({ name: 'ROOT', level, profile });
      continue;
    }
    if (!a.name) continue;
    loggers.push({ name: a.name.trim(), level, profile });
  }
  return { loggers, root };
}

/**
 * Does a `<springProfile name="…">` expression hold for the chosen profile.
 *
 * Spring's own grammar is `a | b`, `a, b`, `!a` and `a & b`; the first three
 * cover every file anybody writes by hand. `default` is the profile that is
 * active when nothing was chosen, so it satisfies `!prod` and nothing named.
 */
export function profileApplies(expr: string | undefined, chosen: string): boolean {
  if (!expr) return true;
  const alternatives = expr.split(/[|,]/).map(s => s.trim()).filter(Boolean);
  return alternatives.some(alt => {
    const all = alt.split('&').map(s => s.trim()).filter(Boolean);
    return all.every(p => (p.startsWith('!') ? p.slice(1).trim() !== chosen : p === chosen));
  });
}

// ── application.yaml / .properties ──────────────────────────────────────────

export interface LevelDoc {
  /** The profile this block applies under; absent means always. */
  profile?: string;
  /** Logger name → level. `ROOT` for `logging.level.root`. */
  levels: Record<string, string>;
}

/** Strip a trailing ` # comment` that is not inside quotes, and the quotes. */
function scalar(raw: string): string {
  let v = raw.trim();
  if (!v.startsWith('"') && !v.startsWith('\'')) {
    const hash = v.search(/\s#/);
    if (hash >= 0) v = v.slice(0, hash).trim();
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith('\'') && v.endsWith('\''))) {
    v = v.slice(1, -1);
  }
  return v;
}

function unquoteKey(k: string): string {
  let t = k.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('\'') && t.endsWith('\''))) {
    t = t.slice(1, -1);
  }
  /* `"[com.acme.orders]"` is how Spring's relaxed binding spells a key with
     dots in it inside a map, and people copy it from the docs. */
  return t.replace(/^\[(.*)\]$/, '$1');
}

/**
 * A YAML document flattened to `dotted.path → scalar`.
 *
 * Only the subset application.yaml files are written in: nested mappings and
 * scalars. Lists are skipped rather than guessed at — nothing under
 * `logging.level` is a list — and a line that is not `key: value` is ignored
 * rather than failing the file, because a parse error here would cost the
 * reader every level in it over one line nobody needed.
 */
export function flattenYaml(doc: string): Record<string, string> {
  const out: Record<string, string> = {};
  const stack: { indent: number; key: string }[] = [];

  for (const rawLine of doc.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();
    if (line.startsWith('- ') || line === '-') continue;

    const m = /^((?:"[^"]*"|'[^']*'|[^:#])+?)\s*:(?:\s+(.*))?$/.exec(line);
    if (!m) continue;

    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const key = unquoteKey(m[1]);
    const value = m[2] !== undefined ? scalar(m[2]) : '';
    const path = [...stack.map(s => s.key), key].join('.');

    if (value === '' || value === '|' || value === '>') {
      stack.push({ indent, key });
    } else {
      out[path] = value;
    }
  }
  return out;
}

/** `spring.config.activate.on-profile` and the older `spring.profiles`. */
function profileOf(flat: Record<string, string>): string | undefined {
  return flat['spring.config.activate.on-profile'] ?? flat['spring.profiles'] ?? undefined;
}

function levelsFrom(flat: Record<string, string>): Record<string, string> {
  const levels: Record<string, string> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (!key.toLowerCase().startsWith('logging.level.')) continue;
    const name = key.slice('logging.level.'.length);
    const level = normaliseLevel(value);
    if (!name || !level) continue;
    levels[name.toLowerCase() === 'root' ? 'ROOT' : name] = level;
  }
  return levels;
}

/**
 * Every `logging.level` block in an application.yaml, one per document.
 *
 * A file named `application-prod.yaml` applies under `prod`; a document inside
 * any file that says `spring.config.activate.on-profile: prod` applies under
 * `prod` too. Both are how Spring does it, and a reader who only honoured the
 * file name would show the dev levels from the bottom of a single-file config
 * as though they were production's.
 */
export function parseYamlLevels(text: string, fileProfile?: string): LevelDoc[] {
  const docs = text.split(/^---\s*$/m);
  const out: LevelDoc[] = [];
  for (const doc of docs) {
    const flat = flattenYaml(doc);
    const levels = levelsFrom(flat);
    if (!Object.keys(levels).length) continue;
    out.push({ profile: profileOf(flat) ?? fileProfile, levels });
  }
  return out;
}

/** The same, for `application.properties` — `#---` separates documents there. */
export function parsePropertiesLevels(text: string, fileProfile?: string): LevelDoc[] {
  const docs = text.split(/^#---\s*$/m);
  const out: LevelDoc[] = [];
  for (const doc of docs) {
    const flat: Record<string, string> = {};
    for (const raw of doc.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('!')) continue;
      const m = /^([^=:\s]+)\s*[=:]\s*(.*)$/.exec(line);
      if (m) flat[m[1]] = m[2].trim();
    }
    const levels = levelsFrom(flat);
    if (!Object.keys(levels).length) continue;
    out.push({ profile: profileOf(flat) ?? fileProfile, levels });
  }
  return out;
}

/** `application-prod.yaml` → `prod`; `application.yml` → undefined. */
export function profileOfFile(file: string): string | undefined {
  const base = file.replace(/\\/g, '/').split('/').pop() ?? file;
  const m = /^(?:application|bootstrap)-([\w.-]+?)\.(?:ya?ml|properties)$/i.exec(base);
  return m ? m[1] : undefined;
}

/**
 * The levels in force under one profile: the unprofiled ones first, then the
 * profile's own over them, which is the order Spring applies them in.
 */
export function levelsFor(docs: LevelDoc[], chosen: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of docs) if (!d.profile) Object.assign(out, d.levels);
  for (const d of docs) if (d.profile && profileApplies(d.profile, chosen)) Object.assign(out, d.levels);
  return out;
}

// ── Spring Actuator ─────────────────────────────────────────────────────────

/**
 * `GET /actuator/loggers`, as the running application sees itself.
 *
 * The one source that cannot be out of date — it is the level in force right
 * now, after every profile and every runtime change — so where it answers, its
 * `effectiveLevel` wins over anything read from a file. Spring lists every
 * package on the way down to every class (`com`, `com.acme`, …), which is a
 * few thousand rows of which a handful were ever configured; `configuredOnly`
 * keeps the ones somebody actually set, and a class with a logger is kept
 * either way.
 */
export function parseActuatorLoggers(json: string, configuredOnly = false): DeclaredLogger[] {
  let body: { loggers?: Record<string, { configuredLevel?: string | null; effectiveLevel?: string | null }> };
  try {
    body = JSON.parse(json);
  } catch {
    return [];
  }
  const out: DeclaredLogger[] = [];
  for (const [name, v] of Object.entries(body.loggers ?? {})) {
    if (name === 'ROOT') continue;
    if (configuredOnly && !v?.configuredLevel) continue;
    out.push({ name, level: normaliseLevel(v?.configuredLevel ?? v?.effectiveLevel ?? undefined) });
  }
  return out;
}

// ── What kind of project this is ────────────────────────────────────────────

/**
 * "Spring Boot 3.2 · Maven · 2 modules" — the line under the folder name.
 *
 * It is there so the reader can tell at a glance that the right folder was
 * picked: a wrong guess about the build is harmless, a scan of the wrong
 * repository is not, and this line is what catches it.
 */
export function describeBuild(files: { pom?: string; gradle?: string; packageJson?: string; pyproject?: string }): string {
  const parts: string[] = [];
  if (files.pom) {
    const boot = /<artifactId>\s*spring-boot-starter-parent\s*<\/artifactId>\s*<version>\s*([\d.]+)/.exec(files.pom)
      ?? /spring-boot[\w-]*<\/artifactId>\s*<version>\s*([\d.]+)/.exec(files.pom);
    if (boot) parts.push(`Spring Boot ${boot[1].split('.').slice(0, 2).join('.')}`);
    parts.push('Maven');
    const modules = (files.pom.match(/<module>/g) ?? []).length;
    if (modules) parts.push(`${modules} module${modules === 1 ? '' : 's'}`);
  } else if (files.gradle) {
    const boot = /org\.springframework\.boot['"]?\s*\)?\s*version\s*['"]([\d.]+)/.exec(files.gradle);
    if (boot) parts.push(`Spring Boot ${boot[1].split('.').slice(0, 2).join('.')}`);
    parts.push('Gradle');
  }
  if (files.packageJson) parts.push('Node');
  if (files.pyproject) parts.push('Python');
  return parts.join(' · ');
}
