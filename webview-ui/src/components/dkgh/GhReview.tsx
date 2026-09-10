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
import { BadgeChipView, ButtonView, MarkdownEditorView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import {
  ChevronLeftIcon, CheckCircleIcon, WarningTriangleIcon, SparkleIcon,
  ExternalLinkIcon, CopyIcon, DuplicateIcon, IssueOpenedIcon,
} from '../../icons';
import {
  created, findDuplicates, provenanceSummary, readProvenance, retryable,
  type DuplicateCandidate, type StepOutcome,
} from './review-model';
import { colourOf } from './field-colour';
import type { BoardIssue, ProposedDimension } from './board-types';
import type { Draft } from './composer-model';
import { ACCENT } from './types';

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
          <ButtonView size="sm" variant="ghost" accentColor="var(--color-text-muted)"
                      iconLeft={<ChevronLeftIcon size={12} />} onClick={onBack}>
            Back to editing
          </ButtonView>
          <span className="text-[12px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
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
          <MarkdownEditorView
            value={request.body}
            onChange={onBody}
            accentColor={ACCENT}
            size="sm"
            style={{ minHeight: 260 }}
          />
          <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
            Editing here does not re-run anything. Your words, final.
          </span>
        </div>

        {/* 13A — where each part came from */}
        <div className="flex flex-col gap-1">
          <Head>Two things to look at</Head>
          <div className="rounded-lg border px-2.5 py-2 flex flex-col gap-1.5"
               style={{ borderColor: 'var(--color-surface-border)',
                        background: 'var(--color-panel)' }}>
            <span className="flex items-start gap-1.5 text-[10px]"
                  style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
              <SparkleIcon size={10} style={{ marginTop: 2, flexShrink: 0, color: ACCENT }} />
              <span>{provenanceSummary(parts)}</span>
            </span>
            {parts.filter(p => p.provenance !== 'you').map(p => (
              <span key={p.heading} className="flex items-start gap-1.5 text-[10px]"
                    style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                <BadgeChipView
                  tone={p.provenance === 'model' ? ACCENT : 'var(--color-text-muted)'}
                  size="xs"
                >
                  {p.heading || 'body'}
                </BadgeChipView>
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
             borderLeft: '1px solid var(--color-surface-border)',
             padding: '12px 10px',
           }}>

        <div className="flex flex-col gap-1">
          <Head>Will be set</Head>
          <div className="rounded-lg border flex flex-col overflow-hidden"
               style={{ borderColor: 'var(--color-surface-border)' }}>
            <Row label="Title">{request.title || <Amber>not set</Amber>}</Row>
            <Row label="Labels">
              {request.labels.length
                ? <span className="flex gap-1 flex-wrap">
                    {request.labels.map(l => (
                      <BadgeChipView key={l} tone={ACCENT} size="xs">{l}</BadgeChipView>
                    ))}
                  </span>
                : '—'}
            </Row>
            <Row label="Assignee">{request.assignees.join(', ') || '—'}</Row>
            <Row label="Milestone">{request.milestone ?? '—'}</Row>
            {Object.entries(draft.answers).filter(([, v]) => v.trim()).map(([label, value]) => (
              <Row key={label} label={label}>
                <BadgeChipView
                  tone={colourOf(value, dimensions.find(d =>
                    label.toLowerCase().includes(d.dimension))?.options)}
                  size="xs"
                >
                  {value}
                </BadgeChipView>
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
                    <span className="flex items-center justify-center text-[9px] font-mono"
                          style={{
                            width: 14, height: 14, borderRadius: 4,
                            background: step.unavailable
                              ? 'var(--color-surface-border)'
                              : `color-mix(in srgb, ${ACCENT} 22%, transparent)`,
                            color: step.unavailable ? 'var(--color-text-muted)' : ACCENT,
                          }}>
                      {at + 1}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                      {step.does}
                    </span>
                  </span>
                  <code className="text-[9px] px-1.5 py-1 rounded truncate"
                        title={step.display}
                        style={{
                          background: 'var(--color-panel)',
                          border: '1px solid var(--color-surface-border)',
                          color: 'var(--color-text-muted)',
                        }}>
                    {step.display}
                  </code>
                  {step.unavailable && (
                    <span className="text-[9px]" style={{ color: 'var(--color-warning)', lineHeight: 1.5 }}>
                      {step.unavailable}
                    </span>
                  )}
                </div>
              ))}
              <span className="text-[9px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
                Step 1 is the one that matters and it goes first. If a later step fails the issue
                still exists with its title, body and evidence — and the result says which fields
                did not land, with a button to retry just those.
              </span>
            </div>
          ) : (
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              Working out what it would run…
            </span>
          )}
        </div>

        {plan?.refusal && (
          <span className="text-[10px]" style={{ color: 'var(--color-error)' }}>{plan.refusal}</span>
        )}

        <span className="flex-1" />

        <div className="flex flex-col gap-1.5">
          <ButtonView
            size="md"
            variant="primary"
            accentColor={ACCENT}
            disabled={!plan || !!plan.refusal || running || blocking}
            iconLeft={<CheckCircleIcon size={12} />}
            onClick={() => postMsg({ type: 'dkgh:applyCreate', request })}
          >
            {running ? 'Creating…'
              : `Create issue${plan ? ` · ${plan.steps.filter(s => !s.unavailable).length} calls` : ''}`}
          </ButtonView>
          {blocking && (
            <span className="text-[9px]" style={{ color: 'var(--color-warning)', lineHeight: 1.5 }}>
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
    <div className="flex flex-col gap-1.5 rounded-lg px-2.5 py-2"
         style={{
           border: '1px solid color-mix(in srgb, var(--color-warning) 34%, transparent)',
           background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
         }}>
      <span className="flex items-center gap-1.5">
        <DuplicateIcon size={11} style={{ color: 'var(--color-warning)' }} />
        <span className="text-[10.5px]" style={{ color: 'var(--color-text-primary)' }}>
          <b>Possibly already filed.</b>{' '}
          <span style={{ color: 'var(--color-text-muted)' }}>
            {candidates.length === 1 ? 'One open issue describes' : `${candidates.length} issues describe`}
            {' '}something close to this.
          </span>
        </span>
        <span className="flex-1" />
        {!ignored && (
          <ButtonView size="sm" variant="ghost" accentColor="var(--color-text-muted)"
                      onClick={onIgnore}>
            Ignore and create
          </ButtonView>
        )}
      </span>

      {candidates.map(c => (
        <div key={c.issue.number} className="flex flex-col gap-1 rounded px-2 py-1.5"
             style={{ background: 'var(--color-panel)' }}>
          <span className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono" style={{ color: ACCENT }}>
              #{c.issue.number}
            </span>
            <span className="text-[10.5px] truncate" style={{ color: 'var(--color-text-primary)' }}>
              {c.issue.title}
            </span>
            <span className="flex-1" />
            <BadgeChipView
              tone={c.strength === 'strong' ? 'var(--color-warning)' : 'var(--color-text-muted)'}
              size="xs"
            >
              {c.strength} match
            </BadgeChipView>
          </span>
          {/* The explanation, not a score. "92% similar" is unfalsifiable. */}
          <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
            {c.reasons.join('. ')}.
          </span>
          <span className="flex gap-1.5">
            <ButtonView size="sm" accentColor="var(--color-text-muted)"
                        iconLeft={<ExternalLinkIcon size={10} />}
                        onClick={() => window.open(c.issue.url, '_blank')}>
              Open it
            </ButtonView>
            <ButtonView size="sm" accentColor={ACCENT}
                        onClick={() => window.open(`${c.issue.url}#new_comment_field`, '_blank')}>
              Comment on it instead
            </ButtonView>
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
          <div className="flex flex-col gap-2 rounded-xl px-3 py-3"
               style={{
                 border: `1px solid color-mix(in srgb, ${ACCENT} 40%, transparent)`,
                 background: `color-mix(in srgb, ${ACCENT} 7%, transparent)`,
               }}>
            {/* The card is what got created, not a checkmark — every chip is a
                value you chose, shown back so a wrong one is caught in the two
                seconds you are still looking. */}
            <span className="flex items-center gap-2">
              <span className="text-[12px] font-mono" style={{ color: ACCENT }}>
                #{result.number}
              </span>
              <span className="text-[12px]" style={{ color: 'var(--color-text-primary)' }}>
                {request.title}
              </span>
            </span>
            <span className="flex gap-1 flex-wrap">
              {request.labels.map(l => (
                <BadgeChipView key={l} tone={ACCENT} size="xs">{l}</BadgeChipView>
              ))}
              {Object.entries(draft.answers).filter(([, v]) => v.trim()).map(([label, v]) => (
                <BadgeChipView
                  key={label}
                  tone={colourOf(v, dimensions.find(d =>
                    label.toLowerCase().includes(d.dimension))?.options)}
                  size="xs"
                >
                  {v}
                </BadgeChipView>
              ))}
              {request.assignees.map(a => (
                <BadgeChipView key={a} tone="var(--color-text-muted)" size="xs">{a}</BadgeChipView>
              ))}
            </span>
            <span className="flex gap-1.5 flex-wrap">
              {/* Telling somebody is what happens next about nine times in ten. */}
              <ButtonView size="sm" variant="primary" accentColor={ACCENT}
                          iconLeft={<CopyIcon size={11} />}
                          onClick={() => navigator.clipboard?.writeText(url)}>
                Copy the link
              </ButtonView>
              <ButtonView size="sm" accentColor="var(--color-text-muted)"
                          iconLeft={<ExternalLinkIcon size={11} />}
                          onClick={() => window.open(url, '_blank')}>
                Open on github.com
              </ButtonView>
              <ButtonView size="sm" accentColor="var(--color-text-muted)"
                          iconLeft={<IssueOpenedIcon size={11} />}
                          onClick={onAnother}>
                File another like this
              </ButtonView>
            </span>
            <span className="text-[9px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              “File another like this” keeps the module, environment, type, labels and assignee,
              and clears the title, body and evidence.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 rounded-xl px-3 py-3"
               style={{
                 border: '1px solid color-mix(in srgb, var(--color-error) 40%, transparent)',
                 background: 'color-mix(in srgb, var(--color-error) 7%, transparent)',
               }}>
            <span className="text-[12px]" style={{ color: 'var(--color-text-primary)' }}>
              <b>Nothing was created.</b>
            </span>
            <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
              Step 1 failed. Your draft is untouched and every image you added is still on it.
            </span>
            <ButtonView size="sm" variant="primary" accentColor={ACCENT} onClick={onBack}>
              Back to editing
            </ButtonView>
          </div>
        )}

        {/* Where things went, step by step */}
        <div className="flex flex-col gap-1">
          <Head>{exists ? 'Where things went' : 'What happened'}</Head>
          <div className="rounded-lg border flex flex-col overflow-hidden"
               style={{ borderColor: 'var(--color-surface-border)' }}>
            {result.outcomes.map((o, at) => (
              <div key={`${o.kind}-${at}`} className="flex items-start gap-1.5 px-2.5 py-1.5"
                   style={{
                     borderTop: at === 0 ? 'none'
                       : '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)',
                   }}>
                <span style={{
                  marginTop: 2,
                  flexShrink: 0,
                  color: o.ok ? 'var(--color-success)'
                    : o.skipped ? 'var(--color-text-muted)' : 'var(--color-error)',
                }}>
                  {o.ok ? <CheckCircleIcon size={10} />
                    : o.skipped ? '·' : <WarningTriangleIcon size={10} />}
                </span>
                <span className="text-[10px]" style={{ lineHeight: 1.5 }}>
                  <span style={{ color: 'var(--color-text-primary)' }}>{o.does}</span>
                  {o.error && (
                    <>
                      <span style={{ color: 'var(--color-text-muted)' }}> — </span>
                      {/* gh's own words, verbatim and with its field. "Validation
                          Failed" alone sends people to a browser to guess. */}
                      <span style={{ color: o.skipped ? 'var(--color-text-muted)' : 'var(--color-error)' }}>
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
              <ButtonView size="sm" variant="primary" accentColor={ACCENT}
                          disabled={running}
                          onClick={() => onRetry(canRetry)}>
                {running ? 'Retrying…' : `Retry those ${canRetry.length}`}
              </ButtonView>
              {exists && (
                <ButtonView size="sm" accentColor="var(--color-text-muted)"
                            onClick={() => window.open(url, '_blank')}>
                  Open #{result.number}
                </ButtonView>
              )}
              <ButtonView size="sm" variant="ghost" accentColor="var(--color-text-muted)"
                          onClick={onDismiss}>
                Leave it
              </ButtonView>
            </span>
            {/* The reason there is no blanket "try again". */}
            <span className="text-[9px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              Retry is per failed step, never the whole sequence — re-running step 1 would file a
              second copy of an issue that already exists.
            </span>
          </div>
        )}

        <div className="text-[9.5px]" style={{ color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
          Filed against <code>{repo}</code>. It is an ordinary issue with an ordinary URL — every
          screen in dkgh links out to it.
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

function Head({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-bold uppercase tracking-[.09em]"
          style={{ color: 'var(--color-text-muted)' }}>
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-start gap-2 px-2.5 py-1.5"
          style={{ borderTop: '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)' }}>
      <span className="text-[9.5px] flex-shrink-0"
            style={{ color: 'var(--color-text-muted)', width: 74 }}>
        {label}
      </span>
      <span className="text-[10px] flex-1 min-w-0"
            style={{ color: 'var(--color-text-primary)', overflowWrap: 'anywhere' }}>
        {children}
      </span>
    </span>
  );
}

function Amber({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--color-warning)' }}>{children}</span>;
}
