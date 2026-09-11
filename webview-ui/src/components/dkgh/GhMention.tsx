/**
 * Typing `#` and getting the issue you meant.
 *
 * The box already said "type # and a number to link another issue", which is
 * true and useless: nobody knows the number. github.com answers the `#` with a
 * list of issues and dkgh should too — the board already holds them, so this
 * costs no call at all.
 *
 * ── What it attaches to ──
 *
 * `MarkdownEditorView` has two surfaces: a `contenteditable` for Rich Text and
 * a `textarea` for Markdown. Rather than reaching into either, this watches
 * `input` events as they bubble out of the editor, reads the text before the
 * caret, and offers the list. Picking one writes the number through the same
 * path a keystroke would, so the editor's own state stays the one truth.
 *
 * ── When it opens ──
 *
 * On a `#` that starts a word — after a space, a newline, or at the very
 * beginning. `#` in the middle of a word is a fragment identifier or a CSS
 * colour, and a picker over `#fff` is a picker in the way.
 *
 * A heading is the other `#`, and it is the reason for the word-start rule
 * being *necessary but not sufficient*: `# ` followed by a space is markdown
 * for a heading, so the list closes the moment a space is typed.
 */
import { useEffect, useRef, useState } from 'react';
import type { BoardIssue } from './board-types';

export interface Hit { number: number; title: string; state: string }

/**
 * The `#query` immediately before the caret, or nothing.
 *
 * Exported because this is the whole judgement — everything else is a list.
 */
export function queryAt(text: string, caret: number): string | undefined {
  const upto = text.slice(0, caret);
  const hash = upto.lastIndexOf('#');
  if (hash < 0) return undefined;

  const before = hash === 0 ? '' : upto[hash - 1];
  /* A `#` that begins a word. Inside one it is a colour or an anchor. */
  if (before && !/\s|\(|\[/.test(before)) return undefined;

  const after = upto.slice(hash + 1);
  /* A space ends it — `# ` is a heading, and a query with a space in it is
     somebody who has moved on. */
  if (/\s/.test(after)) return undefined;
  return after;
}

/** Issues worth offering for what has been typed so far. */
export function matches(all: BoardIssue[], query: string, limit = 8): Hit[] {
  const q = query.trim().toLowerCase();
  const rows = all.map(i => ({ number: i.number, title: i.title, state: i.state }));
  if (!q) {
    /* Nothing typed yet: the most recent, which is what somebody referring to
       "the one I just filed" wants. */
    return rows.slice(0, limit);
  }
  const byNumber = rows.filter(r => String(r.number).startsWith(q));
  const byTitle = rows.filter(r => !String(r.number).startsWith(q)
    && r.title.toLowerCase().includes(q));
  return [...byNumber, ...byTitle].slice(0, limit);
}

/** `…#4` + `2` → the text with `#42 ` in place of the query. */
export function completed(text: string, caret: number, hit: Hit): {
  text: string; caret: number;
} {
  const query = queryAt(text, caret) ?? '';
  const start = caret - query.length - 1;
  const insert = `#${hit.number} `;
  return {
    text: text.slice(0, start) + insert + text.slice(caret),
    caret: start + insert.length,
  };
}

export function GhMention({ host, issues, onPick }: {
  /** The element the editor lives in — events are caught on their way out. */
  host: React.RefObject<HTMLElement | null>;
  issues: BoardIssue[];
  /** Called with the issue chosen; the caller writes it into the editor. */
  onPick: (hit: Hit, target: HTMLElement) => void;
}) {
  const [query, setQuery] = useState<string | undefined>();
  const [at, setAt] = useState<{ left: number; top: number } | undefined>();
  const [active, setActive] = useState(0);
  const target = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const read = (e: Event) => {
      const node = e.target as HTMLElement | null;
      if (!node) return;
      const isBox = node instanceof HTMLTextAreaElement || node.isContentEditable;
      if (!isBox) return;
      target.current = node;

      const { text, caret } = readCaret(node);
      const q = queryAt(text, caret);
      setQuery(q);
      setActive(0);
      if (q === undefined) return;

      /* Under the caret where the browser will say where that is, and under
         the box where it will not — a contenteditable with no selection
         rectangle still needs somewhere to put the list. */
      const box = node.getBoundingClientRect();
      const rect = caretRect() ?? box;
      const hostBox = el.getBoundingClientRect();
      setAt({ left: rect.left - hostBox.left, top: rect.bottom - hostBox.top + 4 });
    };

    const keys = (e: KeyboardEvent) => {
      if (query === undefined) return;
      const list = matches(issues, query);
      if (list.length === 0) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % list.length); }
      else if (e.key === 'ArrowUp') {
        e.preventDefault(); setActive(a => (a - 1 + list.length) % list.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (target.current) onPick(list[active], target.current);
        setQuery(undefined);
      } else if (e.key === 'Escape') { e.preventDefault(); setQuery(undefined); }
    };

    el.addEventListener('input', read);
    el.addEventListener('keydown', keys, true);
    el.addEventListener('blur', () => setTimeout(() => setQuery(undefined), 120), true);
    return () => {
      el.removeEventListener('input', read);
      el.removeEventListener('keydown', keys, true);
    };
  }, [host, issues, query, active, onPick]);

  if (query === undefined || !at) return null;
  const list = matches(issues, query);
  if (list.length === 0) return null;

  return (
    <div className="ghmention" style={{ left: at.left, top: at.top }}>
      {list.map((h, i) => (
        <button
          key={h.number}
          type="button"
          className={`ghmention-r${i === active ? ' on' : ''}`}
          /* `mousedown`, not `click`: the editor loses focus on mouse-down and
             the blur handler would have closed this before a click landed. */
          onMouseDown={e => {
            e.preventDefault();
            if (target.current) onPick(h, target.current);
            setQuery(undefined);
          }}
        >
          <span className="ghmention-n">#{h.number}</span>
          <span className="ghmention-t">{h.title}</span>
          {h.state === 'CLOSED' && <span className="chip">closed</span>}
        </button>
      ))}
    </div>
  );
}

/** The text and caret of whichever surface is focused. */
export function readCaret(node: HTMLElement): { text: string; caret: number } {
  if (node instanceof HTMLTextAreaElement) {
    return { text: node.value, caret: node.selectionStart ?? 0 };
  }
  const sel = window.getSelection();
  const text = node.textContent ?? '';
  if (!sel || sel.rangeCount === 0) return { text, caret: text.length };
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(node);
  range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
  return { text, caret: range.toString().length };
}

/** Where the caret is on screen, when the browser will say. */
function caretRect(): DOMRect | undefined {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return undefined;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  return rect.width || rect.height || rect.top ? rect : undefined;
}
