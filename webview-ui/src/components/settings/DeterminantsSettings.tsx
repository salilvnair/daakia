/**
 * Settings → DK8S → Determinants.
 *
 * A determinant is a question you keep asking a log: which APIs were called,
 * what went out to another service, what retried. This page is where it is
 * written down once — so every window you open answers it, and every teammate
 * who imports a workspace you share answers it too.
 *
 * ── It is the catalogue, seen from one side ──
 *
 * Nothing here is stored anywhere new. A determinant is a catalogue pattern
 * with a `summary` (see `determinants.ts`), so one written here shows up in a
 * pod's Loggers tab and one summarised from the Loggers tab shows up here. The
 * page lists the patterns that summarise, and its builder writes the same two
 * things the Loggers tab does: a pattern, and a summary on it.
 *
 * ── The preview is honest about what it read ──
 *
 * "How it will read" runs the draft over the last forty minutes of the lines
 * the open pod's log already holds — the same lines on screen in its Logs tab.
 * It never asks the cluster for more: a settings page that quietly reads a
 * hundred thousand lines from production to fill a table is not one anybody
 * expects. With no pod open it says so, rather than showing an empty table
 * that reads like "this never matches".
 */
import { useEffect, useMemo, useState } from 'react';
import {
  BadgeChipView, ButtonView, CheckboxView, FilterInputView, MultilineInputView,
  SegmentedControlView, SelectInputView, TextInputView,
} from '@salilvnair/dui';
import {
  useCatalogue, addPattern, setSummary, updatePattern, type CataloguePattern,
} from '../../store/dk8s-logger-store';
import {
  useTeamDeterminants, isTeamOn, setTeamOn, type TeamDeterminant,
} from '../../store/dk8s-team-store';
import {
  determinantsIn, describeSpec, determinantName, holeSpread, numericHoles,
  podScope, previewWindow, scopeLabel, summarise, type SummaryShow,
} from '../k8s/determinants';
import { fromLoggerCall, fromLogLine, fromRegex, templateParts } from '../k8s/logger-pattern';
import { formatLogTime } from '../k8s/log-view';
import { useK8sStore, type LogLine, type PodSummary } from '../../store/k8s-store';
import { scopeOf } from '../k8s/LoggersTab';
import { SummaryTable, Strip } from '../k8s/SummaryPanel';
import { ChartBarIcon } from '../../icons';
import {
  emptyDraft, draftFrom, withPattern, specOf, draftAsPattern, saveBlocker,
  type Draft, type DraftMode,
} from './determinant-draft';
import { useDeterminantFocus } from './determinant-nav';

const ACCENT = 'var(--color-dk8s)';
/** The field chips' colour: the one the Loggers tab gives a hole. */
const FIELD_TONE = 'var(--color-protocol-ai, #a78bfa)';
/** How far back the preview reads, from the newest line held. */
const PREVIEW_MINUTES = 40;
/** A hole with more values than this makes a list, not a summary. */
const SCATTERED = 20;

const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-surface-border)',
  maxWidth: '100%',
};

export function DeterminantsSettings() {
  const catalogue = useCatalogue();
  const mine = useMemo(() => determinantsIn(catalogue.patterns), [catalogue]);
  /* Loggers somebody has catalogued but never asked a question of — the
     quickest start, since the pattern is already written. */
  const plain = useMemo(
    () => catalogue.patterns.filter(p => !p.summary || p.summary.groupBy.length === 0),
    [catalogue],
  );
  const { all: team, off: teamOff } = useTeamDeterminants();
  /* The open pod's lines — what its Logs tab's default source hands the view
     (see `log-source.tsx`). By selector rather than through `useLogSource`,
     which outside a provider subscribes to the whole store and would redraw
     this page on every line a followed pod writes. */
  const logs = useK8sStore(s => s.logs);
  const detail = useK8sStore(s => s.detail);

  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [highlight, setHighlight] = useState<string | undefined>();

  /* A link from elsewhere — the Window's rail, a summary's Edit — names the
     determinant to open. Read once, then cleared, so coming back to the page
     later lands on the list rather than on whatever was linked last week. */
  const focusId = useDeterminantFocus(s => s.focusId);
  useEffect(() => {
    if (!focusId) return;
    const own = catalogue.patterns.find(p => p.id === focusId);
    if (own) setDraft(draftFrom(own));
    setHighlight(focusId);
    useDeterminantFocus.getState().setFocus(undefined);
  }, [focusId, catalogue]);

  const edit = (p: CataloguePattern) => { setDraft(draftFrom(p)); setHighlight(p.id); };

  return (
    <div className="flex flex-col gap-6 px-5 py-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[15px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          Log determinants
        </h2>
        <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)', maxWidth: '110ch' }}>
          A determinant is a question you keep asking a log: which APIs were called, what went out to
          another service, what retried. Save it once and every window you open answers it &mdash; counted
          from the lines themselves, not from a model.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <SectionRule label="yours" />
        {mine.length === 0 ? (
          <div className="px-4 py-3.5 rounded-lg text-[11.5px] leading-relaxed" style={{ ...cardStyle, color: 'var(--color-text-muted)' }}>
            None yet. Write the first one below &mdash; an access log is the usual start: paste the call that
            writes it, and group it by method and path.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {mine.map(p => (
              <MineRow key={p.id} pattern={p} active={highlight === p.id || draft.id === p.id} onEdit={() => edit(p)} />
            ))}
          </div>
        )}
      </div>

      {team.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionRule label="from your team" />
          <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)', maxWidth: '110ch' }}>
            These came with workspaces teammates share through Git Sync. They answer like yours; the
            switch turns one off for you only, and a copy is yours to change.
          </span>
          <div className="flex flex-col gap-2">
            {team.map(d => (
              <TeamRow key={d.pattern.id} determinant={d} on={isTeamOn(d, teamOff)} active={highlight === d.pattern.id}
                       onCopy={() => copyToMine(d, setDraft)} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <SectionRule label={draft.id ? 'editing' : 'a new determinant'} />
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
          <Builder draft={draft} setDraft={setDraft} plain={plain} logs={logs} detail={detail}
                   saved={draft.id ? catalogue.patterns.find(p => p.id === draft.id) : undefined}
                   onDone={() => { setDraft(emptyDraft()); setHighlight(undefined); }} />
          <Preview draft={draft} setDraft={setDraft} logs={logs} podName={detail?.name} />
        </div>
      </div>

      <div className="flex flex-col gap-1 px-3 py-2.5 rounded-md text-[11.5px] leading-relaxed"
           style={{ ...cardStyle, color: 'var(--color-text-secondary)' }}>
        <span>
          Determinants are shared with the workspace, the way collections are. Every workspace you share
          through Git Sync carries them, so a tester who imports it opens a pod and already has the
          team&rsquo;s questions. They are read on this machine, from lines already fetched.
        </span>
      </div>
    </div>
  );
}

/**
 * A teammate's determinant, copied into your catalogue and opened to change.
 *
 * If you already have that pattern under that scope — `addPattern` hands back
 * the one you have — yours is opened as it is. Copying theirs over it would
 * quietly replace a question you had already shaped with somebody else's.
 */
function copyToMine(d: TeamDeterminant, setDraft: (d: Draft) => void): void {
  const { scope, summary } = d.pattern;
  const entry = addPattern({
    template: d.pattern.template, holes: d.pattern.holes, logger: d.pattern.logger,
    level: d.pattern.level, source: d.pattern.source, regex: d.pattern.regex,
  }, scope);
  const kept = entry.summary && entry.summary.groupBy.length > 0 ? entry.summary : summary;
  if (kept === summary) setSummary(entry.id, { ...summary!, off: undefined });
  setDraft(draftFrom({ ...entry, summary: kept }));
}

// ── The list ────────────────────────────────────────────────────────────────

function MineRow({ pattern, active, onEdit }: { pattern: CataloguePattern; active: boolean; onEdit: () => void }) {
  const spec = pattern.summary!;
  const on = !spec.off;
  return (
    <Row active={active} dim={!on}
         toggle={<CheckboxView checked={on} size="sm" accentColor={ACCENT}
                               onChange={v => setSummary(pattern.id, { ...spec, off: !v })} />}
         name={determinantName(pattern)} sub={scopeLabel(pattern.scope)}
         pattern={pattern}
         action={<ButtonView variant="secondary" size="xs" accentColor={ACCENT} onClick={onEdit}>Edit</ButtonView>} />
  );
}

function TeamRow({ determinant, on, active, onCopy }: {
  determinant: TeamDeterminant; on: boolean; active: boolean; onCopy: () => void;
}) {
  const { pattern, source } = determinant;
  const authorOff = !!pattern.summary?.off;
  return (
    <Row active={active} dim={!on}
         toggle={<CheckboxView checked={on} disabled={authorOff} size="sm" accentColor={ACCENT}
                               onChange={v => setTeamOn(pattern.id, v)} />}
         name={determinantName(pattern)}
         sub={`${scopeLabel(pattern.scope)} · from ${source.ownerName}${authorOff ? ' · off by its author' : ''}`}
         pattern={pattern}
         action={<ButtonView variant="secondary" size="xs" accentColor={ACCENT} onClick={onCopy}
                             title={`A copy in your own catalogue, to change. ${source.ownerName}'s stays as it is, in ${source.workspaceName}.`}>
           Keep a copy
         </ButtonView>} />
  );
}

function Row({ active, dim, toggle, name, sub, pattern, action }: {
  active: boolean; dim: boolean; toggle: React.ReactNode; name: string; sub: string;
  pattern: CataloguePattern; action: React.ReactNode;
}) {
  const spec = pattern.summary!;
  const { grouping, answer } = describeSpec(spec);
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg"
         style={{
           ...cardStyle,
           borderColor: active ? `color-mix(in srgb, ${ACCENT} 55%, var(--color-surface-border))` : undefined,
           background: active ? `color-mix(in srgb, ${ACCENT} 6%, var(--color-surface))` : cardStyle.background,
           opacity: dim ? 0.65 : 1,
         }}>
      {toggle}
      <div className="flex flex-col shrink-0" style={{ width: 170 }}>
        <span className="text-[12.5px] truncate" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }} title={name}>
          {name}
        </span>
        <span className="text-[10.5px] truncate" style={{ color: 'var(--color-text-muted)' }} title={sub}>{sub}</span>
      </div>
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <PatternLine pattern={pattern} />
        {pattern.holes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pattern.holes.map(h => (
              <BadgeChipView key={h} tone={FIELD_TONE} size="xs">{h}</BadgeChipView>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col shrink-0 text-[11px] leading-normal" style={{ width: 170, color: 'var(--color-text-muted)' }}>
        <span className="truncate">grouped by <span style={{ color: 'var(--color-text-primary)' }}>{grouping}</span></span>
        <span className="truncate" title={answer}>{answer}</span>
      </div>
      {action}
    </div>
  );
}

/** `c.d.a.ApiAccessLogger — "{} {} → {} in {}ms"`, holes named and coloured. */
function PatternLine({ pattern }: { pattern: { template: string; logger?: string; regex?: string } }) {
  return (
    <div className="text-[11px] font-mono truncate" style={{ color: 'var(--color-text-secondary)' }}
         title={pattern.logger ? `${pattern.logger} — ${pattern.template}` : pattern.template}>
      {pattern.logger && <span style={{ color: 'var(--color-text-muted)' }}>{pattern.logger} &mdash; </span>}
      {pattern.regex !== undefined
        ? <span>/{pattern.regex}/</span>
        : templateParts(pattern.template).map((part, i) => (
          part.hole
            ? <span key={i} style={{ color: ACCENT }}>{`{${part.text}}`}</span>
            : <span key={i}>{part.text}</span>
        ))}
    </div>
  );
}

// ── The builder ─────────────────────────────────────────────────────────────

type OpenLines = LogLine[];
type OpenPod = PodSummary | undefined;

const MODES: { value: DraftMode; label: string }[] = [
  { value: 'paste', label: 'Paste the logger call' },
  { value: 'line', label: 'Pick a line in the log' },
  { value: 'regex', label: 'Write a regex' },
];

function Builder({ draft, setDraft, saved, plain, logs, detail, onDone }: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  /** The catalogue's copy of what is being edited, as it is now. */
  saved?: CataloguePattern;
  plain: CataloguePattern[];
  logs: OpenLines;
  detail: OpenPod;
  onDone: () => void;
}) {
  const held = useMemo(() => previewWindow(logs, PREVIEW_MINUTES), [logs]);
  const spread = useMemo(() => {
    const p = draftAsPattern(draft);
    return p ? holeSpread(held.lines, p) : {};
  }, [draft, held]);
  const [confirmStop, setConfirmStop] = useState(false);

  /*
    Where it applies, in the words the list uses. The workload and the pod are
    only offered with a pod open — they are that pod's — and a scope the draft
    already has is always offered, so editing never quietly moves a question.
  */
  const scopes = useMemo(() => {
    const out = [{ value: '*', label: 'Every workload' }];
    if (detail) {
      const workload = scopeOf(detail);
      out.push({ value: workload, label: capital(scopeLabel(workload)) });
      out.push({ value: podScope(detail), label: 'This pod' });
    }
    if (!out.some(o => o.value === draft.scope)) out.push({ value: draft.scope, label: capital(scopeLabel(draft.scope)) });
    return out;
  }, [detail, draft.scope]);

  const onPaste = (text: string) => {
    const parsed = text.trim() ? fromLoggerCall(text) : undefined;
    const next = { ...draft, paste: text };
    setDraft(text.trim()
      ? withPattern(next, parsed, parsed ? undefined : 'That is not a logger call dk8s can read. Paste the whole call, from log. to the closing bracket.')
      : { ...next, error: undefined });
  };
  const onRegex = (text: string) => {
    const read = fromRegex(text);
    const next = { ...draft, regex: text };
    setDraft('error' in read ? { ...next, error: text.trim() ? read.error : undefined } : withPattern(next, read));
  };
  const onPick = (seq: number) => {
    const line = logs.find(l => l.seq === seq);
    if (!line) return;
    setDraft(withPattern({ ...draft, pickedSeq: seq }, fromLogLine(line.message ?? line.text)));
  };

  const toggleHole = (hole: string) => setDraft({
    ...draft,
    groupBy: draft.groupBy.includes(hole) ? draft.groupBy.filter(h => h !== hole) : [...draft.groupBy, hole],
  });

  const blocker = saveBlocker(draft);
  const save = () => {
    if (blocker || !draft.pattern) return;
    const spec = specOf(draft);
    if (draft.id) {
      updatePattern(draft.id, { ...draft.pattern, scope: draft.scope });
      /* Keep the switch where it was: editing a question is not turning it on. */
      setSummary(draft.id, { ...spec, off: saved?.summary?.off || undefined });
    } else {
      const entry = addPattern(draft.pattern, draft.scope);
      setSummary(entry.id, spec);
    }
    onDone();
  };

  const scattered = draft.pattern?.holes.filter(h => (spread[h] ?? 0) > SCATTERED) ?? [];
  const scatteredOff = scattered.filter(h => !draft.groupBy.includes(h));
  const scatteredOn = scattered.filter(h => draft.groupBy.includes(h));

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 rounded-lg" style={cardStyle}>
      <div className="flex items-start gap-3">
        <span style={{ color: ACCENT, marginTop: 2, flexShrink: 0, display: 'inline-flex' }}><ChartBarIcon size={15} /></span>
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            {draft.id ? `Editing ${draft.name.trim() || 'a determinant'}` : 'A new determinant'}
          </span>
          <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Paste the line the app writes, or the call that writes it. The holes become the fields.
          </span>
        </div>
      </div>

      <div className="flex gap-2.5 items-end flex-wrap">
        <label className="flex flex-col gap-1 flex-1" style={{ minWidth: 180 }}>
          <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Call it</span>
          <TextInputView size="sm" accentColor={ACCENT} value={draft.name} placeholder="Cache hits and misses"
                         onChange={e => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1" style={{ width: 190 }}>
          <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Where it applies</span>
          <SelectInputView size="sm" accentColor={ACCENT} value={draft.scope} options={scopes}
                           onChange={v => setDraft({ ...draft, scope: v })} />
        </label>
      </div>
      {!detail && (
        <span className="text-[10.5px] -mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
          Open a pod first to scope a determinant to its workload, or to that pod alone.
        </span>
      )}

      {!draft.id && plain.length > 0 && (
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Or start from a logger you catalogued</span>
          <SelectInputView size="sm" accentColor={ACCENT} value="" placeholder="Pick one"
                           options={plain.map(p => ({ value: p.id, label: p.logger ? `${p.logger} — ${p.template}` : p.template }))}
                           onChange={id => {
                             const p = plain.find(x => x.id === id);
                             if (p) setDraft({ ...draftFrom(p), show: emptyDraft().show });
                           }} />
        </div>
      )}

      <SegmentedControlView size="sm" fullWidth accentColor={ACCENT} value={draft.mode} options={MODES}
                            onChange={v => setDraft({ ...draft, mode: v as DraftMode })} />

      {draft.mode === 'paste' && (
        <MultilineInputView size="sm" rows={2} accentColor={ACCENT} value={draft.paste} spellCheck={false}
                            placeholder={'log.debug("cache {} for key {} in {}ms", outcome, key, took);'}
                            style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5 }}
                            onChange={e => onPaste(e.target.value)} />
      )}
      {draft.mode === 'regex' && (
        <TextInputView size="sm" accentColor={ACCENT} value={draft.regex} spellCheck={false}
                       placeholder={'cache (?<outcome>hit|miss) for key (?<key>\\S+) in (?<took>\\d+)ms'}
                       inputStyle={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5 }}
                       onChange={e => onRegex(e.target.value)} />
      )}
      {draft.mode === 'line' && (
        <LinePicker logs={logs} podName={detail?.name} picked={draft.pickedSeq} onPick={onPick} />
      )}

      {draft.error && (
        <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>{draft.error}</span>
      )}

      {draft.pattern && (
        <div className="flex flex-col gap-1">
          <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
            {draft.id && !draft.paste && !draft.regex && draft.pickedSeq === undefined
              ? 'The saved pattern. Paste, pick or write another to replace it.'
              : 'Reads as'}
          </span>
          <div className="px-2.5 py-1.5 rounded-md" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-surface-border)' }}>
            <PatternLine pattern={draft.pattern} />
          </div>
        </div>
      )}

      {draft.pattern && draft.pattern.holes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            group by
          </span>
          <div className="flex flex-wrap gap-1.5">
            {draft.pattern.holes.map(hole => {
              const on = draft.groupBy.includes(hole);
              const values = spread[hole];
              return (
                <span key={hole}
                      className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-0.5 rounded-full text-[11px] font-mono"
                      title={values === undefined
                        ? 'Nothing in the preview has filled it yet'
                        : `${values} different value${values === 1 ? '' : 's'} in the preview`}
                      style={{
                        border: `1px solid ${on ? ACCENT : 'var(--color-surface-border)'}`,
                        background: on ? `color-mix(in srgb, ${ACCENT} 9%, transparent)` : 'transparent',
                        color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      }}>
                  {/* The box and the name beside it, not the pill around both:
                      a click on the box would otherwise toggle twice, once for
                      the box and once for the pill it bubbled to. */}
                  <CheckboxView checked={on} size="sm" accentColor={ACCENT} onChange={() => toggleHole(hole)} />
                  <span className="cursor-pointer" onClick={() => toggleHole(hole)}>
                    {hole}
                    {values !== undefined && <span style={{ opacity: 0.6 }}> &middot; {values}</span>}
                  </span>
                </span>
              );
            })}
          </div>
          {scatteredOff.length > 0 && (
            <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              <span className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>{scatteredOff.join(', ')}</span>{' '}
              {scatteredOff.length === 1 ? 'is' : 'are'} off: a value that is different on every line makes a group
              per line, which is a list, not a summary.
            </span>
          )}
          {scatteredOn.length > 0 && (
            <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-warning)' }}>
              <span className="font-mono">{scatteredOn.join(', ')}</span> is different on nearly every line, so the
              summary will have a row per line &mdash; the log again, not a summary of it.
            </span>
          )}
        </div>
      )}

      <span className="flex-1" />
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <MatchLine draft={draft} held={held} podName={detail?.name} blocker={blocker} />
        <span className="flex-1" />
        {draft.id && (
          <ButtonView variant="secondary" size="sm" accentColor={ACCENT}
                      color={confirmStop ? 'var(--color-warning)' : undefined}
                      title="The logger stays in the catalogue, and in the Loggers tab; it just stops being summarised."
                      onClick={() => {
                        if (!confirmStop) { setConfirmStop(true); setTimeout(() => setConfirmStop(false), 3000); return; }
                        setConfirmStop(false);
                        setSummary(draft.id!, undefined);
                        onDone();
                      }}>
            {confirmStop ? 'Click again to stop' : 'Stop summarising'}
          </ButtonView>
        )}
        {(draft.id || draft.pattern || draft.name) && (
          <ButtonView variant="secondary" size="sm" accentColor={ACCENT} onClick={onDone}>
            {draft.id ? 'Cancel' : 'Clear'}
          </ButtonView>
        )}
        <ButtonView variant="primary" size="sm" accentColor={ACCENT} disabled={!!blocker} title={blocker} onClick={save}>
          {draft.id ? 'Save changes' : 'Save it'}
        </ButtonView>
      </div>
    </div>
  );
}

/**
 * "Matches 1,908 lines on payments-7d9f2 · 2 outcomes."
 *
 * The one-line answer to "is this pattern right", before anybody looks at the
 * table. Green when it matched, amber when it did not, and plain about why
 * when there was nothing to match against.
 */
function MatchLine({ draft, held, podName, blocker }: {
  draft: Draft; held: ReturnType<typeof previewWindow>; podName?: string; blocker?: string;
}) {
  const pattern = draftAsPattern(draft);
  const result = useMemo(() => {
    if (!pattern || !pattern.holes.length) return undefined;
    /* Grouped by every hole when none is ticked yet, so the count of matching
       lines is there from the first paste — before any grouping is chosen. */
    const probe = draft.groupBy.length ? pattern : { ...pattern, summary: { ...pattern.summary!, groupBy: pattern.holes.slice(0, 1) } };
    return summarise(held.lines, [probe])[0];
  }, [pattern, held, draft.groupBy.length]);

  if (!pattern) return <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{blocker}</span>;
  if (!held.lines.length) {
    return <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>No pod log is open to check it against.</span>;
  }
  if (!result) return <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>{blocker}</span>;
  const matched = result.rows.reduce((n, r) => n + r.count, 0) + result.ungrouped;
  if (!matched) {
    return (
      <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
        Matches nothing in the last {PREVIEW_MINUTES} minutes{podName ? ` on ${podName}` : ''}.
      </span>
    );
  }
  const groups = draft.groupBy.length ? result.rows.length : undefined;
  return (
    <span className="text-[11px]" style={{ color: 'var(--color-success)' }}>
      Matches {matched.toLocaleString()} line{matched === 1 ? '' : 's'}{podName ? ` on ${podName}` : ''}
      {groups !== undefined && ` · ${groups} ${draft.groupBy.join(' + ')} value${groups === 1 ? '' : 's'}`}
    </span>
  );
}

/**
 * Pick the line instead of the call — for when there is no source to paste.
 *
 * The open pod's lines, newest first, narrowed by a filter. Every value-shaped
 * token of the picked line becomes a hole (`fromLogLine`), which is a guess
 * and is shown as one: the pattern appears under the list before anything is
 * saved.
 */
function LinePicker({ logs, podName, picked, onPick }: {
  logs: OpenLines; podName?: string; picked?: number; onPick: (seq: number) => void;
}) {
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const out: OpenLines = [];
    for (let i = logs.length - 1; i >= 0 && out.length < 60; i--) {
      const l = logs[i];
      if (l.continuation) continue;
      if (q && !(l.message ?? l.text).toLowerCase().includes(q)) continue;
      out.push(l);
    }
    return out;
  }, [logs, filter]);

  if (!logs.length) {
    return (
      <span className="text-[11.5px] leading-relaxed px-3 py-2.5 rounded-md"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
        No pod log is open, so there is no line to pick. Open a pod&rsquo;s Logs tab and come back &mdash; this
        reads the lines it already holds, and never asks the cluster for more.
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FilterInputView size="sm" accentColor={ACCENT} value={filter} onChange={setFilter}
                       placeholder={`Find the line in ${podName ?? 'the open log'}`} />
      <div className="flex flex-col rounded-md overflow-auto" style={{ maxHeight: 168, border: '1px solid var(--color-surface-border)', background: 'var(--color-panel)' }}>
        {shown.length === 0 ? (
          <span className="text-[11px] px-2.5 py-2" style={{ color: 'var(--color-text-muted)' }}>No line here has that in it.</span>
        ) : shown.map(l => (
          <button key={l.seq} type="button" onClick={() => onPick(l.seq)}
                  className="flex gap-2 px-2.5 py-1 text-left cursor-pointer border-none text-[11px] font-mono"
                  style={{
                    background: picked === l.seq ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'transparent',
                    color: 'var(--color-text-secondary)',
                  }}>
            <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>{formatLogTime(l.ts)}</span>
            <span className="truncate">{l.message ?? l.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── The preview ─────────────────────────────────────────────────────────────

function Preview({ draft, setDraft, logs, podName }: {
  draft: Draft; setDraft: (d: Draft) => void; logs: OpenLines; podName?: string;
}) {
  const held = useMemo(() => previewWindow(logs, PREVIEW_MINUTES), [logs]);
  const pattern = draftAsPattern(draft);
  const numeric = useMemo(() => (pattern ? numericHoles(held.lines, pattern) : []), [pattern, held]);
  const spread = useMemo(() => (pattern ? holeSpread(held.lines, pattern) : {}), [pattern, held]);
  const summary = useMemo(
    () => (pattern && draft.groupBy.length ? summarise(held.lines, [pattern])[0] : undefined),
    [pattern, held, draft.groupBy.length],
  );
  const setShow = (patch: Partial<SummaryShow>) => setDraft({ ...draft, show: { ...draft.show, ...patch } });
  /* Measures on offer: the holes that held a number every time, plus the one
     already chosen, which a quiet preview may simply not have seen. */
  const measures = [...new Set([...numeric, ...(draft.measure ? [draft.measure] : [])])];

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 rounded-lg" style={cardStyle}>
      <div className="flex flex-col gap-1">
        <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>How it will read</span>
        <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          <WindowNote held={held} podName={podName} />
        </span>
      </div>

      {held.lines.length > 0 && (
        summary ? (
          <div className="flex flex-col gap-1.5">
            {draft.show.draw && summary.rows.length > 0 && <Strip lines={held.lines} summary={summary} />}
            {summary.rows.length > 0
              ? <SummaryTable summary={summary} />
              : <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>Nothing in these lines matched it.</span>}
          </div>
        ) : (
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            The answer appears here once there is a pattern and something ticked to group by.
          </span>
        )
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>summarise as</span>
        <ShowRow checked={draft.show.count} onChange={v => setShow({ count: v })} label="How many, per group" />
        <ShowRow checked={draft.show.worst && !!draft.measure} disabled={!draft.measure}
                 onChange={v => setShow({ worst: v })}
                 label="Slowest, from the field"
                 extra={
                   <SelectInputView size="sm" accentColor={ACCENT} value={draft.measure ?? ''}
                                    disabled={measures.length === 0}
                                    options={[{ value: '', label: 'none' }, ...measures.map(h => ({ value: h, label: h }))]}
                                    onChange={v => setDraft({ ...draft, measure: v || undefined, show: { ...draft.show, worst: !!v } })} />
                 }
                 hint={pattern && measures.length === 0 ? 'No field here has held a number on every line it matched.' : undefined} />
        <ShowRow checked={!!draft.mix} disabled={!pattern}
                 onChange={v => { if (!v) setDraft({ ...draft, mix: undefined }); }}
                 label="Count each value of"
                 extra={
                   <SelectInputView size="sm" accentColor={ACCENT} value={draft.mix ?? ''}
                                    disabled={!pattern}
                                    options={[{ value: '', label: 'none' },
                                      ...(pattern?.holes ?? []).filter(h => (spread[h] ?? 0) <= SCATTERED).map(h => ({ value: h, label: h }))]}
                                    onChange={v => setDraft({ ...draft, mix: v || undefined })} />
                 }
                 hint="A status, an outcome — something with a handful of values." />
        <ShowRow checked={draft.show.seen} onChange={v => setShow({ seen: v })} label="First and last seen" />
        <ShowRow checked={draft.show.draw} onChange={v => setShow({ draw: v })} label="Draw it over the window" />
      </div>
    </div>
  );
}

/** What the preview read, and what it did not — said every time. */
function WindowNote({ held, podName }: { held: ReturnType<typeof previewWindow>; podName?: string }) {
  if (!held.lines.length) {
    return (
      <>
        No pod log is open, so there is nothing to read this against yet. Open a pod&rsquo;s Logs tab and come
        back &mdash; the preview reads the lines it already holds, and never asks the cluster for more.
      </>
    );
  }
  const where = podName ? ` ${podName} is holding` : ' the open log is holding';
  const count = `${held.lines.length.toLocaleString()} line${held.lines.length === 1 ? '' : 's'}`;
  if (held.wholeBuffer) {
    return <>These lines carry no timestamps, so this reads all {count}{where}. Nothing is fetched for it.</>;
  }
  return (
    <>
      Against the last {PREVIEW_MINUTES} minutes of what{where} &mdash; {count},{' '}
      {formatLogTime(held.from).slice(0, 5)} to {formatLogTime(held.to).slice(0, 5)}
      {held.untimed > 0 && `, leaving out ${held.untimed.toLocaleString()} with no time on them`}. Nothing is fetched for it.
    </>
  );
}

function ShowRow({ checked, onChange, label, hint, disabled, extra }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean; extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span style={{ marginTop: 3 }}>
        <CheckboxView checked={checked} disabled={disabled} size="sm" accentColor={ACCENT} onChange={onChange} />
      </span>
      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] cursor-pointer" style={{ color: disabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}
                onClick={() => !disabled && onChange(!checked)}>
            {label}
          </span>
          {extra}
        </span>
        {hint && <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{hint}</span>}
      </span>
    </div>
  );
}

function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
    </div>
  );
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
