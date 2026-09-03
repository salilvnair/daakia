/**
 * A class or a stack frame, resolved to a file and a line in this workspace.
 *
 * This is the tool a profiler outside the editor structurally cannot have.
 * JProfiler's agent runs in the JVM and its UI runs somewhere else; the source
 * is in a third place, and the best it can do is print a class name and let a
 * human go and find it. dk8s is already in the window holding the code, so a
 * frame can become a file and a line — which is the difference between "the
 * time is in LedgerClient.post" and "here is the line, and here is the diff".
 *
 * Resolution is filesystem-only. The VS Code API is not available in the
 * standalone MCP process, and reaching for it would tie this tool to running
 * inside the editor — which is exactly the coupling that makes JProfiler's
 * version impossible.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, sep } from 'path';

/** Directories that never hold hand-written source and are enormous. */
const SKIP = new Set([
  'node_modules', '.git', 'build', 'out', 'target', 'dist', '.gradle',
  '.idea', '.vscode', 'bin', 'obj', 'vendor', '__pycache__', '.venv',
]);

const EXTENSIONS = ['.java', '.kt', '.scala', '.groovy', '.py', '.ts', '.js'];

export interface SourceHit {
  path: string;
  /** Relative to the workspace, which is what a person recognises. */
  relative: string;
  line?: number;
  /** The line's text, so the caller can see it matched the right thing. */
  preview?: string;
}

/**
 * What was asked for, pulled apart.
 *
 * Handles `com.acme.Order`, `com.acme.Order.submit`, `Order.submit:42` and
 * `com.acme.Order.submit(Order.java:42)` — the shapes that appear in stacks,
 * hot spot rows and allocation sites, because those are where a caller will
 * have copied it from.
 */
export function parseSymbol(raw: string): {
  simpleName: string; packagePath?: string; method?: string; line?: number;
} {
  let s = raw.trim();

  // `com.acme.Order.submit(Order.java:42)` — the parenthesised form.
  const paren = /\(([^:()]+):(\d+)\)\s*$/.exec(s);
  let line: number | undefined;
  if (paren) { line = Number(paren[2]); s = s.slice(0, paren.index); }

  // `…:42`
  const trailing = /:(\d+)\s*$/.exec(s);
  if (trailing) { line = Number(trailing[1]); s = s.slice(0, trailing.index); }

  s = s.replace(/\//g, '.').replace(/^\[+L?/, '').replace(/;$/, '');

  const parts = s.split('.').filter(Boolean);
  let method: string | undefined;
  /*
    A trailing lowercase segment is a method, not a class.

    `com.acme.Order.submit` and `com.acme.order.Order` differ only by that
    convention, and there is nothing else in the string to go on. Getting it
    wrong means searching for a file named after a method, which finds nothing
    — a miss rather than a wrong answer.
  */
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (last && /^[a-z_<$]/.test(last)) method = parts.pop();
  }

  const simpleName = (parts.pop() ?? '').split('$')[0];
  return {
    simpleName,
    packagePath: parts.length ? parts.join(sep) : undefined,
    method, line,
  };
}

/** Every candidate file with this base name, breadth-first from the root. */
function findByName(root: string, simpleName: string, limit = 40): string[] {
  const wanted = new Set(EXTENSIONS.map(e => simpleName + e));
  const out: string[] = [];
  const queue: string[] = [root];

  while (queue.length && out.length < limit) {
    const dir = queue.shift()!;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { continue; }
    for (const name of entries) {
      if (SKIP.has(name)) continue;
      const full = join(dir, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) queue.push(full);
      else if (wanted.has(name)) out.push(full);
    }
  }
  return out;
}

/** The line a method is declared on, or undefined when it cannot be found. */
function lineOfMethod(file: string, method: string): { line: number; text: string } | undefined {
  let text: string;
  try { text = readFileSync(file, 'utf8'); } catch { return undefined; }
  const lines = text.split('\n');
  // A declaration, not a call: the name followed by `(`, with something that
  // looks like a signature around it rather than an expression.
  const decl = new RegExp(`(^|[\\s.<])${method.replace(/[$]/g, '\\$')}\\s*\\(`);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!decl.test(l)) continue;
    if (/^\s*(\/\/|\*|#)/.test(l)) continue;                 // a comment
    if (/\b(return|=|throw)\s/.test(l) && !/\b(void|public|private|protected|def|function|fun)\b/.test(l)) continue;
    return { line: i + 1, text: l.trim() };
  }
  return undefined;
}

export function openSource(root: string, symbol: string): {
  hits: SourceHit[]; note?: string;
} {
  const { simpleName, packagePath, method, line } = parseSymbol(symbol);
  if (!simpleName) return { hits: [], note: 'Nothing in that symbol looks like a class name.' };

  // Never in a workspace, and worth saying rather than searching for.
  if (/^(java|javax|jdk|sun|kotlin|scala)$/.test(simpleName)
    || /^(java|javax|jdk|sun|com\.sun)\./.test(symbol.replace(/\//g, '.'))) {
    return { hits: [], note: `${symbol} is a runtime class — it has no source in this workspace.` };
  }

  const files = findByName(root, simpleName);
  if (!files.length) {
    return { hits: [], note: `No file named ${simpleName}.* under ${root}.` };
  }

  /*
    The package path breaks the tie.

    Two modules can both have an `OrderService.java`, and picking the first is
    a coin flip that reads like an answer. Where the symbol carried a package,
    a file whose path contains it wins.
  */
  const ranked = packagePath
    ? [...files].sort((a, b) =>
        Number(b.includes(packagePath)) - Number(a.includes(packagePath)))
    : files;

  const hits: SourceHit[] = ranked.slice(0, 5).map(path => {
    const found = line === undefined && method ? lineOfMethod(path, method) : undefined;
    const at = line ?? found?.line;
    let preview = found?.text;
    if (preview === undefined && at !== undefined) {
      try { preview = readFileSync(path, 'utf8').split('\n')[at - 1]?.trim(); } catch { /* unreadable */ }
    }
    return {
      path,
      relative: path.startsWith(root) ? path.slice(root.length + 1) : path,
      line: at,
      preview,
    };
  });

  const note = hits.length > 1
    ? `${hits.length} files named ${simpleName} — the first is the best match for the package.`
    : method && hits[0]?.line === undefined
      ? `Found the file, but not a declaration of ${method}() in it.`
      : undefined;

  return { hits, note };
}
