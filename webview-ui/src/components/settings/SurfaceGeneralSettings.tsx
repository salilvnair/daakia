/**
 * Settings → DK8S → General, and Settings → DKGH → General.
 *
 * One page each for the things that are about the *surface* rather than about
 * what it does: whether it is on the toolbar at all, and a way in from here.
 * Cluster, Terminal and GitHub CLI are about behaviour and stay where they are.
 *
 * The switch is worded as what it does — takes the icon off the rail — because
 * a setting that reads as "turn dk8s off" and in fact only hides a shortcut
 * would send somebody hunting for a feature they still have.
 */
import { Dk8sIcon, IssueOpenedIcon, KeyboardIcon } from '../../icons';
import { useTabsStore } from '../../store/tabs-store';
import { useShowOnToolbar, type ToolbarSurface } from '../../store/toolbar-visibility';
import { KubectlBinarySetting } from './KubectlBinarySetting';

function Toggle({ on, onChange, label, description, accent }: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
  accent: string;
}) {
  return (
    <label className="flex items-start gap-3 px-4 py-3.5 rounded-lg cursor-pointer"
           style={{
             background: 'var(--color-surface)',
             border: '1px solid var(--color-surface-border)',
             maxWidth: '92ch',
           }}>
      <input
        type="checkbox"
        checked={on}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: accent, marginTop: 2, width: 15, height: 15 }}
      />
      <span className="flex flex-col gap-1.5 flex-1 min-w-0">
        <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          {label}
        </span>
        <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {description}
        </span>
      </span>
    </label>
  );
}

function SurfaceGeneral({ surface, name, what, accent, icon, open, children }: {
  surface: ToolbarSurface;
  name: string;
  /** One line: what this surface is, for somebody deciding whether to keep it. */
  what: string;
  accent: string;
  icon: React.ReactNode;
  open: () => void;
  /** Anything else about the surface itself rather than about what it does. */
  children?: React.ReactNode;
}) {
  const [shown, setShown] = useShowOnToolbar(surface);

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <div className="flex items-center gap-2">
        <span style={{ color: accent, display: 'inline-flex' }}>{icon}</span>
        <span className="text-[14px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          General
        </span>
      </div>
      <span className="text-[11.5px] leading-relaxed"
            style={{ color: 'var(--color-text-muted)', maxWidth: '72ch' }}>
        {what}
      </span>

      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-[9.5px] uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}>
          toolbar
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
      </div>

      <Toggle
        on={shown}
        onChange={setShown}
        accent={accent}
        label={`Show ${name} on the toolbar`}
        description={`Puts the ${name} icon in the rail down the left, below the protocols. `
          + `Turning it off hides the icon and nothing else: ${name} still opens from the `
          + `command palette, and a tab you already have open stays open.`}
      />

      {!shown && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg text-[11.5px]"
             style={{
               background: 'var(--color-surface)',
               border: '1px solid var(--color-surface-border)',
               color: 'var(--color-text-secondary)',
               maxWidth: '92ch',
             }}>
          <KeyboardIcon size={14} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>
            The icon is off. <b>Ctrl+K</b> (⌘K on a Mac) opens the command palette —
            type <b>{name}</b> and it is the first result.
          </span>
        </div>
      )}

      {children}

      <div>
        <button
          type="button"
          onClick={open}
          className="text-[12px] px-3 py-1.5 rounded-md cursor-pointer"
          style={{
            color: accent,
            background: `color-mix(in srgb, ${accent} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${accent} 32%, transparent)`,
          }}
        >
          Open {name}
        </button>
      </div>
    </div>
  );
}

export function Dk8sGeneralSettings() {
  return (
    <SurfaceGeneral
      surface="dk8s"
      name="dk8s"
      accent="var(--color-dk8s)"
      icon={<Dk8sIcon size={16} />}
      what={'Dk8s — Daakia K8s — watches pods across clusters, reads and searches their '
        + 'logs, opens a shell in a container, browses its filesystem, and reads heap, '
        + 'thread and flight-recorder dumps in place.'}
      open={() => useTabsStore.getState().openDk8sTab()}
    >
      {/* Which binary it drives is a fact about dk8s itself, not about how it
          behaves against a cluster — so it is here rather than on Cluster. */}
      <KubectlBinarySetting />
    </SurfaceGeneral>
  );
}

export function DkghGeneralSettings() {
  return (
    <SurfaceGeneral
      surface="dkgh"
      name="dkgh"
      accent="var(--color-dkgh)"
      icon={<IssueOpenedIcon size={16} />}
      what={'DkGH — Daakia GitHub — is a board, a table and a roadmap over one '
        + 'repository’s issues, read and written through the GitHub CLI you already have '
        + 'signed in.'}
      open={() => useTabsStore.getState().openDkghTab()}
    />
  );
}
