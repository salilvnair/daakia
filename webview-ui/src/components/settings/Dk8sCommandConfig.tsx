/**
 * Settings → DK8S → Commands → Command Config.
 *
 * Built as Developer Tools → Audit Config is built, down to the collapsible
 * coloured group chips and the little toggle switches, because it is the same
 * idea about a different log: somebody who has tuned one already knows this.
 *
 * What it does NOT do is stop a call being made or being written down. Every
 * command dk8s runs is still run and still recorded — an audit with holes in
 * it is not an audit. This is what reaches the screen.
 *
 * The defaults live in `command-kinds.ts` with the reasoning: on for the calls
 * you caused, off for the ones dk8s makes to answer its own questions. Seven
 * permission probes per namespace and a metrics poll every fifteen seconds are
 * real, and they are four hundred rows between you and the command you are
 * looking for.
 */
import { useMemo } from 'react';
import { useUiStateStore } from '../../store/ui-state-store';
import {
  commandCatalogue, defaultEnabled, enabledKinds,
  COMMAND_GROUPS, type CommandKind,
} from '@daakia/command-kinds';
import { ChevronRightIcon } from '../../icons';

export const COMMAND_KINDS_PREF = 'dk8s.commandKinds';
const COLLAPSED_PREF = 'dk8s.commandKinds.collapsed';

/** The enabled set, for anything that needs to filter rows. */
export function useEnabledCommandKinds(): Set<string> {
  const stored = useUiStateStore(s => s.prefs[COMMAND_KINDS_PREF]);
  return useMemo(() => enabledKinds(stored), [stored]);
}

export function Dk8sCommandConfig() {
  const stored = useUiStateStore(s => s.prefs[COMMAND_KINDS_PREF]);
  const setPref = useUiStateStore(s => s.setPref);

  const catalogue = useMemo(() => commandCatalogue(), []);
  const on = useMemo(() => enabledKinds(stored), [stored]);

  /* Empty means every group open, which is right for a first visit — and it
     lives in prefs rather than in state, so tuning one group and switching
     tabs does not undo the folding you did to get there. */
  const collapsedRaw = useUiStateStore(s => s.prefs[COLLAPSED_PREF]);
  const collapsed = useMemo(
    () => new Set((collapsedRaw ?? '').split(',').filter(Boolean)),
    [collapsedRaw],
  );

  const toggleCollapse = (group: string) => {
    const n = new Set(collapsed);
    if (n.has(group)) n.delete(group); else n.add(group);
    setPref(COLLAPSED_PREF, [...n].join(','));
  };

  const write = (next: Set<string>) => setPref(COMMAND_KINDS_PREF, JSON.stringify([...next]));

  const toggle = (id: string) => {
    const next = new Set(on);
    if (next.has(id)) next.delete(id); else next.add(id);
    write(next);
  };

  const setGroup = (ids: string[], enabled: boolean) => {
    const next = new Set(on);
    for (const id of ids) { if (enabled) next.add(id); else next.delete(id); }
    write(next);
  };

  const grouped = COMMAND_GROUPS
    .map(g => ({ ...g, kinds: catalogue.filter(k => k.group === g.id) }))
    .filter(g => g.kinds.length > 0);

  const defaults = defaultEnabled();
  const isDefault = defaults.length === on.size && defaults.every(id => on.has(id));

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ─── Header ─── */}
      <div className="flex items-center gap-2 px-4 py-2.5 shrink-0 border-b"
           style={{ borderColor: 'var(--color-surface-border)' }}>
        <span className="text-[11px] font-medium text-[var(--color-text-primary)]">Command Config</span>
        <span className="text-[9.5px] px-1.5 py-0.5 rounded tabular-nums"
              style={{
                color: 'var(--color-dk8s)',
                backgroundColor: 'color-mix(in srgb, var(--color-dk8s) 12%, transparent)',
              }}>
          {on.size}/{catalogue.length} shown
        </span>
        <div className="flex-1" />
        <button type="button" onClick={() => write(new Set(catalogue.map(k => k.id)))}
          className="px-2 py-0.5 text-[10px] rounded cursor-pointer transition-colors border"
          style={{
            color: 'var(--color-success)',
            borderColor: 'color-mix(in srgb, var(--color-success) 24%, transparent)',
            background: 'color-mix(in srgb, var(--color-success) 8%, transparent)',
          }}>
          Enable All
        </button>
        <button type="button" onClick={() => write(new Set())}
          className="px-2 py-0.5 text-[10px] rounded cursor-pointer transition-colors border"
          style={{
            color: 'var(--color-warning)',
            borderColor: 'color-mix(in srgb, var(--color-warning) 24%, transparent)',
            background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
          }}>
          Disable All
        </button>
        <button type="button" onClick={() => write(new Set(defaults))} disabled={isDefault}
          className="px-2 py-0.5 text-[10px] rounded border text-[var(--color-text-muted)]"
          style={{
            cursor: isDefault ? 'default' : 'pointer',
            opacity: isDefault ? 0.55 : 1,
            borderColor: 'color-mix(in srgb, var(--color-text-primary) 12%, transparent)',
            background: 'color-mix(in srgb, var(--color-text-primary) 4%, transparent)',
          }}>
          Reset Defaults
        </button>
      </div>

      {/* ─── Description ─── */}
      <div className="px-4 py-2 shrink-0 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
        <p className="text-[10.5px] text-[var(--color-text-muted)] leading-relaxed">
          Which kinds of call the Command Log lists. Nothing here stops a command being run or
          being recorded &mdash; every one dk8s makes is still written down, because an audit with
          holes in it is not an audit. This is only what reaches the screen.
        </p>
      </div>

      {/* ─── The kinds ─── */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-4 py-3">
        <div className="flex flex-col gap-4">
          {grouped.map(({ id, label, color, kinds }) => {
            const enabled = kinds.filter(k => on.has(k.id)).length;
            const allOn = enabled === kinds.length;
            const isCollapsed = collapsed.has(id);
            return (
              <div key={id}>
                <div className="flex items-center gap-2 mb-1.5">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(id)}
                    className="flex items-center gap-2 cursor-pointer min-w-0"
                    style={{ background: 'none', border: 'none', padding: 0 }}
                  >
                    <ChevronRightIcon
                      size={12}
                      style={{
                        color,
                        transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                        transition: 'transform 0.2s ease',
                        flexShrink: 0,
                        opacity: 0.7,
                      }}
                    />
                    <span className="text-[9.5px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                          style={{ color, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}>
                      {label}
                    </span>
                  </button>
                  <div className="flex-1 h-px" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)` }} />
                  <span className="text-[9px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                    {enabled}/{kinds.length}
                  </span>
                  <button type="button"
                    onClick={e => { e.stopPropagation(); setGroup(kinds.map(k => k.id), !allOn); }}
                    className="w-[28px] h-[15px] rounded-full cursor-pointer transition-all relative flex-shrink-0"
                    style={{ backgroundColor: allOn ? color : 'color-mix(in srgb, var(--color-text-primary) 10%, transparent)' }}
                    title={allOn ? `Hide every ${label} command` : `Show every ${label} command`}>
                    <span className="absolute top-[2px] w-[11px] h-[11px] rounded-full bg-white shadow transition-all duration-200"
                          style={{ left: allOn ? '14px' : '2px' }} />
                  </button>
                </div>

                {!isCollapsed && (
                  <div className="rounded-xl border overflow-hidden"
                       style={{
                         borderColor: `color-mix(in srgb, ${color} 12%, transparent)`,
                         backgroundColor: `color-mix(in srgb, ${color} 2%, transparent)`,
                       }}>
                    {kinds.map((k, i) => (
                      <KindRow
                        key={k.id}
                        kind={k}
                        color={color}
                        on={on.has(k.id)}
                        last={i === kinds.length - 1}
                        onToggle={() => toggle(k.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KindRow({ kind, color, on, last, onToggle }: {
  kind: CommandKind; color: string; on: boolean; last: boolean; onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 ${last ? '' : 'border-b'}`}
      style={{ borderColor: 'color-mix(in srgb, var(--color-text-primary) 4%, transparent)' }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10.5px] font-medium"
                style={{ color: on ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
            {kind.label}
          </span>
          {/* The shape of the command, so a row in the log can be matched
              against this list by eye. */}
          <span className="font-mono text-[9px] px-1 py-0.5 rounded"
                style={{ color, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}>
            {kind.command}
          </span>
        </div>
        <div className="text-[9.5px] mt-0.5 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          {kind.where}
        </div>
      </div>
      <button type="button"
        onClick={onToggle}
        className="w-[28px] h-[15px] rounded-full cursor-pointer transition-all relative flex-shrink-0"
        style={{ backgroundColor: on ? color : 'color-mix(in srgb, var(--color-text-primary) 10%, transparent)' }}
        title={on ? 'Hide these from the Command Log' : 'Show these in the Command Log'}>
        <span className="absolute top-[2px] w-[11px] h-[11px] rounded-full bg-white shadow transition-all duration-200"
              style={{ left: on ? '14px' : '2px' }} />
      </button>
    </div>
  );
}
