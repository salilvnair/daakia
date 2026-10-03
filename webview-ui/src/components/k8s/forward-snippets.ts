/**
 * A forward's address in the shape the next tool wants: a `.env` line, a
 * Spring `application-local.yml` block, a JDBC URL, the client command
 * (psql, mysql, redis-cli, mongosh), the exact kubectl command.
 *
 * dk8s never reads a Secret, so a user, password or database name is left as
 * a `<placeholder>` to fill in — the snippet says so.
 */
import type { ForwardPort, ForwardRequest, PortRole } from '../../store/dk8s-port-forward-store';

type Target = Pick<ForwardRequest, 'pod' | 'workload' | 'service'> & { ports: ForwardPort[] };

/** What the forward is called in config: the Service, else the workload, else the pod. */
export function targetName(t: Pick<Target, 'pod' | 'workload' | 'service'>): string {
  return t.service ?? t.workload?.name ?? t.pod;
}

const DB: PortRole[] = ['postgres', 'mysql', 'redis', 'mongo', 'kafka', 'amqp', 'mqtt'];
export const isDataRole = (r?: PortRole) => !!r && DB.includes(r);
const isHttpish = (r?: PortRole) => !r || r === 'http' || r === 'actuator' || r === 'metrics';

/** `zp-backend` → `ZP_BACKEND`. */
const envName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'SERVICE';
/** `zp-python` → `zp.python`. */
const propName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'service';

/** A connection URL for the port — a JDBC-free URL for data stores, http for the rest. */
export function connectionUrl(p: ForwardPort): string {
  switch (p.role) {
    case 'postgres': return `postgresql://<user>:<password>@localhost:${p.local}/<database>`;
    case 'mysql': return `mysql://<user>:<password>@localhost:${p.local}/<database>`;
    case 'redis': return `redis://localhost:${p.local}`;
    case 'mongo': return `mongodb://localhost:${p.local}/<database>`;
    case 'amqp': return `amqp://<user>:<password>@localhost:${p.local}`;
    case 'mqtt': return `mqtt://localhost:${p.local}`;
    case 'kafka': return `localhost:${p.local}`;
    case 'grpc': return `localhost:${p.local}`;
    case 'debug': return `localhost:${p.local}`;
    default: return `http://localhost:${p.local}`;
  }
}

export function jdbcUrl(p: ForwardPort): string | undefined {
  if (p.role === 'postgres') return `jdbc:postgresql://localhost:${p.local}/<database>`;
  if (p.role === 'mysql') return `jdbc:mysql://localhost:${p.local}/<database>`;
  return undefined;
}

/** The command-line client for a data port, if it has one. */
export function clientCommand(p: ForwardPort): string | undefined {
  switch (p.role) {
    case 'postgres': return `psql -h localhost -p ${p.local} -U <user> <database>`;
    case 'mysql': return `mysql -h 127.0.0.1 -P ${p.local} -u <user> -p <database>`;
    case 'redis': return `redis-cli -h 127.0.0.1 -p ${p.local}`;
    case 'mongo': return `mongosh mongodb://localhost:${p.local}/<database>`;
    default: return undefined;
  }
}

/** One `.env` line per port: `ZP_BACKEND_URL=http://localhost:8080`. */
export function envLines(targets: Target[]): string {
  const lines: string[] = [];
  for (const t of targets) {
    const base = envName(targetName(t));
    for (const p of t.ports) {
      const suffix = p.role === 'actuator' ? '_MANAGEMENT_URL'
        : p.role === 'metrics' ? '_METRICS_URL'
          : p.role === 'debug' ? '_DEBUG_ADDRESS'
            : p.role === 'grpc' || p.role === 'kafka' ? '_ADDRESS'
              : '_URL';
      const key = t.ports.filter(o => o.role === p.role).length > 1 ? `${base}_${p.remote}${suffix}` : `${base}${suffix}`;
      lines.push(`${key}=${connectionUrl(p)}`);
    }
  }
  return lines.join('\n');
}

/** The Spring Boot properties a port maps to, as `key: value` pairs. */
function springProps(t: Target, p: ForwardPort): [string, string][] {
  /* Two ports of one kind on one target — 8080 and 8081, both HTTP — each get
     their own key, the way `envLines` does; one key twice is a YAML file
     Spring reads as the last one only. */
  const n = propName(targetName(t)) + (t.ports.filter(o => o.role === p.role).length > 1 ? `.${p.remote}` : '');
  switch (p.role) {
    case 'postgres':
    case 'mysql':
      return [['spring.datasource.url', jdbcUrl(p)!], ['spring.datasource.username', '<user>'], ['spring.datasource.password', '<password>']];
    case 'redis': return [['spring.data.redis.host', 'localhost'], ['spring.data.redis.port', String(p.local)]];
    case 'mongo': return [['spring.data.mongodb.uri', connectionUrl(p)]];
    case 'kafka': return [['spring.kafka.bootstrap-servers', `localhost:${p.local}`]];
    case 'amqp': return [['spring.rabbitmq.host', 'localhost'], ['spring.rabbitmq.port', String(p.local)]];
    case 'actuator': return [[`${n}.management-url`, connectionUrl(p)]];
    case 'debug': return [];
    case 'grpc': return [[`grpc.client.${n}.address`, `static://localhost:${p.local}`]];
    default: return [[`${n}.base-url`, connectionUrl(p)]];
  }
}

/**
 * An `application-local.yml` block, flat keys (Spring reads them as-is), with
 * a header naming where it came from and what is left to fill in.
 */
export function applicationYml(targets: Target[], from?: string): string {
  const rows = targets.flatMap(t => t.ports.flatMap(p => springProps(t, p)));
  if (!rows.length) return '';
  const head = `# application-local.yml — ${from ? `from the "${from}" set` : `from the forward to ${targets.map(targetName).join(', ')}`}`;
  const secret = rows.some(([, v]) => v.includes('<'))
    ? ['# <user>, <password> and <database>: fill in — dk8s never reads Secrets'] : [];
  return [head, ...rows.map(([k, v]) => `${k}: ${v}`), ...secret].join('\n');
}

export interface Snippet { id: string; label: string; hint?: string; text: string }

/** Everything a forward can be copied as, in menu order. Empty ones are left out. */
export function snippetsFor(t: Target & { command?: string }): Snippet[] {
  const out: Snippet[] = [];
  const first = t.ports[0];
  if (first) out.push({ id: 'url', label: 'Address', hint: connectionUrl(first), text: t.ports.map(connectionUrl).join('\n') });
  out.push({ id: 'env', label: '.env line', text: envLines([t]) });
  const yml = applicationYml([t]);
  if (yml) out.push({ id: 'yml', label: 'application-local.yml', text: yml });
  for (const p of t.ports) {
    const j = jdbcUrl(p);
    if (j) out.push({ id: `jdbc:${p.local}`, label: 'JDBC URL', hint: `:${p.local}`, text: j });
    const c = clientCommand(p);
    if (c) out.push({ id: `cli:${p.local}`, label: `${c.split(' ')[0]} command`, hint: `:${p.local}`, text: c });
  }
  if (t.command) out.push({ id: 'kubectl', label: 'The kubectl command', text: t.command });
  return out;
}

export const opensInBrowser = (p?: ForwardPort) => !!p && isHttpish(p.role);
