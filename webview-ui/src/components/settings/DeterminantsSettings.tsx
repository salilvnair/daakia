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
 *
 * ── How it is drawn ──
 *
 * As the board draws it: the list as full-width rows — the switch, the name
 * and where it applies, the logger and its call with the holes as purple
 * chips, what it is grouped by and answers — the one being edited edged in
 * teal; then the builder and its preview side by side, the builder a little
 * wider. The call is drawn in the editor's colours even while it is typed in.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  CheckboxView, FilterInputView, SelectInputView, TextInputView,
} from '@salilvnair/dui';
import {
  useCatalogue, addPattern, setSummary, updatePattern, type CataloguePattern,
} from '../../store/dk8s-logger-store';
import {
  useTeamDeterminants, isTeamOn, setTeamOn, type TeamDeterminant,
} from '../../store/dk8s-team-store';
import {
  determinantsIn, determinantName, holeSpread, numericHoles, showOf,
  podScope, previewWindow, scopeLabel, summarise, type Summary, type SummarySpec, type SummaryShow,
} from '../k8s/determinants';
import { fromLoggerCall, fromLogLine, fromRegex, templateParts } from '../k8s/logger-pattern';
import { formatLogTime } from '../k8s/log-view';
import { useK8sStore, type LogLine, type PodSummary } from '../../store/k8s-store';
import { scopeOf } from '../k8s/LoggersTab';
import { Strip } from '../k8s/SummaryPanel';
import { isFailingValue, mixTone, worstLabel } from '../k8s/window-summary';
import { FOLLOW, CHECK, HOLE_FIELD, GOOD, AMBER, RED, tint } from '../k8s/follow-tone';
import { LineButton, FillButton, SegTrack, CallEditor, railLabel, headLabel, mono } from '../k8s/follow-ui';
import {
  emptyDraft, draftFrom, withPattern, specOf, draftAsPattern, saveBlocker,
  type Draft, type DraftMode,
} from './determinant-draft';
import { useDeterminantFocus } from './determinant-nav';

const ACCENT = FOLLOW;
/** How far back the preview reads, from the newest line held. */
const PREVIEW_MINUTES = 40;
/** A hole with more values than this makes a list, not a summary. */
const SCATTERED = 20;

const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-surface-border)',
  borderRadius: 9,
  maxWidth: '100%',
};
/** A well inside a card — an input, the call, a note. */
const well = 'var(--color-panel)';

/**
 * What a determinant answers, in the list's words: "calls, status mix,
 * slowest". The Window's column heads, so the list is a promise the summary
 * keeps.
 */
function answerWords(spec: SummarySpec): string {
  const show = showOf(spec);
  const out: string[] = [];
  if (show.count) out.push('calls');
  if (spec.mix) out.push(`${spec.mix} mix`);
  if (show.worst) out.push('slowest');
  if (show.seen) out.push('first and last seen');
  if (show.draw) out.push('drawn over the window');
  return out.length ? out.join(', ') : 'nothing — every part is switched off';
}

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
    <div className="flex flex-col" style={{ gap: 14, padding: '18px 24px' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>Log determinants</h2>
        <p style={{ margin: '3px 0 0', fontSize: 12, lineHeight: 1.5, maxWidth: 760, color: 'var(--color-text-muted)' }}>
          A determinant is a question you keep asking a log: which APIs were called, what went out to
          another service, what retried. Save it once and every window you open answers it.
        </p>
      </div>

      {mine.length === 0 ? (
        <div style={{ ...cardStyle, padding: '11px 13px', fontSize: 11.5, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          None yet. Write the first one below &mdash; an access log is the usual start: paste the call that
          writes it, and group it by method and path.
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 7 }}>
          {mine.map(p => (
            <MineRow key={p.id} pattern={p} active={highlight === p.id || draft.id === p.id} onEdit={() => edit(p)} />
          ))}
        </div>
      )}

      {team.length > 0 && (
        <div className="flex flex-col" style={{ gap: 7 }}>
          <div style={railLabel}>from your team</div>
          <span style={{ fontSize: 11, lineHeight: 1.5, maxWidth: 760, color: 'var(--color-text-muted)' }}>
            These came with workspaces teammates share through Git Sync. They answer like yours; the
            switch turns one off for you only, and a copy is yours to change.
          </span>
          {team.map(d => (
            <TeamRow key={d.pattern.id} determinant={d} on={isTeamOn(d, teamOff)} active={highlight === d.pattern.id}
                     onCopy={() => copyToMine(d, setDraft)} />
          ))}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 12 }}>
        <Builder draft={draft} setDraft={setDraft} plain={plain} logs={logs} detail={detail}
                 saved={draft.id ? catalogue.patterns.find(p => p.id === draft.id) : undefined}
                 onDone={() => { setDraft(emptyDraft()); setHighlight(undefined); }} />
        <Preview draft={draft} setDraft={setDraft} logs={logs} podName={detail?.name} />
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
         toggle={<CheckboxView checked={on} size="sm" accentColor={CHECK}
                               aria-label={`${determinantName(pattern)} is ${on ? 'on' : 'off'}`}
                               onChange={v => setSummary(pattern.id, { ...spec, off: !v })} />}
         name={determinantName(pattern)} sub={scopeLabel(pattern.scope)}
         pattern={pattern}
         action={<LineButton h={25} onClick={onEdit}>Edit</LineButton>} />
  );
}

function TeamRow({ determinant, on, active, onCopy }: {
  determinant: TeamDeterminant; on: boolean; active: boolean; onCopy: () => void;
}) {
  const { pattern, source } = determinant;
  const authorOff = !!pattern.summary?.off;
  return (
    <Row active={active} dim={!on}
         toggle={<CheckboxView checked={on} disabled={authorOff} size="sm" accentColor={CHECK}
                               onChange={v => setTeamOn(pattern.id, v)} />}
         name={determinantName(pattern)}
         sub={`${scopeLabel(pattern.scope)} · from ${source.ownerName}${authorOff ? ' · off by its author' : ''}`}
         pattern={pattern}
         action={<LineButton h={25} onClick={onCopy}
                             title={`A copy in your own catalogue, to change. ${source.ownerName}'s stays as it is, in ${source.workspaceName}.`}>
           Keep a copy
         </LineButton>} />
  );
}

function Row({ active, dim, toggle, name, sub, pattern, action }: {
  active: boolean; dim: boolean; toggle: React.ReactNode; name: string; sub: string;
  pattern: CataloguePattern; action: React.ReactNode;
}) {
  const spec = pattern.summary!;
  return (
    <div className="flex items-center"
         style={{
           ...cardStyle,
           gap: 12, padding: '11px 13px',
           borderColor: active ? FOLLOW : 'var(--color-surface-border)',
           background: active ? tint(FOLLOW, 6) : cardStyle.background,
           opacity: dim ? 0.65 : 1,
         }}>
      {toggle}
      <div className="flex flex-col shrink-0 min-w-0" style={{ width: 170 }}>
        <span className="truncate" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)' }} title={name}>
          {name}
        </span>
        <span className="truncate" style={{ fontSize: 10.5, marginTop: 1, color: 'var(--color-text-muted)' }} title={sub}>{sub}</span>
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <PatternLine pattern={pattern} />
        {pattern.holes.length > 0 && (
          <div className="flex flex-wrap" style={{ gap: 5, marginTop: 5 }}>
            {pattern.holes.map(h => <HoleChip key={h} name={h} />)}
          </div>
        )}
      </div>
      <div className="flex flex-col shrink-0" style={{ width: 150, fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
        <span className="truncate">grouped by <span style={{ color: 'var(--color-text-primary)' }}>{spec.groupBy.join(' + ')}</span></span>
        <span className="truncate" title={answerWords(spec)}>{answerWords(spec)}</span>
      </div>
      {action}
    </div>
  );
}

/** A hole's name, as the board chips it: purple, rounded, small. */
function HoleChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center"
          style={{ height: 19, padding: '0 7px', borderRadius: 999, fontSize: 10, background: tint(HOLE_FIELD, 16), color: HOLE_FIELD }}>
      {name}
    </span>
  );
}

/**
 * `c.d.a.ApiAccessLogger — "{} {} → {} in {}ms", method, path, status, took`
 *
 * The call the way it was written: the format string with its `{}` holes, and
 * the names that fill them after it, in order — which is what the reader
 * pasted, and so what they will recognise.
 */
function PatternLine({ pattern }: { pattern: { template: string; logger?: string; regex?: string; holes?: string[] } }) {
  const said = pattern.regex !== undefined
    ? `/${pattern.regex}/`
    : `"${templateParts(pattern.template).map(p => (p.hole ? '{}' : p.text)).join('')}"${pattern.holes?.length ? `, ${pattern.holes.join(', ')}` : ''}`;
  const whole = pattern.logger ? `${pattern.logger} — ${said}` : said;
  return (
    <div className="truncate" style={{ ...mono, fontSize: 11, color: 'var(--color-text-secondary)' }} title={whole}>
      {whole}
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
  const label: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-secondary)' };
  const input: React.CSSProperties = { display: 'flex', width: '100%', height: 28, marginTop: 4, background: well, borderRadius: 6 };

  return (
    <div className="flex flex-col" style={{ ...cardStyle, padding: '13px 15px' }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>
        {draft.id ? `Editing ${draft.name.trim() || 'a determinant'}` : 'A new determinant'}
      </div>
      <div style={{ fontSize: 11.5, margin: '3px 0 10px', color: 'var(--color-text-muted)' }}>
        Paste the line the app writes, or the call that writes it. The holes become the fields.
      </div>

      <div className="flex" style={{ gap: 10, marginBottom: 9 }}>
        <label className="flex-1 min-w-0" style={label}>
          Call it
          <TextInputView size="md" accentColor={ACCENT} value={draft.name} placeholder="Cache hits and misses"
                         style={input} inputStyle={{ fontSize: 12 }}
                         onChange={e => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="shrink-0" style={{ ...label, width: 160 }}>
          Where it applies
          <div style={{ marginTop: 4 }}>
            <SelectInputView size="md" accentColor={ACCENT} value={draft.scope} options={scopes} width="100%"
                             style={{ height: 28, borderRadius: 6, background: well }}
                             onChange={v => setDraft({ ...draft, scope: v })} />
          </div>
        </label>
      </div>
      {!detail && (
        <span style={{ fontSize: 10.5, marginTop: -4, marginBottom: 9, color: 'var(--color-text-muted)' }}>
          Open a pod first to scope a determinant to its workload, or to that pod alone.
        </span>
      )}

      {!draft.id && plain.length > 0 && (
        <div className="flex items-center flex-wrap" style={{ gap: 9, marginBottom: 9 }}>
          <span style={label}>Or start from a logger you catalogued</span>
          <SelectInputView size="sm" accentColor={ACCENT} value="" placeholder="Pick one"
                           style={{ background: well }}
                           options={plain.map(p => ({ value: p.id, label: p.logger ? `${p.logger} — ${p.template}` : p.template }))}
                           onChange={id => {
                             const p = plain.find(x => x.id === id);
                             if (p) setDraft({ ...draftFrom(p), show: emptyDraft().show });
                           }} />
        </div>
      )}

      <div style={{ marginBottom: 9 }}>
        <SegTrack<DraftMode> grow value={draft.mode} options={MODES}
                             onChange={v => setDraft({ ...draft, mode: v })} />
      </div>

      {draft.mode === 'paste' && (
        <CallEditor value={draft.paste} onChange={onPaste}
                    placeholder={'log.debug("cache {} for key {} in {}ms", outcome, key, took);'} />
      )}
      {draft.mode === 'regex' && (
        <CallEditor value={draft.regex} onChange={onRegex} paint={false} rows={1}
                    placeholder={'cache (?<outcome>hit|miss) for key (?<key>\\S+) in (?<took>\\d+)ms'} />
      )}
      {draft.mode === 'line' && (
        <LinePicker logs={logs} podName={detail?.name} picked={draft.pickedSeq} onPick={onPick} />
      )}

      {draft.error && (
        <span style={{ fontSize: 11, marginTop: 6, color: AMBER }}>{draft.error}</span>
      )}

      {draft.pattern && draft.mode !== 'paste' && (
        <div className="flex flex-col" style={{ gap: 4, marginTop: 8 }}>
          <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>
            {draft.id && !draft.paste && !draft.regex && draft.pickedSeq === undefined
              ? 'The saved pattern. Paste, pick or write another to replace it.'
              : 'Reads as'}
          </span>
          <div style={{ padding: '6px 9px', borderRadius: 6, background: well, border: '1px solid var(--color-surface-border)' }}>
            <PatternLine pattern={draft.pattern} />
          </div>
        </div>
      )}

      {draft.pattern && draft.pattern.holes.length > 0 && (
        <>
          <div style={{ ...railLabel, marginTop: 10 }}>extract</div>
          <div className="flex flex-wrap" style={{ gap: 6, marginTop: 7 }}>
            {draft.pattern.holes.map(hole => {
              const on = draft.groupBy.includes(hole);
              const values = spread[hole];
              return (
                <span key={hole}
                      className="inline-flex items-center"
                      title={values === undefined
                        ? 'Nothing in the preview has filled it yet'
                        : `${values} different value${values === 1 ? '' : 's'} in the preview`}
                      style={{
                        gap: 6, height: 24, padding: '0 9px', borderRadius: 999, fontSize: 11,
                        border: `1px solid ${on ? FOLLOW : 'var(--color-surface-border)'}`,
                        background: on ? tint(FOLLOW, 8) : 'transparent',
                        color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      }}>
                  {/* The box and the name beside it, not the pill around both:
                      a click on the box would otherwise toggle twice, once for
                      the box and once for the pill it bubbled to. */}
                  <CheckboxView checked={on} size="sm" accentColor={CHECK} onChange={() => toggleHole(hole)} />
                  <span className="cursor-pointer" onClick={() => toggleHole(hole)}>{hole}</span>
                </span>
              );
            })}
          </div>
          {scatteredOff.length > 0 && (
            <span style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>{scatteredOff.join(', ')}</span>{' '}
              {scatteredOff.length === 1 ? 'is' : 'are'} off: a value that is different on every line makes a group
              per line, which is a list, not a summary.
            </span>
          )}
          {scatteredOn.length > 0 && (
            <span style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5, color: AMBER }}>
              {scatteredOn.join(', ')} is different on nearly every line, so the summary will have a row per line
              &mdash; the log again, not a summary of it.
            </span>
          )}
        </>
      )}

      <div className="flex-1" />
      <div className="flex items-center flex-wrap" style={{ gap: 10, paddingTop: 10 }}>
        <MatchLine draft={draft} held={held} podName={detail?.name} blocker={blocker} />
        <span className="flex-1" />
        {draft.id && (
          <LineButton h={27} fs={11.5} tone={confirmStop ? AMBER : undefined}
                      title="The logger stays in the catalogue, and in the Loggers tab; it just stops being summarised."
                      onClick={() => {
                        if (!confirmStop) { setConfirmStop(true); setTimeout(() => setConfirmStop(false), 3000); return; }
                        setConfirmStop(false);
                        setSummary(draft.id!, undefined);
                        onDone();
                      }}>
            {confirmStop ? 'Click again to stop' : 'Stop summarising'}
          </LineButton>
        )}
        {(draft.id || draft.pattern || draft.name) && (
          <LineButton h={27} fs={11.5} onClick={onDone}>
            {draft.id ? 'Cancel' : 'Clear'}
          </LineButton>
        )}
        <FillButton h={27} fs={11.5} style={{ padding: '0 12px' }} disabled={!!blocker} title={blocker} onClick={save}>
          {draft.id ? 'Save changes' : 'Save it'}
        </FillButton>
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

  const said: React.CSSProperties = { fontSize: 11.5 };
  if (!pattern) return <span style={{ ...said, color: 'var(--color-text-muted)' }}>{blocker}</span>;
  if (!held.lines.length) {
    return <span style={{ ...said, color: 'var(--color-text-muted)' }}>No pod log is open to check it against.</span>;
  }
  if (!result) return <span style={{ ...said, color: AMBER }}>{blocker}</span>;
  const matched = result.rows.reduce((n, r) => n + r.count, 0) + result.ungrouped;
  if (!matched) {
    return (
      <span style={{ ...said, color: AMBER }}>
        Matches nothing in the last {PREVIEW_MINUTES} minutes{podName ? ` on ${podName}` : ''}.
      </span>
    );
  }
  const groups = draft.groupBy.length ? result.rows.length : undefined;
  const noun = draft.groupBy.length === 1 ? draft.groupBy[0] : 'group';
  return (
    <span style={{ ...said, color: GOOD }}>
      Matches {matched.toLocaleString()} line{matched === 1 ? '' : 's'}{podName ? ` on ${podName}` : ''}
      {groups !== undefined && ` · ${groups} ${noun}${groups === 1 ? '' : 's'}`}
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
      <span style={{ fontSize: 11.5, lineHeight: 1.6, padding: '9px 11px', borderRadius: 7, background: well, border: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
        No pod log is open, so there is no line to pick. Open a pod&rsquo;s Logs tab and come back &mdash; this
        reads the lines it already holds, and never asks the cluster for more.
      </span>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <FilterInputView size="sm" accentColor={ACCENT} value={filter} onChange={setFilter}
                       placeholder={`Find the line in ${podName ?? 'the open log'}`} />
      <div className="flex flex-col overflow-auto" style={{ maxHeight: 168, borderRadius: 7, border: '1px solid var(--color-surface-border)', background: well }}>
        {shown.length === 0 ? (
          <span style={{ fontSize: 11, padding: '8px 10px', color: 'var(--color-text-muted)' }}>No line here has that in it.</span>
        ) : shown.map(l => (
          <button key={l.seq} type="button" onClick={() => onPick(l.seq)}
                  className="flex text-left cursor-pointer border-none"
                  style={{
                    ...mono, gap: 8, padding: '4px 10px', fontSize: 11,
                    background: picked === l.seq ? tint(FOLLOW, 14) : 'transparent',
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
    <div className="flex flex-col" style={{ ...cardStyle, padding: '13px 15px' }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>How it will read</div>
      <div style={{ fontSize: 11.5, margin: '3px 0 10px', lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
        <WindowNote held={held} podName={podName} />
      </div>

      {held.lines.length > 0 && (
        summary ? (
          <div className="flex flex-col" style={{ gap: 6 }}>
            {draft.show.draw && summary.rows.length > 0 && <Strip lines={held.lines} summary={summary} />}
            {summary.rows.length > 0
              ? <PreviewTable summary={summary} />
              : <span style={{ fontSize: 11, color: AMBER }}>Nothing in these lines matched it.</span>}
          </div>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            The answer appears here once there is a pattern and something ticked to extract.
          </span>
        )
      )}

      <div style={{ ...railLabel, marginTop: 12 }}>summarise as</div>
      <div className="flex flex-col" style={{ gap: 5, marginTop: 7, fontSize: 11.5 }}>
        <ShowRow checked={draft.show.count} onChange={v => setShow({ count: v })} label="How many, per group" />
        <ShowRow checked={draft.show.worst && !!draft.measure} disabled={!draft.measure}
                 onChange={v => setShow({ worst: v })}
                 label="Slowest, from the"
                 extra={
                   <>
                     <SelectInputView size="xs" accentColor={ACCENT} value={draft.measure ?? ''}
                                      disabled={measures.length === 0}
                                      style={{ background: well }}
                                      options={[{ value: '', label: 'none' }, ...measures.map(h => ({ value: h, label: h }))]}
                                      onChange={v => setDraft({ ...draft, measure: v || undefined, show: { ...draft.show, worst: !!v } })} />
                     <span>field</span>
                   </>
                 }
                 hint={pattern && measures.length === 0 ? 'No field here has held a number on every line it matched.' : undefined} />
        <ShowRow checked={!!draft.mix} disabled={!pattern}
                 onChange={v => { if (!v) setDraft({ ...draft, mix: undefined }); }}
                 label="Count each value of"
                 extra={
                   <SelectInputView size="xs" accentColor={ACCENT} value={draft.mix ?? ''}
                                    disabled={!pattern}
                                    style={{ background: well }}
                                    options={[{ value: '', label: 'none' },
                                      ...(pattern?.holes ?? []).filter(h => (spread[h] ?? 0) <= SCATTERED).map(h => ({ value: h, label: h }))]}
                                    onChange={v => setDraft({ ...draft, mix: v || undefined })} />
                 } />
        <ShowRow checked={draft.show.seen} onChange={v => setShow({ seen: v })} label="First and last seen" />
        <ShowRow checked={draft.show.draw} onChange={v => setShow({ draw: v })} label="Draw it over the window" />
      </div>

      <div className="flex-1" />
      <div style={{ marginTop: 12, padding: '9px 11px', borderRadius: 7, fontSize: 11, lineHeight: 1.6, border: '1px solid var(--color-surface-border)', background: well, color: 'var(--color-text-secondary)' }}>
        Determinants are saved with the workspace and shared the way collections are, so a tester opens a pod and
        already has the team&rsquo;s questions.
      </div>
    </div>
  );
}

/**
 * The draft's answer, as the board tables it: the group, how many lines, the
 * slowest — the group's value coloured by what it says, green for a value
 * that went through, amber for a 4xx or a miss, red for a failure.
 */
function PreviewTable({ summary }: { summary: Summary }) {
  const spec = summary.pattern.summary!;
  const show = showOf(spec);
  const cols = [
    ...spec.groupBy.map(() => 'minmax(0, 1fr)'),
    ...(show.count ? ['64px'] : []),
    ...(spec.mix ? ['minmax(0, 1fr)'] : []),
    ...(show.worst ? ['78px'] : []),
    ...(show.seen ? ['78px', '78px'] : []),
  ].join(' ');
  const head: React.CSSProperties = { ...headLabel, padding: '6px 10px', background: well };
  const cell: React.CSSProperties = { padding: '7px 10px', borderTop: '1px solid var(--color-surface-border)', fontVariantNumeric: 'tabular-nums', minWidth: 0 };
  const tone = (v: string) => (/^miss/i.test(v) ? AMBER : ({ ok: GOOD, warn: AMBER, bad: RED } as const)[mixTone(v)]);
  return (
    <div style={{ border: '1px solid var(--color-surface-border)', borderRadius: 7, overflow: 'hidden' }}>
      <div role="table" style={{ display: 'grid', gridTemplateColumns: cols, fontSize: 11.5 }}>
        {spec.groupBy.map(h => <div key={h} role="columnheader" style={head}>{h}</div>)}
        {show.count && <div role="columnheader" style={head}>lines</div>}
        {spec.mix && <div role="columnheader" style={head}>{spec.mix}</div>}
        {show.worst && <div role="columnheader" style={head}>slowest</div>}
        {show.seen && <><div role="columnheader" style={head}>first seen</div><div role="columnheader" style={head}>last seen</div></>}
        {summary.rows.map(r => (
          <div key={r.key.join('\u0000')} role="row" style={{ display: 'contents' }}>
            {r.key.map((k, i) => (
              <div key={i} className="truncate" title={k}
                   style={{ ...cell, ...mono, color: i === 0 ? tone(k) : 'var(--color-text-primary)' }}>{k}</div>
            ))}
            {show.count && <div style={{ ...cell, color: 'var(--color-text-primary)' }}>{r.count.toLocaleString()}</div>}
            {spec.mix && (
              <div className="truncate" style={cell}>
                {(r.mix ?? []).map(([v, n], i) => (
                  <span key={v} style={{ color: isFailingValue(v) ? tone(v) : GOOD }}>{i > 0 && ' '}{n}&times;{v}</span>
                ))}
              </div>
            )}
            {show.worst && <div style={{ ...cell, color: 'var(--color-text-primary)' }}>{worstLabel(spec.measure, r.worst)}</div>}
            {show.seen && (
              <>
                <div style={{ ...cell, color: 'var(--color-text-muted)' }}>{r.firstTs !== undefined ? formatLogTime(r.firstTs).slice(0, 8) : '—'}</div>
                <div style={{ ...cell, color: 'var(--color-text-muted)' }}>{r.lastTs !== undefined ? formatLogTime(r.lastTs).slice(0, 8) : '—'}</div>
              </>
            )}
          </div>
        ))}
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
    <div className="flex flex-col" style={{ gap: 2 }}>
      <span className="flex items-center flex-wrap" style={{ gap: 9 }}>
        <CheckboxView checked={checked} disabled={disabled} size="sm" accentColor={CHECK} onChange={onChange} />
        <span className="cursor-pointer" style={{ color: disabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}
              onClick={() => !disabled && onChange(!checked)}>
          {label}
        </span>
        {extra && <span className="inline-flex items-center" style={{ gap: 6, marginLeft: -3 }}>{extra}</span>}
      </span>
      {hint && <span style={{ fontSize: 11, lineHeight: 1.5, paddingLeft: 23, color: 'var(--color-text-muted)' }}>{hint}</span>}
    </div>
  );
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
