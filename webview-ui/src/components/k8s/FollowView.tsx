/**
 * One value, followed across every pod the search covered.
 *
 * Opened from a field card on a search result. The value becomes a condition,
 * the pods are read again for a window around the line you came from, and only
 * the lines whose field EQUALS the value are kept — so every line on screen is
 * the same thread, the same request, the same order, and the rail says why.
 *
 * ── What is on it ──
 *
 * Conditions as chips that stack with AND — each can be switched off without
 * being dropped, to see what it was hiding. The window, and Widen when the
 * request started earlier than ninety seconds before the error. A count per
 * pod, a pod with none included, because "it never reached this replica" is an
 * answer. One timeline by default: a request through three pods is one story,
 * and the pod column says where each line was — always, because the same
 * thread name is reused by every pod in a deployment.
 *
 * On the right: why these lines are here, what else they carried (the next
 * thing to follow — click to swap, Shift-click to add), and how a value that is
 * only inside a message becomes followable.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckboxView, PopoverView, TextInputView, ProgressBarView, IconSize } from '@salilvnair/dui';
import { ChevronLeftIcon, CloseIcon, SearchIcon } from '../../icons';
import { useResultTabStore } from '../../store/dk8s-result-tab-store';
import { useTaggedSearchStore } from '../../store/dk8s-tagged-search-store';
import { useK8sStore } from '../../store/k8s-store';
import { useSplitStore, MAX_PANES } from '../../store/dk8s-split-store';
import { useTabsStore } from '../../store/tabs-store';
import { useCatalogue } from '../../store/dk8s-logger-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { LogViewer } from './LogViewer';
import { LogSourceProvider } from './log-source';
import { resultLines, sourceSummary, type ResultLine } from './search-results';
import { sourceTagFor } from './source-tag';
import { formatLogTime } from './log-view';
import { logLineSettings } from './log-settings';
import {
  follows, followQuery, podCounts, touched, fieldValues, arrange, cameFrom, nextWidth, widthLabel, type Condition,
} from './follow';
import { readFields } from './field-readers';
import { useFieldReaders, saveView } from './follow-prefs';
import { replicaHue, podTail } from './pod-hue';
import { snapshotSource, standIn, useSnapshotView } from './snapshot-source';
import { asPodSummaries } from './searched-pods';
import { openWith } from '../ai/ai-chat-actions';
import { FOLLOW, FOLLOW_INK, CHECK, FIELD_KEY, FIELD_VALUE, AMBER, tint } from './follow-tone';
import { LineButton, FillButton, CheckLabel, railLabel, mono } from './follow-ui';
import { templateParts } from './logger-pattern';

/** The big glass, while the pods are read — the same moment as the search dialog's. */
export function ReadingPods({ title, detail, done, total }: { title: string; detail: React.ReactNode; done: number; total: number }) {
  const accent = 'var(--color-dk8s)';
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
      <span className="relative grid place-items-center" style={{ width: 96, height: 96 }}>
        <span className="absolute inset-0 rounded-full"
              style={{ background: `radial-gradient(circle, color-mix(in srgb, ${accent} 22%, transparent), color-mix(in srgb, ${accent} 6%, transparent) 70%)` }} />
        <span className="absolute inset-0 rounded-full animate-spin"
              style={{ border: `3px solid color-mix(in srgb, ${accent} 16%, transparent)`, borderTopColor: accent, borderRightColor: accent, animationDuration: '0.9s' }} />
        <SearchIcon size={IconSize.hero} color={accent} />
      </span>
      <span className="flex flex-col gap-1 items-center">
        <span className="text-[16px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</span>
        <span className="text-[12px] max-w-[560px]" style={{ color: 'var(--color-text-secondary)' }}>{detail}</span>
      </span>
      <span className="flex flex-col gap-1.5 items-center" style={{ width: 300 }}>
        <span className="w-full"><ProgressBarView value={total ? (done / total) * 100 : undefined} color={accent} /></span>
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {done} of {total} pod{total === 1 ? '' : 's'} read
        </span>
      </span>
    </div>
  );
}

/**
 * One condition, as the board draws it.
 *
 * On: a teal pill with the field, its value and a round × to drop it — a
 * click on the words switches it off without dropping it, to see what it was
 * hiding. Off: a dashed pill with a box to switch it back on.
 */
function ConditionChip({ c, onToggle, onDrop }: { c: Condition; onToggle: () => void; onDrop: () => void }) {
  const words = (
    <>
      <span style={{ opacity: 0.8 }}>{c.field} =</span>
      <span className="truncate" style={{ ...mono, maxWidth: 220 }} title={c.value}>{c.value}</span>
    </>
  );
  if (!c.on) {
    return (
      <span className="inline-flex items-center shrink-0"
            style={{
              gap: 7, height: 27, padding: '0 5px 0 10px', borderRadius: 999, fontSize: 11.5,
              border: '1px dashed var(--color-surface-border)', color: 'var(--color-text-secondary)',
            }}>
        {words}
        <CheckboxView checked={false} onChange={onToggle} size="sm" accentColor={CHECK} aria-label="Apply this condition" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center shrink-0"
          style={{
            gap: 7, height: 27, padding: '0 5px 0 10px', borderRadius: 999, fontSize: 11.5,
            background: tint(FOLLOW, 16), color: FOLLOW,
          }}>
      <button type="button" onClick={onToggle} title="Switch this condition off, without dropping it"
              className="inline-flex items-center cursor-pointer border-none bg-transparent p-0 min-w-0"
              style={{ gap: 7, color: 'inherit', font: 'inherit' }}>
        {words}
      </button>
      <button type="button" onClick={onDrop} aria-label="Drop this condition" title="Drop this condition"
              className="inline-flex items-center justify-center cursor-pointer border-none shrink-0"
              style={{ width: 18, height: 18, borderRadius: '50%', background: tint(FOLLOW, 25), color: FOLLOW }}>
        <CloseIcon size={9} strokeWidth={3} />
      </button>
    </span>
  );
}

function AddCondition({ suggestions, available, onAdd }: {
  suggestions: { field: string; value: string; n: number }[];
  /** Every field the lines carry, and its values — the two pickers' lists. */
  available: { field: string; n: number; values: { value: string; n: number }[] }[];
  onAdd: (c: { field: string; value: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState('');
  const [value, setValue] = useState('');
  const anchor = useRef<HTMLSpanElement>(null);
  const chosen = available.find(f => f.field === field.trim());
  const add = (c: { field: string; value: string }) => { onAdd(c); setOpen(false); setField(''); setValue(''); };
  return (
    <span ref={anchor} className="shrink-0">
      <LineButton h={27} fs={11.5} onClick={() => setOpen(o => !o)}
                  style={{ borderRadius: 999, border: '1px dashed var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
        + condition
      </LineButton>
      <PopoverView open={open} onClose={() => setOpen(false)} anchorEl={anchor.current} placement="bottom" borderRadius={10}>
        <div className="flex flex-col gap-2 p-3" style={{ width: 380 }}>
          {suggestions.length > 0 && (
            <>
              <div style={railLabel}>carried by these lines</div>
              <div className="flex flex-col" style={{ gap: 5, maxHeight: 200, overflowY: 'auto' }}>
                {suggestions.map(s => (
                  <TouchedRow key={`${s.field}=${s.value}`} t={s} onClick={() => add(s)} title={`Add ${s.field} = ${s.value}`} />
                ))}
              </div>
            </>
          )}
          {/*
            Picked from what the lines carry, or typed: a field from another
            pod's format, or a value not on screen yet, is still a condition.
            The choices are drawn inside the popover — a dropdown drawn on the
            body is a click outside it, and closes it on the first pick.
          */}
          <div style={railLabel}>{available.length ? 'or pick a field' : 'or name one'}</div>
          <div className="flex items-center gap-1.5">
            <TextInputView value={field} placeholder="field" size="sm" autoComplete="off" aria-label="Field"
                           onChange={e => { setField(e.target.value); setValue(''); }} />
            <span style={{ color: FOLLOW, fontWeight: 600 }}>=</span>
            <TextInputView value={value} placeholder="value" size="sm" autoComplete="off" aria-label="Value"
                           onChange={e => setValue(e.target.value)} />
          </div>

          {available.length > 0 && (
            <div className="flex flex-wrap" style={{ gap: 5 }}>
              {available
                .filter(f => !field.trim() || chosen || f.field.toLowerCase().includes(field.trim().toLowerCase()))
                .map(f => {
                  const on = f.field === field.trim();
                  return (
                    <button key={f.field} type="button" onClick={() => { setField(on ? '' : f.field); setValue(''); }}
                            title={`${f.n} line${f.n === 1 ? '' : 's'} carry ${f.field}, in ${f.values.length} value${f.values.length === 1 ? '' : 's'}`}
                            className="inline-flex items-center cursor-pointer"
                            style={{
                              gap: 6, height: 24, padding: '0 4px 0 10px', borderRadius: 999, fontSize: 11.5, ...mono,
                              color: on ? FOLLOW_INK : FIELD_KEY,
                              background: on ? FOLLOW : tint(FIELD_KEY, 10),
                              border: `1px solid ${on ? FOLLOW : tint(FIELD_KEY, 35)}`,
                            }}>
                      {f.field}
                      <span style={{
                        minWidth: 18, height: 16, padding: '0 5px', borderRadius: 999, fontSize: 10, lineHeight: '16px', textAlign: 'center',
                        fontVariantNumeric: 'tabular-nums',
                        background: on ? tint(FOLLOW_INK, 18) : tint(FIELD_KEY, 18),
                        color: on ? FOLLOW_INK : FIELD_KEY,
                      }}>{f.values.length}</span>
                    </button>
                  );
                })}
            </div>
          )}

          {chosen && (
            <div className="flex flex-col" style={{ gap: 3, maxHeight: 190, overflowY: 'auto', paddingRight: 2 }}>
              {chosen.values
                .filter(v => !value.trim() || v.value.toLowerCase().includes(value.trim().toLowerCase()))
                .map(v => {
                  const on = v.value === value.trim();
                  const share = Math.max(4, Math.round((v.n / chosen.values[0].n) * 100));
                  return (
                    <button key={v.value} type="button" onClick={() => setValue(v.value)}
                            onDoubleClick={() => add({ field: chosen.field, value: v.value })}
                            title={`${v.n} line${v.n === 1 ? '' : 's'} carry ${chosen.field} = ${v.value} — double-click to add it`}
                            className="relative flex items-center text-left cursor-pointer overflow-hidden"
                            style={{
                              gap: 8, padding: '5px 9px', borderRadius: 7, fontSize: 11.5,
                              border: `1px solid ${on ? FOLLOW : 'var(--color-surface-border)'}`,
                              background: on ? tint(FOLLOW, 14) : 'transparent',
                            }}>
                      {/* How much of the lines carry it, as a bar behind the row. */}
                      <span aria-hidden className="absolute left-0 top-0 bottom-0"
                            style={{ width: `${share}%`, background: tint(FIELD_VALUE, on ? 16 : 9) }} />
                      <span className="relative flex-1 min-w-0 truncate" style={{ ...mono, color: FIELD_VALUE }}>{v.value}</span>
                      <span className="relative shrink-0" style={{ color: on ? FOLLOW : 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{v.n}</span>
                    </button>
                  );
                })}
            </div>
          )}

          {field.trim() && !chosen && (
            <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              No line here carries <span style={{ ...mono, color: FIELD_KEY }}>{field.trim()}</span> — it can still be a condition, checked against what the search reads.
            </div>
          )}
          <div className="flex justify-end">
            <FillButton h={24} disabled={!field.trim() || !value.trim()}
                        onClick={() => add({ field: field.trim(), value: value.trim() })}>
              Add
            </FillButton>
          </div>
        </div>
      </PopoverView>
    </span>
  );
}

function SaveAsView({ onSave }: { onSave: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const anchor = useRef<HTMLSpanElement>(null);
  return (
    <span ref={anchor} className="shrink-0">
      <LineButton h={26} fs={11.5} onClick={() => setOpen(o => !o)}>Save as view</LineButton>
      <PopoverView open={open} onClose={() => setOpen(false)} anchorEl={anchor.current} placement="bottom" borderRadius={10}>
        <div className="flex flex-col gap-2 p-3" style={{ width: 280 }}>
          <div className="text-[11.5px]" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Kept with the result&rsquo;s other saved follows — the conditions, the pods and the window.
          </div>
          <TextInputView value={name} placeholder="What this follow is" onChange={e => setName(e.target.value)} size="sm" />
          <div className="flex justify-end">
            <FillButton h={24} disabled={!name.trim()}
                        onClick={() => { onSave(name.trim()); setOpen(false); setName(''); }}>
              Save
            </FillButton>
          </div>
        </div>
      </PopoverView>
    </span>
  );
}

/** "requestDataId  8842  19" — a value these lines also carry, one click from being the condition. */
function TouchedRow({ t, onClick, title }: {
  t: { field: string; value: string; n: number };
  onClick: (e: React.MouseEvent) => void;
  title: string;
}) {
  return (
    <button type="button" onClick={onClick} title={title}
            className="flex items-center text-left cursor-pointer bg-transparent hover:bg-[var(--color-surface-hover)]"
            style={{
              gap: 8, padding: '6px 9px', borderRadius: 7, fontSize: 11.5,
              border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)',
            }}>
      <span className="flex-1 min-w-0 truncate">{t.field}</span>
      <span className="truncate" style={{ ...mono, maxWidth: 130, color: FIELD_VALUE }}>{t.value}</span>
      <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{t.n}</span>
    </button>
  );
}

/** "Open the three pods in a split" — the board says the number in words. */
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const inWords = (n: number) => COUNT_WORDS[n] ?? String(n);

export function FollowView() {
  const { follow, setFollow, patchFollow, searched, query } = useResultTabStore();
  const readers = useFieldReaders();
  const catalogue = useCatalogue();
  const run = useTaggedSearchStore(s => s.run);
  const drop = useTaggedSearchStore(s => s.drop);
  const search = useTaggedSearchStore(s => (follow ? s.byTag[follow.tag] : undefined));
  const logLineNumbers = useK8sStore(s => s.logLineNumbers);
  const livePods = useK8sStore(s => s.pods);
  const exportLines = useK8sStore(s => s.exportLines);
  const openSplit = useSplitStore(s => s.open);
  const openDk8sTab = useTabsStore(s => s.openDk8sTab);
  const prefs = useUiStateStore(s => s.prefs);
  const view = useSnapshotView();

  const q = follow ? followQuery(follow.conds) : undefined;
  const all = follow?.pods ?? searched;
  const pods = useMemo(() => (follow?.onlyPod ? all.filter(s => s.pod === follow.anchor.pod) : all),
    [all, follow?.onlyPod, follow?.anchor.pod]);

  /*
    Read the pods again whenever what is asked of them changes: the value
    searched for, the window, or which pods. Switching a condition off that is
    not the one searched for changes nothing here — the lines are on hand, and
    only the exact check below runs again.
  */
  /*
    A line from an archived file is followed through the archive. The live log
    only goes back as far as the container's own, and a thread from last night
    is not in it — every width came back with no lines at all.
  */
  const fromArchive = follow?.anchor.source === 'archive';
  const runKey = follow ? `${q}|${follow.width}|${follow.onlyPod}|${follow.anchor.ts}|${fromArchive}` : '';
  const ran = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!follow || !q) return;
    if (ran.current === runKey && search) return;
    ran.current = runKey;
    const tag = `follow:${Date.now()}`;
    if (follow.tag !== tag && search) drop(follow.tag);
    patchFollow({ tag });
    const ts = follow.anchor.ts;
    run(tag, pods.map(p => ({ context: p.context, namespace: p.namespace, pod: p.pod, containers: p.containers })), {
      query: q,
      fromMs: ts !== undefined ? ts - follow.width * 1000 : undefined,
      toMs: ts !== undefined ? ts + follow.width * 1000 : undefined,
      /* No instant to centre on — a line without a timestamp — reads the tail. */
      tailLines: ts !== undefined ? -1 : 5000,
    }, { archive: fromArchive });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  /* The tag moves on every re-read; the one to drop on the way out is the last. */
  const tagNow = useRef(follow?.tag);
  tagNow.current = follow?.tag;
  useEffect(() => () => { if (tagNow.current) drop(tagNow.current); }, [drop]);

  const podNames = useMemo(() => pods.map(p => p.pod), [pods]);
  const lines = useMemo(() => {
    if (!follow || !search) return [] as ResultLine[];
    const all = resultLines(search.groups).filter(l => !l.context && follows(l, follow.conds, readers));
    return arrange(all, follow.oneTimeline);
  }, [search, follow, readers]);

  const counts = useMemo(() => podCounts(lines, podNames), [lines, podNames]);
  const origin = useMemo(() => sourceSummary(lines), [lines]);
  /* A pod that could not be read is not a pod with nothing on it — said apart, with kubectl's reason. */
  const errors = useMemo(() => new Map((search?.groups ?? []).filter(g => g.result.error).map(g => [g.result.pod, g.result.error!])),
    [search]);
  const from = useMemo(() => (follow ? cameFrom(lines, follow.anchor) : -1), [lines, follow]);
  const also = useMemo(() => (follow ? touched(lines, follow.conds, l => readFields(l, readers)) : []), [lines, follow, readers]);
  /* What the pickers offer: the lines on screen, or — when the conditions match
     nothing — every line the search read, so there is still something to pick. */
  const available = useMemo(() => {
    const from = lines.length ? lines : (search ? resultLines(search.groups).filter(l => !l.context) : []);
    return fieldValues(from, l => readFields(l, readers));
  }, [lines, search, readers]);

  /* A pattern whose holes turn up in these lines, to show how a message value is followed. */
  const example = useMemo(() => {
    const withHoles = catalogue.patterns.filter(p => p.holes.length);
    return withHoles.find(p => lines.some(l => readFields(l, readers).some(f => p.holes.includes(f.key)))) ?? withHoles[0];
  }, [catalogue, lines, readers]);

  if (!follow) return null;

  const conds = follow.conds;
  const setConds = (next: Condition[]) => patchFollow({ conds: next });
  const running = !!search?.running;
  const anchorTime = follow.anchor.ts !== undefined ? formatLogTime(follow.anchor.ts) : undefined;
  const threadFollowed = conds.some(c => c.on && c.field === 'thread');
  const origins = conds.filter(c => c.on).map(c => {
    const where = c.field === 'thread' || c.field === 'logger' || c.field === 'app' ? 'its layout pattern'
      : lines.some(l => l.fields?.[c.field] !== undefined) ? 'its MDC' : 'a pattern or a field you named';
    return { c, where };
  });

  const swapOrAdd = (t: { field: string; value: string }, add: boolean) => {
    if (add) setConds([...conds, { field: t.field, value: t.value, on: true }]);
    else setConds([{ field: t.field, value: t.value, on: true }]);
  };

  const exportThese = () => {
    const body = lines.map(l => `${l.ts !== undefined ? new Date(l.ts).toISOString() : ''} [${l.pod}] ${l.text}`);
    const name = `follow-${conds.filter(c => c.on).map(c => `${c.field}-${c.value}`).join('-')}`.slice(0, 80);
    exportLines(name, pods[0]?.namespace ?? '', body);
  };

  const askAi = () => {
    const shown = lines.slice(0, 150);
    const text = [
      `These ${lines.length} log lines all carry ${conds.filter(c => c.on).map(c => `${c.field}=${c.value}`).join(' and ')}, `
        + `across ${counts.filter(c => c.n).length} pod${counts.filter(c => c.n).length === 1 ? '' : 's'}`
        + (anchorTime ? `, within ${widthLabel(follow.width)} of ${anchorTime}` : '') + '.',
      '',
      ...shown.map(l => `${l.ts !== undefined ? formatLogTime(l.ts) : ''} ${podTail(l.pod)} ${l.level.toUpperCase()} ${l.text}`),
      lines.length > shown.length ? `… and ${lines.length - shown.length} more` : '',
      '',
      'What happened to this request, in order, and where did it go wrong? ',
    ].join('\n');
    openWith(text);
  };

  const openInSplit = () => {
    const withLines = pods.filter(p => counts.find(c => c.pod === p.pod)?.n);
    const chosen = (withLines.length ? withLines : pods).slice(0, MAX_PANES.grid);
    const mode = chosen.length > MAX_PANES.vertical ? 'grid' : 'vertical';
    openSplit(asPodSummaries(chosen, livePods), mode, logLineSettings(prefs).tailDefault, 'results');
    openDk8sTab();
  };

  const save = (name: string) => saveView({
    id: `fv-${Date.now()}`, name, conds, anchor: follow.anchor, width: follow.width,
    oneTimeline: follow.oneTimeline, onlyPod: follow.onlyPod, query, pods: all, saved: Date.now(),
  });

  const focusSeq = from >= 0 ? lines[from].seq : undefined;
  const source = snapshotSource({
    lines,
    view,
    detail: standIn(conds.map(c => c.value).join(' · ') || 'follow', pods[0]?.namespace ?? '', pods[0]?.context ?? '', `follow:${follow.tag}`, 'Follow'),
    logDetail: `${lines.length.toLocaleString()} line${lines.length === 1 ? '' : 's'} carry ${conds.filter(c => c.on).map(c => `${c.field} = ${c.value}`).join(' and ')}`,
    requestedAt: search?.startedAt ?? 0,
    lineNumbers: logLineNumbers,
    onExport: exportThese,
    onClose: () => setFollow(undefined),
    title: conds.map(c => c.value).join(' · '),
    extra: {
      podColumn: true,
      podColor: (pod: string) => replicaHue(pod, podNames),
      focusSeq,
      focusLabel: 'you came from here',
      sourceTag: sourceTagFor(lines),
    },
  });

  const nextW = nextWidth(follow.width);
  const splitCount = Math.min(MAX_PANES.grid, counts.filter(c => c.n).length || pods.length);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── The question: conditions, window ── */}
      <div className="flex items-center shrink-0 flex-wrap"
           style={{ gap: 8, minHeight: 46, padding: '0 14px', borderBottom: '1px solid var(--color-surface-border)' }}>
        <LineButton h={26} title="Back to the hits" aria-label="Back to the hits"
                    style={{ width: 26, padding: 0 }}
                    iconLeft={<ChevronLeftIcon size={13} />}
                    onClick={() => { drop(follow.tag); setFollow(undefined); }} />
        {conds.map((c, i) => (
          <span key={`${c.field}=${c.value}`} className="inline-flex items-center" style={{ gap: 8 }}>
            {i > 0 && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>AND</span>}
            <ConditionChip
              c={c}
              onToggle={() => setConds(conds.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
              onDrop={() => (conds.length === 1 ? setFollow(undefined) : setConds(conds.filter((_, j) => j !== i)))}
            />
          </span>
        ))}
        <AddCondition suggestions={also} available={available} onAdd={t => swapOrAdd(t, true)} />
        <div className="flex-1" />
        {anchorTime && (
          <span className="inline-flex items-center shrink-0"
                style={{
                  height: 26, padding: '0 10px', borderRadius: 6, fontSize: 11.5,
                  border: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)',
                }}>
            {widthLabel(follow.width).replace('± ', '±')} around {anchorTime}
          </span>
        )}
        {anchorTime && (
          <LineButton h={26} fs={11.5} disabled={!nextW}
                      title={nextW ? `Read ${widthLabel(nextW)} around the line instead` : 'Already the widest window'}
                      onClick={() => nextW && patchFollow({ width: nextW })}>
            Widen
          </LineButton>
        )}
        <SaveAsView onSave={save} />
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          {/* ── How many, where ── */}
          <div className="flex items-center shrink-0 flex-wrap"
               style={{
                 gap: 14, padding: '8px 14px', fontSize: 11.5,
                 borderBottom: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)',
               }}>
            <span style={{ color: 'var(--color-text-primary)' }}>
              {running && !lines.length ? 'Reading…' : `${lines.length.toLocaleString()} line${lines.length === 1 ? '' : 's'}`}
            </span>
            {/* Where they came from — the archive, when the line followed was in it. */}
            {lines.length > 0 && origin.files > 0 && (
              <span style={{ color: 'var(--color-warning)' }}
                    title="Lines from archived log files on the pod's volume, not the running container's own log">
                from {origin.label}
              </span>
            )}
            {counts.map(c => {
              const err = errors.get(c.pod);
              return (
                <span key={c.pod} className="inline-flex items-center" style={{ gap: 6, opacity: c.n || err ? 1 : 0.55 }}
                      title={err ? `${c.pod} could not be read: ${err}` : c.pod}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: replicaHue(c.pod, podNames) }} />
                  {c.pod} &middot; {err
                    ? <span style={{ color: AMBER }}>not read</span>
                    : c.n}
                </span>
              );
            })}
            <div className="flex-1" />
            <CheckLabel checked={follow.oneTimeline} onChange={v => patchFollow({ oneTimeline: v })}>
              One timeline
            </CheckLabel>
            <CheckLabel checked={follow.onlyPod} onChange={v => patchFollow({ onlyPod: v })}>
              {threadFollowed ? 'Only this thread’s pod' : 'Only the pod you came from'}
            </CheckLabel>
          </div>

          <div className="flex-1 min-h-0">
            {running && !lines.length ? (
              <ReadingPods
                title="Following"
                detail={<>Reading {pods.length} pod{pods.length === 1 ? '' : 's'} for <span className="font-mono" style={{ color: FOLLOW }}>{q}</span>
                  {anchorTime ? <> within {widthLabel(follow.width)} of {anchorTime}</> : null}</>}
                done={search?.progress.done ?? 0} total={search?.progress.total ?? pods.length}
              />
            ) : !lines.length && errors.size && errors.size >= pods.length ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 px-8 text-center">
                <span className="text-[13px]" style={{ color: 'var(--color-text-primary)' }}>
                  {pods.length === 1 ? 'The pod could not be read' : `None of the ${pods.length} pods could be read`}
                </span>
                <div className="flex flex-col gap-1 text-[11.5px] font-mono max-w-[640px] text-left" style={{ color: AMBER }}>
                  {[...errors].map(([pod, err]) => <span key={pod}>{podTail(pod)} · {err}</span>)}
                </div>
              </div>
            ) : !lines.length ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 px-8 text-center">
                <span className="text-[13px]" style={{ color: 'var(--color-text-primary)' }}>No line carries all of these</span>
                <span className="text-[11.5px] max-w-[520px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                  {conds.some(c => c.on)
                    ? `Nothing in ${widthLabel(follow.width)} around the line you came from has every condition that is on. Switch one off, or widen the window.`
                    : 'Every condition is switched off — switch one on to follow it.'}
                </span>
                {nextW && conds.some(c => c.on) && (
                  <LineButton h={26} fs={11.5} tone={FOLLOW} onClick={() => patchFollow({ width: nextW })}>
                    Widen to {widthLabel(nextW)}
                  </LineButton>
                )}
              </div>
            ) : (
              <LogSourceProvider value={source}>
                <LogViewer />
              </LogSourceProvider>
            )}
          </div>

          <div className="flex items-center shrink-0"
               style={{
                 gap: 10, height: 36, padding: '0 14px', fontSize: 11.5,
                 borderTop: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)',
               }}>
            <span className="min-w-0 truncate">The same thread name can be reused by another pod &mdash; the pod column is always shown for that reason.</span>
            <div className="flex-1" />
            {pods.length > 1 && (
              <LineButton h={26} fs={11.5} tone={FOLLOW} onClick={openInSplit}>
                Open the {inWords(splitCount)} pods in a split
              </LineButton>
            )}
          </div>
        </div>

        {/* ── Why, and what next ── */}
        <div className="flex flex-col min-h-0 shrink-0"
             style={{ width: 300, borderLeft: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
          <div className="flex-1 min-h-0 overflow-auto">
            <div style={{ padding: '12px 14px 6px', fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>Why these lines</div>
            <div style={{ padding: '0 14px 12px', fontSize: 11.5, lineHeight: 1.65, color: 'var(--color-text-secondary)' }}>
              {origins.length ? (
                <>
                  Every one of them carries{' '}
                  {origins.map(({ c, where }, i) => (
                    <span key={c.field}>
                      {i > 0 && ' and '}
                      <span style={{ ...mono, color: FOLLOW }}>{c.field}={c.value}</span> in {where}
                    </span>
                  ))}
                  . Nothing was inferred and no model was asked.
                </>
              ) : 'Every condition is off.'}
            </div>

            <div style={{ padding: '0 14px 10px' }}>
              <div style={{ ...railLabel, marginBottom: 7 }}>what else {threadFollowed ? 'this thread' : 'these lines'} touched</div>
              {also.length ? (
                <>
                  <div className="flex flex-col" style={{ gap: 5 }}>
                    {also.map(t => (
                      <TouchedRow key={`${t.field}=${t.value}`} t={t}
                                  onClick={e => swapOrAdd(t, e.shiftKey)}
                                  title={`Follow ${t.field} = ${t.value} instead · Shift-click to add it`} />
                    ))}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 7, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
                    Click one to swap the condition, Shift-click to add it.
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
                  {lines.length ? 'These lines carry nothing else to follow.' : 'Once lines come back, the other ids they carry are listed here.'}
                </div>
              )}
            </div>

            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--color-surface-border)' }}>
              <div style={{ ...railLabel, marginBottom: 7 }}>when it is not in the MDC</div>
              <div style={{ fontSize: 11.5, lineHeight: 1.65, color: 'var(--color-text-secondary)' }}>
                A value that only appears inside the message is still followable &mdash; the logger&rsquo;s pattern names the
                hole it sits in
                {example ? (
                  <>, so{' '}
                    <span style={{ ...mono, color: FOLLOW }}>
                      {templateParts(example.template).map((p, i) => (p.hole ? <span key={i}>{'{}'}</span> : <span key={i}>{p.text}</span>))}
                    </span>
                    {' '}gives {example.holes.length === 1 ? 'a field called ' : 'fields called '}
                    <span style={{ color: FOLLOW }}>{example.holes.join(', ')}</span> and the same Follow works on it.</>
                ) : (
                  <>. Add the logger&rsquo;s calls in the Loggers tab, or name a field on the Fields page, and the value in each
                    {' {}'} becomes a field this works on.</>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center shrink-0"
               style={{ gap: 6, padding: '10px 14px', borderTop: '1px solid var(--color-surface-border)' }}>
            <LineButton h={26} fs={11.5} style={{ flexGrow: 1, flexBasis: 0, minWidth: 0 }}
                        disabled={!lines.length} onClick={exportThese}>
              Export these lines
            </LineButton>
            <LineButton h={26} fs={11.5} style={{ flexGrow: 1, flexBasis: 0, minWidth: 0 }}
                        disabled={!lines.length} onClick={askAi}>
              Ask the AI tab
            </LineButton>
          </div>
        </div>
      </div>
    </div>
  );
}
