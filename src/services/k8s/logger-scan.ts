/**
 * Every logger call in a source tree, found by reading it.
 *
 * The catalogue is worth most when it is complete, and pasting calls one at a
 * time never gets there — a Spring Boot service has a few hundred of them. If
 * the person has the repository open, the whole catalogue is already on disk.
 *
 * ── What this deliberately does NOT do ──
 *
 * It does not parse the calls. It finds them and hands back the source text,
 * and the webview turns each one into a pattern with the same parser a pasted
 * call goes through. One parser, one set of rules, one place where "what does
 * `{}` mean" is answered — a second implementation here would drift from it
 * within a release, and the drift would show up as patterns that match in the
 * Add box and not after a scan.
 *
 * ── The costs it has to respect ──
 *
 * A repository is somebody's whole working tree, on their machine, and this
 * walks it while they wait. So: directories that never hold application source
 * are skipped outright, a file bigger than `MAX_FILE` is not read, and the walk
 * stops at `MAX_FILES` and `MAX_HITS` rather than finishing at any cost. A scan
 * that stops early says so; one that takes a minute is a scan nobody runs
 * twice.
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { loggerOfSource, fallbackLogger } from './logger-source';

export type ScanLanguage = 'java' | 'python' | 'node' | 'go';

export interface ScanHit {
  /** Path relative to the folder that was scanned. */
  file: string;
  /** 1-based, so it reads the way an editor's gutter does. */
  line: number;
  /** The call itself, as written. The webview parses this. */
  code: string;
  language: ScanLanguage;
  /** Test source, by its path. Off by default when the hits are offered. */
  test: boolean;
  /**
   * The logger this call writes through — the class, the module, the name a
   * `getLogger("…")` gave it. What the catalogue files the pattern under, so
   * a scanned message lands beside its logger instead of in a pile of its own.
   */
  logger?: string;
}

export interface ScanResult {
  hits: ScanHit[];
  filesRead: number;
  /** Why it stopped, when it stopped early. */
  stoppedAt?: 'files' | 'hits';
}

export const MAX_FILE = 512 * 1024;
const MAX_FILES = 4000;
const MAX_HITS = 2000;

/** Never application source, always large. */
export const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'target', 'build', 'dist', 'out',
  '.gradle', '.idea', '.vscode', '__pycache__', '.venv', 'venv', 'vendor',
  'coverage', '.next', '.nuxt', '.cache', 'bin', 'obj',
]);

const LANGUAGES: { ext: string[]; language: ScanLanguage }[] = [
  { ext: ['.java', '.kt', '.scala', '.groovy'], language: 'java' },
  { ext: ['.py'], language: 'python' },
  { ext: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'], language: 'node' },
  { ext: ['.go'], language: 'go' },
];

/**
 * A logger call, at its opening paren.
 *
 * Receiver-then-level, which is what every logging API in every one of these
 * languages looks like. The receiver has to end in something log-ish: matching
 * any `x.info(` finds `response.info(`, `metrics.error(` and a hundred other
 * methods that are not logging, and a catalogue full of those is one nobody
 * reads.
 */
const CALL = /(?:^|[^\w])((?:[\w$]*(?:log|logger|logging|slf4j|console)[\w$]*)\s*(?:\.\s*[\w$]+\s*)*?)\.\s*(trace|debug|info|warn|warning|error|fatal|exception)\s*\(/gi;

/** Test source, by convention rather than by content. */
export function isTest(relative: string): boolean {
  const p = relative.replace(/\\/g, '/').toLowerCase();
  return p.includes('/test/') || p.includes('/tests/') || p.includes('/spec/')
    || /(^|\/)test_[^/]*$/.test(p) || /[._-](test|spec)\.[\w]+$/.test(p);
}

export function languageOf(file: string): ScanLanguage | undefined {
  const ext = path.extname(file).toLowerCase();
  return LANGUAGES.find(l => l.ext.includes(ext))?.language;
}

/**
 * From the opening paren to the paren that closes it.
 *
 * A call is regularly written over three lines — the message on one, the
 * arguments on the next — and cutting at the newline gives the parser half a
 * call, which it rightly refuses. Strings are tracked because a paren inside
 * the message is not structure, and `"("` in a log message is common enough to
 * matter.
 */
export function callAt(text: string, openParen: number): string | undefined {
  let depth = 0;
  let quote: string | undefined;

  for (let i = openParen; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === '\'' || ch === '`') { quote = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return text.slice(openParen, i + 1);
    }
    /* A call that has not closed within this much is not a call — it is an
       unbalanced paren inside a comment, and following it to the end of a
       200KB file costs more than the hit is worth. */
    if (i - openParen > 4000) return undefined;
  }
  return undefined;
}

/** Every logger call in one file's text. */
export function scanText(text: string, file: string, language: ScanLanguage): ScanHit[] {
  const hits: ScanHit[] = [];
  const test = isTest(file);
  CALL.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = CALL.exec(text)) !== null) {
    const openParen = text.indexOf('(', m.index + m[0].length - 1);
    if (openParen === -1) continue;

    const args = callAt(text, openParen);
    if (!args) continue;

    /* Handed over as `receiver.level(args)` — the shape the pasted-call parser
       expects, rebuilt rather than sliced, so leading whitespace and whatever
       came before it on the line are left out. */
    const code = `${m[1].replace(/\s+/g, '')}.${m[2]}${args}`;
    /* Where the RECEIVER starts, not where the match does: the pattern eats
       the character before it, which after the first call is the newline that
       ended the previous line — so counting from `m.index` reported every call
       on the line above its own. */
    const at = m.index + Math.max(0, m[0].indexOf(m[1]));

    hits.push({
      file,
      line: text.slice(0, at).split('\n').length,
      code: code.replace(/\s*\n\s*/g, ' '),
      language,
      test,
    });
    CALL.lastIndex = openParen + 1;
  }
  return hits;
}

/** Walk a folder and read every source file in it. */
export async function scanFolder(root: string): Promise<ScanResult> {
  const hits: ScanHit[] = [];
  let filesRead = 0;
  let stoppedAt: ScanResult['stoppedAt'];

  const walk = async (dir: string): Promise<void> => {
    if (stoppedAt) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      /* A directory that cannot be read is one the scan does not cover. It is
         not a reason to fail the whole walk — a repository routinely has one. */
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

      const language = languageOf(entry.name);
      if (!language) continue;

      if (filesRead >= MAX_FILES) { stoppedAt = 'files'; return; }

      try {
        const stat = await fs.stat(full);
        if (stat.size > MAX_FILE) continue;
        const text = await fs.readFile(full, 'utf8');
        filesRead++;
        const relative = path.relative(root, full);
        const found = scanText(text, relative, language);
        /* One logger per file, worked out once — not per call, and not at all
           for a file with nothing in it. */
        const logger = found.length
          ? (loggerOfSource(text, relative, language) ?? fallbackLogger(text, relative, language)).name
          : undefined;
        for (const hit of found) {
          hits.push({ ...hit, logger });
          if (hits.length >= MAX_HITS) { stoppedAt = 'hits'; return; }
        }
      } catch {
        // Unreadable, binary, or gone since the listing. Skip it.
      }
    }
  };

  await walk(root);
  return { hits, filesRead, stoppedAt };
}
