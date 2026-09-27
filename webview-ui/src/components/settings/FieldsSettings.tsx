/**
 * Settings → DK8S → Fields: how a line becomes fields.
 *
 * Follow can only offer what a line actually names, so this page says how it
 * names things — four readers, in the order they run — and lets the reader
 * change the two decisions Follow makes on their behalf, and add the one thing
 * no reader could have known.
 *
 *   - Correlate by: which field Follow takes when a whole line is followed.
 *     traceId, then your own request id, then the thread — the thread last,
 *     because a pod reuses a thread name all day.
 *   - Ask first above N lines: a value on most of the log is a filter, not a
 *     thread, and following it should be a decision.
 *   - A field the readers did not find: a logger call, a regex, or a value
 *     picked out of a real line. Tested against lines already on hand before it
 *     is saved, and saved with the workspace, the way collections are shared.
 */
import { useMemo, useRef, useState } from 'react';
import { ButtonView, CheckboxView, SegmentedControlView, SelectInputView, TextInputView, IconSize } from '@salilvnair/dui';
import { CloseIcon, PlusIcon } from '../../icons';
import { useUiStateStore } from '../../store/ui-state-store';
import { useK8sStore } from '../../store/k8s-store';
import { useResultTabStore } from '../../store/dk8s-result-tab-store';
import { useCatalogue } from '../../store/dk8s-logger-store';
import { resultLines } from '../k8s/search-results';
import { fieldsOf } from '../k8s/line-fields';
import {
  compileCustom, readFields, readersOf, testReader, CUSTOM_FIELDS_PREF, type CustomField, type CustomFieldKind,
} from '../k8s/field-readers';
import {
  useFollowPrefs, useCustomFields, useAllCustomFields, CORRELATE_PREF, ASK_ABOVE_PREF, ASK_ABOVE_OPTIONS,
} from '../k8s/follow-prefs';

const ACCENT = 'var(--color-dk8s)';

/** Each reader's colour, the same on the line, its chip and its card. */
const READER = {
  format: { color: 'var(--color-info)', title: 'The layout pattern' },
  mdc: { color: 'var(--color-protocol-graphql)', title: 'MDC and key=value' },
  pattern: { color: ACCENT, title: 'The logger’s own holes' },
  custom: { color: ACCENT, title: 'A field you named' },
  payload: { color: 'var(--color-warning)', title: 'Keys inside a payload' },
} as const;

const card: React.CSSProperties = {
  background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', borderRadius: 9,
};
const label: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)',
};
const mono: React.CSSProperties = { fontFamily: 'var(--font-mono, monospace)' };

/** The lines this page can test against: the open pod's log and the last search result. */
function useLinesOnHand() {
  const logs = useK8sStore(s => s.logs);
  const detail = useK8sStore(s => s.detail);
  const groups = useResultTabStore(s => s.groups);
  return useMemo(() => {
    const pod = logs.map(l => ({ ...l, pod: detail?.name }));
    const found = resultLines(groups);
    return {
      lines: [...pod, ...found],
      said: [
        pod.length ? `the open pod’s log (${pod.length.toLocaleString()} lines)` : '',
        found.length ? `the last search result (${found.length.toLocaleString()} lines)` : '',
      ].filter(Boolean).join(' and '),
    };
  }, [logs, detail, groups]);
}

/** A real line from what is on hand, underlined by the reader that read each part. */
function LineAnatomy() {
  const { lines } = useLinesOnHand();
  const catalogue = useCatalogue();
  const custom = useCustomFields();
  const readers = useMemo(() => readersOf(catalogue.patterns, custom), [catalogue, custom]);
  const line = useMemo(() => lines.find(l => l.thread && Object.keys(l.fields ?? {}).length)
    ?? lines.find(l => l.thread) ?? lines.find(l => readFields(l, readers).length), [lines, readers]);

  if (!line) {
    return (
      <div className="px-4 py-3 text-[11.5px]" style={{ ...card, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
        Open a pod&rsquo;s Logs tab, or a search result, and a line from it is taken apart here — each part underlined by
        the reader that found it.
      </div>
    );
  }

  const fields = fieldsOf(line, { read: readFields(line, readers) });
  /* Underline each field's value where it first appears, left to right, never overlapping. */
  const marks: { start: number; end: number; origin: keyof typeof READER }[] = [];
  for (const f of fields) {
    const at = line.text.indexOf(f.value);
    if (at < 0 || marks.some(m => at < m.end && at + f.value.length > m.start)) continue;
    marks.push({ start: at, end: at + f.value.length, origin: f.origin });
  }
  marks.sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  marks.forEach((m, i) => {
    if (m.start > pos) parts.push(<span key={`t${i}`} style={{ color: 'var(--color-text-secondary)' }}>{line.text.slice(pos, m.start)}</span>);
    parts.push(<span key={`m${i}`} style={{ borderBottom: `2px solid ${READER[m.origin].color}`, color: 'var(--color-text-primary)' }}>{line.text.slice(m.start, m.end)}</span>);
    pos = m.end;
  });
  if (pos < line.text.length) parts.push(<span key="tail" style={{ color: 'var(--color-text-secondary)' }}>{line.text.slice(pos)}</span>);

  const byOrigin = (Object.keys(READER) as (keyof typeof READER)[])
    .map(o => ({ o, keys: fields.filter(f => f.origin === o).map(f => f.key) }))
    .filter(x => x.keys.length);

  return (
    <div className="px-4 py-3" style={card}>
      <div className="text-[12px] break-all" style={{ ...mono, lineHeight: '22px' }}>{parts}</div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {byOrigin.map(({ o, keys }) => (
          <span key={o} className="inline-flex items-center px-2 rounded-full text-[11px]"
                style={{ height: 22, color: READER[o].color, background: `color-mix(in srgb, ${READER[o].color} 16%, transparent)` }}>
            {keys.join(' · ')}
          </span>
        ))}
      </div>
    </div>
  );
}

function CorrelateBy() {
  const { order } = useFollowPrefs();
  const setPref = useUiStateStore(s => s.setPref);
  const [dragging, setDragging] = useState<number | undefined>();
  const [adding, setAdding] = useState('');
  const save = (next: typeof order) => setPref(CORRELATE_PREF, JSON.stringify(next));

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    save(next);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {order.map((k, i) => (
        <div key={k.key}
             draggable
             onDragStart={() => setDragging(i)}
             onDragOver={e => e.preventDefault()}
             onDrop={() => { if (dragging !== undefined) move(dragging, i); setDragging(undefined); }}
             onDragEnd={() => setDragging(undefined)}
             className="flex items-center gap-2.5 px-2.5 rounded-md"
             style={{
               height: 36, cursor: 'grab',
               border: `1px solid ${k.key === 'thread' ? ACCENT : 'var(--color-surface-border)'}`,
               background: dragging === i ? 'var(--color-surface-hover)' : 'var(--color-panel)',
             }}
             title="Drag to reorder">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 8h16M4 16h16" /></svg>
          <span className="text-[11.5px]" style={{ ...mono, width: 110, color: 'var(--color-info, #9cdcfe)' }}>{k.key}</span>
          <span className="flex-1 text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{k.note}</span>
          <CheckboxView checked={k.on} size="sm" accentColor={ACCENT} aria-label={`Use ${k.key}`}
                        onChange={v => save(order.map(x => (x.key === k.key ? { ...x, on: v } : x)))} />
          {order.length > 1 && (
            <ButtonView size="xs" variant="ghost" aria-label={`Remove ${k.key}`} title={`Remove ${k.key}`}
                        iconLeft={<CloseIcon size={IconSize.chip} />}
                        onClick={() => save(order.filter(x => x.key !== k.key))} />
          )}
        </div>
      ))}
      <div className="flex items-center gap-1.5 mt-1">
        <TextInputView value={adding} placeholder="another field — orderId, tenant" size="sm"
                       onChange={e => setAdding(e.target.value)} />
        <ButtonView size="sm" variant="secondary" accentColor={ACCENT} iconLeft={<PlusIcon size={IconSize.chip} />}
                    disabled={!adding.trim() || order.some(k => k.key === adding.trim())}
                    onClick={() => {
                      /* A new key goes above the thread: anything you name is a better thread than a pool thread's name. */
                      const at = order.findIndex(k => k.key === 'thread');
                      const next = [...order];
                      next.splice(at < 0 ? next.length : at, 0, { key: adding.trim(), on: true, note: 'a field you added' });
                      save(next);
                      setAdding('');
                    }}>
          Add
        </ButtonView>
      </div>
    </div>
  );
}

function NewField() {
  const custom = useCustomFields();
  const setPref = useUiStateStore(s => s.setPref);
  const { lines, said } = useLinesOnHand();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CustomFieldKind>('call');
  const [source, setSource] = useState('');
  const [pick, setPick] = useState('');
  const sampleRef = useRef<HTMLDivElement>(null);

  const compiled = useMemo(() => (source.trim()
    ? compileCustom({ id: 'draft', name, kind, source, pick })
    : undefined), [name, kind, source, pick]);
  const test = useMemo(() => (compiled?.reader ? testReader(compiled.reader, lines) : undefined), [compiled, lines]);

  const add = () => {
    const f: CustomField = { id: `cf-${Date.now()}`, name: name.trim() || test?.fields[0] || 'value', kind, source, pick: kind === 'line' ? pick : undefined, added: Date.now() };
    setPref(CUSTOM_FIELDS_PREF, JSON.stringify([...custom, f]));
    setName(''); setSource(''); setPick('');
  };

  /* "Pick it in a line": whatever is selected in the pasted line is the value. */
  const takeSelection = () => {
    const sel = window.getSelection()?.toString() ?? '';
    if (sel && sampleRef.current?.contains(window.getSelection()?.anchorNode ?? null)) setPick(sel);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Call it</span>
        <TextInputView value={name} placeholder="batchId" size="md" onChange={e => setName(e.target.value)} />
      </div>
      <SegmentedControlView
        size="md" variant="rounded" borderRadius="sm" style={{ borderRadius: 4 }} accentColor={ACCENT}
        value={kind} onChange={v => { setKind(v as CustomFieldKind); setPick(''); }}
        options={[
          { value: 'call', label: 'Paste the logger call' },
          { value: 'regex', label: 'Write a regex' },
          { value: 'line', label: 'Pick it in a line' },
        ]}
      />
      <textarea
        value={source}
        onChange={e => setSource(e.target.value)}
        spellCheck={false}
        rows={kind === 'regex' ? 1 : 2}
        placeholder={kind === 'call'
          ? 'log.info("settling batch {} for merchant {}", batchId, merchantId);'
          : kind === 'regex' ? 'settling batch (?<batchId>\\S+)' : 'Paste a line that carries the value'}
        className="text-[11.5px] px-2.5 py-2 rounded-md w-full resize-y"
        style={{ ...mono, background: 'var(--color-panel)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)', outlineColor: ACCENT }}
      />
      {kind === 'line' && source && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Select the value in the line</span>
          <div ref={sampleRef} onMouseUp={takeSelection}
               className="px-2.5 py-2 rounded-md text-[11.5px] break-all select-text"
               style={{ ...mono, background: 'var(--color-panel)', border: `1px dashed ${ACCENT}`, color: 'var(--color-text-primary)', cursor: 'text' }}>
            {source}
          </div>
          {pick && <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>value: <span style={{ ...mono, color: ACCENT }}>{pick}</span></span>}
        </div>
      )}

      <div className="mt-1" style={label}>tested against what is on the pods now</div>
      {!source.trim() ? (
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {said ? `It will be tried against ${said}.` : 'Open a pod’s Logs tab or a search result to test it against real lines.'}
        </span>
      ) : compiled?.problem ? (
        <span className="text-[11.5px]" style={{ color: 'var(--color-error)' }}>{compiled.problem}</span>
      ) : test && (
        <>
          <div className="flex flex-col gap-1">
            {test.examples.map((ex, i) => (
              <div key={i} className="px-2.5 py-1.5 rounded-md text-[11px] truncate" style={{ ...mono, background: 'var(--color-panel)', color: 'var(--color-text-muted)' }}>
                {highlight(ex.text, Object.values(ex.values))}
              </div>
            ))}
          </div>
          <span className="text-[11.5px]" style={{ color: test.lines ? 'var(--color-success)' : 'var(--color-warning)' }}>
            {test.lines
              ? `Matches ${test.lines.toLocaleString()} line${test.lines === 1 ? '' : 's'}${test.pods ? ` on ${test.pods} pod${test.pods === 1 ? '' : 's'}` : ''} · ${test.fields.length} field${test.fields.length === 1 ? '' : 's'} (${test.fields.join(', ')})`
              : `Nothing in ${said || 'the lines on hand'} matches it — either it has not run, or the text differs from the build in these pods.`}
          </span>
        </>
      )}

      <div className="flex items-center gap-2 pt-1">
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Saved with the workspace, shared the way collections are.</span>
        <div className="flex-1" />
        <ButtonView size="md" variant="secondary" accentColor={ACCENT} color={ACCENT}
                    disabled={!source.trim() || !!compiled?.problem || (kind === 'line' && !pick)}
                    onClick={add}>
          Add the field
        </ButtonView>
      </div>
    </div>
  );
}

function highlight(text: string, values: string[]): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  for (const v of values) {
    const at = rest.indexOf(v);
    if (at < 0) continue;
    parts.push(<span key={key++}>{rest.slice(0, at)}</span>);
    parts.push(<span key={key++} style={{ color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 18%, transparent)`, borderRadius: 3, padding: '0 3px' }}>{v}</span>);
    rest = rest.slice(at + v.length);
  }
  parts.push(<span key={key++}>{rest}</span>);
  return parts;
}

function SavedFields() {
  const { mine: custom, team } = useAllCustomFields();
  const setPref = useUiStateStore(s => s.setPref);
  const { lines } = useLinesOnHand();
  if (!custom.length && !team.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {custom.length > 0 && <div style={label}>fields you named</div>}
      {[...custom, ...team].map((f, i) => {
        const owner = (f as { owner?: string }).owner;
        const { reader, problem } = compileCustom(f);
        const firstTeam = !!owner && i === custom.length;
        const t = reader ? testReader(reader, lines, 0) : undefined;
        return (
          <div key={f.id} className="flex flex-col gap-1.5">
          {firstTeam && <div className="mt-1" style={label}>from your team</div>}
          <div className="flex items-center gap-2.5 px-2.5 rounded-md"
               style={{ height: 36, border: '1px solid var(--color-surface-border)', background: 'var(--color-panel)' }}>
            <span className="text-[11.5px]" style={{ ...mono, width: 120, color: 'var(--color-info, #9cdcfe)' }}>{f.name}</span>
            <span className="text-[10.5px] px-1.5 rounded" style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-surface-border)' }}>
              {f.kind === 'call' ? 'logger call' : f.kind === 'regex' ? 'regex' : 'picked from a line'}
            </span>
            <span className="flex-1 truncate text-[11px]" style={{ ...mono, color: 'var(--color-text-secondary)' }} title={f.source}>{f.source}</span>
            <span className="text-[11px]" style={{ color: problem ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
              {problem ? 'cannot be read' : t && lines.length ? `${t.lines.toLocaleString()} lines here` : ''}
            </span>
            {owner ? (
              <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }} title="Shared in a teammate's workspace — change it there">
                {owner}&rsquo;s
              </span>
            ) : (
              <ButtonView size="xs" variant="ghost" aria-label={`Remove ${f.name}`} title={`Remove ${f.name}`}
                          iconLeft={<CloseIcon size={IconSize.chip} />}
                          onClick={() => setPref(CUSTOM_FIELDS_PREF, JSON.stringify(custom.filter(x => x.id !== f.id)))} />
            )}
          </div>
          </div>
        );
      })}
    </div>
  );
}

export function FieldsSettings() {
  const { askAbove } = useFollowPrefs();
  const setPref = useUiStateStore(s => s.setPref);
  const catalogue = useCatalogue();
  const holes = catalogue.patterns.filter(p => p.holes.length).length;

  const readers: { key: keyof typeof READER; body: React.ReactNode; example: string }[] = [
    { key: 'format', body: <>Read out of the log format the pod matched — a saved rule, or the one detected from its first lines. Thread, logger and app come from here.</>, example: '%d %-5level [%thread] %logger' },
    { key: 'mdc', body: <>Anything the line carries as a pair, whether it came from the MDC, logfmt, or a JSON log&rsquo;s own keys.</>, example: 'key=value, key="two words"' },
    { key: 'pattern', body: <>From the Loggers tab: each <span style={mono}>{'{}'}</span> is named after the argument passed to it, so the value in it becomes a field. {holes ? `${holes} catalogued pattern${holes === 1 ? '' : 's'} name holes now.` : 'None catalogued yet.'}</>, example: '"read timed out after {}ms", ms' },
    { key: 'payload', body: <>A JSON, XML or YAML payload contributes its leaf paths, so a value nested three deep is still something you can follow.</>, example: 'pool.active, card.last4' },
  ];

  return (
    <div className="flex flex-col gap-5 px-5 py-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[15px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>How a line becomes fields</h2>
        <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)', maxWidth: '110ch' }}>
          Follow can only offer what the line actually names. Four readers, in this order — and a field none of them
          found, you can name below.
        </p>
      </div>

      <LineAnatomy />

      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {readers.map(r => (
          <div key={r.key} className="px-3.5 py-3 flex flex-col gap-1.5" style={{ ...card, borderTop: `2px solid ${READER[r.key].color}` }}>
            <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{READER[r.key].title}</span>
            <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{r.body}</span>
            <span className="text-[10.5px] px-2 py-1.5 rounded-md mt-auto" style={{ ...mono, background: 'var(--color-panel)', color: 'var(--color-text-muted)' }}>{r.example}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
        <div className="px-4 py-3.5 flex flex-col gap-2.5" style={card}>
          <div>
            <div className="text-[12.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Correlate by</div>
            <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              The order Follow tries when you follow a line rather than a field. Drag to reorder.
            </div>
          </div>
          <CorrelateBy />
          <div className="px-3 py-2 rounded-md text-[11.5px]"
               style={{ border: '1px solid color-mix(in srgb, var(--color-warning) 40%, transparent)', background: 'color-mix(in srgb, var(--color-warning) 7%, transparent)', color: 'var(--color-text-primary)', lineHeight: 1.6 }}>
            A thread name is only unique inside one pod and only until it is handed back to the pool. Following one always
            pins the time window, and says so.
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-secondary)' }}>Ask before following a value with more than</span>
            <SelectInputView size="md" accentColor={ACCENT} width={96}
                             value={String(askAbove)}
                             onChange={v => setPref(ASK_ABOVE_PREF, v)}
                             options={ASK_ABOVE_OPTIONS.map(n => ({ value: String(n), label: n.toLocaleString() }))} />
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-secondary)' }}>lines</span>
          </div>
        </div>

        <div className="px-4 py-3.5 flex flex-col gap-2.5" style={card}>
          <div>
            <div className="text-[12.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>A field the readers did not find</div>
            <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Name it once and it appears on every line that carries it, on every pod.
            </div>
          </div>
          <NewField />
          <SavedFields />
        </div>
      </div>
    </div>
  );
}
