/**
 * Screen 10, with 10A to 10E in it — the composer.
 *
 * It opens with **one box**. Not eleven fields with one of them focused — one
 * box, because that is the shape of what the person actually has in their head
 * when they arrive. They can write the whole issue there if they want to, and
 * some will.
 *
 * The editor is the same `MarkdownEditorView` that writes workspace
 * documentation, rich text and source over one document. Learning one editor
 * should be enough.
 *
 * The right-hand column carries what GitHub's own sidebar carries, in the same
 * order, because muscle memory is worth more than novelty here — and each
 * control says **where it writes**, because nine controls write to four
 * different places and which is which is not guessable.
 *
 * Fields the template requires and nobody has filled show **amber, not red**.
 * Saying so up front beats a validation error at the end, and they are exactly
 * what the AI step is about to fill in, so shouting about them would be
 * premature.
 *
 * Nothing is uploaded before the issue is filed. The mock's draft screen offers
 * to clean up evidence stranded on an orphan branch; dkgh has no such branch
 * yet and sends nothing early, so there is nothing stranded — see `draftNote`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeChipView, ButtonView, CalloutView, CheckboxView, CodeBlockView,
  MarkdownEditorView, SelectInputView, TogglePillView,
} from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import {
  PlusIcon, TrashIcon, WarningTriangleIcon, CheckCircleIcon, SparkleIcon,
  ExternalLinkIcon, FileTextIcon,
} from '../../icons';
import { GhEvidence } from './GhEvidence';
import { since } from './format';
import { colourOf } from './field-colour';
import {
  DESTINATIONS, assembleBody, asks, discardDraft, draftNote, emptyDraft, hasContent,
  loadDraft, missing, proposeTemplate, saveDraft, sidebarFields,
  type Draft, type IssueForm,
} from './composer-model';
import type { BoardIssue } from './board-types';
import { ACCENT, type RepoMeta } from './types';

interface CreatePlan { display: string; body: string; refusal?: string }
interface CreateResult { ok: boolean; url?: string; number?: number; error?: string }

export function GhCompose({ repo, forms, noTemplates, meta, issues, onFiled }: {
  repo: string;
  forms: IssueForm[];
  noTemplates: boolean;
  meta?: RepoMeta;
  /** The board, for `#` completion — it is already loaded. */
  issues: BoardIssue[];
  /** An issue exists now; the board should read itself again. */
  onFiled: (url: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(repo));
  const [restored, setRestored] = useState<Draft | undefined>();
  const [plan, setPlan] = useState<CreatePlan | undefined>();
  const [filing, setFiling] = useState(false);
  const [result, setResult] = useState<CreateResult | undefined>();
  const [showDestinations, setShowDestinations] = useState(false);

  /* 10D — a draft that was left behind is offered, never silently reopened.
     Somebody who came here to file something else should not find last week's
     half-written issue in the box. */
  useEffect(() => {
    setDraft(emptyDraft(repo));
    setRestored(loadDraft(repo));
    setPlan(undefined);
    setResult(undefined);
  }, [repo]);

  const patch = (change: Partial<Draft>) => setDraft(d => {
    const next = { ...d, ...change };
    saveDraft(next);
    /* A changed draft invalidates a plan built from the old one. */
    setPlan(undefined);
    return next;
  });

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'dkgh:planCreate:result') { setPlan(msg.plan as CreatePlan); return; }
      if (msg.type === 'dkgh:applyCreate:running') { setFiling(true); return; }
      if (msg.type !== 'dkgh:applyCreate:result') return;
      setFiling(false);
      const r = msg as unknown as CreateResult;
      setResult(r);
      if (r.ok && r.url) {
        discardDraft(repo);
        setDraft(emptyDraft(repo));
        setPlan(undefined);
        onFiled(r.url);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [repo, onFiled]);

  const ranked = useMemo(
    () => proposeTemplate(forms, `${draft.title} ${draft.description}`),
    [forms, draft.title, draft.description],
  );
  const form = forms.find(f => f.file === draft.templateFile);
  const unfilled = missing(draft, form);
  const body = assembleBody(draft, form);

  const request = {
    repo,
    title: draft.title,
    body,
    labels: [...new Set([...(form?.labels ?? []), ...draft.labels])],
    assignees: draft.assignees,
    milestone: draft.milestone,
  };

  return (
    <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">

      {/* The box, and whatever the template asks for under it */}
      <div className="flex-1 min-w-0 overflow-y-auto px-4 py-3 flex flex-col gap-3">

        {restored && (
          <CalloutView variant="info" title="You left a draft here" style={{ margin: 0 }}>
            <div className="flex flex-col gap-1.5">
              <span>
                {restored.title.trim() || restored.description.trim().slice(0, 80) || 'Untitled'}
                {' — '}saved {since(restored.savedAt)}. {draftNote(restored)}
              </span>
              <span className="flex gap-2">
                <ButtonView size="sm" variant="primary" accentColor={ACCENT}
                            onClick={() => { setDraft(restored); setRestored(undefined); }}>
                  Pick it back up
                </ButtonView>
                <ButtonView size="sm" accentColor="var(--color-text-muted)"
                            iconLeft={<TrashIcon size={11} />}
                            onClick={() => { discardDraft(repo); setRestored(undefined); }}>
                  Discard it
                </ButtonView>
              </span>
            </div>
          </CalloutView>
        )}

        {result?.ok && result.url && (
          <CalloutView variant="tip" title={`Filed as #${result.number}`} style={{ margin: 0 }}>
            <span className="flex items-center gap-2">
              <span>It is an ordinary issue with an ordinary URL.</span>
              <ButtonView size="sm" accentColor={ACCENT} iconLeft={<ExternalLinkIcon size={11} />}
                          onClick={() => window.open(result.url, '_blank')}>
                Open it
              </ButtonView>
            </span>
          </CalloutView>
        )}

        <input
          value={draft.title}
          onChange={e => patch({ title: e.target.value })}
          placeholder="What went wrong?"
          className="text-[14px] px-2.5 py-2 rounded"
          style={{
            background: 'var(--color-panel)',
            border: '1px solid var(--color-surface-border)',
            color: 'var(--color-text-primary)',
            outline: 'none',
          }}
        />

        {/* 10A — which template applies, proposed and never assumed */}
        {forms.length > 0 && (
          <TemplatePicker
            ranked={ranked}
            chosen={draft.templateFile}
            onChoose={file => patch({ templateFile: file })}
          />
        )}

        {/* 10E — most repositories have no forms, and the composer still beats a browser */}
        {noTemplates && <NoTemplates />}

        <div className="flex flex-col gap-1">
          <Label>{form ? 'What happened' : 'The issue'}</Label>
          <MarkdownEditorView
            value={draft.description}
            onChange={description => patch({ description })}
            placeholder="Describe it in a sentence. You can write the whole thing here."
            accentColor={ACCENT}
            size="sm"
            style={{ minHeight: 190 }}
          />
          <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
            The same editor that writes workspace documentation — rich text and Markdown source
            over one document.
          </span>
        </div>

        {/* Whatever the template asks for beyond the box */}
        {form && form.fields.filter(f => f.type !== 'markdown').map(field => (
          <div key={field.label} className="flex flex-col gap-1">
            <Label
              required={field.required}
              unfilled={unfilled.includes(field)}
            >
              {field.label}
            </Label>
            {field.options.length > 0 ? (
              <div className="flex gap-1 flex-wrap">
                {field.options.map(o => (
                  <TogglePillView
                    key={o}
                    accentColor={colourOf(o, field.options)}
                    active={draft.answers[field.label] === o}
                    onClick={() => patch({
                      answers: {
                        ...draft.answers,
                        [field.label]: draft.answers[field.label] === o ? '' : o,
                      },
                    })}
                  >
                    {o}
                  </TogglePillView>
                ))}
              </div>
            ) : (
              <textarea
                value={draft.answers[field.label] ?? ''}
                onChange={e => patch({
                  answers: { ...draft.answers, [field.label]: e.target.value },
                })}
                rows={field.type === 'textarea' ? 3 : 1}
                className="text-[11px] px-2 py-1.5 rounded"
                style={{
                  background: 'var(--color-panel)',
                  border: '1px solid var(--color-surface-border)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            )}
          </div>
        ))}

        <Evidence draft={draft} onChange={patch} />
      </div>

      {/* The sidebar, in GitHub's own order */}
      <div className="flex-shrink-0 overflow-y-auto flex flex-col gap-3"
           style={{
             width: 232,
             borderLeft: '1px solid var(--color-surface-border)',
             padding: '12px 10px',
           }}>

        <Picker
          label="Assignees"
          values={draft.assignees}
          options={meta?.assignees ?? []}
          empty="Nobody on this repository can be assigned from here."
          onChange={assignees => patch({ assignees })}
        />
        <Picker
          label="Labels"
          values={draft.labels}
          options={(meta?.labels ?? []).map(l => l.name)}
          empty="This repository has no labels."
          extra={form?.labels.length
            ? `${form.labels.join(', ')} — added by the template itself`
            : undefined}
          onChange={labels => patch({ labels })}
        />
        <div className="flex flex-col gap-1">
          <Label>Milestone</Label>
          <SelectInputView
            value={draft.milestone ?? ''}
            onChange={v => patch({ milestone: v || undefined })}
            options={[
              { value: '', label: 'None' },
              ...(meta?.milestones ?? []).map(m => ({ value: m.title, label: m.title })),
            ]}
            accentColor={ACCENT}
            size="sm"
            width="100%"
          />
        </div>

        {unfilled.length > 0 && (
          <div className="flex items-start gap-1.5 text-[10px] rounded px-2 py-1.5"
               style={{
                 color: 'var(--color-text-muted)',
                 lineHeight: 1.55,
                 background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
                 border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
               }}>
            <WarningTriangleIcon size={11}
                                 style={{ marginTop: 2, flexShrink: 0, color: 'var(--color-warning)' }} />
            <span>
              <b>{unfilled.map(f => f.label).join(', ')}</b>{' '}
              {unfilled.length === 1 ? 'is' : 'are'} required by this template. Amber rather than
              red — it can still be filed, and this is exactly what the AI step fills in.
            </span>
          </div>
        )}

        {/* 10C — the four destinations, said rather than guessed at */}
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setShowDestinations(s => !s)}
            className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.09em] cursor-pointer"
            style={{ background: 'none', border: 'none', padding: 0,
                     color: 'var(--color-text-muted)' }}
          >
            <FileTextIcon size={10} />
            Where each field goes
          </button>
          {showDestinations && (
            <div className="flex flex-col rounded-lg border overflow-hidden"
                 style={{ borderColor: 'var(--color-surface-border)' }}>
              {sidebarFields(form, false).map((f, at) => (
                <div key={`${f.key}-${at}`} className="flex flex-col gap-0.5 px-2 py-1.5"
                     style={{
                       opacity: f.unavailable ? 0.65 : 1,
                       borderTop: at === 0 ? 'none'
                         : '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)',
                     }}>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[10px]" style={{ color: 'var(--color-text-primary)' }}>
                      {f.label}
                    </span>
                    <span className="flex-1" />
                    <BadgeChipView
                      tone={f.destination === 'nowhere' || f.unavailable
                        ? 'var(--color-warning)' : ACCENT}
                      size="xs"
                    >
                      {DESTINATIONS[f.destination].label}
                    </BadgeChipView>
                  </span>
                  <span className="text-[9px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                    {f.unavailable ?? f.how}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <span className="flex-1" />

        {/* The command, before it runs */}
        {plan && (
          <div className="flex flex-col gap-1.5">
            <Label>What will run</Label>
            <CodeBlockView code={plan.display} language="bash" fill showCopyButton
                           accentColor={ACCENT} maxHeight="90px" />
            <details className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
              <summary className="cursor-pointer">The body, as it will be posted</summary>
              <pre className="text-[9.5px] mt-1 whitespace-pre-wrap"
                   style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
                {plan.body}
              </pre>
            </details>
            {plan.refusal && (
              <span className="text-[10px]" style={{ color: 'var(--color-error)' }}>
                {plan.refusal}
              </span>
            )}
          </div>
        )}

        {result && !result.ok && (
          <span className="flex items-start gap-1.5 text-[10px]" style={{ color: 'var(--color-error)' }}>
            <WarningTriangleIcon size={10} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>{result.error}</span>
          </span>
        )}

        <div className="flex flex-col gap-1.5">
          {plan && !plan.refusal ? (
            <>
              <ButtonView size="md" variant="primary" accentColor={ACCENT}
                          disabled={filing}
                          iconLeft={<CheckCircleIcon size={12} />}
                          onClick={() => postMsg({ type: 'dkgh:applyCreate', request })}>
                {filing ? 'Filing…' : 'File it'}
              </ButtonView>
              <ButtonView size="sm" accentColor="var(--color-text-muted)"
                          onClick={() => setPlan(undefined)} disabled={filing}>
                Back to writing
              </ButtonView>
            </>
          ) : (
            <ButtonView size="md" variant="primary" accentColor={ACCENT}
                        disabled={!draft.title.trim()}
                        iconLeft={<PlusIcon size={12} />}
                        onClick={() => postMsg({ type: 'dkgh:planCreate', request })}>
              Review and create
            </ButtonView>
          )}
          {hasContent(draft) && (
            <span className="text-[9px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              {draftNote(draft)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 10A ─────────────────────────────────────────────────────────────────────

/**
 * Three cards, one proposed, and the losers say what they would have asked.
 *
 * "Asks for a team and a target release" is how somebody recognises that they
 * actually wanted the tracking template — a name alone would not have told
 * them.
 */
function TemplatePicker({ ranked, chosen, onChoose }: {
  ranked: { form: IssueForm; because: string }[];
  chosen?: string;
  onChoose: (file: string) => void;
}) {
  const proposed = ranked[0]?.form.file;
  return (
    <div className="flex flex-col gap-1">
      <Label>Template</Label>
      <div className="grid gap-1.5"
           style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {ranked.map(({ form, because }) => {
          const on = chosen === form.file;
          return (
            <button
              key={form.file}
              type="button"
              onClick={() => onChoose(form.file)}
              className="flex flex-col gap-1 px-2.5 py-2 rounded-lg text-left cursor-pointer"
              style={{
                background: on ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : 'transparent',
                border: `1px solid ${on ? `color-mix(in srgb, ${ACCENT} 50%, transparent)`
                  : 'var(--color-surface-border)'}`,
              }}
            >
              <span className="flex items-center gap-1.5">
                <span className="text-[11px]" style={{ color: 'var(--color-text-primary)' }}>
                  {form.name}
                </span>
                {!chosen && form.file === proposed && (
                  <BadgeChipView tone={ACCENT} size="xs">proposed</BadgeChipView>
                )}
              </span>
              <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                {because}
              </span>
            </button>
          );
        })}
      </div>
      {!chosen && (
        <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
          Proposed from what you have written, never assumed — a bug report and an enhancement
          ask for entirely different things, and picking wrong costs you the answers.
        </span>
      )}
    </div>
  );
}

// ── 10E ─────────────────────────────────────────────────────────────────────

/**
 * Most repositories have no issue forms.
 *
 * The composer still has to be better than a browser, and it can be — just with
 * fewer certainties. Degrading honestly means saying exactly what is absent
 * rather than showing empty dropdowns.
 */
function NoTemplates() {
  const rows: { ok: boolean; text: string }[] = [
    { ok: false, text: 'No Module, Environment or Type — there is no form declaring them.' },
    { ok: false, text: 'The board cannot group by anything this repository invented.' },
    { ok: true, text: 'Labels, assignees and milestones all still work — they are GitHub’s own.' },
    { ok: true, text: 'The editor, the draft and the screenshot paste are unchanged.' },
    { ok: true, text: 'The exact command is still shown before anything is filed.' },
  ];
  return (
    <div className="flex flex-col gap-1 rounded-lg border px-2.5 py-2"
         style={{ borderColor: 'var(--color-surface-border)', background: 'var(--color-panel)' }}>
      <span className="text-[10px]" style={{ color: 'var(--color-text-primary)' }}>
        <b>This repository has no issue forms.</b>
      </span>
      {rows.map(r => (
        <span key={r.text} className="flex items-start gap-1.5 text-[10px]"
              style={{ color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
          <span style={{ color: r.ok ? 'var(--color-success)' : 'var(--color-warning)',
                         marginTop: 1, flexShrink: 0 }}>
            {r.ok ? '✓' : '×'}
          </span>
          {r.text}
        </span>
      ))}
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Evidence({ draft, onChange }: {
  draft: Draft;
  onChange: (change: Partial<Draft>) => void;
}) {
  const [typed, setTyped] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  const add = () => {
    const url = typed.trim();
    if (!url) return;
    onChange({ evidence: [...draft.evidence, url] });
    setTyped('');
    ref.current?.focus();
  };

  return (
    <div className="flex flex-col gap-1">
      <Label>Evidence</Label>
      {draft.evidence.length > 0 && (
        <div className="grid gap-1.5"
             style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
          {draft.evidence.map(u => (
            <span key={u} style={{ position: 'relative' }}>
              <GhEvidence url={u} height={72} alt="Evidence for this issue" />
              <button
                type="button"
                title="Take it off"
                onClick={() => onChange({ evidence: draft.evidence.filter(x => x !== u) })}
                className="cursor-pointer rounded"
                style={{
                  position: 'absolute', top: 3, right: 3,
                  background: 'rgba(0,0,0,.6)', border: 'none',
                  color: '#fff', width: 16, height: 16, lineHeight: 1, fontSize: 10,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <input
          ref={ref}
          value={typed}
          onChange={e => setTyped(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Paste the URL of a screenshot already on GitHub"
          className="flex-1 text-[10.5px] px-2 py-1 rounded"
          style={{
            background: 'var(--color-panel)',
            border: '1px solid var(--color-surface-border)',
            color: 'var(--color-text-primary)',
            outline: 'none',
          }}
        />
        <ButtonView size="sm" accentColor={ACCENT} onClick={add} disabled={!typed.trim()}>
          Add
        </ButtonView>
      </div>
      {/*
        Said rather than implied. Uploading a file needs somewhere to put it,
        and dkgh has no such place yet — screen 12 is where that lands. Until
        then this takes a URL, which is what a screenshot dragged into any other
        GitHub comment already has.
      */}
      <span className="flex items-start gap-1 text-[9px]"
            style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        <SparkleIcon size={9} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          Uploading a file from your machine needs somewhere on GitHub to put it, which dkgh does
          not have yet. A URL from any GitHub comment works today, and the image is fetched
          through gh so a private one still renders.
        </span>
      </span>
    </div>
  );
}

function Picker({ label, values, options, empty, extra, onChange }: {
  label: string;
  values: string[];
  options: string[];
  empty: string;
  extra?: string;
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 flex-wrap px-2 py-1 rounded text-left cursor-pointer"
        style={{
          background: 'var(--color-panel)',
          border: '1px solid var(--color-surface-border)',
          minHeight: 26,
        }}
      >
        {values.length === 0 ? (
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>None</span>
        ) : values.map(v => (
          <BadgeChipView key={v} tone={ACCENT} size="xs">{v}</BadgeChipView>
        ))}
      </button>
      {open && (
        <div className="flex flex-col rounded-lg border overflow-y-auto"
             style={{ borderColor: 'var(--color-surface-border)', maxHeight: 168 }}>
          {options.length === 0 ? (
            <span className="px-2 py-1.5 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              {empty}
            </span>
          ) : options.map(o => (
            <label key={o} className="flex items-center gap-1.5 px-2 py-1 cursor-pointer">
              <CheckboxView
                checked={values.includes(o)}
                onChange={() => onChange(values.includes(o)
                  ? values.filter(v => v !== o)
                  : [...values, o])}
                accentColor={ACCENT}
                size="sm"
              />
              <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>{o}</span>
            </label>
          ))}
        </div>
      )}
      {extra && (
        <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{extra}</span>
      )}
    </div>
  );
}

function Label({ children, required, unfilled }: {
  children: React.ReactNode;
  required?: boolean;
  unfilled?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.09em]"
          style={{ color: unfilled ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
      {children}
      {required && (
        /* Amber, not red — saying so up front beats a validation error at the
           end, and it can still be filed. */
        <span style={{ color: 'var(--color-warning)' }}>required</span>
      )}
    </span>
  );
}
