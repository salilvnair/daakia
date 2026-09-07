/**
 * AiFeatureSettings — toggle every AI-powered action on or off.
 * Each toggle is persisted to the extension host's `daakia_ai_feature` SQLite table.
 * The `gates` field shows exactly which UI buttons/icons each flag controls.
 */
import { useEffect, useState } from 'react';
import { useAiFeaturesStore, AI_FEATURE_LABELS, FEATURE_TO_TEMPLATE_KEY, type AiFeatureKey } from '../../store/ai-features-store';
import { buildStageFeatures } from '../../store/ai-stage-features';
import { SparkleIcon, ChevronRightIcon, BookOpenIcon, SearchIcon } from '../../icons';
import { TextInputView } from '@salilvnair/dui';
import type { AiPromptTemplateKey } from '../../store/prompt-template';
import { logUiEvent } from '../../store/ui-audit-store';


const ACCENT = 'var(--color-protocol-ai)';

/*
  Every AI feature, hand-written flag or generated one, as a single list the
  page can render without caring which list it came from.

  Forty-three features — all of dk8s, the per-protocol mock generators,
  Generate Docs — existed with no flag at all and so never appeared here. They
  are generated from the audit taxonomy now, grouped by the screen they belong
  to, so this page cannot fall behind the app again.
*/
type FeatureMeta = { label: string; description: string; group: string; gates?: string };

const ALL_FEATURES: Record<string, FeatureMeta> = {
  ...AI_FEATURE_LABELS,
  ...Object.fromEntries(
    buildStageFeatures().map(f => [f.stage, { label: f.label, description: f.description, group: f.group }]),
  ),
};

/** The generated groups, in the order their stages first appear. */
const STAGE_GROUPS = [...new Set(buildStageFeatures().map(f => f.group))];

// Group display order (matches AI_FEATURE_LABELS group names in ai-features-store.ts)
const GROUP_ORDER = [
  'Chat',
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
  ...STAGE_GROUPS,
];

const GROUP_COLORS: Record<string, string> = {
  'Chat':                    'var(--color-protocol-ai)',
  'Response & Diagnostics':  'var(--color-protocol-ai)',
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
  'Mock Server':             'var(--color-mock-server)',
  'Daakia AI':               'var(--color-protocol-ai)',
  'REST · Request':          'var(--color-protocol-rest)',
  'REST · Response':         'var(--color-protocol-rest)',
  'REST · Docs':             'var(--color-protocol-rest)',
  'REST · Scripts':          'var(--color-protocol-rest)',
  'Collections':             'var(--color-primary)',
  'Environments':            'var(--color-success)',
  'Import':                  'var(--color-warning)',
  'Settings':                'var(--color-text-muted)',
  'dk8s · Pods':             'var(--color-protocol-k8s, var(--color-primary))',
  'dk8s · Logs':             'var(--color-protocol-k8s, var(--color-primary))',
  'dk8s · Terminal':         'var(--color-protocol-k8s, var(--color-primary))',
  'dk8s · Explorer':         'var(--color-protocol-k8s, var(--color-primary))',
  'dk8s · Doctor':           'var(--color-protocol-k8s, var(--color-primary))',
  'dk8s · Search':           'var(--color-protocol-k8s, var(--color-primary))',
};

// ── Feature row ───────────────────────────────────────────────────────────────

function FeatureToggleRow({ featureKey, onNavigateToPrompt }: { featureKey: AiFeatureKey; onNavigateToPrompt?: (key: AiPromptTemplateKey) => void }) {
  const { features, toggleFeature } = useAiFeaturesStore();
  const meta = ALL_FEATURES[featureKey];
  const enabled = features[featureKey] !== false;
  const color = GROUP_COLORS[meta.group] ?? ACCENT;
  /* A hand-written flag names its template; a generated one *is* its template
     key, so the Prompt Library shortcut works for both. */
  const templateKey = FEATURE_TO_TEMPLATE_KEY[featureKey as keyof typeof FEATURE_TO_TEMPLATE_KEY]
    ?? (featureKey.includes('.') ? (featureKey as AiPromptTemplateKey) : undefined);

  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-[color-mix(in_srgb,var(--color-text-primary)_5%,transparent)] last:border-b-0">
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
          className="w-[26px] h-[26px] flex items-center justify-center rounded cursor-pointer flex-shrink-0 mt-0.5 transition-all hover:bg-[color-mix(in_srgb,var(--color-text-primary)_8%,transparent)]"
          title="Edit prompt template in Prompt Library"
          style={{ color: `color-mix(in srgb, ${color} 50%, var(--color-text-muted))` }}
        >
          <BookOpenIcon size={12} />
        </button>
      )}
      {/* Toggle */}
      <button
        type="button"
        onClick={() => { logUiEvent('ai.toggle_feature', { feature: featureKey, enabled: !enabled }); toggleFeature(featureKey); }}
        className="w-[38px] h-[21px] rounded-full cursor-pointer transition-all flex-shrink-0 relative mt-1"
        style={{ backgroundColor: enabled ? color : 'color-mix(in srgb, var(--color-text-primary) 12%, transparent)' }}
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
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { loadFeatures(); }, [loadFeatures]);

  const toggleCollapse = (group: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(group)) { next.delete(group); } else { next.add(group); }
      return next;
    });
  };

  const featureKeys = Object.keys(ALL_FEATURES);
  const enabledCount = featureKeys.filter(k => features[k] !== false).length;
  const allEnabled = enabledCount === featureKeys.length;

  const q = searchQuery.trim().toLowerCase();

  const matchesSearch = (key: string) => {
    if (!q) return true;
    const meta = ALL_FEATURES[key];
    return (
      meta.label.toLowerCase().includes(q) ||
      meta.group.toLowerCase().includes(q) ||
      meta.description.toLowerCase().includes(q) ||
      (meta.gates ?? '').toLowerCase().includes(q) ||
      key.toLowerCase().includes(q)
    );
  };

  const grouped = GROUP_ORDER.map(g => ({
    group: g,
    color: GROUP_COLORS[g] ?? ACCENT,
    keys: featureKeys.filter(k => ALL_FEATURES[k].group === g && matchesSearch(k)),
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

      {/* Search */}
      <div className="px-2 py-3 border-b border-[var(--color-surface-border)] shrink-0">
        <TextInputView
          size="md"
          placeholder="Filter by category, name, description…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          iconLeft={<SearchIcon size={13} style={{ color: 'var(--color-text-muted)' }} />}
          accentColor={ACCENT}
          style={{ width: '100%' }}
        />
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-2 py-4">
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
                    onClick={() => { logUiEvent('ai.toggle_all', { enabled: !allEnabled }); setAllEnabled(!allEnabled); }}
                    className="w-[38px] h-[21px] rounded-full cursor-pointer transition-all flex-shrink-0 relative"
                    style={{ backgroundColor: allEnabled ? ACCENT : 'color-mix(in srgb, var(--color-text-primary) 12%, transparent)' }}
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
                Toggle any AI feature on or off. A disabled feature makes no LLM call — the request is refused before it leaves the panel — and its buttons are hidden where the surface supports it.
                <span className="ml-1 inline-flex items-center gap-0.5" style={{ color: ACCENT }}>
                  <SparkleIcon size={10} /> marks AI-powered actions.
                </span>
              </p>
            </div>
          </div>

          {/* Groups */}
          {grouped.map(({ group, color, keys }) => {
            const isCollapsed = collapsed.has(group);
            const groupEnabledCount = keys.filter(k => features[k] !== false).length;
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
                    style={{ backgroundColor: allGroupEnabled ? color : 'color-mix(in srgb, var(--color-text-primary) 10%, transparent)' }}
                    title={allGroupEnabled ? `Disable all ${group}` : `Enable all ${group}`}
                  >
                    <span
                      className="absolute top-[3px] w-[12px] h-[12px] rounded-full bg-white shadow transition-all duration-200"
                      style={{ left: allGroupEnabled ? '17px' : '3px' }}
                    />
                  </button>
                </div>
                {/* Collapsible content — force-expand when search is active */}
                {(!isCollapsed || !!q) && (
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
            <p>Disabling a feature stops every LLM call it would make, and hides its UI entry points on the surfaces that check the flag. Your AI provider config and API keys are not affected. Re-enabling takes effect immediately.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
