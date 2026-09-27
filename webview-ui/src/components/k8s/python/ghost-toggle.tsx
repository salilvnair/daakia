/**
 * AI suggestions in the Python editor — the grey ghost text — on or off.
 *
 * Two switches, and both must be on:
 *   - Settings → AI Features, the feature itself (the `dk8s.python.complete`
 *     stage) — off, and no request is made anywhere, for anybody;
 *   - this one, a reader's own, kept in this browser: somebody reading a
 *     script aloud, or typing in a pod they would rather not send to a
 *     model, turns it off for a while without touching Settings.
 * With the feature off in Settings, the button and the menu say so and open
 * Settings, rather than toggling a switch that could not turn it on.
 *
 * On by default. The toolbar button and the editor's right-click menu both
 * flip it; the provider reads it on every request, so turning it off stops
 * the next suggestion, and the one on screen is taken away.
 */
import { create } from 'zustand';
import { ButtonView, IconSize } from '@salilvnair/dui';
import { SparkleIcon } from '../../../icons';
import { AI as AI_ACCENT } from '../tone';
import { useAiFeaturesStore, isAiStageEnabled } from '../../../store/ai-features-store';
import { featureKeyForStage } from '../../../store/ai-stage-features';
import { useTabsStore } from '../../../store/tabs-store';

const KEY = 'daakia.dk8s.python.ghost';
/** The AI stage ghost text runs as — its switch in Settings → AI Features. */
export const GHOST_STAGE = 'dk8s.python.complete';

/** Settings → AI Features allows it. Read at call time, outside React. */
export function ghostAllowed(): boolean {
  return isAiStageEnabled(GHOST_STAGE);
}

/** Both switches on: what the provider asks before every request. */
export function ghostOn(): boolean {
  return ghostAllowed() && usePyGhost.getState().on;
}

export function openGhostSettings(): void {
  useTabsStore.getState().openSettingsTab('ai-features');
}

function read(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

interface GhostState {
  on: boolean;
  setOn: (on: boolean) => void;
  toggle: () => void;
}

export const usePyGhost = create<GhostState>((set, get) => ({
  on: read(),
  setOn: (on) => {
    set({ on });
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* the switch still works for this session */ }
  },
  toggle: () => get().setOn(!get().on),
}));

/** The toolbar switch: "AI suggest", lit in the AI colour when on. */
export function GhostToggle({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const mine = usePyGhost(s => s.on);
  const toggle = usePyGhost(s => s.toggle);
  const allowed = useAiFeaturesStore(s => s.isEnabled(featureKeyForStage(GHOST_STAGE)));

  if (!allowed) {
    return (
      <ButtonView
        size={size} variant="secondary"
        iconLeft={<SparkleIcon size={IconSize.action} color="var(--color-text-muted)" />}
        title="AI suggestions are turned off in Settings → AI Features. Click to open it."
        onClick={openGhostSettings}
        style={{ color: 'var(--color-text-muted)' }}
      >
        AI suggest
        <span className="font-mono" style={{ marginLeft: 6, fontSize: 10, opacity: 0.85 }}>off in Settings</span>
      </ButtonView>
    );
  }

  const on = mine;
  return (
    <ButtonView
      size={size} variant="secondary"
      aria-pressed={on}
      iconLeft={<SparkleIcon size={IconSize.action} color={on ? AI_ACCENT : 'var(--color-text-muted)'} />}
      title={on
        ? 'AI suggestions on — grey code appears as you type; Tab accepts it. Click to turn off.'
        : 'AI suggestions off — click to turn them back on.'}
      onClick={toggle}
      style={on
        ? {
          background: `color-mix(in srgb, ${AI_ACCENT} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${AI_ACCENT} 40%, transparent)`,
          color: AI_ACCENT,
        }
        : { color: 'var(--color-text-muted)' }}
    >
      AI suggest
      <span className="font-mono" style={{ marginLeft: 6, fontSize: 10, opacity: 0.85 }}>{on ? 'on' : 'off'}</span>
    </ButtonView>
  );
}
