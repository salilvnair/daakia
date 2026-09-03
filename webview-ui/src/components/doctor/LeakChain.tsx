/**
 * A leak suspect as a chain of four answers.
 *
 * The suspect list gives you a class and a percentage, which is a fact without
 * a destination. These are the questions someone actually has, in the order
 * they have them: what is piling up, what is holding it, where does that live
 * in my code, and — rendered by the card above this — what do I change.
 *
 * Every row here is a number the engine computed. The one that is not is the
 * source file, and that comes from resolving the class against the open
 * workspace rather than from the dump.
 */
import { ClassNameView } from './ClassNameView';
import { ClassSourceLink } from './ClassSourceLink';
import { decodeClassName } from './class-name';

export interface Suspect {
  className: string;
  retainedBytes: number;
  retainedPercent: number;
  retainedObjects: number;
  accumulates?: { className: string; count: number };
  heldIn?: { className: string; retainedBytes: number };
  pathToRoot: { className: string; retainedBytes: number }[];
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** One rung: a dot, a rule of connecting line, a label and its answer. */
function Step({ color, label, children, last }: {
  color: string; label: string; children: React.ReactNode; last?: boolean;
}) {
  return (
    <>
      <div className="flex flex-col items-center" style={{ gridColumn: 1 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: color,
          marginTop: 5, flexShrink: 0,
        }} />
        {/* The line stops at the last rung — running it past the final dot
            implies a step that is not there. */}
        {!last && <span style={{ flex: 1, width: 1, background: 'var(--color-surface-border)' }} />}
      </div>
      <div style={{ paddingBottom: last ? 0 : 11, minWidth: 0 }}>
        <div className="text-[9px] uppercase tracking-wider"
             style={{ color: 'var(--color-text-muted)' }}>
          {label}
        </div>
        <div className="text-[11.5px] flex items-center gap-1.5 flex-wrap"
             style={{ color: 'var(--color-text-primary)' }}>
          {children}
        </div>
      </div>
    </>
  );
}

export function LeakChain({ suspect, remediation, onShowDiff }: {
  suspect: Suspect;
  /** What to change. The card above renders it as prose; here it is a step. */
  remediation?: string;
  onShowDiff?: () => void;
}) {
  const acc = suspect.accumulates;
  const held = suspect.heldIn;
  const average = acc && acc.count > 0 ? suspect.retainedBytes / acc.count : 0;
  const container = decodeClassName(held?.className ?? suspect.className).simpleName;

  return (
    <>
    {/*
      The statement, before the evidence.

      The rule's own detail is a sentence of numbers — "retains 190.0 MB (98.0%
      of live heap) across 958 objects" — which is precise and takes a moment
      to parse. This is the same fact as a claim, so the reader knows what they
      are looking at before they start reading rows.
    */}
    <div className="text-[14px] font-semibold mb-0.5"
         style={{ color: 'var(--color-text-primary)' }}>
      An unbounded <span style={{ color: 'var(--color-dk8s)' }}>{container}</span>{' '}
      holds {suspect.retainedPercent.toFixed(0)}% of the heap
    </div>
    <div className="text-[11.5px] mb-3" style={{ color: 'var(--color-text-secondary)' }}>
      {bytes(suspect.retainedBytes)} across {suspect.retainedObjects.toLocaleString()} objects
      {acc && <>, accumulating {acc.count.toLocaleString()} × {decodeClassName(acc.className).simpleName} and never released</>}.
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: '0 11px' }}>
      {acc && (
        <Step color="var(--color-error)" label="what is accumulating">
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {acc.count.toLocaleString()} ×
          </span>
          <ClassNameView name={acc.className} />
          <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
            — {bytes(suspect.retainedBytes)}, average {bytes(average)} each
          </span>
        </Step>
      )}

      {held && (
        <Step color="var(--color-warning)" label="what is holding it">
          <ClassNameView name={held.className} />
          <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
            ({bytes(held.retainedBytes)})
          </span>
        </Step>
      )}

      {/*
        The only row that leaves the dump.

        ClassSourceLink resolves the class against the workspace and quietly
        renders plain text when it is a JDK type or not open — so a finding
        about `java.util.ArrayList` does not offer to open a file that was never
        going to be there.
      */}
      <Step color="var(--color-success)" label="where it lives in your code">
        <ClassSourceLink className={suspect.className} />
      </Step>

      <Step color="var(--color-dk8s)" label="how it is reached" last={!remediation}>
        <span className="font-mono text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {suspect.pathToRoot.length
            ? suspect.pathToRoot
                .map(p => decodeClassName(p.className).simpleName)
                .join('  →  ')
            : 'no path recorded'}
        </span>
      </Step>

      {/* The last question, and the only one that is an instruction. */}
      {remediation && (
        <Step color="var(--color-protocol-ai)" label="what to change" last>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] leading-relaxed"
                  style={{ color: 'var(--color-text-secondary)' }}>{remediation}</span>
            {onShowDiff && (
              <button type="button" onClick={onShowDiff} style={{
                alignSelf: 'flex-start', font: 'inherit', fontSize: 9.5, fontWeight: 700,
                letterSpacing: '.05em', padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                color: 'var(--color-protocol-ai)', border: 'none',
                background: 'color-mix(in srgb, var(--color-protocol-ai) 16%, transparent)',
              }}>✦ SHOW ME THE DIFF</button>
            )}
          </div>
        </Step>
      )}
    </div>
    </>
  );
}
