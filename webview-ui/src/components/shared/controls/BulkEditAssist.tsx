/**
 * Bulk edit, finished like a URL bar.
 *
 * Wraps a dui `KeyValueTableView`. While its bulk box is open, the line being
 * typed gets suggestions under the caret — whole `Key: value` lines for a
 * headers table — and the box closes back to rows on Ctrl+Enter (rebindable:
 * "kv.bulk-done" on the Keymap page) or on a click anywhere outside the table.
 *
 * It works from outside because the table is dui's, installed from npm: the
 * box is found as the table's textarea, and closing it presses the table's
 * own Bulk edit button, which is what parses the text back into rows. When
 * dui grows these as props, this wrapper should go.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { matchesShortcut, formatCombo, resolveCombo } from '../../../services/keyboard';
import { useTabsStore } from '../../../store/tabs-store';
import { useSidebarDataStore } from '../../../store/sidebar-data-store';
import type { CollectionTreeNode } from '../../../services/collections/tree-helpers';
import './bulk-edit-assist.css';
import { applySuggestion, buildUsedHeaders, suggestFor, type BulkSuggestion, type UsedHeaders } from './bulk-edit-suggest';

const DONE_ID = 'kv.bulk-done';
const DONE_DEFAULT = { key: 'Enter', ctrlKey: true };

/** The headers the user already sends: open tabs, then every saved request. */
function usedHeaders(): UsedHeaders {
  const pairs: { key?: string; value?: string }[] = [];
  for (const t of useTabsStore.getState().tabs) {
    const hs = (t as { headers?: { key?: string; value?: string }[] }).headers;
    if (Array.isArray(hs)) pairs.push(...hs);
  }
  const walk = (nodes: CollectionTreeNode[] | undefined) => {
    for (const n of nodes ?? []) {
      for (const r of n.requests ?? []) {
        if (!r.data || pairs.length > 20000) continue;
        try {
          const hs = JSON.parse(r.data)?.headers;
          if (Array.isArray(hs)) pairs.push(...hs);
        } catch { /* a request saved before headers were rows */ }
      }
      walk(n.children);
    }
  };
  for (const tree of Object.values(useSidebarDataStore.getState().collections ?? {})) walk(tree as CollectionTreeNode[]);
  return buildUsedHeaders(pairs);
}

/** Where the caret is drawn: a hidden copy of the textarea, laid out the same, up to the caret. */
function caretPoint(area: HTMLTextAreaElement, pos: number): { left: number; top: number; height: number } {
  const cs = getComputedStyle(area);
  const mirror = document.createElement('div');
  for (const p of ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'tabSize', 'textIndent', 'wordSpacing'] as const) {
    (mirror.style as unknown as Record<string, string>)[p] = cs[p] as string;
  }
  Object.assign(mirror.style, { position: 'fixed', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', top: '0', left: '0' });
  mirror.textContent = area.value.slice(0, pos);
  const mark = document.createElement('span');
  mark.textContent = '​';
  mirror.appendChild(mark);
  document.body.appendChild(mirror);
  const r = area.getBoundingClientRect();
  const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
  const point = { left: r.left + mark.offsetLeft - area.scrollLeft, top: r.top + mark.offsetTop - area.scrollTop, height: lineHeight };
  mirror.remove();
  return point;
}

/** Write into the table's own textarea so its React state follows. */
function writeArea(area: HTMLTextAreaElement, text: string, caret: number) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, text);
  area.setSelectionRange(caret, caret);
  area.dispatchEvent(new Event('input', { bubbles: true }));
}

const MENU_W = 360;

export function BulkEditAssist({ children, suggest }: {
  children: ReactNode;
  /** `headers`: offer header lines. Without it the box only gains Ctrl+Enter and click-away. */
  suggest?: 'headers';
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<HTMLTextAreaElement | null>(null);
  const [items, setItems] = useState<BulkSuggestion[]>([]);
  const [hi, setHi] = useState(0);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const usedRef = useRef<UsedHeaders | null>(null);
  const pickRef = useRef<(s: BulkSuggestion) => void>(() => {});

  /* The box comes and goes as the table switches modes. */
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const find = () => setArea(box.querySelector('textarea'));
    find();
    const mo = new MutationObserver(find);
    mo.observe(box, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  const done = () => {
    setItems([]);
    const btn = boxRef.current?.querySelector<HTMLButtonElement>('button[title="Bulk edit"], button[aria-label="Bulk edit"]');
    btn?.click();
  };
  const doneRef = useRef(done);
  doneRef.current = done;

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const hiRef = useRef(hi);
  hiRef.current = hi;

  useEffect(() => {
    if (!area) { setItems([]); usedRef.current = null; return; }

    const refresh = () => {
      if (!suggest) return;
      if (!usedRef.current) usedRef.current = usedHeaders();
      const caret = area.selectionStart;
      if (caret !== area.selectionEnd) { setItems([]); return; }
      const next = suggestFor(area.value, caret, usedRef.current);
      setItems(next);
      setHi(0);
      if (next.length) {
        const p = caretPoint(area, caret);
        const left = Math.max(8, Math.min(p.left, window.innerWidth - MENU_W - 8));
        setAt({ left, top: p.top + p.height + 4 });
      }
    };

    const pick = (s: BulkSuggestion) => {
      const next = applySuggestion(area.value, area.selectionStart, s);
      writeArea(area, next.text, next.caret);   // the input event offers the values next, for a bare key
      area.focus();
    };
    pickRef.current = pick;

    const onKey = (e: KeyboardEvent) => {
      if (matchesShortcut(e, DONE_ID)) {
        e.preventDefault();
        e.stopPropagation();   // Ctrl+Enter elsewhere sends the request
        doneRef.current();
        return;
      }
      const list = itemsRef.current;
      if (suggest && e.key === ' ' && e.ctrlKey) { e.preventDefault(); refresh(); return; }
      if (!list.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => (h + 1) % list.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => (h - 1 + list.length) % list.length); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); pick(list[hiRef.current] ?? list[0]); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setItems([]); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') setItems([]);
    };
    const onInput = () => refresh();
    const onBlur = () => setTimeout(() => { if (document.activeElement !== area) setItems([]); }, 120);
    const onClick = () => setItems([]);

    area.addEventListener('keydown', onKey);
    area.addEventListener('input', onInput);
    area.addEventListener('blur', onBlur);
    area.addEventListener('click', onClick);
    area.addEventListener('scroll', onClick);
    return () => {
      area.removeEventListener('keydown', onKey);
      area.removeEventListener('input', onInput);
      area.removeEventListener('blur', onBlur);
      area.removeEventListener('click', onClick);
      area.removeEventListener('scroll', onClick);
    };
  }, [area, suggest]);

  /* A click anywhere outside the table puts the rows back. */
  useEffect(() => {
    if (!area) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      doneRef.current();
    };
    document.addEventListener('mousedown', away, true);
    return () => document.removeEventListener('mousedown', away, true);
  }, [area]);

  const doneLabel = useMemo(() => formatCombo(resolveCombo(DONE_ID, DONE_DEFAULT)), [area]);

  return (
    <div ref={boxRef} className="dk-bulkassist">
      {children}
      {area && (
        <p className="dk-bulkassist__hint">
          {suggest ? <>Type a header for suggestions, <kbd>Ctrl+Space</kbd> to ask again. </> : null}
          {doneLabel !== 'Unassigned' && <><kbd>{doneLabel}</kbd> or a click outside goes back to rows.</>}
        </p>
      )}
      {area && items.length > 0 && at && createPortal(
        <div ref={menuRef} className="dk-bulkassist__menu" role="listbox" aria-label="Header suggestions"
             style={{ left: at.left, top: at.top, width: MENU_W }}
             onMouseDown={e => e.preventDefault()}>
          {items.map((s, i) => (
            <button
              key={`${s.key}:${s.value ?? ''}`}
              type="button"
              role="option"
              aria-selected={i === hi}
              className={`dk-bulkassist__item${i === hi ? ' is-on' : ''}`}
              onMouseEnter={() => setHi(i)}
              onClick={() => pickRef.current(s)}
            >
              <span className={s.valueOnly ? 'dk-bulkassist__key is-quiet' : 'dk-bulkassist__key'}>{s.key}:</span>
              {s.value !== undefined && <span className="dk-bulkassist__value">{s.value}</span>}
              {s.used && <span className="dk-bulkassist__tag">used</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
