/**
 * AiNaturalAssertPopover — converts plain-English test assertions to dk.* script code.
 * Feature 4.6.3 — AI Natural Language Assertions
 *
 * Draft input + generated result are persisted per-tab in Zustand.
 * Cache-first: if a result already exists when opened, it's shown immediately.
 * Explicit refresh is required to re-generate.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTabsStore } from '../../store/tabs-store';
import { useAiResponseActionsStore } from '../../store/ai-response-actions-store';
import { postMsg } from '../../vscode';
import { SparkleIcon, RefreshIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';

const ACCENT = 'var(--color-protocol-ai)';
const POPOVER_WIDTH = 440;

interface Props {
  tabId: string;
  response: { body: string; status: number; contentType?: string };
  requestMethod: string;
  requestUrl: string;
  onClose: () => void;
  anchorEl?: HTMLElement | null;
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

export function AiNaturalAssertPopover({ tabId, response, requestMethod, requestUrl, onClose, anchorEl }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  const { getTabActions, updateAssert } = useAiResponseActionsStore();
  const cached = getTabActions(tabId);

  // Initialize from cached state
  const [input, setInput] = useState(cached.assert?.input ?? '');
  const [generated, setGenerated] = useState(cached.assert?.result ?? '');
  const [streaming, setStreaming] = useState(false);
  const [applied, setApplied] = useState(false);

  const reqIdRef = useRef('');
  const accRef = useRef('');

  // Persist input changes to store
  const handleInputChange = (val: string) => {
    setInput(val);
    updateAssert(tabId, { input: val });
  };

  // Listen for AI streaming events (match on tabId)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (!msg || typeof msg !== 'object') return;
      if ((msg.tabId as string) !== reqIdRef.current) return;

      if (msg.type === 'ai:chunk') {
        const delta = (msg.delta as string) || (msg.text as string) || '';
        accRef.current += delta;
        setGenerated(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        const final = accRef.current || (msg.message as Record<string, unknown>)?.content as string || '';
        setGenerated(final);
        updateAssert(tabId, { result: final });
        setStreaming(false);
      }
      if (msg.type === 'ai:error') {
        setStreaming(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [tabId, updateAssert]);

  const handleGenerate = useCallback(() => {
    if (!input.trim() || streaming) return;
    accRef.current = '';
    setGenerated('');
    setApplied(false);
    setStreaming(true);

    const pid = `ai-assert-${Date.now()}`;
    reqIdRef.current = pid;

    const bodyPreview = response.body?.slice(0, 600) ?? '';
    const userPrompt = `Current response context:
- Method: ${requestMethod} ${requestUrl}
- Status: ${response.status}
- Content-Type: ${response.contentType ?? 'unknown'}
- Response body (preview):
\`\`\`json
${bodyPreview}${(response.body?.length ?? 0) > 600 ? '\n... (truncated)' : ''}
\`\`\`

User's assertion in plain English:
"${input.trim()}"

Generate the dk.* test script:`;

    postMsg({
      type: 'ai:send',
      tabId: pid,
      provider: '', model: '', baseUrl: '',
      stage: 'rest.assert.generate',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt,
      conversation: [], tools: [],
      settings: {
        temperature: 0.1, maxTokens: 1024, stream: true, topP: 1,
        stopSequences: [], responseFormat: 'text',
        frequencyPenalty: 0, presencePenalty: 0, seed: null,
      },
      mcpServerConfigs: [],
    });
  }, [input, streaming, response, requestMethod, requestUrl]);

  const handleRefresh = useCallback(() => {
    setGenerated('');
    updateAssert(tabId, { result: '' });
    setApplied(false);
  }, [tabId, updateAssert]);

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

  const hasCachedResult = !!generated;

  // Viewport-aware positioning — same approach as AiAssistPopover
  useEffect(() => {
    if (!menuRef.current || !anchorEl) return;
    const menu = menuRef.current;
    const place = () => {
      const r = anchorEl.getBoundingClientRect();
      const menuH = menu.scrollHeight;
      let left = r.right - POPOVER_WIDTH;
      let top = r.bottom + 4;
      if (left < 8) left = Math.min(r.left, window.innerWidth - POPOVER_WIDTH - 8);
      if (left + POPOVER_WIDTH > window.innerWidth - 8) left = window.innerWidth - POPOVER_WIDTH - 8;
      if (left < 8) left = 8;
      if (top + menuH > window.innerHeight - 8) top = Math.max(8, r.top - menuH - 4);
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener('scroll', place, { passive: true, capture: true });
    window.addEventListener('resize', place, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', place);
    };
  }, [anchorEl]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (anchorEl?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anchorEl, onClose]);

  const card = (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        zIndex: 99998,
        width: POPOVER_WIDTH,
        left: -9999,
        top: -9999,
        borderRadius: 8,
        border: '1px solid var(--color-surface-border)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-panel)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px var(--color-panel-border, rgba(255,255,255,.04))',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
        style={{
          borderColor: 'var(--color-surface-border)',
          backgroundColor: `color-mix(in srgb, ${ACCENT} 8%, var(--color-panel))`,
        }}
      >
        <SparkleIcon size={11} style={{ color: ACCENT }} />
        <span className="text-[11px] font-semibold" style={{ color: ACCENT }}>AI Assertions</span>

        {/* Refresh — clear cached result to re-generate */}
        {hasCachedResult && !streaming && (
          <button
            type="button"
            onClick={handleRefresh}
            className="ml-auto mr-1 w-5 h-5 flex items-center justify-center rounded cursor-pointer hover:opacity-70 transition-opacity"
            title="Clear result and re-generate"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <RefreshIcon size={11} />
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className={hasCachedResult && !streaming ? '' : 'ml-auto'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 5, border: 'none',
            background: 'transparent', cursor: 'pointer',
            fontSize: 13, color: 'var(--color-text-muted)', padding: 0, flexShrink: 0,
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--color-error) 12%, transparent)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.background = 'transparent'; }}
        >
          ✕
        </button>
      </div>

      {/* Input */}
      <div className="p-3 flex flex-col gap-2">
        <textarea
          value={input}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
          placeholder="e.g. response should have 10 users each with valid email"
          rows={2}
          autoFocus={!hasCachedResult}
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
            {streaming ? 'Generating…' : hasCachedResult ? 'Re-generate' : 'Generate'}
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
          <div className="px-3 pb-3 overflow-y-auto" style={{ maxHeight: 240 }}>
            <MdViewer content={`\`\`\`javascript\n${generated}${streaming ? ' ▋' : ''}\n\`\`\``} />
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(card, document.body);
}
