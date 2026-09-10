/**
 * Screen 08's middle layer — the `.chiprow`, and the `.advbar` behind it.
 *
 * **The box searches. The chips are the filter.** Nobody has to learn a query
 * language to use this screen: you tick what you want and the chips say, in
 * words, what you are looking at and let you take any of it back off.
 *
 * The query string still exists, behind **Query**, because a filter you can
 * paste into chat is genuinely useful — but it is what the clicking *produced*,
 * not what you have to type first. It stays in step with the facets because
 * both read and write one `FilterState`.
 *
 * An excluded term keeps its own shape — `not module Reporting` rather than a
 * minus somebody has to decode — so a filter built from subtractions is still
 * readable six clicks later.
 */
import { useEffect, useState } from 'react';
import { Ico } from './GhIcons';
import {
  describeTerm, dropField, formatQuery, isEmpty, parseQuery, type FilterState,
} from './filter-model';

/** Fields the model can evaluate. Anything else is named and dropped. */
const KNOWN = new Set([
  'state', 'assignee', 'author', 'label', 'milestone',
  'quiet', 'age', 'created', 'updated', 'has',
]);

export function GhChips({ state, labels, onChange, onExplain, explaining }: {
  state: FilterState;
  /** The declared spelling of each value, so a chip agrees with the board. */
  labels?: Map<string, string>;
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
      ignored — the failure everybody has had with a shared search string is
      the one where an unknown term is swallowed and you spend ten minutes
      reading the wrong list.
    */
    const unknown = next.terms.filter(t => !KNOWN.has(t.field) && !/^[a-z][\w-]*$/.test(t.field));
    setError(unknown.length ? `Not a field: ${unknown.map(t => t.field).join(', ')}` : '');
    onChange({ ...next, terms: next.terms.filter(t => !unknown.includes(t)) });
  };

  return (
    <>
      <div className="chiprow">
        <span className="lead">Showing</span>

        {state.terms.map(t => {
          const d = describeTerm(t, labels);
          return (
            <span
              key={`${t.negated ? '-' : ''}${t.field}`}
              className="fchip"
              style={t.negated
                ? { borderColor: 'color-mix(in srgb, var(--dk-red) 45%, transparent)',
                    background: 'color-mix(in srgb, var(--dk-red) 12%, transparent)' }
                : undefined}
            >
              <span className="k">{d.key}</span>{d.value}
              <button type="button" className="x" title="Take this one off"
                      onClick={() => onChange(dropField(state, t.field))}>
                ×
              </button>
            </span>
          );
        })}

        {state.search.text.trim() && (
          <span className="fchip">
            <span className="k">{state.search.scope === 'title' ? 'title' : state.search.scope}</span>
            “{state.search.text.trim()}”
            <button type="button" className="x"
                    onClick={() => onChange({ ...state, search: { ...state.search, text: '' } })}>
              ×
            </button>
          </span>
        )}

        <button type="button" className="clr"
                onClick={() => onChange({ terms: [], search: { ...state.search, text: '' } })}>
          Clear
        </button>

        <span className="sp" />

        <button type="button" className={`adv${explaining ? ' on' : ''}`} onClick={onExplain}
                title="Why is an issue here — and where did that one go">
          <Ico name="warn" />Explain
        </button>
        <button type="button" className={`adv${showQuery ? ' on' : ''}`}
                onClick={() => setShowQuery(q => !q)}>
          <Ico name="code" />Query
        </button>
      </div>

      {showQuery && (
        <div className="advbar">
          <input
            className="q"
            value={draft}
            spellCheck={false}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(draft); }}
            onBlur={() => commit(draft)}
            style={{
              color: error ? 'var(--dk-red)' : 'var(--dk-text)',
              borderColor: error ? 'var(--dk-red)' : undefined,
              outline: 'none',
            }}
          />
          <span className="hint">
            {error || 'edit it, paste one in, or copy it to a colleague — a leading minus is “not”'}
          </span>
          <button type="button" className="btn"
                  onClick={() => navigator.clipboard?.writeText(query)}>
            <Ico name="copy" />Copy
          </button>
        </div>
      )}
    </>
  );
}

/**
 * The search scope — screen 08C.
 *
 * A search that quietly covers only titles finds nothing for an error message,
 * and one that covers comments finds too much. So it says which, and the
 * results say where they matched.
 */
export function GhSearchScope({ state, onChange, loaded, truncated, onSearchRepo, searching }: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  loaded: number;
  /** The read hit its page size, so the board is not the whole repository. */
  truncated?: boolean;
  onSearchRepo: () => void;
  searching: boolean;
}) {
  const s = state.search;
  const set = (patch: Partial<typeof s>) => onChange({ ...state, search: { ...s, ...patch } });

  if (!s.text.trim()) return null;

  return (
    <div className="toolbar">
      <span className="lead" style={{ fontSize: 9.5, color: 'var(--dk-faint)' }}>Searching</span>
      <button type="button" className={`pill${s.scope === 'title' ? ' on' : ''}`}
              onClick={() => set({ scope: 'title' })}>
        Title
      </button>
      <button type="button" className={`pill${s.scope === 'body' ? ' on' : ''}`}
              onClick={() => set({ scope: 'body' })}>
        Body
      </button>
      <button type="button" className={`pill${s.scope === 'comments' ? ' on' : ''}`}
              title="Comments are not on the board — this one asks GitHub"
              onClick={() => { set({ scope: 'comments' }); onSearchRepo(); }}>
        Comments
      </button>
      <button type="button" className={`pill${s.matchCase ? ' on' : ''}`}
              onClick={() => set({ matchCase: !s.matchCase })}>
        Match case
      </button>
      <button type="button" className={`pill${s.wholeWord ? ' on' : ''}`}
              onClick={() => set({ wholeWord: !s.wholeWord })}>
        Whole word
      </button>
      <span className="sp" style={{ flex: 1 }} />
      {/*
        Said out loud rather than implied. The search runs here over what the
        board already holds — instant, offline, and only the loaded issues,
        which matters the moment a repository has more than a page of them.
      */}
      <span style={{ fontSize: 9.5, color: 'var(--dk-faint)' }}>
        {searching ? 'asking GitHub…'
          : truncated ? `over the ${loaded} loaded — there are more`
          : `over all ${loaded}, instantly`}
      </span>
      {truncated && (
        <button type="button" className="pill" onClick={onSearchRepo}>
          Search the repository
        </button>
      )}
    </div>
  );
}
