/** AI protocol streaming/conversation/keys/features/templates/history/providers messages. Extracted verbatim from the App message handler. */
import { useTabsStore } from '../../store/tabs-store';
import { useDevToolsStore } from '../../store/devtools-store';
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { useAiKeysStore } from '../../store/ai-keys-store';
import { useAiFeaturesStore } from '../../store/ai-features-store';
import { useAiHistoryStore } from '../../store/ai-history-store';
import { useAiConversationStore } from '../../store/ai-conversation-store';
import { useAiPromptTemplatesStore, AI_PROMPT_TEMPLATE_DEFAULTS } from '../../store/prompt-template';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleAiMessages(msg: any): boolean {
  switch (msg.type as string) {
        // ─── AI Protocol Messages ─────────────────────────────────────────
        case 'ai:chunk': {
          const { tabId, delta } = msg;
          const tab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (tab?.type === 'daakia-ai') {
            // Global conversation store for Daakia AI tab — persisted, survives close/reopen
            useAiConversationStore.getState().appendAssistantChunk(delta || '');
          } else if (tab) {
            const conv = [...(tab.aiConversation || [])];
            const lastMsg = conv[conv.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              conv[conv.length - 1] = { ...lastMsg, content: lastMsg.content + (delta || '') };
            } else {
              conv.push({ id: crypto.randomUUID(), role: 'assistant', content: delta || '', timestamp: Date.now() });
            }
            useTabsStore.getState().updateTab(tabId, { aiConversation: conv });
          }
          break;
        }
        case 'ai:complete': {
          const { tabId, message: aiMsg, tokens, duration } = msg;
          console.group('%c✅ AI Request Complete', 'color:#22c55e;font-weight:bold;font-size:12px');
          console.log('%cDuration:', 'font-weight:bold', `${duration}ms`);
          console.log('%cTokens:', 'font-weight:bold', tokens);
          console.log('%cTool Calls:', 'font-weight:bold', aiMsg.toolCalls?.length || 0);
          console.log('%cContent Preview:', 'font-weight:bold', (aiMsg.content || '').slice(0, 200));
          console.groupEnd();

          // Push to internal DevTools Console + Network
          const successTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          const successReqName = successTab ? `AI ${successTab.aiProvider || ''}/${successTab.aiModel || ''}` : 'AI Request';
          useDevToolsStore.getState().addLog({
            level: 'info',
            args: [`✅ AI Complete (${duration}ms)`, { tokens, toolCalls: aiMsg.toolCalls?.length || 0, contentPreview: (aiMsg.content || '').slice(0, 300) }],
            timestamp: Date.now(),
            requestName: successReqName,
          });
          useDevToolsStore.getState().addNetworkEntry({
            timestamp: Date.now(),
            method: 'POST',
            url: successTab?.url || '',
            requestHeaders: {},
            requestBody: undefined,
            status: 200,
            statusText: 'OK',
            responseHeaders: {},
            responseBody: (aiMsg.content || '').slice(0, 5000),
            duration: duration || 0,
            size: (aiMsg.content || '').length,
            contentType: 'application/json',
          });

          const tab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (tab?.type === 'daakia-ai') {
            useAiConversationStore.getState().finalizeAssistantMessage(aiMsg);
            useTabsStore.getState().updateTab(tabId, { aiStreaming: false, loading: false });
          } else if (tab) {
            const conv = [...(tab.aiConversation || [])];
            const lastMsg = conv[conv.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              conv[conv.length - 1] = { ...aiMsg, id: lastMsg.id };
            } else {
              conv.push(aiMsg);
            }
            useTabsStore.getState().updateTab(tabId, {
              aiConversation: conv,
              aiStreaming: false,
              loading: false,
            });
          }
          break;
        }
        case 'ai:error': {
          const { tabId, message: errMsg, code, diagnostics } = msg;

          // ──── Full DevTools Console Diagnostics ────
          console.group('%c🚨 AI Request Failed', 'color:#ef4444;font-weight:bold;font-size:14px');
          console.error(`Status: ${code || 'UNKNOWN'} — ${errMsg}`);
          if (diagnostics) {
            if (diagnostics.request) {
              console.group('%c📤 Request', 'color:#3b82f6;font-weight:bold');
              console.log('%cURL:', 'font-weight:bold', diagnostics.request.url);
              console.log('%cMethod:', 'font-weight:bold', diagnostics.request.method);
              console.log('%cHeaders:', 'font-weight:bold', diagnostics.request.headers);
              console.log('%cBody:', 'font-weight:bold', diagnostics.request.body);
              console.groupEnd();
            }
            if (diagnostics.response) {
              console.group('%c📥 Response', 'color:#f59e0b;font-weight:bold');
              console.log('%cStatus:', 'font-weight:bold', diagnostics.response.statusCode, diagnostics.response.statusMessage);
              console.log('%cHeaders:', 'font-weight:bold', diagnostics.response.headers);
              console.log('%cBody:', 'font-weight:bold', diagnostics.response.body);
              console.groupEnd();
            }
            if (diagnostics.error) {
              console.group('%c💥 Error Details', 'color:#dc2626;font-weight:bold');
              console.log('%cName:', 'font-weight:bold', diagnostics.error.name);
              console.log('%cMessage:', 'font-weight:bold', diagnostics.error.message);
              console.log('%cCode:', 'font-weight:bold', diagnostics.error.code);
              console.log('%cStack:', 'font-weight:bold', diagnostics.error.stack);
              console.groupEnd();
            }
            if (diagnostics.meta) {
              console.group('%c📊 Meta', 'color:#8b5cf6;font-weight:bold');
              console.table(diagnostics.meta);
              console.groupEnd();
            }
            console.log('%cFull Diagnostics JSON:', 'font-weight:bold', JSON.parse(JSON.stringify(diagnostics)));
          }
          console.groupEnd();
          // ──── End DevTools Diagnostics ────

          // Push to internal DevTools Console + Network
          const aiTab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          const aiReqName = aiTab ? `AI ${aiTab.aiProvider || 'unknown'}/${aiTab.aiModel || 'unknown'}` : 'AI Request';
          useDevToolsStore.getState().addLog({
            level: 'error',
            args: [`🚨 AI Error [${code || '?'}]: ${errMsg}`, diagnostics || {}],
            timestamp: Date.now(),
            requestName: aiReqName,
          });
          if (diagnostics?.request) {
            useDevToolsStore.getState().addNetworkEntry({
              timestamp: Date.now(),
              method: 'POST',
              url: diagnostics.request.url || aiTab?.url || '',
              requestHeaders: diagnostics.request.headers || {},
              requestBody: typeof diagnostics.request.body === 'string' ? diagnostics.request.body : JSON.stringify(diagnostics.request.body, null, 2),
              status: diagnostics.response?.statusCode || parseInt(code || '0') || 0,
              statusText: diagnostics.response?.statusMessage || errMsg,
              responseHeaders: diagnostics.response?.headers || {},
              responseBody: typeof diagnostics.response?.body === 'string' ? diagnostics.response.body : JSON.stringify(diagnostics.response?.body, null, 2),
              duration: diagnostics.meta?.duration || 0,
              size: 0,
              contentType: 'application/json',
            });
          }

          const tab = useTabsStore.getState().tabs.find(t => t.id === tabId);
          if (tab?.type === 'daakia-ai') {
            const errorDetail = code ? `[${code}] ${errMsg}` : errMsg;
            useAiConversationStore.getState().addErrorMessage(`❌ Error: ${errorDetail}`);
            useTabsStore.getState().updateTab(tabId, { aiStreaming: false, loading: false });
          } else if (tab) {
            const conv = [...(tab.aiConversation || [])];
            const errorDetail = code ? `[${code}] ${errMsg}` : errMsg;
            conv.push({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `❌ Error: ${errorDetail}`,
              timestamp: Date.now(),
            });
            useTabsStore.getState().updateTab(tabId, {
              aiConversation: conv,
              aiStreaming: false,
              loading: false,
            });
          }
          break;
        }
        case 'ai:toolCalls': {
          // Backend executed MCP tools — append assistant message (with toolCalls) to conversation
          const { tabId: tcTabId, message: tcMsg } = msg;
          const tcTab = useTabsStore.getState().tabs.find(t => t.id === tcTabId);
          if (tcTab && tcTab.type !== 'daakia-ai') {
            const conv = [...(tcTab.aiConversation || [])];
            const last = conv[conv.length - 1];
            if (last && last.role === 'assistant') {
              conv[conv.length - 1] = { ...tcMsg, id: last.id };
            } else {
              conv.push(tcMsg);
            }
            useTabsStore.getState().updateTab(tcTabId, { aiConversation: conv });
          }
          break;
        }
        case 'ai:toolResult': {
          // Backend MCP tool result — append tool role message to conversation
          const { tabId: trTabId, message: trMsg } = msg;
          const trTab = useTabsStore.getState().tabs.find(t => t.id === trTabId);
          if (trTab && trTab.type !== 'daakia-ai') {
            const conv = [...(trTab.aiConversation || []), trMsg];
            useTabsStore.getState().updateTab(trTabId, { aiConversation: conv });
          }
          break;
        }
        case 'ai:toolExecuting': {
          // Backend is executing an MCP tool — just log for now
          const { tabId: teTabId, toolName, toolCallId } = msg;
          console.log('%c🔧 AI Tool Executing', 'color:#f59e0b;font-weight:bold', { tabId: teTabId, toolName, toolCallId });
          break;
        }
        case 'ai:conversations': {
          // Conversation list loaded — forward to AiHistoryPanel via store or custom event
          window.dispatchEvent(new CustomEvent('ai:conversations', { detail: msg }));
          break;
        }
        case 'ai:conversation': {
          // Single conversation loaded (with messages)
          window.dispatchEvent(new CustomEvent('ai:conversation', { detail: msg }));
          break;
        }
        case 'ai:conversationSaved': {
          window.dispatchEvent(new CustomEvent('ai:conversationSaved', { detail: msg }));
          break;
        }
        case 'ai:conversationDeleted': {
          window.dispatchEvent(new CustomEvent('ai:conversationDeleted', { detail: msg }));
          break;
        }
        case 'ai:conversationsCleared': {
          window.dispatchEvent(new CustomEvent('ai:conversationsCleared', { detail: msg }));
          break;
        }
        case 'ai:cancelled': {
          const { tabId } = msg;
          console.log('%c⛔ AI Request Cancelled', 'color:#6b7280;font-weight:bold', { tabId });
          useTabsStore.getState().updateTab(tabId, { aiStreaming: false, loading: false });
          break;
        }
        case 'ai:debug': {
          const { phase, data, tabId: debugTabId } = msg;
          if (phase === 'request') {
            console.group('%c📡 AI Request Sent', 'color:#3b82f6;font-weight:bold;font-size:12px');
            console.log('%cProvider:', 'font-weight:bold', data.provider);
            console.log('%cModel:', 'font-weight:bold', data.model);
            console.log('%cBase URL:', 'font-weight:bold', data.baseUrl);
            console.log('%cChat Endpoint:', 'font-weight:bold', data.chatEndpoint);
            console.log('%cMessages:', 'font-weight:bold', data.messageCount);
            console.log('%cSystem Prompts:', 'font-weight:bold', data.systemPrompts);
            console.log('%cUser Prompt:', 'font-weight:bold', data.userPrompt);
            console.log('%cTools:', 'font-weight:bold', data.toolCount, data.toolNames);
            console.log('%cMCP Tools:', 'font-weight:bold', data.mcpToolCount);
            console.log('%cSettings:', 'font-weight:bold', data.settings);
            console.log('%cAuth Type:', 'font-weight:bold', data.authType);
            console.groupEnd();

            // Push to internal DevTools Console
            useDevToolsStore.getState().addLog({
              level: 'info',
              args: [`📡 AI Request → ${data.provider}/${data.model}`, { url: data.baseUrl, endpoint: data.chatEndpoint, messages: data.messageCount, tools: data.toolCount, systemPrompts: data.systemPrompts, userPrompt: data.userPrompt, settings: data.settings }],
              timestamp: Date.now(),
              requestName: `AI ${data.provider}/${data.model}`,
            });
          }
          break;
        }

        // ─── AI Key Status ────────────────────────────────────────────────
        case 'aiKeys:status':
          useAiKeysStore.getState().setKeyStatus(msg.status || {});
          break;

        // ─── AI Feature Flags ─────────────────────────────────────────────
        case 'aiFeatures:data':
          useAiFeaturesStore.getState().setFeatures(msg.features || {});
          break;

        // ─── AI Prompt Templates ──────────────────────────────────────────
        case 'aiPromptTemplates:data': {
          const merged = { ...AI_PROMPT_TEMPLATE_DEFAULTS, ...(msg.templates || {}) };
          useAiPromptTemplatesStore.getState().setTemplates(merged as any);
          break;
        }

        // ─── AI Chat History ─────────────────────────────────────────────
        case 'aiHistory:data':
          useAiHistoryStore.getState().setSessions(msg.sessions || []);
          break;

        case 'aiHistory:results':
          useAiHistoryStore.getState().setSearchResults(msg.sessions || []);
          break;

        // ─── AI Providers Config ──────────────────────────────────────────
        case 'aiProviders:data': {
          const { providers, defaultProviderId, defaultModelId } = msg;
          if (providers && Array.isArray(providers) && providers.length > 0) {
            useAiProvidersStore.getState().setProviders(
              providers as any,
              (defaultProviderId as string) || 'copilot',
              (defaultModelId as string) || 'auto',
            );
          } else {
            useAiProvidersStore.getState().seedDefaults();
          }
          break;
        }

    default:
      return false;
  }
  return true;
}
