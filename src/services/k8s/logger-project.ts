/**
 * A project folder, read for the loggers it has — the first source in "Add
 * loggers".
 *
 * One walk, three answers, because they live in the same tree and a second
 * walk of somebody's whole repository is a second wait:
 *
 *   - the logging configuration: `logback-spring.xml`'s `<logger>`s and every
 *     `application-<profile>.yaml`'s `logging.level`, with their profiles;
 *   - every source file that has a logger, by the name the log calls it —
 *     `@Slf4j` on `OrderService` is `com.acme.orders.OrderService`;
 *   - the logger calls themselves, handed back as source text for the webview
 *     to turn into patterns with the one parser a pasted call goes through
 *     (see `logger-scan.ts` for why there is only one).
 *
 * ── Read where it sits ──
 *
 * Nothing is written to the folder, nothing is sent anywhere, and nothing is
 * kept but the answer. The board says so under the table, and this file is
 * why that sentence is true: it has `readdir`, `stat` and `readFile`, and no
 * other kind of call.
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  scanText, SKIP_DIRS, MAX_FILE, isTest, languageOf,
  type ScanHit, type ScanLanguage,
} from './logger-scan';
import { loggerOfSource, fallbackLogger } from './logger-source';
import {
  parseLogbackXml, parseYamlLevels, parsePropertiesLevels, profileOfFile, describeBuild,
  type DeclaredLogger, type LevelDoc,
} from './logger-config';

export interface ProjectConfig {
  /** Relative to the folder that was read. */
  file: string;
  kind: 'logback' | 'yaml' | 'properties';
  /** `<logger>`s, for a logback or log4j2 file. */
  loggers?: DeclaredLogger[];
  /** `<root>` levels, per profile. */
  root?: DeclaredLogger[];
  /** `logging.level` blocks, for an application file. */
  levels?: LevelDoc[];
}

export interface ProjectClass {
  /** The logger's name, as the log writes it. */
  name: string;
  file: string;
  language: ScanLanguage;
  /** Declared in the file, rather than inferred from its path. */
  declared: boolean;
  /** Logger calls found in the file — "PATTERNS IN SOURCE". */
  calls: number;
  test: boolean;
}

export interface ProjectRead {
  folder: string;
  /** "Spring Boot 3.2 · Maven · 2 modules". Empty when nothing was recognised. */
  build: string;
  /** Every profile a file or a `<springProfile>` names, plus `default`. */
  profiles: string[];
  configs: ProjectConfig[];
  classes: ProjectClass[];
  hits: ScanHit[];
  filesRead: number;
  stoppedAt?: 'files' | 'hits';
  /**
   * What the files looked like when they were read — count and newest
   * modification. "Rescan when the project changes" compares this, so an
   * unchanged project is not merged into the catalogue a second time.
   */
  fingerprint: string;
}

const MAX_FILES = 6000;
const MAX_HITS = 4000;

const LOGGING_XML = /^(?:logback(?:-[\w.-]+)?|log4j2(?:-[\w.-]+)?)\.xml$/i;
const APPLICATION = /^(?:application|bootstrap)(?:-[\w.-]+)?\.(?:ya?ml|properties)$/i;

/** The profiles a set of configs mentions, `prod` first because it is what is running. */
export function profilesIn(configs: ProjectConfig[]): string[] {
  const found = new Set<string>();
  const add = (expr: string | undefined) => {
    for (const alt of (expr ?? '').split(/[|,&]/)) {
      const p = alt.trim().replace(/^!/, '').trim();
      if (p) found.add(p);
    }
  };
  for (const c of configs) {
    c.loggers?.forEach(l => add(l.profile));
    c.root?.forEach(l => add(l.profile));
    c.levels?.forEach(d => add(d.profile));
  }
  const rank = (p: string) => (p === 'prod' || p === 'production' ? 0 : p === 'default' ? 2 : 1);
  return [...found, 'default']
    .filter((p, i, all) => all.indexOf(p) === i)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export async function readProject(root: string): Promise<ProjectRead> {
  const configs: ProjectConfig[] = [];
  const classes: ProjectClass[] = [];
  const hits: ScanHit[] = [];
  let filesRead = 0;
  let newest = 0;
  let stoppedAt: ProjectRead['stoppedAt'];

  const readSmall = async (full: string): Promise<string | undefined> => {
    try {
      const stat = await fs.stat(full);
      if (stat.size > MAX_FILE) return undefined;
      newest = Math.max(newest, stat.mtimeMs);
      filesRead++;
      return await fs.readFile(full, 'utf8');
    } catch {
      return undefined;
    }
  };

  const walk = async (dir: string): Promise<void> => {
    if (stoppedAt) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (stoppedAt) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const relative = path.relative(root, full).replace(/\\/g, '/');
      if (filesRead >= MAX_FILES) { stoppedAt = 'files'; return; }

      /* Configuration under a test directory configures the tests. It is
         not what the pod runs with, and reading it would put the test
         profile's DEBUG levels into a production catalogue. */
      if (LOGGING_XML.test(entry.name) && !isTest(relative)) {
        const text = await readSmall(full);
        if (text) {
          const read = parseLogbackXml(text);
          configs.push({ file: relative, kind: 'logback', loggers: read.loggers, root: read.root });
        }
        continue;
      }
      if (APPLICATION.test(entry.name) && !isTest(relative)) {
        const text = await readSmall(full);
        if (text) {
          const profile = profileOfFile(entry.name);
          const levels = /\.properties$/i.test(entry.name)
            ? parsePropertiesLevels(text, profile)
            : parseYamlLevels(text, profile);
          configs.push({ file: relative, kind: /\.properties$/i.test(entry.name) ? 'properties' : 'yaml', levels });
        }
        continue;
      }

      const language = languageOf(entry.name);
      if (!language) continue;
      const text = await readSmall(full);
      if (!text) continue;

      const found = scanText(text, relative, language);
      const declared = loggerOfSource(text, relative, language);
      if (!declared && !found.length) continue;
      const logger = declared ?? fallbackLogger(text, relative, language);
      classes.push({
        name: logger.name, file: relative, language,
        declared: logger.declared, calls: found.length, test: isTest(relative),
      });
      for (const hit of found) {
        hits.push({ ...hit, logger: logger.name });
        if (hits.length >= MAX_HITS) { stoppedAt = 'hits'; return; }
      }
    }
  };

  await walk(root);

  /* The build files are read at the top only: a module's pom says the same
     thing as the parent's and the line under the folder name is a summary. */
  const top = async (name: string) => {
    try {
      const full = path.join(root, name);
      const stat = await fs.stat(full);
      return stat.size <= MAX_FILE ? await fs.readFile(full, 'utf8') : undefined;
    } catch {
      return undefined;
    }
  };
  const build = describeBuild({
    pom: await top('pom.xml'),
    gradle: (await top('build.gradle')) ?? (await top('build.gradle.kts')),
    packageJson: await top('package.json'),
    pyproject: (await top('pyproject.toml')) ?? (await top('setup.py')),
  });

  return {
    folder: root,
    build,
    profiles: profilesIn(configs),
    configs,
    classes,
    hits,
    filesRead,
    stoppedAt,
    fingerprint: `${filesRead}:${Math.round(newest)}`,
  };
}
