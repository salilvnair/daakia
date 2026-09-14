/**
 * Screen 11 — generate with AI.
 *
 * The button reads **the repository's own `ISSUE_TEMPLATE` forms**, parsed from
 * the YAML rather than guessed at, works out which of their fields the
 * description already answers, and asks about the rest one at a time. A
 * repository that adds a field gets asked about it without dkgh changing,
 * because nothing here knows what a Module is — the fields are passed in.
 *
 * **11B — it refuses to invent.** A field the description does not answer comes
 * back unanswered with a sentence about what is missing, and that becomes a
 * question with the template's own options as buttons. A confident wrong Module
 * costs somebody a mis-filed issue and costs the next reader their trust in
 * every other value on the board, so "I could not tell" is the better answer
 * and the prompt says so first.
 *
 * **11C — an answer you already gave is changeable.** Every answered field is a
 * row you can click back into. The model proposed it; it is not a decision the
 * screen made for you.
 *
 * **11F — and the review is over the template, not over the answer.** Every
 * field the form declares gets a row whatever the model did with it: proposed,
 * refused with a reason, or never mentioned. Each says whose value it is
 * holding — the model's, yours, or the model's with your edit on top — and each
 * opens in place. A screen that can only take a value whole or leave it whole
 * sends people off to the sidebar to change one word, and that is a different
 * screen with a different layout; this is the one they are reading.
 *
 * **11D — no model configured** is a first-class state, not an error toast. It
 * says which screen fixes it.
 *
 * **11E — what the model was actually told** is on the screen, behind a
 * disclosure. Not a paraphrase of the prompt: the prompt.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SkeletonView } from '@salilvnair/dui';
import { Ico } from './GhIcons';
import { GhClose } from './GhClose';
import { CopyWord, GhNote } from './GhShell';
import { sendAiRequest, newAiRequestId } from '../../services/ai/ai-client';
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import {
  reviewRows, untaken, takeAll, filledCount, missingRequired, titleState,
  type ReviewRow, type Proposal,
} from './proposal-review';
import { shotsFor, type Draft } from './composer-model';
import { GhFieldShots, shotHandlers } from './GhFieldShots';
import type { FormField, IssueForm } from './board-types';

/**
 * The last failure, kept outside the component's lifetime.
 *
 * The panel is toggled shut and open again constantly — it is a disclosure on
 * the composer, not a screen — and a failure that lives in its state is a
 * failure the reader loses by closing the thing that was telling them about
 * it. Then the audit knows and nobody else does, which is exactly the
 * complaint. Module-level, because it is one composer at a time and it should
 * not outlive the tab.
 */
let lastFailure = '';

/** Whether there is a failure worth showing on the button that opens this. */
export function aiFailed(): string {
  return lastFailure;
}

export function GhGenerate({
  repo, form, draft, onDraft, onClose, startOnOpen, onRunning, onProposal,
}: {
  repo: string;
  /** The template this issue is being filed against. */
  form?: IssueForm;
  draft: Draft;
  onDraft: (change: Partial<Draft>) => void;
  onClose: () => void;
  /**
   * Ask as soon as the panel opens.
   *
   * The button that opens this says "Generate with AI", and it used to open a
   * panel with a second, differently-worded button inside it — so the answer
   * to "what do I press" was "the other one". Pressing the first one now does
   * what it says.
   */
  startOnOpen?: boolean;
  /** So the button that started it can say it is still going. */
  onRunning?: (running: boolean) => void;
  /**
   * A proposal arrived.
   *
   * Told to the caller so the button can stop offering to do again what it
   * has just done — until the reader changes what it would be reading.
   * Failures do not fire this: a run that came back empty is exactly one you
   * want to be able to retry.
   */
  onProposal?: () => void;
}) {
  const providers = useAiProvidersStore(s => s.providers);
  const templates = useAiPromptTemplatesStore(s => s.templates);

  const [running, setRunning] = useState(false);
  /* Told to whoever opened this, so the footer button can carry the same
     state rather than looking idle while the panel below it works. */
  useEffect(() => { onRunning?.(running); }, [running, onRunning]);
  const [error, setError] = useState(lastFailure);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [asking, setAsking] = useState(0);
  const [showPrompt, setShowPrompt] = useState(false);
  const acc = useRef('');
  const id = useRef('');
  /* The message handler is registered once, so anything it calls has to be
     reached through a ref or it is whatever was passed on the first render. */
  const onProposalRef = useRef(onProposal);
  onProposalRef.current = onProposal;

  /*
    11D — configured means an enabled provider with a model on it.

    The key itself never reaches the webview — it lives in the host's secret
    storage — so "is there a key" is not a question this side can ask. An
    enabled provider that declares a model is the closest true one.
  */
  const configured = providers.some(p => p.enabled && p.models.length > 0);

  const fields = useMemo(() => (form?.fields ?? []).filter(f => f.label), [form]);

  /*
    11E — the exact two blocks, with the variables already filled in.

    Built here rather than described, because a screen that says "we send the
    template and your description" is a claim, and this is the thing itself.
  */
  const wrote = useMemo(() => {
    const title = draft.title.trim();
    const body = draft.description.trim();
    return [title && `Title: ${title}`, body].filter(Boolean).join('\n\n')
      || '(nothing written yet)';
  }, [draft.title, draft.description]);

  const prompts = useMemo(() => {
    const system = templates['dkgh.compose.system'] ?? '';
    const user = (templates['dkgh.compose'] ?? '')
      /* Every occurrence, not the first. `String.replace` with a string
         argument substitutes once, so a prompt somebody edited to mention
         {{fields}} twice would ship the second one as literal text. */
      .replace(/\{\{\s*repo\s*\}\}/g, repo)
      .replace(/\{\{\s*template\s*\}\}/g, form?.name ?? 'no template')
      .replace(/\{\{\s*fields\s*\}\}/g, fields.map(describeField).join('\n'))
      /* Both boxes, because either one on its own is what somebody wrote. The
         title is labelled rather than run together with the body: "Checkout
         hangs" followed by a paragraph reads as a heading and its text, which
         is what it is. */
      .replace(/\{\{\s*description\s*\}\}/g, wrote);
    return { system, user };
  }, [templates, repo, form, fields, wrote]);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.tabId !== id.current) return;
      if (msg.type === 'ai:chunk') { acc.current += String(msg.text ?? ''); return; }
      if (msg.type === 'ai:error') {
        setRunning(false);
        lastFailure = String(msg.message ?? 'The model did not answer.');
        setError(lastFailure);
        return;
      }
      if (msg.type !== 'ai:complete') return;
      setRunning(false);
      const text = acc.current
        || (msg.message as { content?: string } | undefined)?.content
        || '';
      const parsed = readJson(text);
      if (!parsed) {
        lastFailure = 'The model answered with something that is not the JSON this screen '
          + 'asked for. Nothing has been filled in.';
        setError(lastFailure);
        return;
      }
      /* An answer that arrived clears whatever the last attempt said. A stale
         error above a fresh proposal reads as a warning about the proposal. */
      lastFailure = '';
      setError('');
      setProposal(parsed);
      setAsking(0);
      onProposalRef.current?.();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const ask = () => {
    lastFailure = '';
    setError('');
    setProposal(null);
    acc.current = '';
    setRunning(true);
    id.current = newAiRequestId('dkgh.compose');
    sendAiRequest({
      stage: 'dkgh.compose',
      screen: 'dkgh · New issue',
      requestId: id.current,
      systemPrompts: [prompts.system],
      userPrompt: prompts.user,
      settings: { responseFormat: 'json_object', temperature: 0.1, maxTokens: 1200 },
    });
  };

  /*
    Opened by the button that says "Generate with AI", so generate.

    Once per mount, and only when there is something to read: with an empty
    description the panel opens and explains itself instead, which is the one
    case where the second button earns its place.

    `configured` is checked too — without a provider this would fire a request
    that cannot be sent and replace the "no model is configured" note with a
    failure about a socket.
  */
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !startOnOpen) return;
    if (!configured || fields.length === 0) return;
    if (!draft.title.trim() && !draft.description.trim()) return;
    started.current = true;
    ask();
    // Mount only: re-running when the description changes would fire a request
    // on every keystroke behind the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Take one answer into the draft. 11C — and out again. */
  const answer = (label: string, value: string) => onDraft({
    answers: { ...draft.answers, [label]: value },
  });

  const open = proposal?.unanswered ?? [];
  const question = open[asking];
  const field = question ? fields.find(f => f.label === question.label) : undefined;

  /* 11F — every field of the template, and what became of it. */
  const rows = useMemo(
    () => reviewRows(fields, proposal, draft.answers),
    [fields, proposal, draft.answers],
  );
  const spare = untaken(rows);
  const { filled, total } = filledCount(rows);
  const missing = missingRequired(rows);
  const title = titleState(proposal?.title, draft.title);
  /** Which row is open for editing. One at a time — it is a list, not a form. */
  const [editing, setEditing] = useState('');

  return (
    <div className="opt" style={{ marginTop: 10 }}>
      <div className="oh">
        <Ico name="ai" style={{ color: 'var(--dk-gh)' }} />
        Generate with AI
        <span className="sp" />
        {proposal && (
          <span className="cx">{filled} of {total} filled</span>
        )}
        <GhClose onClick={onClose} size={24} />
      </div>

      {!configured ? (
        /* 11D */
        <GhNote title="No model is configured" tone="warn" style={{ margin: 0 }}>
          Nothing here can run without one. Settings → AI Providers takes a key; every other
          screen in this tab works without it, and this one is the only thing that does not.
        </GhNote>
      ) : fields.length === 0 ? (
        <GhNote title="This repository declares no form fields" style={{ margin: 0 }}>
          There is nothing to ask about. The composer still files the issue — title, body,
          labels and assignee are GitHub&rsquo;s own and always work.
        </GhNote>
      ) : (
        <>
          <div className="sub">
            Reads <b>{form?.name ?? 'the template'}</b> — {fields.length} field
            {fields.length === 1 ? '' : 's'}, from this repository&rsquo;s own YAML — works out
            which of them your description already answers, and asks about the rest. It never
            fills in a value it could not find.
          </div>

          {/*
            What it is working through, while it works through it.

            The wait was a disabled button over an empty panel, which is
            indistinguishable from a button that did not register the click —
            the complaint this answers, in those words. The rows are the
            repository's own field labels, so this is not a decorative
            skeleton: it is the list of questions being asked, with a bar where
            each answer is about to land. When the answer arrives the bar is
            replaced by the value in the same row, in the same place.
          */}
          {running && !proposal && (
            <div className="opt" style={{ gap: 2, padding: 4 }} aria-live="polite">
              {fields.slice(0, 9).map((f, i) => (
                <div key={f.label} className="fct" style={{ cursor: 'default' }}>
                  <span className="bx" />
                  <b style={{ color: 'var(--dk-text)' }}>{f.label}</b>
                  {/* Fixed widths rather than random: a skeleton that reshuffles
                      every render is a second animation fighting the pulse. */}
                  <SkeletonView
                    variant="text"
                    height={7}
                    width={['62%', '38%', '80%', '48%', '70%'][i % 5]}
                    style={{ flex: 1 }}
                  />
                </div>
              ))}
            </div>
          )}

          {error && (
            <GhNote title="That did not come back" tone="warn" style={{ margin: 0 }}>
              {error}
            </GhNote>
          )}

          {proposal && (
            <>
              {/*
                11F — the title, always, not only when yours is empty.

                It used to be hidden the moment there was a title in the box,
                which meant the one case where you actually want to compare —
                the model read what you wrote and phrased it better — was the
                case the screen refused to show you.
              */}
              {title !== 'none' && (
                <div className="fct" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                  <Ico name="pen" style={{ color: 'var(--dk-gh)', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--dk-text)' }}>
                      <b>Title</b>{' '}
                      <Tag state={title === 'taken' ? 'taken' : title === 'yours' ? 'yours'
                        : title === 'differs' ? 'edited' : 'offered'} />
                    </div>
                    {title === 'differs' && (
                      <div className="sub" style={{ marginTop: 2 }}>
                        It would have written: <b>{proposal.title}</b>
                      </div>
                    )}
                    <input
                      className="inp"
                      style={{ marginTop: 4, width: '100%' }}
                      value={draft.title}
                      placeholder={proposal.title || 'One line, as you would say it out loud'}
                      onChange={e => onDraft({ title: e.target.value })}
                    />
                  </div>
                  {title !== 'taken' && proposal.title && (
                    <button type="button" className="btn" style={{ padding: '2px 9px' }}
                            onClick={() => onDraft({ title: proposal.title })}>
                      {title === 'differs' ? 'Use its' : 'Use it'}
                    </button>
                  )}
                </div>
              )}

              {/* 11B — one question at a time, with the template's own options */}
              {question && (
                <div className="ask" style={{ padding: '8px 10px', borderRadius: 8,
                                              border: '1px solid var(--dk-border)',
                                              background: 'var(--dk-panel)' }}>
                  <div className="sub" style={{ marginBottom: 5 }}>
                    <b style={{ color: 'var(--dk-text)' }}>{question.label}</b> — {question.why}
                  </div>
                  {field && field.options.length > 0 ? (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {field.options.map(o => (
                        <button key={o} type="button" className="btn" style={{ padding: '3px 9px' }}
                                onClick={() => { answer(question.label, o); setAsking(a => a + 1); }}>
                          {o}
                        </button>
                      ))}
                      <button type="button" className="btn" style={{ padding: '3px 9px' }}
                              onClick={() => setAsking(a => a + 1)}>
                        Skip
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        className="inp"
                        autoFocus
                        placeholder={`${question.label}…`}
                        onKeyDown={e => {
                          if (e.key !== 'Enter') return;
                          answer(question.label, (e.target as HTMLInputElement).value);
                          setAsking(a => a + 1);
                        }}
                      />
                      <button type="button" className="btn" onClick={() => setAsking(a => a + 1)}>
                        Skip
                      </button>
                    </div>
                  )}
                  <div className="sub" style={{ marginTop: 5 }}>
                    {asking + 1} of {open.length} it could not answer from what you wrote.
                  </div>
                </div>
              )}

              {/*
                11F — the review.

                Every field the template declares, in the order it declared
                them, whatever the model did with it: what it proposed, what it
                refused to guess at, and what it never mentioned. Each row is
                editable in place, because "take it or leave it" is not a
                review — the value you want is usually the model's with one
                word changed, and finding that field again in the sidebar to
                change it is a different screen with a different layout.
              */}
              {rows.length > 0 && (
                <div className="opt" style={{ gap: 2, padding: 4 }}>
                  <div className="fct" style={{ cursor: 'default', color: 'var(--dk-faint)' }}>
                    <b style={{ color: 'var(--dk-text)' }}>Review</b>
                    <span>
                      {filled} of {total} filled
                      {missing.length > 0 && (
                        <span style={{ color: 'var(--dk-amber)' }}>
                          {' '}· {missing.length} required still empty
                        </span>
                      )}
                    </span>
                    <span className="sp" style={{ flex: 1 }} />
                    {spare.length > 0 && (
                      <button type="button" className="btn" style={{ padding: '2px 9px' }}
                              title="Fills in every value it proposed that you have not already changed"
                              onClick={() => onDraft({ answers: takeAll(rows, draft.answers) })}>
                        Take all {spare.length}
                      </button>
                    )}
                  </div>

                  {rows.map(r => (
                    <Row
                      key={r.label}
                      row={r}
                      editing={editing === r.label}
                      onEdit={() => setEditing(e => (e === r.label ? '' : r.label))}
                      onSet={v => answer(r.label, v)}
                      draft={draft}
                      onDraft={onDraft}
                    />
                  ))}
                </div>
              )}

              {!question && open.length > 0 && (
                <div className="sub">
                  That was all of them. Every field is a row above, whatever it made of it —
                  press the pencil on any one to change what will be written.
                </div>
              )}

              {proposal.notes && <div className="sub">{proposal.notes}</div>}
            </>
          )}

          {/* 11E */}
          <details className="sub" open={showPrompt}
                   onToggle={e => setShowPrompt((e.target as HTMLDetailsElement).open)}>
            <summary style={{ cursor: 'pointer' }}>What the model was actually told</summary>
            <div className="cmd" style={{ alignItems: 'flex-start', marginTop: 6 }}>
              <pre className="code" style={{ flex: 1, maxHeight: 220, overflowY: 'auto' }}>
                {`# system\n${prompts.system}\n# user\n${prompts.user}`}
              </pre>
              <CopyWord text={`# system\n${prompts.system}\n# user\n${prompts.user}`} />
            </div>
            <div style={{ marginTop: 5 }}>
              Both blocks are editable in Settings → Prompt Library, under dkgh — this is the
              text, not a description of it.
            </div>
          </details>
        </>
      )}
    </div>
  );
}

/** What a row's state is called, in one word, in the tone that says it. */
const TAG: Record<ReviewRow['state'], { word: string; tone: string } | null> = {
  taken: { word: 'from AI', tone: 'var(--dk-gh)' },
  edited: { word: 'edited', tone: 'var(--dk-amber)' },
  yours: { word: 'yours', tone: 'var(--dk-muted)' },
  offered: { word: 'proposed', tone: 'var(--dk-gh)' },
  open: { word: 'not answered', tone: 'var(--dk-muted)' },
  blank: null,
};

function Tag({ state }: { state: ReviewRow['state'] }) {
  const t = TAG[state];
  if (!t) return null;
  return (
    <span style={{
      fontSize: 10, letterSpacing: '.04em', color: t.tone, border: `1px solid ${t.tone}`,
      borderRadius: 4, padding: '0 4px', marginLeft: 6, whiteSpace: 'nowrap',
      background: `color-mix(in srgb, ${t.tone} 10%, transparent)`,
    }}>
      {t.word}
    </span>
  );
}

/**
 * One field of the template, and what will be written under its heading.
 *
 * The tick takes or drops the model's proposal in one press, because that is
 * the common answer. The pencil opens the value itself, because the other
 * common answer is "nearly" — and a screen that can only take a value whole or
 * leave it whole sends people to the sidebar to fix one word, which is the
 * complaint this row exists to answer.
 */
function Row({ row, editing, onEdit, onSet, draft, onDraft }: {
  row: ReviewRow;
  editing: boolean;
  onEdit: () => void;
  onSet: (value: string) => void;
  draft: Draft;
  onDraft: (change: Partial<Draft>) => void;
}) {
  const on = row.state === 'taken' || row.state === 'edited' || row.state === 'yours';
  const canTick = row.state === 'taken' || row.state === 'offered';
  /* A dropdown holds one of the template's values and nothing else; a written
     field is the one that can want a picture with it. */
  const shots = row.options.length === 0 ? shotsFor(draft, row.label) : [];

  return (
    <div className={`fct${on ? ' on' : ''}`}
         style={{ cursor: 'default', alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 4 }}>
      <button
        type="button"
        className="bx"
        style={{
          marginTop: 2,
          cursor: canTick ? 'pointer' : 'default',
          opacity: canTick || on ? 1 : 0.45,
        }}
        disabled={!canTick && !on}
        title={row.state === 'taken' ? 'Drop it again'
          : row.state === 'offered' ? 'Take what it proposed'
            : on ? 'Clear this field' : 'Nothing proposed for this one'}
        onClick={() => onSet(row.state === 'offered' ? row.proposed! : '')}
      >
        {on && <Ico name="check" />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div>
          <b style={{ color: 'var(--dk-text)' }}>{row.label}</b>
          {row.required && !row.value && (
            <span style={{ color: 'var(--dk-amber)', marginLeft: 5 }}>required</span>
          )}
          <Tag state={row.state} />
        </div>

        {/* What is attached, even shut — an image nobody can see from the row
            is an image nobody remembers pasting. */}
        {!editing && shots.length > 0 && (
          <div className="sub" style={{ marginTop: 1 }}>
            {/* `display: inline-block`, because Tailwind's reset makes an
                `svg` a block and the icon would take a line of its own. */}
            <Ico name="img" style={{ display: 'inline-block', marginRight: 4, verticalAlign: '-2px' }} />
            {shots.length} screenshot{shots.length === 1 ? '' : 's'} under this heading
          </div>
        )}

        {/* What is there now — or, when there is nothing, why there is nothing. */}
        {!editing && (
          <div className="sub" style={{ marginTop: 1, whiteSpace: 'pre-wrap' }}>
            {row.value.trim()
              || (row.state === 'offered' ? row.proposed
                : row.why ? `It could not tell — ${row.why}`
                  : 'Nothing written, and it did not mention this one.')}
          </div>
        )}

        {editing && (row.options.length > 0 ? (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
            {row.options.map(o => (
              <button key={o} type="button"
                      className="btn"
                      style={{
                        padding: '3px 9px',
                        borderColor: row.value === o ? 'var(--dk-gh)' : undefined,
                        color: row.value === o ? 'var(--dk-gh)' : undefined,
                      }}
                      onClick={() => { onSet(row.value === o ? '' : o); onEdit(); }}>
                {o}
              </button>
            ))}
          </div>
        ) : (
          <>
            <textarea
              className="mdbody"
              autoFocus
              style={{ minHeight: 54, borderRadius: 7, marginTop: 4, width: '100%' }}
              value={row.value}
              placeholder={row.proposed || `What goes under “${row.label}”`}
              {...shotHandlers(row.label, draft, onDraft)}
              onChange={e => onSet(e.target.value)}
            />
            <GhFieldShots label={row.label} draft={draft} onDraft={onDraft} compact />
          </>
        ))}

        {/* The original is never lost, so changing your mind twice is free. */}
        {editing && row.state === 'edited' && (
          <button type="button" className="btn"
                  style={{ padding: '2px 9px', marginTop: 5 }}
                  onClick={() => onSet(row.proposed!)}>
            Put its answer back
          </button>
        )}
      </div>

      <button type="button" className="btn"
              style={{ padding: '2px 7px', marginTop: 1 }}
              title={editing ? 'Done' : `Edit ${row.label}`}
              onClick={onEdit}>
        <Ico name={editing ? 'check' : 'pen'} />
      </button>
    </div>
  );
}

/** One field, as the prompt sees it. A dropdown's options are its whole meaning. */
function describeField(f: FormField): string {
  const kind = f.options.length ? `one of: ${f.options.join(', ')}` : f.type;
  return `- ${f.label} (${kind})${f.required ? ' [required]' : ''}`;
}

/**
 * The JSON out of an answer that may be wrapped in prose or a fence.
 *
 * Models do this, and refusing a good answer over a stray "Here you go:" would
 * be a worse failure than reading around it.
 */
function readJson(text: string): Proposal | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const at = body.indexOf('{');
  const to = body.lastIndexOf('}');
  if (at < 0 || to <= at) return null;
  try {
    const parsed = JSON.parse(body.slice(at, to + 1)) as Proposal;
    return typeof parsed === 'object' && parsed ? parsed : null;
  } catch {
    return null;
  }
}
