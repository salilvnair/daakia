/**
 * The `/` palette: every prompt, searchable, above the message box.
 *
 * It opens while the box holds nothing but `/` and a word, so a slash command
 * with its argument typed out ("/request GET …") is never mistaken for a
 * search. Its keys are taken before the chat sees them — Enter inserts rather
 * than sends, Esc closes and clears the `/`. After it inserts, Tab walks the
 * `{placeholders}` left in the text, so a template is finished from the
 * keyboard; one left unfilled makes the assistant ask for it instead of
 * guessing.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { KbdView } from '@salilvnair/dui';
import { useLibrarySlot } from './use-library-slot';
import { fuzzy, withPlaceholders, type AiPrompt } from './ai-prompts';
import { prefill } from './ai-chat-actions';

const OPEN_WHEN = /^\/([\w-]*)$/;
const INPUT = 'textarea.ce-composer-input';

/** Select the next `{placeholder}` after the caret, wrapping. True if there was one. */
function selectNextPlaceholder(ta: HTMLTextAreaElement, from = ta.selectionEnd): boolean {
  const all = [...ta.value.matchAll(/\{\w+\}/g)];
  if (!all.length) return false;
  const next = all.find(m => m.index! >= from) ?? all[0];
  ta.focus();
  ta.setSelectionRange(next.index!, next.index! + next[0].length);
  return true;
}

export function PromptPalette({ root, prompts }: { root: HTMLElement | null; prompts: AiPrompt[] }) {
  const slot = useLibrarySlot(root, '.ce-footer', 'dai-palette-slot');
  const [query, setQuery] = useState<string | undefined>();
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (query === undefined) return [];
    const scored = prompts
      .map(p => ({ p, m: fuzzy(p.label, query) ?? (query && p.text.toLowerCase().includes(query.toLowerCase()) ? { score: 0, marks: [] } : undefined) }))
      .filter((x): x is { p: AiPrompt; m: { score: number; marks: number[] } } => !!x.m);
    const order = ['Ask the logs', 'Build'];
    return scored.sort((a, b) => (order.indexOf(a.p.group) - order.indexOf(b.p.group)) || (b.m.score - a.m.score));
  }, [prompts, query]);

  const selected = results[Math.min(index, results.length - 1)];

  /* Keep the mutable bits where the native listeners can read them. */
  const live = useRef({ open: false, results, index, selected });
  live.current = { open: query !== undefined, results, index, selected };

  const insert = (p: AiPrompt) => {
    setQuery(undefined);
    prefill(p.text);
    /* After the library has put the text in: land on the first placeholder. */
    setTimeout(() => {
      const ta = root?.querySelector(INPUT) as HTMLTextAreaElement | null;
      if (ta) selectNextPlaceholder(ta, 0);
    }, 30);
  };
  const insertRef = useRef(insert);
  insertRef.current = insert;

  useEffect(() => {
    if (!root) return;
    const onInput = (e: Event) => {
      const t = e.target as HTMLElement;
      if (!t.matches?.(INPUT)) return;
      const m = OPEN_WHEN.exec((t as HTMLTextAreaElement).value);
      setQuery(m ? m[1] : undefined);
      if (m) setIndex(0);
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (!t.matches?.(INPUT)) return;
      const ta = t as HTMLTextAreaElement;
      const { open, results: rs, index: i, selected: sel } = live.current;
      if (open) {
        const stop = () => { e.preventDefault(); e.stopPropagation(); };
        if (e.key === 'ArrowDown') { stop(); setIndex(Math.min(i + 1, Math.max(rs.length - 1, 0))); return; }
        if (e.key === 'ArrowUp') { stop(); setIndex(Math.max(i - 1, 0)); return; }
        if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
          if (sel) { stop(); insertRef.current(sel.p); }
          return;
        }
        if (e.key === 'Escape') { stop(); setQuery(undefined); prefill(''); return; }
        return;
      }
      if (e.key === 'Tab' && !e.shiftKey && /\{\w+\}/.test(ta.value)) {
        if (selectNextPlaceholder(ta)) { e.preventDefault(); e.stopPropagation(); }
      }
    };
    /* Capture on the chat's root: ahead of the library's own handlers, which
       would otherwise send on Enter. */
    root.addEventListener('input', onInput, true);
    root.addEventListener('keydown', onKey, true);
    return () => {
      root.removeEventListener('input', onInput, true);
      root.removeEventListener('keydown', onKey, true);
    };
  }, [root]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index, query]);

  if (!slot || query === undefined) return null;

  let lastGroup = '';
  return createPortal(
    <div className="dai-pal" role="dialog" aria-label="Prompts">
      <div className="dai-pal-list" ref={listRef} role="listbox" aria-label="Prompts">
        <div className="dai-pal-q">/{query}<span>{results.length} of {prompts.length}</span></div>
        {results.length === 0 && <div className="dai-pal-none">No prompt matches “{query}”.</div>}
        {results.map(({ p, m }, i) => {
          const head = p.group !== lastGroup ? (lastGroup = p.group) : undefined;
          return (
            <div key={`${p.group}-${p.id}`}>
              {head && (
                <div className="dai-pal-g">
                  {head === 'Ask the logs' && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--dai-dk8s)" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" /></svg>
                  )}
                  {head}
                </div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={p === selected?.p}
                className="dai-pal-i"
                onMouseEnter={() => setIndex(i)}
                onMouseDown={e => e.preventDefault()}
                onClick={() => insert(p)}
              >
                <span>{[...p.label].map((ch, k) => m.marks.includes(k) ? <mark key={k}>{ch}</mark> : ch)}</span>
                <small>{[...p.text.matchAll(/\{(\w+)\}/g)].map(x => x[1]).join(' · ')}</small>
              </button>
            </div>
          );
        })}
      </div>
      <div className="dai-pal-prev">
        {selected ? (
          <>
            <span className="dai-eyebrow">Preview</span>
            <h4>{selected.p.label}</h4>
            <p>{withPlaceholders(selected.p.text).map((r, k) => r.ph ? <span key={k} className="dai-ph">{r.text}</span> : <span key={k}>{r.text}</span>)}</p>
            <p style={{ fontSize: 11.5, color: 'var(--dai-muted)' }}>{selected.p.description}</p>
            <span className="dai-sp" />
            <span className="dai-hint">Edit these in Settings → AI → Prompt templates</span>
          </>
        ) : <span className="dai-hint">Nothing to preview.</span>}
      </div>
      <div className="dai-pal-foot">
        <span className="dai-keys"><KbdView keys={['↑', '↓']} size="xs" /> move</span>
        <span className="dai-keys"><KbdView keys="Enter" size="xs" /> insert</span>
        <span className="dai-keys"><KbdView keys="Tab" size="xs" /> next placeholder</span>
        <span className="dai-keys"><KbdView keys="Esc" size="xs" /> close</span>
      </div>
    </div>,
    slot,
  );
}
