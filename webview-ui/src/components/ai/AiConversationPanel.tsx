import { useCallback } from 'react';
import { ConvEngineChat } from '@salilvnair/convengine-chat';
import { useTabsStore } from '../../store/tabs-store';

const SUGGESTION_CHIPS = [
  { chipText: '📡 Build a request',   chatText: '/request GET all users from https://jsonplaceholder.typicode.com/users' },
  { chipText: '🔧 Create a mock',     chatText: '/mock Create a mock POST /api/users that returns a created user' },
  { chipText: '🧪 Generate tests',    chatText: '/test Write assertions for a 200 response with a users array' },
  { chipText: '❓ Explain OAuth2',    chatText: 'How does OAuth2 work and when should I use it?' },
  { chipText: '🔄 Convert cURL',      chatText: '/curl curl -X POST https://api.example.com/data -H "Content-Type: application/json" -d \'{"name":"test"}\'' },
  { chipText: '🔐 GraphQL query',     chatText: '/graphql Write a GraphQL query to get all users with their id, name, and email' },
  { chipText: '📄 SOAP request',      chatText: '/soap Generate a SOAP 1.1 envelope for a GetUserById operation with userId parameter' },
  { chipText: '🛡️ Security scan',    chatText: '/security Scan this request for security issues: GET http://api.example.com/users?apiKey=sk-abc123' },
  { chipText: '📋 Document endpoint', chatText: '/docs Document the POST /api/users endpoint that creates a new user with name and email' },
];

/**
 * AiConversationPanel — wraps ConvEngineChat in fullscreen mode.
 * The DaakiaVsCodeBridge (installed in App.tsx) intercepts all ConvEngine
 * HTTP/SSE calls and routes them through the Daakia extension protocol.
 */
export function AiConversationPanel() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));

  const handleMessage = useCallback((text: string) => {
    // userPrompt is tracked in the bridge; nothing extra needed here
  }, []);

  const handleResponse = useCallback((_text: string) => {
    // Response is already stored in tab.aiConversation by the bridge
  }, []);

  if (!activeTab) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ minHeight: 0 }}>
      <ConvEngineChat
        mode="fullscreen"
        config={{
          apiHost: '',
          conversationId: activeTab.id,
          title: 'Daakia AI',
          subtitle: 'Ask anything about APIs — build requests, mocks, tests, and more.',
          placeholder: 'Ask AI anything…',
          showFeedback: false,
          showAudit: false,
          showNewChat: true,
          showLayoutPicker: false,
          showMaximize: false,
          showMinimize: false,
          showEngineStatus: false,
          showHeaderDot: false,
          defaultDark: true,
          composerShape: 'round',
          landingChips: SUGGESTION_CHIPS,
          stream: { enabled: true, transport: 'sse' },
          onMessage: handleMessage,
          onResponse: handleResponse,
        }}
        theme={{
          'color-accent': 'var(--color-protocol-ai)',
          'bg-panel': 'var(--color-panel)',
          'bg-header': 'var(--color-surface)',
          'border-color': 'var(--color-surface-border)',
          'shadow-panel': 'none',
          'bg-composer': 'var(--color-panel)',
          'bg-composer-surface': 'var(--color-input-bg)',
          'text-primary': 'var(--color-text-primary)',
          'text-secondary': 'var(--color-text-muted)',
          'text-placeholder': 'var(--color-text-muted)',
          'bg-bubble-agent': 'color-mix(in srgb, var(--color-surface-border) 60%, var(--color-panel))',
          'text-bubble-agent': 'var(--color-text-primary)',
        }}
      />
    </div>
  );
}
