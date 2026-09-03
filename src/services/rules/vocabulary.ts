/**
 * What the rules know about frameworks, as data rather than code.
 *
 * Every rule in dk8s is built from the same handful of facts: this frame means
 * a transaction is open, that one means a JDBC statement is running, this
 * package is a Netty buffer. The rule LOGIC is small and stable — "a
 * transaction frame above a blocking-IO frame is a transaction held across a
 * network call" — while the vocabulary it reasons over grows every time
 * somebody uses a framework nobody had thought of.
 *
 * Keeping that vocabulary in the bundle means a new framework is a release.
 * Someone running Vert.x, or an in-house RPC client, or a JDBC driver we have
 * never heard of, gets silence from every rule and no way to fix it short of
 * filing an issue. So the patterns live here as data, a user pack can add to
 * them, and the rules stay code.
 *
 * A user pack ADDS. It cannot replace the built-ins, because replacing means
 * losing everything the tool already knows the moment you teach it one new
 * thing — and that failure is silent, which is the worst kind. Disabling is
 * explicit and by id.
 */

export type FrameCategory = 'txOpen' | 'blockingIo' | 'dbCall' | 'lockWait' | 'library' | 'eventLoop';

export interface VocabularyEntry {
  /** Stable, so a pack can disable one built-in without restating the rest. */
  id: string;
  /** A JavaScript regular expression, as a string. */
  pattern: string;
  /** Shown when a reader asks why a frame was badged the way it was. */
  note?: string;
}

export interface RulePack {
  version: string;
  frames: Partial<Record<FrameCategory, VocabularyEntry[]>>;
  /** Class-name patterns the heap rules match against, keyed by rule id. */
  heapClasses?: Record<string, VocabularyEntry[]>;
  /** Built-in ids to switch off, for a pack that disagrees with one. */
  disable?: string[];
}

/*
  The built-in pack.

  Deliberately conservative. A false positive tells someone their transaction
  boundary is wrong when it is not, and they go and move code to fix something
  that was never broken — which is worse than staying quiet. Every pattern is
  a frame that means one specific thing.
*/
export const BUILTIN_PACK: RulePack = {
  version: '1.1.0',
  frames: {
    txOpen: [
      { id: 'tx.spring.interceptor', pattern: '^org\\.springframework\\.transaction\\.interceptor\\.TransactionInterceptor\\.invoke', note: 'Spring: on the stack for the whole transactional call' },
      { id: 'tx.spring.aspect', pattern: '^org\\.springframework\\.transaction\\.interceptor\\.TransactionAspectSupport\\.invokeWithinTransaction' },
      { id: 'tx.spring.jpa', pattern: '^org\\.springframework\\.orm\\.jpa\\.JpaTransactionManager\\.' },
      { id: 'tx.jakarta', pattern: '^jakarta\\.transaction\\.' },
      { id: 'tx.quarkus.narayana', pattern: '^io\\.quarkus\\.narayana\\.jta\\.' },
      { id: 'tx.arjuna', pattern: '^com\\.arjuna\\.ats\\.jta\\.' },
      { id: 'tx.hibernate.jdbc', pattern: '^org\\.hibernate\\.resource\\.transaction\\.backend\\.jdbc\\.internal\\.JdbcResourceLocalTransactionCoordinator' },
      { id: 'tx.hibernate.impl', pattern: '^org\\.hibernate\\.engine\\.transaction\\.internal\\.TransactionImpl' },
    ],
    blockingIo: [
      // JDK 13+ and the older name: a dump from an older JVM is still a dump
      // someone will open.
      { id: 'io.nio.socket', pattern: '^(java\\.base/)?sun\\.nio\\.ch\\.NioSocketImpl\\.(read|connect)' },
      { id: 'io.socket.stream', pattern: '^java\\.net\\.SocketInputStream\\.socketRead' },
      { id: 'io.socket.plain', pattern: '^java\\.net\\.PlainSocketImpl\\.socketConnect' },
      // Clients that sit above the socket frame and name the intent.
      { id: 'io.okhttp', pattern: '^okhttp3\\.' },
      { id: 'io.apache.http', pattern: '^org\\.apache\\.http\\.impl\\.io\\.' },
      { id: 'io.apache.hc5', pattern: '^org\\.apache\\.hc\\.core5\\.' },
      { id: 'io.jdk.httpclient', pattern: '^java\\.net\\.http/jdk\\.internal\\.net\\.http\\.' },
      { id: 'io.feign', pattern: '^feign\\.' },
      { id: 'io.spring.resttemplate', pattern: '^org\\.springframework\\.web\\.client\\.RestTemplate\\.' },
      { id: 'io.spring.webclient', pattern: '^org\\.springframework\\.web\\.reactive\\.function\\.client\\.' },
    ],
    dbCall: [
      { id: 'db.mysql', pattern: '^com\\.mysql\\.cj\\.jdbc\\.' },
      { id: 'db.postgres', pattern: '^org\\.postgresql\\.jdbc\\.' },
      { id: 'db.oracle', pattern: '^oracle\\.jdbc\\.' },
      { id: 'db.sqlserver', pattern: '^com\\.microsoft\\.sqlserver\\.jdbc\\.' },
      { id: 'db.hikari.statement', pattern: '^com\\.zaxxer\\.hikari\\.pool\\.ProxyStatement' },
      { id: 'db.hikari.prepared', pattern: '^com\\.zaxxer\\.hikari\\.pool\\.ProxyPreparedStatement' },
      { id: 'db.mongo', pattern: '^com\\.mongodb\\.internal\\.connection\\.' },
      { id: 'db.cassandra', pattern: '^com\\.datastax\\.oss\\.driver\\.internal\\.' },
      { id: 'db.r2dbc', pattern: '^io\\.r2dbc\\.' },
    ],
    lockWait: [
      { id: 'lock.object.wait', pattern: '^java\\.lang\\.Object\\.wait' },
      { id: 'lock.unsafe.park', pattern: '^jdk\\.internal\\.misc\\.Unsafe\\.park' },
      { id: 'lock.unsafe.park.legacy', pattern: '^sun\\.misc\\.Unsafe\\.park' },
    ],
    /*
      Not the caller's own code.

      Used to decide which frame in a stack to NAME in a finding. Getting it
      wrong points the reader at a library's internals instead of the line in
      their own service that called it — the difference between a finding they
      can act on and one they have to translate.
    */
    library: [
      { id: 'lib.okhttp', pattern: '^okhttp3?\\.' },
      { id: 'lib.retrofit', pattern: '^retrofit2?\\.' },
      { id: 'lib.feign', pattern: '^feign\\.' },
      { id: 'lib.apache', pattern: '^org\\.apache\\.' },
      { id: 'lib.spring', pattern: '^org\\.springframework\\.' },
      { id: 'lib.hibernate', pattern: '^org\\.hibernate\\.' },
      { id: 'lib.jetty', pattern: '^org\\.eclipse\\.jetty\\.' },
      { id: 'lib.netty', pattern: '^io\\.netty\\.' },
      { id: 'lib.reactor', pattern: '^reactor\\.' },
      { id: 'lib.hikari', pattern: '^com\\.zaxxer\\.' },
      { id: 'lib.jackson', pattern: '^com\\.fasterxml\\.' },
      { id: 'lib.postgres', pattern: '^org\\.postgresql\\.' },
      { id: 'lib.mysql', pattern: '^com\\.mysql\\.' },
      { id: 'lib.oracle', pattern: '^oracle\\.' },
      { id: 'lib.logback', pattern: '^ch\\.qos\\.' },
      { id: 'lib.slf4j', pattern: '^org\\.slf4j\\.' },
      { id: 'lib.kotlin', pattern: '^kotlin(x)?\\.' },
      { id: 'lib.scala', pattern: '^scala\\.' },
    ],
    /*
      Thread NAMES, not frames — the one category matched against a thread's
      name rather than its stack.

      An event loop serves many connections from one thread, so blocking it
      stalls every request that thread is carrying, not just the one that
      blocked. The same call on a worker thread is unremarkable, which is why
      this rule needs the name: the stack alone cannot tell the difference.
    */
    eventLoop: [
      { id: 'loop.reactor.nio', pattern: '^reactor-http-nio-' },
      { id: 'loop.reactor.epoll', pattern: '^reactor-http-epoll-' },
      { id: 'loop.netty.group', pattern: '^nioEventLoopGroup-' },
      { id: 'loop.netty.epoll', pattern: '^epollEventLoopGroup-' },
      { id: 'loop.vertx', pattern: '^vert\\.x-eventloop-thread-' },
      { id: 'loop.webflux', pattern: '^reactor-tcp-nio-' },
      { id: 'loop.grpc', pattern: '^grpc-nio-worker-' },
      { id: 'loop.armeria', pattern: '^armeria-common-worker-' },
    ],
  },
};

// ── Compiling ───────────────────────────────────────────────────────────────

export interface CompiledVocabulary {
  version: string;
  frames: Record<FrameCategory, { id: string; re: RegExp }[]>;
  heapClasses: Record<string, RegExp[]>;
  /** Patterns that would not compile, so a bad pack is visible not silent. */
  problems: { id: string; pattern: string; message: string }[];
}

const CATEGORIES: FrameCategory[] = ['txOpen', 'blockingIo', 'dbCall', 'lockWait', 'library', 'eventLoop'];

/**
 * Merges packs and compiles them once.
 *
 * Later packs add to earlier ones. A pattern that does not compile is dropped
 * and reported rather than thrown: one bad line in a user's pack must not take
 * every rule down with it, and a rule engine that silently stops matching is
 * indistinguishable from an application with no problems.
 */
export function compileVocabulary(packs: RulePack[]): CompiledVocabulary {
  const problems: CompiledVocabulary['problems'] = [];
  const disabled = new Set(packs.flatMap(p => p.disable ?? []));

  const frames = {} as CompiledVocabulary['frames'];
  for (const cat of CATEGORIES) {
    const seen = new Set<string>();
    frames[cat] = [];
    for (const pack of packs) {
      for (const entry of pack.frames?.[cat] ?? []) {
        if (disabled.has(entry.id) || seen.has(entry.id)) continue;
        seen.add(entry.id);
        try {
          frames[cat].push({ id: entry.id, re: new RegExp(entry.pattern) });
        } catch (e) {
          problems.push({ id: entry.id, pattern: entry.pattern, message: (e as Error).message });
        }
      }
    }
  }

  const heapClasses: Record<string, RegExp[]> = {};
  for (const pack of packs) {
    for (const [ruleId, entries] of Object.entries(pack.heapClasses ?? {})) {
      for (const entry of entries) {
        if (disabled.has(entry.id)) continue;
        try {
          (heapClasses[ruleId] ??= []).push(new RegExp(entry.pattern));
        } catch (e) {
          problems.push({ id: entry.id, pattern: entry.pattern, message: (e as Error).message });
        }
      }
    }
  }

  return {
    version: packs.map(p => p.version).join('+'),
    frames, heapClasses, problems,
  };
}

/** Whether a frame matches a category, by the compiled vocabulary. */
export function matchesCategory(
  vocab: CompiledVocabulary, cat: FrameCategory, method: string,
): boolean {
  return vocab.frames[cat].some(p => p.re.test(method));
}

// ── The pack in use ─────────────────────────────────────────────────────────

let current: CompiledVocabulary = compileVocabulary([BUILTIN_PACK]);

export function vocabulary(): CompiledVocabulary { return current; }

/**
 * Installs a user pack on top of the built-ins.
 *
 * Passing nothing restores the built-ins alone, which is what "reset" means
 * and what a failed load has to fall back to.
 */
export function setUserPack(pack?: RulePack): CompiledVocabulary {
  current = compileVocabulary(pack ? [BUILTIN_PACK, pack] : [BUILTIN_PACK]);
  return current;
}

/** Reads a pack from JSON text, saying what is wrong rather than throwing. */
export function parsePack(text: string): { pack?: RulePack; error?: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { error: `That file is not valid JSON: ${(e as Error).message}` };
  }
  if (!raw || typeof raw !== 'object') return { error: 'A rule pack must be a JSON object.' };

  const p = raw as Partial<RulePack>;
  if (typeof p.version !== 'string') {
    return { error: 'A rule pack needs a "version" string, so findings can say which pack produced them.' };
  }
  const frames = p.frames ?? {};
  for (const [cat, entries] of Object.entries(frames)) {
    if (!CATEGORIES.includes(cat as FrameCategory)) {
      return { error: `Unknown frame category "${cat}". Expected one of: ${CATEGORIES.join(', ')}.` };
    }
    if (!Array.isArray(entries)) return { error: `"frames.${cat}" must be a list.` };
    for (const e of entries) {
      if (!e || typeof e.id !== 'string' || typeof e.pattern !== 'string') {
        return { error: `Every entry in "frames.${cat}" needs an "id" and a "pattern".` };
      }
    }
  }
  return { pack: p as RulePack };
}
