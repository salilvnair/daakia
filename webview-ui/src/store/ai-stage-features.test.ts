/**
 * Every AI feature has a switch, and the switch stops the call.
 *
 * The AI Features screen was a hand-written list of eighty-seven flags against
 * an app that had grown to a hundred and thirty AI calls: none of dk8s, none
 * of the per-protocol mock generators, and not Generate Docs, could be turned
 * off because none of them was listed. Worse, of the eighty-seven that were
 * listed, six were checked anywhere — the screen promised "no LLM calls" and
 * for the other eighty-one it meant nothing.
 *
 * These pin both halves: the list covers everything the app can call, and a
 * disabled feature is refused at the one door every call goes through.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildStageFeatures, featureKeyForStage } from './ai-stage-features';
import { buildAiAuditEvents } from './ai-audit-events';
import { AI_FEATURE_LABELS, useAiFeaturesStore, isAiStageEnabled } from './ai-features-store';
import { TEMPLATE_TO_FEATURE_KEY } from './ai-feature-map';
import { sendAiRequest } from '../services/ai/ai-client';
import * as vscode from '../vscode';

const stages = buildAiAuditEvents().map(e => e.id.slice('ai.'.length));
const generated = buildStageFeatures();

beforeEach(() => {
  useAiFeaturesStore.setState({ features: {}, loaded: false });
  vi.restoreAllMocks();
});

describe('coverage', () => {
  /* The complaint that started this: "AI Features — why dk8s AI and many
     other AI not here". */
  it('gives every AI feature the app can call a switch', () => {
    const switched = new Set([
      ...Object.keys(AI_FEATURE_LABELS),
      ...generated.map(f => f.stage),
    ]);
    for (const stage of stages) {
      expect(switched.has(featureKeyForStage(stage)), stage).toBe(true);
    }
  });

  it('covers dk8s, which had none at all', () => {
    const dk8s = generated.filter(f => f.stage.startsWith('dk8s.'));
    expect(dk8s.length).toBeGreaterThanOrEqual(15);
    expect(dk8s.map(f => f.stage)).toContain('dk8s.log.askWhy');
    expect(dk8s.map(f => f.stage)).toContain('dk8s.terminal.theme');
  });

  it('covers the mock generators, Generate Docs and the importers', () => {
    const keys = generated.map(f => f.stage);
    for (const k of [
      'mock.graphql.generate', 'mock.grpc.generate', 'mock.mqtt.generate',
      'rest.docs.generate', 'rest.curl.explain', 'rest.code.import',
    ]) expect(keys, k).toContain(k);
  });

  /* Two switches for one feature is worse than one: the user turns off the
     one they can see and the call still goes out. */
  it('generates nothing for a feature that already has a hand-written flag', () => {
    for (const f of generated) {
      expect(TEMPLATE_TO_FEATURE_KEY[f.stage as keyof typeof TEMPLATE_TO_FEATURE_KEY], f.stage).toBeUndefined();
    }
  });

  it('names and places every generated switch', () => {
    for (const f of generated) {
      expect(f.label, f.stage).toBeTruthy();
      expect(f.label, f.stage).not.toBe(f.stage);
      expect(f.description, f.stage).toBeTruthy();
      expect(f.group, f.stage).toBeTruthy();
    }
  });

  it('groups dk8s features by the screen they are on', () => {
    const byStage = Object.fromEntries(generated.map(f => [f.stage, f.group]));
    expect(byStage['dk8s.log.askWhy']).toBe('dk8s · Logs');
    expect(byStage['dk8s.terminal.theme']).toBe('dk8s · Terminal');
    expect(byStage['dk8s.heap.explain']).toBe('dk8s · Doctor');
  });
});

describe('which flag governs a stage', () => {
  it('defers to the hand-written flag where there is one', () => {
    expect(featureKeyForStage('rest.body.generate')).toBe('bodyGenerator');
    expect(featureKeyForStage('askAiWhy')).toBe('errorDiagnosis');
  });

  it('uses the stage itself otherwise', () => {
    expect(featureKeyForStage('dk8s.log.askWhy')).toBe('dk8s.log.askWhy');
  });

  it('reads as on when nothing has been stored', () => {
    expect(isAiStageEnabled('dk8s.log.askWhy')).toBe(true);
    expect(isAiStageEnabled('rest.body.generate')).toBe(true);
  });
});

describe('the switch stops the call', () => {
  it('sends nothing once the feature is off', () => {
    const post = vi.spyOn(vscode, 'postMsg').mockImplementation(() => {});
    useAiFeaturesStore.setState({ features: { 'dk8s.log.askWhy': false } });
    sendAiRequest({ stage: 'dk8s.log.askWhy', screen: 'dk8s · Logs', userPrompt: 'why' });
    expect(post).not.toHaveBeenCalled();
  });

  /* Returning quietly would leave the button spinning — the exact failure the
     client was written to end. The caller hears an error on its own id. */
  it('tells the caller why, on the id it is listening to', async () => {
    vi.spyOn(vscode, 'postMsg').mockImplementation(() => {});
    useAiFeaturesStore.setState({ features: { 'dk8s.log.askWhy': false } });

    /* jsdom delivers window.postMessage as a task, so wait for the event
       itself rather than guessing at a number of ticks — and match on the id,
       since a refusal queued by an earlier test is still in flight. */
    const id = sendAiRequest({ stage: 'dk8s.log.askWhy', screen: 'dk8s · Logs', userPrompt: 'why' });
    const err = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type !== 'ai:error' || e.data?.tabId !== id) return;
        window.removeEventListener('message', handler);
        resolve(e.data);
      };
      window.addEventListener('message', handler);
      setTimeout(() => reject(new Error('no ai:error was delivered')), 1000);
    });
    expect(err.tabId).toBe(id);
    expect(String(err.message)).toContain('Ask AI why (logs)');
  });

  it('lets the call through once it is back on', () => {
    const post = vi.spyOn(vscode, 'postMsg').mockImplementation(() => {});
    useAiFeaturesStore.setState({ features: { 'dk8s.log.askWhy': true } });
    sendAiRequest({ stage: 'dk8s.log.askWhy', screen: 'dk8s · Logs', userPrompt: 'why' });
    expect(post).toHaveBeenCalledTimes(1);
  });

  /* The old flags were the ones that meant something; they still do, and now
     they mean it for the LLM call as well as the button. */
  it('honours a hand-written flag for the stage it governs', () => {
    const post = vi.spyOn(vscode, 'postMsg').mockImplementation(() => {});
    useAiFeaturesStore.setState({ features: { bodyGenerator: false } });
    sendAiRequest({ stage: 'rest.body.generate', screen: 'REST · Request', userPrompt: 'x' });
    expect(post).not.toHaveBeenCalled();
  });
});

describe('what the host has stored', () => {
  /* An install from before the generated flags existed has rows for none of
     them. Reading a missing row as "off" would silently disable dk8s AI for
     every existing user. */
  it('keeps defaults for keys the stored config has never heard of', () => {
    useAiFeaturesStore.getState().setFeatures({ bodyGenerator: false });
    const { features } = useAiFeaturesStore.getState();
    expect(features.bodyGenerator).toBe(false);
    expect(features['dk8s.log.askWhy']).toBe(true);
  });

  it('ignores an explicitly undefined value rather than reading it as off', () => {
    useAiFeaturesStore.getState().setFeatures({ 'dk8s.log.askWhy': undefined });
    expect(isAiStageEnabled('dk8s.log.askWhy')).toBe(true);
  });
});
