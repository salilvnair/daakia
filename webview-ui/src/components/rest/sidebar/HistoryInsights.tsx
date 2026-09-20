/**
 * What History says at the top, and which of it says it first.
 *
 * ── Why one strip rather than three cards ──
 *
 * There are three things worth telling somebody about their history: a secret
 * is somewhere it should not be, an endpoint that used to work has stopped, and
 * a request you keep sending is not in any collection. Stacked, they are a
 * column of notices above the list you came here to read, and the cost of that
 * is not the space — it is that people stop reading the area entirely.
 *
 * So one card shows at a time, ranked by what it would cost to miss it:
 *
 * 1. **A secret in the wrong place.** The only one that is somebody else's
 *    problem if ignored.
 * 2. **An endpoint that just broke.** Something is wrong now.
 * 3. **Save this, you keep sending it.** A convenience.
 *
 * Nothing is hidden: when there is more than one, a pager says so and steps
 * through them. Ranking is about order, not about suppression — a sweep finding
 * that only appeared once you dismissed a save suggestion would be a security
 * check you could lose by being tidy.
 *
 * ── Where the model is, and is not ──
 *
 * Every card here is complete without one. The counting, the boundary, the diff
 * and the sweep are all arithmetic over rows Daakia already has. Two buttons
 * ask a model for a *sentence* — a better name, and why a diff would break
 * something — and both reuse an existing feature with its existing switch, so
 * neither adds a thing that can be on for one screen and off for another.
 */
import { useEffect, useMemo, useState } from 'react';
import { CloseIcon, SaveIcon, SparkleIcon, ChevronRightIcon, ExternalLinkIcon } from '../../../icons';
import { SaveRequestModal } from '../../shared';
import { isAiFeatureOn } from '../../../store/ai-features-store';
import { logUiEvent } from '../../../store/ui-audit-store';
import { useEnvStore } from '../../../store/env-store';
import { askForName, askWhyItBroke, readNameAnswer } from '../../../services/history-filter/ai-suggest';
import { suggestSaves, type SaveSuggestion } from '../../../services/history-filter/repeat-suggest';
import {
  collectSecrets, describeFinding, sweepSecrets, PLACE_WORDS, type SecretFinding,
} from '../../../services/history-filter/secret-sweep';
import {
  clockTime, findFailureBoundaries, likeliestChange, narrow, type FailureBoundary,
} from '../../../services/history-filter/first-failure';
import type { SavedIndex, CollectionNodeLike, Resolver } from '../../../services/history-filter/saved-index';
import type { HistoryRowLike } from '../../../services/history-filter/history-facts';
import { loadDismissed, rememberDismissed, type DismissKind } from './history-dismissals';

/** How many rows the sweep reads. It is a check on recent work, not an audit. */
const SWEEP_DEPTH = 600;

type Card =
  | { kind: 'secret'; key: string; finding: SecretFinding }
  | { kind: 'failure'; key: string; boundary: FailureBoundary }
  | { kind: 'save'; key: string; suggestion: SaveSuggestion };

// ── Shell ───────────────────────────────────────────────────────────────────

function Shell({ tone, title, onDismiss, dismissTitle, children, footer }: {
  tone: string;
  title: React.ReactNode;
  onDismiss: () => void;
  dismissTitle: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg p-2.5 flex flex-col gap-2"
         style={{
           background: `color-mix(in srgb, ${tone} 7%, var(--color-surface))`,
           border: `1px solid color-mix(in srgb, ${tone} 28%, transparent)`,
         }}>
      <div className="flex items-start gap-2">
        <span className="flex-1 text-[11.5px] leading-snug"
              style={{ color: 'var(--color-text-primary)' }}>
          {title}
        </span>
        <button type="button" onClick={onDismiss} title={dismissTitle}
                className="border-none bg-transparent cursor-pointer p-0.5 flex shrink-0"
                style={{ color: 'var(--color-text-muted)' }}>
          <CloseIcon size={10} color="currentColor" />
        </button>
      </div>
      {children}
      {footer && <div className="flex items-center gap-1.5 flex-wrap">{footer}</div>}
    </div>
  );
}

function Primary({ tone, icon, label, onClick }: {
  tone: string; icon?: React.ReactNode; label: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
            className="flex items-center gap-1 text-[10.5px] px-2 py-1 rounded cursor-pointer border-none"
            style={{ background: tone, color: 'var(--color-btn-primary-text)' }}>
      {icon}{label}
    </button>
  );
}

function Secondary({ icon, label, title, onClick, tone }: {
  icon?: React.ReactNode; label: string; title?: string; onClick: () => void; tone?: string;
}) {
  return (
    <button type="button" onClick={onClick} title={title}
            className="flex items-center gap-1 text-[10.5px] px-1.5 py-1 rounded cursor-pointer"
            style={{
              background: 'transparent',
              color: tone ?? 'var(--color-text-secondary)',
              border: `1px solid color-mix(in srgb, ${tone ?? 'var(--color-text-secondary)'} 35%, transparent)`,
            }}>
      {icon}{label}
    </button>
  );
}

// ── The secret sweep ────────────────────────────────────────────────────────

/**
 * The value is never in this card.
 *
 * It says which variable, and where it turned up. Printing the token into a
 * warning about the token being somewhere visible would be its own joke.
 */
function SecretCard({ finding, onDismiss, onShow }: {
  finding: SecretFinding; onDismiss: () => void; onShow: () => void;
}) {
  const tone = 'var(--color-error)';
  return (
    <Shell
      tone={tone}
      dismissTitle="This one is fine where it is"
      onDismiss={onDismiss}
      title={<span style={{ color: tone, fontWeight: 600 }}>{describeFinding(finding)}</span>}
      footer={
        <>
          <Secondary label="Show them" onClick={onShow} tone={tone} />
          <Secondary label="Not a secret" title="Stop checking this variable" onClick={onDismiss} />
        </>
      }
    >
      <div className="flex flex-col gap-0.5 text-[10.5px]" style={{ color: 'var(--color-text-secondary)' }}>
        <span style={{ color: 'var(--color-text-muted)' }}>
          <span className="font-mono" style={{ color: 'var(--color-var-pill-text)' }}>
            {`{{${finding.name}}}`}
          </span>
          {' '}from {finding.source} appears in:
        </span>
        {finding.byPlace.map(p => (
          <span key={p.place}>
            <span style={{ color: tone }}>●</span>{' '}
            {PLACE_WORDS[p.place]} — {p.count} {p.count === 1 ? 'run' : 'runs'}
          </span>
        ))}
      </div>
    </Shell>
  );
}

// ── The first failing run ───────────────────────────────────────────────────

function FailureCard({ boundary, onDismiss, onOpen, rows }: {
  boundary: FailureBoundary;
  onDismiss: () => void;
  onOpen: (rowId: number) => void;
  rows: readonly HistoryRowLike[];
}) {
  const tone = 'var(--color-time-critical, var(--color-error))';
  const [why, setWhy] = useState<{ id: string; text: string } | null>(null);
  const change = likeliestChange(boundary.changes);
  const narrowed = change ? narrow(change.before, change.after) : undefined;

  useEffect(() => {
    if (!why) return;
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.tabId !== why.id) return;
      if (msg.type === 'ai:chunk') {
        setWhy(s => (s && s.id === msg.tabId ? { ...s, text: s.text + (msg.content ?? '') } : s));
      }
      if (msg.type === 'ai:error') setWhy(null);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [why]);

  return (
    <Shell
      tone={tone}
      dismissTitle="Stop telling me about this endpoint"
      onDismiss={onDismiss}
      title={
        <>
          <span className="font-mono text-[10px]" style={{ color: 'var(--color-filter-field)', fontWeight: 600 }}>
            {boundary.method}
          </span>{' '}
          was <b style={{ color: 'var(--color-success, var(--color-primary))' }}>
            {boundary.lastGood.status}
          </b> until <b>{clockTime(boundary.firstBad.at)}</b>, then{' '}
          <b style={{ color: tone }}>{boundary.firstBad.status || 'no response'}</b>{' '}
          {boundary.failuresSince} {boundary.failuresSince === 1 ? 'time' : 'times'}.
        </>
      }
      footer={
        <>
          <Secondary label="Open both runs" icon={<ExternalLinkIcon size={10} color="currentColor" />}
                     onClick={() => { onOpen(boundary.lastGood.rowId); onOpen(boundary.firstBad.rowId); }} />
          {/* The Response Diff Analyzer, asked from History. Same feature, same
              switch — a second "explain a diff" would have been a second thing
              to keep in step with this one. */}
          {isAiFeatureOn('responseDiff') && !!change && (
            <Secondary
              label={why ? 'Asking…' : 'Why?'}
              icon={<SparkleIcon size={10} color="currentColor" />}
              title="Ask the Response Diff Analyzer what this change would do"
              tone="var(--color-protocol-ai)"
              onClick={() => setWhy({
                id: askWhyItBroke(boundary, rows), text: '',
              })}
            />
          )}
        </>
      }
    >
      <div className="flex flex-col gap-1 text-[10.5px]" style={{ color: 'var(--color-text-secondary)' }}>
        <span className="font-mono text-[10px] truncate" title={boundary.endpoint}
              style={{ color: 'var(--color-text-muted)' }}>
          {boundary.endpoint}
        </span>
        {change ? (
          <>
            <span style={{ color: 'var(--color-text-muted)' }}>
              Between the last good run and the first bad one
              {boundary.changes.length > 1
                ? `, ${boundary.changes.length} things changed. The likeliest:`
                : ', one thing changed:'}
            </span>
            <div className="font-mono text-[10px] leading-relaxed break-all">
              <div style={{ color: 'var(--color-text-muted)' }}>
                {change.where === 'body' ? 'body' : `${change.where} ${change.key}`}
              </div>
              <div style={{ color: tone }}>− {narrowed!.before || '(absent)'}</div>
              <div style={{ color: 'var(--color-success, var(--color-primary))' }}>
                + {narrowed!.after || '(absent)'}
              </div>
            </div>
          </>
        ) : (
          /* Nothing you sent changed, which is itself the answer and a more
             useful one than an empty card. */
          <span style={{ color: 'var(--color-text-muted)' }}>
            Nothing about the request changed between the two runs — the same
            call started failing on its own.
          </span>
        )}
        {!!why?.text && (
          <span className="text-[10px] leading-snug" style={{ color: 'var(--color-protocol-ai)' }}>
            {why.text}
          </span>
        )}
      </div>
    </Shell>
  );
}

// ── The save suggestion ─────────────────────────────────────────────────────

function SaveCard({ suggestion, onDismiss, onSave, name, onName, naming }: {
  suggestion: SaveSuggestion;
  onDismiss: () => void;
  onSave: () => void;
  name: string;
  onName: () => void;
  naming: boolean;
}) {
  const tone = 'var(--color-accent, var(--color-primary))';
  return (
    <Shell
      tone={tone}
      dismissTitle="Do not suggest this one again"
      onDismiss={onDismiss}
      title={
        <>
          Sent <b style={{ color: tone }}>{suggestion.count} times</b>
          {suggestion.days > 1
            ? ` across ${suggestion.days} days`
            : suggestion.sentToday ? ' today' : ''}, never saved.
        </>
      }
      footer={
        <>
          <Primary tone={tone} label="Save to a collection"
                   icon={<SaveIcon size={10} color="currentColor" />} onClick={onSave} />
          {/* Offered only where the Namer is switched on: a button whose only
              job is to report that a feature is off should not be drawn. */}
          {isAiFeatureOn('requestNamer') && (
            <Secondary label={naming ? 'Naming…' : 'Name it'} tone="var(--color-protocol-ai)"
                       icon={<SparkleIcon size={10} color="currentColor" />}
                       title="Ask the Request Namer for a better name" onClick={onName} />
          )}
        </>
      }
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[10px] truncate" title={suggestion.endpoint}
              style={{ color: 'var(--color-text-secondary)' }}>
          <span style={{ color: 'var(--color-filter-field)', fontWeight: 600 }}>{suggestion.method}</span>
          {' '}{suggestion.endpoint}
        </span>
        <span className="text-[11px] truncate" style={{ color: 'var(--color-text-primary)' }}>
          {name}
          {suggestion.folder && (
            <span style={{ color: 'var(--color-text-muted)' }}> → {suggestion.folder.name}</span>
          )}
        </span>
      </div>
    </Shell>
  );
}

// ── The strip ───────────────────────────────────────────────────────────────

export function HistoryInsights({ rows, saved, collections, resolve, protocol, onShowSecretRows, onOpenRow }: {
  rows: readonly HistoryRowLike[];
  saved: SavedIndex;
  collections: readonly CollectionNodeLike[];
  resolve?: Resolver;
  protocol: string;
  /** Filter the list down to the rows a sweep finding is about. */
  onShowSecretRows: (rowIds: number[]) => void;
  /** Open one history row in a tab. */
  onOpenRow: (rowId: number) => void;
}) {
  const [dismissed, setDismissed] = useState<Record<DismissKind, Set<string>>>(() => ({
    save: loadDismissed('save'),
    secret: loadDismissed('secret'),
    failure: loadDismissed('failure'),
  }));
  const [at, setAt] = useState(0);
  const [saving, setSaving] = useState<SaveSuggestion | null>(null);
  const [aiName, setAiName] = useState<{ id: string; text: string } | null>(null);

  const environments = useEnvStore(s => s.environments);
  const secrets = useMemo(() => collectSecrets(environments), [environments]);

  const cards = useMemo<Card[]>(() => {
    const out: Card[] = [];
    for (const finding of sweepSecrets(rows, secrets, {
      dismissed: dismissed.secret, limit: SWEEP_DEPTH,
    })) {
      out.push({ kind: 'secret', key: finding.key, finding });
    }
    for (const boundary of findFailureBoundaries(rows, { resolve, dismissed: dismissed.failure })) {
      out.push({ kind: 'failure', key: boundary.key, boundary });
    }
    for (const suggestion of suggestSaves(rows, {
      saved, dismissed: dismissed.save, resolve, tree: collections,
    })) {
      out.push({ kind: 'save', key: suggestion.key, suggestion });
    }
    return out;
  }, [rows, secrets, saved, collections, resolve, dismissed]);

  /* Dismissing the last card would otherwise leave the pager pointing past the
     end and the strip empty while findings remain. */
  const index = cards.length ? Math.min(at, cards.length - 1) : 0;
  const card = cards[index];

  useEffect(() => { setAiName(null); }, [card?.key]);

  useEffect(() => {
    if (!aiName) return;
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.tabId !== aiName.id) return;
      if (msg.type === 'ai:chunk') {
        setAiName(s => (s && s.id === msg.tabId ? { ...s, text: s.text + (msg.content ?? '') } : s));
      }
      if (msg.type === 'ai:error') setAiName(null);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [aiName]);

  if (!card) return null;

  const dismiss = (kind: DismissKind, key: string) => {
    logUiEvent(`history.insight.${kind}.dismiss`, { key });
    setDismissed(d => {
      const next = { ...d, [kind]: new Set([...d[kind], key]) };
      rememberDismissed(kind, next[kind]);
      return next;
    });
  };

  const name = card.kind === 'save'
    ? readNameAnswer(aiName?.text ?? '') || card.suggestion.name
    : '';

  return (
    <div className="mx-3 my-2 flex flex-col gap-1">
      {card.kind === 'secret' && (
        <SecretCard
          finding={card.finding}
          onDismiss={() => dismiss('secret', card.key)}
          onShow={() => onShowSecretRows([...new Set(card.finding.hits.map(h => h.rowId))])}
        />
      )}
      {card.kind === 'failure' && (
        <FailureCard
          boundary={card.boundary}
          rows={rows}
          onDismiss={() => dismiss('failure', card.key)}
          onOpen={onOpenRow}
        />
      )}
      {card.kind === 'save' && (
        <SaveCard
          suggestion={card.suggestion}
          name={name}
          naming={!!aiName}
          onDismiss={() => dismiss('save', card.key)}
          onSave={() => {
            logUiEvent('history.saveSuggestion.save', { endpoint: card.suggestion.endpoint });
            setSaving(card.suggestion);
          }}
          onName={() => setAiName({ id: askForName(card.suggestion), text: '' })}
        />
      )}

      {/* Ranking is about order, not suppression — so when there is more than
          one finding, the strip says so and steps through them. */}
      {cards.length > 1 && (
        <div className="flex items-center gap-1 px-0.5">
          <span className="text-[9.5px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
            {index + 1} of {cards.length}
          </span>
          <button
            type="button"
            onClick={() => setAt((index + 1) % cards.length)}
            title="Next finding"
            className="border-none bg-transparent cursor-pointer p-0.5 flex"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <ChevronRightIcon size={10} color="currentColor" />
          </button>
        </div>
      )}

      {/* The same Save dialog the rest of History uses, with one row in it. */}
      {saving && (
        <SaveRequestModal
          open
          tab={null}
          bulkItems={[{ ...(rows.find(r => r.id === saving.rowId) as HistoryRowLike), name }]}
          bulkProtocol={protocol}
          onClose={() => setSaving(null)}
        />
      )}
    </div>
  );
}
