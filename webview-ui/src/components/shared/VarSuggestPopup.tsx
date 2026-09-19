import { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { TEMPLATE_HELPERS } from '@daakia/template-catalog';
import { useEnvStore } from '../../store/env-store';
import { useCollectionsStore } from '../../store/collections-store';
import { useTabsStore } from '../../store/tabs-store';
import { useDynamicVarsStore } from '../../store/dynamic-vars-store';
import {
  openBraces, suggestionsFor, applySuggestion, EMPTY_SOURCES,
  type VarSuggestion, type VarSources,
} from '../../services/template/var-suggest';
import {
  editableFrom, readEditable, writeEditable, type Editable,
} from '../../services/template/editable-target';
import { installVarCompletions } from '../../services/template/monaco-var-completions';

/**
 * The list `{{` opens, in every value field there is.
 *
 * Mounted once, at the root. It finds the field from the event rather than
 * being wired into each one — see editable-target.ts for why that is the only
 * version of this that reaches all of them.
 */

const ROW_H = 30;
/* A group heading is a row of its own as far as height is concerned, and
   leaving it out of the sum is what cut the last row in half. */
const GROUP_H = 22;
const PAD = 8;
/*
  Tall enough to read as a list even when two things match.

  A panel the height of one and a half rows looks like something went wrong
  rather than like a short answer, and the half-row at the bottom reads as
  content you cannot reach.
*/
const MIN_H = 120;
const MAX_H = 380;

const KIND_COLOR: Record<VarSuggestion['kind'], string> = {
  variable: 'var(--color-var-pill-text, #c084fc)',
  secret: 'var(--color-warning)',
  dynamic: 'var(--color-protocol-graphql)',
  helper: 'var(--color-accent)',
};

const KIND_LABEL: Record<VarSuggestion['kind'], string> = {
  variable: 'var',
  secret: 'secret',
  dynamic: 'dyn',
  helper: 'fn',
};

export function VarSuggestPopup() {
  const [target, setTarget] = useState<Editable | null>(null);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, above: false });
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  /* Set while we are writing into the field, so our own input event does not
     reopen the list on top of the value we just inserted. */
  const applying = useRef(false);

  const environments = useEnvStore(s => s.environments);
  const activeEnvId = useEnvStore(s => s.activeEnvId);
  const dynamic = useDynamicVarsStore(s => s.variables);
  const activeTabId = useTabsStore(s => s.activeTabId);
  const tabs = useTabsStore(s => s.tabs);

  const sources: VarSources = useMemo(() => {
    const active = environments.find(e => e.id === activeEnvId);
    const global = environments.find(e => e.isGlobal);
    const seen = new Set<string>();
    const env: VarSources['env'] = [];
    for (const e of [active, global]) {
      for (const v of e?.variables ?? []) {
        if (!v.key || seen.has(v.key)) continue;
        seen.add(v.key);
        env.push({ key: v.key, value: v.currentValue || v.initialValue, isSecret: v.isSecret });
      }
    }

    const tab = tabs.find(t => t.id === activeTabId);
    const collection = tab?.collectionId
      ? useCollectionsStore.getState().getVariables(tab.collectionId)
        .filter(v => v.key)
        .map(v => ({ key: v.key, value: v.value }))
      : [];

    return { env, collection, dynamic, helpers: TEMPLATE_HELPERS };
  }, [environments, activeEnvId, dynamic, tabs, activeTabId]);

  const items = useMemo(
    () => (target ? suggestionsFor(query, sources) : EMPTY_SOURCES.env as never as VarSuggestion[]),
    [target, query, sources],
  );

  const close = () => { setTarget(null); setQuery(''); setIndex(0); };

  /* Monaco draws its own text, so it gets a completion provider rather than
     this popup — registered once, for every editor in the app. */
  useEffect(() => { installVarCompletions(); }, []);

  // ── Watch every field on the page ────────────────────────────────────────
  useEffect(() => {
    const reconsider = (e: Event) => {
      if (applying.current) return;
      /*
        A click inside the list is not a click somewhere else.

        This listener runs in the capture phase, so a click on a row reached
        it before React's own handler did — the list closed, the row unmounted,
        and `onClick` never fired. Mouse selection simply did nothing and the
        keyboard was the only way to take a suggestion.
      */
      if ((e.target as HTMLElement | null)?.closest?.('[data-no-var-suggest]')) return;
      const el = editableFrom(e.target);
      if (!el) { close(); return; }
      const read = readEditable(el);
      if (!read) { close(); return; }

      const open = openBraces(read.value.slice(0, read.caret));
      if (!open) { close(); return; }

      const rect = el.getBoundingClientRect();
      const room = window.innerHeight - rect.bottom;
      const above = room < MIN_H + 12 && rect.top > room;
      setPos({
        top: above ? rect.top : rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 260),
        above,
      });
      setTarget(el);
      setQuery(open.query);
      setIndex(0);
    };

    document.addEventListener('input', reconsider, true);
    document.addEventListener('click', reconsider, true);
    document.addEventListener('keyup', (e) => {
      // Only movement keys — everything that changes the text already fired
      // `input`, and re-reading on every keyup would fight the list's own
      // arrow handling below.
      const k = (e as KeyboardEvent).key;
      if (k.startsWith('Arrow') || k === 'Home' || k === 'End') reconsider(e);
    }, true);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('input', reconsider, true);
      document.removeEventListener('click', reconsider, true);
      window.removeEventListener('blur', close);
    };
  }, []);

  // ── Drive the list from the keyboard ─────────────────────────────────────
  useEffect(() => {
    if (!target || items.length === 0) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setIndex(i => (i + 1) % items.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setIndex(i => (i - 1 + items.length) % items.length); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        /*
          Stopped here, not left to bubble: Enter in the URL bar sends the
          request, and taking a suggestion must not also fire it off.
        */
        e.stopPropagation();
        choose(items[index]);
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [target, items, index]);

  // Keep the highlighted row in view.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const choose = (suggestion: VarSuggestion) => {
    if (!target) return;
    const read = readEditable(target);
    if (!read) { close(); return; }
    const next = applySuggestion(read.value, read.caret, suggestion);
    applying.current = true;
    writeEditable(target, next.value, next.caret);
    // Released on the next tick — the input event we just caused is
    // synchronous, but a controlled component's re-render is not.
    setTimeout(() => { applying.current = false; }, 0);
    close();
  };

  if (!target || items.length === 0) return null;

  /*
    The real height of what is in there — rows plus the headings between them
    — so the list ends on a row boundary instead of through one.
  */
  const groups = new Set(items.map(s => s.group)).size;
  const content = items.length * ROW_H + groups * GROUP_H + PAD;
  const height = Math.max(MIN_H, Math.min(content, MAX_H));

  return createPortal(
    <div
      ref={listRef}
      data-no-var-suggest
      data-testid="var-suggest"
      style={{
        position: 'fixed',
        top: pos.above ? undefined : pos.top,
        bottom: pos.above ? window.innerHeight - pos.top + 4 : undefined,
        left: pos.left,
        width: pos.width,
        height,
        /* A short list gets the floor; a long one scrolls at the cap. */
        minHeight: Math.min(content, MIN_H),
        overflowY: 'auto',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
        padding: 4,
        zIndex: 10000,
        fontSize: 12.5,
      }}
      onMouseDown={e => e.preventDefault()}  // keep focus in the field
    >
      {items.map((s, i) => {
        const first = i === 0 || items[i - 1].group !== s.group;
        return (
          <div key={`${s.group}:${s.label}`}>
            {first && (
              <div style={{
                padding: '5px 8px 3px',
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
              }}>
                {s.group}
              </div>
            )}
            <div
              data-active={i === index}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(s)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: ROW_H - 4,
                padding: '0 8px',
                borderRadius: 5,
                cursor: 'pointer',
                background: i === index
                  ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)'
                  : 'transparent',
              }}
            >
              <span style={{
                fontSize: 9.5,
                fontWeight: 600,
                color: KIND_COLOR[s.kind],
                minWidth: 34,
              }}>
                {KIND_LABEL[s.kind]}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--color-text-primary)',
                whiteSpace: 'nowrap',
              }}>
                {s.label}
              </span>
              <span style={{
                marginLeft: 'auto',
                color: 'var(--color-text-muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '55%',
                textAlign: 'right',
              }}>
                {s.detail}
              </span>
            </div>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
