import { describe, it, expect } from 'vitest';
import { parseConnSnapshot, summariseConnections, connEvidence } from './conn-summary';

// The exact snapshot from the pod that prompted this: one listening socket and
// nothing else. This is the case the old evidence pack could say nothing about.
const QUIET = `state        local                 remote
LISTEN       0.0.0.0:8092          0.0.0.0:0`;

const SS = `State      Recv-Q Send-Q Local Address:Port  Peer Address:Port
LISTEN     0      128    0.0.0.0:8080        0.0.0.0:*
ESTAB      0      0      10.244.2.20:8080    10.244.1.7:51988
ESTAB      0      0      10.244.2.20:8080    10.244.1.7:51996
ESTAB      0      0      10.244.2.20:44112   10.96.0.10:5432
CLOSE-WAIT 1      0      10.244.2.20:44120   10.96.0.10:5432
SYN-SENT   0      1      10.244.2.20:52002   10.96.9.9:9200`;

describe('parseConnSnapshot', () => {
  it('reads our decoded /proc/net/tcp table', () => {
    expect(parseConnSnapshot(QUIET)).toEqual([
      { state: 'LISTEN', local: '0.0.0.0:8092', remote: '0.0.0.0:0' },
    ]);
  });

  it('reads ss output, skipping its header and queue columns', () => {
    const rows = parseConnSnapshot(SS);
    expect(rows).toHaveLength(6);
    // ESTAB is normalised so both sources spell it the same way.
    expect(rows[1]).toEqual({
      state: 'ESTABLISHED', local: '10.244.2.20:8080', remote: '10.244.1.7:51988',
    });
    expect(rows[3].remote).toBe('10.96.0.10:5432');
  });

  it('ignores blank input and junk lines', () => {
    expect(parseConnSnapshot('')).toEqual([]);
    expect(parseConnSnapshot('total 0\nsome error text')).toEqual([]);
  });
});

describe('summariseConnections', () => {
  it('names the absence, which is the finding for a quiet pod', () => {
    const s = summariseConnections(QUIET);
    expect(s.listening).toEqual(['8092']);
    expect(s.peers).toEqual([]);
    expect(s.findings.join(' ')).toMatch(/No established connections/);
    expect(s.findings.join(' ')).toMatch(/8092/);
  });

  it('counts states and groups peers', () => {
    const s = summariseConnections(SS);
    expect(Object.fromEntries(s.byState)).toMatchObject({
      ESTABLISHED: 3, LISTEN: 1, 'CLOSE-WAIT': 1, 'SYN-SENT': 1,
    });
    // Two sockets to the same peer collapse into one entry with a count.
    expect(s.peers[0]).toEqual(['10.244.1.7:51988', 1]);
    expect(s.peers).toHaveLength(3);
  });

  it('calls out CLOSE_WAIT as an application bug, not a network one', () => {
    const s = summariseConnections(`state local remote
CLOSE_WAIT 10.0.0.1:80 10.0.0.2:5432
CLOSE_WAIT 10.0.0.1:80 10.0.0.3:5432`);
    const text = s.findings.join(' ');
    expect(text).toMatch(/CLOSE_WAIT/);
    expect(text).toMatch(/file descriptor/);
  });

  it('calls out SYN_SENT as unreachable rather than slow', () => {
    const s = summariseConnections(`state local remote
SYN_SENT 10.0.0.1:5000 10.9.9.9:9200`);
    expect(s.findings.join(' ')).toMatch(/no answer/);
  });

  it('flags a TIME_WAIT pile-up only when it is actually a pile', () => {
    const few = Array.from({ length: 20 }, (_, i) => `TIME_WAIT 10.0.0.1:${i} 10.0.0.2:80`).join('\n');
    expect(summariseConnections(few).findings.join(' ')).not.toMatch(/TIME_WAIT/);
    const many = Array.from({ length: 150 }, (_, i) => `TIME_WAIT 10.0.0.1:${i} 10.0.0.2:80`).join('\n');
    expect(summariseConnections(many).findings.join(' ')).toMatch(/connection pool/);
  });

  it('says so when there is nothing at all', () => {
    expect(summariseConnections('').findings.join(' ')).toMatch(/No sockets at all/);
  });
});

describe('connEvidence', () => {
  it('leads with the summary, so the model sees the shape before the rows', () => {
    const out = connEvidence(QUIET);
    expect(out.indexOf('SUMMARY')).toBeLessThan(out.indexOf('SOCKETS'));
    expect(out).toMatch(/listening on: 8092/);
    expect(out).toMatch(/established peers: 0/);
    // The pack for a two-line snapshot now carries something to reason about.
    expect(out.split('\n').length).toBeGreaterThan(8);
  });

  it('caps the table but says how much it dropped', () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      `ESTABLISHED 10.0.0.1:${i} 10.0.0.2:80`).join('\n');
    const out = connEvidence(many, 100);
    expect(out).toMatch(/400 more, omitted/);
  });
});
