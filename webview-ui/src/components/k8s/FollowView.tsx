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
import { ButtonView, CheckboxView, PopoverView, TextInputView, ProgressBarView, IconSize } from '@salilvnair/dui';
import {
  ChevronLeftIcon, CloseIcon, PlusIcon, ColumnsIcon, DownloadIcon, SparkleIcon, SearchIcon, SaveIcon, ClockIcon,
} from '../../icons';
import { useResultTabStore } from '../../store/dk8s-result-tab-store';
import { useTaggedSearchStore } from '../../store/dk8s-tagged-search-store';
import { useK8sStore } from '../../store/k8s-store';
import { useSplitStore, MAX_PANES } from '../../store/dk8s-split-store';
import { useTabsStore } from '../../store/tabs-store';
import { useCatalogue } from '../../store/dk8s-logger-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { LogViewer } from './LogViewer';
import { LogSourceProvider } from './log-source';
import { resultLines, type ResultLine } from './search-results';
import { formatLogTime } from './log-view';
import { logLineSettings } from './log-settings';
import {
  follows, followQuery, podCounts, touched, arrange, cameFrom, nextWidth, widthLabel, type Condition,
} from './follow';
import { readFields } from './field-readers';
import { useFieldReaders, saveView } from './follow-prefs';
import { replicaHue, podTail } from './pod-hue';
import { snapshotSource, standIn, useSnapshotView } from './snapshot-source';
import { asPodSummaries } from './searched-pods';
import { openWith } from '../ai/ai-chat-actions';
import { ACCENT, AI as AI_ACCENT } from './tone';
import { templateParts } from './logger-pattern';

const label: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--color-text-muted)',
};

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

function ConditionChip({ c, onToggle, onDrop }: { c: Condition; onToggle: () => void; onDrop: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0"
          style={{
            height: 24, padding: '0 3px 0 8px', borderRadius: 999, fontSize: 11.5,
            background: c.on ? `color-mix(in srgb, ${ACCENT} 16%, transparent)` : 'transparent',
            border: c.on ? '1px solid transparent' : '1px dashed var(--color-surface-border)',
            color: c.on ? ACCENT : 'var(--color-text-secondary)',
          }}>
      <CheckboxView checked={c.on} onChange={onToggle} size="sm" accentColor={ACCENT}
                    aria-label={c.on ? 'Stop applying this condition' : 'Apply this condition'} />
      <span style={{ opacity: 0.8 }}>{c.field} =</span>
      <span className="font-mono truncate" style={{ maxWidth: 220 }} title={c.value}>{c.value}</span>
      <button type="button" onClick={onDrop} aria-label="Drop this condition" title="Drop this condition"
              className="inline-flex items-center justify-center rounded-full cursor-pointer border-none"
              style={{ width: 17, height: 17, background: `color-mix(in srgb, ${ACCENT} 22%, transparent)`, color: ACCENT }}>
        <CloseIcon size={9} />
      </button>
    </span>
  );
}

function AddCondition({ suggestions, onAdd }: {
  suggestions: { field: string; value: string; n: number }[];
  onAdd: (c: { field: string; value: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState('');
  const [value, setValue] = useState('');
  const anchor = useRef<HTMLSpanElement>(null);
  const add = (c: { field: string; value: string }) => { onAdd(c); setOpen(false); setField(''); setValue(''); };
  return (
    <span ref={anchor}>
      <ButtonView size="sm" variant="secondary" accentColor={ACCENT} iconLeft={<PlusIcon size={IconSize.chip} />}
                  onClick={() => setOpen(o => !o)}>
        condition
      </ButtonView>
      <PopoverView open={open} onClose={() => setOpen(false)} anchorEl={anchor.current} placement="bottom" borderRadius={10}>
        <div className="flex flex-col gap-2 p-3" style={{ width: 320 }}>
          {suggestions.length > 0 && (
            <>
              <div style={label}>carried by these lines</div>
              <div className="flex flex-col gap-1" style={{ maxHeight: 200, overflowY: 'auto' }}>
                {suggestions.map(s => (
                  <button key={`${s.field}=${s.value}`} type="button" onClick={() => add(s)}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer border-none bg-transparent text-left hover:bg-[var(--color-surface-hover)]">
                    <span className="text-[11.5px] flex-1" style={{ color: 'var(--color-text-primary)' }}>{s.field}</span>
                    <span className="font-mono text-[11px] truncate" style={{ maxWidth: 140, color: 'var(--color-warning-text, #ce9178)' }}>{s.value}</span>
                    <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>{s.n}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <div style={label}>or name one</div>
          <div className="flex items-center gap-1.5">
            <TextInputView value={field} placeholder="field" onChange={e => setField(e.target.value)} size="sm" />
            <span style={{ color: 'var(--color-text-muted)' }}>=</span>
            <TextInputView value={value} placeholder="value" onChange={e => setValue(e.target.value)} size="sm" />
          </div>
          <div className="flex justify-end">
            <ButtonView size="sm" variant="secondary" accentColor={ACCENT} color={ACCENT}
                        disabled={!field.trim() || !value.trim()}
                        onClick={() => add({ field: field.trim(), value: value.trim() })}>
              Add
            </ButtonView>
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
    <span ref={anchor}>
      <ButtonView size="sm" variant="secondary" accentColor={ACCENT} iconLeft={<SaveIcon size={IconSize.chip} />}
                  onClick={() => setOpen(o => !o)}>
        Save as view
      </ButtonView>
      <PopoverView open={open} onClose={() => setOpen(false)} anchorEl={anchor.current} placement="bottom" borderRadius={10}>
        <div className="flex flex-col gap-2 p-3" style={{ width: 280 }}>
          <div className="text-[11.5px]" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Kept with the result&rsquo;s other saved follows — the conditions, the pods and the window.
          </div>
          <TextInputView value={name} placeholder="What this follow is" onChange={e => setName(e.target.value)} size="sm" />
          <div className="flex justify-end">
            <ButtonView size="sm" variant="secondary" accentColor={ACCENT} color={ACCENT} disabled={!name.trim()}
                        onClick={() => { onSave(name.trim()); setOpen(false); setName(''); }}>
              Save
            </ButtonView>
          </div>
        </div>
      </PopoverView>
    </span>
  );
}

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
  const runKey = follow ? `${q}|${follow.width}|${follow.onlyPod}|${follow.anchor.ts}` : '';
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
    });
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
  /* A pod that could not be read is not a pod with nothing on it — said apart, with kubectl's reason. */
  const errors = useMemo(() => new Map((search?.groups ?? []).filter(g => g.result.error).map(g => [g.result.pod, g.result.error!])),
    [search]);
  const from = useMemo(() => (follow ? cameFrom(lines, follow.anchor) : -1), [lines, follow]);
  const also = useMemo(() => (follow ? touched(lines, follow.conds, l => readFields(l, readers)) : []), [lines, follow, readers]);

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
    },
  });

  const nextW = nextWidth(follow.width);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── The question: conditions, window ── */}
      <div className="flex items-center gap-2 px-3.5 py-2 shrink-0 flex-wrap"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <ButtonView size="sm" variant="secondary" accentColor={ACCENT} title="Back to the hits" aria-label="Back to the hits"
                    iconLeft={<ChevronLeftIcon size={IconSize.action} />}
                    onClick={() => { drop(follow.tag); setFollow(undefined); }} />
        {conds.map((c, i) => (
          <span key={`${c.field}=${c.value}`} className="inline-flex items-center gap-2">
            {i > 0 && <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>AND</span>}
            <ConditionChip
              c={c}
              onToggle={() => setConds(conds.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
              onDrop={() => (conds.length === 1 ? setFollow(undefined) : setConds(conds.filter((_, j) => j !== i)))}
            />
          </span>
        ))}
        <AddCondition suggestions={also} onAdd={t => swapOrAdd(t, true)} />
        <div className="flex-1" />
        {anchorTime && (
          <span className="inline-flex items-center gap-1.5 px-2.5 text-[11.5px] rounded-md"
                style={{ height: 24, border: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
            <ClockIcon size={IconSize.chip} /> {widthLabel(follow.width)} around {anchorTime}
          </span>
        )}
        {anchorTime && (
          <ButtonView size="sm" variant="secondary" accentColor={ACCENT} disabled={!nextW}
                      title={nextW ? `Read ${widthLabel(nextW)} around the line instead` : 'Already the widest window'}
                      onClick={() => nextW && patchFollow({ width: nextW })}>
            Widen
          </ButtonView>
        )}
        <SaveAsView onSave={save} />
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          {/* ── How many, where ── */}
          <div className="flex items-center gap-3.5 px-3.5 py-2 shrink-0 flex-wrap text-[11.5px]"
               style={{ borderBottom: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
            <span style={{ color: 'var(--color-text-primary)' }}>
              {running && !lines.length ? 'Reading…' : `${lines.length.toLocaleString()} line${lines.length === 1 ? '' : 's'}`}
            </span>
            {counts.map(c => {
              const err = errors.get(c.pod);
              return (
                <span key={c.pod} className="inline-flex items-center gap-1.5" style={{ opacity: c.n || err ? 1 : 0.55 }}
                      title={err ? `${c.pod} could not be read: ${err}` : c.pod}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: replicaHue(c.pod, podNames) }} />
                  <span className="font-mono">{c.pod}</span> · {err
                    ? <span style={{ color: 'var(--color-warning)' }}>not read</span>
                    : c.n}
                </span>
              );
            })}
            <div className="flex-1" />
            <CheckboxView label="One timeline" checked={follow.oneTimeline} size="sm" accentColor={ACCENT}
                          onChange={v => patchFollow({ oneTimeline: v })} />
            <CheckboxView label={threadFollowed ? 'Only this thread’s pod' : 'Only the pod you came from'}
                          checked={follow.onlyPod} size="sm" accentColor={ACCENT}
                          onChange={v => patchFollow({ onlyPod: v })} />
          </div>

          <div className="flex-1 min-h-0">
            {running && !lines.length ? (
              <ReadingPods
                title="Following"
                detail={<>Reading {pods.length} pod{pods.length === 1 ? '' : 's'} for <span className="font-mono" style={{ color: 'var(--color-dk8s)' }}>{q}</span>
                  {anchorTime ? <> within {widthLabel(follow.width)} of {anchorTime}</> : null}</>}
                done={search?.progress.done ?? 0} total={search?.progress.total ?? pods.length}
              />
            ) : !lines.length && errors.size && errors.size >= pods.length ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 px-8 text-center">
                <span className="text-[13px]" style={{ color: 'var(--color-text-primary)' }}>
                  {pods.length === 1 ? 'The pod could not be read' : `None of the ${pods.length} pods could be read`}
                </span>
                <div className="flex flex-col gap-1 text-[11.5px] font-mono max-w-[640px] text-left" style={{ color: 'var(--color-warning)' }}>
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
                  <ButtonView size="sm" variant="secondary" accentColor={ACCENT} color={ACCENT} onClick={() => patchFollow({ width: nextW })}>
                    Widen to {widthLabel(nextW)}
                  </ButtonView>
                )}
              </div>
            ) : (
              <LogSourceProvider value={source}>
                <LogViewer />
              </LogSourceProvider>
            )}
          </div>

          <div className="flex items-center gap-2.5 px-3.5 shrink-0 text-[11.5px]"
               style={{ height: 38, borderTop: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
            <span>The same thread name can be reused by another pod &mdash; the pod column is always shown for that reason.</span>
            <div className="flex-1" />
            {pods.length > 1 && (
              <ButtonView size="sm" variant="secondary" accentColor={ACCENT} color={ACCENT}
                          iconLeft={<ColumnsIcon size={IconSize.action} />} onClick={openInSplit}>
                Open the {Math.min(MAX_PANES.grid, counts.filter(c => c.n).length || pods.length)} pods in a split
              </ButtonView>
            )}
          </div>
        </div>

        {/* ── Why, and what next ── */}
        <div className="flex flex-col min-h-0 shrink-0"
             style={{ width: 300, borderLeft: '1px solid var(--color-surface-border)', background: 'var(--color-panel, var(--color-surface))' }}>
          <div className="flex-1 min-h-0 overflow-auto">
            <div className="px-3.5 pt-3 pb-1 text-[12.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Why these lines</div>
            <div className="px-3.5 pb-3 text-[11.5px]" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
              {origins.length ? (
                <>
                  Every one of them carries{' '}
                  {origins.map(({ c, where }, i) => (
                    <span key={c.field}>
                      {i > 0 && ' and '}
                      <span className="font-mono" style={{ color: ACCENT }}>{c.field}={c.value}</span> in {where}
                    </span>
                  ))}
                  . Nothing was inferred and no model was asked.
                  {threadFollowed && anchorTime && (
                    <> A thread name is only unique inside one pod and only until it goes back to the pool, so this is pinned
                      to {widthLabel(follow.width)} around the line you came from.</>
                  )}
                </>
              ) : 'Every condition is off.'}
            </div>

            <div className="px-3.5 pb-3">
              <div className="mb-2" style={label}>what else {threadFollowed ? 'this thread' : 'these lines'} touched</div>
              {also.length ? (
                <div className="flex flex-col gap-1">
                  {also.map(t => (
                    <button key={`${t.field}=${t.value}`} type="button"
                            onClick={e => swapOrAdd(t, e.shiftKey)}
                            title={`Follow ${t.field} = ${t.value} instead · Shift-click to add it`}
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer text-left bg-transparent"
                            style={{ border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)' }}>
                      <span className="flex-1 text-[11.5px] truncate">{t.field}</span>
                      <span className="font-mono text-[11px] truncate" style={{ maxWidth: 120, color: 'var(--color-warning-text, #ce9178)' }}>{t.value}</span>
                      <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>{t.n}</span>
                    </button>
                  ))}
                  <div className="text-[10.5px] mt-1" style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                    Click one to swap the condition, Shift-click to add it.
                  </div>
                </div>
              ) : (
                <div className="text-[11px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                  {lines.length ? 'These lines carry nothing else to follow.' : 'Once lines come back, the other ids they carry are listed here.'}
                </div>
              )}
            </div>

            <div className="px-3.5 py-3" style={{ borderTop: '1px solid var(--color-surface-border)' }}>
              <div className="mb-2" style={label}>when it is not in the MDC</div>
              <div className="text-[11.5px]" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
                A value that only appears inside the message is still followable &mdash; the logger&rsquo;s pattern names the
                hole it sits in
                {example ? (
                  <>, so{' '}
                    <span className="font-mono" style={{ color: ACCENT }}>
                      {templateParts(example.template).map((p, i) => (p.hole ? <span key={i}>{'{}'}</span> : <span key={i}>{p.text}</span>))}
                    </span>
                    {' '}gives {example.holes.length === 1 ? 'a field called ' : 'fields called '}
                    <span style={{ color: ACCENT }}>{example.holes.join(', ')}</span> and the same Follow works on it.</>
                ) : (
                  <>. Add the logger&rsquo;s calls in the Loggers tab, or name a field on the Fields page, and the value in each
                    {' {}'} becomes a field this works on.</>
                )}
              </div>
              <div className="mt-2">
                <ButtonView size="xs" variant="secondary" accentColor={ACCENT}
                            onClick={() => useTabsStore.getState().openSettingsTab('dk8s-fields')}>
                  Edit how fields are read
                </ButtonView>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3.5 py-2.5 shrink-0" style={{ borderTop: '1px solid var(--color-surface-border)' }}>
            <span className="flex-1 min-w-0"><ButtonView size="sm" variant="secondary" accentColor={ACCENT} width="fullWidth" disabled={!lines.length}
                        iconLeft={<DownloadIcon size={IconSize.action} />} onClick={exportThese}>
              Export these lines
            </ButtonView></span>
            <span className="flex-1 min-w-0"><ButtonView size="sm" variant="secondary" accentColor={AI_ACCENT} color={AI_ACCENT} width="fullWidth" disabled={!lines.length}
                        iconLeft={<SparkleIcon size={IconSize.action} />} onClick={askAi}>
              Ask the AI tab
            </ButtonView></span>
          </div>
        </div>
      </div>
    </div>
  );
}
