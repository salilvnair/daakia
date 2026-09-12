/**
 * The AI features that had no switch.
 *
 * ── What was missing ──
 *
 * `AI_FEATURE_LABELS` is a hand-written list of eighty-seven flags. The AI
 * surface it was written against has since grown by another forty-three —
 * every dk8s feature (Ask AI why, Explain a thread dump, Design a terminal
 * theme, all fifteen), the seven per-protocol mock generators, Generate Docs,
 * the cURL explainer, and the rest. None of them appeared on the AI Features
 * screen, so none of them could be turned off.
 *
 * Rather than typing forty-three more entries and having the same gap open up
 * again next sprint, the missing ones are generated from the same taxonomy the
 * audit uses: every AI feature the app can call has a switch, by construction.
 * A feature that already has a hand-written flag keeps it — those flags carry
 * descriptions and `gates` text worth more than anything generated.
 *
 * ── The key ──
 *
 * A generated flag is keyed by its stage (`dk8s.log.askWhy`). Hand-written
 * flags are camelCase with no dots, so the two spaces cannot collide, and both
 * persist to the same `key | enabled` table on the host.
 */
import { AI_PROMPT_TEMPLATE_LABELS, type AiPromptTemplateKey } from './prompt-template';
import { FEATURE_TO_TEMPLATE_KEY } from './ai-feature-map';
import { buildAiAuditEvents, nameForStage, screenForStage } from './ai-audit-events';

export interface AiStageFeature {
  /** The stage as sent by `sendAiRequest` — also the flag's key. */
  stage: string;
  label: string;
  description: string;
  /** The screen it belongs to, which is how the settings page groups it. */
  group: string;
}

/** Every AI stage the app can send, from the audit taxonomy. */
function allStages(): string[] {
  return buildAiAuditEvents().map(e => e.id.slice('ai.'.length));
}

/**
 * Stage → the hand-written flag that owns it, first declaration wins.
 *
 * Nineteen templates are claimed by more than one flag — `rest.body.generate`
 * by both Body Generator and NL Request Builder, `explainWithAi` by all four
 * per-protocol Explain flags. The generic inverse map keeps whichever came
 * last, which put `rest.body.generate` under NL Request Builder: turning off
 * Body Generator would have done nothing, and turning off a Sprint-11 feature
 * nobody ships would have killed it. Declaration order is sprint order, so the
 * first flag to claim a template is the original feature.
 *
 * A caller that knows which of several features it is passes `feature` to
 * `sendAiRequest` and skips this guess entirely.
 */
const STAGE_TO_PRIMARY_FLAG: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [flag, template] of Object.entries(FEATURE_TO_TEMPLATE_KEY)) {
    if (template && !(template in out)) out[template] = flag;
  }
  return out;
})();

/**
 * The flag key that governs a stage.
 *
 * A hand-written flag wins where one exists, so turning off "Body Generator"
 * on the settings page still stops `rest.body.generate` — one feature, one
 * switch, whichever list it came from.
 */
export function featureKeyForStage(stage: string): string {
  return STAGE_TO_PRIMARY_FLAG[stage] ?? stage;
}

/** The AI features with no hand-written flag, as switches. */
export function buildStageFeatures(): AiStageFeature[] {
  return allStages()
    .filter(stage => !STAGE_TO_PRIMARY_FLAG[stage])
    .map(stage => ({
      stage,
      label: nameForStage(stage),
      description:
        AI_PROMPT_TEMPLATE_LABELS[stage as AiPromptTemplateKey]?.description
        ?? `AI call made from ${screenForStage(stage)}.`,
      group: screenForStage(stage),
    }));
}

/** Generated flags default on, like everything else on that screen. */
export function stageFeatureDefaults(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const f of buildStageFeatures()) out[f.stage] = true;
  return out;
}
