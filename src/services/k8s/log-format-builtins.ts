/**
 * Formats shipped with dk8s.
 *
 * These exist so that most pods work with no setup at all. Every one is
 * matched against a real line from that ecosystem in the tests — a built-in
 * that does not actually parse the thing it names is worse than none, because
 * it silently claims the pod and then produces grey lines anyway.
 *
 * Ordering matters: `resolveFormat` returns the first match, so narrower rules
 * belong above broader ones.
 */
import type { LogFormat } from './log-format';

export const BUILTIN_FORMATS: LogFormat[] = [
  {
    id: 'builtin.json',
    name: 'JSON (zap, pino, bunyan, slog)',
    kind: 'json',
    builtin: true,
    // No match rule: JSON is detected by the line starting with `{`, and the
    // parser returns null when it does not, so it costs one character
    // comparison to rule out. Attached by hand or by autodetect.
    fields: { timestamp: 'ts', level: 'level', logger: 'logger', message: 'msg' },
  },
  {
    id: 'builtin.logfmt',
    name: 'logfmt (Go, Heroku)',
    kind: 'logfmt',
    builtin: true,
    fields: { timestamp: 'ts', level: 'level', logger: 'component', message: 'msg' },
  },
  {
    id: 'builtin.spring',
    name: 'Spring Boot',
    kind: 'pattern',
    builtin: true,
    // 2026-08-30T02:41:05.171Z  WARN 1 --- [app] [ main] o.h.e.j.SqlExceptionHelper : message
    pattern: '%{TIMESTAMP} %{LEVEL} %{NUM} --- %{DATA}%{LOGGER} : %{MESSAGE}',
  },
  {
    id: 'builtin.python',
    name: 'Python logging',
    kind: 'pattern',
    builtin: true,
    // 2026-08-30 02:41:05,171 - myapp.db - ERROR - connection refused
    pattern: '%{TIMESTAMP} - %{LOGGER} - %{LEVEL} - %{MESSAGE}',
  },
  {
    id: 'builtin.logback',
    name: 'Logback / log4j default',
    kind: 'pattern',
    builtin: true,
    // 02:41:05.171 [main] ERROR com.acme.Db - connection refused
    pattern: '/^(?<timestamp>\\d{2}:\\d{2}:\\d{2}[.,]\\d+)\\s+\\[[^\\]]*\\]\\s+(?<level>[A-Z]+)\\s+(?<logger>\\S+)\\s+-\\s+(?<message>.*)/',
  },
  {
    id: 'builtin.go',
    name: 'Go standard library',
    kind: 'pattern',
    builtin: true,
    // 2026/08/30 02:41:05 db.go:42: connection refused — carries no level, so
    // every line lands as `other`, which is honest: the format has none.
    pattern: '/^(?<timestamp>\\d{4}\\/\\d{2}\\/\\d{2} \\d{2}:\\d{2}:\\d{2})\\s+(?<logger>[\\w.]+\\.go:\\d+):\\s+(?<message>.*)/',
  },
  {
    id: 'builtin.syslog',
    name: 'syslog (RFC 5424)',
    kind: 'pattern',
    builtin: true,
    // <11>1 2026-08-30T02:41:05Z host app - - - message
    // The priority encodes severity as facility*8 + level, so the last digit
    // is what matters and the levelMap turns it into a name.
    pattern: '/^<(?<level>\\d+)>\\d?\\s*(?<timestamp>\\S+)\\s+\\S+\\s+(?<logger>\\S+)\\s+\\S+\\s+\\S+\\s+\\S+\\s*(?<message>.*)/',
    levelMap: {
      '8': 'error', '9': 'error', '10': 'error', '11': 'error',
      '12': 'warn', '13': 'info', '14': 'info', '15': 'debug',
    },
  },
  {
    id: 'builtin.nginx',
    name: 'nginx / Apache access log',
    kind: 'pattern',
    builtin: true,
    // 10.0.2.15 - - [30/Aug/2026:02:41:05 +0000] "GET /health HTTP/1.1" 500 143
    // The HTTP status is the only severity there is, so it becomes the level
    // via levelMap — a 500 log line should read as an error, and until now it
    // read as nothing.
    pattern: '/^\\S+ \\S+ \\S+ \\[(?<timestamp>[^\\]]+)\\] "(?<message>[^"]*)" (?<level>\\d{3})/',
    levelMap: {
      '500': 'error', '501': 'error', '502': 'error', '503': 'error', '504': 'error',
      '400': 'warn', '401': 'warn', '403': 'warn', '404': 'warn', '429': 'warn',
      '200': 'info', '201': 'info', '204': 'info', '301': 'info', '302': 'info', '304': 'info',
    },
  },
];
