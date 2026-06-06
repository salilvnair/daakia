/**
 * AiFeatureSettings — per-feature enable/disable toggles for all AI-powered actions.
 * Task 4.1.9 — AI feature toggle (per feature)
 *
 * ✨ Sparkle icon marks AI-powered actions throughout the UI.
 * Toggles are persisted to SQLite via the extension host.
 */
import { useEffect } from 'react';
import { useAiFeaturesStore, AI_FEATURE_LABELS, type AiFeatureFlags } from '../../store/ai-features-store';
import { SparkleIcon } from '../../icons';

const ACCENT = 'var(--color-protocol-ai)';

function FeatureToggleRow({ featureKey }: { featureKey: keyof AiFeatureFlags }) {
  const { features, toggleFeature } = useAiFeaturesStore();
  const { label, description } = AI_FEATURE_LABELS[featureKey];
  const enabled = features[featureKey];

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[rgba(255,255,255,0.06)] last:border-b-0">
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-1.5">
          <SparkleIcon size={11} style={{ color: enabled ? ACCENT : 'var(--color-text-muted)', opacity: enabled ? 1 : 0.4 }} />
          <span className="text-[12px] font-medium text-[var(--color-text-primary)]">{label}</span>
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 pl-[17px]">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => toggleFeature(featureKey)}
        className="w-[36px] h-[20px] rounded-full cursor-pointer transition-colors flex-shrink-0 relative mt-1"
        style={{ backgroundColor: enabled ? ACCENT : 'rgba(255,255,255,0.15)' }}
        title={enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
      >
        <span className="absolute top-[3px] w-[14px] h-[14px] rounded-full bg-white transition-transform" style={{ left: enabled ? '19px' : '3px' }} />
      </button>
    </div>
  );
}

export function AiFeatureSettings() {
  const { loadFeatures } = useAiFeaturesStore();

  useEffect(() => { loadFeatures(); }, [loadFeatures]);

  const featureKeys = Object.keys(AI_FEATURE_LABELS) as (keyof AiFeatureFlags)[];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-0 px-4 pt-3 pb-0 border-b border-[var(--color-surface-border)]">
        <span className="px-3 py-2 text-[12px] border-b-2 font-medium" style={{ borderColor: ACCENT, color: ACCENT }}>
          AI Features
        </span>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-4">
        <div className="flex flex-col gap-4 max-w-[600px]">
          <div>
            <p className="text-[13px] font-medium text-[var(--color-text-primary)]">AI-Powered Features</p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
              Enable or disable individual AI features. Disabled features will not make LLM calls or appear in the UI.
              <span className="ml-1 inline-flex items-center gap-0.5" style={{ color: ACCENT }}>
                <SparkleIcon size={10} /> marks AI-powered actions.
              </span>
            </p>
          </div>

          <div className="rounded-lg border border-[rgba(255,255,255,0.08)] px-3 py-1">
            {featureKeys.map(key => <FeatureToggleRow key={key} featureKey={key} />)}
          </div>

          <div className="p-3 rounded-md border text-[11px] text-[var(--color-text-muted)]" style={{ backgroundColor: 'rgba(139,92,246,0.06)', borderColor: 'rgba(139,92,246,0.15)' }}>
            <p className="font-medium mb-1" style={{ color: ACCENT }}>Note</p>
            <p>Disabling a feature only hides its UI entry points — it does not affect your AI provider configuration or stored API keys.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
