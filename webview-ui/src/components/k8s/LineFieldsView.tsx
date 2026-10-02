/**
 * What this line names, and what you can do with it.
 *
 * The question after finding a line is always the same: what else was going on
 * with this thread, this request, this order. So the values on the line are
 * offered as things to follow rather than as text to re-type — and each one
 * says where it came from, because "the format parsed this thread" and "a
 * pattern I pasted says this is an order id" are different degrees of
 * certainty and the reader should not have to guess which they have.
 *
 * ── Follow, and what it can honestly promise ──
 *
 * A field the format or the MDC named can be filtered EXACTLY: the host parsed
 * it into a slot, so `thread = http-nio-8080-exec-7` is a fact about the line.
 * A pattern's hole and a payload's leaf are not fields on the line at all —
 * the only test available is whether other lines mention the value. Both are
 * useful; only one is exact, and the buttons say which is which rather than
 * quietly doing a substring search behind a word like "filter".
 */
import { useMemo, useState } from 'react';
import { useLogSource } from './log-source';
import { useDk8sSearchStore } from '../../store/dk8s-search-store';
import { fieldsOf, countHere, isExact, ORIGIN_LABEL, type LineField } from './line-fields';
import { readFields } from './field-readers';
import { useFieldReaders } from './follow-prefs';
import { HIDDEN } from './log-payload';
import type { LogPayload } from './log-payload';
import type { MarkHit } from './logger-marks';
import type { LogLine } from '../../store/k8s-store';
import { SearchIcon } from '../../icons';
import { copyText } from '../../utils/clipboard';
import { ACCENT } from './tone';
import { useCopyTick, CopyGlyph } from '../shared/CopyTick';

export function LineFieldsView({ line, payload, mark, indent = 92 }: {
  line: LogLine;
  payload?: LogPayload;
  mark?: MarkHit;
  /** How far in the box sits: under the message on a Logs row, less on a narrower card. */
  indent?: number;
}) {
  const { logs, addFieldFilter } = useLogSource();
  const searchEverywhere = useDk8sSearchStore(s => s.searchEverywhere);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  /* Every catalogued pattern and every field named in Settings, not only the marked ones. */
  const readers = useFieldReaders();

  /* The line's own keys. Thread and logger are in the rail beside the log for every line;
     repeating them here made every row look like it had something to show. */
  const fields = useMemo(() => fieldsOf(line, { payload, mark, read: readFields(line, readers) })
    .filter(f => f.origin !== 'format'), [line, payload, mark, readers]);
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of fields) out[f.key] = countHere(logs, f);
    return out;
  }, [fields, logs]);

  if (!fields.length) {
    return (
      <div className="my-1 px-2.5 py-2 rounded-md text-[11px]"
           style={{
             marginLeft: indent,
             border: '1px solid var(--color-surface-border)',
             background: 'var(--color-elevated, var(--color-panel))',
             color: 'var(--color-text-muted)',
           }}>
        This line names nothing that can be followed. A log format on this pod would give it a thread and
        a logger; a pattern in the Loggers tab would name the values inside the message.
      </div>
    );
  }

  return (
    <div className="my-1 rounded-md overflow-hidden"
         style={{
           marginLeft: indent,
           border: '1px solid var(--color-surface-border)',
           borderLeft: `2px solid ${ACCENT}`,
           background: 'var(--color-elevated, var(--color-panel))',
         }}>
      <div className="px-2.5 py-1 text-[10px] uppercase tracking-wide"
           style={{ borderBottom: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
        fields in this line
      </div>

      <div className="flex flex-col">
        {fields.map(field => (
          <FieldRow
            key={field.key}
            field={field}
            count={counts[field.key] ?? 0}
            revealed={revealed.has(field.key)}
            onReveal={() => setRevealed(prev => new Set(prev).add(field.key))}
            /* `include`: Follow means "only these", which is the question —
               "what else happened on this thread" — rather than "everything
               except". Exclude is already on the field strip's own menu. */
            onFollow={() => addFieldFilter({ field: field.key, value: field.value, mode: 'include' })}
            onSearchEverywhere={() => searchEverywhere(field.value)}
          />
        ))}
      </div>
    </div>
  );
}

function FieldRow({ field, count, revealed, onReveal, onFollow, onSearchEverywhere }: {
  field: LineField;
  count: number;
  revealed: boolean;
  onReveal: () => void;
  onFollow: () => void;
  onSearchEverywhere: () => void;
}) {
  const { copied, flash } = useCopyTick();
  const exact = isExact(field);
  const hidden = field.secret && !revealed;

  const copy = async () => {
    if (await copyText(field.value)) {
      flash();
    }
  };

  return (
    /* One step in from the "fields in this line" label above — the tree's step. */
    <div className="flex items-center gap-2 pl-6 pr-2.5 py-1.5"
         style={{ borderTop: '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)' }}>
      <span className="text-[11px] font-mono shrink-0" style={{ color: 'var(--color-info, #9cdcfe)', width: 132 }}>
        {field.key}
      </span>

      <span className="text-[11px] font-mono truncate flex-1 min-w-0"
            title={hidden ? undefined : field.value}
            style={{ color: 'var(--color-text-primary)' }}>
        {hidden ? HIDDEN : field.value}
      </span>

      {hidden && (
        <button type="button" onClick={onReveal}
                className="px-1.5 rounded cursor-pointer border-none text-[10px] shrink-0"
                style={{
                  background: 'color-mix(in srgb, var(--color-warning) 16%, transparent)',
                  color: 'var(--color-warning)', lineHeight: '17px',
                }}>
          show
        </button>
      )}

      <span className="text-[10px] shrink-0" style={{ color: 'var(--color-text-muted)' }}
            title={exact
              ? `${count} lines in this buffer have ${field.key} = ${field.value}`
              : `${count} lines in this buffer mention it — ${field.key} is not a field the format parsed`}>
        {count} {exact ? 'lines' : 'mention it'}
      </span>

      <span className="text-[10px] shrink-0" style={{ color: 'var(--color-text-muted)', opacity: 0.8 }}
            title={`Read from ${ORIGIN_LABEL[field.origin]}`}>
        {field.origin}
      </span>

      <button type="button" onClick={onFollow} disabled={!exact}
              title={exact
                ? `Show only the lines where ${field.key} is this`
                : `${field.key} is not a field the format parsed, so it cannot be filtered exactly — search for the value instead`}
              className="px-2 rounded cursor-pointer border-none text-[10.5px] shrink-0"
              style={{
                background: exact ? `color-mix(in srgb, ${ACCENT} 16%, transparent)` : 'transparent',
                color: exact ? ACCENT : 'var(--color-text-muted)',
                opacity: exact ? 1 : 0.45,
                lineHeight: '19px',
              }}>
        Follow
      </button>

      <button type="button" onClick={onSearchEverywhere}
              title="Search every pod in this namespace for this value"
              aria-label="Search every pod for this value"
              className="w-[22px] h-[19px] flex items-center justify-center rounded cursor-pointer border-none bg-transparent shrink-0"
              style={{ color: 'var(--color-text-muted)' }}>
        <SearchIcon size={11} />
      </button>

      <button type="button" onClick={copy}
              title={copied ? 'Copied' : 'Copy the value'} aria-label="Copy the value"
              className="w-[22px] h-[19px] flex items-center justify-center rounded cursor-pointer border-none bg-transparent shrink-0"
              style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
        <CopyGlyph copied={copied} size={11} />
      </button>
    </div>
  );
}
