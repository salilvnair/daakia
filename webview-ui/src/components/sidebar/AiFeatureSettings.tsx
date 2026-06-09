/**
 * AiFeatureSettings — per-feature enable/disable toggles for all AI-powered actions.
 * Each toggle is bound to the store; components read isEnabled() to show/hide AI UI.
 */
import { useEffect } from 'react';
import { useAiFeaturesStore, AI_FEATURE_LABELS, type AiFeatureFlags } from '../../store/ai-features-store';
import { SparkleIcon } from '../../icons';

const ACCENT = 'var(--color-protocol-ai)';

// Group order for display
const GROUP_ORDER = ['Core AI', 'Response Actions', 'Request Helpers', 'Script & Dev'];

const GROUP_COLORS: Record<string, string> = {
  'Core AI':          'var(--color-protocol-ai)',
  'Response Actions': '#06b6d4',
  'Request Helpers':  '#10b981',
  'Script & Dev':     '#a855f7',
};

function FeatureToggleRow({ featureKey }: { featureKey: keyof AiFeatureFlags }) {
  const { features, toggleFeature } = useAiFeaturesStore();
  const meta = AI_FEATURE_LABELS[featureKey];
  const enabled = features[featureKey];
  const color = GROUP_COLORS[meta.group] ?? ACCENT;

  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-[rgba(255,255,255,0.05)] last:border-b-0">
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-1.5">
          <SparkleIcon
            size={11}
            style={{ color: enabled ? color : 'var(--color-text-muted)', opacity: enabled ? 1 : 0.35, transition: 'all .2s' }}
          />
          <span
            className="text-[12px] font-medium transition-colors"
            style={{ color: enabled ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
          >
            {meta.label}
          </span>
          {enabled && (
            <span
              className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
              style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
            >
              ON
            </span>
          )}
        </div>
        <p className="text-[10.5px] text-[var(--color-text-muted)] mt-0.5 pl-[17px] leading-relaxed">{meta.description}</p>
      </div>
      <button
        type="button"
        onClick={() => toggleFeature(featureKey)}
        className="w-[38px] h-[21px] rounded-full cursor-pointer transition-all flex-shrink-0 relative mt-1"
        style={{ backgroundColor: enabled ? color : 'rgba(255,255,255,0.12)' }}
        title={enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
      >
        <span
          className="absolute top-[3.5px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all duration-200"
          style={{ left: enabled ? '21px' : '3px' }}
        />
      </button>
    </div>
  );
}

export function AiFeatureSettings() {
  const { loadFeatures, features } = useAiFeaturesStore();

  useEffect(() => { loadFeatures(); }, [loadFeatures]);

  const featureKeys = Object.keys(AI_FEATURE_LABELS) as (keyof AiFeatureFlags)[];
  const enabledCount = featureKeys.filter(k => features[k]).length;

  // Group keys
  const grouped = GROUP_ORDER.map(g => ({
    group: g,
    color: GROUP_COLORS[g] ?? ACCENT,
    keys: featureKeys.filter(k => AI_FEATURE_LABELS[k].group === g),
  }));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-[var(--color-surface-border)] pt-3 shrink-0">
        <div className="flex items-center gap-0 px-5">
          <span className="px-3 py-2 text-[12px] border-b-2 font-medium" style={{ borderColor: ACCENT, color: ACCENT }}>
            AI Features
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-5 py-4">
        <div className="flex flex-col gap-5">
          {/* Summary */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-medium text-[var(--color-text-primary)]">AI-Powered Features</p>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                Toggle AI features on or off. Disabled features are hidden from the UI and make no LLM calls.
                <span className="ml-1 inline-flex items-center gap-0.5" style={{ color: ACCENT }}>
                  <SparkleIcon size={10} /> marks AI-powered actions.
                </span>
              </p>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span
                className="text-[11px] font-bold font-mono px-2 py-1 rounded-md"
                style={{ color: ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 12%, transparent)` }}
              >
                {enabledCount} / {featureKeys.length}
              </span>
              <span className="text-[9.5px] text-[var(--color-text-muted)] mt-0.5">enabled</span>
            </div>
          </div>

          {/* Groups */}
          {grouped.map(({ group, color, keys }) => (
            <div key={group}>
              {/* Group header */}
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-[9.5px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                  style={{ color, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}
                >
                  {group}
                </span>
                <div className="flex-1 h-px" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)` }} />
              </div>
              <div className="rounded-xl border overflow-hidden px-3 py-1" style={{ borderColor: `color-mix(in srgb, ${color} 15%, transparent)`, backgroundColor: `color-mix(in srgb, ${color} 3%, transparent)` }}>
                {keys.map(key => <FeatureToggleRow key={key} featureKey={key} />)}
              </div>
            </div>
          ))}

          {/* Note */}
          <div
            className="p-3 rounded-xl border text-[11px] text-[var(--color-text-muted)]"
            style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 5%, transparent)`, borderColor: `color-mix(in srgb, ${ACCENT} 15%, transparent)` }}
          >
            <p className="font-medium mb-1" style={{ color: ACCENT }}>Note</p>
            <p>Disabling a feature only hides its UI entry points — it does not affect your AI provider configuration or stored API keys. Re-enabling instantly restores the feature.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
