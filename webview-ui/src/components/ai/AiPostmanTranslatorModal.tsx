/**
 * AiPostmanTranslatorModal — Translate Postman pm.* test scripts to Daakia dk.* automatically.
 * Task 10.13 — AI Postman Script Translator · Gate: postmanTranslator
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView, EditorView, CopyButtonView, ResizablePanelView } from '@salilvnair/dui';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

// Models occasionally leak reasoning/preamble before the requested code fence despite
// instructions — extract just the fenced block (or the tail after an opened-but-not-yet-closed
// fence while streaming) so stray text never corrupts the shown/copied code.
function extractCode(raw: string): string {
  const trimmed = raw.trim();
  const closed = trimmed.match(/```(?:\w+)?\n?([\s\S]*?)```/);
  if (closed) return closed[1].trim();
  const openIdx = trimmed.indexOf('```');
  if (openIdx !== -1) return trimmed.slice(openIdx).replace(/^```(?:\w+)?\n?/, '').trim();
  return trimmed;
}

const EXAMPLE = `pm.test("Status is 200", function() {
  pm.response.to.have.status(200);
});

pm.test("Has user array", function() {
  const body = pm.response.json();
  pm.expect(body.users).to.be.an("array");
  pm.expect(body.users.length).to.be.greaterThan(0);
});

pm.environment.set("userId", pm.response.json().users[0].id);`;

export function AiPostmanTranslatorModal({ onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [input, setInput] = useState(EXAMPLE);
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setOutput(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setLoading(false); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'Translation failed'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const translate = () => {
    if (!activeTab || !input.trim() || loading) return;
    streamRef.current = ''; setOutput(''); setError(''); setLoading(true);
    postMsg({
      type: 'aiChat',
      tabId: activeTab.id,
      messages: [{
        role: 'user',
        content: `You are an expert in both Postman and Daakia API client scripting. Translate the following Postman test script to Daakia dk.* syntax.

Postman → Daakia equivalents:
- pm.test("name", fn) → dk.test("name", fn)
- pm.response.to.have.status(200) → dk.response.status === 200 (or dk.expect(dk.response.status).toBe(200))
- pm.response.json() → dk.response.json()
- pm.response.text() → dk.response.body (already the raw response text)
- pm.expect(x).to.be.an("array") → dk.expect(x).toMatchSchema({ type: 'array' })
- pm.expect(x).to.equal(y) → dk.expect(x).toBe(y)
- pm.expect(x).to.include(y) → dk.expect(x).toContain(y)
- pm.expect(x).to.have.length(n) → dk.expect(x).toHaveLength(n)
- pm.expect(x).to.be.above(n) → dk.expect(x).toBeGreaterThan(n)
- pm.environment.set("key", val) → dk.env.set("key", val)
- pm.environment.get("key") → dk.env.get("key")
- pm.globals.set("key", val) → dk.globals.set("key", val)
- pm.collectionVariables.set("key", val) → dk.collectionVariables.set("key", val)
- pm.sendRequest(url, cb) → await dk.sendRequest({ url }) (async, returns { status, statusText, headers, body })
- console.log(x) → console.log(x) (unchanged — Daakia captures native console output directly)

Postman script to translate:
\`\`\`javascript
${input.trim()}
\`\`\`

Respond with nothing but a single \`\`\`javascript code fence containing the translated script — no preamble, no reasoning, no commentary before or after the fence. Use the same variable names and test logic.`,
      }],
      stream: true,
    });
  };

  const displayOutput = useMemo(() => extractCode(output), [output]);

  return (
    <ModalView
      open
      onClose={onClose}
      title="Postman → Daakia Translator"
      size="xl"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      headerRight={
        output ? <CopyButtonView text={displayOutput} size="md" /> : undefined
      }
      footerRight={
        <AIButtonView
          label={loading ? 'Translating…' : 'Translate'}
          size="md"
          accentColor={ACCENT}
          disabled={!input.trim() || loading}
          loading={loading}
          onClick={translate}
        />
      }
    >
      <div className="flex flex-1 min-h-0 gap-0 -mx-4" style={{ minHeight: 360 }}>
        {/* Left: input */}
        <div className="flex flex-col flex-1 border-r min-w-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="px-3 py-1.5 border-b flex items-center gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Postman pm.*</span>
          </div>
          <div className="flex-1 p-3 min-h-0">
            <ResizablePanelView defaultHeight={320} minHeight={160} maxHeight={640} style={{ width: '100%' }}>
              <EditorView
                value={input}
                onChange={setInput}
                language="javascript"
                height="100%"
                size="md"
                placeholder="Paste your Postman pm.* test script here…"
                bordered={false}
              />
            </ResizablePanelView>
          </div>
        </div>

        {/* Right: output */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="px-3 py-1.5 border-b flex items-center gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: ACCENT }}>Daakia dk.*</span>
          </div>
          {loading && !output && <p className="text-[11px] animate-pulse px-3 py-2" style={{ color: ACCENT }}>Translating…</p>}
          {error && <p className="text-[11px] px-3 py-2" style={{ color: 'var(--color-error)' }}>{error}</p>}
          {output && (
            <div className="flex-1 p-3 min-h-0">
              <ResizablePanelView defaultHeight={320} minHeight={160} maxHeight={640} style={{ width: '100%' }}>
                <EditorView
                  value={displayOutput}
                  language="javascript"
                  height="100%"
                  size="md"
                  readOnly
                  bordered={false}
                />
              </ResizablePanelView>
            </div>
          )}
          {!loading && !output && !error && (
            <p className="text-[11px] px-3 py-2" style={{ color: 'var(--color-text-muted)' }}>Translation will appear here…</p>
          )}
        </div>
      </div>
    </ModalView>
  );
}
