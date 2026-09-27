/**
 * The one line on screen a page is about: "the line you clicked", "you came
 * from here".
 *
 * ── What the boards draw ──
 *
 * A search result's clicked line is not tinted like a warning — it is lifted
 * out of the log into a bordered teal card, and what the line names is laid
 * out under it as a key/value grid: `requestDataId 8842`, `downstream …`, in
 * the editor's variable and string colours, so the reader sees what Follow
 * will be offered before looking at the rail. Follow's "you came from here"
 * is the same card, a size smaller and without the grid: on that screen the
 * line is a landmark, not the subject.
 *
 * ── Why its own file ──
 *
 * The row is `LogViewer`'s, and that component is everybody's. It asks this
 * file two things — what the row looks like around the card, and the card —
 * so the log view carries one branch for a selected line rather than the
 * card's whole drawing.
 *
 * ── Why padding, not margin ──
 *
 * The virtualiser measures each row with `offsetHeight`, which does not count
 * margin. A card inset by margin would be measured four pixels short and every
 * row below it would sit four pixels too high. So the row keeps the inset as
 * padding and the card is drawn inside it.
 */
import { useMemo } from 'react';
import type { LogLine } from '../../store/k8s-store';
import { fieldsOf } from './line-fields';
import { readFields, type FieldReader } from './field-readers';
import { numberOf, isMeasure } from './follow';
import { FOLLOW, FIELD_KEY, FIELD_VALUE, FIELD_NUMBER, tint } from './follow-tone';

export type LineCardKind = 'clicked' | 'from';

/**
 * The row around a card: no level tint, no level edge — the card is the
 * marking — and the card's inset as padding the virtualiser can measure.
 */
export function cardRowStyle(kind: LineCardKind): React.CSSProperties {
  return kind === 'clicked'
    ? { background: 'transparent', borderLeft: 'none', padding: '4px 8px 4px 0' }
    : { background: 'transparent', borderLeft: 'none', padding: '3px 8px 3px 0' };
}

/** The card itself; with no `kind`, the row's content untouched. */
export function LineCard({ kind, line, readers, children }: {
  kind?: LineCardKind;
  line: LogLine;
  readers: FieldReader[];
  children: React.ReactNode;
}) {
  if (!kind) return <>{children}</>;
  return (
    <div style={{
      border: `1px solid ${FOLLOW}`,
      borderRadius: kind === 'clicked' ? 8 : 7,
      background: tint(FOLLOW, kind === 'clicked' ? 6 : 7),
      /* The row's text starts 8px in from the list's edge (a 2px level edge
         and 6px of padding). The card's 1px border and 7px pad land it on
         the same column, so the clicked line does not jump sideways. */
      padding: kind === 'clicked' ? '5px 10px 0 7px' : '4px 6px 4px 7px',
    }}>
      {children}
      {kind === 'clicked' && <FieldGrid line={line} readers={readers} />}
    </div>
  );
}

/**
 * What the clicked line names, two columns under it.
 *
 * The line's own keys first — the MDC, the pattern's holes, the payload — then
 * what the layout pattern read (the thread), which is on every line and so is
 * the least news. The logger is left out for the reason the rail leaves it
 * out: following "everything this class wrote" is a filter, not a thread.
 */
function FieldGrid({ line, readers }: { line: LogLine; readers: FieldReader[] }) {
  const fields = useMemo(() => {
    const all = fieldsOf(line, { read: readFields(line, readers) }).filter(f => f.key !== 'logger');
    return [...all.filter(f => f.origin !== 'format'), ...all.filter(f => f.origin === 'format')];
  }, [line, readers]);
  if (!fields.length) return <div style={{ height: 5 }} />;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '150px 1fr', gap: '2px 14px',
      padding: '4px 0 9px 82px', fontSize: 11.5, lineHeight: '17px', whiteSpace: 'normal',
    }}>
      {fields.map(f => {
        const numeric = numberOf(f.value) !== undefined && f.origin !== 'format' && isMeasure(f.key, f.value);
        return (
          <span key={f.key} style={{ display: 'contents' }}>
            <span className="truncate" style={{ color: FIELD_KEY }} title={f.key}>{f.key}</span>
            <span style={{ color: numeric ? FIELD_NUMBER : FIELD_VALUE, wordBreak: 'break-all' }}>
              {f.secret ? '••••••' : f.value}
            </span>
          </span>
        );
      })}
    </div>
  );
}
