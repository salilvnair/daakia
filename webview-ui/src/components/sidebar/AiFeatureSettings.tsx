/**
 * AiFeatureSettings — toggle every AI-powered action on or off.
 * Each toggle is persisted to the extension host's `daakia_ai_feature` SQLite table.
 * The `gates` field shows exactly which UI buttons/icons each flag controls.
 */
import { useEffect, useState } from 'react';
import { useAiFeaturesStore, AI_FEATURE_LABELS, FEATURE_TO_TEMPLATE_KEY, type AiFeatureFlags } from '../../store/ai-features-store';
import { SparkleIcon, ChevronRightIcon, BookOpenIcon } from '../../icons';
import type { AiPromptTemplateKey } from '../../store/prompt-template';


const ACCENT = 'var(--color-protocol-ai)';

// Group display order (matches AI_FEATURE_LABELS group names in ai-features-store.ts)
const GROUP_ORDER = [
  'Response & Diagnostics',
  'REST Toolkit',
  'Schema & Contracts',
  'Collections & Workflow',
  'Import & Reverse Engineer',
  'Mock Generation',
  'GraphQL AI',
  'gRPC AI',
  'SOAP AI',
  'Realtime Protocols',
  'MCP & Platform AI',
];

const GROUP_COLORS: Record<string, string> = {
  'Response & Diagnostics': 'var(--color-protocol-ai)',
  'REST Toolkit':            'var(--color-protocol-rest)',
  'Schema & Contracts':      'var(--color-success)',
  'Collections & Workflow':  'var(--color-primary)',
  'Import & Reverse Engineer':'var(--color-warning)',
  'Mock Generation':         'var(--color-mock-server)',
  'GraphQL AI':              'var(--color-protocol-graphql)',
  'gRPC AI':                 'var(--color-protocol-grpc)',
  'SOAP AI':                 'var(--color-protocol-soap)',
  'Realtime Protocols':      'var(--color-protocol-websocket)',
  'MCP & Platform AI':       'var(--color-protocol-ai)',
};

// ── Feature row ───────────────────────────────────────────────────────────────

function FeatureToggleRow({ featureKey, onNavigateToPrompt }: { featureKey: keyof AiFeatureFlags; onNavigateToPrompt?: (key: AiPromptTemplateKey) => void }) {
  const { features, toggleFeature } = useAiFeaturesStore();
  const meta = AI_FEATURE_LABELS[featureKey];
  const enabled = features[featureKey];
  const color = GROUP_COLORS[meta.group] ?? ACCENT;
  const templateKey = FEATURE_TO_TEMPLATE_KEY[featureKey];

  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-[rgba(255,255,255,0.05)] last:border-b-0">
      <div className="flex-1 min-w-0 pt-0.5">
        {/* Label row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <SparkleIcon
            size={11}
            style={{ color: enabled ? color : 'var(--color-text-muted)', opacity: enabled ? 1 : 0.35, transition: 'all .2s', flexShrink: 0 }}
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
        {/* Description */}
        <p className="text-[10.5px] text-[var(--color-text-muted)] mt-0.5 pl-[17px] leading-relaxed">{meta.description}</p>
        {/* Gates — exact UI buttons this flag controls */}
        {meta.gates && (
          <p className="text-[9.5px] mt-1 pl-[17px] leading-relaxed" style={{ color: enabled ? `color-mix(in srgb, ${color} 60%, var(--color-text-muted))` : 'var(--color-text-muted)', opacity: enabled ? 0.8 : 0.45 }}>
            ↳ {meta.gates}
          </p>
        )}
      </div>
      {/* Prompt Library shortcut */}
      {templateKey && onNavigateToPrompt && (
        <button
          type="button"
          onClick={() => onNavigateToPrompt(templateKey)}
          className="w-[26px] h-[26px] flex items-center justify-center rounded cursor-pointer flex-shrink-0 mt-0.5 transition-all hover:bg-[rgba(255,255,255,0.08)]"
          title="Edit prompt template in Prompt Library"
          style={{ color: `color-mix(in srgb, ${color} 50%, var(--color-text-muted))` }}
        >
          <BookOpenIcon size={12} />
        </button>
      )}
      {/* Toggle */}
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

// ── Main component ────────────────────────────────────────────────────────────

export function AiFeatureSettings({ onNavigateToPrompt }: { onNavigateToPrompt?: (key: AiPromptTemplateKey) => void }) {
  const { loadFeatures, features, setGroupEnabled, setAllEnabled } = useAiFeaturesStore();
  // Empty set = all groups expanded by default
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => { loadFeatures(); }, [loadFeatures]);

  const toggleCollapse = (group: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(group)) { next.delete(group); } else { next.add(group); }
      return next;
    });
  };

  const featureKeys = Object.keys(AI_FEATURE_LABELS) as (keyof AiFeatureFlags)[];
  const enabledCount = featureKeys.filter(k => features[k]).length;
  const allEnabled = enabledCount === featureKeys.length;

  const grouped = GROUP_ORDER.map(g => ({
    group: g,
    color: GROUP_COLORS[g] ?? ACCENT,
    keys: featureKeys.filter(k => AI_FEATURE_LABELS[k].group === g),
  })).filter(g => g.keys.length > 0);

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
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-medium text-[var(--color-text-primary)]">AI Features</p>
                {/* Master toggle */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full tabular-nums"
                    style={{
                      color: allEnabled ? ACCENT : enabledCount === 0 ? 'var(--color-error)' : ACCENT,
                      backgroundColor: allEnabled ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : enabledCount === 0 ? 'color-mix(in srgb, var(--color-error) 10%, transparent)' : `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${allEnabled ? ACCENT : enabledCount === 0 ? 'var(--color-error)' : ACCENT} 22%, transparent)`,
                    }}>
                    {enabledCount}/{featureKeys.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAllEnabled(!allEnabled)}
                    className="w-[38px] h-[21px] rounded-full cursor-pointer transition-all flex-shrink-0 relative"
                    style={{ backgroundColor: allEnabled ? ACCENT : 'rgba(255,255,255,0.12)' }}
                    title={allEnabled ? 'Disable all AI features' : 'Enable all AI features'}
                  >
                    <span
                      className="absolute top-[3.5px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all duration-200"
                      style={{ left: allEnabled ? '21px' : '3px' }}
                    />
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                Toggle any AI feature on or off. Disabled features are completely hidden — no buttons, no icons, no LLM calls.
                <span className="ml-1 inline-flex items-center gap-0.5" style={{ color: ACCENT }}>
                  <SparkleIcon size={10} /> marks AI-powered actions.
                </span>
              </p>
            </div>
          </div>

          {/* Groups */}
          {grouped.map(({ group, color, keys }) => {
            const isCollapsed = collapsed.has(group);
            const groupEnabledCount = keys.filter(k => features[k]).length;
            const allGroupEnabled = groupEnabledCount === keys.length;
            return (
              <div key={group}>
                {/* Header row: chevron+badge (clickable collapse) + divider + count + group toggle */}
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(group)}
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
                    <span
                      className="text-[9.5px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}
                    >
                      {group}
                    </span>
                  </button>
                  <div className="flex-1 h-px" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)` }} />
                  <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                    {groupEnabledCount}/{keys.length}
                  </span>
                  {/* Group-level toggle */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setGroupEnabled(keys, !allGroupEnabled); }}
                    className="w-[32px] h-[18px] rounded-full cursor-pointer transition-all flex-shrink-0 relative"
                    style={{ backgroundColor: allGroupEnabled ? color : 'rgba(255,255,255,0.1)' }}
                    title={allGroupEnabled ? `Disable all ${group}` : `Enable all ${group}`}
                  >
                    <span
                      className="absolute top-[3px] w-[12px] h-[12px] rounded-full bg-white shadow transition-all duration-200"
                      style={{ left: allGroupEnabled ? '17px' : '3px' }}
                    />
                  </button>
                </div>
                {/* Collapsible content */}
                {!isCollapsed && (
                  <div
                    className="rounded-xl border overflow-hidden px-3 py-1"
                    style={{
                      borderColor: `color-mix(in srgb, ${color} 15%, transparent)`,
                      backgroundColor: `color-mix(in srgb, ${color} 3%, transparent)`,
                    }}
                  >
                    {keys.map(key => <FeatureToggleRow key={key} featureKey={key} onNavigateToPrompt={onNavigateToPrompt} />)}
                  </div>
                )}
              </div>
            );
          })}

          {/* Note */}
          <div
            className="p-3 rounded-xl border text-[11px] text-[var(--color-text-muted)]"
            style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 5%, transparent)`, borderColor: `color-mix(in srgb, ${ACCENT} 15%, transparent)` }}
          >
            <p className="font-medium mb-1" style={{ color: ACCENT }}>Note</p>
            <p>Disabling a feature only hides its UI entry points and prevents LLM calls for that action. Your AI provider config and API keys are not affected. Re-enabling instantly restores all buttons and icons for that feature.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
