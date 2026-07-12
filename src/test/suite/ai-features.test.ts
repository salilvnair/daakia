/**
 * AI Features E2E Tests — Task 10.18
 *
 * Runs against a real, isolated SQLite database (see runTests.ts /
 * DAAKIA_TEST_DB_PATH) — never the developer's real ~/.salilvnair/daakia-vsce/
 * data — so these tests can safely both read AND write.
 */
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  initDb, getAiFeatures, setAiFeatures, DEFAULT_AI_FEATURES,
  getAllPrompts, upsertPrompt, getCustomPrompt, resetPrompt,
  getAiPromptTemplates, setAiPromptTemplates,
  type AiFeatureFlags,
} from '../../storage/db';

// This test file `require`s its own tsc-compiled copy of storage/db.ts — a
// separate module instance from the one bundled into dist/extension.js that
// the real, activated extension uses. Its module-level `_db` singleton is
// only initialized here, in this suite, via this explicit initDb() call
// (mirroring initMockServerManager() in protocols.test.ts). initDb() needs the
// real extension ROOT (it resolves dist/sql-wasm.wasm relative to it) — from
// this compiled file's location at out/test/suite/, that's 3 levels up.
// Both this and the real extension's own copy resolve the same
// DAAKIA_TEST_DB_PATH file, so they point at the same on-disk test database.
const extensionRoot = path.resolve(__dirname, '../../../');
suiteSetup(async () => { await initDb(extensionRoot); });

suite('Daakia AI Features — Extension Activation', () => {
  test('Extension activates with AI features store initialized', async () => {
    const ext = vscode.extensions.getExtension('salilvnair.daakia');
    if (ext && !ext.isActive) await ext.activate();
    assert.strictEqual(ext?.isActive, true, 'Extension must be active');
  });

  test('No unhandled promise rejections during activation', async () => {
    const errors: Error[] = [];
    const handler = (err: Error) => errors.push(err);
    process.on('unhandledRejection', handler as NodeJS.UnhandledRejectionListener);

    await vscode.commands.executeCommand('daakia.openPanel');
    await new Promise(r => setTimeout(r, 500));

    process.off('unhandledRejection', handler as NodeJS.UnhandledRejectionListener);
    assert.strictEqual(errors.length, 0, `Unhandled rejections: ${errors.map(e => e.message).join(', ')}`);
  });
});

suite('Daakia AI Features — Feature Flags (real SQLite read/write)', () => {
  const allDefaultKeys = Object.keys(DEFAULT_AI_FEATURES) as (keyof AiFeatureFlags)[];

  test('getAiFeatures() returns every flag declared in AiFeatureFlags, not a subset', () => {
    const flags = getAiFeatures();
    const missing = allDefaultKeys.filter(k => !(k in flags));
    assert.strictEqual(missing.length, 0, `getAiFeatures() is missing keys: ${missing.join(', ')}`);
  });

  test('every flag defaults to enabled=true on first read', () => {
    const flags = getAiFeatures();
    const disabled = allDefaultKeys.filter(k => flags[k] !== true);
    assert.strictEqual(disabled.length, 0, `expected all flags enabled by default, found disabled: ${disabled.join(', ')}`);
  });

  // Spot-check a representative sample from each sprint that was previously
  // missing entirely from the extension host's AiFeatureFlags (see change log
  // July 08 2026 — host and webview flag sets had diverged by 37 keys).
  const sprintSamples: (keyof AiFeatureFlags)[] = [
    'gqlQueryBuilder', 'gqlSchemaExplainer', 'gqlFederation',       // Sprint 8
    'wsTrafficAnalyzer', 'mqttTopicSuggester', 'sioTrafficAnalyzer', // Sprint 9
    'mcpPromptBuilder', 'openApiGenerator', 'securityAudit',         // Sprint 10
    'autoDiscovery', 'sequenceComposer',                             // Sprint 11
    'intelligenceDashboard', 'deepSecurityAudit',                    // Sprint 12
    'crossProtocolOrchestrator', 'chaosEngineeringPlanner',          // Sprint 14
  ];
  for (const key of sprintSamples) {
    test(`${key} feature flag is a real, present key on AiFeatureFlags`, () => {
      const flags = getAiFeatures();
      assert.strictEqual(typeof flags[key], 'boolean', `${key} should resolve to a boolean, got ${typeof flags[key]}`);
    });
  }

  test('setAiFeatures persists a disabled flag, and getAiFeatures reflects it on next read', () => {
    const before = getAiFeatures();
    setAiFeatures({ ...before, masterAgent: false });
    const after = getAiFeatures();
    assert.strictEqual(after.masterAgent, false, 'disabling a flag should persist across reads');
    // restore
    setAiFeatures({ ...after, masterAgent: true });
    assert.strictEqual(getAiFeatures().masterAgent, true, 'restoring the flag should also persist');
  });
});

suite('Daakia AI Features — Prompt Library (real SQLite read/write)', () => {
  test('getAllPrompts() returns a real array', () => {
    const prompts = getAllPrompts();
    assert.ok(Array.isArray(prompts), 'getAllPrompts should return an array');
  });

  test('upsertPrompt writes a custom prompt and getCustomPrompt reads it back', () => {
    const scenario = 'e2e-test-scenario';
    upsertPrompt(scenario, { scenario, system_prompt: 'You are a test agent.', user_prompt: 'Say hi', agent_name: 'E2E Agent' });
    const row = getCustomPrompt(scenario);
    assert.ok(row, 'custom prompt should be retrievable after upsert');
    assert.strictEqual(row?.system_prompt, 'You are a test agent.');
    assert.strictEqual(row?.agent_name, 'E2E Agent');
  });

  test('resetPrompt removes a custom prompt override', () => {
    const scenario = 'e2e-test-scenario-2';
    upsertPrompt(scenario, { scenario, system_prompt: 'temporary override' });
    assert.ok(getCustomPrompt(scenario), 'prompt should exist before reset');
    resetPrompt(scenario);
    assert.strictEqual(getCustomPrompt(scenario), undefined, 'prompt should be gone after reset');
  });

  test('getAiPromptTemplates/setAiPromptTemplates round-trip a template map', () => {
    const templates = { 'rest.explain': 'Explain this REST response: {{body}}' };
    setAiPromptTemplates(templates);
    const read = getAiPromptTemplates();
    assert.strictEqual(read['rest.explain'], templates['rest.explain']);
  });
});
