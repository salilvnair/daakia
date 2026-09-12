/**
 * Every AI feature is auditable, named and placed — by construction.
 *
 * The audit had one row called "Any AI action" for eighty-odd features, and
 * the AI Audit screen showed raw keys like `dk8s.terminal.theme` because it
 * kept a third hand-written name map that nobody updated. Both now read from
 * the prompt library, which has to name every feature anyway. These tests are
 * mostly about that: that the generation covers everything, and that a new
 * prompt key needs no second edit anywhere.
 */
import { describe, it, expect } from 'vitest';
import { buildAiAuditEvents, nameForStage, screenForStage } from './ai-audit-events';
import { AI_PROMPT_TEMPLATE_LABELS } from './prompt-template';
import { AUDIT_EVENT_DEFS } from './ui-audit-store';

const events = buildAiAuditEvents();
const featureKeys = Object.keys(AI_PROMPT_TEMPLATE_LABELS).filter(k => !k.endsWith('.system'));

describe('coverage', () => {
  it('has an event for every AI feature in the prompt library', () => {
    for (const key of featureKeys) {
      expect(events.some(e => e.id === `ai.${key}`), key).toBe(true);
    }
  });

  /* A handful of real calls build their prompt in code rather than from the
     library. They still get a name and a screen, or they would land in the
     audit as the raw key the user objected to. */
  it('also covers the calls the library does not hold a prompt for', () => {
    for (const stage of ['ai.chat', 'rest.schema.generate', 'import.voice']) {
      expect(events.some(e => e.id === `ai.${stage}`), stage).toBe(true);
      expect(nameForStage(stage)).not.toBe(stage);
    }
    expect(events.length).toBeGreaterThan(featureKeys.length);
  });

  /* The system half is the instruction block attached to the same call, not a
     second call — a row for each would double the trail for no information. */
  it('does not audit the system halves as their own calls', () => {
    expect(events.some(e => e.id.endsWith('.system'))).toBe(false);
  });

  it('is on by default, all of it', () => {
    expect(events.every(e => e.defaultEnabled)).toBe(true);
  });

  it('reaches the taxonomy the config screen renders', () => {
    const aiInTaxonomy = AUDIT_EVENT_DEFS.filter(d => d.module === 'AI');
    // The generated ones, plus the two that are not a feature.
    expect(aiInTaxonomy.length).toBe(events.length + 2);
    expect(new Set(aiInTaxonomy.map(d => d.id)).size).toBe(aiInTaxonomy.length);
  });
});

describe('names', () => {
  /* The complaint that started this: a row reading `ai.request`, and an AI
     Audit screen showing `dk8s.terminal.theme`. */
  it('names a feature the way the user already sees it named', () => {
    expect(nameForStage('rest.body.generate')).toBe('Generate Body');
    expect(nameForStage('rest.docs.generate')).toBe('Generate Docs');
    expect(nameForStage('dk8s.log.askWhy')).toBe('Ask AI why (logs)');
  });

  it('falls back to the raw stage for something the library never registered', () => {
    expect(nameForStage('made.up.stage')).toBe('made.up.stage');
  });

  it('gives every event a name that is not just its key', () => {
    for (const e of events) expect(e.button, e.id).not.toMatch(/^ai\./);
  });
});

describe('screens', () => {
  it.each([
    ['dk8s.log.askWhy', 'dk8s · Logs'],
    ['dk8s.file.explain', 'dk8s · Explorer'],
    ['dk8s.terminal.theme', 'dk8s · Terminal'],
    ['dk8s.heap.suspects', 'dk8s · Doctor'],
    ['mock.rest.generate', 'Mock Server'],
    ['rest.body.generate', 'REST · Request'],
    ['rest.docs.generate', 'REST · Docs'],
    ['rest.assert.generate', 'REST · Response'],
    ['rest.env.extract', 'Environments'],
  ])('places %s on %s', (stage, screen) => {
    expect(screenForStage(stage)).toBe(screen);
  });

  /* A prefix table that returns undefined would put a hole in the column the
     screen exists to fill. */
  it('places every feature somewhere', () => {
    for (const e of events) {
      expect(e.screen, e.id).toBeTruthy();
      expect(e.description, e.id).toContain(e.screen!);
    }
  });

  it('has an answer for a stage it has never seen', () => {
    expect(screenForStage('brand.new.thing')).toBe('Daakia AI');
  });
});
