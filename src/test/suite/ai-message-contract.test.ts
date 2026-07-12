/**
 * AI message-contract audit (e2e regression) — E-ai-message-contract-audit
 *
 * Every AI modal in webview-ui/src/components/ai/ posts a `postMsg({ type: ... })`
 * asking the extension host to run a generation request. Originally there were
 * two contracts in use: `ai:send` (routes through handleAiSend -> executeAiRequest)
 * and `aiChat`/`aiStream`/`aiStreamRequest` (a second contract that MainPanel.ts
 * had zero `case` for — 31 features silently hung forever). Fixed via
 * E-ai-dead-message-contracts-fix: handleAiChat/handleAiStream/handleAiStreamRequest
 * in ai-handler.ts now reuse the exact same provider-resolution/execution engine
 * as handleAiSend and re-emit under the `aiStream:chunk`/`aiStream:done`/
 * `aiStream:error` (or, for aiStreamRequest, `aiStreamChunk`/`aiStreamDone`/
 * `aiStreamError`) event names these 31 components already correctly listen for.
 *
 * This test reuses scripts/audit-ai-message-contracts.mjs's scan so the CLI
 * report and this regression check can never drift apart. It asserts every
 * known AI-trigger message type has a real MainPanel.ts handler — if a future
 * AI feature is wired to a message type with no matching `case`, this fails.
 */
import * as assert from 'assert';
import * as path from 'path';

const ALL_AI_TRIGGER_TYPES = ['ai:send', 'ai:discovery:start', 'aiChat', 'aiStream', 'aiStreamRequest'];

suite('Daakia AI — Message Contract Audit', () => {
  test('every AI-trigger message type has a real MainPanel.ts handler', async () => {
    const scriptPath = path.resolve(__dirname, '../../../scripts/audit-ai-message-contracts.mjs');
    const { runAudit } = await import(scriptPath);
    const { report } = runAudit() as { report: Array<{ type: string; handled: boolean; fileCount: number }> };

    for (const type of ALL_AI_TRIGGER_TYPES) {
      const entry = report.find(r => r.type === type);
      assert.ok(entry, `expected '${type}' to appear in the audit report`);
      assert.strictEqual(
        entry!.handled,
        true,
        `'${type}' (${entry!.fileCount} file(s)) has no MainPanel.ts handler — the webview posts, the host silently drops it, and the feature hangs forever`,
      );
    }
  });
});
