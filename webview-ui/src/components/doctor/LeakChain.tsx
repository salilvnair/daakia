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

export function LeakChain({ suspect }: { suspect: Suspect }) {
  const acc = suspect.accumulates;
  const held = suspect.heldIn;
  const average = acc && acc.count > 0 ? suspect.retainedBytes / acc.count : 0;

  return (
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

      <Step color="var(--color-protocol-ai)" label="how it is reached" last>
        <span className="font-mono text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {suspect.pathToRoot.length
            ? suspect.pathToRoot
                .map(p => decodeClassName(p.className).simpleName)
                .join('  →  ')
            : 'no path recorded'}
        </span>
      </Step>
    </div>
  );
}
