/**
 * Screen 08's middle layer — the chips, and the query behind them.
 *
 * **The box searches. The chips are the filter.** Nobody has to learn a query
 * language to use this screen: you tick what you want and the chips say, in
 * words, what you are looking at and let you take any of it back off.
 *
 * The query string still exists, behind the **Query** disclosure, because a
 * filter you can paste into chat is genuinely useful — but it is what the
 * clicking *produced*, not what you have to type first. It is editable and
 * pasteable, and it stays in step with the facets because both read and write
 * the same `FilterState`.
 *
 * An excluded term keeps its own shape — `not module Reporting` rather than a
 * minus somebody has to decode — so a filter built from subtractions is still
 * readable six clicks later.
 */
import { useEffect, useState } from 'react';
import { ButtonView, CopyButtonView, TogglePillView } from '@salilvnair/dui';
import { CodeIcon, HelpCircleIcon } from '../../icons';
import {
  describeTerm, dropField, formatQuery, isEmpty, parseQuery, type FilterState,
} from './filter-model';
import { ACCENT } from './types';

export function GhChips({ state, onChange, onExplain, explaining }: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  /** Opens 08E — why is this here, and where did that one go. */
  onExplain: () => void;
  explaining: boolean;
}) {
  const [showQuery, setShowQuery] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const query = formatQuery(state);

  /* The box follows the chips whenever it is not being typed into. Two
     renderings of one filter that can drift apart are two filters. */
  useEffect(() => { setDraft(query); setError(''); }, [query]);

  if (isEmpty(state)) return null;

  const commit = (text: string) => {
    const next = parseQuery(text, state.search);
    /*
      A term nobody can evaluate is named and dropped rather than silently
      ignored — the failure everybody has had with shared search strings is the
      one where an unknown term is quietly swallowed and you spend ten minutes
      reading the wrong list.
    */
    const unknown = next.terms.filter(t => !KNOWN.has(t.field) && !/^[a-z][\w-]*$/.test(t.field));
    setError(unknown.length ? `Not a field: ${unknown.map(t => t.field).join(', ')}` : '');
    onChange({ ...next, terms: next.terms.filter(t => !unknown.includes(t)) });
  };

  return (
    <div className="flex flex-col flex-shrink-0"
         style={{
           borderBottom: '1px solid var(--color-surface-border)',
           background: `color-mix(in srgb, ${ACCENT} 5%, transparent)`,
         }}>
      <div className="px-4 py-1.5 flex items-center gap-1.5 flex-wrap">
        <span className="text-[9.5px] font-bold uppercase tracking-[.09em]"
              style={{ color: 'var(--color-text-muted)' }}>
          Showing
        </span>

        {state.terms.map(t => {
          const d = describeTerm(t);
          return (
            <Chip
              key={`${t.negated ? '-' : ''}${t.field}`}
              label={d.key}
              value={d.value}
              negated={t.negated}
              onRemove={() => onChange(dropField(state, t.field))}
            />
          );
        })}

        {state.search.text.trim() && (
          <Chip
            label={state.search.scope === 'title' ? 'title' : state.search.scope}
            value={`“${state.search.text.trim()}”`}
            onRemove={() => onChange({ ...state, search: { ...state.search, text: '' } })}
          />
        )}

        <button
          type="button"
          onClick={() => onChange({ terms: [], search: { ...state.search, text: '' } })}
          className="cursor-pointer text-[10px]"
          style={{ background: 'none', border: 'none', padding: 0, color: ACCENT }}
        >
          Clear all
        </button>

        <span className="flex-1" />

        <TogglePillView icon={<HelpCircleIcon size={10} />} accentColor={ACCENT}
                        active={explaining} onClick={onExplain}
                        title="Why is an issue here — and where did that one go">
          Explain
        </TogglePillView>
        <TogglePillView icon={<CodeIcon size={10} />} accentColor={ACCENT}
                        active={showQuery} onClick={() => setShowQuery(q => !q)}>
          Query
        </TogglePillView>
      </div>

      {showQuery && (
        <div className="px-4 pb-2 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit(draft); }}
              onBlur={() => commit(draft)}
              spellCheck={false}
              className="flex-1 text-[10.5px] font-mono px-2 py-1 rounded"
              style={{
                background: 'var(--color-panel)',
                border: `1px solid ${error ? 'var(--color-error)' : 'var(--color-surface-border)'}`,
                color: 'var(--color-text-primary)',
                outline: 'none',
              }}
            />
            <CopyButtonView text={query} accentColor={ACCENT} size="sm" />
          </div>
          <span className="text-[9px]" style={{ color: error ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
            {error || 'edit it, paste one in, or copy it to a colleague — a leading minus is “not”'}
          </span>
        </div>
      )}
    </div>
  );
}

/** Fields the model can evaluate. Anything else is named and dropped. */
const KNOWN = new Set([
  'state', 'assignee', 'author', 'label', 'milestone',
  'quiet', 'age', 'created', 'updated', 'has',
]);

function Chip({ label, value, negated, onRemove }: {
  label: string;
  value: string;
  negated?: boolean;
  onRemove: () => void;
}) {
  const tone = negated ? 'var(--color-error)' : ACCENT;
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-[1px] text-[10px]"
          style={{
            border: `1px solid color-mix(in srgb, ${tone} 45%, transparent)`,
            background: `color-mix(in srgb, ${tone} 12%, transparent)`,
            color: 'var(--color-text-primary)',
          }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      {value}
      <button type="button" onClick={onRemove} title="Take this one off"
              className="cursor-pointer"
              style={{ background: 'none', border: 'none', padding: 0, color: tone, lineHeight: 1 }}>
        ×
      </button>
    </span>
  );
}

/**
 * The toolbar's search scope — screen 08C.
 *
 * A search that quietly covers only titles finds nothing for an error message,
 * and one that covers comments finds too much. So it says which, and the
 * results say where they matched.
 */
export function GhSearchScope({ state, onChange, loaded, truncated, onSearchRepo, searching }: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  /** How many issues the board is holding. */
  loaded: number;
  /**
   * The read hit its page size, so the board is not the whole repository.
   *
   * Not a total — nobody knows the total without another call, and inventing
   * one would be the kind of number a reader trusts.
   */
  truncated?: boolean;
  /** Ask the host to search the whole repository, comments included. */
  onSearchRepo: () => void;
  searching: boolean;
}) {
  const s = state.search;
  const set = (patch: Partial<typeof s>) =>
    onChange({ ...state, search: { ...s, ...patch } });

  if (!s.text.trim()) return null;

  return (
    <div className="px-4 py-1 flex items-center gap-1.5 flex-wrap flex-shrink-0"
         style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
      <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
        searching
      </span>
      <TogglePillView accentColor={ACCENT} active={s.scope === 'title'}
                      onClick={() => set({ scope: 'title' })}>
        Title
      </TogglePillView>
      <TogglePillView accentColor={ACCENT} active={s.scope === 'body'}
                      onClick={() => set({ scope: 'body' })}>
        Title and body
      </TogglePillView>
      <TogglePillView accentColor={ACCENT} active={s.scope === 'comments'}
                      title="Comments are not on the board — this one asks GitHub"
                      onClick={() => { set({ scope: 'comments' }); onSearchRepo(); }}>
        Comments too
      </TogglePillView>
      <TogglePillView accentColor={ACCENT} active={!!s.matchCase}
                      onClick={() => set({ matchCase: !s.matchCase })}>
        Match case
      </TogglePillView>
      <TogglePillView accentColor={ACCENT} active={!!s.wholeWord}
                      onClick={() => set({ wholeWord: !s.wholeWord })}>
        Whole word
      </TogglePillView>
      <span className="flex-1" />
      {/*
        Said out loud rather than implied. The search runs locally over what the
        board already has, so it is instant and works offline — and it only sees
        loaded issues, which matters the moment a repository has more than a
        page of them.
      */}
      <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
        {searching ? 'asking GitHub…'
          : truncated
            ? `over the ${loaded} loaded — there are more`
            : `over all ${loaded}, instantly`}
      </span>
      {truncated && (
        <ButtonView size="sm" variant="ghost" accentColor={ACCENT} onClick={onSearchRepo}>
          Search the repository
        </ButtonView>
      )}
    </div>
  );
}
