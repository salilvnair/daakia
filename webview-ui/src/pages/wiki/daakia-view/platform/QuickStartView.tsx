import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, Callout, Steps, ShortcutGrid, WikiTable, WikiCard,
  Code, CodeBlock, Divider, chips, TocBar, type TocItem,
} from '../shared/WikiShared';
import { WIKI_TABS_FULL, type TabId } from '../DaakiaViewPage';
import { PLATFORM_CAPTURES } from './captures';

const TOC_ITEMS: TocItem[] = [
  { id: 'qs-first-request', emoji: '🚀', label: 'First Request' },
  { id: 'qs-explore', emoji: '🗺️', label: 'Explore Every Tab' },
  { id: 'qs-palette', emoji: '⌘', label: 'Command Palette' },
  { id: 'qs-shortcuts', emoji: '⌨️', label: 'Keyboard Shortcuts' },
  { id: 'qs-cheatsheets', emoji: '📋', label: 'Cheat Sheets' },
];

const TAB_DESCRIPTIONS: Partial<Record<TabId, string>> = {
  rest: 'Params, Headers, Body, Auth, Scripts, Variables — build and debug any HTTP request.',
  gql: 'Schema-aware queries/mutations/subscriptions with introspection-driven autocomplete.',
  websocket: 'One tab, four realtime protocols — WebSocket, SSE, Socket.IO, MQTT.',
  grpc: 'Unary + all 3 streaming modes, driven by an imported .proto or server reflection.',
  soap: 'XML envelopes, WSDL import, WS-Security, and XPath response assertions.',
  'mock-server': 'Real local HTTP/WS/gRPC/MQTT servers with routes, chaos, and state machines.',
  'collections-env': 'Folders, environments, history, auth inheritance, scripts, cookies, timeline.',
  'ai-assistant': 'Daakia AI chat plus 80+ inline AI features spread across every protocol.',
  settings: 'General, Server, AI, Advanced, and Storage — every real toggle documented.',
};

export function QuickStartView({ onNavigate }: { onNavigate?: (id: TabId) => void }) {
  const byId = Object.fromEntries(PLATFORM_CAPTURES.map(c => [c.id, c]));
  const otherTabs = WIKI_TABS_FULL.filter(t => t.id !== 'quick-start');

  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="🚀"
          title="Welcome to Daakia"
          subtitle="A full API client for REST, GraphQL, WebSocket, gRPC, and SOAP — plus a built-in mock server and AI assistant, all inside VS Code."
          chips={chips(['REST', 'GraphQL', 'WebSocket', 'gRPC', 'SOAP', 'Mock Server', 'AI'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      {/* ── First request ─────────────────────────────────────────────── */}
      <div>
        <Callout type="tip" title="Open Daakia">
          Press <strong>Ctrl+Shift+P</strong> → type <strong>Daakia: Open Panel</strong> → press Enter.
        </Callout>
        {byId['platform-quick-start-main'] && <CaptureCard entry={byId['platform-quick-start-main']} />}
        <SectionTitle id="qs-first-request" emoji="🚀">Your First Request in 30 Seconds</SectionTitle>
        <Steps steps={[
          'Open Daakia via Command Palette (<strong>Ctrl+Shift+P</strong> → "Daakia: Open Panel")',
          'Type a URL in the URL bar — e.g. <strong>https://httpbin.org/get</strong>',
          'Make sure method is <strong>GET</strong> (default)',
          'Click <strong>Send</strong> or press <strong>Ctrl+Enter</strong>',
          'Response appears in the panel below — status, body, headers, timing',
        ]} />
      </div>

      <Divider />

      {/* ── Explore every tab ────────────────────────────────────────── */}
      <div>
        <SectionTitle id="qs-explore" emoji="🗺️">Explore Every Tab</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--dw-muted)]">
          Every protocol and platform surface has its own full docs page — click any card to jump straight there.
        </p>
        <div className="grid grid-cols-2 gap-2.5" style={{ marginBottom: 16 }}>
          {otherTabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => onNavigate?.(t.id)}
              className="dw-card text-left cursor-pointer transition-transform hover:scale-[1.01]"
              style={{ borderColor: `color-mix(in srgb, ${t.color} 40%, var(--dw-border))`, padding: 0 }}
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span
                  className="inline-flex items-center justify-center rounded-lg flex-shrink-0"
                  style={{ width: 28, height: 28, backgroundColor: `color-mix(in srgb, ${t.color} 15%, transparent)` }}
                >
                  {t.icon}
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-bold" style={{ color: t.color }}>{t.label}</div>
                  <div className="text-[11px] text-[var(--dw-muted)] leading-snug">{TAB_DESCRIPTIONS[t.id]}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <Divider />

      {/* ── Command Palette ──────────────────────────────────────────── */}
      <div>
        <SectionTitle id="qs-palette" emoji="⌘">Command Palette</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--dw-muted)]">
          <Code>Cmd+K</Code> (Mac) / <Code>Ctrl+K</Code> (Windows/Linux) opens Daakia's own in-app command palette —
          separate from VS Code's <Code>Ctrl+Shift+P</Code> palette. Type to search; every result is a real action,
          not a static menu:
        </p>
        <WikiTable
          headers={['Type', 'Examples']}
          rows={[
            ['New request', 'New REST Request, New GraphQL Request, New gRPC Request, New SOAP Request, New Realtime Connection, New AI Request'],
            ['Navigate', 'Jump straight to Collections, History, or Environments for any protocol'],
            ['Everything else', 'Type to filter — matching is multi-term substring, not fuzzy, so exact words always find the right command'],
          ]}
        />
        <Callout type="info">
          The palette is scoped to the currently active protocol for some actions (e.g. "Focus URL Bar"), so results
          can shift slightly depending on which protocol tab you're on when you open it.
        </Callout>
      </div>
      {byId['platform-command-palette'] && <CaptureCard entry={byId['platform-command-palette']} />}

      <Divider />

      {/* ── Keyboard shortcuts ────────────────────────────────────────── */}
      <div>
        <SectionTitle id="qs-shortcuts" emoji="⌨️">Keyboard Shortcuts</SectionTitle>
        <ShortcutGrid items={[
          { label: 'Command Palette', keys: ['Ctrl+K'] },
          { label: 'Send request', keys: ['Ctrl+Enter'] },
          { label: 'New tab', keys: ['Ctrl+N'] },
          { label: 'Close tab', keys: ['Ctrl+W'] },
          { label: 'Save request', keys: ['Ctrl+S'] },
          { label: 'Import collection', keys: ['Ctrl+Shift+I'] },
          { label: 'Focus URL bar', keys: ['Ctrl+L'] },
          { label: 'Toggle sidebar', keys: ['Alt+B'] },
          { label: 'Toggle request/response split', keys: ['Alt+/'] },
        ]} />
      </div>

      <Divider />

      {/* ── Cheat sheets ──────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="qs-cheatsheets" emoji="📋">Cheat Sheets</SectionTitle>
        <SubTitle>Variable Syntax</SubTitle>
        <WikiTable
          headers={['Syntax', 'Meaning']}
          rows={[
            [<Code>{'{{variableName}}'}</Code>, 'Resolves against request → environment → collection → global, highest priority first'],
            [<Code>{'$daakia_{name}_$'}</Code>, <>Escapes a literal <Code>{'{{name}}'}</Code> — skips substitution entirely</>],
          ]}
        />
        <SubTitle>dk.* Scripting Quick Reference</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--dw-muted)]">
          Same runtime everywhere — REST, GraphQL, gRPC, SOAP, and every realtime protocol:
        </p>
        <WikiCard title="dk.* namespaces" icon="🧰">
          <WikiTable
            headers={['API', 'Scope', 'What it does']}
            rows={[
              [<Code>dk.env</Code>, 'Both', 'get/set/secret on environment variables'],
              [<Code>dk.collectionVariables</Code>, 'Both', 'get/set on collection-scoped variables'],
              [<Code>dk.globals</Code>, 'Both', 'get/set/secret on global variables'],
              [<Code>dk.request</Code>, 'Pre-request', 'Mutate method, url, headers, body before send'],
              [<Code>dk.response</Code>, 'Post-response', 'status, headers, body, .json()'],
              [<Code>dk.test(name, fn)</Code>, 'Both', 'Runs fn(), records pass/fail'],
              [<Code>dk.expect(x)</Code>, 'Both', '.toBe / .toEqual / .toContain / .toHaveProperty / .toMatchSchema / …'],
              [<Code>dk.sendRequest(opts)</Code>, 'Both', 'Async sub-request — chaining, token refresh'],
            ]}
          />
        </WikiCard>
        <CodeBlock label="Quick example — Post-response">
{`dk.test('Status is 200', () => {
  dk.expect(dk.response.status).toBe(200);
});
dk.env.set('user_id', dk.response.json().id);`}
        </CodeBlock>
        <Callout type="warn">
          There's no <Code>daakia.*</Code> namespace — everything is under <Code>dk.*</Code>. Methods like{' '}
          <Code>dk.setVariable</Code> or <Code>dk.fetch</Code> that show up in older AI-generated scripts don't exist.
        </Callout>
      </div>
    </WikiScrollPage>
  );
}
