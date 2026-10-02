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
 *
 * ── How it is drawn ──
 *
 * As the board draws it: a real line with each part underlined in the colour
 * of the reader that found it — blue for the layout pattern, purple for the
 * MDC, teal for a logger's holes, amber for a payload — the same four colours
 * on the chips under it and along the top edge of the four reader cards; then
 * Correlate by and a new field side by side. A control the board does not
 * draw (removing a Correlate key, adding one) is there, but out of the way:
 * on hover, or behind one dashed button.
 */
import { useMemo, useRef, useState } from 'react';
import { CheckboxView, SelectInputView, TextInputView, IconSize } from '@salilvnair/dui';
import { CloseIcon, GripLinesIcon } from '../../icons';
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
import { FOLLOW, CHECK, FIELD_KEY, HOLE_FIELD, BLUE, AMBER, GOOD, RED, tint } from '../k8s/follow-tone';
import { LineButton, FillButton, SegTrack, CallEditor, railLabel, mono } from '../k8s/follow-ui';

/** Each reader's colour, the same on the line, its chip and its card. */
const READER = {
  format: { color: BLUE, title: 'The layout pattern' },
  mdc: { color: HOLE_FIELD, title: 'MDC and key=value' },
  pattern: { color: FOLLOW, title: 'The logger’s own holes' },
  custom: { color: FOLLOW, title: 'A field you named' },
  payload: { color: AMBER, title: 'Keys inside a payload' },
} as const;

/** The colours a tested value is picked out in, one per field, in the order the call names them. */
const PICK = [FOLLOW, HOLE_FIELD, AMBER, BLUE];

const card: React.CSSProperties = {
  background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', borderRadius: 9,
};
/** A well inside a card — an example, a tested line, a row. */
const well = 'var(--color-panel)';

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
      <div style={{ ...card, padding: '13px 15px', fontSize: 11.5, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
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
    if (m.start > pos) parts.push(<span key={`t${i}`}>{line.text.slice(pos, m.start)}</span>);
    parts.push(<span key={`m${i}`} style={{ borderBottom: `2px solid ${READER[m.origin].color}` }}>{line.text.slice(m.start, m.end)}</span>);
    pos = m.end;
  });
  if (pos < line.text.length) parts.push(<span key="tail">{line.text.slice(pos)}</span>);

  const byOrigin = (Object.keys(READER) as (keyof typeof READER)[])
    .map(o => ({ o, keys: fields.filter(f => f.origin === o).map(f => f.key) }))
    .filter(x => x.keys.length);

  return (
    <div style={{ ...card, padding: '13px 15px' }}>
      <div className="break-all" style={{ ...mono, fontSize: 12.5, lineHeight: '22px', color: 'var(--color-text-primary)' }}>{parts}</div>
      <div className="flex flex-wrap" style={{ gap: 7, marginTop: 12 }}>
        {byOrigin.map(({ o, keys }) => (
          <span key={o} className="inline-flex items-center"
                style={{
                  gap: 6, height: 23, padding: '0 9px', borderRadius: 999, fontSize: 11,
                  color: READER[o].color, background: tint(READER[o].color, READER[o].color === FOLLOW ? 18 : 16),
                }}>
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
  const [adding, setAdding] = useState<string | undefined>();
  const save = (next: typeof order) => setPref(CORRELATE_PREF, JSON.stringify(next));

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    save(next);
  };

  const add = () => {
    const key = adding?.trim();
    if (!key || order.some(k => k.key === key)) return;
    /* A new key goes above the thread: anything you name is a better thread than a pool thread's name. */
    const at = order.findIndex(k => k.key === 'thread');
    const next = [...order];
    next.splice(at < 0 ? next.length : at, 0, { key, on: true, note: 'a field you added' });
    save(next);
    setAdding(undefined);
  };

  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      {order.map((k, i) => {
        /* The thread is the one the board lights: it is the last resort, and the one that needs the warning under it. */
        const lit = k.key === 'thread';
        return (
          <div key={k.key}
               draggable
               onDragStart={() => setDragging(i)}
               onDragOver={e => e.preventDefault()}
               onDrop={() => { if (dragging !== undefined) move(dragging, i); setDragging(undefined); }}
               onDragEnd={() => setDragging(undefined)}
               className="group flex items-center"
               style={{
                 gap: 10, padding: '8px 10px', borderRadius: 7, cursor: 'grab',
                 border: `1px solid ${lit ? FOLLOW : 'var(--color-surface-border)'}`,
                 background: dragging === i ? 'var(--color-surface-hover)' : lit ? tint(FOLLOW, 8) : well,
               }}
               title="Drag to reorder">
            <GripLinesIcon size={11} color={lit ? FOLLOW : 'var(--color-text-muted)'} />
            <span className="truncate" style={{ ...mono, width: 90, fontSize: 11.5, color: lit ? FOLLOW : FIELD_KEY }}>{k.key}</span>
            <span className="flex-1 min-w-0 truncate" style={{ fontSize: 11, color: lit ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>{k.note}</span>
            {order.length > 1 && (
              <button type="button" aria-label={`Remove ${k.key}`} title={`Remove ${k.key}`}
                      onClick={() => save(order.filter(x => x.key !== k.key))}
                      className="inline-flex items-center justify-center cursor-pointer border-none bg-transparent p-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                      style={{ color: 'var(--color-text-muted)' }}>
                <CloseIcon size={IconSize.chip} />
              </button>
            )}
            <CheckboxView checked={k.on} size="sm" accentColor={CHECK} aria-label={`Use ${k.key}`}
                          onChange={v => save(order.map(x => (x.key === k.key ? { ...x, on: v } : x)))} />
          </div>
        );
      })}
      {adding === undefined ? (
        <div>
          <LineButton h={24} style={{ border: '1px dashed var(--color-surface-border)', color: 'var(--color-text-muted)' }} onClick={() => setAdding('')}>
            + another field
          </LineButton>
        </div>
      ) : (
        <div className="flex items-center" style={{ gap: 6 }}>
          <TextInputView value={adding} placeholder="orderId, tenant" size="sm" autoFocus accentColor={FOLLOW}
                         style={{ background: well, borderRadius: 6 }} inputStyle={{ ...mono, fontSize: 11.5 }}
                         onChange={e => setAdding(e.target.value)}
                         onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setAdding(undefined); }} />
          <FillButton disabled={!adding.trim() || order.some(k => k.key === adding.trim())} onClick={add}>Add</FillButton>
          <LineButton onClick={() => setAdding(undefined)}>Cancel</LineButton>
        </div>
      )}
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
    <div className="flex flex-col flex-1">
      <label style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
        Call it
        <TextInputView value={name} placeholder="batchId" size="md" accentColor={FOLLOW}
                       style={{ display: 'flex', width: '100%', height: 28, margin: '4px 0 10px', background: well, borderRadius: 6 }}
                       inputStyle={{ ...mono, fontSize: 12 }}
                       onChange={e => setName(e.target.value)} />
      </label>
      <div style={{ marginBottom: 10 }}>
        <SegTrack<CustomFieldKind>
          grow value={kind} onChange={v => { setKind(v); setPick(''); }}
          options={[
            { value: 'call', label: 'Paste the logger call' },
            { value: 'regex', label: 'Write a regex' },
            { value: 'line', label: 'Pick it in a line' },
          ]}
        />
      </div>
      <CallEditor
        value={source}
        onChange={setSource}
        paint={kind === 'call'}
        rows={kind === 'regex' ? 1 : 2}
        placeholder={kind === 'call'
          ? 'log.info("settling batch {} for merchant {}", batchId, merchantId);'
          : kind === 'regex' ? 'settling batch (?<batchId>\\S+)' : 'Paste a line that carries the value'}
      />
      {kind === 'line' && source && (
        <div className="flex flex-col" style={{ gap: 4, marginTop: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Select the value in the line</span>
          <div ref={sampleRef} onMouseUp={takeSelection}
               className="break-all select-text"
               style={{ ...mono, fontSize: 11.5, padding: '6px 9px', borderRadius: 6, background: well, border: `1px dashed ${FOLLOW}`, color: 'var(--color-text-primary)', cursor: 'text' }}>
            {source}
          </div>
          {pick && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>value: <span style={{ ...mono, color: FOLLOW }}>{pick}</span></span>}
        </div>
      )}

      <div style={{ ...railLabel, marginTop: 10 }}>tested against what is on the pods now</div>
      {!source.trim() ? (
        <span style={{ marginTop: 7, fontSize: 11, color: 'var(--color-text-muted)' }}>
          {said ? `It will be tried against ${said}.` : 'Open a pod’s Logs tab or a search result to test it against real lines.'}
        </span>
      ) : compiled?.problem ? (
        <span style={{ marginTop: 7, fontSize: 11.5, color: RED }}>{compiled.problem}</span>
      ) : test && (
        <>
          <div className="flex flex-col" style={{ gap: 5, marginTop: 7 }}>
            {test.examples.map((ex, i) => (
              <div key={i} className="truncate" style={{ ...mono, fontSize: 11, padding: '6px 9px', borderRadius: 6, background: well, color: 'var(--color-text-muted)' }}>
                {highlight(ex.text, Object.values(ex.values))}
              </div>
            ))}
          </div>
          <span style={{ marginTop: 8, fontSize: 11.5, color: test.lines ? GOOD : AMBER }}
                title={test.fields.length ? test.fields.join(', ') : undefined}>
            {test.lines
              ? `Matches ${test.lines.toLocaleString()} line${test.lines === 1 ? '' : 's'}${test.pods ? ` on ${test.pods} pod${test.pods === 1 ? '' : 's'}` : ''} · ${test.fields.length} field${test.fields.length === 1 ? '' : 's'}`
              : `Nothing in ${said || 'the lines on hand'} matches it — either it has not run, or the text differs from the build in these pods.`}
          </span>
        </>
      )}

      <div className="flex-1" />
      <div className="flex items-center" style={{ gap: 8, paddingTop: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Saved with the workspace, shared the way collections are.</span>
        <div className="flex-1" />
        <FillButton h={27} fs={11.5} style={{ padding: '0 12px' }}
                    disabled={!source.trim() || !!compiled?.problem || (kind === 'line' && !pick)}
                    onClick={add}>
          Add the field
        </FillButton>
      </div>
    </div>
  );
}

/** The tested line, each value picked out in the colour of the field it fills. */
function highlight(text: string, values: string[]): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  values.forEach((v, n) => {
    const at = rest.indexOf(v);
    if (at < 0) return;
    const c = PICK[n % PICK.length];
    parts.push(<span key={key++}>{rest.slice(0, at)}</span>);
    parts.push(<span key={key++} style={{ color: c, background: tint(c, c === FOLLOW ? 18 : 16), borderRadius: 3, padding: '0 4px' }}>{v}</span>);
    rest = rest.slice(at + v.length);
  });
  parts.push(<span key={key++}>{rest}</span>);
  return parts;
}

function SavedFields() {
  const { mine: custom, team } = useAllCustomFields();
  const setPref = useUiStateStore(s => s.setPref);
  const { lines } = useLinesOnHand();
  if (!custom.length && !team.length) return null;
  return (
    <div className="flex flex-col" style={{ gap: 6, marginTop: 12 }}>
      {custom.length > 0 && <div style={railLabel}>fields you named</div>}
      {[...custom, ...team].map((f, i) => {
        const owner = (f as { owner?: string }).owner;
        const { reader, problem } = compileCustom(f);
        const firstTeam = !!owner && i === custom.length;
        const t = reader ? testReader(reader, lines, 0) : undefined;
        return (
          <div key={f.id} className="flex flex-col" style={{ gap: 6 }}>
            {firstTeam && <div style={{ ...railLabel, marginTop: 4 }}>from your team</div>}
            <div className="group flex items-center"
                 style={{ gap: 10, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--color-surface-border)', background: well }}>
              <span className="truncate" style={{ ...mono, width: 90, fontSize: 11.5, color: FIELD_KEY }}>{f.name}</span>
              <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>
                {f.kind === 'call' ? 'logger call' : f.kind === 'regex' ? 'regex' : 'picked from a line'}
              </span>
              <span className="flex-1 min-w-0 truncate" style={{ ...mono, fontSize: 11, color: 'var(--color-text-secondary)' }} title={f.source}>{f.source}</span>
              <span style={{ fontSize: 11, color: problem ? RED : 'var(--color-text-muted)' }}>
                {problem ? 'cannot be read' : t && lines.length ? `${t.lines.toLocaleString()} lines here` : ''}
              </span>
              {owner ? (
                <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }} title="Shared in a teammate's workspace — change it there">
                  {owner}&rsquo;s
                </span>
              ) : (
                <button type="button" aria-label={`Remove ${f.name}`} title={`Remove ${f.name}`}
                        onClick={() => setPref(CUSTOM_FIELDS_PREF, JSON.stringify(custom.filter(x => x.id !== f.id)))}
                        className="inline-flex items-center cursor-pointer border-none bg-transparent p-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                        style={{ color: 'var(--color-text-muted)' }}>
                  <CloseIcon size={IconSize.chip} />
                </button>
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

  const readers: { key: keyof typeof READER; body: React.ReactNode; example: string }[] = [
    { key: 'format', body: <>Read out of <span style={mono}>logback.xml</span> in the container, or learned from the first hundred lines when there is none.</>, example: '%d %-5level [%thread] %logger' },
    { key: 'mdc', body: <>Anything the line carries as a pair, whether it came from the MDC, logfmt, or a developer writing it by hand.</>, example: 'key=value, key="two words"' },
    { key: 'pattern', body: <>From the Loggers tab: each <span style={mono}>{'{}'}</span> is named after the argument passed to it, so the value in it becomes a field.</>, example: '"read timed out after {}ms", ms' },
    { key: 'payload', body: <>A JSON, XML or YAML payload contributes its leaf paths, so a value nested three deep is still something you can follow.</>, example: 'pool.active, card.last4' },
  ];

  return (
    <div className="flex flex-col" style={{ gap: 14, padding: '18px 22px' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>How a line becomes fields</h2>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
          Follow can only offer what the line actually names. Four readers, in this order.
        </p>
      </div>

      <LineAnatomy />

      <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        {readers.map(r => (
          <div key={r.key} className="flex flex-col"
               style={{ ...card, borderRadius: 8, borderTop: `2px solid ${READER[r.key].color}`, padding: '11px 13px' }}>
            <span style={{ fontSize: 12, fontWeight: 600, marginBottom: 5, color: 'var(--color-text-primary)' }}>{READER[r.key].title}</span>
            <span style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>{r.body}</span>
            <span className="mt-auto" style={{ ...mono, marginTop: 8, padding: '6px 8px', borderRadius: 6, fontSize: 10.5, background: well, color: 'var(--color-text-muted)' }}>{r.example}</span>
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <div className="flex flex-col" style={{ ...card, padding: '13px 15px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>Correlate by</div>
          <div style={{ fontSize: 11.5, margin: '3px 0 10px', color: 'var(--color-text-muted)' }}>
            The order Follow tries when you click a line rather than a field. Drag to reorder.
          </div>
          <CorrelateBy />
          <div style={{
            marginTop: 10, padding: '9px 11px', borderRadius: 7, fontSize: 11.5, lineHeight: 1.6,
            border: `1px solid ${tint(AMBER, 40)}`, background: tint(AMBER, 7), color: 'var(--color-text-primary)',
          }}>
            A thread name is only unique inside one pod and only until it is handed back to the pool. Following one always
            pins the time window, and says so.
          </div>
          <div className="flex-1" />
          <div className="flex items-center" style={{ gap: 9, paddingTop: 10 }}>
            <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>Ask before following a value with more than</span>
            <SelectInputView size="sm" accentColor={FOLLOW} width={96}
                             style={{ height: 26, borderRadius: 6, background: well }}
                             value={String(askAbove)}
                             onChange={v => setPref(ASK_ABOVE_PREF, v)}
                             options={ASK_ABOVE_OPTIONS.map(n => ({ value: String(n), label: n.toLocaleString() }))} />
            <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>lines</span>
          </div>
        </div>

        <div className="flex flex-col" style={{ ...card, padding: '13px 15px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>A field the readers did not find</div>
          <div style={{ fontSize: 11.5, margin: '3px 0 10px', color: 'var(--color-text-muted)' }}>
            Name it once and it appears on every line that carries it, on every pod.
          </div>
          <NewField />
          <SavedFields />
        </div>
      </div>
    </div>
  );
}
