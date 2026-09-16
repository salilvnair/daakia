/**
 * Settings → DK8S → Commands → Config.
 *
 * Which kinds of kubectl call the Commands tab shows. Built like Audit Config
 * next door, because it is the same idea about a different log and somebody
 * who has used one should not have to learn the other.
 *
 * What it does NOT do is stop a call being made or being written down. Every
 * command dk8s runs is still run and still recorded — an audit with holes in
 * it is not an audit. This is what reaches the screen.
 *
 * The defaults are in `command-kinds.ts` with the reasoning: on for the calls
 * you caused, off for the ones dk8s makes to answer its own questions. Seven
 * permission probes per namespace and a metrics poll every fifteen seconds
 * are real, and they are four hundred rows between you and the command you
 * are looking for.
 */
import { useMemo } from 'react';
import { useUiStateStore } from '../../store/ui-state-store';
import {
  commandCatalogue, defaultEnabled, enabledKinds, type CommandKind,
} from '@daakia/command-kinds';
import { CheckIcon } from '../../icons';

const ACCENT = 'var(--color-dk8s)';

export const COMMAND_KINDS_PREF = 'dk8s.commandKinds';

/** The enabled set, for anything that needs to filter rows. */
export function useEnabledCommandKinds(): Set<string> {
  const stored = useUiStateStore(s => s.prefs[COMMAND_KINDS_PREF]);
  return useMemo(() => enabledKinds(stored), [stored]);
}

function Row({ kind, on, onToggle }: {
  kind: CommandKind; on: boolean; onToggle: () => void;
}) {
  return (
    <label
      className="flex items-start gap-3 px-4 py-3 cursor-pointer"
      style={{ borderBottom: '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)' }}
    >
      <input
        type="checkbox"
        checked={on}
        onChange={onToggle}
        style={{ accentColor: ACCENT, marginTop: 3, width: 14, height: 14, flexShrink: 0 }}
      />
      <span className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[12.5px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            {kind.label}
          </span>
          {/* The shape of the command, so a row on the Commands tab can be
              matched against this list by eye. */}
          <code
            className="text-[11px]"
            style={{ fontFamily: 'var(--font-mono, monospace)', color: ACCENT }}
          >
            {kind.command}
          </code>
        </span>
        <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {kind.where}
        </span>
      </span>
    </label>
  );
}

export function Dk8sCommandConfig() {
  const stored = useUiStateStore(s => s.prefs[COMMAND_KINDS_PREF]);
  const setPref = useUiStateStore(s => s.setPref);

  const catalogue = useMemo(() => commandCatalogue(), []);
  const on = useMemo(() => enabledKinds(stored), [stored]);

  const write = (next: Set<string>) =>
    setPref(COMMAND_KINDS_PREF, JSON.stringify([...next]));

  const toggle = (id: string) => {
    const next = new Set(on);
    if (next.has(id)) next.delete(id); else next.add(id);
    write(next);
  };

  /* Split the way the reasoning does, so the page teaches the distinction
     rather than presenting sixteen equivalent switches. */
  const yours = catalogue.filter(k => k.defaultOn);
  const asked = catalogue.filter(k => !k.defaultOn);
  const isDefault = new Set(defaultEnabled()).size === on.size
    && defaultEnabled().every(id => on.has(id));

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 flex-wrap">
        <span className="text-[14px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          Command Config
        </span>
        <span
          className="text-[10.5px] px-2 py-0.5 rounded-full tabular-nums"
          style={{
            color: ACCENT,
            background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${ACCENT} 28%, transparent)`,
          }}
        >
          {on.size}/{catalogue.length} shown
        </span>
        <span className="flex-1" />
        <button type="button" onClick={() => write(new Set(catalogue.map(k => k.id)))}
                className="text-[11px] px-2 py-1 rounded cursor-pointer"
                style={{ color: 'var(--color-success)', background: 'none', border: '1px solid var(--color-surface-border)' }}>
          Show all
        </button>
        <button type="button" onClick={() => write(new Set())}
                className="text-[11px] px-2 py-1 rounded cursor-pointer"
                style={{ color: 'var(--color-warning)', background: 'none', border: '1px solid var(--color-surface-border)' }}>
          Show none
        </button>
        <button type="button" disabled={isDefault} onClick={() => write(new Set(defaultEnabled()))}
                className="text-[11px] px-2 py-1 rounded"
                style={{
                  cursor: isDefault ? 'default' : 'pointer',
                  color: isDefault ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
                  background: 'none', border: '1px solid var(--color-surface-border)',
                  opacity: isDefault ? 0.6 : 1,
                }}>
          Reset defaults
        </button>
      </div>

      <p className="text-[11.5px] leading-relaxed px-5 pb-3"
         style={{ color: 'var(--color-text-muted)', maxWidth: '110ch' }}>
        Which kinds of call the Commands tab lists. Nothing here stops a command being run or
        being recorded &mdash; every one dk8s makes is still written down, because an audit with
        holes in it is not an audit. This is only what reaches the screen.
      </p>

      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <Group
          title="What you did"
          blurb="You pressed something and this is what it ran."
          kinds={yours} on={on} toggle={toggle}
        />
        <Group
          title="What dk8s asked on your behalf"
          blurb={'Nobody pressed anything to make these run. They are real, they are recorded, '
            + 'and there are hundreds of them — a metrics poll every fifteen seconds per '
            + 'watched namespace, and seven permission checks before a button is drawn.'}
          kinds={asked} on={on} toggle={toggle}
        />
      </div>
    </div>
  );
}

function Group({ title, blurb, kinds, on, toggle }: {
  title: string;
  blurb: string;
  kinds: CommandKind[];
  on: Set<string>;
  toggle: (id: string) => void;
}) {
  const shown = kinds.filter(k => on.has(k.id)).length;
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-5 py-2"
           style={{
             background: 'var(--color-surface)',
             borderTop: '1px solid var(--color-surface-border)',
             borderBottom: '1px solid var(--color-surface-border)',
           }}>
        <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          {title}
        </span>
        <span className="text-[10.5px] tabular-nums flex items-center gap-1"
              style={{ color: shown ? ACCENT : 'var(--color-text-muted)' }}>
          {shown === kinds.length && <CheckIcon size={10} />}
          {shown}/{kinds.length}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed px-5 py-2"
         style={{ color: 'var(--color-text-muted)', maxWidth: '110ch' }}>
        {blurb}
      </p>
      {kinds.map(k => (
        <Row key={k.id} kind={k} on={on.has(k.id)} onToggle={() => toggle(k.id)} />
      ))}
    </div>
  );
}
