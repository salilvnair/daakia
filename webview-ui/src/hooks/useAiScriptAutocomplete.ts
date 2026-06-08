/**
 * useAiScriptAutocomplete.ts — AI-powered ghost-text inline completion for Monaco script editors (4.3.11)
 *
 * Registers a Monaco `registerInlineCompletionsProvider` for JavaScript. When triggered,
 * sends the code context to AI via `ai:send` and returns completion text as Monaco ghost text.
 *
 * Trigger modes:
 *   - 'on-demand' (default): user presses Ctrl+Alt+Space — explicit trigger only
 *   - 'on-type': auto-trigger after 1.2s idle (debounced)
 *
 * Accept: Tab key (Monaco native ghost text behavior)
 * Dismiss: Escape key (Monaco native)
 */
import { useRef, useCallback, useEffect } from 'react';
import { postMsg } from '../vscode';
import { interpolateTemplate } from '../store/prompt-template';
import { useAiPromptTemplatesStore } from '../store/prompt-template';

// DK context summary string shown to AI
const DK_CONTEXT_SUMMARY = `dk.response.json() — parsed response body
dk.response.status — HTTP status code (number)
dk.response.headers.get(name) — response header value
dk.response.time — response time in ms
dk.expect(value).toBe(expected) / .toEqual(expected) / .toBeGreaterThan(n) / .toBeLessThan(n) / .toContain(val)
dk.expect(value).toMatchSchema(schema) — JSON schema validation
dk.env.get(key) / .set(key, val) / .has(key) / .unset(key) / .toObject()
dk.globals.get(key) / .set(key, val) / .toObject()
dk.collectionVariables.get(key) / .set(key, val)
dk.request.url / .method / .headers / .body
dk.interpolate(template) — resolves {{variable}} in string
dk.sendRequest({method, url, headers, body}) — make another HTTP request
dk.runner.setNextRequest(name) — skip to a named request
dk.console.log(msg) / .info(msg) / .warn(msg) / .error(msg)
dk.test("test name", fn) — register a named test assertion`;

export type AiAutocompleteMode = 'on-demand' | 'on-type';

interface UseAiScriptAutocompleteOptions {
  /** Whether AI autocomplete is active */
  enabled: boolean;
  /** Trigger mode — explicit (on-demand) or automatic (on-type) */
  mode: AiAutocompleteMode;
}

interface EditorBinding {
  editor: any;
  monaco: any;
  disposeProvider: (() => void) | null;
  disposeKeybinding: (() => void) | null;
}

export function useAiScriptAutocomplete({ enabled, mode }: UseAiScriptAutocompleteOptions) {
  const bindingsRef = useRef<Map<string, EditorBinding>>(new Map());
  const pendingCompletionsRef = useRef<Map<string, { resolve: (text: string) => void; reject: (e: Error) => void }>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolveTemplate = useAiPromptTemplatesStore(s => s.resolve);

  // ── AI completion fetch ──────────────────────────────────────────────────

  const fetchCompletion = useCallback((
    codePrefix: string,
    surroundingCode: string,
    signal: { cancelled: boolean },
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (signal.cancelled) { reject(new Error('cancelled')); return; }

      const pid = `ai-script-ac-${Date.now()}`;
      let acc = '';

      const handler = (evt: MessageEvent) => {
        const msg = evt.data as Record<string, unknown>;
        if (!msg || msg.tabId !== pid) return;

        if (msg.type === 'ai:chunk') {
          const delta = (msg.delta as string) || (msg.text as string) || '';
          acc += delta;
        }
        if (msg.type === 'ai:complete') {
          window.removeEventListener('message', handler);
          const msgPayload = msg.message as Record<string, unknown> | undefined;
          const text = acc || (msgPayload?.content as string) || '';
          // Strip any accidental fences
          const clean = text
            .replace(/^```(?:javascript|js)?\s*/im, '')
            .replace(/\s*```\s*$/im, '')
            .trimEnd();
          resolve(clean);
        }
        if (msg.type === 'ai:error') {
          window.removeEventListener('message', handler);
          reject(new Error((msg.message as string) || 'AI error'));
        }
      };

      window.addEventListener('message', handler);

      const systemPrompt = resolveTemplate('rest.script.autocomplete.system');
      const userPrompt = resolveTemplate('rest.script.autocomplete', {
        codePrefix,
        surroundingCode: surroundingCode.slice(-2000), // last 2000 chars for context
        dkContext: DK_CONTEXT_SUMMARY,
      });

      postMsg({
        type: 'ai:send',
        tabId: pid,
        provider: '', model: '', baseUrl: '',
        stage: 'rest.script.autocomplete',
        systemPrompts: [systemPrompt],
        userPrompt,
        conversation: [],
        tools: [],
        settings: {
          temperature: 0.1,
          maxTokens: 256,
          stream: true,
          topP: 1,
          stopSequences: ['\n\n\n'],
          responseFormat: 'text',
          frequencyPenalty: 0,
          presencePenalty: 0,
          seed: null,
        },
        mcpServerConfigs: [],
      });

      // 12s timeout
      setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('timeout'));
      }, 12000);
    });
  }, [resolveTemplate]);

  // ── Register inline completions provider for one editor ──────────────────

  const registerForEditor = useCallback((editorId: string, editor: any, monaco: any) => {
    const signal = { cancelled: false };

    const providerDisposable = monaco.languages.registerInlineCompletionsProvider(
      'javascript',
      {
        provideInlineCompletions: async (model: any, position: any, ctx: any, token: any) => {
          if (!enabled) return { items: [] };

          // Skip if typing triggered but mode is on-demand
          if (mode === 'on-demand' && ctx.triggerKind !== 2 /* Explicit */) {
            return { items: [] };
          }

          const lineContent = model.getLineContent(position.lineNumber);
          const prefix = lineContent.substring(0, position.column - 1);

          // Skip trivial positions (empty line, just whitespace)
          if (!prefix.trim()) return { items: [] };

          // Build code prefix including previous lines
          const allLines = model.getValue().split('\n') as string[];
          const prefixLines = [
            ...allLines.slice(0, position.lineNumber - 1),
            lineContent.substring(0, position.column - 1),
          ];
          const codePrefix = prefixLines.join('\n');
          const surroundingCode = model.getValue();

          try {
            const completion = await fetchCompletion(codePrefix, surroundingCode, signal);
            if (token.isCancellationRequested || signal.cancelled) return { items: [] };
            if (!completion) return { items: [] };

            return {
              items: [{
                insertText: completion,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                },
              }],
            };
          } catch {
            return { items: [] };
          }
        },
        freeInlineCompletions: () => {},
      }
    );

    // Ctrl+Alt+Space keybinding for on-demand trigger
    const keybindingDisposable = editor.addCommand(
      // KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Space = 2048 | 512 | 32 = 2592
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.Space,
      () => {
        editor.trigger('keyboard', 'editor.action.inlineSuggest.trigger', null);
      }
    );

    const binding: EditorBinding = {
      editor,
      monaco,
      disposeProvider: () => { signal.cancelled = true; providerDisposable.dispose(); },
      disposeKeybinding: keybindingDisposable ? () => keybindingDisposable() : null,
    };
    bindingsRef.current.set(editorId, binding);

    return () => {
      signal.cancelled = true;
      providerDisposable.dispose();
    };
  }, [enabled, mode, fetchCompletion]);

  // ── onEditorMount callback exposed to ScriptsEditor ─────────────────────

  const handleEditorMount = useCallback((editorId: string) => {
    return (editor: any, monaco: any) => {
      // Clean up any previous binding for this editor slot
      const existing = bindingsRef.current.get(editorId);
      if (existing?.disposeProvider) existing.disposeProvider();

      if (enabled) {
        registerForEditor(editorId, editor, monaco);
      } else {
        // Store editor ref for later if user enables
        bindingsRef.current.set(editorId, { editor, monaco, disposeProvider: null, disposeKeybinding: null });
      }
    };
  }, [enabled, registerForEditor]);

  // ── Re-register / unregister when enabled or mode changes ───────────────

  useEffect(() => {
    for (const [id, binding] of bindingsRef.current.entries()) {
      // Dispose old provider
      if (binding.disposeProvider) {
        binding.disposeProvider();
        binding.disposeProvider = null;
      }
      if (enabled && binding.editor && binding.monaco) {
        registerForEditor(id, binding.editor, binding.monaco);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, mode]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      for (const binding of bindingsRef.current.values()) {
        if (binding.disposeProvider) binding.disposeProvider();
      }
      bindingsRef.current.clear();
      pendingCompletionsRef.current.clear();
    };
  }, []);

  return { handleEditorMount };
}
