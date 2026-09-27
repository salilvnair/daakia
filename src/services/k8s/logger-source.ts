/**
 * The logger a source file writes through, by name.
 *
 * Most loggers in a Spring service are never mentioned in logback at all. A
 * class with `@Slf4j`, or `LoggerFactory.getLogger(OrderService.class)`, is a
 * logger named `com.acme.orders.OrderService` whether or not any config file
 * says so — which is most of them, and exactly the ones a tester has never
 * heard of. The configuration names a handful of packages; the source names
 * every class.
 *
 * So this answers one question per file: what does the log call this file's
 * logger. It reads the declaration where there is one (a string literal in
 * `getLogger("audit")` is a logger called `audit`, not the class) and falls
 * back to the language's own convention where there is not.
 */
import type { ScanLanguage } from './logger-scan';

export interface SourceLogger {
  name: string;
  /**
   * The file declares a logger — an annotation, a factory call, a
   * `getLogger(__name__)` — rather than only calling one somebody passed in.
   * The difference is shown: a declared logger is a fact, a name inferred
   * from the path is a convention.
   */
  declared: boolean;
}

function baseName(file: string): string {
  const b = file.replace(/\\/g, '/').split('/').pop() ?? file;
  return b.replace(/\.[^.]+$/, '');
}

/** `src/workers/settlement.py` → `workers.settlement`. */
export function pythonModule(file: string): string {
  const parts = file.replace(/\\/g, '/').replace(/\.py$/, '').split('/').filter(Boolean);
  while (parts.length > 1 && ['src', 'lib', 'app'].includes(parts[0])) parts.shift();
  if (parts[parts.length - 1] === '__init__') parts.pop();
  return parts.join('.');
}

function javaLogger(text: string, file: string): SourceLogger | undefined {
  const pkg = /^\s*package\s+([\w.]+)\s*;?/m.exec(text)?.[1];
  const cls = baseName(file);
  const qualify = (c: string) => (pkg ? `${pkg}.${c}` : c);

  /* A string literal wins: `getLogger("audit")` is how a team names a logger
     that is not a class — an audit trail, a metrics channel — and that name is
     what the log carries. */
  const literal = /(?:LoggerFactory|LogManager|Logger|KotlinLogging)\s*\.\s*(?:getLogger|logger)\s*\(\s*"([^"]+)"/.exec(text);
  if (literal) return { name: literal[1], declared: true };

  const ofClass = /(?:LoggerFactory|LogManager|Logger)\s*\.\s*getLogger\s*\(\s*([A-Z]\w*)\s*(?:\.class|::class)/.exec(text);
  if (ofClass) return { name: qualify(ofClass[1]), declared: true };

  if (/@(?:Slf4j|XSlf4j|Log4j2?|CommonsLog|Log|Flogger|JBossLog)\b/.test(text)
    || /(?:LoggerFactory|LogManager)\s*\.\s*getLogger\s*\(\s*(?:getClass\(\)|javaClass|this::class|MethodHandles)/.test(text)
    || /LogManager\s*\.\s*getLogger\s*\(\s*\)/.test(text)
    || /KotlinLogging\s*\.\s*logger\s*\{/.test(text)) {
    return { name: qualify(cls), declared: true };
  }
  return undefined;
}

function pythonLogger(text: string, file: string): SourceLogger | undefined {
  const literal = /(?:logging|structlog|loguru)?\.?get_?[Ll]ogger\s*\(\s*["']([^"']+)["']/.exec(text);
  if (literal) return { name: literal[1], declared: true };
  if (/get_?[Ll]ogger\s*\(\s*__name__\s*\)/.test(text)) {
    return { name: pythonModule(file), declared: true };
  }
  return undefined;
}

function nodeLogger(text: string): SourceLogger | undefined {
  /* pino's `name`, a winston logger's `defaultMeta.service`, a child's
     `module` — the three places a Node service writes the name its lines
     carry. */
  const named = /(?:pino|createLogger|child|getLogger)\s*\(\s*\{[^}]*?\b(?:name|service|module|component)\s*:\s*['"`]([^'"`]+)['"`]/.exec(text)
    ?? /getLogger\s*\(\s*['"`]([^'"`]+)['"`]/.exec(text);
  if (named) return { name: named[1], declared: true };
  return undefined;
}

function goLogger(text: string): SourceLogger | undefined {
  const named = /slog\s*\.\s*With\s*\(\s*"(?:component|logger|module|name)"\s*,\s*"([^"]+)"/.exec(text);
  if (named) return { name: named[1], declared: true };
  return undefined;
}

/**
 * The logger for one file, or `undefined` when the file declares none and
 * the caller has no calls in it either — see `fallbackLogger`.
 */
export function loggerOfSource(text: string, file: string, language: ScanLanguage): SourceLogger | undefined {
  switch (language) {
    case 'java': return javaLogger(text, file);
    case 'python': return pythonLogger(text, file);
    case 'node': return nodeLogger(text);
    case 'go': return goLogger(text);
  }
  return undefined;
}

/**
 * The name to use for a file that calls a logger without declaring one.
 *
 * By each language's convention: a Java class is its package and name, a
 * Python module its dotted path, a Node file `folder:file` the way most
 * teams tag them, a Go file its package directory. Marked as not declared, so
 * the catalogue can say it was inferred.
 */
export function fallbackLogger(text: string, file: string, language: ScanLanguage): SourceLogger {
  const rel = file.replace(/\\/g, '/');
  switch (language) {
    case 'java': {
      const pkg = /^\s*package\s+([\w.]+)\s*;?/m.exec(text)?.[1];
      return { name: pkg ? `${pkg}.${baseName(rel)}` : baseName(rel), declared: false };
    }
    case 'python':
      return { name: pythonModule(rel), declared: false };
    case 'node': {
      const parts = rel.split('/').filter(p => !['src', 'lib', 'app'].includes(p));
      const top = parts.length > 1 ? parts[0] : '';
      return { name: top ? `${top}:${baseName(rel)}` : baseName(rel), declared: false };
    }
    case 'go': {
      const dir = rel.split('/').slice(0, -1).join('/');
      return { name: dir || (/^\s*package\s+(\w+)/m.exec(text)?.[1] ?? baseName(rel)), declared: false };
    }
  }
  return { name: baseName(rel), declared: false };
}
