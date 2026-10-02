/**
 * The loggers a running pod declares — "From this pod" in Add loggers.
 *
 * The project folder is the best source when somebody has the repository. A
 * tester often does not, and the pod does: its logback configuration is a file
 * in the container (or inside the jar), and a Spring app with Actuator will
 * say which loggers it has and at which level, as of right now.
 *
 * ── One exec, read-only ──
 *
 * Everything is one `sh -c` that prints what it finds between markers and
 * exits. It reads files and asks localhost; it does not write, not even to
 * /tmp, because a diagnostic tool that leaves files behind in somebody's
 * production container is one they stop trusting. Every step is bounded — a
 * `head -c` on every read, a `-m 3` on every request, a `-maxdepth` on the
 * one `find` — so a pod with a huge filesystem or a hung endpoint costs a few
 * seconds and not a timeout.
 *
 * Parsing is here and pure, so the markers and the file shapes are under test
 * without a cluster anywhere near them.
 */
import { parseLogbackXml, parseActuatorLoggers, type DeclaredLogger } from './logger-config';

const CAP = 262144;

/** Where Spring images keep their config, most common first. */
const PLACES = [
  '/app/resources', '/app/config', '/app', '/config', '/opt/app', '/opt/app/config',
  '/workspace/BOOT-INF/classes', '/application/BOOT-INF/classes', '/BOOT-INF/classes',
];
const NAMES = ['logback-spring.xml', 'logback.xml', 'log4j2-spring.xml', 'log4j2.xml'];
const PORTS = ['8080', '8081', '9090', '8558', '9000'];

/**
 * The script that runs in the container.
 *
 * `$MANAGEMENT_SERVER_PORT` goes first when it is set, because it is the
 * port Actuator actually listens on when somebody moved it — which is the
 * usual reason the ordinary ports answer 404.
 */
export function podLoggerScript(): string {
  const files = PLACES.flatMap(p => NAMES.map(n => `${p}/${n}`)).join(' ');
  const jarNames = NAMES.map(n => `BOOT-INF/classes/${n}`).join(' ');
  return [
    'seen=""',
    `for f in ${files}; do`,
    '  if [ -f "$f" ]; then echo "@@FILE $f"; head -c ' + CAP + ' "$f"; echo; echo "@@END"; seen="$seen $f"; fi',
    'done',
    'if [ -z "$seen" ]; then',
    `  for f in $(find / -xdev -maxdepth 5 \\( -name 'logback*.xml' -o -name 'log4j2*.xml' \\) 2>/dev/null | head -5); do`,
    '    echo "@@FILE $f"; head -c ' + CAP + ' "$f"; echo; echo "@@END"; seen="$seen $f"',
    '  done',
    'fi',
    'if [ -z "$seen" ] && command -v unzip >/dev/null 2>&1; then',
    '  for j in /app/*.jar /app.jar /opt/app/*.jar /workspace/*.jar; do',
    '    [ -f "$j" ] || continue',
    `    for n in ${jarNames}; do`,
    '      c=$(unzip -p "$j" "$n" 2>/dev/null | head -c ' + CAP + ')',
    '      if [ -n "$c" ]; then echo "@@FILE $j!/$n"; printf "%s\\n" "$c"; echo "@@END"; fi',
    '    done',
    '  done',
    'fi',
    `for p in \${MANAGEMENT_SERVER_PORT:-} ${PORTS.join(' ')}; do`,
    '  r=$( (curl -fsS -m 3 "http://localhost:$p/actuator/loggers" || wget -qO- -T 3 "http://localhost:$p/actuator/loggers") 2>/dev/null | head -c ' + (CAP * 4) + ')',
    '  if [ -n "$r" ]; then echo "@@ACTUATOR $p"; printf "%s\\n" "$r"; echo "@@END"; break; fi',
    'done',
    'exit 0',
  ].join('\n');
}

export interface PodLoggersRead {
  /** Each config file found, by the path it was read from. */
  files: { path: string; loggers: DeclaredLogger[]; root: DeclaredLogger[] }[];
  /** Actuator's answer, when one of the ports gave one. */
  actuator?: { port: string; loggers: DeclaredLogger[] };
}

/** Split the script's output back into what it found. */
export function parsePodLoggerOutput(stdout: string): PodLoggersRead {
  const out: PodLoggersRead = { files: [] };
  const re = /^@@(FILE|ACTUATOR) ([^\n]*)\n([\s\S]*?)\n?@@END$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stdout)) !== null) {
    const [, kind, where, body] = m;
    if (kind === 'FILE') {
      const read = parseLogbackXml(body);
      out.files.push({ path: where.trim(), loggers: read.loggers, root: read.root });
    } else if (!out.actuator) {
      /* Only the loggers somebody configured, or that a class declared by
         asking for one: Spring lists every package on the way down to every
         class, and three thousand `com`, `com.acme` rows are not a catalogue. */
      const all = parseActuatorLoggers(body);
      const configured = new Set(parseActuatorLoggers(body, true).map(l => l.name));
      const loggers = all.filter(l => configured.has(l.name) || /\.[A-Z][\w$]*$/.test(l.name));
      out.actuator = { port: where.trim(), loggers };
    }
  }
  return out;
}
