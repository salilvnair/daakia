/**
 * One audit event per AI feature, generated rather than typed.
 *
 * ── Why generated ──
 *
 * There are eighty-odd AI features. Hand-writing an audit def for each would
 * be eighty entries to keep in step with eighty call sites, and this codebase
 * already knows how that ends: twenty-six dk8s events existed for months
 * before anything fired them, and the whole AI module was missing.
 *
 * Every AI feature already has a name — the prompt library labels each key
 * because those labels appear in Settings. So the audit takes its events from
 * there: a new prompt key is a new auditable event the day it is added, named
 * the same way the user already sees it named, and it cannot drift because
 * there is nothing to keep in step.
 *
 * ── The screen ──
 *
 * "Generate Body" is not enough to find your way back to what happened; the
 * question is always which screen it came from. The key's own prefix answers
 * that for nearly all of them, and the exceptions are listed.
 *
 * `ai-client.test.ts` holds the two halves together: every `stage` sent from a
 * call site has to be one this file can name, or the test fails.
 */
import { AI_PROMPT_TEMPLATE_LABELS, type AiPromptTemplateKey } from './prompt-template';
import type { AuditEventDef } from './ui-audit-store';

/** Where a feature lives, when its prefix does not say. */
const SCREEN_OVERRIDES: Record<string, string> = {
  'rest.docs.generate': 'REST · Docs',
  'rest.script.autocomplete': 'REST · Scripts',
  'rest.assert.generate': 'REST · Response',
  'rest.contract.test': 'REST · Response',
  'rest.schema.validate': 'REST · Response',
  'rest.semantic.validate': 'REST · Response',
  'rest.semantic.diff': 'REST · Response',
  'rest.response.diff': 'REST · Response',
  'rest.response.transform': 'REST · Response',
  'rest.performance.insights': 'REST · Response',
  'rest.pattern.check': 'REST · Response',
  'rest.record.baseline': 'REST · Response',
  'rest.pattern.baseline': 'REST · Response',
  'rest.smart.retry': 'REST · Response',
  'rest.collection.organize': 'Collections',
  'rest.collection.search': 'Collections',
  'rest.env.extract': 'Environments',
  'rest.curl.explain': 'Import',
  'rest.code.import': 'Import',
};

/** Prefix → screen, longest match first. */
const SCREEN_PREFIXES: [string, string][] = [
  ['dkgh', 'dkgh · New issue'],
  ['dk8s.log', 'dk8s · Logs'],
  ['dk8s.file', 'dk8s · Explorer'],
  ['dk8s.terminal', 'dk8s · Terminal'],
  ['dk8s.search', 'dk8s · Search'],
  ['dk8s.heap', 'dk8s · Doctor'],
  ['dk8s.threads', 'dk8s · Doctor'],
  ['dk8s.jfr', 'dk8s · Doctor'],
  ['dk8s.doctor', 'dk8s · Doctor'],
  ['dk8s.artifact', 'dk8s · Doctor'],
  ['dk8s', 'dk8s · Pods'],
  ['doctor', 'dk8s · Doctor'],
  ['mock', 'Mock Server'],
  ['collection', 'Collections'],
  ['graphql', 'GraphQL'],
  ['grpc', 'gRPC'],
  ['soap', 'SOAP'],
  ['websocket', 'WebSocket'],
  ['mcp', 'MCP'],
  ['import', 'Import'],
  ['data', 'REST · Request'],
  ['test', 'REST · Response'],
  ['agent', 'Daakia AI'],
  ['ai', 'Daakia AI'],
  ['rest', 'REST · Request'],
];

/**
 * The AI calls that have no prompt-library entry.
 *
 * Most features are a template plus a button, so the library names them. These
 * build their prompt in code instead — the chat takes its instructions from the
 * tab, the schema generator assembles one per language, and the rest predate
 * the library. They are still AI calls the user is entitled to see named, so
 * they are named here rather than left to surface as a raw key.
 *
 * A feature listed here is a candidate for a real library entry: move it, and
 * the user gets to edit its prompt too. Delete the line when you do.
 */
const EXTRA_AI_FEATURES: { stage: string; label: string; screen: string }[] = [
  { stage: 'ai.chat',                   label: 'Ask Daakia AI',                screen: 'Daakia AI' },
  { stage: 'ai.chat.tools',             label: 'Daakia AI — tool follow-up',   screen: 'Daakia AI' },
  { stage: 'ai.insights',               label: 'AI Intelligence Dashboard',    screen: 'Settings' },
  { stage: 'agent.learn.analyze',       label: 'Learning Mode Analysis',       screen: 'Daakia AI' },
  { stage: 'rest.schema.generate',      label: 'Generate Schema or Types',     screen: 'REST · Response' },
  { stage: 'rest.ts.generate',          label: 'Response to TypeScript',       screen: 'REST · Response' },
  { stage: 'rest.semantic.diff',        label: 'Semantic API Diff',            screen: 'REST · Response' },
  { stage: 'rest.pattern.check',        label: 'Response Pattern Learning',    screen: 'REST · Response' },
  { stage: 'test.variations.generate',  label: 'Replay with Variations',       screen: 'REST · Response' },
  { stage: 'test.variations.analyze',   label: 'Replay Variations — Analysis', screen: 'REST · Response' },
  { stage: 'collection.generate',       label: 'Chat to Collection',           screen: 'Collections' },
  { stage: 'collection.scenario.generate', label: 'Scenario Generator',        screen: 'Collections' },
  { stage: 'import.openapi.enrich',     label: 'OpenAPI Spec Enrichment',      screen: 'Import' },
  { stage: 'import.voice',              label: 'Voice to Request',             screen: 'Import' },
];

const EXTRA_BY_STAGE = new Map(EXTRA_AI_FEATURES.map(f => [f.stage, f]));

export function screenForStage(stage: string): string {
  const extra = EXTRA_BY_STAGE.get(stage);
  if (extra) return extra.screen;
  const override = SCREEN_OVERRIDES[stage];
  if (override) return override;
  for (const [prefix, screen] of SCREEN_PREFIXES) {
    if (stage === prefix || stage.startsWith(`${prefix}.`)) return screen;
  }
  return 'Daakia AI';
}

/** The human name the user already sees for this feature in Settings. */
export function nameForStage(stage: string): string {
  const label = AI_PROMPT_TEMPLATE_LABELS[stage as AiPromptTemplateKey]?.label;
  return label ?? EXTRA_BY_STAGE.get(stage)?.label ?? stage;
}

/**
 * Every AI feature, as an auditable event.
 *
 * The `.system` halves are dropped: they are the behavioural rules attached
 * to the same call, not a second call, and an audit row per half would double
 * the trail for no information.
 */
export function buildAiAuditEvents(): AuditEventDef[] {
  const fromLibrary = Object.entries(AI_PROMPT_TEMPLATE_LABELS)
    .filter(([key]) => !key.endsWith('.system'))
    .map(([key, meta]) => ({ stage: key, label: meta.label }));

  const extras = EXTRA_AI_FEATURES.map(f => ({ stage: f.stage, label: f.label }));

  return [...fromLibrary, ...extras].map(({ stage, label }) => ({
    id: `ai.${stage}`,
    module: 'AI',
    button: label,
    action: 'create',
    description: `${label} — ${screenForStage(stage)}`,
    color: 'var(--color-protocol-ai)',
    // On by default, every one: an AI call is the kind of thing a team
    // wants a record of, and the user turns off what they do not want.
    defaultEnabled: true,
    screen: screenForStage(stage),
  }));
}
