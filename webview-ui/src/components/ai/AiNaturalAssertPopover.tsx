/**
 * AiNaturalAssertPopover — converts plain-English test assertions to dk.* script code.
 * Feature 4.6.3 — AI Natural Language Assertions
 *
 * User writes: "response should have 10 users each with valid email"
 * AI generates: dk.test('...', () => { dk.expect(...).toBe(10); ... })
 * "Apply" appends the generated code to the post-response script.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { postMsg } from '../../vscode';
import { SparkleIcon } from '../../icons';

const ACCENT = 'var(--color-protocol-ai)';

interface Props {
  response: { body: string; status: number; contentType?: string };
  requestMethod: string;
  requestUrl: string;
  onClose: () => void;
}

/** System prompt telling AI to generate only dk.* assertion code */
const SYSTEM_PROMPT = `You are a test script generator for the Daakia API client.
The user will describe what they expect from an API response in plain English.
Generate a JavaScript test script using ONLY the dk.* API:

Available APIs:
- dk.test(name, fn)  — define a named test block
- dk.expect(value).toBe(expected)  — strict equality
- dk.expect(value).toContain(item) — array/string contains
- dk.expect(value).toMatch(pattern) — regex match
- dk.expect(value).toBeTruthy()  / .toBeFalsy()
- dk.expect(value).toBeGreaterThan(n) / .toBeLessThan(n)
- dk.expect(value).toHaveLength(n)
- dk.expect(value).toHaveProperty(key)
- dk.response.json() — parsed JSON body
- dk.response.status — HTTP status code
- dk.response.headers['header-name'] — response header

IMPORTANT RULES:
- Output ONLY the JavaScript code block (no markdown, no explanation, no backticks)
- Use dk.test() to wrap each logical assertion group
- Keep it concise and readable
- Do NOT use console.log or any other APIs not listed above`;

export function AiNaturalAssertPopover({ response, requestMethod, requestUrl, onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  const [input, setInput] = useState('');
  const [generated, setGenerated] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [applied, setApplied] = useState(false);

  const reqIdRef = useRef(`nlassert-${Date.now()}`);
  const accRef = useRef('');

  // Listen for AI streaming events
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (!msg || typeof msg !== 'object') return;
      const reqId = msg.reqId as string | undefined;
      if (reqId && reqId !== reqIdRef.current) return;

      switch (msg.type) {
        case 'ai:chunk': {
          const chunk = msg.chunk as { delta?: { content?: string } } | string;
          const delta = typeof chunk === 'string' ? chunk : (chunk?.delta?.content ?? '');
          accRef.current += delta;
          setGenerated(accRef.current);
          break;
        }
        case 'ai:complete':
          setStreaming(false);
          break;
        case 'ai:error':
          setStreaming(false);
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleGenerate = useCallback(() => {
    if (!input.trim() || streaming) return;
    accRef.current = '';
    setGenerated('');
    setApplied(false);
    setStreaming(true);
    reqIdRef.current = `nlassert-${Date.now()}`;

    const bodyPreview = response.body?.slice(0, 600) ?? '';
    const userMessage = `Current response context:
- Method: ${requestMethod} ${requestUrl}
- Status: ${response.status}
- Content-Type: ${response.contentType ?? 'unknown'}
- Response body (preview):
\`\`\`json
${bodyPreview}${response.body?.length > 600 ? '\n... (truncated)' : ''}
\`\`\`

User's assertion in plain English:
"${input.trim()}"

Generate the dk.* test script:`;

    postMsg({
      type: 'ai:send',
      reqId: reqIdRef.current,
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      stream: true,
    });
  }, [input, streaming, response, requestMethod, requestUrl]);

  const handleApply = useCallback(() => {
    if (!generated.trim() || !activeTab) return;
    const cleanCode = generated
      .replace(/^```(?:javascript|js)?\n?/m, '')
      .replace(/\n?```$/m, '')
      .trim();
    const current = activeTab.postResponseScript ?? '';
    const updated = current.trim() ? `${current}\n\n${cleanCode}` : cleanCode;
    updateTab(activeTab.id, { postResponseScript: updated });
    setApplied(true);
  }, [generated, activeTab, updateTab]);

  return (
    <div
      className="absolute z-50 right-0 mt-1 rounded-lg border overflow-hidden flex flex-col"
      style={{
        width: 440,
        backgroundColor: 'var(--color-panel)',
        borderColor: 'var(--color-surface-border)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: 'var(--color-surface-border)', backgroundColor: `color-mix(in srgb, ${ACCENT} 8%, var(--color-panel))` }}
      >
        <SparkleIcon size={11} style={{ color: ACCENT }} />
        <span className="text-[11px] font-semibold" style={{ color: ACCENT }}>AI Assertions</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-[12px] cursor-pointer hover:opacity-70 transition-opacity"
          style={{ color: 'var(--color-text-muted)' }}
        >
          ×
        </button>
      </div>

      {/* Input */}
      <div className="p-3 flex flex-col gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
          placeholder="e.g. response should have 10 users each with valid email"
          rows={2}
          autoFocus
          className="w-full px-3 py-2 text-[12px] rounded-md border resize-none"
          style={{
            backgroundColor: 'var(--color-input-bg)',
            borderColor: 'var(--color-input-border)',
            color: 'var(--color-text-primary)',
          }}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!input.trim() || streaming}
            className="h-[26px] px-3 text-[11px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            style={{ backgroundColor: ACCENT, color: '#fff' }}
          >
            {streaming ? 'Generating…' : 'Generate'}
          </button>
          <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>Ctrl+Enter to generate</span>
        </div>
      </div>

      {/* Generated code */}
      {generated && (
        <div className="border-t" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="px-3 pt-2 pb-1 flex items-center justify-between">
            <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>Generated script</span>
            <button
              type="button"
              onClick={handleApply}
              disabled={applied}
              className="h-[22px] px-2.5 text-[10px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-60 transition-opacity"
              style={{ backgroundColor: applied ? 'var(--color-success)' : ACCENT, color: '#fff' }}
            >
              {applied ? '✓ Applied' : 'Apply to Script'}
            </button>
          </div>
          <pre
            className="px-3 pb-3 text-[10.5px] font-mono overflow-x-auto"
            style={{ color: 'var(--color-text-primary)', maxHeight: 200, overflowY: 'auto' }}
          >
            {generated}
            {streaming && <span className="animate-pulse" style={{ color: ACCENT }}> ▋</span>}
          </pre>
        </div>
      )}
    </div>
  );
}
