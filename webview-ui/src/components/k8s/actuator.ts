/**
 * Spring Boot's actuator, reached through a forward — finding it, and reading
 * what it answers. The dialog and the Loggers tab both start here.
 */
import { usePortForwardStore, type ForwardInfo, type ForwardPort } from '../../store/dk8s-port-forward-store';

/** Where the actuator lives when `management.endpoints.web.base-path` moved it. */
export const ACTUATOR_BASES = ['/actuator', '/management', '/manage'];

/** The ports worth asking: the actuator's own first, then the HTTP ones. */
export function candidatePorts(f: Pick<ForwardInfo, 'ports'>): ForwardPort[] {
  const rank = (p: ForwardPort) => (p.role === 'actuator' ? 0 : p.role === 'http' || !p.role ? 1 : p.role === 'metrics' ? 2 : 9);
  return f.ports.filter(p => rank(p) < 9).sort((a, b) => rank(a) - rank(b));
}

/** The endpoints an actuator index lists — `health`, `loggers`, … — or undefined when it is not one. */
export function parseLinks(body: string | undefined): string[] | undefined {
  try {
    const v = JSON.parse(body ?? '');
    const links = v?._links;
    if (!links || typeof links !== 'object') return undefined;
    /* `self` is the index itself; templated ones (`metrics-requiredMetricName`) are the same endpoint again. */
    return Object.keys(links).filter(k => k !== 'self' && !k.includes('-'));
  } catch { return undefined; }
}

export interface Actuator { port: number; base: string; links: string[] }

/** Find the actuator behind a forward: each candidate port, each base path, the first index that answers. */
export async function findActuator(f: ForwardInfo): Promise<Actuator | { error: string }> {
  const { call } = usePortForwardStore.getState();
  const tried: string[] = [];
  for (const p of candidatePorts(f)) {
    for (const base of ACTUATOR_BASES) {
      tried.push(`:${p.local}${base}`);
      const r = await call(f, p.local, base);
      /* A port that refuses is just not the one; a forward that went down ends the search. */
      if (r.status === 0 && /not up any more/.test(r.error ?? '')) return { error: r.error! };
      const links = r.status === 200 ? parseLinks(r.body) : undefined;
      if (links) return { port: p.local, base, links };
    }
  }
  return { error: `No actuator answered at ${tried.join(', ') || 'any port'}.` };
}

export const EXPOSE_HINT = 'management.endpoints.web.exposure.include=health,info,metrics,loggers,threaddump,heapdump';

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** A metric value in its unit: bytes in KB/MB, seconds to ms when small. */
export function formatMeasurement(value: number, unit?: string): string {
  if (unit === 'bytes') return formatBytes(value);
  if (unit === 'seconds' && value > 0 && value < 1) return `${(value * 1000).toFixed(1)} ms`;
  const s = Number.isInteger(value) ? value.toLocaleString() : value.toFixed(value < 10 ? 3 : 1);
  return unit ? `${s} ${unit}` : s;
}

export type Health = { status?: string; components?: Record<string, Health>; details?: Record<string, unknown> };
export function parseJson<T>(body: string | undefined): T | undefined {
  try { return JSON.parse(body ?? '') as T; } catch { return undefined; }
}
