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
 * **11D — no model configured** is a first-class state, not an error toast. It
 * says which screen fixes it.
 *
 * **11E — what the model was actually told** is on the screen, behind a
 * disclosure. Not a paraphrase of the prompt: the prompt.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Ico } from './GhIcons';
import { GhClose } from './GhClose';
import { CopyWord, GhNote } from './GhShell';
import { sendAiRequest, newAiRequestId } from '../../services/ai/ai-client';
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import type { Draft } from './composer-model';
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

interface Proposal {
  title?: string;
  answers?: Record<string, string>;
  unanswered?: { label: string; why: string }[];
  notes?: string;
}

export function GhGenerate({ repo, form, draft, onDraft, onClose }: {
  repo: string;
  /** The template this issue is being filed against. */
  form?: IssueForm;
  draft: Draft;
  onDraft: (change: Partial<Draft>) => void;
  onClose: () => void;
}) {
  const providers = useAiProvidersStore(s => s.providers);
  const templates = useAiPromptTemplatesStore(s => s.templates);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState(lastFailure);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [asking, setAsking] = useState(0);
  const [showPrompt, setShowPrompt] = useState(false);
  const acc = useRef('');
  const id = useRef('');

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
  const prompts = useMemo(() => {
    const system = templates['dkgh.compose.system'] ?? '';
    const user = (templates['dkgh.compose'] ?? '')
      /* Every occurrence, not the first. `String.replace` with a string
         argument substitutes once, so a prompt somebody edited to mention
         {{fields}} twice would ship the second one as literal text. */
      .replace(/\{\{\s*repo\s*\}\}/g, repo)
      .replace(/\{\{\s*template\s*\}\}/g, form?.name ?? 'no template')
      .replace(/\{\{\s*fields\s*\}\}/g, fields.map(describeField).join('\n'))
      .replace(/\{\{\s*description\s*\}\}/g, draft.description || '(nothing written yet)');
    return { system, user };
  }, [templates, repo, form, fields, draft.description]);

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

  /** Take one answer into the draft. 11C — and out again. */
  const answer = (label: string, value: string) => onDraft({
    answers: { ...draft.answers, [label]: value },
  });

  const open = proposal?.unanswered ?? [];
  const question = open[asking];
  const field = question ? fields.find(f => f.label === question.label) : undefined;

  return (
    <div className="opt" style={{ marginTop: 10 }}>
      <div className="oh">
        <Ico name="ai" style={{ color: 'var(--dk-gh)' }} />
        Generate with AI
        <span className="sp" />
        {proposal && (
          <span className="cx">
            {Object.keys(draft.answers).filter(k => draft.answers[k]).length} of {fields.length}{' '}
            answered
          </span>
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

          {!proposal && (
            <div className="actions" style={{ justifyContent: 'flex-start' }}>
              <button
                type="button"
                className="btn ai"
                disabled={running || !draft.description.trim()}
                title={draft.description.trim()
                  ? undefined
                  : 'Write a sentence about what happened first — there is nothing to read yet'}
                onClick={ask}
              >
                <Ico name="ai" />{running ? 'Reading what you wrote…' : 'Read what I wrote'}
              </button>
            </div>
          )}

          {error && (
            <GhNote title="That did not come back" tone="warn" style={{ margin: 0 }}>
              {error}
            </GhNote>
          )}

          {proposal && (
            <>
              {proposal.title && !draft.title && (
                <div className="fct" style={{ cursor: 'default' }}>
                  <Ico name="pen" style={{ color: 'var(--dk-gh)', flexShrink: 0 }} />
                  <span>Suggested title: <b>{proposal.title}</b></span>
                  <span className="sp" style={{ flex: 1 }} />
                  <button type="button" className="btn" style={{ padding: '2px 9px' }}
                          onClick={() => onDraft({ title: proposal.title })}>
                    Use it
                  </button>
                </div>
              )}

              {Object.entries(proposal.answers ?? {}).length > 0 && (
                <div className="opt" style={{ gap: 2, padding: 4 }}>
                  {Object.entries(proposal.answers ?? {}).map(([label, value]) => {
                    const taken = draft.answers[label] === value;
                    return (
                      <div key={label} className={`fct${taken ? ' on' : ''}`}
                           style={{ cursor: 'pointer' }}
                           onClick={() => answer(label, taken ? '' : value)}
                           title={taken ? 'Click to drop it again' : 'Click to take it'}>
                        <span className="bx">{taken && <Ico name="check" />}</span>
                        <b style={{ color: 'var(--dk-text)' }}>{label}</b>
                        <span>{value}</span>
                      </div>
                    );
                  })}
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

              {!question && open.length > 0 && (
                <div className="sub">
                  That was all of them. Every answer is a row above — click one to change your
                  mind.
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
