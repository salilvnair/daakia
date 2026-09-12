/**
 * Screen 13, with 13A to 13E — review before it is created.
 *
 * **Nothing reaches GitHub without this screen.** This is somebody's real
 * repository and a surprise write to it is unforgivable, so the exact sequence
 * is printed above the button that runs it.
 *
 * The body is editable here, and this is the last cheap moment: fixing a wrong
 * word now costs a keystroke, and fixing it after costs an edit, a notification
 * to everyone watching, and a comment explaining the edit.
 *
 * The sequence is numbered because creating is not one call. Step one files the
 * issue; everything after it edits an issue that already exists. The Project
 * rows are drawn and greyed rather than hidden — somebody who set a priority
 * needs to see it will not be written *before* pressing anything, not discover
 * the gap later on the board.
 */
import { useEffect, useMemo, useState } from 'react';
import { postMsg } from '../../vscode';
import { openExternal } from './open-external';
import { Ico } from './GhIcons';
import { GhNote } from './GhShell';
import {
  created, findDuplicates, provenanceSummary, readProvenance, retryable,
  type DuplicateCandidate, type StepOutcome,
} from './review-model';
import { colourOf } from './field-colour';
import type { BoardIssue, ProposedDimension } from './board-types';
import type { Draft } from './composer-model';

interface CreateStep {
  kind: StepOutcome['kind'];
  does: string;
  display: string;
  unavailable?: string;
}
interface CreatePlan { steps: CreateStep[]; body: string; refusal?: string }
interface CreateResult {
  outcomes: StepOutcome[];
  url?: string;
  number?: number;
  partial: boolean;
  refusal?: string;
}

export function GhReview({
  repo, draft, request, dimensions, issues, onBack, onBody, onFiled, onAnother,
}: {
  repo: string;
  draft: Draft;
  /** Exactly what will be sent — the composer built it, this screen shows it. */
  request: {
    repo: string; title: string; body: string;
    labels: string[]; assignees: string[]; milestone?: string;
  };
  dimensions: ProposedDimension[];
  issues: BoardIssue[];
  onBack: () => void;
  /** Editing here rewrites the body and never re-runs anything. */
  onBody: (body: string) => void;
  onFiled: (url: string) => void;
  /** 13E — keep the classification, clear the words. */
  onAnother: () => void;
}) {
  const [plan, setPlan] = useState<CreatePlan | undefined>();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CreateResult | undefined>();
  const [ignoredDuplicates, setIgnoredDuplicates] = useState(false);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'dkgh:planCreate:result') { setPlan(msg.plan as CreatePlan); return; }
      if (msg.type === 'dkgh:applyCreate:running') { setRunning(true); return; }
      if (msg.type !== 'dkgh:applyCreate:result') return;
      setRunning(false);
      const r = msg as unknown as CreateResult;
      setResult(prev => (prev
        /* A retry reports only the steps it ran, so its outcomes are merged
           over the first attempt's rather than replacing them — otherwise the
           result screen forgets the issue it just created. */
        ? { ...r, outcomes: merge(prev.outcomes, r.outcomes), number: r.number ?? prev.number,
            url: r.url ?? prev.url }
        : r));
      if (created(r.outcomes) && !r.partial && r.url) onFiled(r.url);
    };
    window.addEventListener('message', handler);
    postMsg({ type: 'dkgh:planCreate', request });
    return () => window.removeEventListener('message', handler);
    /* Re-planned whenever the request changes — the command shown and the
       command run are produced by one function on the host. */
  }, [JSON.stringify(request)]);

  const parts = useMemo(() => readProvenance(request.body), [request.body]);
  const duplicates = useMemo(
    () => findDuplicates(draft, issues, dimensions.map(d => d.dimension)),
    [draft, issues, dimensions],
  );

  if (result) {
    return (
      <GhCreated
        repo={repo}
        result={result}
        request={request}
        draft={draft}
        dimensions={dimensions}
        running={running}
        onRetry={kinds => postMsg({
          type: 'dkgh:applyCreate', request, only: kinds, number: result.number,
        })}
        onBack={onBack}
        onAnother={onAnother}
        onDismiss={() => setResult(undefined)}
      />
    );
  }

  const blocking = duplicates.some(d => d.strength === 'strong') && !ignoredDuplicates;

  return (
    <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">

      {/* The body, editable — the last cheap moment */}
      <div className="flex-1 min-w-0 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button type="button" className="btn" onClick={onBack}>Back to editing</button>
          <span style={{ fontSize: 14.4, fontWeight: 500, color: 'var(--dk-text)' }}>
            Review before it is created
          </span>
        </div>

        {/* 13C — you may be about to file this twice */}
        {duplicates.length > 0 && (
          <Duplicates
            candidates={duplicates}
            ignored={ignoredDuplicates}
            onIgnore={() => setIgnoredDuplicates(true)}
          />
        )}

        <div className="flex flex-col gap-1">
          <Head>Issue body — editable, this is the Markdown that will be posted</Head>
          {/*
            The composer's own editor, not a second one.

            This is the same box, two screens apart — the reader has just
            spent five minutes in it. A different editor here, with a
            different toolbar and a different font, reads as a different
            document rather than the one they wrote.
          */}
          <textarea
            className="mdbody"
            value={request.body}
            onChange={e => onBody(e.target.value)}
            style={{ minHeight: 260 }}
          />
          <span className="sub">Editing here does not re-run anything. Your words, final.</span>
        </div>

        {/* 13A — where each part came from */}
        <div className="flex flex-col gap-1">
          <Head>Two things to look at</Head>
          <div className="opt">
            <span className="flex items-start gap-1.5 sub" style={{ lineHeight: 1.6 }}>
              <Ico name="ai" style={{ marginTop: 2, flexShrink: 0, color: 'var(--dk-gh)' }} />
              <span>{provenanceSummary(parts)}</span>
            </span>
            {parts.filter(p => p.provenance !== 'you').map(p => (
              <span key={p.heading} className="flex items-start gap-1.5 sub"
                    style={{ lineHeight: 1.6 }}>
                <span className={p.provenance === 'model' ? 'chip c-gh' : 'chip'}>
                  {p.heading || 'body'}
                </span>
                <span>{p.note}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* What will be set, and what will run */}
      <div className="flex-shrink-0 overflow-y-auto flex flex-col gap-3"
           style={{
             width: 300,
             borderLeft: '1px solid var(--dk-border)',
             padding: '12px 10px',
           }}>

        <div className="flex flex-col gap-1">
          <Head>Will be set</Head>
          <div className="opt" style={{ gap: 0, padding: 0 }}>
            <Row label="Title">{request.title || <Amber>not set</Amber>}</Row>
            <Row label="Labels">
              {request.labels.length
                ? <span className="flex gap-1 flex-wrap">
                    {request.labels.map(l => <span key={l} className="chip c-gh">{l}</span>)}
                  </span>
                : '—'}
            </Row>
            <Row label="Assignee">{request.assignees.join(', ') || '—'}</Row>
            <Row label="Milestone">{request.milestone ?? '—'}</Row>
            {Object.entries(draft.answers).filter(([, v]) => v.trim()).map(([label, value]) => (
              <Row key={label} label={label}>
                <Swatch value={value} dimensions={dimensions} label={label} />
              </Row>
            ))}
            <Row label="Evidence">
              {draft.evidence.length
                ? `${draft.evidence.length} image${draft.evidence.length === 1 ? '' : 's'}, linked in the body`
                : '—'}
            </Row>
          </div>
        </div>

        {/* 13B — the numbered sequence */}
        <div className="flex flex-col gap-1">
          <Head>What pressing Create runs</Head>
          {plan ? (
            <div className="flex flex-col gap-1.5">
              {plan.steps.map((step, at) => (
                <div key={`${step.kind}-${at}`} className="flex flex-col gap-0.5"
                     style={{ opacity: step.unavailable ? 0.6 : 1 }}>
                  <span className="flex items-center gap-1.5">
                    <span className="flex items-center justify-center"
                          style={{
                            width: 16.8, height: 16.8, borderRadius: 4.8,
                            fontFamily: 'var(--mono)', fontSize: 10.8,
                            background: step.unavailable
                              ? 'var(--dk-raised)'
                              : 'color-mix(in srgb, var(--dk-gh) 22%, transparent)',
                            color: step.unavailable ? 'var(--dk-faint)' : 'var(--dk-gh)',
                          }}>
                      {at + 1}
                    </span>
                    <span className="sub">{step.does}</span>
                  </span>
                  <code className="truncate" title={step.display}
                        style={{ display: 'block', fontSize: 11.4, padding: '3px 6px' }}>
                    {step.display}
                  </code>
                  {step.unavailable && (
                    <span className="sub" style={{ color: 'var(--dk-amber)' }}>
                      {step.unavailable}
                    </span>
                  )}
                </div>
              ))}
              <span className="sub" style={{ lineHeight: 1.55 }}>
                Step 1 is the one that matters and it goes first. If a later step fails the issue
                still exists with its title, body and evidence — and the result says which fields
                did not land, with a button to retry just those.
              </span>
            </div>
          ) : (
            <span className="sub">Working out what it would run…</span>
          )}
        </div>

        {plan?.refusal && (
          <span className="sub" style={{ color: 'var(--dk-red)' }}>{plan.refusal}</span>
        )}

        <span className="flex-1" />

        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            className="btn go"
            disabled={!plan || !!plan.refusal || running || blocking}
            onClick={() => postMsg({ type: 'dkgh:applyCreate', request })}
          >
            <Ico name="check" />
            {running ? 'Creating…'
              : `Create issue${plan ? ` · ${callCount(plan)}` : ''}`}
          </button>
          {blocking && (
            <span className="sub" style={{ color: 'var(--dk-amber)' }}>
              Something close to this is already open. Nothing is blocked for long — press
              “Ignore and create” above if it is genuinely different.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 13C — the three things somebody actually does about a suspected duplicate.
 *
 * **Nothing is merged and nothing is refused for good.** Duplicate detection
 * that refuses to file is duplicate detection people learn to defeat by
 * rewording — so the strong match holds the button until it has been read once,
 * and then gets out of the way.
 */
function Duplicates({ candidates, ignored, onIgnore }: {
  candidates: DuplicateCandidate[];
  ignored: boolean;
  onIgnore: () => void;
}) {
  return (
    <div className="opt" style={{
      border: '1px solid color-mix(in srgb, var(--dk-amber) 34%, transparent)',
      background: 'color-mix(in srgb, var(--dk-amber) 8%, transparent)',
    }}>
      <span className="flex items-center gap-1.5">
        <Ico name="copy" style={{ color: 'var(--dk-amber)' }} />
        <span style={{ color: 'var(--dk-text)' }}>
          <b>Possibly already filed.</b>{' '}
          <span style={{ color: 'var(--dk-faint)' }}>
            {candidates.length === 1 ? 'One open issue describes' : `${candidates.length} issues describe`}
            {' '}something close to this.
          </span>
        </span>
        <span className="sp" style={{ flex: 1 }} />
        {!ignored && (
          <button type="button" className="btn" onClick={onIgnore}>Ignore and create</button>
        )}
      </span>

      {candidates.map(c => (
        <div key={c.issue.number} className="flex flex-col gap-1 rounded px-2 py-1.5"
             style={{ background: 'var(--dk-panel)', borderRadius: 7.2 }}>
          <span className="flex items-center gap-1.5">
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--dk-gh)' }}>
              #{c.issue.number}
            </span>
            <span className="truncate" style={{ color: 'var(--dk-text)' }}>{c.issue.title}</span>
            <span className="sp" style={{ flex: 1 }} />
            <span className={c.strength === 'strong' ? 'chip c-stale' : 'chip'}>
              {c.strength} match
            </span>
          </span>
          {/* The explanation, not a score. "92% similar" is unfalsifiable. */}
          <span className="sub" style={{ lineHeight: 1.55 }}>{c.reasons.join('. ')}.</span>
          <span className="flex gap-1.5">
            <button type="button" className="btn"
                    onClick={() => openExternal(c.issue.url)}>
              <Ico name="link" />Open it
            </button>
            <button type="button" className="btn alt"
                    onClick={() => openExternal(`${c.issue.url}#new_comment_field`)}>
              <Ico name="cmt" />Comment on it instead
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * 13D and 13E — what happened, and what happens next.
 *
 * Left says what did not happen, right says what did. **The draft is never
 * discarded on failure**, in either case: not where nothing was created, and
 * not where retrying needs the values it was going to send.
 */
function GhCreated({
  repo, result, request, draft, dimensions, running, onRetry, onBack, onAnother, onDismiss,
}: {
  repo: string;
  result: CreateResult;
  request: { title: string; labels: string[]; assignees: string[]; milestone?: string };
  draft: Draft;
  dimensions: ProposedDimension[];
  running: boolean;
  onRetry: (kinds: StepOutcome['kind'][]) => void;
  onBack: () => void;
  onAnother: () => void;
  onDismiss: () => void;
}) {
  const exists = created(result.outcomes);
  const canRetry = retryable(result.outcomes);
  const url = result.url ?? '';

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col items-center">
      <div className="w-full flex flex-col gap-3" style={{ maxWidth: 560 }}>

        {exists ? (
          <div className="opt pick">
            {/* The card is what got created, not a checkmark — every chip is a
                value you chose, shown back so a wrong one is caught in the two
                seconds you are still looking. */}
            <span className="oh">
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--dk-gh)' }}>
                #{result.number}
              </span>
              {request.title}
            </span>
            <span className="flex gap-1 flex-wrap">
              {request.labels.map(l => <span key={l} className="chip c-gh">{l}</span>)}
              {Object.entries(draft.answers).filter(([, v]) => v.trim()).map(([label, v]) => (
                <Swatch key={label} value={v} dimensions={dimensions} label={label} />
              ))}
              {request.assignees.map(a => <span key={a} className="chip">{a}</span>)}
            </span>
            <span className="flex gap-1.5 flex-wrap">
              {/* Telling somebody is what happens next about nine times in ten. */}
              <button type="button" className="btn go"
                      onClick={() => navigator.clipboard?.writeText(url)}>
                <Ico name="copy" />Copy the link
              </button>
              <button type="button" className="btn" onClick={() => openExternal(url)}>
                <Ico name="link" />Open on github.com
              </button>
              <button type="button" className="btn" onClick={onAnother}>
                <Ico name="issue" />File another like this
              </button>
            </span>
            <span className="sub">
              “File another like this” keeps the module, environment, type, labels and assignee,
              and clears the title, body and evidence.
            </span>
          </div>
        ) : (
          <div className="opt" style={{
            border: '1px solid color-mix(in srgb, var(--dk-red) 40%, transparent)',
            background: 'color-mix(in srgb, var(--dk-red) 7%, transparent)',
          }}>
            <span className="oh"><Ico name="warn" style={{ color: 'var(--dk-red)' }} />
              Nothing was created.
            </span>
            <span className="sub" style={{ lineHeight: 1.6 }}>
              Step 1 failed. Your draft is untouched and every image you added is still on it.
            </span>
            <span>
              <button type="button" className="btn go" onClick={onBack}>Back to editing</button>
            </span>
          </div>
        )}

        {/* Where things went, step by step */}
        <div className="flex flex-col gap-1">
          <Head>{exists ? 'Where things went' : 'What happened'}</Head>
          <div className="opt" style={{ gap: 2, padding: 4 }}>
            {result.outcomes.map((o, at) => (
              <div key={`${o.kind}-${at}`} className="fct"
                   style={{ alignItems: 'flex-start', cursor: 'default' }}>
                <span style={{
                  marginTop: 2,
                  flexShrink: 0,
                  color: o.ok ? 'var(--dk-green)'
                    : o.skipped ? 'var(--dk-faint)' : 'var(--dk-red)',
                }}>
                  {o.skipped ? '·' : <Ico name={o.ok ? 'check' : 'warn'} />}
                </span>
                <span style={{ lineHeight: 1.5 }}>
                  <span style={{ color: 'var(--dk-text)' }}>{o.does}</span>
                  {o.error && (
                    <>
                      <span> — </span>
                      {/* gh's own words, verbatim and with its field. "Validation
                          Failed" alone sends people to a browser to guess. */}
                      <span style={{ color: o.skipped ? 'var(--dk-faint)' : 'var(--dk-red)' }}>
                        {o.error}
                      </span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        {canRetry.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2">
              <button type="button" className="btn go" disabled={running}
                      onClick={() => onRetry(canRetry)}>
                {running ? 'Retrying…' : `Retry those ${canRetry.length}`}
              </button>
              {exists && (
                <button type="button" className="btn" onClick={() => openExternal(url)}>
                  Open #{result.number}
                </button>
              )}
              <button type="button" className="btn" onClick={onDismiss}>Leave it</button>
            </span>
            {/* The reason there is no blanket "try again". */}
            <span className="sub">
              Retry is per failed step, never the whole sequence — re-running step 1 would file
              a second copy of an issue that already exists.
            </span>
          </div>
        )}

        <div className="sub" style={{ lineHeight: 1.55 }}>
          Filed against <code>{repo}</code>. It is an ordinary issue with an ordinary URL —
          every screen in dkgh links out to it.
        </div>
      </div>
    </div>
  );
}

// ── Furniture ───────────────────────────────────────────────────────────────

/** A retry's outcomes, laid over the first attempt's rather than replacing them. */
function merge(before: StepOutcome[], after: StepOutcome[]): StepOutcome[] {
  const byKind = new Map(after.filter(o => !o.skipped).map(o => [o.kind, o]));
  return before.map(o => byKind.get(o.kind) ?? o);
}

/** "1 call", not "1 calls" — it is the first thing read on this screen. */
function callCount(plan: CreatePlan): string {
  const n = plan.steps.filter(s => !s.unavailable).length;
  return `${n} call${n === 1 ? '' : 's'}`;
}

/** A field label, the mock's own. */
function Head({ children }: { children: React.ReactNode }) {
  return <span className="fl">{children}</span>;
}

/** One thing that will be set, and what it will be set to. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="fct" style={{ alignItems: 'flex-start', cursor: 'default' }}>
      <span className="flex-shrink-0" style={{ width: 74, color: 'var(--dk-faint)' }}>
        {label}
      </span>
      <span className="flex-1 min-w-0"
            style={{ color: 'var(--dk-text)', overflowWrap: 'anywhere' }}>
        {children}
      </span>
    </span>
  );
}

/**
 * A dimension's value, in the colour the board gives it.
 *
 * The colour is the point: the chip here and the chip on the card that appears
 * a second later have to be the same one, or the board looks like it filed
 * something else.
 */
function Swatch({ value, label, dimensions }: {
  value: string;
  label: string;
  dimensions: ProposedDimension[];
}) {
  const tone = colourOf(value, dimensions.find(d =>
    label.toLowerCase().includes(d.dimension))?.options);
  return (
    <span
      className="chip"
      style={{
        color: tone,
        borderColor: `color-mix(in srgb, ${tone} 45%, transparent)`,
        background: `color-mix(in srgb, ${tone} 13%, transparent)`,
      }}
    >
      {value}
    </span>
  );
}

/** Something not set that probably should be. */
function Amber({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--dk-amber)' }}>{children}</span>;
}
