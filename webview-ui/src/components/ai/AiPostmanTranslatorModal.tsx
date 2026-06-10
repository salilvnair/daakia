/**
 * AiPostmanTranslatorModal — Translate Postman pm.* test scripts to Daakia dk.* automatically.
 * Task 10.13 — AI Postman Script Translator · Gate: postmanTranslator
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTabsStore } from '../../store/tabs-store';
import { CloseIcon, SparkleIcon, CopyIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

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
  const [copied, setCopied] = useState(false);
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
- pm.response.text() → dk.response.text()
- pm.expect(x).to.be.an("array") → dk.expect(x).toBeArray()
- pm.expect(x).to.equal(y) → dk.expect(x).toBe(y)
- pm.expect(x).to.include(y) → dk.expect(x).toContain(y)
- pm.expect(x).to.have.length(n) → dk.expect(x).toHaveLength(n)
- pm.expect(x).to.be.above(n) → dk.expect(x).toBeGreaterThan(n)
- pm.environment.set("key", val) → dk.env.set("key", val)
- pm.environment.get("key") → dk.env.get("key")
- pm.globals.set("key", val) → dk.globals.set("key", val)
- pm.collectionVariables.set("key", val) → dk.collection.set("key", val)
- pm.sendRequest(url, cb) → await dk.fetch(url) (async)
- console.log(x) → dk.log(x)

Postman script to translate:
\`\`\`javascript
${input.trim()}
\`\`\`

Output ONLY the translated Daakia dk.* script with no explanation. Use the same variable names and test logic.`,
      }],
      stream: true,
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onMouseDown={e => e.stopPropagation()}>
      <div className="relative flex flex-col rounded-2xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--color-panel)', borderColor: `color-mix(in srgb, ${ACCENT} 30%, var(--color-surface-border))`, width: 820, maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex items-center gap-2">
            <SparkleIcon size={14} style={{ color: ACCENT }} />
            <span className="text-[13px] font-semibold" style={{ color: ACCENT }}>Postman → Daakia Translator ✦</span>
          </div>
          <div className="flex items-center gap-2">
            {output && (
              <button type="button" onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer" style={{ color: copied ? 'var(--color-success)' : ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 10%, transparent)` }}>
                {copied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}{copied ? 'Copied!' : 'Copy Result'}
              </button>
            )}
            <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-[var(--color-hover)] cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
              <CloseIcon size={13} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: input */}
          <div className="flex flex-col flex-1 border-r min-w-0" style={{ borderColor: 'var(--color-surface-border)' }}>
            <div className="px-3 py-1.5 border-b flex items-center gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Postman pm.*</span>
            </div>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              className="flex-1 p-3 text-[11.5px] font-mono resize-none outline-none bg-transparent"
              style={{ color: 'var(--color-text-primary)' }}
              placeholder="Paste your Postman pm.* test script here…"
            />
          </div>

          {/* Right: output */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="px-3 py-1.5 border-b flex items-center gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: ACCENT }}>Daakia dk.*</span>
            </div>
            <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-3">
              {loading && !output && <p className="text-[11px] animate-pulse" style={{ color: ACCENT }}>Translating…</p>}
              {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}
              {output && (
                <pre className="text-[11.5px] font-mono whitespace-pre-wrap" style={{ color: 'var(--color-text-primary)' }}>{output}</pre>
              )}
              {!loading && !output && !error && (
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Translation will appear here…</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button type="button" onClick={translate} disabled={!input.trim() || loading}
            className="flex items-center gap-2 h-[34px] px-5 rounded-xl text-[12px] font-semibold cursor-pointer text-white hover:opacity-90 transition-opacity disabled:opacity-40"
            style={{ backgroundColor: ACCENT }}
          >
            <SparkleIcon size={11} />{loading ? 'Translating…' : 'Translate ✦'}
          </button>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[var(--color-hover)]" style={{ color: 'var(--color-text-muted)' }}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
