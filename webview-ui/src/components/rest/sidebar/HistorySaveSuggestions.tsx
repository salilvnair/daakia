/**
 * "You have sent this eleven times and it is not in a collection."
 *
 * ── Why it is here and not a toast ──
 *
 * Saving a request happens in the sidebar, next to the collections it would go
 * into. A toast over the response pane is a notification about something
 * happening somewhere else; a card at the top of History is the thing itself,
 * with the button on it.
 *
 * ── Why the AI is a button and not the feature ──
 *
 * The card is complete before any model is asked: the count is arithmetic, the
 * name comes from the path, and the folder comes from where the neighbouring
 * requests already live. `✦ Name it` asks the Request Namer to improve the
 * name, and does nothing else — with no provider configured the card is exactly
 * as useful, which is the whole point of building it in this order.
 *
 * ── Why dismissals stick ──
 *
 * A suggestion you have said no to is an answer. They are kept per workspace in
 * `localStorage`, because "do not ask me about this endpoint" is about this
 * panel rather than about the data, and a dismissal that synced to a teammate
 * would be a decision made for them.
 */
import { useEffect, useMemo, useState } from 'react';
import { CloseIcon, SaveIcon, SparkleIcon } from '../../../icons';
import { SaveRequestModal } from '../../shared';
import { isAiFeatureOn } from '../../../store/ai-features-store';
import { logUiEvent } from '../../../store/ui-audit-store';
import { askForName, readNameAnswer } from '../../../services/history-filter/ai-suggest';
import { suggestSaves, type SaveSuggestion } from '../../../services/history-filter/repeat-suggest';
import type { SavedIndex, CollectionNodeLike, Resolver } from '../../../services/history-filter/saved-index';
import type { HistoryRowLike } from '../../../services/history-filter/history-facts';

const DISMISS_KEY = 'daakia.history.saveSuggestions.dismissed';

/** Only ever one card at a time. A list of nags is a list nobody reads. */
function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    /* A browser with storage blocked simply asks again next time, which is a
       better failure than a card that will not render. */
    return new Set();
  }
}

function remember(keys: Set<string>): void {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...keys])); } catch { /* as above */ }
}

export function HistorySaveSuggestions({ rows, saved, collections, resolve, protocol }: {
  rows: readonly HistoryRowLike[];
  saved: SavedIndex;
  collections: readonly CollectionNodeLike[];
  resolve?: Resolver;
  protocol: string;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
  const [saving, setSaving] = useState<SaveSuggestion | null>(null);
  const [aiName, setAiName] = useState<{ id: string; text: string } | null>(null);

  const suggestion = useMemo(() => suggestSaves(rows, {
    saved, dismissed, resolve, tree: collections,
  })[0], [rows, saved, dismissed, resolve, collections]);

  /* The Namer streams; the card shows whatever has arrived so far and stops
     caring the moment the suggestion changes underneath it. */
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

  useEffect(() => { setAiName(null); }, [suggestion?.key]);

  if (!suggestion) return null;

  const name = readNameAnswer(aiName?.text ?? '') || suggestion.name;

  const dismiss = () => {
    logUiEvent('history.saveSuggestion.dismiss', { endpoint: suggestion.endpoint });
    const next = new Set(dismissed);
    next.add(suggestion.key);
    setDismissed(next);
    remember(next);
  };

  return (
    <>
      <div className="mx-3 my-2 rounded-lg p-2.5 flex flex-col gap-2"
           style={{
             background: 'color-mix(in srgb, var(--color-accent, var(--color-primary)) 7%, var(--color-surface))',
             border: '1px solid color-mix(in srgb, var(--color-accent, var(--color-primary)) 28%, transparent)',
           }}>
        <div className="flex items-start gap-2">
          {/*
            The span comes from the suggestion rather than from `days > 1`.
            One distinct day is not necessarily the current one — a burst last
            Tuesday is one day, and calling it "today" over timestamps that
            read Sep 12 is the kind of small lie that makes a card ignorable.
          */}
          <span className="flex-1 text-[11.5px] leading-snug"
                style={{ color: 'var(--color-text-primary)' }}>
            Sent <b style={{ color: 'var(--color-accent, var(--color-primary))' }}>{suggestion.count} times</b>
            {suggestion.days > 1
              ? ` across ${suggestion.days} days`
              : suggestion.sentToday ? ' today' : ''}, never saved.
          </span>
          <button type="button" onClick={dismiss} title="Do not suggest this one again"
                  className="border-none bg-transparent cursor-pointer p-0.5 flex shrink-0"
                  style={{ color: 'var(--color-text-muted)' }}>
            <CloseIcon size={10} color="currentColor" />
          </button>
        </div>

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

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              logUiEvent('history.saveSuggestion.save', { endpoint: suggestion.endpoint });
              setSaving(suggestion);
            }}
            className="flex items-center gap-1 text-[10.5px] px-2 py-1 rounded cursor-pointer border-none"
            style={{ background: 'var(--color-accent, var(--color-primary))',
                     color: 'var(--color-btn-primary-text)' }}
          >
            <SaveIcon size={10} color="currentColor" />
            Save to a collection
          </button>

          {/*
            Offered only where the Namer is switched on. A button that exists to
            tell you a feature is off is a button that should not have been
            drawn.
          */}
          {isAiFeatureOn('requestNamer') && (
            <button
              type="button"
              onClick={() => setAiName({ id: askForName(suggestion), text: '' })}
              title="Ask the Request Namer for a better name"
              className="flex items-center gap-1 text-[10.5px] px-1.5 py-1 rounded cursor-pointer"
              style={{ background: 'transparent', color: 'var(--color-protocol-ai)',
                       border: '1px solid color-mix(in srgb, var(--color-protocol-ai) 35%, transparent)' }}
            >
              <SparkleIcon size={10} color="currentColor" />
              {aiName ? 'Naming…' : 'Name it'}
            </button>
          )}
        </div>
      </div>

      {/*
        The same Save dialog the rest of History uses, with one row in it. A
        second dialog that saved a request would be a second place for the
        protocol-specific shaping to go wrong.
      */}
      {saving && (
        <SaveRequestModal
          open
          tab={null}
          bulkItems={[{ ...(rows.find(r => r.id === saving.rowId) as HistoryRowLike), name }]}
          bulkProtocol={protocol}
          onClose={() => setSaving(null)}
        />
      )}
    </>
  );
}
