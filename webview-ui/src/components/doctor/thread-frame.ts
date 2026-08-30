/**
 * Reading a stack frame.
 *
 * A thread dump is forty frames of which two matter. The rest is the JDK
 * getting to your code and the framework getting to it after that — necessary
 * to the story and not the point of it. Printed in one colour, finding your
 * own class means reading every line; coloured by origin, it is the only thing
 * that stands out.
 *
 * The classification is deliberately coarse. "Is this mine, the platform, or a
 * library" is the question being asked, and a taxonomy finer than that would
 * need a package list nobody will maintain.
 */

export type FrameOrigin = 'app' | 'jdk' | 'framework' | 'native';

export interface ParsedFrame {
  origin: FrameOrigin;
  /** `com.zapper.zp.dk8s` — dimmed, because it repeats down the whole stack. */
  packageName: string;
  /** `Dk8sFaultInjector` — the part worth reading. */
  className: string;
  method: string;
  /** `Dk8sFaultInjector.java:151`, when the dump carries it. */
  location?: string;
}

/**
 * Packages that are the platform or a library rather than the application.
 *
 * Ordered longest-first at match time so `org.apache.catalina` is not claimed
 * by a shorter prefix that happens to sort earlier.
 */
const JDK_PREFIXES = [
  'java.', 'javax.', 'jdk.', 'sun.', 'com.sun.', 'jrt.', 'jakarta.',
];

const FRAMEWORK_PREFIXES = [
  'org.springframework.', 'org.apache.', 'org.hibernate.', 'org.jboss.',
  'org.eclipse.', 'org.slf4j.', 'ch.qos.logback.', 'io.netty.', 'io.micrometer.',
  'com.zaxxer.hikari.', 'org.postgresql.', 'com.mysql.', 'org.mongodb.',
  'redis.clients.', 'org.junit.', 'org.mockito.', 'com.fasterxml.jackson.',
  'reactor.', 'io.grpc.', 'kotlin.', 'scala.', 'groovy.', 'org.codehaus.',
  'org.glassfish.', 'org.jetbrains.', 'akka.', 'play.', 'feign.',
  'org.elasticsearch.', 'co.elastic.', 'org.quartz.', 'net.sf.', 'org.aspectj.',
];

export function originOf(qualified: string, raw = ''): FrameOrigin {
  if (/native method/i.test(raw)) return 'native';
  const q = qualified;
  if (JDK_PREFIXES.some(p => q.startsWith(p))) return 'jdk';
  if (FRAMEWORK_PREFIXES.some(p => q.startsWith(p))) return 'framework';
  return 'app';
}

/**
 * Split one frame's text.
 *
 * The shapes a JVM actually prints:
 *
 *   com.zapper.Svc.run(Svc.java:151)
 *   sun.nio.ch.Net.poll(java.base@21.0.12/Native Method)
 *   java.lang.Thread.run(java.base@21.0.12/Unknown Source)
 *   com.zapper.Svc$$Lambda/0x00007f.run(Unknown Source)
 *
 * Anything that does not match falls back to the raw text as the method, so a
 * vendor format nobody anticipated still renders rather than disappearing.
 */
export function parseFrame(raw: string): ParsedFrame {
  const text = raw.replace(/^\s*at\s+/, '').trim();

  // Split at the last '(' — a lambda's synthetic name can contain '/' and '$'
  // but the location is always the final parenthesised group.
  const open = text.lastIndexOf('(');
  const qualified = (open === -1 ? text : text.slice(0, open)).trim();
  const inside = open === -1 ? '' : text.slice(open + 1).replace(/\)\s*$/, '');

  // `java.base@21.0.12/Svc.java:151` — the module prefix is noise.
  const location = inside.includes('/') ? inside.slice(inside.lastIndexOf('/') + 1) : inside;

  const lastDot = qualified.lastIndexOf('.');
  const method = lastDot === -1 ? qualified : qualified.slice(lastDot + 1);
  const typeName = lastDot === -1 ? '' : qualified.slice(0, lastDot);

  const typeDot = typeName.lastIndexOf('.');
  const packageName = typeDot === -1 ? '' : typeName.slice(0, typeDot);
  const className = typeDot === -1 ? typeName : typeName.slice(typeDot + 1);

  return {
    origin: originOf(qualified, raw),
    packageName,
    className,
    method,
    // Only a real file:line. `Unknown Source` and `Native Method` are
    // states, not locations — and `native` already carries the second.
    location: location && !/^(Unknown Source|Native Method)$/i.test(location)
      ? location
      : undefined,
  };
}

/**
 * The frames worth looking at first.
 *
 * The topmost application frame is where a thread actually is in your code,
 * and it is what someone scans a stack for. Returned as indices so the caller
 * can mark them in place rather than reordering the stack, which would destroy
 * the call order that makes it readable.
 */
export function appFrameIndices(frames: { raw: string }[]): number[] {
  const out: number[] = [];
  frames.forEach((f, i) => {
    if (parseFrame(f.raw).origin === 'app') out.push(i);
  });
  return out;
}

/** A one-line answer to "where is this thread". */
export function summariseStack(frames: { raw: string }[]): string {
  if (!frames.length) return 'no stack';
  const app = appFrameIndices(frames);
  // The application frame nearest the top, or the top frame when a thread is
  // entirely inside the platform — which is itself the answer for a parked
  // pool worker.
  const f = parseFrame(frames[app[0] ?? 0].raw);
  return `${f.className}.${f.method}${f.location ? ` (${f.location})` : ''}`;
}
