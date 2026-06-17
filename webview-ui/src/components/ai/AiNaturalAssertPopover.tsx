/**
 * AiNaturalAssertPopover — converts plain-English test assertions to dk.* script code.
 * Feature 4.6.3 — AI Natural Language Assertions
 *
 * Draft input + generated result are persisted per-tab in Zustand.
 * Cache-first: if a result already exists when opened, it's shown immediately.
 * Explicit refresh is required to re-generate.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useAiResponseActionsStore } from '../../store/ai-response-actions-store';
import { postMsg } from '../../vscode';
import { SparkleIcon, RefreshIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { ModalView, MultilineInputView, ButtonView, IconButtonView } from '../../dui';

const ACCENT = 'var(--color-protocol-ai)';

interface Props {
  tabId: string;
  response: { body: string; status: number; contentType?: string };
  requestMethod: string;
  requestUrl: string;
  onClose: () => void;
  /** Kept for API compat — ModalView is centred, anchorEl is no longer used */
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

export function AiNaturalAssertPopover({ tabId, response, requestMethod, requestUrl, onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  const { getTabActions, updateAssert } = useAiResponseActionsStore();
  const cached = getTabActions(tabId);

  const [input, setInput] = useState(cached.assert?.input ?? '');
  const [generated, setGenerated] = useState(cached.assert?.result ?? '');
  const [streaming, setStreaming] = useState(false);
  const [applied, setApplied] = useState(false);

  const reqIdRef = useRef('');
  const accRef = useRef('');

  const handleInputChange = (val: string) => {
    setInput(val);
    updateAssert(tabId, { input: val });
  };

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

  return (
    <ModalView
      open
      onClose={onClose}
      title="AI Assertions"
      headerColor={ACCENT}
      headerIcon={
        <div style={{
          width: 22, height: 22, borderRadius: 5, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `color-mix(in srgb, ${ACCENT} 22%, transparent)`,
        }}>
          <SparkleIcon size={11} style={{ color: ACCENT }} />
        </div>
      }
      headerRight={hasCachedResult && !streaming ? (
        <IconButtonView
          icon={<RefreshIcon size={11} />}
          title="Clear result and re-generate"
          size="sm"
          onClick={handleRefresh}
        />
      ) : undefined}
      size="md"
      footerLeft={hasCachedResult && !streaming ? (
        <ButtonView
          label={applied ? '✓ Applied' : 'Apply to Script'}
          variant="secondary"
          size="md"
          accentColor={applied ? 'var(--color-success)' : ACCENT}
          disabled={applied}
          onClick={handleApply}
        />
      ) : undefined}
      footerRight={
        <ButtonView
          label={streaming ? 'Generating…' : hasCachedResult ? 'Re-generate' : 'Generate'}
          size="md"
          accentColor={ACCENT}
          iconLeft={<SparkleIcon size={12} style={{ color: ACCENT }} />}
          disabled={!input.trim() || streaming}
          onClick={handleGenerate}
        />
      }
    >
      <div className="flex flex-col gap-3">
        <MultilineInputView
          value={input}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
          placeholder="e.g. response should have 10 users each with valid email"
          rows={3}
          size="md"
          accentColor={ACCENT}
          autoFocus={!hasCachedResult}
        />
        <p style={{ fontSize: 9.5, color: 'var(--color-text-muted)', margin: 0 }}>Ctrl+Enter to generate</p>

        {generated && (
          <div>
            <span className="block text-[10.5px] mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
              Generated script{streaming ? ' ▋' : ''}
            </span>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              <MdViewer content={`\`\`\`javascript\n${generated}${streaming ? ' ▋' : ''}\n\`\`\``} />
            </div>
          </div>
        )}
      </div>
    </ModalView>
  );
}
