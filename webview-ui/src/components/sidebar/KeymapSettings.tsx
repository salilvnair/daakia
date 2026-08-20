/**
 * KeymapSettings — Settings → Keymap.
 *
 * Lists every shortcut the app registers and lets the user rebind any of them by pressing
 * the new combination live, IDE-style. Overrides persist in the shared app-settings blob
 * and are applied by the global keyboard listener via `resolveCombo`, so no call site
 * needs to know a shortcut was rebound.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ButtonView } from '@salilvnair/dui';
import { useAppSettingsStore } from '../../store/app-settings-store';
import {
  getRegisteredShortcuts, setKeymapOverrides,
  formatCombo, comboFromEvent, combosEqual, isModifierKey, IS_MAC,
  type KeyCombo, type KeymapOverrides,
} from '../../services/keyboard';
import { SHORTCUT_CATALOG, CATEGORY_ORDER, NATIVE_EDITING_SHORTCUTS } from '../../services/keyboard/shortcut-catalog';
import { SearchInput } from '../shared';
import { KeyboardIcon, RefreshIcon, TrashIcon, WarningTriangleIcon } from '../../icons';

const ACCENT = 'var(--color-settings)';

interface Row {
  id: string;
  label: string;
  category: string;
  defaultCombo: KeyCombo | null;
  activeCombo: KeyCombo | null;
  customized: boolean;
}

export function KeymapSettings() {
  const keymap = useAppSettingsStore(s => s.settings.keymap) ?? {};
  const save = useAppSettingsStore(s => s.save);
  const [query, setQuery] = useState('');
  const [capturingId, setCapturingId] = useState<string | null>(null);
  const [captured, setCaptured] = useState<KeyCombo | null>(null);
  const captureBoxRef = useRef<HTMLDivElement>(null);

  // Registered shortcuts are the source of truth for what EXISTS and its default combo;
  // the catalogue only supplies human labels.
  const rows: Row[] = useMemo(() => {
    const registered = new Map(getRegisteredShortcuts().map(s => [s.id, s.combo as KeyCombo]));
    const known = new Set(SHORTCUT_CATALOG.map(c => c.id));
    const all = [
      ...SHORTCUT_CATALOG,
      // A shortcut that is registered but missing from the catalogue still appears, rather
      // than quietly being unrebindable.
      ...[...registered.keys()].filter(id => !known.has(id)).map(id => ({ id, label: id, category: 'Other' })),
    ];
    return all.map(meta => {
      const defaultCombo = registered.get(meta.id) ?? null;
      const overridden = Object.prototype.hasOwnProperty.call(keymap, meta.id);
      return {
        ...meta,
        defaultCombo,
        activeCombo: overridden ? (keymap[meta.id] as KeyCombo | null) : defaultCombo,
        customized: overridden && !combosEqual(keymap[meta.id] as KeyCombo | null, defaultCombo),
      };
    });
  }, [keymap]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.label.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      formatCombo(r.activeCombo).toLowerCase().includes(q));
  }, [rows, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of filtered) {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push(r);
    }
    return [...map.entries()].sort(
      (a, b) => (CATEGORY_ORDER.indexOf(a[0]) + 1 || 99) - (CATEGORY_ORDER.indexOf(b[0]) + 1 || 99));
  }, [filtered]);

  /** Another shortcut already bound to the combo being captured. */
  const conflict = useMemo(() => {
    if (!captured || !capturingId) return null;
    return rows.find(r => r.id !== capturingId && combosEqual(r.activeCombo, captured)) ?? null;
  }, [captured, capturingId, rows]);

  // Live capture. Listens in the CAPTURE phase and swallows the event so the shortcut being
  // recorded doesn't also fire its own action while you're assigning it.
  useEffect(() => {
    if (!capturingId) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setCapturingId(null); setCaptured(null); return; }
      if (isModifierKey(e.key)) return;   // wait for a real key, keep showing the modifiers
      setCaptured(comboFromEvent(e));
    };
    window.addEventListener('keydown', onKey, true);
    captureBoxRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturingId]);

  const persist = (next: KeymapOverrides) => save({ keymap: next as never });

  const commit = () => {
    if (!capturingId || !captured) return;
    const next: KeymapOverrides = { ...keymap };
    // Two shortcuts on one combo means the second never fires (first match wins), so take
    // the binding off the previous owner rather than leaving it silently dead.
    if (conflict) next[conflict.id] = null;
    next[capturingId] = captured;
    persist(next);
    setCapturingId(null);
    setCaptured(null);
  };

  const resetOne = (id: string) => {
    const next = { ...keymap };
    delete next[id];
    persist(next);
  };

  const unbind = (id: string) => persist({ ...keymap, [id]: null });
  const resetAll = () => persist({});

  const customCount = rows.filter(r => r.customized).length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-4">
        <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">Keymap</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
          Every keyboard shortcut in Daakia. Click a shortcut, press the keys you want, and save —
          the new binding applies immediately and persists. Showing {IS_MAC ? 'macOS' : 'Windows/Linux'} conventions.
        </p>
        {/* Rebinding here governs Daakia's OWN listener. A handful of chords (⌘K chief among
            them) are claimed by VS Code itself and never reach the webview at all, so saying
            so up front beats the user rebinding something and concluding it is broken. */}
        <p className="text-[10.5px] mt-2 px-2 py-1.5 rounded-md" style={{
          background: 'color-mix(in srgb, var(--color-warning) 9%, transparent)',
          color: 'var(--color-text-secondary)',
        }}>
          Daakia runs inside VS Code, which claims some chords for itself — <span className="font-mono">⌘K</span> is
          a chord prefix there, for example. If a shortcut never reaches Daakia, VS Code caught it first;
          run <span className="font-mono">Developer: Inspect Key Mappings</span> from the VS Code command
          palette to see what has it, then pick a different combination here.
        </p>

        <div className="flex items-center gap-2 mt-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search shortcuts…" />
          <ButtonView
            size="md" variant="secondary" accentColor={ACCENT}
            iconLeft={<RefreshIcon size={13} />}
            disabled={customCount === 0}
            onClick={resetAll}
          >
            Reset all{customCount ? ` (${customCount})` : ''}
          </ButtonView>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-5 py-4 flex flex-col gap-5">
        {grouped.map(([category, items]) => (
          <div key={category}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: ACCENT }}>{category}</p>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-surface-border)' }}>
              {items.map((r, i) => {
                const capturing = capturingId === r.id;
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 px-3 py-2 group"
                    style={{ borderTop: i === 0 ? undefined : '1px solid var(--color-surface-border)' }}
                  >
                    <span className="text-[12px] flex-1 min-w-0 truncate text-[var(--color-text-primary)]">
                      {r.label}
                      {r.customized && (
                        <span className="ml-2 text-[9.5px] px-1.5 py-0.5 rounded font-medium"
                          style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 14%, transparent)`, color: ACCENT }}>
                          customized
                        </span>
                      )}
                    </span>

                    {capturing ? (
                      <div
                        ref={captureBoxRef}
                        tabIndex={-1}
                        className="flex items-center gap-2 px-2.5 py-1 rounded-md outline-none"
                        style={{ border: `1px solid ${ACCENT}`, background: `color-mix(in srgb, ${ACCENT} 8%, transparent)` }}
                      >
                        <KeyboardIcon size={12} style={{ color: ACCENT }} />
                        <span className="text-[11.5px] font-mono" style={{ color: ACCENT, minWidth: 70 }}>
                          {captured ? formatCombo(captured) : 'Press keys…'}
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setCapturingId(r.id); setCaptured(null); }}
                        title="Click, then press the new keys"
                        className="px-2.5 py-1 rounded-md text-[11.5px] font-mono cursor-pointer transition-colors"
                        style={{
                          border: '1px solid var(--color-surface-border)',
                          color: r.activeCombo ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                          minWidth: 84, textAlign: 'center',
                        }}
                      >
                        {formatCombo(r.activeCombo)}
                      </button>
                    )}

                    {capturing ? (
                      <div className="flex items-center gap-1.5">
                        <ButtonView size="xs" variant="primary" accentColor={ACCENT} disabled={!captured} onClick={commit}>Save</ButtonView>
                        <ButtonView size="xs" variant="secondary" accentColor="var(--color-text-muted)"
                          onClick={() => { setCapturingId(null); setCaptured(null); }}>Cancel</ButtonView>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ButtonView size="xs" variant="secondary" accentColor="var(--color-text-muted)"
                          disabled={!r.customized} onClick={() => resetOne(r.id)}>Reset</ButtonView>
                        <ButtonView size="xs" variant="secondary" accentColor="var(--color-error)"
                          iconLeft={<TrashIcon size={11} />} disabled={!r.activeCombo} onClick={() => unbind(r.id)}>
                          Unbind
                        </ButtonView>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Conflict warning renders under the group being edited */}
            {capturingId && conflict && items.some(i => i.id === capturingId) && (
              <div className="flex items-center gap-2 mt-1.5 px-2 py-1.5 rounded-md text-[11px]"
                style={{ background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)', color: 'var(--color-warning)' }}>
                <WarningTriangleIcon size={12} />
                Already used by "{conflict.label}" — saving will unbind it.
              </div>
            )}
          </div>
        ))}

        {grouped.length === 0 && (
          <p className="text-[11.5px] italic text-[var(--color-text-muted)]">No shortcuts match "{query}".</p>
        )}

        {/* Editing keys are handled by the focused editor, not our global listener — listed
            so this page is a complete answer to "what shortcuts do I have". */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            Editing (handled by the focused editor — not rebindable)
          </p>
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-surface-border)' }}>
            {NATIVE_EDITING_SHORTCUTS.map((s, i) => (
              <div key={s.label} className="flex items-center gap-3 px-3 py-1.5"
                style={{ borderTop: i === 0 ? undefined : '1px solid var(--color-surface-border)' }}>
                <span className="text-[12px] flex-1 text-[var(--color-text-secondary)]">{s.label}</span>
                <span className="text-[11.5px] font-mono text-[var(--color-text-muted)]">{IS_MAC ? s.mac : s.win}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
