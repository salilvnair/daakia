/**
 * A stack-shape finding, rendered.
 *
 * The engine hands this over already structured — every frame carries a `role`
 * saying what it is doing, and a file and line where the dump had them. So this
 * is a pure view: no parsing, no inference, and nothing sent to a model to turn
 * text into shape.
 *
 * That last part is deliberate. It is tempting to ask a model to read a stack
 * trace and return JSON, and it would mostly work — but "mostly" means a frame
 * that was not in the dump appears in the UI, which is the one failure a
 * diagnostic tool cannot have. The roles come from `thread-shapes.ts`, which is
 * a list of regexes with 23 tests behind it.
 *
 * What the model IS for sits at the top of the card: explaining the finding,
 * and answering what a term means. See the sparkle.
 */
import { FindingCardView } from '@salilvnair/dui';
import { SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useDk8sAiStore } from '../../store/dk8s-ai-store';

const AI_ACCENT = 'var(--color-protocol-ai)';

export type FrameRole = 'tx-open' | 'blocking-io' | 'db-call' | 'lock-wait' | 'app' | 'plain';

export interface AnnotatedFrame {
  raw: string;
  method: string;
  file?: string;
  line?: number;
  role: FrameRole;
}

export interface ShapeFinding {
  ruleId: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  remediation: string;
  threads: { name: string; state: string; frames: AnnotatedFrame[] }[];
}

/*
  A colour per role, and only where the role means something.

  `app` and `plain` get no chip at all. A badge on every line is a badge on
  nothing — the point of these is that three frames out of seven are why the
  finding fired, and the eye should land on those three.
*/
const ROLE: Partial<Record<FrameRole, { label: string; color: string }>> = {
  'blocking-io': { label: 'blocking i/o', color: 'var(--color-error)' },
  'tx-open': { label: 'tx open', color: 'var(--color-dk8s)' },
  'db-call': { label: 'db call', color: 'var(--color-warning)' },
  'lock-wait': { label: 'lock wait', color: 'var(--color-warning)' },
};

function Chip({ label, color, onClick, title }: {
  label: string; color: string; onClick?: () => void; title?: string;
}) {
  return (
    <span
      onClick={onClick}
      title={title}
      className="shrink-0 px-1.5 rounded"
      style={{
        fontSize: 8.5,
        fontWeight: 700,
        letterSpacing: '.05em',
        textTransform: 'uppercase',
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

/**
 * One stack, indented the way a JVM prints it.
 *
 * Innermost first and stepping right, because that is the order in the file
 * and re-ordering it would make the trace unrecognisable next to the raw dump
 * sitting in the next tab.
 */
function Stack({ frames }: { frames: AnnotatedFrame[] }) {
  return (
    <div
      className="rounded-lg px-3 py-2.5 font-mono overflow-x-auto"
      style={{
        background: 'var(--color-surface-hover)',
        border: '1px solid var(--color-surface-border)',
        fontSize: 10.5,
        lineHeight: 1.75,
      }}
    >
      {frames.map((f, i) => {
        const role = ROLE[f.role];
        const isApp = f.role === 'app';
        return (
          <div key={i} className="flex items-center gap-2 whitespace-nowrap"
               style={{ paddingLeft: Math.min(i, 8) * 11 }}>
            <span style={{ color: isApp ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
              <span style={{ opacity: 0.6 }}>at </span>{f.method}
            </span>
            {role && <Chip label={role.label} color={role.color} />}
            {/* A file and a line is a place in the editor, so it opens one. */}
            {f.file && f.line !== undefined && (
              <Chip
                label={`${f.file}:${f.line}`}
                color="var(--color-success)"
                title={`Open ${f.file} at line ${f.line}`}
                onClick={() => postMsg({
                  type: 'heap:openSource',
                  className: f.method.replace(/\.[^.]+$/, ''),
                  line: f.line,
                })}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function StackShapeView({ finding }: { finding: ShapeFinding }) {
  const ask = useDk8sAiStore(s => s.ask);

  /*
    The whole finding, as evidence.

    Including the remediation the rule already wrote: the model should build on
    what the engine concluded rather than re-derive it from the stack and
    possibly land somewhere else.
  */
  const explain = () => {
    const t = finding.threads[0];
    ask({
      promptKey: 'dk8s.threads.explainOne',
      title: finding.title,
      evidence: [
        `finding: ${finding.title} (${finding.severity})`,
        `detail: ${finding.detail}`,
        `suggested fix: ${finding.remediation}`,
        '',
        `thread: ${t?.name ?? '(none)'}${t ? ` — ${t.state}` : ''}`,
        ...(t?.frames ?? []).map(fr =>
          `  at ${fr.method}${fr.file && fr.line !== undefined ? ` (${fr.file}:${fr.line})` : ''}`
          + (ROLE[fr.role] ? `   [${ROLE[fr.role]!.label}]` : '')),
      ].join('\n'),
      evidenceLabel: 'STACK FINDING',
      podContext: {},
    });
  };

  return (
    <FindingCardView
      severity={finding.severity}
      title={finding.title}
      meta={finding.ruleId}
      detail={finding.detail}
      remediation={finding.remediation}
      actions={
        <button
          type="button" onClick={explain}
          className="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer"
          style={{
            fontSize: 10.5, fontWeight: 600, color: AI_ACCENT,
            background: `color-mix(in srgb, ${AI_ACCENT} 14%, transparent)`,
            border: `1px solid color-mix(in srgb, ${AI_ACCENT} 38%, transparent)`,
          }}
        >
          <SparkleIcon size={10} color={AI_ACCENT} /> Ask AI
        </button>
      }
    >
      {finding.threads[0] && <Stack frames={finding.threads[0].frames} />}

      {finding.threads.length > 1 && (
        <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {finding.threads.length - 1} other thread
          {finding.threads.length === 2 ? '' : 's'} in the same shape
          {' — '}
          {finding.threads.slice(1, 4).map(t => t.name).join(', ')}
          {finding.threads.length > 4 ? '…' : ''}
        </span>
      )}
    </FindingCardView>
  );
}
