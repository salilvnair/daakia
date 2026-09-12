/**
 * Reading a connection snapshot.
 *
 * The snapshot on its own is a table of sockets, and handing that to a model
 * as the whole evidence pack was close to useless: for a quiet pod it is two
 * lines — a header and one LISTEN row — which says nothing a model can reason
 * from, and for a busy one it is hundreds of rows whose meaning is in the
 * counts rather than in any single line.
 *
 * What actually diagnoses something is the shape: how many sockets are
 * established and to whom, how many are stuck in a state that means the
 * application is not closing them, whether anything is trying to reach a peer
 * that never answers. That is what this computes, and it is what gets sent
 * alongside the table.
 *
 * Nothing here talks to a cluster; it parses text that has already been
 * collected, which is why it is pure and testable.
 */

export interface ConnRow {
  state: string;
  local: string;
  remote: string;
}

export interface ConnSummary {
  rows: ConnRow[];
  /** Socket count per TCP state, most common first. */
  byState: [string, number][];
  /** Ports this pod is accepting on. */
  listening: string[];
  /** Distinct remote peers with an established connection, and how many each. */
  peers: [string, number][];
  /** Plain-language observations, strongest first. */
  findings: string[];
}

/** `ss -tanp` output, or the decoded /proc/net/tcp table. */
export function parseConnSnapshot(text: string): ConnRow[] {
  const rows: ConnRow[] = [];
  for (const raw of (text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const f = line.split(/\s+/);
    // Our own decoded table, and `ss -tan`, both lead with the state.
    const head = f[0].toUpperCase();
    if (head === 'STATE' || head === 'NETID' || head === 'SL') continue;
    if (!/^[A-Z][A-Z_0-9-]+$/.test(head)) continue;

    // `ss -tan` puts Recv-Q and Send-Q between the state and the addresses.
    const addrs = f.slice(1).filter(x => x.includes(':'));
    if (addrs.length < 2) continue;
    rows.push({ state: normaliseState(head), local: addrs[0], remote: addrs[1] });
  }
  return rows;
}

/** `ss` says ESTAB and LISTEN; /proc says ESTABLISHED. One spelling. */
function normaliseState(s: string): string {
  if (s === 'ESTAB') return 'ESTABLISHED';
  if (s === 'UNCONN') return 'UNCONNECTED';
  return s;
}

const portOf = (addr: string) => addr.slice(addr.lastIndexOf(':') + 1);
const hostOf = (addr: string) => addr.slice(0, addr.lastIndexOf(':'));

export function summariseConnections(text: string): ConnSummary {
  const rows = parseConnSnapshot(text);

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.state, (counts.get(r.state) ?? 0) + 1);
  const byState = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  const listening = [...new Set(
    rows.filter(r => r.state === 'LISTEN').map(r => portOf(r.local)),
  )];

  const peerCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.state !== 'ESTABLISHED') continue;
    peerCounts.set(r.remote, (peerCounts.get(r.remote) ?? 0) + 1);
  }
  const peers = [...peerCounts.entries()].sort((a, b) => b[1] - a[1]);

  const n = (s: string) => counts.get(s) ?? 0;
  const findings: string[] = [];

  // The states worth naming, and what each one means for the application.
  if (n('CLOSE_WAIT') > 0) {
    findings.push(
      `${n('CLOSE_WAIT')} socket(s) in CLOSE_WAIT. The peer closed and this process has not — `
      + 'almost always a connection, response body or client that is never closed in the '
      + 'application code. These do not time out on their own and will exhaust the file '
      + 'descriptor limit if they keep accumulating.',
    );
  }
  if (n('SYN_SENT') > 0) {
    findings.push(
      `${n('SYN_SENT')} socket(s) stuck in SYN_SENT — this pod is trying to open a connection `
      + 'and getting no answer. A NetworkPolicy, a security group or a wrong address, not a '
      + 'slow peer.',
    );
  }
  if (n('FIN_WAIT1') + n('FIN_WAIT2') > 4) {
    findings.push(
      `${n('FIN_WAIT1') + n('FIN_WAIT2')} socket(s) in FIN_WAIT — this side closed and the peer `
      + 'has not finished shutting down.',
    );
  }
  if (n('TIME_WAIT') > 100) {
    findings.push(
      `${n('TIME_WAIT')} socket(s) in TIME_WAIT, which suggests a lot of short-lived outbound `
      + 'connections — usually a missing connection pool or keep-alive.',
    );
  }

  // The absences matter as much as the counts, and the raw table cannot say
  // "nothing is here" in a way a model will notice.
  if (rows.length === 0) {
    findings.push(
      'No sockets at all. Either the container has no tools to list them and the collection '
      + 'returned nothing usable, or the process is not running.',
    );
  } else if (n('ESTABLISHED') === 0) {
    findings.push(
      listening.length > 0
        ? `No established connections. This pod is listening on ${listening.join(', ')} but has `
          + 'nothing connected in either direction — it is not serving traffic and is not '
          + 'talking to any dependency. For a pod that is meant to be busy, that is the finding.'
        : 'No established connections and nothing listening. This process is not accepting or '
          + 'making any TCP connections.',
    );
  }

  if (peers.length > 0) {
    const top = peers.slice(0, 3).map(([p, c]) => `${p} (${c})`).join(', ');
    findings.push(`Established to ${peers.length} distinct peer(s); busiest: ${top}.`);
  }

  return { rows, byState, listening, peers, findings };
}

/**
 * The evidence pack for a connection snapshot.
 *
 * Summary first, then the table. A model that is told "0 established, 1
 * listening on 8092, nothing connected" can say something useful; one handed
 * two lines of a table cannot.
 */
export function connEvidence(text: string, maxRows = 400): string {
  const s = summariseConnections(text);
  const out: string[] = ['SUMMARY'];

  out.push(`  sockets: ${s.rows.length}`);
  if (s.byState.length) {
    out.push(`  states: ${s.byState.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  out.push(`  listening on: ${s.listening.length ? s.listening.join(', ') : 'nothing'}`);
  out.push(`  established peers: ${s.peers.length}`);

  if (s.findings.length) {
    out.push('', 'WHAT STANDS OUT');
    for (const f of s.findings) out.push(`  - ${f}`);
  }

  out.push('', 'SOCKETS');
  const shown = s.rows.slice(0, maxRows);
  if (shown.length === 0) {
    out.push('  (none)');
  } else {
    for (const r of shown) out.push(`  ${r.state.padEnd(12)} ${r.local.padEnd(24)} ${r.remote}`);
    if (s.rows.length > shown.length) {
      out.push(`  … ${s.rows.length - shown.length} more, omitted`);
    }
  }
  return out.join('\n');
}
