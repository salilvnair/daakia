/**
 * Colour for `kubectl describe pod`.
 *
 * Not YAML, though it looks like it from a distance — describe output has its
 * own shape, and highlighting it as YAML mangles the parts that matter. The
 * Events table at the bottom is columnar, `<none>` is a value not a tag, and
 * the status words (Running, OOMKilled, BackOff) are the things your eye should
 * land on first. A YAML lexer colours none of that usefully.
 *
 * Pure and token-based so it can be tested without a DOM.
 */

export type DescribeTokenKind =
  | 'key' | 'value' | 'number' | 'duration' | 'timestamp'
  | 'good' | 'bad' | 'warn' | 'none' | 'section' | 'plain';

export interface DescribeToken {
  kind: DescribeTokenKind;
  text: string;
}

/** Words that mean the pod is fine. */
const GOOD = /^(Running|Succeeded|True|Ready|Normal|Healthy|Active|Bound|Completed|Pulled|Created|Started|Scheduled)$/;
/** Words that mean it is not. */
const BAD = /^(Failed|Error|OOMKilled|CrashLoopBackOff|ImagePullBackOff|ErrImagePull|Evicted|Unhealthy|BackOff|FailedScheduling|FailedMount|Terminating|Unknown|False)$/;
const WARN = /^(Pending|Warning|Waiting|ContainerCreating|PodInitializing|NotReady|Terminated)$/;

/** `2m30s`, `10h`, `4d`, `1h20m`. */
const DURATION = /^\d+(\.\d+)?(ns|us|ms|s|m|h|d)([0-9]+[a-z]+)*$/;
/** `Mon, 02 Jan 2026 03:04:05 +0000` and ISO-ish stamps. */
const TIMESTAMP = /^\w{3},\s\d{2}\s\w{3}\s\d{4}|^\d{4}-\d{2}-\d{2}T/;

function classifyValue(v: string): DescribeTokenKind {
  const t = v.trim();
  if (!t) return 'plain';
  if (t === '<none>' || t === '<unset>' || t === '<nil>') return 'none';
  if (GOOD.test(t)) return 'good';
  if (BAD.test(t)) return 'bad';
  if (WARN.test(t)) return 'warn';
  if (TIMESTAMP.test(t)) return 'timestamp';
  if (DURATION.test(t)) return 'duration';
  // Quantities and plain numbers: 512Mi, 100m, 8, 0/1.
  if (/^\d+(\.\d+)?([EPTGMK]i?|m)?$/.test(t) || /^\d+\/\d+$/.test(t)) return 'number';
  return 'value';
}

/**
 * One line into tokens.
 *
 * `Key:` at the start of a line with nothing after it heads a section
 * (Events:, Conditions:, Volumes:) and is worth more weight than an ordinary
 * key — those are the landmarks people scan for.
 */
export function tokenizeDescribeLine(line: string): DescribeToken[] {
  if (!line.trim()) return [{ kind: 'plain', text: line }];

  const m = /^(\s*)([A-Za-z][\w .\/-]*?):(\s*)(.*)$/.exec(line);
  if (!m) {
    // A continuation or an Events-table row. Colour any status word in it so
    // "Warning  BackOff  ..." still reads at a glance.
    return line.split(/(\s+)/).map(part => ({
      kind: /^\s+$/.test(part) ? 'plain' : classifyValue(part),
      text: part,
    }));
  }

  const [, indent, key, gap, rest] = m;
  const out: DescribeToken[] = [];
  if (indent) out.push({ kind: 'plain', text: indent });
  out.push({ kind: rest.trim() === '' && !indent ? 'section' : 'key', text: key + ':' });
  if (gap) out.push({ kind: 'plain', text: gap });
  if (rest) out.push({ kind: classifyValue(rest), text: rest });
  return out;
}

export function tokenColor(kind: DescribeTokenKind): string {
  switch (kind) {
    case 'section':   return 'var(--color-dk8s)';
    case 'key':       return 'var(--color-text-secondary)';
    case 'good':      return 'var(--color-success)';
    case 'bad':       return 'var(--color-error)';
    case 'warn':      return 'var(--color-warning)';
    case 'none':      return 'var(--color-text-muted)';
    case 'number':    return 'var(--color-info, #6aa9ff)';
    case 'duration':  return 'var(--color-info, #6aa9ff)';
    case 'timestamp': return 'var(--color-text-muted)';
    default:          return 'var(--color-text-primary)';
  }
}

export function tokenWeight(kind: DescribeTokenKind): number {
  return kind === 'section' ? 700 : kind === 'bad' || kind === 'good' ? 600 : 400;
}
